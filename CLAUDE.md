# CLAUDE.md

Wskazówki dla Claude Code (i ludzi) przy pracy w tym repo.

## Czym jest STACJA

Webowy trener pubquizu muzycznego: losowanie utworów (30-s zajawki iTunes), zgadywanie
tytułu + wykonawcy, tryby **solo** / **lektor** (synteza mowy) / **multiplayer** (pokój online,
gra jako jedna drużyna). Czysty **HTML/JS, bez budowania** — ES modules ładowane wprost
(`<script type="module" src="app.js">`). Komentarze i UI po polsku — trzymaj tę konwencję.

## Komendy

```bash
npm test            # testy jednostkowe rdzenia (node test/run.js, zero zależności)
python3 -m http.server 8123   # lokalny podgląd (hosting prod: GitHub Pages)
```

Backend (Cloudflare Worker + Durable Objects) w `server/` — `cd server && npm run dev` / `npm run deploy`.
Niepodpięty do produkcji bez konfiguracji; gra solo/lektor działa bez backendu.

## Architektura — granica zależności (NAJWAŻNIEJSZE)

```
core/  ←  app.js / app/ / ports/ / adapters-web/   (nigdy odwrotnie)
core/  ←  server/                                   (serwer reużywa ten sam rdzeń)
```

- **`core/`** — czysty rdzeń **bez DOM / fetch / Web API**, dane wstrzykiwane parametrem.
  Przenośny 1:1 na inną platformę i w pełni testowalny. Tu trafia logika gry:
  `match.js` (model meczu), `scoring.js` (dopasowanie odpowiedzi), `mpReducer.js`
  (host-authority MP: akcje → stan), `phases.js` (FSM), `picker.js` (wybór kategorii/trybów,
  wspólny solo+MP), `chatFeed.js` (feed czatu MP), `timing.js` (stałe/obliczenia czasowe), `util.js`.
- **`ports/`** — kontrakty (`AudioPort`, `TrackRepository`): UI zależy od interfejsu, nie konkretu.
- **`adapters-web/`** — webowe implementacje portów + transport (iTunes, Cloudflare, Realtime).
- **`app.js`** — **entry point (~27 linii)**: montaż modułów + bootstrap (wersja, motyw). Bez logiki.
- **`app/`** — warstwa DOM/sieć, wyłuskana z dawnego god-objectu (zależy od `core/`, **nie** od `app.js`):
  `catalog.js` (dane kategorii z `window.CATEGORIES` + wrappery `ALL_CATS` + playlisty — importowany
  przez solo i mp), `dom.js` (prymitywy DOM/FX), `lektor.js` (synteza mowy), `audioCtx.js`+`audio.js`
  (audio solo), `solo.js` (tryb solo: tuner/picker/rundy/mecz/sprawdzanie), `social.js` (router ekranów
  `showScreen` + Drużyna/Znajomi/Profil/OAuth), `mp.js` (multiplayer — DOM+transport; logika w `core/mpReducer`)
  + `mp-picker.js` (host-picker „ułóż mecz"). Powiązania zwrotne (MP↔social, picker↔mpRender) przez `init*` — bez cykli.
- **`server/`** — Worker + Durable Object (`authorityRoom.js`); importuje `core/` (DRY z klientem).

**Reguła:** nowa logika gry (czysta, testowalna) → `core/` + test w `test/run.js`. DOM/sieć → `app.js`/`app/`/`adapters-web/`.

## Konwencje i pułapki

- **Testy**: po zmianie w `core/` dopisz przypadki w `test/run.js` i odpal `npm test` (rdzeń,
  zero zależności; grupy `group`/`ok`/`eq`). Po zmianie w `app.js`/`app/` odpal `npm run test:dom`
  (siatka jsdom: `test/integration.js` ładuje app.js w realnym index.html i klika kluczowe ścieżki —
  solo/lektor/audio/ekrany/liga/profil + lobby i picker MP przez fake WebSocket z `test/domEnv.js`).
- **Granica zależności**: moduły `app/` wstrzykują powiązania przez `init*` (`initAudio`/`initSocial`/
  `initMp`), więc nie importują `app.js` (bez cykli). Łańcuch: `app.js` → `app/mp.js` → `app/social.js`.
  `mp.js` woła `initSocial` wewnątrz `initMp`. `mpMe` to współdzielony obiekt (mutowany, nie reassignowany).
- **Most do HTML**: handlery z generowanych stringów `onclick="..."` muszą żyć na `window`
  (`Object.assign(window, {...})` — w `app/mp.js` dla funkcji MP, w `app/social.js` dla `dz*`/`ac*`).
  Funkcje wiązane przez `el.onclick=fn` tego nie potrzebują. Test integracyjny musi robić JEDEN boot
  (moduły `app/` to singletony — drugi boot nie re-wiązałby DOM/window).
- **`window.CATEGORIES`** (z `categories.js`/`lyrics.js`/`questions.js`/`playlists.js`) to dane
  kategorii ładowane globalnie przed `app.js`. Rdzeń ich nie zna — `app.js` wstrzykuje `ALL_CATS`.
- **Wersjonowanie**: `APP_VERSION` w `app.js` musi być zsynchronizowane z `CACHE` w `sw.js`
  (service worker) — inaczej PWA serwuje stary kod.
- **MP serwer-autorytet**: `config.js → serverAuthority`. Rollback do relay bez deployu:
  `?authority=0` lub `localStorage 'stacjaAuthority'='0'`.

## Status refaktoru

**Zrobione.** app.js 2187 → **27 linii** (czysty entry point). God object w pełni rozpuszczony:
`core/timing|picker|chatFeed` + `app/catalog|dom|lektor|audioCtx|audio|solo|social|mp`. Największy plik
to `app/mp.js` (~1160, spójny — cały multiplayer). CI + siatka jsdom (z fake WebSocket pod MP);
**387 rdzeń + 26 integracyjnych** zielone; solo i MP zweryfikowane też w przeglądarce. Historia: pamięć `refaktor-app-js`.
