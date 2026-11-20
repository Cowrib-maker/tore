import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpellDownload } from "@/components/marketing/spell-download";
import { getSpellInstallerUrl, SPELL_INSTALLER_URL_ENV } from "@/domain/spell/installer";
import { en } from "@/i18n/dictionaries/en";
import { mn } from "@/i18n/dictionaries/mn";

const ROOT = path.resolve(__dirname, "../..");
const secretUrl = "https://downloads.example.test/private/TORE-Spell-Setup.exe";

describe("public download call-to-action", () => {
  it("shows «Windows-д татах» only when an installer is configured, and links to «Миний лиценз», never to the installer", () => {
    const html = renderToStaticMarkup(<SpellDownload copy={mn.spell.download} installerReady />);
    expect(html).toContain("Windows-д татах");
    expect(html).toContain('href="/spell/license"');
    expect([...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])).toEqual(["/spell/license"]);
  });
  it("says the installer is coming soon (and offers no link) when none is configured", () => {
    const html = renderToStaticMarkup(<SpellDownload copy={mn.spell.download} installerReady={false} />);
    expect(html).not.toContain("<a");
    expect(html).toContain("Windows суулгац удахгүй");
  });
  it("English copy exists with the same structure", () => {
    expect(Object.keys(en.spell.download).sort()).toEqual(Object.keys(mn.spell.download).sort());
  });
});

describe("installer URL configuration", () => {
  it("is null without configuration (no fake URL) and accepts only https", () => {
    expect(getSpellInstallerUrl({})).toBeNull();
    expect(getSpellInstallerUrl({ [SPELL_INSTALLER_URL_ENV]: "   " })).toBeNull();
    expect(getSpellInstallerUrl({ [SPELL_INSTALLER_URL_ENV]: "http://insecure.test/a.exe" })).toBeNull();
    expect(getSpellInstallerUrl({ [SPELL_INSTALLER_URL_ENV]: "javascript:alert(1)" })).toBeNull();
    expect(getSpellInstallerUrl({ [SPELL_INSTALLER_URL_ENV]: secretUrl })).toBe(secretUrl);
  });
  it("no installer URL is hard-coded anywhere in the product source", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|json|mjs)$/.test(e.name) && /TORE-Spell-Setup\.exe/.test(fs.readFileSync(p, "utf8")) && /https?:\/\/[^\s"']*TORE-Spell-Setup\.exe/.test(fs.readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk(path.join(ROOT, "src"));
    walk(path.join(ROOT, "desktop/app"));
    walk(path.join(ROOT, "desktop/core"));
    expect(hits).toEqual([]);
  });
});

describe("the download route stays owner-gated and config-driven", () => {
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/spell/download/route.ts"), "utf8");
  it("requires an actor with an ACTIVE licence and redirects only to the configured URL", () => {
    expect(route).toMatch(/requireActor\(\)/);
    expect(route).toMatch(/deriveLicenseState\(l, now\)\.status === SpellEffectiveLicenseStatus\.ACTIVE/); // effective (clock-derived) status, not the stored column
    expect(route).toMatch(/getSpellInstallerSource\(process\.env, env\.FILE_STORAGE === "s3"\)/); // configuration only (private S3 key, else the configured https URL)
    expect(route).toMatch(/INSTALLER_NOT_AVAILABLE/);
    expect(route).not.toMatch(/https?:\/\//);
  });
});

describe("Windows release workflow: signing is wired but never faked", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/spell-desktop-windows.yml"), "utf8");
  const action = fs.readFileSync(path.join(ROOT, ".github/actions/spell-windows-build/action.yml"), "utf8");
  // YAML keys only: comments may mention the names without referencing them.
  const code = (t: string) => t.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  const jobBlock = (name: string) => {
    const t = code(wf);
    const i = t.search(new RegExp(`^ {2}${name}:\\s*$`, "m"));
    const rest = t.slice(i + 1);
    const next = rest.search(/^ {2}[a-z-]+:\s*$/m);
    return next === -1 ? rest : rest.slice(0, next);
  };
  it("signing secrets reach only the signed job, which runs in the protected environment, and are passed by reference", () => {
    const signed = jobBlock("build-signed");
    expect(signed).toMatch(/^ {4}environment: spell-release-signing$/m);
    expect(signed).toMatch(/csc-link: \$\{\{ secrets\.CSC_LINK \}\}/);
    expect(signed).toMatch(/csc-key-password: \$\{\{ secrets\.CSC_KEY_PASSWORD \}\}/);
    // nothing else in the caller reads the certificate secrets, and the unsigned (PR) job has no environment or secret at all
    expect(code(wf).match(/secrets\.CSC_/g)).toHaveLength(2);
    const unsigned = jobBlock("build-unsigned");
    expect(unsigned).not.toMatch(/environment|secrets|csc-/);
  });
  it("the composite action maps the inputs to CSC_LINK / CSC_KEY_PASSWORD in the build step only, never reading secrets itself", () => {
    const ca = code(action);
    expect(ca).toMatch(/CSC_LINK: \$\{\{ inputs\.csc-link \}\}/);
    expect(ca).toMatch(/CSC_KEY_PASSWORD: \$\{\{ inputs\.csc-key-password \}\}/);
    expect(ca.match(/CSC_/g)).toHaveLength(2);
    expect(ca).not.toMatch(/secrets\./);
    const build = ca.slice(ca.indexOf("- name: Build + package"), ca.indexOf("- name: Signature status"));
    expect(build).toMatch(/CSC_LINK/);
    expect(build).toMatch(/CSC_KEY_PASSWORD/);
  });
  it("reports the real signature status and fails closed unless it is Valid; no certificate material is committed", () => {
    expect(action).toMatch(/Get-AuthenticodeSignature/);
    expect(action).toMatch(/- name: Release gate[\s\S]*?if: inputs\.sign == 'true'[\s\S]*?-ne "Valid"[\s\S]*?throw/);
    expect(action).toMatch(/Status -eq "Valid"\) \{ "signed" \} else \{ "unsigned" \}/);
    expect(wf + action).not.toMatch(/-----BEGIN/);
    const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n");
    expect(tracked.filter((f) => /\.(pfx|p12|pem|key)$/i.test(f) && !/node_modules/.test(f))).toEqual([]);
  });
  it("keeps the installer name, NSIS target and no user-data deletion", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop/package.json"), "utf8"));
    expect(pkg.build.win.artifactName).toBe("TORE-Spell-Setup.exe");
    expect(pkg.build.win.target[0].target).toBe("nsis");
    expect(pkg.build.nsis.deleteAppDataOnUninstall).toBe(false);
    expect(pkg.version).toMatch(/^1\.0\.0(-rc\.\d+)?$/);
  });
});
