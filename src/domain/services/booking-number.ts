export function formatBookingNumber(prefix: string, sequence: number): string {
  const safePrefix = prefix.trim().toUpperCase() || "TR";
  const padded = String(sequence).padStart(8, "0");
  return `${safePrefix}-${padded}`;
}

export const DEFAULT_BOOKING_NUMBER_PREFIX = "TR";
