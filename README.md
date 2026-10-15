# STACJA — trener pubquizu muzycznego

Webowy trener do nauki tytułów i wykonawców piosenek przed muzycznym pubquizem
(np. **Spin the Beat**). Czysty HTML/JS, bez budowania.

## Tryby

- **Graj teraz** — 10 hitów jednym tapnięciem, bez ustawiania.
- **Stacja dnia** — codziennie te same 10 utworów dla wszystkich (seed daty), jedna próba,
  seria dni 🔥 i wynik do udostępnienia (siatka 🟩🟨⬛).
- **Solo** — mecz 5/15/30 pytań z wybranych kategorii (dekady / style / playlisty / teksty /
  wiedza / własne). Tryby pytań: muzyka (30-s zajawka iTunes), od tyłu, fragment 2 s,
  intro 1-2-4-8-16 s, ABCD (4 kafle), rok wydania, lektor, quiz wiedzy (ABCD i otwarte).
  Punkty: częściowe trafienia, rok/album, szybkość, seria ×1,5/×2.
- **Lektor** — zamiast muzyki lektor czyta autorski opis utworu (bez cytowania tekstów) —
  `lyrics.js`.
- **Ze znajomymi** — pokój online (Supabase Realtime): host tworzy pokój,
  reszta dołącza kodem/linkiem, gracie jako jedna drużyna — propozycje,
  głosowanie 👍, pisarz zatwierdza odpowiedź, na końcu wynik + MVP stołu.

## Pliki

- `index.html` — HTML + CSS + montaż (`<script type="module" src="app.js">`).
- `app.js` — entry point (~27 linii): montaż modułów + bootstrap (wersja, motyw).
- `core/` — **czysty rdzeń bez DOM/Web API** (przenośny 1:1 na inną platformę):
  `match.js` (model meczu), `scoring.js` (dopasowanie odpowiedzi),
  `mpReducer.js` (logika multiplayera), `phases.js` (maszyny stanów),
  `picker.js` (wybór kategorii/trybów „ułóż mecz", wspólny solo+MP),
  `chatFeed.js` (feed czatu MP + dedup), `timing.js` (stałe i obliczenia czasowe), `util.js`.
- `app/` — warstwa app (DOM/sieć) wyłuskana z dawnego god-objectu:
  `catalog.js` (dane kategorii + wrappery `ALL_CATS` + playlisty; wspólny dla solo i mp),
  `dom.js` (bezstanowe prymitywy DOM/FX), `lektor.js` (synteza mowy Piper/Web Speech),
  `audioCtx.js` + `audio.js` (odtwarzanie solo: element, „od tyłu", fragment),
  `solo.js` (tryb solo: tuner/picker/rundy/mecz/sprawdzanie),
  `social.js` (router ekranów + Drużyna/Znajomi/Profil/OAuth),
  `mp.js` (multiplayer: transport, host, audio, czat) + `mp-state.js` (współdzielony stan `S`)
  + `mp-render.js` (warstwa widoku: dyspozytor + buildery HTML) + `mp-picker.js` (host-picker „ułóż mecz").
- `ports/` — kontrakty (`AudioPort`, `TrackRepository`): UI zależy od interfejsu,
  nie od konkretu — na natywie podmieniasz tylko adapter.
- `adapters-web/` — webowe implementacje portów (`webAudio.js`, `itunesRepository.js`).
- `categories.js` — dane kategorii (`window.CATEGORIES`); regenerowalny osobno.
- `config.js` — URL + publishable key Supabase (bezpieczny w kliencie; Realtime-only, bez tabel).
- `test/run.js` — testy jednostkowe rdzenia (`node test/run.js` lub `npm test`, bez zależności).
- `test/integration.js` — siatka testów DOM (`npm run test:dom`, jsdom): ładuje `app.js`
  w realnym `index.html` i klika kluczowe ścieżki (load, picker, audio, lektor, ekrany, liga/profil,
  oraz lobby i picker MP przez fake WebSocket).

Granica zależności: `core` nie wie o DOM/`fetch`/Supabase. `app.js`, `app/`, `ports`
i `adapters-web` zależą od `core`, nigdy odwrotnie. `app/` zależy od `core`, nie od `app.js`
(powiązania z warstwą MP wstrzykiwane przez `init*` — bez cykli importów).

## Uruchomienie

Hostowane przez GitHub Pages. Lokalnie wystarczy serwer statyczny, np.:

```bash
python3 -m http.server 8123
```

> Wymagany serwer statyczny (nie `file://`) — `app.js` to moduł ES, który
> importuje `core/` i `adapters-web/`.

## Testy

Rdzeń (`core/`) jest czysty, więc testy chodzą w samym Node, bez zależności:

```bash
node test/run.js
```
