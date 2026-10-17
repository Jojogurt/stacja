# stacja-rooms — backend STACJA (Cloudflare Worker)

Jeden Worker obsługuje **cały** backend, który dawniej stał na Supabase:
- **REST API danych** (`/api/*`) na **D1** — profile, liga, mecze, drużyny, znajomi.
- **Proxy zewnętrznych źródeł** (`/tracks`, `/spotify`, `/audio`) — omija blokady CORS/host.
- **Realtime pokoju** (`/parties/game-room/<kod>`) — **Durable Object jako PRZEKAŹNIK (relay)**.

> **Produkcja stoi na tym Workerze** (migracja Supabase→Cloudflare, 2026-06-23). Pełny
> kontekst, współrzędne i pozostałe taski: **`../MIGRATION.md`**.

## Pliki
- `index.js` — router: `/api/*` (CORS) → `lib/api.js`; `/tracks|/spotify|/audio` → `lib/proxies.js`;
  `/parties/*` → Durable Object; reszta 404.
- `lib/auth.js` — tożsamość bez kont: device-UUID podpisany tokenem (HS256/HMAC). Worker generuje id.
- `lib/api.js` — REST API danych (D1) + walidacja zapisu meczu (`record-match`) + „Twój gust" (`/api/taste`:
  GET własne oceny, POST upsert ≤ 50 LWW po `ts`, DELETE `?key=`; rate-limit per profil, limit 2000 ocen).
- `lib/sources.js` — pobieranie utworów/albumów: iTunes + Deezer ŁĄCZNIE i scalone (`core/sources.js`). Dlaczego Deezer: iTunes Search API zwraca 429 (a `/lookup` 403) dla wspólnego adresu wyjściowego Workerów Cloudflare, więc samo iTunes bywa puste; Deezer po wykonawcy (`/search/artist` → `/top` + `/albums`) daje utwory z rokiem i gatunkiem.
- `lib/proxies.js` — `/tracks` (iTunes+Deezer; `source`: `itunes`/`deezer`/`itunes+deezer`), `/spotify` (embed `__NEXT_DATA__`), `/audio` (allowlista+Range).
- `gameRoom.js` — Durable Object **relay**: broadcast (self=true) + presence. **Host-authority zostaje
  w `app.js`** — DO wozi tylko transport (zamiennik Supabase Realtime).
- `wrangler.toml` — config deployu (DO na SQLite = darmowy plan).
- `_ref-supabase/` — referencyjne Edge Functions (Deno), z których sportowano proxy. Archiwum.

## Deploy
```bash
cd server
# token: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID z ~/.zshrc (źródło prawdy; nie commitować).
# Dawny plik .cf-token (gitignored) bywał nieaktualny — używany tylko, gdy zmiennej brak:
[ -n "$CLOUDFLARE_API_TOKEN" ] || export CLOUDFLARE_API_TOKEN="$(tr -d '[:space:]' < .cf-token)"
node_modules/.bin/wrangler whoami   # sprawdź token przed deployem
node_modules/.bin/wrangler deploy
# sekret tożsamości (raz):
# echo '<losowy-sekret>' | node_modules/.bin/wrangler secret put TOKEN_SECRET
```

## Migracje D1
Pliki `migrations/*.sql` stosuje się RĘCZNIE (`wrangler.toml` nie ma `migrations_dir`, a `0003_*.sql` to archiwalny
Postgres z Supabase — `wrangler d1 migrations apply` by się na nim wyłożył). Format SQLite: `0001`, `0004`, `0005`.
```bash
cd server
[ -n "$CLOUDFLARE_API_TOKEN" ] || export CLOUDFLARE_API_TOKEN="$(tr -d '[:space:]' < .cf-token)"   # jak wyżej
node_modules/.bin/wrangler d1 execute stacja-db --local  --file=migrations/0005_taste.sql   # najpierw lokalnie
node_modules/.bin/wrangler d1 execute stacja-db --remote --file=migrations/0005_taste.sql   # produkcja — PRZED deployem Workera
node_modules/.bin/wrangler d1 execute stacja-db --remote --command "SELECT COUNT(*) FROM taste_ratings"   # sprawdzenie
```
- `0005_taste.sql` („Twój gust"): tabele `taste_ratings` + `taste_compare_log` (etap 3: rate-limit `GET /api/taste/compare`)
  + `profiles.taste_visibility`. `ALTER TABLE … ADD COLUMN` w SQLite nie ma `IF NOT EXISTS` (dlatego jest OSTATNI w pliku) —
  drugie uruchomienie zgłosi „duplicate column name" (nieszkodliwe; tabele/indeksy są idempotentne).
- „🎧 Gust stołu" (MP, etap 3) NIE dotyka D1: półki graczy (`{t:'shelf'}`) żyją w storage pokoju DO (sprzątane z pokojem);
  presence ogłasza `caps:['tableTaste']` — stary Worker bez pola → klient chowa opcję.
- Kolejność wydania: migracja → deploy Workera (`/api/taste`) → klient. Klient bez migracji/nowego Workera działa lokalnie
  (404/500 „no such table" → oceny tylko w localStorage).
- Testy (`npm test`): `test/taste.test.js` stosuje 0001+0004+0005 na prawdziwym SQLite (`node:sqlite`, Node ≥ 22.5) i fake D1.

## Co NIE jest zrobione — serwer-autorytet (przyszłość)
DO jest dziś **tylko przekaźnikiem**. Autorytet rozgrywki (losowanie utworu, faza gotowości,
sprawiedliwy buzzer, ocena odpowiedzi, następna runda, przeżycie rozłączenia hosta) wciąż liczy
**telefon hosta**. Reducer `core/mpReducer.js` jest gotowy, ale DO go nie uruchamia. Plan przeniesienia
autorytetu na serwer (+ weryfikacja tożsamości połączenia WS) opisuje **`../MIGRATION.md` → TASK 6**.
