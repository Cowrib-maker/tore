-- Single active Auth.js session per user (hashed identifier).
-- Nullable so existing users stay signed in until their next Node auth() bind or login.

ALTER TABLE "users" ADD COLUMN "active_session_id_hash" TEXT;
