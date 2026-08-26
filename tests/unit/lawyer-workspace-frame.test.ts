import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("LawyerWorkspaceFrame TORE brand", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/case-review/lawyer-workspace-frame.tsx"),
    "utf8",
  );

  it("makes the sidebar TORE brand a Next.js Link to the public homepage", () => {
    expect(source).toContain('href="/"');
    expect(source).toContain('aria-label="TORE нүүр хуудас"');
    expect(source).toMatch(/<Link[\s\S]*?href="\/"[\s\S]*?<ToreLogo/);
    expect(source).not.toMatch(
      /<Link[\s\S]*?href="\/lawyer\/workspace"[\s\S]*?<ToreLogo/,
    );
  });

  it("keeps workspace navigation items pointing at lawyer routes", () => {
    expect(source).toContain('href: "/lawyer/workspace"');
    expect(source).toContain('href: "/lawyer/workspace/cases"');
    expect(source).toContain('href: "/legal-ai"');
  });
});
