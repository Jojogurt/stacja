# PLAN ROZWINIĘĆ — „Pub Night" (liga tygodniowa) + edytor własnych kategorii

> Status: **propozycja do implementacji** (z audytu 2026-07). Dwa niezależne feature'y;
> wspólny mianownik: oba reużywają istniejącą infrastrukturę (DO/D1, iTunes Search,
> format kategorii z `app/catalog.js`, kody pokojów). Kolejność dowolna, ale edytor
> kategorii (część B) jest tańszy i bez zależności od backendu w MVP.
>
> Warunek wstępny dla części A: FAZA 1 i 3 z `plan-naprawy-audyt-2026-07.md`
> (deadlocki MP + walidacja record-match) — liga asynchroniczna na spoofowalnym
> zapisie wyników nie ma sensu.

---

# CZĘŚĆ A — „Pub Night": asynchroniczna liga tygodniowa

## Idea

Host układa mecz raz (istniejący picker), publikuje go jako **wyzwanie tygodnia**
i wysyła link. Każda drużyna/gracz rozgrywa TEN SAM mecz (te same utwory, te same
pytania, ta sama kolejność) w dogodnym momencie w ciągu tygodnia. Tabela wyników
odsłania się po deadline'ie — do tego czasu widać tylko „kto już zagrał".

## Dlaczego pasuje do istniejącej architektury

- `resolveTrackServer` w DO już rozwiązuje utwory po stronie serwera — wystarczy
  zrobić to RAZ przy publikacji i **zamrozić** wynik (playlista meczu), zamiast
  losować per pokój.
- `core/match.js` (`buildMatch`) jest czysty i deterministyczny przy wstrzykniętym
  `rnd` — ten sam seed ⇒ ten sam mecz. Rdzeń nie wymaga zmian.
- Tożsamość/profile/`record_match` istnieją (Etap 1 Supabase); D1 + DO są wdrożone.
- Kod wyzwania = ten sam mechanizm co kod pokoju (4-6 znaków + link `?pubnight=KOD`).

## Model danych (D1)

```sql
CREATE TABLE pubnight (
  id TEXT PRIMARY KEY,              -- kod wyzwania (6 znaków)
  owner_id TEXT NOT NULL,           -- profil hosta
  title TEXT NOT NULL,              -- np. "Pub Night #12 — lata 90"
  match_json TEXT NOT NULL,         -- ZAMROŻONY mecz: sloty + rozwiązane utwory
                                    -- (previewUrl, odpowiedzi, pytania quiz/lektor)
  created_at INTEGER NOT NULL,
  opens_at INTEGER NOT NULL,        -- start okna
  closes_at INTEGER NOT NULL,       -- deadline (odsłona tabeli)
  status TEXT NOT NULL DEFAULT 'open'   -- open | closed
);

CREATE TABLE pubnight_run (
  challenge_id TEXT NOT NULL REFERENCES pubnight(id),
  player_id TEXT NOT NULL,          -- profil (lub id drużyny — patrz decyzja D1)
  display_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  detail_json TEXT NOT NULL,        -- wynik per pytanie (do porównań po odsłonie)
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, player_id)   -- JEDNO podejście na gracza
);
```

## Przepływ

### Publikacja (host)
1. Picker solo/MP w nowym trybie „Pub Night" (przełącznik w `mp-picker` obok formatu).
2. `POST /api/pubnight` (Worker): serwer buduje mecz (`buildMatch` z seedem),
   rozwiązuje WSZYSTKIE utwory z góry (`resolveTrackServer` per slot audio; pytania
   quiz/lektor wybiera od razu), zapisuje `match_json`, zwraca kod + link.
   - Utwór nierozwiązywalny ⇒ przelosowanie slotu przy publikacji (host nie wysyła
     wyzwania z dziurą) — to eliminuje NETERR w trakcie rozgrywki uczestników.
   - **Pułapka: wygasające previewUrl iTunes.** Nie polegać na URL-u z dnia publikacji:
     w `match_json` trzymać `trackId` + parametry wyszukania, a `GET /api/pubnight/:id`
     odświeżać previewUrl przy pobraniu (lookup po trackId jest tani); fallback:
     re-resolve przy 404 po stronie klienta (listener error z FAZY 2 planu naprawy).
3. Ekran hosta: link do udostępnienia (istniejący share z lobby MP), lista
   „kto już zagrał" (bez wyników!), przycisk „zamknij wcześniej".

### Rozgrywka (uczestnik)
1. Link `?pubnight=KOD` → ekran wyzwania: tytuł, kto wystawił, deadline,
   „N drużyn już zagrało", przycisk START (wymaga profilu — `ensureSession`).
2. `GET /api/pubnight/:id/start` → serwer zwraca `match_json` **bez odpowiedzi**
   (sloty + previewUrl + pytania; odpowiedzi zostają na serwerze — dokładnie ten sam
   wzorzec co `answerSlots` w authorityRoom) i stempluje `started_at`.
3. Rozgrywka silnikiem **solo** (`app/solo.js`) z dwiema różnicami, wstrzykiwanymi
   przez istniejące punkty rozszerzeń:
   - źródło rund: zamiast `resolveTrack` — kolejne sloty z pobranego meczu
     (nowa gałąź w `newRound`, analogiczna do quizowej);
   - ocena: `POST /api/pubnight/:code/answer` per pytanie — serwer ocenia
     `core/scoring` (rozstrzygnięte w D2; kontrakt w sekcji „Kontrakt API").
4. Koniec meczu ⇒ `POST /api/pubnight/:id/finish` → wpis w `pubnight_run`
   (INSERT OR IGNORE — drugie podejście odrzucone).

### Odsłona
1. Po `closes_at` (cron trigger Workera lub lazy przy pierwszym GET po terminie):
   `status='closed'`.
2. Ekran tabeli: ranking, per-pytanie porównanie „wasza odpowiedź vs najlepsi",
   MVP tygodnia. Renderuje istniejący wzorzec summary z solo + standings z MP.
3. Push/nudge: poza zakresem MVP (brak notyfikacji w PWA na iOS bez instalacji).

## Decyzje — ROZSTRZYGNIĘTE (implementować bez dopytywania)

- **D1: gra GRACZ (profil).** `player_id` = profil z Etapu 1. Format kolumny
  dopuszcza przyszłe `team:<id>` (prefiks), ale w tym zakresie NIE implementujemy
  drużyn (backlog `druzyny-i-znajomi.md` osobno).
- **D2: ocena SERWEROWA, per pytanie.** `POST /answer` ocenia `core/scoring`
  importowanym przez Workera (ten sam kod co klient — DRY). Latencja „Sprawdź"
  akceptowalna (jeden mały POST); offline = brak Pub Night (komunikat, nie fallback).
- **D3: akceptujemy przeciek przez człowieka.** Reveal per pytanie pokazuje poprawną
  odpowiedź; zabezpieczenia to: odpowiedzi nigdy nie schodzą do klienta przed oceną
  (D2), jedno podejście na profil (PK w `pubnight_run`), deadline. Nic więcej.

## Kontrakt API (kształty JSON — źródło prawdy dla implementacji)

Wszystkie żądania z nagłówkiem `Authorization: Bearer <stacjaToken>` (istniejący
token sesji; weryfikacja jak w `server/api.js`). Błędy: `{error:"<kod>"}` + status.

```
POST /api/pubnight            → 201 {code:"A7K2QX", closes_at:1751500800000}
  body: {title:"Pub Night #12", opens_at?:ms, closes_at:ms,
         config:{rounds, timer, modes, pools}}      // pools jak w MP 'start' (clampPools!)
  błędy: 400 bad_config | 400 window_invalid (closes_at<=now lub >30 dni)
         | 429 too_many (limit 20 otwartych wyzwań/konto)

GET  /api/pubnight/:code      → 200 {code, title, owner_name, opens_at, closes_at,
                                     status:"open"|"closed", total_questions,
                                     played:[{display_name}],          // BEZ wyników gdy open
                                     board: status=="closed" ? [{display_name,score,correct_count}] : null}
  błędy: 404 not_found

POST /api/pubnight/:code/start → 200 {run_token:"...", slots:[...], qcount}
  // slots: per pytanie {mode, catLabel, prompt?, answerSlots?, preview?, lyric?, snipStart?}
  //        — BEZ pól odpowiedzi (track/artist/answers zostają na serwerze, wzorzec authorityRoom)
  // previewUrl ODŚWIEŻANY lookupem po trackId przy tym wywołaniu
  błędy: 403 closed | 403 not_open_yet | 409 already_played | 401 no_auth

POST /api/pubnight/:code/answer → 200 {ok:[per-slot bool], gained, reveal:{track,artist,year,album}}
  body: {run_token, qi, values:{title?,artist?,rok?,album?,...}}   // values capowane .slice(0,120)
  błędy: 409 out_of_order (qi != oczekiwane) | 403 run_invalid

POST /api/pubnight/:code/finish → 200 {score, correct_count, rank_hidden:true}
  // serwer liczy score SAM z zapisanych odpowiedzi (klient nic nie podaje) → INSERT pubnight_run
  błędy: 403 run_invalid | 409 already_played
```

`run_token` = HMAC (istniejący `server/lib/auth.js` sign) z `{code, player_id, iat}`,
ważny do `closes_at` — trzyma stan podejścia bez sesji w DO. Odpowiedzi per pytanie
zapisywane w D1 (tabela robocza `pubnight_progress(challenge_id, player_id, qi, values_json, gained)`
z PK `(challenge_id, player_id, qi)` — INSERT OR IGNORE daje idempotencję na retry
i uniemożliwia poprawianie odpowiedzi).

## Etapy implementacji

| # | Zakres | Warstwa | Szacunek |
|---|--------|---------|----------|
| A1 | Tabele D1 + `POST /api/pubnight` (publikacja z zamrożeniem meczu) | server | 1 dzień |
| A2 | `GET :id` / `start` / `answer` / `finish` + oceny serwerowe | server | 1-2 dni |
| A3 | Tryb „Pub Night" w pickerze + ekran wyzwania + deep-link `?pubnight=` | app/ | 1-2 dni |
| A4 | Rozgrywka: gałąź źródła rund w solo.js + ocena przez API | app/ | 1 dzień |
| A5 | Tabela wyników + odsłona po deadline (cron) | obie | 1 dzień |
| A6 | Testy: rdzeń (determinizm buildMatch po seedzie), api (jedno podejście, cap, brak odpowiedzi w GET), jsdom (przepływ ekranu wyzwania) | test | 1 dzień |

**Testy krytyczne:** GET nigdy nie zawiera odpowiedzi; drugi `finish` odrzucony;
`closes_at` egzekwowane na serwerze (start po terminie = 403); previewUrl odświeżany.

---

# CZĘŚĆ B — Edytor własnych kategorii z udostępnianiem

## Idea

Kreator: wyszukaj w iTunes → zaznacz 20-50 utworów → zapisz jako kategorię „Twoje"
→ (opcjonalnie) udostępnij kodem/linkiem. Scenariusz killer: „nasze wesele",
„hity naszej paczki" — kategorie idealne na imprezę, niedostępne w żadnej gotowej apce.

## Co już jest (≈80%)

- Kategorie użytkownika **istnieją**: `stacjaPlaylists` w localStorage, wrappery
  w `app/catalog.js` (`plList/plSave/plImport/plRemove`), grupa „Twoje" w pickerze
  solo i MP, `plPick` w `core/picker.js`. Format: `{name, tracks:[{title, artist, preview?}]}`.
- iTunes Search jest w `adapters-web/itunesRepository.js` (z proxy i JSONP fallback).
- `plImport` już dziś przyjmuje JSON — brakuje UI kreatora i kanału udostępniania.

## MVP (bez backendu) — kreator lokalny

1. **Ekran „Nowa kategoria"** (wejście z grupy „Twoje" w pickerze, przycisk „+"):
   - pole wyszukiwania → `itunesRepository.search(term)` → lista wyników
     (okładka, tytuł, artysta, przycisk ▶ 5-sekundowego odsłuchu — reużyć
     istniejący element audio z guardami z FAZY 2 planu naprawy);
   - koszyk wybranych (licznik, minimum 10 — mniej psuje mecz przy QPC=5
     i anty-powtórkach; walidacja jak `pickSummary`);
   - zapis: `plSave` (w try/catch — patrz FAZA 5.10 planu naprawy) →
     kategoria od razu widoczna w pickerze.
2. **Deduplikacja i jakość**: przy dodawaniu filtr `previewUrl` obecny (utwór bez
   zajawki = bezużyteczny), dedup po `norm(title)+norm(artist)`.
3. **Edycja/usuwanie**: istniejące `plRemove` + nowy tryb edycji (dogranie/wyrzucenie
   utworów). Pamiętać o czyszczeniu `soloCats` po usunięciu (bug 15 z audytu).
4. **Eksport/import plikiem** (za darmo, `plImport` już jest): przycisk „skopiuj JSON"
   / „wklej JSON" — udostępnianie działa od MVP bez żadnego serwera.

**Pułapki MVP:**
- previewUrl iTunes wygasa → w zapisie trzymać też `trackId`; przy odtwarzaniu 404
  odświeżyć lookupem (wspólny helper z częścią A!).
- localStorage quota (Safari private) — komunikat, nie wyjątek.
- `escapeHtml` na nazwie kategorii i tytułach WSZĘDZIE w rendererach pickera
  (dane od użytkownika! dziś playlisty są zaufane, po edytorze już nie).

## Etap 2 — udostępnianie kodem (wymaga Workera)

1. **Model D1:**
   ```sql
   CREATE TABLE shared_category (
     code TEXT PRIMARY KEY,          -- 6 znaków, jak kod pokoju
     owner_id TEXT NOT NULL,
     name TEXT NOT NULL,
     tracks_json TEXT NOT NULL,      -- [{title, artist, trackId}] — BEZ previewUrl
     created_at INTEGER NOT NULL,
     downloads INTEGER DEFAULT 0
   );
   ```
2. Kontrakt API (kształty — źródło prawdy):
   ```
   POST /api/category           → 201 {code:"K4TZ9P"}
     body: {name:"Wesele Ani", tracks:[{title,artist,trackId?}]}
     walidacja: name .slice(0,60); 10 ≤ tracks.length ≤ 100; title/artist .slice(0,120);
                trackId opcjonalny int; ≤50 kategorii/konto
     błędy: 400 bad_payload | 400 too_few_tracks | 429 too_many_categories | 401 no_auth
   GET  /api/category/:code     → 200 {name, tracks:[{title,artist,trackId?}], downloads}
     (bez previewUrl — klient odświeża lookupem po trackId; downloads++ przy pobraniu)
     błędy: 404 not_found
   ```
3. UI: przycisk „udostępnij" przy kategorii → kod + link `?cat=KOD`;
   deep-link w bootstrapie (obok `?room=`) → auto-import z potwierdzeniem
   („Dodać kategorię »Wesele Ani i Tomka« (34 utwory)?").
4. Kategoria z kodu w MP: host ją ma po imporcie i pula idzie standardową ścieżką
   (`mpBuildPools` serializuje utwory do pokoju — goście NIE muszą jej mieć). Sprawdzić
   cap `clampPools` na serwerze — 50 utworów × długości stringów musi się mieścić.

## Poza zakresem (świadomie)

- Moderacja treści udostępnianych kategorii (nazwy!) — na razie kod trzeba znać,
  nie ma publicznego katalogu; przy publicznym katalogu wróci jako wymaganie.
- Playlisty ze Spotify/YT — iTunes wystarcza (zajawki 30 s, bez logowania).

## Etapy implementacji

| # | Zakres | Warstwa | Szacunek |
|---|--------|---------|----------|
| B1 | Ekran kreatora: search + koszyk + odsłuch + zapis | app/ | 1-2 dni |
| B2 | Edycja istniejącej + eksport/import JSON + poprawki quota/escape | app/ | 0.5 dnia |
| B3 | D1 + POST/GET z capami | server | 0.5 dnia |
| B4 | Udostępnij/kod/deep-link `?cat=` + auto-import | app/ | 0.5 dnia |
| B5 | Testy: picker z kategorią użytkownika w meczu (rdzeń), import/export (jsdom), capy API | test | 0.5 dnia |

**Testy krytyczne:** kategoria <10 utworów odrzucona z komunikatem; utwór bez preview
odfiltrowany; import uszkodzonego JSON nie wysypuje pickera; XSS przez nazwę
kategorii/tytuł utworu (render pickera i reveal escapowany).

---

## Wspólne elementy (zrobić raz)

1. **Helper odświeżania previewUrl po trackId** (`adapters-web/itunesRepository.js`:
   `lookupById(trackId)`) — używany przez A (pobranie wyzwania) i B (odsłuch/mecz).
2. **Generator kodów** — wydzielić z logiki pokoju do współdzielonego modułu
   (pokój / pubnight / kategoria).
3. **Wzorzec deep-linków** w bootstrapie: dziś `?room=`, dojdą `?pubnight=` i `?cat=`
   — jeden router parametrów zamiast trzech if-ów.

## Rekomendowana kolejność

**B przed A**: B-MVP (B1-B2) nie dotyka backendu, daje wartość natychmiast
(kategorie na imprezę) i buduje helper previewUrl potrzebny w A. Potem A w całości
(po FAZIE 1+3 planu naprawy), na końcu B3-B5 (udostępnianie kodem) — reużywa
wzorców API świeżo położonych pod A.
