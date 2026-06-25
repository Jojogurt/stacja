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
- **`app.js`** — warstwa aplikacji: UI, DOM, audio-element, sieć. **God object (~1690 linii,
  w trakcie rozbijania; pozostała głównie warstwa MP)** — patrz niżej.
- **`app/`** — moduły wyłuskane z `app.js`: `dom.js` (prymitywy DOM/FX), `lektor.js` (synteza mowy),
  `audioCtx.js`+`audio.js` (audio solo), `social.js` (router ekranów + Drużyna/Znajomi/Profil).
  `app/` zależy od `core/`, **nie** od `app.js` (powiązania z MP wstrzykiwane przez `init*`).
- **`server/`** — Worker + Durable Object (`authorityRoom.js`); importuje `core/` (DRY z klientem).

**Reguła:** nowa logika gry (czysta, testowalna) → `core/` + test w `test/run.js`. DOM/sieć → `app.js`/`app/`/`adapters-web/`.

## Konwencje i pułapki

- **Testy**: po zmianie w `core/` dopisz przypadki w `test/run.js` i odpal `npm test` (rdzeń,
  zero zależności; grupy `group`/`ok`/`eq`). Po zmianie w `app.js`/`app/` odpal `npm run test:dom`
  (siatka jsdom: `test/integration.js` ładuje app.js w realnym index.html i klika kluczowe ścieżki).
- **`app.js` to god object** w trakcie rozbijania — zostało głównie MP (~1100 linii). MP jest
  splątany ze swoim transportem i **nie da się go zweryfikować headless** (`mpEnterRoom` czeka na
  WebSocket/relay). Przed wyrwaniem `app/mp.js`: najpierw zaślepić transport w `test/domEnv.js`
  (fake `authorityChannel`/`cfChannel`), żeby siatka dojechała do renderu lobby/pickera. Nie tnij
  MP na ślepo — pełna weryfikacja wymaga 2 klientów. Wyłuskane moduły wstrzykują powiązania przez
  `init*` (np. `initAudio`/`initSocial`), żeby `app/` nie zależało od `app.js` (bez cykli).
- **Most do HTML**: `app.js` to moduł ES (własny scope), więc handlery z generowanych
  stringów `onclick="..."` muszą żyć na `window` (`Object.assign(window, {...})` na końcu pliku).
  Funkcje wiązane przez `el.onclick=fn` tego nie potrzebują.
- **`window.CATEGORIES`** (z `categories.js`/`lyrics.js`/`questions.js`/`playlists.js`) to dane
  kategorii ładowane globalnie przed `app.js`. Rdzeń ich nie zna — `app.js` wstrzykuje `ALL_CATS`.
- **Wersjonowanie**: `APP_VERSION` w `app.js` musi być zsynchronizowane z `CACHE` w `sw.js`
  (service worker) — inaczej PWA serwuje stary kod.
- **MP serwer-autorytet**: `config.js → serverAuthority`. Rollback do relay bez deployu:
  `?authority=0` lub `localStorage 'stacjaAuthority'='0'`.

## Status refaktoru

app.js 2187 → **1691** linii. Zrobione: CI + siatka jsdom (`test/integration.js`),
`core/timing|picker|chatFeed`, `app/dom|lektor|audioCtx|audio|social`; **387 rdzeń + 18
integracyjnych** zielone. Zostało tylko wyrwanie **MP** (`app/mp.js`) — wymaga zaślepki transportu
w siatce. Szczegóły i następny krok: pamięć projektu `refaktor-app-js`.
