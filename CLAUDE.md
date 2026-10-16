# CLAUDE.md

Wskazówki dla Claude Code (i ludzi) przy pracy w tym repo.

## Czym jest STACJA

Webowy trener pubquizu muzycznego: losowanie utworów (30-s zajawki iTunes), zgadywanie
tytułu + wykonawcy, tryby **solo** / **lektor** (synteza mowy) / **multiplayer** (pokój online,
gra jako jedna drużyna). Czysty **HTML/JS, bez budowania** — ES modules ładowane wprost
(`<script type="module" src="app.js">`). Komentarze i UI po polsku — trzymaj tę konwencję.

## Komendy

```bash
npm test            # rdzeń + kształt danych + ścisły lint paczek + serwer
npm run test:dom    # siatka jsdom (app/ + index.html)
npm run lint:data   # raport jakości paczek pytań wg SPEC v2 (--file quiz-x.json, --strict)
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
  wspólny solo+MP), `chatFeed.js` (feed czatu MP + whitelist REACTIONS), `timing.js` (stałe/obliczenia
  czasowe, etapy intro), `trackSelect.js` (wybór utworu iTunes: dekada, wersje, popularność, dystraktory ABCD),
  `daily.js` (Stacja dnia: seed daty, plan, seria, siatka do udostępnienia), `taste.js` („Twój gust": trackKey,
  oceny ❤️/👍/👎, merge LWW z serwerem, limity, dobór sesji „Oceń 20" — dekady × gatunki), `tasteProfile.js` (profil gustu: wektory dekad/9 grup gatunków, PL/świat,
  „co znasz" z byCat, pewność, archetypy, tekst karty), `lektorVoice.js` (język lektora
  pl|en z `lang` kategorii lyrics.js + wybór głosu systemowego/Pipera), `handles.js` (pule ksyw),
  `teams.js`, `matchRecord.js` (rekord meczu do ligi), `util.js` (+ walidatory safeColor/isSlotKey/num/clipText).
- **`ports/`** — kontrakty (`AudioPort`, `TrackRepository`): UI zależy od interfejsu, nie konkretu.
- **`adapters-web/`** — webowe implementacje portów + transport (iTunes, Cloudflare, Realtime).
- **`app.js`** — **entry point (~27 linii)**: montaż modułów + bootstrap (wersja, motyw). Bez logiki.
- **`app/`** — warstwa DOM/sieć, wyłuskana z dawnego god-objectu (zależy od `core/`, **nie** od `app.js`):
  `catalog.js` (dane kategorii z `window.CATEGORIES` + wrappery `ALL_CATS` + playlisty — importowany
  przez solo i mp), `dom.js` (prymitywy DOM/FX), `lektor.js` (synteza mowy), `audioCtx.js`+`audio.js`
  (audio solo), `solo.js` (tryb solo: tuner/picker/rundy/mecz/sprawdzanie), `daily.js` (Stacja dnia:
  zapis, udostępnianie), `sfx.js` (dźwięki WebAudio), `catEditor.js` (własne kategorie), `taste.js` (magazyn ocen local-first + sync `/api/taste` + ❤️ w odsłonie solo/MP),
  `gust.js` (ekran „Twój gust": sesja oceniania z gestami, „Moja półka", „Mój profil"), `tasteCard.js` (karta PNG 1080×1350 na canvas + share/fallback), `social.js` (router ekranów
  `showScreen` + Drużyna/Znajomi/Profil/OAuth). **Multiplayer w 4 plikach**: `mp-state.js` (współdzielony
  obiekt stanu `S` + tożsamość `mpMe`), `mp-render.js` (widok: dyspozytor `mpRender` + buildery HTML),
  `mp-picker.js` (host-picker „ułóż mecz"), `mp.js` (transport/host/audio/czat; logika gry w `core/mpReducer`).
  Powiązania zwrotne (MP↔social, picker↔mpRender, render↔logika) przez `init*` — bez statycznych cykli.
- **`server/`** — Worker + Durable Object (`authorityRoom.js`); importuje `core/` (DRY z klientem).

**Reguła:** nowa logika gry (czysta, testowalna) → `core/` + test w `test/run.js`. DOM/sieć → `app.js`/`app/`/`adapters-web/`.

## Konwencje i pułapki

- **Testy**: po zmianie w `core/` dopisz przypadki w `test/run.js` i odpal `npm test` (rdzeń,
  zero zależności; grupy `group`/`ok`/`eq`). Po zmianie w `app.js`/`app/` odpal `npm run test:dom`
  (siatka jsdom: `test/integration.js` ładuje app.js w realnym index.html i klika kluczowe ścieżki —
  solo/lektor/audio/ekrany/liga/profil + lobby i picker MP przez fake WebSocket z `test/domEnv.js`).
- **Granica zależności**: moduły `app/` wstrzykują powiązania przez `init*` (`initAudio`/`initSocial`/
  `initMp`/`initMpRender`/`initMpPicker`), więc nie importują `app.js` (bez cykli). Stan MP to obiekt
  `S` w `app/mp-state.js` (żywe wiązanie ES — ten sam obiekt w `mp.js` i `mp-render.js`); `mpMe` też tam.
  Uwaga: `initMpRender` woła się na KOŃCU `mp.js` (część back-calls to `const`, nie hoisted).
- **PUŁAPKA renametu stanu** (gdy zmieniasz nazwy w `mp.js`): niektóre nazwy stanu są zarazem **id DOM**
  w stringach (`mpConf` = zmienna ORAZ `id="mpConf"`). `perl -pe 's/\bmpConf\b/.../g'` zepsuje też string.
  Po renamie: `grep -nE "['\"]S\.[a-z]"` (szukaj S.x w stringach) i przywróć id. Siatka tego NIE łapie
  (`$m('mpConf')` zwraca null po cichu).
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
- **Paczki pytań** (`data/quiz-*.json`): format i zasady w `backlog/audyt-2026-10/SPEC-paczki-v2.md`
  (`answers[k][0]` = forma kanoniczna pokazywana w odsłonie, `pool` dla „wymień N", ABCD tasowane w runtime,
  `difficulty`, `fun`). `npm test` odpala `lint-data --strict` — wyciek odpowiedzi w treści, ABCD ≠ 4 opcje,
  duplikaty itd. blokują CI. Nowe pytania: tylko fakty pewne; po generacji — weryfikacja faktów (patrz
  `backlog/audyt-2026-10/weryfikacja-faktow-*.md`).
- **Bezpieczeństwo MP**: serwer przekazuje tylko eventy z whitelisty (`RELAY_EVENTS`), nadawca z tokenu;
  stan gry wyłącznie z `{t:'state'}`. Wartości z serwera w atrybutach HTML → `escapeHtml`/`safeColor`.
  Inline `onclick="f('${…}')"` zakazane — `data-*` + delegacja.
- **Kolejność wydania** przy zmianach serwera: najpierw deploy Workera (`cd server && npm run deploy`),
  potem merge klienta na `main` (GitHub Pages). Klient jest wstecznie kompatybilny, ale np. limity ligi
  i pola `pool`/`modes` działają w pełni dopiero z nowym serwerem.

## Status refaktoru

**Zrobione.** app.js 2187 → **27 linii** (czysty entry point). God object rozpuszczony:
`core/timing|picker|chatFeed` + `app/catalog|dom|lektor|audioCtx|audio|solo|social` + MP w 4 plikach
(`mp-state|mp-render|mp-picker|mp`; największy `mp.js` ~630). CI + siatka jsdom z fake WebSocket
(pokrywa też fazy gry MP: play/kombinuj/reveal/done). **387 rdzeń + 41 integracyjnych** zielone;
solo i MP zweryfikowane też w przeglądarce. Historia i pułapki: pamięć `refaktor-app-js`.
