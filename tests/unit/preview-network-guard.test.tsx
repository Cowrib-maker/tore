// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewFrame } from "@/components/admin/preview/preview-frame";
import { PreviewNetworkGuard } from "@/components/admin/preview/preview-network-guard";
import { LegalAiAccessGateCard } from "@/components/legal-ai/legal-ai-access-gate";
import { PREVIEW_CONTEXTS, getGatePreview } from "@/domain/admin-preview/scenarios";

afterEach(cleanup);

describe("PreviewNetworkGuard", () => {
  it("answers app API calls locally (never reaching the server), answers the audience question for the synthetic role, and restores fetch", async () => {
    const real = vi.fn(async () => new Response("{}"));
    window.fetch = real as unknown as typeof window.fetch;
    const { unmount } = render(<PreviewNetworkGuard audience="citizen" />);
    const ent = await window.fetch("/api/ai/entitlement", { credentials: "include" });
    expect(await ent.json()).toEqual({ audience: "citizen" });
    const post = await window.fetch("/api/citizen/billing", { method: "POST" });
    expect(post.status).toBe(403);
    await window.fetch("https://example.com/x");
    await window.fetch("/api/session/sync", { method: "POST" });
    expect((real.mock.calls as unknown as unknown[][]).map((c) => String(c[0]))).toEqual(["https://example.com/x", "/api/session/sync"]);
    expect(window.__previewBlockedRequests).toEqual(["GET /api/ai/entitlement", "POST /api/citizen/billing"]);
    unmount();
    expect(window.fetch).toBe(real);
  });

  it("also refuses server-action calls (same-origin POST with a Next-Action header) so no action can run from inside a preview", async () => {
    const real = vi.fn(async () => new Response("{}"));
    window.fetch = real as unknown as typeof window.fetch;
    const { unmount } = render(<PreviewNetworkGuard audience="citizen" />);
    const r1 = await window.fetch("/admin/preview/home", { method: "POST", headers: { "Next-Action": "abc123" } });
    const r2 = await window.fetch(new Request(`${window.location.origin}/anything`, { method: "POST", headers: { "next-action": "def" } }));
    expect([r1.status, r2.status]).toEqual([403, 403]);
    expect(real).not.toHaveBeenCalled();
    await window.fetch("/admin/preview/home"); // an ordinary page request is not an action and passes through
    expect(real).toHaveBeenCalledTimes(1);
    expect(window.__previewBlockedRequests).toEqual(["SERVER-ACTION", "SERVER-ACTION"]);
    unmount();
  });

  it("the real gate card inside a preview frame resolves its audience from the synthetic context and renders, with zero requests reaching the server", async () => {
    const real = vi.fn(async () => new Response("{}"));
    window.fetch = real as unknown as typeof window.fetch;
    const gate = getGatePreview(PREVIEW_CONTEXTS["citizen-free"])!;
    const { container } = render(
      <PreviewFrame page="legal-ai-gate" context={PREVIEW_CONTEXTS["citizen-free"]} locale="mn" content="published">
        <LegalAiAccessGateCard gate={gate} />
      </PreviewFrame>,
    );
    await waitFor(() => expect(container.querySelectorAll("[inert] button").length).toBeGreaterThan(0));
    expect(real).not.toHaveBeenCalled();
  });
});
