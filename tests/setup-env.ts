process.env.DATABASE_URL ??= "postgresql://localhost:5432/tore_unit_tests";
// next-auth reads AUTH_SECRET from process.env at module-load time (not via
// @/lib/env's zod default), so it must be set before any test imports
// @/lib/auth or a route built on it. Same value the schema itself defaults
// to in NODE_ENV=test, so env.AUTH_SECRET is unaffected.
process.env.AUTH_SECRET ??= "test-auth-secret-minimum-32-characters";
