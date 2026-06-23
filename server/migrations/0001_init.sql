-- STACJA — schemat D1 (SQLite), odwzorowanie Postgresa z Supabase.
-- Tożsamość: id = device-UUID (zamiast auth.uid). RLS zastępuje sprawdzanie w Workerze.

CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT PRIMARY KEY,
  handle      TEXT NOT NULL DEFAULT 'gracz',
  emoji       TEXT,
  friend_code TEXT UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id              TEXT PRIMARY KEY,
  mode            TEXT NOT NULL CHECK (mode IN ('solo','mp')),
  room_code       TEXT,
  host_id         TEXT,
  group_id        TEXT,
  config          TEXT NOT NULL DEFAULT '{}',
  score           INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  started_at      TEXT,
  finished_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS match_participants (
  match_id      TEXT NOT NULL,
  profile_id    TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT 'gracz',
  role          TEXT NOT NULL DEFAULT 'player',
  score         INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, profile_id)
);

CREATE TABLE IF NOT EXISTS match_answers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id   TEXT NOT NULL,
  profile_id TEXT,
  q_no       INTEGER,
  cat_key    TEXT,
  mode       TEXT,
  track      TEXT,
  artist     TEXT,
  ok         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT 'Drużyna',
  emoji      TEXT NOT NULL DEFAULT '🍺',
  code       TEXT NOT NULL UNIQUE,
  owner_id   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, profile_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id    TEXT NOT NULL,
  to_id      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_id, to_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_profile ON match_participants(profile_id);
CREATE INDEX IF NOT EXISTS idx_ma_profile ON match_answers(profile_id);
CREATE INDEX IF NOT EXISTS idx_gm_profile ON group_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_fr_to ON friend_requests(to_id);
CREATE INDEX IF NOT EXISTS idx_fr_from ON friend_requests(from_id);
