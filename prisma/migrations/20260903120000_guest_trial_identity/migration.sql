-- A short-lived, keyed hash binds a guest trial to server-side state even when
-- the browser deletes its guest-session cookie. It is not a raw IP or user agent.
ALTER TABLE "guest_sessions"
  ADD COLUMN "trial_identity_hash" TEXT;

CREATE UNIQUE INDEX "guest_sessions_trial_identity_hash_key"
  ON "guest_sessions"("trial_identity_hash");
