/**
 * Minimal Server-Sent Events frame encoder. Deliberately small — this is
 * the entire "protocol" the Legal AI chat stream needs: a named event plus
 * a JSON payload. No client library, no extra framing.
 *
 * Frame shape: `event: <name>\ndata: <json>\n\n`. A payload's `data` is
 * JSON-encoded as one line — SSE treats each `data:` line as part of the
 * message and a bare newline inside the JSON string would otherwise be
 * read as a second `data:` field or an early frame boundary.
 */
export function encodeSseEvent(event: string, data: unknown): string {
  const json = JSON.stringify(data);
  return `event: ${event}\ndata: ${json}\n\n`;
}
