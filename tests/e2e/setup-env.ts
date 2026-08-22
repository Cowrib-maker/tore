import { config as loadDotenv } from "dotenv";

/**
 * Load local .env before any E2E file imports app modules (@/lib/env).
 * Secrets stay in environment files — never in source.
 */
loadDotenv();
