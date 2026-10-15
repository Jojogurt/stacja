# WYDANIE — audyt 2026-10 (v52 → v60), gałąź `audyt-2026-10`

Wszystkie fazy z `backlog/audyt-2026-10.md` („Kolejność prac") są zrobione. Testy zielone: rdzeń 1751, dane 22 355 + ścisły lint paczek, integracja jsdom 418, serwer 276. Nic nie jest wypchnięte ani zdeployowane.

## Commity (od najstarszego)

| wersja | commit | zakres |
|---|---|---|
| — | docs | raport audytu + 8 raportów szczegółowych |
| — | test | lint paczek wg SPEC v2 (`npm run lint:data`) |
| v52 | F1 | bezpieczeństwo MP: whitelista eventów, nadawca z tokenu, sanityzacja, start tylko host, rate-limit, kanał zaproszeń, `/api/record-match` |
| v53 | F2a | hotfixy solo/lektor/PWA: SW shell + timeout, storage, busy, Pomiń, audio iOS, artistMatch, a11y, picker |
| v54 | F2b | bugi MP: host z 2 kartami, timeout gotowości, auto-dalej, rejoin, liga, treść dopiero w PLAY |
| — | data ×5 | paczki A–E przepisane wg SPEC v2 (2 450 pytań) |
| v55 | F3 | silnik quizu: `pool` + dedup, liczby dokładnie, tasowanie ABCD, kanoniczna odsłona + ciekawostki, trwały seen-set, SW no-cache |
| v56 | F5 | dobór utworów: dekada, wersje studyjne, popularność, dokładny wykonawca, playlisty po tytule |
| — | data | muzyka 150 pytań, lektor bez wycieków i z poprawionymi atrybucjami, artyści per dekada |
| v57 | F6a | „Graj teraz", długość 5/15/30, punktacja, typografia pub, motyw systemowy |
| — | data ×2 | weryfikacja faktów (rundy 1 i 2): 97 poprawek |
| v58 | F6b | jeden głośnik, salon dla wszystkich formatów, wyjście + powrót, auto-join, intra 0.9 s, neutralne ksywy, SFX, layout 320 px / dark |
| — | ci | ścisły lint + testy serwera w CI |
| v59 | F8a | tryby intro / ABCD / rok, `norm()` bez przedimków w środku |
| v60 | F8b | Stacja dnia + udostępnianie, lepsze dystraktory |

## Kolejność wydania (WAŻNE)

1. **Deploy Workera** (`cd server && npm run deploy`) — PRZED klientem. Powody:
   - limit wyniku ligi: stary serwer przyjmuje `score ≤ pytania×2+10`, nowy klient wysyła punkty (do 840/pyt.) → stary serwer odrzuci zapis (400);
   - stary serwer przycina `answers` do 12 wariantów — pytania z `pool` (do 23 aliasów) mogłyby odrzucać poprawne odpowiedzi w MP;
   - bez nowego serwera: brak tasowania ABCD w MP, brak trybów ABCD/rok w MP, brak whitelisty eventów po stronie serwera (klient i tak filtruje `sync`), brak 🍺 w reakcjach.
   Brak nowych bindingów/migracji D1.
2. **Merge `audyt-2026-10` → `main`** (GitHub Pages). `APP_VERSION`/`CACHE` = v60, SW wymusza rewalidację plików, więc gracze nie dostaną mieszanki starych i nowych modułów.
3. Rollback klienta: revert merge; rollback MP bez deployu: `?authority=0`.

## Do sprawdzenia ręcznie (nie da się w jsdom)

- [ ] iPhone (Safari/PWA): odtwarzanie solo bez dodatkowego stuknięcia między pytaniami, „od tyłu", intro, lektor.
- [ ] Salon/TV w formatach Solo/Drużyny (widok TV sprawdzony tylko testami).
- [ ] „Dźwięk tylko u hosta" przy stoliku (2–3 telefony).
- [ ] Stacja dnia na dwóch urządzeniach tego samego dnia — ten sam plan i (zwykle) te same utwory.
- [ ] Layout na 320 px: odsłona MP, lobby, picker (placeholder „wykonawca" w MP może się ucinać).

## Decyzje podjęte po drodze (do ewentualnej zmiany)

- Pewniak przy częściowym trafieniu = 0 pkt (przegrany zakład), inaczej pewniak nie niósłby ryzyka.
- Auto-„dalej" u hosta po 10 s bezczynności przesuwa cały stół do następnego pytania.
- Kostka 🎲 losuje tylko muzykę; wiedza ogólna wyłącznie świadomym wyborem w pickerze.
- Stacja dnia = tylko tryb muzyka (porównywalne wyniki); numeracja #1 = 2026-10-15.
- Kategorie rap PL w lektorze scalone w jedną (10 pewnych utworów — 49 niezweryfikowanych usunięto).
- Pikantne ksywy i 🖕 — opt-in / usunięte (tryb rodzinny domyślnie).

## Co zostało (propozycje na kolejne iteracje)

- **Jedna marka**: „STACJA" vs „Uszy & Muzk" (share, manifest, title) — decyzja właściciela.
- Tryb intro w MP (wymaga sterowania etapem przez serwer).
- Liga tygodniowa / Pub Night — API jest, brak UI.
- „Twoje pudła" — powtórki muzyki rozłożone w czasie (trener działa dziś tylko dla quizu).
- Ranking Stacji dnia (dziś wynik tylko lokalnie).
- Lyrics: rozbudowa rap PL i weryfikacja kilku atrybucji tlum-pl potwierdzonych tylko pośrednio (lista w `paczki-E…md` / raport F7-M).
- Playlisty „top teraz" (snapshot Deezer) — regeneracja/data na etykiecie.
- 6 par pytań o ten sam fakt w różnych paczkach (Hermaszewski, Deep Blue, Kilar, John Williams, prędkość dźwięku, umami) — dopuszczalne, do ewentualnego rozróżnienia.
