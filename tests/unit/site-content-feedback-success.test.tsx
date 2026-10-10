// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/application/actions/homepage-feedback.actions", () => ({
  submitHomepageFeedbackAction: vi.fn(async () => ({ success: true })),
}));

import { LandingFeedback } from "@/components/marketing/landing-feedback";
import { applySiteContentOverrides } from "@/domain/site-content/registry";
import { getDictionarySync } from "@/i18n/get-dictionary-sync";

afterEach(cleanup);

describe("home.feedback.success (shown only after sending)", () => {
  for (const locale of ["mn", "en"] as const) {
    it(`${locale}: the published override is what the visitor sees after a successful submit; without it the built-in text`, async () => {
      const base = getDictionarySync(locale);
      const custom = applySiteContentOverrides(base, { "home.feedback.success": `ZQ${locale}:thanks` });
      const { unmount } = render(<LandingFeedback home={custom.publicHome} />);
      fireEvent.change(document.querySelector("#feedback-message")!, { target: { value: "hello" } });
      fireEvent.submit(document.querySelector("form")!);
      await waitFor(() => expect(screen.getByRole("status").textContent).toBe(`ZQ${locale}:thanks`));
      unmount();

      render(<LandingFeedback home={base.publicHome} />);
      fireEvent.change(document.querySelector("#feedback-message")!, { target: { value: "hello" } });
      fireEvent.submit(document.querySelector("form")!);
      await waitFor(() => expect(screen.getByRole("status").textContent).toBe(base.publicHome.feedbackSuccess));
    });
  }
});
