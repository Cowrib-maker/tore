import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Plain text on purpose: no YAML dependency in the test suite.
const caller = readFileSync(path.join(process.cwd(), ".github/workflows/spell-desktop-windows.yml"), "utf8");
const build = readFileSync(path.join(process.cwd(), ".github/actions/spell-windows-build/action.yml"), "utf8");
const jobsText = caller.slice(caller.indexOf("\njobs:"));
const jobStarts = [...jobsText.matchAll(/^ {2}([a-z-]+):\s*$/gm)];
const job = (name: string) => {
  const i = jobStarts.findIndex((m) => m[1] === name);
  // comments are dropped so assertions see YAML keys only (a comment above the next job would otherwise leak in)
  return jobsText
    .slice(jobStarts[i].index, jobStarts[i + 1]?.index)
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
};
const buildUnsigned = job("build-unsigned");
const buildSigned = job("build-signed");
const release = job("release-draft");
const order = (needle: string) => build.indexOf(needle);

describe("TORE Spell Windows workflow (structural checks — the workflow itself runs only on GitHub)", () => {
  it("has exactly the three expected jobs; builds run on a real Windows runner; the build steps live once, in the composite action", () => {
    expect(jobStarts.map((m) => m[1])).toEqual(["build-unsigned", "build-signed", "release-draft"]);
    expect(buildUnsigned).toMatch(/runs-on: windows-latest/);
    expect(buildSigned).toMatch(/runs-on: windows-latest/);
    expect(caller).toMatch(/workflow_dispatch:/);
    expect(caller).toMatch(/tags: \["spell-v\*"\]/);
    expect(buildUnsigned).toMatch(/uses: \.\/\.github\/actions\/spell-windows-build/);
    expect(buildSigned).toMatch(/uses: \.\/\.github\/actions\/spell-windows-build/);
    expect(build).toMatch(/using: composite/);
  });

  it("UNSIGNED job: PR / sign=false only, NO environment key, NO secret reference, NO inputs that carry a certificate", () => {
    expect(buildUnsigned).toMatch(/if: github\.event_name == 'pull_request' \|\| \(github\.event_name == 'workflow_dispatch' && !inputs\.sign\)/);
    expect(buildUnsigned).not.toMatch(/environment/);
    expect(buildUnsigned).not.toMatch(/secrets/);
    expect(buildUnsigned).not.toMatch(/csc-/);
    expect(buildUnsigned).toMatch(/sign: "false"/);
  });

  it("SIGNED job: only a spell-v* TAG ref, never a pull_request, in the explicit protected environment", () => {
    expect(buildSigned).toMatch(/if: startsWith\(github\.ref, 'refs\/tags\/spell-v'\) && \(github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.sign\)\)/);
    expect(buildSigned).not.toMatch(/pull_request/);
    expect(buildSigned).toMatch(/^ {4}environment: spell-release-signing$/m);
    expect(buildSigned).toMatch(/sign: "true"/);
  });

  it("SECRETS: the only secrets.CSC_* references are the two inputs of the signed job; the composite action never reads secrets", () => {
    expect(caller.match(/secrets\.CSC_/g)).toHaveLength(2);
    expect(buildSigned).toMatch(/csc-link: \$\{\{ secrets\.CSC_LINK \}\}/);
    expect(buildSigned).toMatch(/csc-key-password: \$\{\{ secrets\.CSC_KEY_PASSWORD \}\}/);
    expect(build).not.toMatch(/secrets\./);
    expect(build.match(/inputs\.csc-/g)).toHaveLength(2);
    // handed to electron-builder in the build step only, never echoed
    expect(build).toMatch(/CSC_LINK: \$\{\{ inputs\.csc-link \}\}/);
    expect(build).toMatch(/CSC_KEY_PASSWORD: \$\{\{ inputs\.csc-key-password \}\}/);
    const code = build.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(code.match(/CSC_/g)).toHaveLength(2); // only the two env lines of the build step
    expect(build).not.toMatch(/(Write-Host|echo|Write-Output|Tee-Object)[^\n]*(csc-|CSC_)/i);
    expect(caller).not.toMatch(/secrets: inherit/);
    expect(caller).not.toMatch(/pull_request_target|workflow_run/);
  });

  it("RELEASE GATE: a signed build must be Authenticode Valid before verify, install or upload", () => {
    const gate = order("- name: Release gate");
    expect(gate).toBeGreaterThan(order("- name: Build + package"));
    expect(build).toMatch(/- name: Release gate[\s\S]*?if: inputs\.sign == 'true'/);
    expect(build).toMatch(/Get-AuthenticodeSignature[\s\S]*?-ne "Valid"[\s\S]*?throw/);
    expect(gate).toBeLessThan(order("- name: Verify packaged app content"));
    expect(gate).toBeLessThan(order("- name: Silent install"));
    expect(gate).toBeLessThan(order("actions/upload-artifact"));
  });

  it("unsigned test builds are labelled unsigned and never release-ready", () => {
    expect(build).toMatch(/NO - unsigned TEST build/);
    expect(build).toMatch(/Status -eq "Valid"\) \{ "signed" \} else \{ "unsigned" \}/);
  });

  it("a spell-v* tag must equal the app version in desktop/package.json (the build fails otherwise)", () => {
    expect(build).toMatch(/Release identity/);
    expect(build).toMatch(/refs\/tags\/spell-v\*/);
    expect(build).toMatch(/does not match desktop\/package\.json version/);
    expect(build).toMatch(/SPELL_VERSION=/);
  });

  it("the artifact name carries version, commit and the MEASURED signature state", () => {
    expect(build).toMatch(/name: tore-spell-\$\{\{ env\.SPELL_VERSION \}\}-\$\{\{ env\.SHORT_SHA \}\}-windows-\$\{\{ env\.SIGN_STATE \}\}/);
    expect(build).not.toMatch(/name: tore-spell-beta-windows-unsigned/);
    expect(build).toMatch(/if-no-files-found: error/);
    expect(build).toMatch(/retention-days: 90/);
    expect(build).toMatch(/desktop\/release\/SHA256SUMS\.txt/);
  });

  it("every run step in the composite action names its shell (composite requirement)", () => {
    const runs = build.match(/^ {6}run:/gm)?.length ?? 0;
    const shells = build.match(/^ {6}shell: pwsh$/gm)?.length ?? 0;
    expect(runs).toBeGreaterThan(0);
    expect(shells).toBe(runs);
  });

  it("still proves install → launch self-test → uninstall before anything is uploaded", () => {
    expect(order("- name: Silent install")).toBeGreaterThan(order("- name: Verify installer artifact"));
    expect(order("- name: Launch installed app")).toBeGreaterThan(order("- name: Silent install"));
    expect(order("- name: Silent uninstall")).toBeGreaterThan(order("- name: Launch installed app"));
    expect(order("actions/upload-artifact")).toBeGreaterThan(order("- name: Silent uninstall"));
  });

  it("RELEASE: only a tag run, needs the SIGNED build, takes only signed artifacts, and can only create a DRAFT pre-release", () => {
    expect(release).toMatch(/if: startsWith\(github\.ref, 'refs\/tags\/spell-v'\) && \(github\.event_name == 'push'/);
    expect(release).toMatch(/needs: build-signed/);
    expect(release).not.toMatch(/build-unsigned/);
    expect(release).toMatch(/pattern: tore-spell-\*-windows-signed/);
    expect(release).toMatch(/refusing: an unsigned artifact is present/);
    expect(release).toMatch(/gh release create/);
    expect(release).toMatch(/--draft --prerelease/);
    expect(release).not.toMatch(/--draft=false|gh release (edit|upload)|--latest/);
    expect(release).toMatch(/SHA256SUMS\.txt/);
    expect(release).toMatch(/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
    // no unsigned job can feed it
    expect(buildUnsigned).not.toMatch(/gh release|upload-release/);
  });

  it("write permission exists only in the tag-only release job", () => {
    expect(build).not.toMatch(/contents: write/);
    expect(caller.match(/contents: write/g)).toHaveLength(1);
    expect(release).toMatch(/permissions:\s*\n\s*contents: write/);
    expect(caller).toMatch(/^permissions:\s*\n\s*contents: read/m);
  });
});
