# Migracja STACJA: Supabase → 100% Cloudflare

Cel: przenieść CAŁY backend na Cloudflare, żeby **usunąć projekt Supabase**.
Ten dokument jest samowystarczalny — nowa sesja może działać „na zimno".

## Decyzje (ustalone z właścicielem)
- **Auth:** `device-UUID + podpisany token` (HMAC-SHA256). Bez haseł, bez kont. Id generuje Worker.
- **Dane:** świeży start (D1 pusta, bez migracji danych z Supabase).
- **Drużyny/znajomi:** przeniesione w całości (parytet z RPC).

## Co JUŻ zrobione (Etap 1 — backend danych) ✅
Wdrożone i przetestowane e2e. Żywa apka DALEJ na Supabase (nic w niej nie ruszone).
- **D1 `stacja-db`** — 7 tabel 1:1 ze schematem (`server/migrations/0001_init.sql`).
- **Worker `stacja-rooms`** → `https://stacja-rooms.kedziora-karol.workers.dev`
  - `server/lib/auth.js` — sign/verify token (HMAC), `newId`, `friendCode`.
  - `server/lib/api.js` — `/api/*` (patrz „API" niżej).
  - `server/index.js` — router: `/api/*` (CORS) + `/parties/*` (DO) + 404.
  - sekret `TOKEN_SECRET` ustawiony (Worker secret, nie w repo).
- Commit: `b3a4641`.

## Współrzędne / jak deployować
- Konto Cloudflare: `Kedziora.karol@gmail.com`, account_id `fb55a9a3ef0395e40a5af221b3d40aa1`.
- D1: `stacja-db`, id `7a774a82-a7d9-4341-96dc-29cd54635914`, binding `DB`.
- DO: binding `GameRoom`, trasa `/parties/game-room/<kod>`.
- **Token API w pliku** `server/.cf-token` (gitignored, NIE commitować, NIE wypisywać w czacie).
- Wrangler (lokalny, w `server/node_modules`). Wzorzec komend:
  ```bash
  cd server
  export CLOUDFLARE_API_TOKEN="$(tr -d '[:space:]' < .cf-token)"
  node_modules/.bin/wrangler deploy
  node_modules/.bin/wrangler d1 execute stacja-db --remote --command "SELECT ..."
  ```
- ⚠️ Stary token `cfat_zq5…` był jawnie w czacie — powinien być usunięty w panelu.

## API (już działa)  — baza: `https://stacja-rooms.kedziora-karol.workers.dev`
Auth: `Authorization: Bearer <token>` (z `/api/session`). Wszystko poza `/api/session` i `/api/league` wymaga tokenu (inaczej 401).
- `POST /api/session` → `{ id, handle, emoji, friend_code, token }` (tworzy profil jeśli nowy; jak podasz ważny Bearer, zwróci to samo id).
- `GET  /api/me` → `{ id, handle, emoji, friend_code }`
- `POST /api/handle {handle}` → `{ok:true}`
- `GET  /api/profile` → `{ id, handle, standing:{matches,correct,points}, byCat:{cat:{n,ok}} }`
- `GET  /api/league?limit=50` → `[{profile_id,handle,matches,correct,points}]` (publiczne)
- `POST /api/record-match {payload}` → `{id}`  (payload jak w starym `record_match`: mode, room_code, host_id, group_id, config, score, total_questions, started_at, participants[], answers[])
- Drużyny: `POST /api/group/create {name,emoji}`, `POST /api/group/join {code}`, `POST /api/group/leave {id}`, `GET /api/groups`, `GET /api/group/members?id=`
- Znajomi: `POST /api/friend/add {code}`, `POST /api/friend/respond {id,accept}`, `GET /api/friends`, `GET /api/friends/pending`

---

# POZOSTAŁE TASKI (w kolejności)

> **STATUS 2026-06-23:** TASK 1–4 ZROBIONE i zweryfikowane lokalnie (preview + curl), **niezacommitowane do push**.
> Worker wdrożony (proxy + DO-relay). Klient przepięty na `cf.js`/`cfChannel.js`; supabase-js i `adapters-web/{supabase,captcha}.js` usunięte; zero ruchu do supabase.co (Network).
> **POZOSTAŁO:** (a) push na `main` = live cutover GitHub Pages (czeka na decyzję), (b) weryfikacja na żywo na 2 urządzeniach, (c) **TASK 5 — skasować projekt Supabase** (nieodwracalne, po potwierdzeniu).

## TASK 1 — Proxy na Workerze (NAJPIERW, najmniej ryzykowne) ✅ ZROBIONE
Przenieś 3 edge functions Supabase na trasy Workera. Źródła referencyjne (Deno) w `server/_ref-supabase/`:
`tracks.ts`, `spotify.ts`, `audio.ts`. Logika ta sama (fetch/Response/URL) — zmienia się tylko opakowanie (Deno.serve → trasa w Workerze).

Kontrakty (zachować 1:1):
- `GET /tracks?artist=<term>` → `{source, results:[{trackName,artistName,collectionName,releaseDate,previewUrl,artworkUrl100}]}`
- `GET /spotify?url=<link>` → `{name, count, tracks:[{title,artist,preview}]}`
- `GET /audio?u=<https url>` → bajty audio + CORS + Range; allowlista hostów (mzstatic/apple/dzcdn/deezer/scdn/spotifycdn).

Kroki:
1. `server/lib/proxies.js` — `handleProxy(req,url)` obsługująca `/tracks`, `/spotify`, `/audio` (port z `_ref-supabase/*`).
2. W `server/index.js` dodać routing PRZED 404: `if (['/tracks','/spotify','/audio'].includes(url.pathname)) return cors(await handleProxy(req,url))`.
   (CORS już jest globalny w index.js — własne nagłówki CORS w proxy są opcjonalne; uważać na `/audio` Range.)
3. Deploy. Smoke-test:
   - `curl ".../tracks?artist=Nirvana"` → ma `results` z `previewUrl`.
   - `curl ".../spotify?url=<publiczna playlista>"` → `tracks[]`.
   - `curl -I ".../audio?u=<https preview itunes>"` → 200 + `access-control-allow-origin: *`.
- Akceptacja: 3 endpointy działają z poziomu `curl`. (Klient podmienimy w TASK 3.)

## TASK 2 — Realtime: DO-relay + shim klienta ✅ ZROBIONE
Cel: zastąpić Supabase Realtime (broadcast + presence) Durable Objectem jako **przekaźnikiem** (NIE pełny autorytet — host-authority zostaje w `app.js`, zmieniamy tylko transport).

Interfejs kanału, którego używa `app.js` (do odtworzenia 1:1) — w `mpEnterRoom`:
- `client.channel('stacja-'+code, {config:{broadcast:{self:true}, presence:{key:mpMe.id}}})`
- `.on('broadcast',{event:E},cb)` dla E ∈ `sync, act, react, say, typing` (cb dostaje `{payload}`)
- `.on('presence',{event:'sync'},cb)`  → po czym `channel.presenceState()` = `{ key:[{name}], ... }`
- `.subscribe(async(status)=>{ if(status==='SUBSCRIBED'){ await ch.track({name}); ... } })`
- `.track({name})`, `.send({type:'broadcast', event:E, payload})`, `.unsubscribe()`

Kroki:
1. **DO relay** — przepisać `server/gameRoom.js` (dziś używa reducera; na relay tego nie trzeba) tak, by:
   - na połączenie: przyjmij `?name=` i `?id=` (lub pierwszy „track"), trzymaj mapę połączeń→{id,name}.
   - relay: każdą wiadomość `{event, payload}` rozsyłaj do WSZYSTKICH (z self — nadawca też), jak Supabase `broadcast.self=true`.
   - presence: na connect/disconnect rozsyłaj „presence sync" z listą `{id,name}`.
   - (PartyServer ma hibernację — pasuje. Jest już `partyserver` w deps i routing `/parties/game-room/:kod` w index.js.)
2. **Shim klienta** — `adapters-web/cfChannel.js`: funkcja `cfChannel(code, cfg)` zwracająca obiekt z metodami `.on/.subscribe/.track/.send/.presenceState/.unsubscribe` mapowanymi na WebSocket do
   `wss://stacja-rooms.kedziora-karol.workers.dev/parties/game-room/<code>`.
   (Jest scaffold `adapters-web/partyTransport.js` + `ports/RealtimeTransport.js` — można wykorzystać/uprościć. `partysocket` z CDN albo natywny WebSocket z reconnectem.)
3. W `app.js` w `mpEnterRoom` podmienić `client.channel(...)` → `cfChannel(code,...)`. Reszta `mp*` (send/on/presence) bez zmian, bo shim trzyma ten sam interfejs.
- Akceptacja: 2 urządzenia/karty wchodzą do pokoju, widzą się (presence), host startuje mecz, sync/akcje/emotki/czat lecą. Buzzer/orkiestracja zostają host-authority (bez zmian).
- (Pełny serwer-autorytet = osobny, późniejszy krok — tu tylko transport.)

## TASK 3 — Przepięcie klienta (adapter + config + usunięcie Supabase z frontu) ✅ ZROBIONE
1. `adapters-web/cf.js` — ten sam zestaw funkcji co `adapters-web/supabase.js`, ale na `/api/*`:
   - `ensureSession()` → POST `/api/session`; zapisz `{id,token}` w localStorage (`stacjaId`,`stacjaToken`); zwróć `id`. Wszystkie wywołania API dokładają `Authorization: Bearer <token>`.
   - `myId()` → zapisane id. `meInfo()` → GET `/api/me`. `setHandle(h)` → POST `/api/handle`.
   - `recordMatch(p)` → POST `/api/record-match`. `fetchLeague(n)` → GET `/api/league`. `fetchProfile()` → GET `/api/profile`.
   - `teamCreate/teamJoin/teamLeave/myTeams/teamMembers` → trasy `/api/group/*` (zwracać `{data}`/`{error}` jak stare rpc-wrappery — patrz `supabase.js`).
   - `friendAdd/friendRespond/friendsList/pendingFriends` → `/api/friend/*`.
   - `authInfo()` → `{id, isAnon:true, email:null}`. `linkOAuth/linkEmail` → NIEOBSŁUGIWANE (kont nie ma) — zwróć `{error:'unsupported'}` i ukryj/usuń w UI logowanie e-mail/OAuth w ekranie Drużyna (flaga `DZ_OAUTH` już false; trzeba usunąć resztki logowania, bo nie ma już anon-auth Supabase).
   - `sb()`/realtime: realtime idzie przez `cfChannel` (TASK 2), nie przez `cf.js`.
2. `config.js` — zamiast `supabaseUrl/supabaseKey/hcaptchaSiteKey` daj `roomsBase: 'https://stacja-rooms.kedziora-karol.workers.dev'`.
3. Podmień użycia proxy w kliencie (po TASK 1):
   - `adapters-web/itunesRepository.js`: `cfg.supabaseUrl+'/functions/v1/tracks?artist='` → `cfg.roomsBase+'/tracks?artist='`.
   - `adapters-web/webAudio.js`: `…/functions/v1/audio?u=` → `cfg.roomsBase+'/audio?u='`.
   - `app.js` (import Spotify): `…/functions/v1/spotify?url=` → `cfg.roomsBase+'/spotify?url='`; usuń nagłówek `apikey`.
4. `index.html`: usuń `<script src="…supabase-js…">`. W `app.js` zamień importy z `./adapters-web/supabase.js` na `./adapters-web/cf.js` (te same nazwy eksportów). Usuń `adapters-web/supabase.js`, `adapters-web/captcha.js` (hCaptcha było tylko pod anon-auth Supabase).
5. Deploy Pages (push na main; ew. wymuś build: `gh api -X POST repos/Jojogurt/stacja/pages/builds`).
- Akceptacja: na jojogurt.github.io — solo gra+zapis (liga/profil), import Spotify, tryb „od tyłu" (audio proxy), MP (pokój, sync), drużyny+znajomi. Wszystko BEZ żadnego ruchu do `*.supabase.co` (sprawdź Network).

## TASK 4 — Weryfikacja na żywo
Przejść pełną ścieżkę na deployu (najlepiej 2 urządzenia dla MP). Potwierdzić zero żądań do supabase.co.

## TASK 5 — Usunięcie Supabase
Gdy TASK 1–4 przechodzą:
1. Usuń z repo: `adapters-web/supabase.js`, `adapters-web/captcha.js`, skrypt supabase-js w `index.html` (jeśli nie w TASK 3).
2. Skasuj projekt Supabase `agkarxtjcgklepefurza` (dashboard) — DOPIERO po potwierdzeniu, że nic nie woła supabase.co.
3. Zaktualizuj `config.js`/README/`server/README.md`/MEMORY.

## Uwagi / pułapki
- CORS: Worker ma globalny CORS w `index.js` (Allow-Origin *). Dla `/audio` pilnować Range/`content-range`.
- Token w localStorage = tożsamość. Wyczyszczenie = nowy profil (jak dziś przy anon).
- D1 SQLite: `ok` jako INTEGER 0/1 (nie boolean). `config` jako TEXT(JSON).
- `record_match` waliduje: `0 ≤ score ≤ total*2+10` oraz „caller jest hostem albo uczestnikiem".
- Realtime to TYLKO transport (host-authority zostaje). Pełny autorytet na DO = późniejszy, osobny etap (reducer już jest w `core/mpReducer.js`).
