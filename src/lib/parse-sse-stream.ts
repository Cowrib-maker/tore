/**
 * Generic client-side Server-Sent Events parser: turns a fetch response
 * body (ReadableStream<Uint8Array>) into the sequence of {event, data}
 * frames it carries. Pairs with encodeSseEvent
 * (src/infrastructure/http/sse.ts) on the server — same `event: <name>\n
 * data: <json>\n\n` framing, parsed back into a typed event name plus its
 * already-JSON.parsed payload.
 *
 * Deliberately generic (not Legal-AI-specific) and dependency-free so it's
 * directly unit-testable against a hand-built ReadableStream, without a
 * real network response or any component rendering involved.
 */
export type ParsedSseEvent = { event: string; data: unknown };

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ParsedSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        let eventName = "message";
        let dataLine: string | null = null;
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) {
            eventName = line.slice("event:".length).trim();
          } else if (line.startsWith("data:")) {
            dataLine = line.slice("data:".length).trim();
          }
        }

        if (dataLine !== null) {
          try {
            yield { event: eventName, data: JSON.parse(dataLine) };
          } catch {
            // Malformed frame — skip rather than aborting the whole stream.
          }
        }

        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
