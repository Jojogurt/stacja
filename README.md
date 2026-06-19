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

- `index.html` — cała aplikacja.
- `categories.js` — dane kategorii (`window.CATEGORIES`); regenerowalny osobno.
- `config.js` — URL + publishable key Supabase (bezpieczny w kliencie; Realtime-only, bez tabel).

## Uruchomienie

Hostowane przez GitHub Pages. Lokalnie wystarczy serwer statyczny, np.:

```bash
python3 -m http.server 8123
```
