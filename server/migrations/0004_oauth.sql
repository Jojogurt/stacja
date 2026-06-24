-- 0004 — konta OAuth (Google/Apple) podpinane do istniejącego profilu (device-token).
-- Mapuje (provider, sub) → profile_id, by drużyny/znajomi były trwałe i cross-device.
CREATE TABLE IF NOT EXISTS oauth_identities (
  provider   TEXT NOT NULL,            -- 'google' | 'apple'
  sub        TEXT NOT NULL,            -- stabilne id użytkownika u providera
  profile_id TEXT NOT NULL,
  email      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, sub)
);
CREATE INDEX IF NOT EXISTS idx_oauth_profile ON oauth_identities(profile_id);
