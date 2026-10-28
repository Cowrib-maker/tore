import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

import { SPELL_RELEASE_TOKEN_TYPE, compareVersions, parseVersion } from "../../src/domain/spell/update";
import type { Transport } from "./license-client";

/**
 * Update CHECK (V1 is manual). Fetches the signed release description, verifies it against the public keys compiled into the app, compares
 * versions and reports. It never downloads, writes or runs anything: the app only tells the user and opens the licence page. Anything wrong
 * (offline, unsigned, expired, unknown key, malformed, not newer) is silent — an update notice can never block spell checking.
 */
export type UpdateStatus =
  | { kind: "UP_TO_DATE" }
  | { kind: "UNAVAILABLE" }
  | { kind: "UPDATE_AVAILABLE"; version: string; /** The running version is below the minimum the server still supports. */ required: boolean; sha256: string };

export async function checkForUpdate(o: { currentVersion: string; transport: Transport; pinnedJwks: JSONWebKeySet | undefined; now?: () => number }): Promise<UpdateStatus> {
  if (!o.pinnedJwks || o.pinnedJwks.keys.length === 0 || !parseVersion(o.currentVersion)) return { kind: "UNAVAILABLE" };
  try {
    const res = await o.transport({ method: "GET", path: "/api/spell/v1/updates/latest", headers: {} });
    const body = res.json as { available?: boolean; token?: string };
    if (res.status !== 200 || body.available !== true || typeof body.token !== "string") return { kind: "UNAVAILABLE" };
    const { payload } = await jwtVerify(body.token, createLocalJWKSet(o.pinnedJwks), {
      algorithms: ["EdDSA"],
      issuer: "tore-spell",
      audience: "tore-spell-desktop",
      typ: SPELL_RELEASE_TOKEN_TYPE,
      currentDate: new Date((o.now ?? Date.now)()),
      requiredClaims: ["exp", "iat", "rel", "sha256"],
    });
    const version = String(payload.rel ?? "");
    const sha256 = String(payload.sha256 ?? "");
    if (!parseVersion(version) || !/^[a-f0-9]{64}$/.test(sha256)) return { kind: "UNAVAILABLE" };
    const cmp = compareVersions(version, o.currentVersion);
    if (cmp === null || cmp <= 0) return { kind: "UP_TO_DATE" };
    const min = typeof payload.min === "string" ? payload.min : null;
    return { kind: "UPDATE_AVAILABLE", version, sha256, required: !!min && compareVersions(o.currentVersion, min) === -1 };
  } catch {
    return { kind: "UNAVAILABLE" };
  }
}
