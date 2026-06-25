# STACJA — trener pubquizu muzycznego

Webowy trener do nauki tytułów i wykonawców piosenek przed muzycznym pubquizem
(np. **Spin the Beat**). Czysty HTML/JS, bez budowania.

## Tryby

- **Solo** — losowanie utworu z wybranej kategorii (dekady / style i gatunki),
  30-sekundowe zajawki z iTunes Search API, zgadywanie tytułu + wykonawcy
  (rok i album = bonus). Tryb sesyjny: 5/10/15 rund + wynik końcowy.
- **Lektor** — zamiast muzyki lektor czyta fragment tekstu (Web Speech API,
  offline). Teksty w polu `lyric` w `categories.js`.
- **Ze znajomymi** — pokój online (Supabase Realtime): host tworzy pokój,
  reszta dołącza kodem/linkiem, gracie jako jedna drużyna — propozycje,
  głosowanie 👍, pisarz zatwierdza odpowiedź, na końcu wynik + MVP stołu.

## Pliki

- `index.html` — HTML + CSS + montaż (`<script type="module" src="app.js">`).
- `app.js` — warstwa aplikacji: UI, DOM, audio-element, Supabase Realtime.
- `core/` — **czysty rdzeń bez DOM/Web API** (przenośny 1:1 na inną platformę):
  `match.js` (model meczu), `scoring.js` (dopasowanie odpowiedzi),
  `mpReducer.js` (logika multiplayera), `phases.js` (maszyny stanów),
  `picker.js` (wybór kategorii/trybów „ułóż mecz", wspólny solo+MP),
  `chatFeed.js` (feed czatu MP + dedup), `timing.js` (stałe i obliczenia czasowe), `util.js`.
- `app/` — moduły warstwy app wyłuskane z `app.js` (DOM, ale skupione):
  `dom.js` (bezstanowe prymitywy DOM/FX), `lektor.js` (synteza mowy Piper/Web Speech),
  `audioCtx.js` + `audio.js` (odtwarzanie solo: element, „od tyłu", fragment),
  `social.js` (router ekranów + Drużyna/Znajomi/Profil/OAuth).
- `ports/` — kontrakty (`AudioPort`, `TrackRepository`): UI zależy od interfejsu,
  nie od konkretu — na natywie podmieniasz tylko adapter.
- `adapters-web/` — webowe implementacje portów (`webAudio.js`, `itunesRepository.js`).
- `categories.js` — dane kategorii (`window.CATEGORIES`); regenerowalny osobno.
- `config.js` — URL + publishable key Supabase (bezpieczny w kliencie; Realtime-only, bez tabel).
- `test/run.js` — testy jednostkowe rdzenia (`node test/run.js` lub `npm test`, bez zależności).
- `test/integration.js` — siatka testów DOM (`npm run test:dom`, jsdom): ładuje `app.js`
  w realnym `index.html` i klika kluczowe ścieżki (load, picker, audio, lektor, ekrany, liga/profil).

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
