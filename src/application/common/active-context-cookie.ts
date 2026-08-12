/**
 * Active Context selection cookie.
 * Value is a selection hint only (`personal` | `org:<organizationId>`).
 * Authoritative tenant/membership always resolved server-side from the DB.
 */
export const ACTIVE_CONTEXT_COOKIE = "tore_active_context";

export const ACTIVE_CONTEXT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
