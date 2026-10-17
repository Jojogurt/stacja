# TODO — co zostało do zrobienia (stan: v69, 2026-10-17)

Jedno miejsce z otwartymi sprawami. Szczegóły i historia w plikach obok:
`audyt-2026-10.md` (+ `audyt-2026-10/WYDANIE.md`), `gust-muzyczny.md`, `przeglad-mp-2026-10.md` (+ zrzuty w `przeglad-mp-2026-10/`, poza gitem).

Produkcja: klient v69 (GitHub Pages), Worker z v68 (wersja `32746a62…`), migracja D1 `0005_taste.sql` zastosowana.
Wydawanie: najpierw Worker (`cd server && wrangler deploy` — token z `~/.zshrc` `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID=fb55a9a3ef0395e40a5af221b3d40aa1`), potem merge na `main` z podbitym `APP_VERSION` (app.js) i `CACHE` (sw.js). Lokalny serwer do testów MP: `wrangler dev --local --port 8787 --var TOKEN_SECRET:dev-secret-local` + klient `?rooms=http://127.0.0.1:8787` (działa tylko na localhost).

## 1. Następne w kolejce (uzgodnione z właścicielem)
- [ ] **Okładka w multiplayerze** — serwer musi wybierać album (dziś `server/lib/resolve.js` i proxy `/tracks` znają tylko utwory), etapy wyostrzania prowadzone przez serwer (wspólne dla wszystkich), anty-podglądanie: serwer wysyła na każdym etapie inny URL okładki (iTunes `16x16bb` → `32x32bb` → `64x64bb` → pełna), widok w `app/mp-render.js` + TV.
- [ ] **Intro (1-2-4-8-16 s) w multiplayerze** — ten sam mechanizm etapów sterowanych przez serwer.
- [ ] **Pozostałe tryby solo w MP**: składanka (medley), fortepian/gitara (cover resolver na serwerze), oś czasu (oś drużyny w stanie gry, głosowanie na szczelinę, odsłona — opis w komentarzu w `core/match.js` przy `SOLO_ONLY_MODES`).

## 2. Decyzje właściciela
- [ ] **Jedna nazwa aplikacji**: „STACJA" (TV, karta wyniku, link pokoju, docs) vs „Uszy & Muzk" (UI, manifest, title). Stała `APP_NAME` dla kart PNG.
- [ ] Kategoria „tłumaczenia tekstów" — tylko jako mechanika wypełniana przez właściciela (własna kategoria: wklejony fragment → tłumaczenie w przeglądarce → lektor czyta przekład; prywatnie). NIE generować przekładów tekstów piosenek (prawa autorskie).

## 3. Do sprawdzenia ręcznie (nie da się w jsdom/panelu)
- [ ] iPhone (Safari/PWA): odtwarzanie solo bez dodatkowego stuknięcia, winyl, zwolnione/przyspieszone obroty, składanka (WebAudio), od tyłu, intro, lektor (głosy PL/EN).
- [ ] Prawdziwy telewizor w trybie salonowym (TV 1920 px, QR skanowany telefonem, sterowanie klawiaturą/pilotem).
- [ ] Pokój MP z 3–4 telefonami na produkcji (Drużyny, salon, rewanż, dołączanie w trakcie).
- [ ] Porównanie gustu z prawdziwym znajomym (oboje ≥ 10 ocen), Gust stołu w MP.

## 4. Znane problemy / dług
- [ ] Proxy Workera `/tracks` zwraca wyniki z Deezera zamiast iTunes (iTunes blokuje IP Cloudflare?) → brak gatunku (`primaryGenreName`) i słabsze trafienia. Zbadać (np. inny endpoint/nagłówki, cache, fallback po stronie klienta na bezpośredni iTunes).
- [ ] `server/.cf-token` ma nieważny token — podmienić na aktualny albo zaktualizować instrukcję deployu w `server/README.md`.
- [ ] Okładka (solo): przy pełnym wyostrzeniu okładka często pokazuje nazwę zespołu → rozważyć koniec na etapie 64 bloków albo przycięcie.
- [ ] MP: brak mechanizmu „Gotowy ✓" w lobby i przy rewanżu; przeładowanie TV → host przechodzi na gracza; „Gust stołu" nie działa w trybie relay; w pokoju mieszanym (stary klient) „Czekamy na" nie znika do zmiany fazy.
- [ ] Gust: brak ❤️ w trybie okładki; ukrycie gustu w trakcie pobytu w pokoju nie wycofuje wysłanej półki; wylogowanie zostawia lokalne oceny.
- [ ] Gitara: cover dla ~55% hitów; tytuły kolidujące (Wonderwall, Africa) blokowane przez ochronę kolizji — można rozszerzyć kuratorowaną listę `core/guitarCovers.js`.
- [ ] Na produkcji zostały dane testowe z weryfikacji (anonimowa sesja + przerwany mecz solo 0/1) — nieszkodliwe.

## 5. Treści
- [ ] Lektor `tlum-pl`: kilka atrybucji potwierdzonych tylko pośrednio (lista w `audyt-2026-10/paczki-E…md` i raport F7-M); `rap-pl-lektor` ma tylko 10 utworów.
- [ ] Playlisty „top teraz" (`playlists.js`) to zrzut chartów — starzeją się; data na etykiecie albo regeneracja.
- [ ] 6 par pytań o ten sam fakt w różnych paczkach (Hermaszewski, Deep Blue, Kilar, John Williams, prędkość dźwięku, umami) — do ewentualnego rozróżnienia.

## 6. Pomysły na później (z audytu i rozmów)
- [ ] Liga tygodniowa / Pub Night — API jest (`/api/league`), brak UI.
- [ ] „Twoje pudła" — powtórki nietrafionych utworów rozłożone w czasie (trener działa dziś tylko dla quizu).
- [ ] Ranking Stacji dnia (dziś wynik tylko lokalny).
- [ ] Tryb „Ten sam tytuł" (3 różne utwory o tym samym tytule), jokery, nagła śmierć, playlist battle.

## 7. Porządki lokalne (opcjonalne)
- [ ] Usunąć scalone gałęzie lokalne (`audyt-2026-10`, `eksperyment-tryby`, `gust`, `poprawki-trybow`, `wydanie-v66`, `fix-mp-odpowiedzi`, `mp-v68`, `mp-v69` — wszystkie są w `main`).
- [ ] W `/Volumes/Lexar SSD/Projects/MusicQuiz/` foldery próbek `probki-lektora/`, `probki-obroty/`, `probki-akordy/` — do usunięcia, jeśli niepotrzebne.
- [ ] Dysk systemowy ma mało miejsca — `/private/tmp/claude-501` zajmują głównie pliki innych projektów.
