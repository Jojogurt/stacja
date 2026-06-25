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
- **`app.js`** — warstwa aplikacji: ~570 linii. Bootstrap + tryb SOLO (tuner, picker, rundy,
  audio-element, mecz) + wstrzyknięcia do modułów `app/` (`init*`). Już NIE god object.
- **`app/`** — moduły wyłuskane z `app.js` (zależą od `core/`, **nie** od `app.js`; powiązania
  między sobą i z danymi kategorii przez `init*` — bez cykli importów):
  `dom.js` (prymitywy DOM/FX), `lektor.js` (synteza mowy), `audioCtx.js`+`audio.js` (audio solo),
  `social.js` (router ekranów `showScreen` + Drużyna/Znajomi/Profil/OAuth),
  `mp.js` (CAŁY multiplayer: pokój, picker, gra, transport, czat — DOM+sieć; logika w `core/mpReducer`).
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

**Zrobione.** app.js 2187 → **572** linii (−74%). God object rozbity na `core/timing|picker|chatFeed`
+ `app/dom|lektor|audioCtx|audio|social|mp`, każdy z init-injection (bez cykli). CI + siatka jsdom
(z fake WebSocket pod MP). **387 rdzeń + 26 integracyjnych** zielone; MP zweryfikowane też w przeglądarce
(pokój/lobby/picker przeciw realnemu workerowi). Historia i ewentualne dalsze kroki: pamięć `refaktor-app-js`.
