import { describe, expect, it } from "vitest";

import { encodeSseEvent } from "@/infrastructure/http/sse";
import { parseSseStream } from "@/lib/parse-sse-stream";

/**
 * Round-trip test for the exact wire format the Legal AI chat stream uses:
 * encodeSseEvent (server) -> parseSseStream (client). Proves the two sides
 * of the protocol actually agree, not just that each compiles in isolation.
 */
describe("encodeSseEvent", () => {
  it("produces the documented event:/data:/blank-line frame shape", () => {
    expect(encodeSseEvent("delta", { text: "hi" })).toBe('event: delta\ndata: {"text":"hi"}\n\n');
  });

  it("JSON-encodes the payload on a single data line even with special characters", () => {
    const frame = encodeSseEvent("delta", { text: "line1\nline2" });
    const dataLines = frame.split("\n").filter((line) => line.startsWith("data:"));
    expect(dataLines).toHaveLength(1);
    expect(JSON.parse(dataLines[0]!.slice("data:".length))).toEqual({ text: "line1\nline2" });
  });
});

function streamOf(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

describe("parseSseStream (round-trip with encodeSseEvent)", () => {
  it("parses a single encoded event back into {event, data}", async () => {
    const stream = streamOf([encodeSseEvent("delta", { text: "hello" })]);
    const events = [];
    for await (const event of parseSseStream(stream)) events.push(event);
    expect(events).toEqual([{ event: "delta", data: { text: "hello" } }]);
  });

  it("parses multiple events in order, including across chunk boundaries", async () => {
    const full =
      encodeSseEvent("delta", { text: "a" }) +
      encodeSseEvent("delta", { text: "b" }) +
      encodeSseEvent("done", { conversationId: "c1" });
    // Split the concatenated bytes mid-frame to prove buffering works.
    const mid = Math.floor(full.length / 2);
    const stream = streamOf([full.slice(0, mid), full.slice(mid)]);

    const events = [];
    for await (const event of parseSseStream(stream)) events.push(event);
    expect(events).toEqual([
      { event: "delta", data: { text: "a" } },
      { event: "delta", data: { text: "b" } },
      { event: "done", data: { conversationId: "c1" } },
    ]);
  });

  it("skips a malformed frame instead of throwing", async () => {
    const stream = streamOf([
      "event: delta\ndata: {not valid json}\n\n",
      encodeSseEvent("done", { ok: true }),
    ]);
    const events = [];
    for await (const event of parseSseStream(stream)) events.push(event);
    expect(events).toEqual([{ event: "done", data: { ok: true } }]);
  });

  it("yields nothing for an empty stream", async () => {
    const stream = streamOf([]);
    const events = [];
    for await (const event of parseSseStream(stream)) events.push(event);
    expect(events).toEqual([]);
  });
});
