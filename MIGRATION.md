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

> **STATUS 2026-06-23:** TASK 1–5 ZAMKNIĘTE. Live cutover na `main` zrobiony (GitHub Pages, commit `089836b`):
> jojogurt.github.io w 100% na Cloudflare, supabase-js + `adapters-web/{supabase,captcha}.js` usunięte, zero ruchu
> do supabase.co. Hardening+sprzątanie: `dbfc8e9`. **TASK 5 (kasowanie Supabase) ODPADA** — projekt zapauzowany
> (zero kosztów/ruchu), nie kasujemy. **W TOKU: TASK 6 — serwer-autorytet** (plan niżej), start od podfazy **6.1**.
> Otwarte mniejsze: test MP na 2 urządzeniach na żywo (gdy będzie okazja).

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

## TASK 4 — Weryfikacja na żywo ✅ ZROBIONE (HTTP; live-cutover na main 089836b)
Pełna ścieżka na deployu. Potwierdzone zero żądań do supabase.co (Network + HTTP). Otwarte: test MP na 2 urządzeniach (gdy okazja).

## TASK 5 — Usunięcie Supabase ❌ ODPADA
Repo wyczyszczone z Supabase (TASK 3): `adapters-web/{supabase,captcha}.js` + supabase-js usunięte, `config.js`/README/`server/README.md`/MEMORY zaktualizowane.
**Projektu Supabase `agkarxtjcgklepefurza` NIE kasujemy** — jest **zapauzowany** (zero kosztów, zero ruchu). Zostaje jako bezkosztowy backup. Krok kasowania zdjęty z planu.

## TASK 6 — Serwer-autorytet pokoju + hardening (PRZYSZŁOŚĆ, osobny etap)
> **Plan po researchu 2026-06-23 (autor: research nad app.js + core/). Self-sufficient — można działać na zimno.**

### Cel (SKORYGOWANY po researchu)
Gra to **kooperacyjny quiz drużynowy** (NIE ma buzzera „kto pierwszy" — to były aspiracje z notatek,
nigdy nie powstały). Wszyscy zgłaszają propozycje i głosują na sloty (tytuł/wykonawca); odpowiedź
drużyny = górka głosów per slot; host **albo timer** ją „zatwierdza" (`evaluateAnswer`). Dlatego realna
wartość serwer-autorytetu tutaj to:
1. **Koniec SPOF** — dziś pętlę gry napędza przeglądarka hosta (`mpHostNewRound`/`mpGo`/`mpLock`/`mpNext`);
   host pada → mecz pada. Po zmianie pętlę napędza DO.
2. **Integralność stanu** — dziś host = źródło prawdy w przeglądarce, a relay rozsyła `sync`/`act` bez
   weryfikacji nadawcy; klient może podszyć się i wstrzyknąć fałszywy stan. Po zmianie DO derywuje
   tożsamość z tokenu i jest jedynym arbitrem.
3. **Spójny serwerowy timer** (`endsAt`/auto-lock stempluje DO) + autorytatywna sekwencja rund.
4. **Zaufany zapis ligi** — mecz MP pisze DO wprost do D1 (znika klientowe podawanie wyników, parytet S5).

### WĄSKIE GARDŁO (klucz całego etapu)
Pełna odpowiedź (`mpHostCurrent`) + pule utworów (kategorie, **zaimportowane playlisty Spotify z
localStorage hosta**, teksty do lektora z `lyrics.js`/`ALL_CATS`) żyją dziś **tylko w przeglądarce hosta**.
DO ich nie ma. → **Decyzja właściciela:** DO **rozwiązuje utwory sam** (port `resolveTrack`/`pickTrack` na
Worker, bez CORS), a host przy `start` **wgrywa pule** tylko wybranych kategorii (artyści / piosenki
importu / teksty). DO trzyma sekret odpowiedzi i **strippuje go ze stanu** rozsyłanego do reveala.

### Decyzje (ustalone z właścicielem 2026-06-23)
- **Źródło utworów:** DO rozwiązuje sam (pełny autorytet). Host wgrywa pule przy starcie meczu.
- **Wyjście hosta:** **promote** — `hostId` to przenoszalna rola w stanie DO; gdy host się rozłączy,
  DO awansuje kolejnego obecnego gracza (najstarsze połączenie). Ręczne „zatwierdź/dalej" zostają,
  ale mecz przeżywa wyjście, bo cały stan + pule + rozwiązywanie są już po stronie DO.

### Architektura docelowa
- **DO = autorytatywny serwer pokoju.** Trzyma `game` w pamięci **i persystuje do `this.ctx.storage`**
  (przeżyć eviction/restart DO w trakcie meczu). Odpala **ten sam `core/mpReducer.js`** + resolver + scoring.
  Trzyma sekret odpowiedzi; w broadcastowanym stanie pełny utwór tylko w fazie REVEAL.
- **Klient = cienki.** Render + lokalne audio (buforowanie zajawki w „arming", `mpPlayLocal`/reverse) +
  input (propose/vote/sure/pass/ready). Wysyła akcje, dostaje autorytatywny `state` + `presence`.
- **Tożsamość** z tokenu przy WS (poniżej 6.1). „Host" = rola w stanie DO, nie „pierwszy w pokoju".
- **Transport:** zastąpić shim Supabase (`cfChannel`) czystym portem `join/send/onState/onEvent` —
  odtworzyć skasowany `RealtimeTransport`, ale już pod autorytet. Wszystko za **flagą** (rollback).

### Podfazy (kolejność; każda osobno wdrażalna, za flagą)
**6.1 — Tożsamość WS z tokenu (S1). ✅ ZROBIONE 2026-06-23 (commit `29d5937`, INTERIM fallback `?id=`).**
- `server/gameRoom.js` `onConnect(conn, ctx)`: czytaj token z query (`?t=<token>`), `verifyToken(env.TOKEN_SECRET,…)`
  (env w DO: `this.env`), ustaw `id` Z TOKENU (ignoruj `?id=`). Bez ważnego tokenu — zamknij połączenie.
- `cfChannel.js` (i przyszły transport): dokładaj `&t=<token z localStorage>` do URL WS.
- Test: WS z podrobionym `id` nie podszyje się; presence pokazuje id z tokenu. (Relay dalej działa — to tylko zaufanie do id.)

**6.2 — Port rdzenia na Worker + DO autorytatywny. ✅ ZROBIONE I ZWERYFIKOWANE 2026-06-23.**
Zrealizowane jako **osobna klasa/trasa** `GameAuthority` (`/parties/game-authority/<kod>`) — żywy relay `GameRoom`
NIETKNIĘTY (zero ryzyka, klient wybierze transport flagą w 6.3). Wdrożone (wrangler, binding + migracja v2).
- `core/trackSelect.js` — wyłuskana czysta selekcja (`pickTrack`/filtr/anty-powtórki/normalizacja, fetcher
  `itunes(term)` wstrzykiwany). `adapters-web/itunesRepository.js` deleguje (web fetch/JSONP); `server/lib/resolve.js`
  = ta sama selekcja + bezpośredni fetch iTunes→Deezer (bez CORS).
- `server/authorityRoom.js` (`GameAuthority`) trzyma pętlę: `start`(host wgrywa pule) → resolve → ARMING(+armNonce)
  → zbieranie `ready` (+ serwerowy bezpiecznik `armSafety`) → PLAY (serwerowy `endsAt` + `scheduleAutoLock`) →
  `lock`→`evaluateAnswer` → REVEAL → `next`→`matchAdvance` → … → DONE → **zapis do D1** (`insertMatch`, wspólne z api.js).
- Sekret: pełny utwór w `this.current` (POZA `game`); do `game.reveal` trafia dopiero przy `lock`. `by` akcji
  WYMUSZANE z tożsamości połączenia (anty-spoof). Stan persystowany do `ctx.storage` (constructor `blockConcurrencyWhile`).
- Host: prowizoryczny w `onConnect` (crown w lobby), POTWIERDZANY przy `start` (starter=host, odporne na wyścig
  verifyToken). Promote: `onClose` hosta → awans najstarszego obecnego.
- **Zweryfikowane headless multi-WS (preview):** pełny mecz do DONE (15 pytań=3×5), sekret nieobecny w arming/play
  i obecny w reveal, `proposalBy`=id z tokenu Boba, host potwierdzony, **zapis MP do D1 przez DO** (mode=mp, 2 uczestników,
  15 odpowiedzi), **promote** (host wychodzi → B awansuje i skutecznie locka). Regresja klienta solo/relay OK.
- NIE wpięte do żywej apki (to 6.3). Persistence po eviccie DO zaimplementowana, nietestowana wymuszonym restartem.

**6.3 — Transport klienta + wpięcie `app.js` za flagą. ✅ ZROBIONE I ZWERYFIKOWANE 2026-06-23.**
- `adapters-web/roomTransport.js` — `authorityChannel(code,cfg)` z TĄ SAMĄ powierzchnią co `cfChannel`
  (`.on/.subscribe/.track/.send/.presenceState/.unsubscribe`) + komendy hosta `.startMatch/.lock/.next` + `.hostId`.
  `send` tłumaczy: `sync`→ignor, `act`→`{t:'action'}`, `react/say/typing`→`{t:'event'}`. (Pragmatyczny shim zamiast
  pełnego portu `join/onState/onEvent` — MINIMALNE diffy w app.js, zero ryzyka dla relay. Czysty port = ew. dług na potem.)
- `app.js` `mp*`: ~7 bramkowanych rozgałęzień `SERVER_AUTH` (flaga OFF = BAJT-IDENTYCZNY relay): wybór transportu w
  `mpEnterRoom`; sync dla wszystkich (też host); `mpSend` wysyła akcję do DO (echo optymistyczne zostaje); `mpStart`
  wgrywa pule wybranych kategorii (`ALL_CATS[k]`) i woła `startMatch`; `mpLock`/`mpAdvance(next)` → komendy do DO;
  `mpNewGame` → picker; `mpHost` aktualizowany z `presence.hostId`. Emotki/czat działają bez zmian (przez `send`).
- `authorityRoom.js` dostał relay `{t:'event'}` (emotki/czat/typing) + update nicka `{t:'track'}`.
- Flaga `STACJA_CONFIG.serverAuthority` (domyślnie false=relay) + override `?authority=1` / localStorage `stacjaAuthority='1'`.
- **Zweryfikowane przez REALNĄ apkę (preview):** flaga ON — pełny mecz lektor: `mpStart`→DO zbudował i rozwiązał, klient
  wyrenderował PLAY (pytanie bez odpowiedzi), `mpLock`→reveal z odpowiedzią (Creep/Radiohead), `mpAdvance`→Pyt.2/5;
  `roomTransport.js` użyty. Flaga OFF — relay wchodzi do pokoju i gra jak dawniej (lock→reveal). Zero błędów konsoli.
- Cap rozmiaru wgrywanych pul (lektor/teksty) — NIEZROBIONE (ryzyko backlog: na razie cała `ALL_CATS[k]`).

**6.4 — Weryfikacja + rollout.**
- Headless harness wielu-WS: asercje maszyny stanów DO (start→resolve→arming→play→lock→reveal→next→finish;
  promote po wyjściu hosta; przetrwanie symulowanego restartu DO). 2 urządzenia z flagą on dla testowego pokoju,
  potem default. Potwierdzić zapis MP do D1 z DO (nie z klienta).

### Ryzyka / pułapki (z researchu)
- **Rozmiar wgrywanych pul** (import Spotify + teksty) — cap, tylko wybrane kategorie.
- **Parytet „arming/ready":** klienci buforują i raportują `ready`; DO bramkuje PLAY na „wszyscy gotowi"
  z serwerowym bezpiecznikiem (jeden zawieszony klient nie może zablokować pokoju — dziś `MP_BUFFER_TIMEOUT_MS`).
- **Sekret vs optymizm:** dziś klient lokalnie `reduceAction` na własnym głosie (natychmiastowość). Zachować echo,
  ale DO = prawda; uważać, by reconcile nie „mrugał".
- **Reveal we własnym tempie:** dziś każdy zamyka odsłonę sam (`mpAdvance`/`mpAck`). Zostawić lokalne tempo renderu
  reveala; autorytatywne „następne pytanie" idzie od hosta (promote) — nie-host musi móc dalej czytać swój reveal.
- **Niedeterminizm resolve na DO** (żywy iTunes/Deezer + błędy sieci) — faza NETERR już istnieje; zachować retry/fallback.

### Szacunek
6.1 małe (~½ dnia) · 6.2 duże (port rdzenia + orkiestracja DO — gros pracy) · 6.3 duże (refactor app.js + transport + flaga)
· 6.4 średnie. Wieloseyjne. Flaga gwarantuje, że żywa ścieżka host-authority nie pęka, dopóki autorytet nie jest dowiedziony.

### Backlog hardeningu (drobne, niezależne — można robić wcześniej)
- **S2** token bez `exp` — dodać wygaśnięcie + re-issue w `/api/session` (dziś token = wieczna tożsamość).
- **S3** `/tracks` i `/spotify` to otwarte proxy bez rate-limitu — ktoś może palić limit Workera. Rozważyć prosty throttle.
- **S4** `/audio` podąża za redirectami (allowlista sprawdza tylko URL wejściowy) — dodać `redirect:'manual'` + limit rozmiaru streamu.
- **S5** ✅ ZROBIONE 2026-06-23 — cap `participants`≤32 / `answers`≤1000 w `record-match` (+ fix N+1: jedno `WHERE id IN (...)`).
- **S6** `ensureProfile` nie ponawia przy kolizji `friend_code` (UNIQUE) — dać retry jak w `uniqueGroupCode`.

## Uwagi / pułapki
- CORS: Worker ma globalny CORS w `index.js` (Allow-Origin *). Dla `/audio` pilnować Range/`content-range`.
- Token w localStorage = tożsamość. Wyczyszczenie = nowy profil (jak dziś przy anon).
- D1 SQLite: `ok` jako INTEGER 0/1 (nie boolean). `config` jako TEXT(JSON).
- `record_match` waliduje: `0 ≤ score ≤ total*2+10` oraz „caller jest hostem albo uczestnikiem".
- Realtime to TYLKO transport (host-authority zostaje). Pełny autorytet na DO = **TASK 6** (reducer już jest w `core/mpReducer.js`, ale DO go nie uruchamia).
