import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const text = readFileSync(path.join(process.cwd(), ".github/workflows/spell-desktop-windows.yml"), "utf8");
// Job blocks are split at the two-space-indented job keys. (Plain text on purpose: no YAML dependency in the test suite.)
const releaseAt = text.indexOf("\n  release-draft:");
const windows = text.slice(text.indexOf("\n  windows:"), releaseAt);
const release = text.slice(releaseAt);
const order = (needle: string) => windows.indexOf(needle);

describe("TORE Spell Windows workflow (structural checks — the workflow itself runs only on GitHub)", () => {
  it("has exactly the two expected jobs, and builds on a real Windows runner", () => {
    expect([...text.slice(text.indexOf("\njobs:")).matchAll(/^ {2}([a-z-]+):\s*$/gm)].map((m) => m[1])).toEqual(["windows", "release-draft"]);
    expect(windows).toMatch(/runs-on: windows-latest/);
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).toMatch(/tags: \["spell-v\*"\]/);
  });

  it("a spell-v* tag must equal the app version in desktop/package.json (the build fails otherwise)", () => {
    expect(windows).toMatch(/Release identity/);
    expect(windows).toMatch(/refs\/tags\/spell-v\*/);
    expect(windows).toMatch(/does not match desktop\/package\.json version/);
    expect(windows).toMatch(/SPELL_VERSION=/);
  });

  it("the artifact name carries the version, the commit and the MEASURED signature state — never a hard-coded 'unsigned'", () => {
    expect(windows).toMatch(/name: tore-spell-\$\{\{ env\.SPELL_VERSION \}\}-\$\{\{ env\.SHORT_SHA \}\}-windows-\$\{\{ env\.SIGN_STATE \}\}/);
    expect(text).not.toMatch(/name: tore-spell-beta-windows-unsigned/);
    expect(windows).toMatch(/Status -eq "Valid"\) \{ "signed" \} else \{ "unsigned" \}/);
    expect(windows).toMatch(/if-no-files-found: error/);
    expect(windows).toMatch(/retention-days: 90/);
    expect(windows).toMatch(/desktop\/release\/SHA256SUMS\.txt/);
  });

  it("still proves install → launch self-test → uninstall before anything is uploaded", () => {
    expect(order("Silent install")).toBeGreaterThan(order("Verify installer artifact"));
    expect(order("Launch installed app")).toBeGreaterThan(order("Silent install"));
    expect(order("Silent uninstall")).toBeGreaterThan(order("Launch installed app"));
    expect(order("actions/upload-artifact")).toBeGreaterThan(order("Silent uninstall"));
  });

  it("signing secrets are passed by reference only, to the build step only", () => {
    expect(text.match(/secrets\.CSC_/g)).toHaveLength(2);
    expect(windows).toMatch(/CSC_LINK: \$\{\{ secrets\.CSC_LINK \}\}/);
    expect(windows).toMatch(/CSC_KEY_PASSWORD: \$\{\{ secrets\.CSC_KEY_PASSWORD \}\}/);
  });

  it("the release job runs only for spell-v* tags, after a successful build, and can only create a DRAFT pre-release", () => {
    expect(release).toMatch(/if: startsWith\(github\.ref, 'refs\/tags\/spell-v'\)/);
    expect(release).toMatch(/needs: windows/);
    expect(release).toMatch(/gh release create/);
    expect(release).toMatch(/--draft --prerelease/);
    expect(release).not.toMatch(/--draft=false|gh release (edit|upload)|--latest/);
    expect(release).toMatch(/SHA256SUMS\.txt/);
    expect(release).toMatch(/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  });

  it("write permission exists only in the tag-only release job", () => {
    expect(windows).not.toMatch(/permissions:/);
    expect(text.match(/contents: write/g)).toHaveLength(1);
    expect(release).toMatch(/permissions:\s*\n\s*contents: write/);
  });
});
