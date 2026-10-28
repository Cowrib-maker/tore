/**
 * Real-Electron smoke test of the desktop MVP. Run under a display:
 *   cd desktop && npm ci && node build.mjs && cd ..
 *   SHOT=/tmp/shot.png xvfb-run -a npx tsx scripts/spell-desktop-smoke.ts
 * The server side is the real Phase-1 use-cases on in-memory repositories.
 * safeStorage is stubbed ONLY here (headless Linux has no keyring);
 * production fails closed when OS secure storage is unavailable.
 */
import http from "node:http";
import path from "node:path";
import { _electron as electron } from "playwright";
import { activateLicense } from "@/application/use-cases/spell/activate-license";
import { authenticateSignedRequest, toAuthenticateDeps } from "@/application/use-cases/spell/authenticate-installation-request";
import { validateActivation } from "@/application/use-cases/spell/validate-activation";
import { SpellAttemptKind, SpellPlatform } from "@/domain/spell/enums";
import { SpellError } from "@/domain/spell/errors";
import { makeSpell } from "../tests/unit/helpers/spell-kit";

const ROOT = path.resolve(__dirname, "..");

async function main() {
  const s = makeSpell();
  const { code } = await s.issue();
  const jwks = s.tokenIssuer.publicJwks();
  const srv = http.createServer(async (rq, rs) => {
    const chunks: Buffer[] = [];
    for await (const c of rq) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const send = (st: number, j: unknown) => { rs.writeHead(st, { "content-type": "application/json" }); rs.end(JSON.stringify(j)); };
    const now = new Date();
    try {
      if (rq.method === "GET") return send(200, jwks);
      const body = JSON.parse(raw);
      const signed = { method: "POST", path: rq.url!, rawBody: raw, headers: { installation: rq.headers["x-spell-installation"] as string, timestamp: rq.headers["x-spell-timestamp"] as string, nonce: rq.headers["x-spell-nonce"] as string, signature: rq.headers["x-spell-signature"] as string }, ipHash: null };
      const d = toAuthenticateDeps(s.deps);
      if (rq.url!.endsWith("/activations")) {
        const device = await authenticateSignedRequest(signed, d, SpellAttemptKind.ACTIVATE, { registerPublicKey: body.installation.publicKey }, now);
        return send(200, await activateLicense({ code: body.code, platform: SpellPlatform.WINDOWS, appVersion: body.installation.appVersion, machineHint: null, confirmTransferOfActivationId: body.confirmTransferOfActivationId ?? null, device, ipHash: null }, s.deps, now));
      }
      const device = await authenticateSignedRequest(signed, d, SpellAttemptKind.VALIDATE, {}, now);
      return send(200, await validateActivation({ activationId: body.activationId, device, ipHash: null }, s.deps, now));
    } catch (e) {
      if (e instanceof SpellError) return send(e.statusCode, { error: e.message, code: e.code, ...(e.details ?? {}) });
      console.error(e); return send(500, { code: "INTERNAL" });
    }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as { port: number }).port;
  const userData = `/tmp/claude-0/spell-smoke-${Date.now()}`;
  const app = await electron.launch({
    executablePath: path.join(ROOT, "desktop/node_modules/electron/dist/electron"),
    args: ["--no-sandbox", "--password-store=basic", `--user-data-dir=${userData}`, path.join(ROOT, "desktop")],
    env: { ...process.env, TORE_SPELL_DEV_API_BASE: `http://127.0.0.1:${port}` },
  });
  const page = await app.firstWindow();
  const out: Record<string, unknown> = {};
  // Headless Linux has no keyring; stub ONLY in this test (production fails closed).
  await app.evaluate(({ safeStorage }) => {
    const ss = safeStorage as unknown as Record<string, unknown>;
    ss.isEncryptionAvailable = () => true;
    ss.encryptString = (t: string) => Buffer.from("ENC:" + t);
    ss.decryptString = (b: Buffer) => b.toString().slice(4);
  });
  await page.waitForSelector("#lic-badge");
  await page.waitForTimeout(500);
  out.initialBadge = await page.textContent("#lic-badge");
  out.lockVisible = await page.isVisible("#lock");
  await page.fill("#code", "TORE-AAAA-BBBB-CCCC-DDDD");
  await page.click("#act-form button");
  await page.waitForTimeout(500);
  out.wrongCodeMsg = await page.textContent("#err");
  await page.fill("#code", code);
  await page.click("#act-form button");
  await page.waitForTimeout(2500); await page.waitForSelector("#app:not([hidden])", { timeout: 3000 });
  out.activeBadge = await page.textContent("#lic-badge");
  await page.fill("#text", "Хууль тогтоох байгууллага хэрг шийдвэрлэв. Тэр өгсөн докумнт.");
  await page.click("#check");
  await page.waitForTimeout(500);
  out.stats = await page.textContent("#stats");
  out.issues = await page.$$eval("#issues li .w", (els) => els.map((e) => e.textContent));
  const firstSug = await page.$("#issues li button");
  out.firstButton = firstSug ? await firstSug.textContent() : null;
  await page.fill("#text", "Зоригтбаатар");
  await page.check("#unknown");
  await page.click("#check");
  await page.waitForTimeout(400);
  out.unknownIssues = await page.$$eval("#issues li .w", (els) => els.map((e) => e.textContent));
  out.unknownTag = await page.$$eval("#issues li .tag", (els) => els.map((e) => e.textContent));
  out.unknownHasSuggestions = (await page.$$("#issues li .sugs")).length;
  out.unknownHasReplaceButton = (await page.$$eval("#issues li button", (els) => els.map((e) => e.textContent))).includes("Солих");
  await page.fill("#text", "Тэр маш сайнн ажилласан.");
  await page.click("#check");
  await page.waitForTimeout(400);
  out.misspelledTag = await page.$$eval("#issues li .tag", (els) => els.map((e) => e.textContent));
  out.misspelledSuggestion = await page.$$eval("#issues li .sugs label", (els) => els.map((e) => e.textContent));
  out.misspelledMarks = await page.$$eval("#backdrop mark.bad", (els) => els.map((e) => e.textContent));
  const replace = await page.$("#issues li button.sm:not(.ghost)");
  if (replace) { await replace.click(); await page.waitForTimeout(500); }
  out.afterReplace = await page.inputValue("#text");
  await page.fill("#text", "Зоригтбаатар");
  await page.click("#check");
  await page.waitForTimeout(400);
  const addBtn = await page.$("#issues li button:last-child");
  if (addBtn) { await addBtn.click(); await page.waitForTimeout(500); }
  out.dict = await page.$$eval("#dict li", (els) => els.map((e) => e.textContent));
  out.unknownAfterAdd = await page.$$eval("#issues li .w", (els) => els.map((e) => e.textContent));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await app.close();
  srv.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
