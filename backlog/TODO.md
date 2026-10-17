# TODO — co zostało do zrobienia (stan: v70, 2026-10-17)

Jedno miejsce z otwartymi sprawami. Szczegóły i historia w plikach obok:
`audyt-2026-10.md` (+ `audyt-2026-10/WYDANIE.md`), `gust-muzyczny.md`, `przeglad-mp-2026-10.md` (+ zrzuty w `przeglad-mp-2026-10/`, poza gitem).

Produkcja: klient v69 (GitHub Pages), **Worker v70 (wersja `a8ea55c0…`, 2026-10-17)**, migracja D1 `0005_taste.sql` zastosowana.
**Klient v70 czeka na wydanie** (push `main` → GitHub Pages) — Worker już jest; stary klient v69 z nowym Workerem działa (nowe tryby ukryte).
Wydawanie: najpierw Worker (`cd server && wrangler deploy` — token z `~/.zshrc` `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID=fb55a9a3ef0395e40a5af221b3d40aa1`; instrukcja w `server/README.md`), potem merge na `main` z podbitym `APP_VERSION` (app.js) i `CACHE` (sw.js). Lokalny serwer do testów MP: `wrangler dev --local --port 8787 --var TOKEN_SECRET:dev-secret-local` + klient `?rooms=http://127.0.0.1:8787` (działa tylko na localhost).

## Zrobione w v70
- Nazwa aplikacji: **„Uszy & Mózg"** wszędzie (`APP_NAME` w `core/util.js`: TV, karty PNG, udostępnianie, manifest, tytuł).
- MP pod serwerem-autorytetem (`AUTHORITY_ONLY_MODES`; relay gra je jak „muzykę"): **okładka** (etapy wyostrzania od serwera, inny URL na każdym etapie), **intro** 1-2-4-8-16 s (wspólny start audio, „+ więcej" dla każdego gracza), **składanka**, **fortepian/gitara** (covery z Deezera), **oś czasu** (oś drużyny, głos na szczelinę). Wspólny mechanizm etapów w `core/timing.js` (`stageStarts`), mnożnik z czasu propozycji liczony na serwerze.
- Okładka (solo i MP): w trakcie zgadywania tylko 16 → 32 → 64 bloki, pełna dopiero w odsłonie (nie zdradza nazwy zespołu); mnożniki ×2,0/×1,5/×1,0.
- Źródła: iTunes z Workera dostaje **429** (limit na wspólnym IP Cloudflare) → serwer: Deezer po wykonawcy (top + albumy z rokiem/gatunkiem) scalony z iTunes (`core/sources.js`, `server/lib/sources.js`); klient: bezpośredni iTunes z przeglądarki + proxy, scalone.
- „Tłumaczenia tekstów" jako mechanika: we własnej kategorii „📝 tekst do lektora" — wbudowany tłumacz przeglądarki (Chrome Translator API) albo przekład ręczny; zapis tylko lokalnie, ostrzeżenie o wycieku tytułu/wykonawcy.
- MP: „Gotowy ✓" w lobby i przy rewanżu (autorytet), TV po przeładowaniu zostaje hostem (karencja 10 s), „Czekamy na" w pokoju mieszanym, „Gust stołu" w relay ukryty z notką, szczelina osi słowami w czacie, zapas składanki bez WebAudio.
- Gust: ❤️ w okładce (utwór reprezentatywny albumu), ukrycie gustu w pokoju wycofuje półkę, wylogowanie dosyła i czyści lokalne oceny.
- `server/README.md`: deploy z tokenem z env (`.cf-token` tylko zapasowo — był nieważny).
- **Przegląd MP w przeglądarce (lokalny Worker, 3 tożsamości, telefon 375 px + TV 1920 px)** — poprawione:
  okładka: ostatni etap 40 bloków zamiast 64 (przy 64 czytelny napis „Modern Talking"), albumy z iTunes **i** Deezera
  (PL iTunes: Guns N' Roses tylko „Live Era"), „Greatest" = kompilacja; **klasa `.top` chowała wybór drużyny**
  (szczelina osi czasu i prowadząca opcja ABCD w MP — `body.mp .top{display:none}`; test-strażnik); linia etapu
  przy pasie; polski zapis mnożników (×2,0); opis zadania „Cover: tytuł + oryginalny wykonawca"; „+ więcej (16 s)"
  bez łamania; TV: okładka obok treści zamiast uciętej pod zegarem.
- Karencja hosta przeżywa evikcję DO (persist + alarm). Deezer: limit (HTTP 200 + code 4) → wyjątek + pauza 4 s.
- Covery: gitara w MP (Deezer) 85% → 98% bez fałszywych trafień (`tools/measure-covers.mjs`).

## 1. Do sprawdzenia ręcznie (nie da się w jsdom/panelu)
- [ ] **Nowe tryby MP na 2–3 telefonach + TV (lokalny Worker albo po deployu)**: okładka (etapy, „wyraźniej"), intro (równy start, „+ więcej", iOS autoplay), składanka (4 wycinki, salon), fortepian/gitara (gra cover), oś czasu (szczeliny, głosy, karta zostaje, 320 px).
- [ ] Lobby: „Gotowy ✓" u gości, licznik u hosta/TV; przeładowanie TV w lobby/meczu/po meczu; stary klient w pokoju.
- [ ] Tłumacz w Chrome (Translator API) w edytorze kategorii; wygląd panelu „tekst do lektora".
- [ ] iPhone (Safari/PWA): odtwarzanie solo bez dodatkowego stuknięcia, winyl, obroty, składanka, od tyłu, intro, lektor (głosy PL/EN).
- [ ] Prawdziwy telewizor w trybie salonowym (TV 1920 px, QR, pilot/klawiatura).
- [ ] Porównanie gustu z prawdziwym znajomym (oboje ≥ 10 ocen), Gust stołu w MP.

## 2. Znane problemy / dług
- [ ] Stary klient (PWA z cache) w pokoju z nowymi trybami: okładka bez obrazu, intro jako cała zajawka, szczelina osi jako pole tekstowe (serwer odrzuca złą wartość).
- [ ] Fortepian: brak odpowiednika `strict` z gitary — przechodzą wokalistki z „(Piano Version)" (np. Alice Boman), tylko Deezer; lista deny/allow jak `core/guitarCovers.js`.
- [ ] MP: „Zmień ustawienia" po meczu pamięta tryby, ale nie kategorie; podsumowanie meczu po przeładowaniu strony bez miniatur (okładki z historii telefonu).
- [ ] Limity Deezera (~50 zapytań / 5 s na wspólnym IP Cloudflare): jest pauza po błędzie, brak semafora współbieżności — obserwować przy wielu pokojach.
- [ ] Na produkcji zostały dane testowe z weryfikacji (anonimowa sesja + przerwany mecz solo 0/1) — nieszkodliwe.

## 3. Treści
- [ ] Lektor `tlum-pl`: kilka atrybucji potwierdzonych tylko pośrednio (lista w `audyt-2026-10/paczki-E…md` i raport F7-M); `rap-pl-lektor` ma tylko 10 utworów.
- [ ] Playlisty „top teraz" (`playlists.js`) to zrzut chartów — starzeją się; data na etykiecie albo regeneracja.
- [ ] 6 par pytań o ten sam fakt w różnych paczkach (Hermaszewski, Deep Blue, Kilar, John Williams, prędkość dźwięku, umami) — do ewentualnego rozróżnienia.

## 4. Pomysły na później (z audytu i rozmów)
- [ ] Liga tygodniowa / Pub Night — API jest (`/api/league`), brak UI.
- [ ] „Twoje pudła" — powtórki nietrafionych utworów rozłożone w czasie (trener działa dziś tylko dla quizu).
- [ ] Ranking Stacji dnia (dziś wynik tylko lokalny).
- [ ] Tryb „Ten sam tytuł" (3 różne utwory o tym samym tytule), jokery, nagła śmierć, playlist battle.
- [ ] „Gotowy ✓" i „Gust stołu" w trybie relay (dziś tylko pod autorytetem).

## 5. Porządki lokalne (opcjonalne)
- [ ] Usunąć scalone gałęzie lokalne (`audyt-2026-10`, `eksperyment-tryby`, `gust`, `poprawki-trybow`, `wydanie-v66`, `fix-mp-odpowiedzi`, `mp-v68`, `mp-v69` — wszystkie są w `main`).
- [ ] W `/Volumes/Lexar SSD/Projects/MusicQuiz/` foldery próbek `probki-lektora/`, `probki-obroty/`, `probki-akordy/` — do usunięcia, jeśli niepotrzebne.
- [ ] Dysk systemowy ma mało miejsca — `/private/tmp/claude-501` zajmują głównie pliki innych projektów.
