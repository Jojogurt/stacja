# PLAN — „Twój gust" (poznawanie gustu muzycznego + zgodność ze znajomymi)

Gałąź: `gust` (od `main` v65). Realizacja etapami; każdy etap = osobny commit z podbitą wersją. Deploy Workera i migracja D1 — dopiero na decyzję właściciela, po wszystkich etapach.

## Źródła danych o guście
1. **Ocena jawna — sesja „Oceń 20 utworów"** (kafelek „🎧 Twój gust"): zajawka ~10 s, odpowiedź 👎 / 👍 / ❤️. Dobór adaptacyjny: najpierw różnorodnie (dekady × gatunki), potem tam, gdzie profil ma najmniej ocen.
2. **❤️ „zaparkuj" w odsłonie** każdego pytania z utworem (solo i MP — lokalnie u gracza) → „Moja półka".
3. **Sygnał pośredni „co znasz"**: trafienia per dekada/gatunek (z historii odpowiedzi) — pokazywany OSOBNO od „co lubisz".

## Model danych
- Klucz utworu: `trackKey = norm(artist) + '|' + norm(displayTitle(title))` (core).
- Ocena: `{trackKey, title, artist, year, genre, art, cat, rating: -1 | 1 | 2, source: 'swipe'|'reveal', ts}` — ❤️ = 2 (trafia na półkę), 👍 = 1, 👎 = -1.
- Gatunek: `primaryGenreName` z iTunes (dodać do `normalize()` w core/trackSelect.js — klient i serwer).
- Local-first: `localStorage 'stacjaTaste'` (bezpieczny lsGet/lsSet), synchronizacja z D1 dla zalogowanych tokenem urządzenia (last-write-wins po `ts`).
- D1 (migracja 0005): `taste_ratings(profile_id, track_key, title, artist, year, genre, art, cat, rating, source, ts, PRIMARY KEY(profile_id, track_key))` + `profiles.taste_visibility TEXT DEFAULT 'friends'` (`'friends'|'hidden'`).
- API: `GET /api/taste` (moje), `POST /api/taste` (upsert batch ≤ 50, rate-limit), `DELETE /api/taste?key=` ; etap 3: `GET /api/taste/compare?friend=<id>` (tylko zaakceptowani znajomi i `taste_visibility='friends'`).

## Etap 1 — zbieranie (M)
- ❤️ w odsłonie (solo + MP), toggle, licznik „na półce: N".
- Ekran „🎧 Twój gust": „Oceń 20 utworów" (swipe/przyciski, pasek 0/20, pomiń), „Moja półka" (lista z odsłuchem zajawki, linki wyszukiwania Spotify/Apple Music, usuń, sortowanie), stan pusty z CTA.
- Synchronizacja z serwerem + migracja D1 (plik, NIE stosowana na produkcji w tym etapie).

## Etap 2 — profil gustu (S–M)
- Czysta logika `core/taste.js`: wektory dekad i gatunków ważone ocenami, udział PL/świat, „co znasz" vs „co lubisz", archetyp (deterministyczne reguły, zabawne polskie nazwy, bez obraźliwych), pewność profilu (min. liczba ocen).
- Ekran profilu: wykres dekad i gatunków (SVG, motyw jasny/ciemny), archetyp, top artyści z półki, karta do udostępnienia (tekst + obrazek PNG z canvas), zachęta do dalszych ocen przy małej pewności.

## Etap 3 — porównanie i granie (M) — ZROBIONE (gałąź `gust`, bez commita/deployu)
- Zgodność ze znajomym: `0.6 × cosinus(wektory gatunków+dekad) + 0.4 × wspólne polubione` (z wyjaśnieniem składowych), „wspólne ulubione", „znajomy lubi, a ty nie oceniłeś" (rekomendacje → szybka ocena).
- „Zagraj z jej półki" — mecz solo z półki znajomego (kategoria `songs[]`).
- MP „Gust stołu" — pula meczu z półek graczy w pokoju (każdy klient dosyła swoje top ❤️, host/serwer składa pulę; tylko gracze z `taste_visibility='friends'`).
- Prywatność: przełącznik „Mój gust widzą znajomi / ukryty" w profilu.

## Zasady
Logika czysta w `core/` z testami; DOM w siatce jsdom; serwer w `server/test`. Bez cytowania tekstów piosenek. Kompatybilność: nowy klient ze starym serwerem działa lokalnie (bez synchronizacji i porównań).
