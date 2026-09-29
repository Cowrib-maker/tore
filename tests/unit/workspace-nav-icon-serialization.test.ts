import { describe, expect, it } from "vitest";

import {
  WORKSPACE_ICONS,
  type WorkspaceIconKey,
} from "@/components/workspace/workspace-icons";

/**
 * Regression guard for the production incident where WorkspaceShell (a
 * Server Component) passed LucideIcon component/function references
 * through `navGroups` into WorkspaceNavLink (a Client Component),
 * violating Next.js's Server -> Client RSC serialization rule
 * ("Functions cannot be passed directly to Client Components...").
 *
 * This can't reproduce the real Next.js RSC boundary without a live
 * server (jsdom/RTL renders React directly and never exercises that
 * serialization step — which is exactly why the original bug slipped
 * through every existing test). Instead it encodes the same invariant
 * Next's flight serializer enforces for plain data: a Lucide icon is a
 * React.forwardRef object (not a bare function — `typeof` is "object",
 * confirmed at prisma.config.ts-adjacent tooling scope), and its
 * internals (render fn, $$typeof symbol) are non-enumerable, so
 * JSON.stringify silently collapses it to `{}` rather than preserving
 * it. A real string key survives that round-trip unchanged; a
 * component reference does not.
 */
describe("WorkspaceShell icon registry stays serializable", () => {
  it("every WORKSPACE_ICONS key maps to a real icon component (a forwardRef object)", () => {
    const keys = Object.keys(WORKSPACE_ICONS) as WorkspaceIconKey[];
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const icon = WORKSPACE_ICONS[key] as unknown as { $$typeof?: symbol };
      expect(icon.$$typeof?.toString()).toBe("Symbol(react.forward_ref)");
    }
  });

  it("a WorkspaceNavItem-shaped object using an icon key round-trips through JSON unchanged", () => {
    const item: { href: string; label: string; icon?: WorkspaceIconKey } = {
      href: "/admin/dashboard",
      label: "Тойм",
      icon: "layout-dashboard",
    };

    const roundTripped = JSON.parse(JSON.stringify(item));

    // A component reference (the historical bug) does not survive this
    // round-trip intact — see the next test. A string key does.
    expect(roundTripped.icon).toBe("layout-dashboard");
    expect(roundTripped).toEqual(item);
  });

  it("rejects the historical bug shape directly: a component reference is mangled by a JSON round-trip, a string key is not", () => {
    const brokenItem = {
      href: "/admin/dashboard",
      label: "Тойм",
      icon: WORKSPACE_ICONS["layout-dashboard"], // a component/function reference
    };

    const roundTripped = JSON.parse(JSON.stringify(brokenItem));

    // The component's internals (render fn, $$typeof symbol) are
    // non-enumerable, so JSON.stringify silently collapses it to `{}` —
    // a broken, unusable value, unlike the string key case above.
    expect(roundTripped.icon).toEqual({});
    expect(roundTripped.icon).not.toBe("layout-dashboard");
  });
});
