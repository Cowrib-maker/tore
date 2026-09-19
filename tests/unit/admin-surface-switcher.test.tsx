// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { UserRole, UserStatus } from "@/domain/enums";
import {
  ADMIN_SURFACE_SWITCHER_DESTINATIONS,
  AdminSurfaceSwitcher,
} from "@/components/admin/admin-surface-switcher";

const EXPECTED_HREFS = [
  "/admin/dashboard",
  "/lawyer/workspace",
  "/student",
  "/client/dashboard",
  "/legal-ai",
];

const getSessionUser = vi.fn();

vi.mock("@/application/common/session", () => ({
  getSessionUser: () => getSessionUser(),
}));

afterEach(() => {
  cleanup();
});

describe("AdminSurfaceSwitcher destinations", () => {
  it("lists exactly the five required surfaces", () => {
    expect(ADMIN_SURFACE_SWITCHER_DESTINATIONS.map((d) => d.href)).toEqual(
      EXPECTED_HREFS,
    );
  });

  it("renders a link for each destination once opened", () => {
    render(<AdminSurfaceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /switch surface/i }));

    for (const href of EXPECTED_HREFS) {
      const link = screen.getByRole("menuitem", {
        name: ADMIN_SURFACE_SWITCHER_DESTINATIONS.find((d) => d.href === href)
          ?.label,
      });
      expect(link.getAttribute("href")).toBe(href);
    }
  });

  it("closes on Escape", () => {
    render(<AdminSurfaceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /switch surface/i }));
    expect(screen.queryByRole("menu")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes when clicking outside", () => {
    render(<AdminSurfaceSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /switch surface/i }));
    expect(screen.queryByRole("menu")).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("AdminSurfaceSwitcherHost — role gate", () => {
  function sessionWithRole(role: UserRole) {
    return {
      user: { id: "u1", role, status: UserStatus.ACTIVE },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  it("renders the switcher for ADMIN", async () => {
    getSessionUser.mockResolvedValue(sessionWithRole(UserRole.ADMIN));
    const { AdminSurfaceSwitcherHost } = await import(
      "@/components/admin/admin-surface-switcher-host"
    );

    const element = await AdminSurfaceSwitcherHost();
    render(element as React.ReactElement);

    expect(screen.getByTestId("admin-surface-switcher")).not.toBeNull();
  });

  it.each([UserRole.LAWYER, UserRole.CLIENT])(
    "renders nothing for %s",
    async (role) => {
      getSessionUser.mockResolvedValue(sessionWithRole(role));
      const { AdminSurfaceSwitcherHost } = await import(
        "@/components/admin/admin-surface-switcher-host"
      );

      const element = await AdminSurfaceSwitcherHost();
      expect(element).toBeNull();
    },
  );

  it("renders nothing when signed out", async () => {
    getSessionUser.mockResolvedValue(null);
    const { AdminSurfaceSwitcherHost } = await import(
      "@/components/admin/admin-surface-switcher-host"
    );

    const element = await AdminSurfaceSwitcherHost();
    expect(element).toBeNull();
  });
});
