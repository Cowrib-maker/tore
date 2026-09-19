// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import { SessionSyncBeacon } from "@/components/account/session-sync-beacon";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SessionSyncBeacon", () => {
  it("POSTs to /api/session/sync exactly once on mount", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    render(<SessionSyncBeacon />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/session/sync");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
  });

  it("swallows a failed request instead of throwing", async () => {
    vi.spyOn(window, "fetch").mockRejectedValue(new Error("network error"));

    expect(() => render(<SessionSyncBeacon />)).not.toThrow();
    await waitFor(() => expect(window.fetch).toHaveBeenCalledTimes(1));
  });

  it("aborts the in-flight request on unmount", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    const { unmount } = render(<SessionSyncBeacon />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const signal = fetchMock.mock.calls[0]![1]?.signal;
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("renders nothing", () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true })),
    );
    const { container } = render(<SessionSyncBeacon />);
    expect(container.innerHTML).toBe("");
  });
});
