// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { LegalAiEntitlementBanner } from "@/components/legal-ai/legal-ai-entitlement-banner";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LegalAiEntitlementBanner", () => {
  it("shows the plan name, topic-neutral remaining count, and expiry when present", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          audience: "paid_citizen",
          remainingLegalQuestions: 37,
          statusLabel: "TORE Citizen Basic",
          remainingLabel: "AI асуулт: 37 / 50 үлдсэн",
          exhaustedLabel:
            "Хязгаар дуусмагц дараагийн төлбөрийн үе хүртэл шинэ AI асуулт асуух боломжгүй.",
          validUntilLabel: "Багц хүчинтэй: 2026.10.31 хүртэл",
        }),
      ),
    );

    render(<LegalAiEntitlementBanner />);

    expect(await screen.findByText("TORE Citizen Basic")).toBeTruthy();
    expect(screen.getByText("AI асуулт: 37 / 50 үлдсэн")).toBeTruthy();
    expect(screen.getByText("Багц хүчинтэй: 2026.10.31 хүртэл")).toBeTruthy();

    // Topic-neutral wording — the old legal-only phrasing must never appear.
    expect(document.body.textContent).not.toContain("хуулийн AI асуулт");
  });

  it("renders no expiry line when validUntilLabel is absent", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          audience: "unpaid_citizen",
          remainingLegalQuestions: 1,
          statusLabel: "Үнэгүй иргэний асуулт",
          remainingLabel: "Үлдсэн үнэгүй асуулт: 1",
          exhaustedLabel: "Үнэгүй асуулт дууссан.",
        }),
      ),
    );

    render(<LegalAiEntitlementBanner />);

    await waitFor(() =>
      expect(screen.getByText("Үлдсэн үнэгүй асуулт: 1")).toBeTruthy(),
    );
    expect(screen.queryByText(/Багц хүчинтэй/)).toBeNull();
  });

  it("renders nothing while the fetch is pending or fails", () => {
    vi.spyOn(window, "fetch").mockRejectedValue(new Error("network error"));
    const { container } = render(<LegalAiEntitlementBanner />);
    expect(container.innerHTML).toBe("");
  });
});
