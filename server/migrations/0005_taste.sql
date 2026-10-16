-- 0005 — „Twój gust" (etap 1): oceny utworów per profil (❤️ = 2 półka, 👍 = 1, 👎 = -1) + widoczność gustu (etap 3).
-- D1 / SQLite. Klucz utworu liczony w core/taste.js → trackKey(artist, title) (serwer liczy go sam, nie ufa klientowi).
-- ts = czas oceny u klienta (ms) — last-write-wins; updated_at = czas zapisu na serwerze (rate-limit per profil).
--
-- ZASTOSOWANIE (ręcznie, raz — patrz server/README.md „Migracje D1"):
--   cd server && export CLOUDFLARE_API_TOKEN="$(tr -d '[:space:]' < .cf-token)"
--   node_modules/.bin/wrangler d1 execute stacja-db --remote --file=migrations/0005_taste.sql
-- Najpierw lokalnie: ... d1 execute stacja-db --local --file=migrations/0005_taste.sql
-- UWAGA: ALTER TABLE … ADD COLUMN w SQLite NIE ma „IF NOT EXISTS" — ponowne uruchomienie pliku kończy się błędem
-- „duplicate column name: taste_visibility" (tabele/indeksy wyżej są idempotentne, więc to błąd nieszkodliwy).
-- Dlatego ALTER jest OSTATNI — tabela etapu 3 (taste_compare_log) powstaje też przy ponownym uruchomieniu pliku.

CREATE TABLE IF NOT EXISTS taste_ratings (
  profile_id TEXT NOT NULL,
  track_key  TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  artist     TEXT NOT NULL DEFAULT '',
  year       TEXT NOT NULL DEFAULT '',
  genre      TEXT NOT NULL DEFAULT '',
  art        TEXT NOT NULL DEFAULT '',
  cat        TEXT NOT NULL DEFAULT '',
  rating     INTEGER NOT NULL CHECK (rating IN (-1, 1, 2)),
  source     TEXT NOT NULL DEFAULT 'swipe' CHECK (source IN ('swipe', 'reveal')),
  ts         INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_id, track_key)
);
CREATE INDEX IF NOT EXISTS idx_taste_profile_upd ON taste_ratings(profile_id, updated_at);

-- etap 3: log zapytań GET /api/taste/compare (rate-limit per profil; liczniki w pamięci isolate'u nie działają na Workers).
-- Wpisy starsze niż doba kasowane przy kolejnym zapytaniu profilu. Brak danych o tym, KOGO porównywano.
CREATE TABLE IF NOT EXISTS taste_compare_log (
  profile_id TEXT NOT NULL,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_taste_cmp_profile_at ON taste_compare_log(profile_id, at);

-- etap 3 (porównanie ze znajomymi): 'friends' = gust widzą zaakceptowani znajomi, 'hidden' = nikt
ALTER TABLE profiles ADD COLUMN taste_visibility TEXT NOT NULL DEFAULT 'friends' CHECK (taste_visibility IN ('friends', 'hidden'));

