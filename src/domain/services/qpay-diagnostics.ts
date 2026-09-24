/**
 * Pure, read-only label for the Admin QPay diagnostics view. Never touches
 * the QPay client/config used for real invoice creation or verification —
 * this only classifies a base URL for display.
 */
export function qpayEnvironmentLabel(
  baseUrl: string,
): "SANDBOX" | "PRODUCTION" {
  return baseUrl.toLowerCase().includes("sandbox") ? "SANDBOX" : "PRODUCTION";
}
