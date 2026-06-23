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
- `lib/api.js` — REST API danych (D1) + walidacja zapisu meczu (`record-match`).
- `lib/proxies.js` — `/tracks` (iTunes→Deezer), `/spotify` (embed `__NEXT_DATA__`), `/audio` (allowlista+Range).
- `gameRoom.js` — Durable Object **relay**: broadcast (self=true) + presence. **Host-authority zostaje
  w `app.js`** — DO wozi tylko transport (zamiennik Supabase Realtime).
- `wrangler.toml` — config deployu (DO na SQLite = darmowy plan).
- `_ref-supabase/` — referencyjne Edge Functions (Deno), z których sportowano proxy. Archiwum.

## Deploy
```bash
cd server
export CLOUDFLARE_API_TOKEN="$(tr -d '[:space:]' < .cf-token)"   # token gitignored, nie commitować
node_modules/.bin/wrangler deploy
# sekret tożsamości (raz):
# echo '<losowy-sekret>' | node_modules/.bin/wrangler secret put TOKEN_SECRET
```

## Co NIE jest zrobione — serwer-autorytet (przyszłość)
DO jest dziś **tylko przekaźnikiem**. Autorytet rozgrywki (losowanie utworu, faza gotowości,
sprawiedliwy buzzer, ocena odpowiedzi, następna runda, przeżycie rozłączenia hosta) wciąż liczy
**telefon hosta**. Reducer `core/mpReducer.js` jest gotowy, ale DO go nie uruchamia. Plan przeniesienia
autorytetu na serwer (+ weryfikacja tożsamości połączenia WS) opisuje **`../MIGRATION.md` → TASK 6**.
