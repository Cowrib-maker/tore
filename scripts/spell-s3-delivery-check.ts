/**
 * Exercise the app's REAL private-delivery path (S3FileStorage.getUrl for the `spell-installer/` prefix) against an S3-compatible endpoint, with a
 * throw-away object. Use it on a STAGING bucket (or an emulator); it uploads `spell-installer/_selftest/<random>.bin` (2 MiB) and deletes it afterwards.
 *   FILE_STORAGE=s3 S3_BUCKET=… S3_REGION=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… [S3_ENDPOINT=… S3_FORCE_PATH_STYLE=true] \
 *     npx tsx scripts/spell-s3-delivery-check.ts [--strict-auth]
 * Always checks: the signed URL is on the S3 host (never the public/CDN base), lives 60 s (and a longer request is capped at 120 s), returns the exact bytes,
 * forces download, and stops working after it expires.
 * `--strict-auth` ADDS the checks that prove the bucket is private (unsigned GET and tampered signature must be refused). Use it against real S3 / MinIO:
 * lenient emulators (for example s3rver) answer 200 to both, so on them those two results say nothing about real S3 and must not be quoted as evidence.
 * Bucket privacy is bucket CONFIGURATION (Block Public Access, no public ACL/policy): this script can only observe it, never set it.
 * Prints no credentials. Exit 0 = every selected check passed.
 */
import crypto from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

async function main() {
  const strict = process.argv.includes("--strict-auth");
  const need = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
  const missing = need.filter((k) => !process.env[k]);
  if (process.env.FILE_STORAGE !== "s3" || missing.length) throw new Error(`needs FILE_STORAGE=s3 and ${need.join(", ")}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);
  const { getFileStorage } = await import("../src/infrastructure/storage");
  const endpoint = process.env.S3_ENDPOINT;
  const client = new S3Client({
    region: process.env.S3_REGION!,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || Boolean(endpoint),
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
  });
  const key = `spell-installer/_selftest/${crypto.randomBytes(8).toString("hex")}.bin`;
  const bytes = crypto.randomBytes(2 * 1024 * 1024);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const results: boolean[] = [];
  const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };

  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: bytes, ContentType: "application/octet-stream" }));
  try {
    const storage = getFileStorage();
    const url = await storage.getUrl(key, { expiresInSeconds: 60 });
    const u = new URL(url);
    const pub = process.env.S3_PUBLIC_BASE_URL?.trim();
    check("signed URL is on the S3 host, not a public/CDN base", !pub || !url.startsWith(pub), u.host);
    check("URL lifetime is 60 s", u.searchParams.get("X-Amz-Expires") === "60");
    check("URL is SigV4 signed", u.searchParams.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256" && Boolean(u.searchParams.get("X-Amz-Signature")));
    const res = await fetch(url);
    const body = Buffer.from(await res.arrayBuffer());
    check("signed GET returns the exact bytes", res.status === 200 && crypto.createHash("sha256").update(body).digest("hex") === sha, `HTTP ${res.status}`);
    check("response forces download", (res.headers.get("content-disposition") ?? "").startsWith("attachment"));
    const long = new URL(await storage.getUrl(key, { expiresInSeconds: 3600 }));
    check("a longer requested lifetime is capped at 120 s", long.searchParams.get("X-Amz-Expires") === "120");
    const short = await storage.getUrl(key, { expiresInSeconds: 1 });
    await new Promise((r) => setTimeout(r, 2600));
    const expired = await fetch(short);
    check("an expired URL is refused", expired.status === 403 || expired.status === 400, `HTTP ${expired.status}`);
    if (strict) {
      const bare = await fetch(`${u.origin}${u.pathname}`);
      check("[strict] the object is NOT publicly readable (unsigned GET refused)", bare.status === 403, `HTTP ${bare.status}`);
      const t = new URL(url);
      t.searchParams.set("X-Amz-Signature", "0".repeat(64));
      const tampered = await fetch(t);
      check("[strict] a tampered signature is refused", tampered.status === 403, `HTTP ${tampered.status}`);
    } else {
      console.log("SKIP  bucket-privacy checks (run with --strict-auth against real S3 / MinIO; emulators are often lenient)");
    }
  } finally {
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key })).catch(() => undefined);
  }
  console.log(results.every(Boolean) ? "\nALL SELECTED CHECKS PASSED" : "\nSOME CHECKS FAILED");
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((e) => { console.error(`error: ${e instanceof Error ? e.message : "unknown"}`); process.exit(2); });
