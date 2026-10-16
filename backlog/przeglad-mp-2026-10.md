# Przegląd UX multiplayera STACJA — październik 2026

*Perspektywa: product designer gier imprezowych (benchmarki: Kahoot, Jackbox, Gartic Phone, Skribbl, SongPop Party).*
*Gałąź `fix-mp-odpowiedzi` (v66 + poprawka skórki czatu). Grane lokalnie: `wrangler dev --local` (autorytet DO) + `http.server`, 3 tożsamości (localhost:8160 host, 127.0.0.1:8160 gość 375 px dark, localhost:8161 gość 320 px dark).*
*Zrzuty: `backlog/przeglad-mp-2026-10/` (41 PNG, poza gitem). Numer zrzutu w tabelach = prefiks pliku.*

**Co zagrano:** Wspólna 5 pyt. (kolumny, tryb rok — patrz F6), Solo 5 pyt. (host kolumny + gość czat, muzyka, pewniak, pas, odświeżenie, wyjście i powrót hosta), Drużyny + salon/TV 2×1 (łamigłówki „Jedna litera różnicy”, wyjście TV), pojedyncze pytania lektor i ABCD. Zmierzona oś czasu przejść (MutationObserver na `#mpStage`).

---

## TL;DR

1. **Rdzeń działa i jest stabilny**: dołączanie, równy start audio, auto-dalej, powrót po odświeżeniu, potwierdzenie wyjścia, awans hosta. Nic się nie zawiesiło w ~20 pytaniach.
2. **3 blokery**: (a) w salonie po wyjściu TV gracz awansowany na hosta **zamienia się w TV** — traci pola odpowiedzi i dostaje pełny stan rywali; (b) na 320 px / niskich telefonach **sticky stopka zasłania cały ekran kombinowania**; (c) w skórce czat **układ skacze po każdej wiadomości** — tap w emotkę trafia w „PEWNIAK ×2” (realna kara „stawia kolejkę”).
3. **Timer kłamie**: „30 s na odpowiedź” liczy się od startu słuchania (15 s), więc na pisanie zostaje ~14 s. Czerwony licznik świeci od pierwszej sekundy, a obok jeździ drugi, niezależny pasek słuchania.
4. **Intro faz jest za ubogie, a nie za długie**: 0,9 s + 0,46 s fade to OK. Problem w tym, że zasłania też nagłówek i mówi tylko „SŁUCHAJ”. Brak numeru pytania, kategorii i zadania („zgadnij ROK”, „wybierz A–D”). Kahoot w tym samym czasie pokazuje kartę pytania.
5. **Gracz nie wie, ile ma punktów** w trakcie meczu (coop: nigdzie; Solo/Drużyny: ranking tylko na odsłonie, pod foldem). Na ekranach czekania nie widać, na kogo czekamy.
6. **Mecz „Krótki” to 1 kategoria × 1 tryb**: wybrane 2 kategorie i 3 tryby nie zagrały, 5/5 pytań było „1980–89 · rok”. Pasek startu obiecywał „2 kat. · 3 tryby”.
7. **Brak auto-zamknięcia pytania**, gdy wszyscy dali typ lub spasowali (stół czeka na hosta albo timer). Host w Solo/Drużynach jest jednocześnie graczem i sędzią z przyciskiem „ZATWIERDŹ WSZYSTKICH” nad własnymi polami.
8. **Formaty Solo/Drużyny mówią językiem coop**: „ODPOWIEDŹ DRUŻYNY — wrzućcie i przegłosujcie”, „RANKING DRUŻYN”, „zwycięska drużyna”. Remis 0:0 kończy się „X wygrywa!”.
9. **CTA poza ekranem**: „NASTĘPNE PYTANIE” na odsłonie Solo zaczyna się na 845 px przy wysokości 812. „gotowe, kombinujemy” chowa się pod sticky stopką (lektor, ABCD, quiz). ABCD w MP to „wpisz literę”, a nie kafle do tapnięcia.
10. **TV/salon to telefonowy widok na dużym ekranie**: kolumna max 880 px, małe fonty, brak QR i dużego zegara, a na TV widać nawet przycisk „ODPOWIADAMY →”.

**Liczba problemów w planie: P0 = 10, P1 = 17, P2 = 14.**

---

## Oś czasu jednego pytania (zmierzona, gość, Wspólna, timer 30 s)

| t (ms) od kliknięcia „dalej” | Ekran | Uwagi |
|---|---|---|
| 0 | „✓ idziesz dalej… następne pytanie ruszy, gdy wszyscy przejdą dalej” | roster z poprzedniego pytania (nieaktualny) |
| ~2050 | „host losuje utwór…” | treść nieprawdziwa przy serwerze-autorytecie |
| ~2940 | ARMING „czekamy aż wszyscy będą gotowi… 0/2 → 1/2” | trwa ~70 ms, mignięcie |
| ~3010 | INTRO „SŁUCHAJ” (cały `#mpStage` opacity 0, z nagłówkiem) | `MP_INTRO_MS=900` |
| ~3910 | treść wchodzi (stagger 0,44 s), audio startuje | overlay usuwany po +460 ms |
| ~4400 | pełny widok „słuchaj” | licznik pytania pokazuje już ~29 s |
| +15 s | auto-przejście do „kombinuj” (lokalne, per gracz) | zostaje ~14 s na pisanie |
| +30 s | serwerowy auto-lock → odsłona, auto-dalej 10 s | |

Wniosek: martwy czas (~4,4 s) jest rozsądny, porównywalny z „Get ready” w Kahoot. Problem leży w tym, co gracz widzi przez te 4 s: trzy różne, migające komunikaty i pusty ekran z ikoną zamiast jednej karty pytania.

---

## 1. FLOW — czy gracz wie: (a) faza, (b) co robić, (c) na kogo czekamy, (d) ile zostało

| Pytanie | Ocena | Dlaczego |
|---|---|---|
| (a) w jakiej fazie | **częściowo** | Rail 🎧·🧠·👁 w nagłówku jest, ale ma 15 px przy opacity .38 na niebieskim tle (index.html:1204-1207), bez podpisu. Faza „słuchaj/kombinuj” jest **lokalna per gracz** (mp-render.js:415, 591-597), więc dwaj gracze przy stole mogą widzieć różne fazy. |
| (b) co mam zrobić | **słabo** | Tryb „rok” na ekranie słuchania pokazuje tylko chip „♬ rok” (zrzut 08). Polecenie „wpisz rok” pojawia się dopiero jako placeholder w kombinuj. Intro mówi zawsze „Słuchaj”, także dla roku i ABCD (mp-render.js:418-426). |
| (c) na kogo czekamy | **słabo** | „następne pytanie ruszy, gdy wszyscy przejdą dalej” bez listy osób (zrzut 16). W praktyce przejście wyzwala host (mp.js:476-481). Gość bez hosta: „host zatwierdza — albo koniec czasu”. |
| (d) ile zostało | **myląco** | „Pyt. 1/5” jest OK. Zegar odpowiedzi liczy od startu słuchania i jest czerwony cały czas. Pasek słuchania to osobny, lokalny zegar 15 s. Wyniku łącznego nie ma nigdzie w trakcie gry. |

| id | waga | problem | gdzie | zrzut |
|---|---|---|---|---|
| F1 | **P1** | **„Czas na odpowiedź” zawiera fazę słuchania.** `endsAt = go()+timer` (authorityRoom.js:611), a słuchanie trwa 15 s (timing.js:160). Przy „30 s” na pisanie zostaje ~14 s, przy lektorze (22 s) tylko ~7 s. Pigułka timera jest czerwona od 1. sekundy (index.html:811), więc ostrzeżenie w ostatnich 5 s się nie wyróżnia. | authorityRoom.js:611; timing.js:160; index.html:811 | 08, 10 |
| F2 | P1 | **Dwa zegary naraz**: pasek słuchania (lokalny, od końca intra) i licznik pytania (serwerowy). Przykład: pasek prawie pusty, licznik 16 s. Po odświeżeniu lub powrocie pasek startuje od pełnych 15 s mimo 12 s do końca pytania (B7). Do tego licznik porównuje serwerowe `endsAt` z zegarem telefonu, więc rozjazd zegarów zmienia czas wyświetlany graczom. | mp-render.js:592-604; mp.js:862-866 | 20, 30 |
| F3 | **P1** | **Intro zasłania wszystko i nic nie mówi.** `#mpStage.mp-introing > *{opacity:0}` chowa też nagłówek (nr pytania, kategorię, tryb). Na ekranie zostaje ikona i „SŁUCHAJ”/„PYTANIE”. W dark mode podczas fade etykieta prawie znika (`color:var(--ink)` + animacja opacity). Nie ma dźwięku „stingu” na start pytania. | index.html:726-747; mp-render.js:418-462 | 26, 37 |
| F4 | **P1** | **Brak auto-zamknięcia**, gdy wszyscy mają typ lub spasowali. Przykład: „ZATWIERDŹ WSZYSTKICH 2/2 z typem” i stół czeka na hosta albo 60 s. Gdy wszyscy spasowali, czekamy do końca czasu. Kahoot/Gartic kończą rundę, gdy wszyscy są gotowi. | authorityRoom.js (brak warunku w akcjach propose/pass) | 23 |
| F5 | P1 | **„Czekamy na…” bez imion.** Ekran po „dalej” i ARMING pokazują licznik albo ogólnik. Roster na ekranie „idziesz dalej” pokazuje stan z poprzedniego pytania („✓ typ”/„myśli”), więc wygląda, jakby ktoś jeszcze myślał. | mp-render.js:185-203 | 16 |
| F6 | **P1** | **Krótki mecz = 1 slot.** `nSlots = questions/QPC` (core/match.js:136), więc 5 pytań daje 1 kategorię × 1 tryb. Host wybrał 2 kategorie i muzyka+ABCD+rok, a zagrało 5× „1980–89 · rok”. Pasek startu obiecywał „5 utworów · 2 kat. · 3 tryby”. | core/match.js:113-152; core/matchSetup.js settingsSummary | 06, 08 |
| F7 | **P1** | **Brak wyniku w trakcie meczu.** Nagłówek nie ma punktów (mp-render.js:497-516). Coop: suma widoczna dopiero na końcu (320). Solo/Drużyny: ranking tylko na odsłonie, pod foldem. | mp-render.js:497-516, 640-650 | 12, 24 |
| F8 | **P1** | **CTA odsłony poza ekranem.** Solo/Drużyny na 375×812: „NASTĘPNE PYTANIE” ma top 845 px (zmierzone), a ranking rośnie z liczbą graczy. Na 320×640 baner i CTA są 1,5 ekranu niżej. Gracz nie zna wyniku rundy bez scrolla. | mp-render.js:691-703 | 25, 41 |
| F9 | P1 | **„gotowe, kombinujemy →” pod sticky stopką** w lektorze, ABCD i quizie: długa treść spycha przycisk pod `.mp-foot` (emotki+czat). | mp-render.js:530-535; index.html:792 | 43, 45 |
| F10 | P1 | **Host = gracz + sędzia** (Solo/Drużyny). Pełnoszerokie „ZATWIERDŹ WSZYSTKICH” stoi między odpowiedzią a polami hosta, więc łatwo zakończyć pytanie, zanim samemu się wpisze. Gość nie wie, że host to zrobi. | mp-render.js:318-336 | 23 |
| F11 | P1 | **Awans i odzyskanie hosta bez komunikatu.** Gość nagle dostaje „ZATWIERDŹ WSZYSTKICH” bez toastu „Jesteś teraz hostem”, a po powrocie hosta przycisk znika bez słowa. Wychodzący i wracający gracz traci imię („gracz”, „?”). | mp.js (brak toastu); authorityRoom.js:217-249 | 29, 30 |
| F12 | P2 | **Lobby → ustawienia:** host w „Nowy mecz” nie widzi kodu pokoju ani listy graczy (nie wie, czy ktoś doszedł). Na desktopie lewa kolumna jest pusta, a pasek startu jest w prawej, pod scrollem. Przycisk „ZACZNIJ →” w lobby przesuwa się, gdy ktoś dochodzi (mój klik trafił w pustkę). | mp-picker.js; mp-render.js:63-91 | 01, 04, 06 |
| F13 | P2 | **Rewanż to nie 1 tap.** Rewanż otwiera ekran ustawień. Goście stoją na wyniku z biernym „host zaczyna rewanż” i nie widzą szkicu (szkic tylko gdy `phase==null`). | mp.js:819-823 | 17 |
| F14 | P2 | Deep link `?room=` wypełnia kod, ale wymaga jeszcze „DOŁĄCZ” (nadal F5 z audytu). | mp.js | 02 |
| F15 | P2 | Skórka kolumny/czat wybierana tylko w menu głównym. W grze nie da się jej zmienić. | index.html (menu) | — |

### Intro i przejścia — ocena

* **Czas: OK** (900 ms LEAD + 460 ms fade, wspólny dla równego startu; mp-render.js:431-461, timing.js:171). **Spójność: OK.** Intro jest tylko przed „słuchaj”, a kombinuj i odsłona mają jedynie `animIn`.
* **Wejście/wyjście:** ikona pop → shrink + treść stagger 0,44 s nakładają się poprawnie. Pusty biały lub ciemny ekran z samą ikoną wygląda jednak jak doładowywanie, a nie jak moment gry. Brakuje stałej ramy (nagłówek, rail), z której wyłania się pytanie.
* **Dźwięk:** brak dźwięku na start pytania. SFX są tylko na odsłonie (oklaski, ding, buzz) i tik ostatnich 5 s.
* **Rail 🎧·🧠·👁:** zbyt mały i blady, bez nazwy fazy. Jest per gracz, więc nie synchronizuje stołu.
* **Skoki layoutu:** lobby (przycisk zjeżdża przy dojściu gracza), czat (composer zjeżdża przy każdej wiadomości, B3), odsłona (staged reveal: karta, baner i CTA wjeżdżają po kolei; przez ~0,5 s jest pusto w miejscu CTA, zrzut confetti), przejście słuchaj → kombinuj na ABCD przewinęło stronę (nagłówek ucięty).
* **Migotanie:** „host losuje” → „czekamy 0/2 → 1/2” → intro w ciągu ~1 s to trzy różne komunikaty, które nie zdążą się przeczytać.

---

## 2. WIDOKI

| id | waga | problem | gdzie | zrzut |
|---|---|---|---|---|
| W1 | P2 | **Lobby gościa 375 px:** imiona ucięte („Naczelny Słoi…”, „(Ty)” niewidoczne), bo każdy wiersz ma redundantny badge „W POKOJU”. Szkic „Mecz, który ustawia host” jest bardzo dobry (na żywo, czytelny). | mp-render.js:66-74 | 03, 05 |
| W2 | P2 | **Słuchaj:** dużo pustego miejsca między CTA a emotkami; status „GRA…” w kapitalikach jak etykieta systemowa. Lektor używa winyla (metafora płyty dla TTS). Placeholder czatu ucięty: „czat · odpowiedź wpiszesz po „kor”. | mp-render.js:520-535, 171 | 08, 43 |
| W3 | P2 | **Kombinuj kolumny:** pojedyncza kolumna „ROK” jest przyklejona do lewej połowy, a pod nią ~150 px pustki, zanim ktoś wrzuci typ. Pusty stan bez podpowiedzi. „Jedna litera różnicy” ma placeholdery „1, 2, 3”, które nie mówią, co wpisać. | mp-render.js:296-316 | 10, 38 |
| W4 | P1 | **Kombinuj czat:** composer jest w środku ekranu, a nie przypięty do dołu. Pola „@ tytuł , wykonawca” są wąskie (wykonawca przewija się: „ıdka Suflera”). Pusty feed bez podpowiedzi. Roster ma poziomy scroll z widocznym paskiem. | mp-render.js:478-490, 556-563; index.html:904 | 20, 22 |
| W5 | P1 | **ABCD w MP = „wpisz literę A–D”**: opcje są tekstem w pudełku, nie kaflami do tapnięcia. W hałasie i jedną ręką to krok wstecz względem solo (`.mc-opt`). | mp-render.js:366; mpFormHTML | 45 |
| W6 | P1 | **Lektor:** opis do odgadnięcia jest widoczny tylko w „słuchaj”. W „kombinuj” znika (`mpLyricHTML` tylko w słuchaj), więc nie da się go doczytać przy pisaniu. | mp-render.js:362, 533, 540-546 | 43, 44 |
| W7 | P2 | **Odsłona:** karta utworu z okładką i ✓/✗ per slot jest czytelna. Minusy: przy pudle karta ma **zieloną** ramkę; „na półce: 0” to szum; w Solo „Złożona z głosów: X → tytuł, X → wykonawca” i „odpowiedź drużyny: „— · —”” to redundancja lub śmieć. Rok: dwie różne liczby punktów (slot „+100” bazowe vs baner „+200”). | mp-render.js:679-704 | 14, 15b, 32 |
| W8 | P1 | **Copy formatu Solo/Drużyny** wzięte z coop: „ODPOWIEDŹ DRUŻYNY — wrzućcie i przegłosujcie”, „RANKING DRUŻYN”, „zwycięska drużyna · punkty”, „Złożona z głosów” przy jednoosobowej drużynie. | mp-render.js:318-336, 649, 811-812 | 22, 24, 33 |
| W9 | P2 | **Wynik końcowy:** dobry hero z licznikiem, MVP i „STAWIA KOLEJKĘ”. Brak listy zagranych utworów, share i „to samo jeszcze raz”. Wynik „320” nie ma skali (z ilu?). Ekran nie ma nagłówka ani kodu pokoju. | mp-render.js:797-827 | 17, 33 |
| W10 | P1 | **TV (salon):** to telefonowy layout na TV: `body.salon{max-width:880px}` (index.html:1330), fonty 14–22 px. Brak dużego zegara, dużego nr pytania i QR do dołączenia. TV pokazuje chip „🔈 u hosta”, strzałkę wyjścia i (quiz) przycisk „ODPOWIADAMY →” (TV nie odpowiada). Karty drużyn z live-statusem i ranking na odsłonie to dobry kierunek. „0 typy” (gramatyka). | index.html:1330-1345; mp-render.js:282-295, 521-524 | 36, 39, 40 |
| W11 | P2 | **Ustawienia meczu (nowy ekran):** spójny z design systemem, szybki start działa, blokady trybów z wyjaśnieniem są dobre. Minusy: podsumowanie „60 / s” łamie się w 2 linie; kafle kategorii nie mają nazw dostępnościowych (`button` bez name w a11y tree). | matchSetup.js | 06 |

### Host vs gość — różnice

| Element | Host | Gość | Ocena |
|---|---|---|---|
| Przed meczem | ekran „Nowy mecz” (bez listy graczy) | lobby + szkic na żywo | gość widzi więcej o stole niż host |
| Kombinuj | „ZATWIERDŹ ODPOWIEDŹ/WSZYSTKICH” (pełna szerokość) | „host zatwierdza — albo koniec czasu” | OK w coop, mylące w Solo (F10) |
| Czat | klik w wartość typu = wybór (podpowiedź „kliknij tytuł/wykonawcę = wybierz”) | tylko podgląd | OK, ale wskazówka hosta jest mikroskopijna |
| Odsłona | ten sam ekran + jego „dalej” przesuwa stół | „dalej” lokalny | gość nie wie, że to host steruje tempem |
| Wynik | „REWANŻ 🔁” | „host zaczyna rewanż” | gość bez akcji (nawet „gotowy na rewanż”) |
| Salon | TV bez pól, karty drużyn | telefon jak zwykle | B1: awans gracza na TV |

---

## 3. BŁĘDY (z krokami odtworzenia)

| id | waga | błąd | kroki | gdzie | zrzut |
|---|---|---|---|---|---|
| B1 | **P0** | **Salon: wyjście TV robi z gracza TV.** Awansowany gracz dostaje widok TV (0 pól, „ZATWIERDŹ WSZYSTKICH”, karty wszystkich drużyn), więc jego drużyna nie może odpowiadać. Serwer daje hostowi salonu pełny stan (`if(g.salon && id===this.hostId) return g`), czyli gracz widzi typy rywali. | Drużyny + salon, 3 urządzenia → TV: ← → „Wyjdź” → telefon gracza D1 | mp-render.js:34; authorityRoom.js:242-249, 427 | 42 |
| B2 | **P0** | **320×640: sticky `.mp-foot` (prompt + pola + pewność + emotki + czat) zajmuje ~100% ekranu w kombinuj kolumny.** Roster, odpowiedź drużyny, kolumny i przycisk hosta są pod spodem. | gość 320×640, pytanie quiz/łamigłówka, „odpowiadamy →” | index.html:792; mp-render.js:540-552 | 38 |
| B3 | **P0** | **Czat: skok layoutu → przypadkowy pewniak.** Każda wiadomość lub typ wydłuża feed, a composer, pewność i emotki zjeżdżają w dół. Tap w miejsce emotki trafił w „PEWNIAK ×2”, pewniak bez typu skończył się „Pewniak przepalony — stawia kolejkę”. | skórka czat → wyślij wiadomość → od razu tapnij 😂 w poprzednim miejscu | mp-render.js:556-563; index.html:707-710 | 31, 32 |
| B4 | P0 | **Enter w polach kolumn nie wysyła** (brak `onkeydown`; czat ma). Na telefonie „Idź/Enter” nic nie robi, trzeba sięgać do „WRZUĆ”. | kolumny → wpisz „1986” → Enter | mp-render.js:468-473 | 15 |
| B5 | P0 | **Remis ogłoszony jako wygrana:** 0:0 → „Naczelny Słoik wygrywa!” (pierwszy po sortowaniu). | Solo, nikt nie punktuje | mp-render.js:810-811 | 33 |
| B6 | P0 | **Odsłona „rok”: punkty ucięte** — „dokładnie! · +1” zamiast „+100” (`.rv-slot .v{white-space:nowrap;overflow:hidden}` przycina blok `<small>`). | tryb rok, trafienie dokładne, 375 px | index.html:971; mp-render.js:717 | 15b |
| B7 | P0 | **Powrót w trakcie pytania daje pełne okno słuchania** (15 s), mimo że do końca pytania zostało 12 s. Wracający słucha, a czas mu się kończy. | gość/host: wyjdź → „Wróć do pokoju” lub F5 w połowie pytania | mp-render.js:592-597; mp.js:423 | 27, 30 |
| B8 | P0 | **Ciche niepowodzenie połączenia:** gdy sesja lub WS padną (np. 500 z `/api/session`), lobby pokazuje kod pokoju i „0 osób · czekamy na graczy…” bez błędu i bez retry. Host czeka w nieskończoność. | Worker bez `TOKEN_SECRET` → „Stwórz” | mp.js (transport), mp-render.js:63-91 | — |
| B9 | P1 | **Salon + przydział drużyn:** TV-host jest na liście do przydziału (D2), a drużyna z samym TV jest pusta. Salon można też włączyć i wystartować przy 1 osobie w pokoju (nikt nie gra). Ustawienia salonu i formatu przechodzą do **nowego** pokoju. | Drużyny → włącz salon / nowy pokój po salonie | mp-picker.js:52-62, 103-140 | 35 |
| B10 | P1 | **Nowy gracz po meczu widzi cudzy wynik** („Naczelny Słoik wygrywa!”, „host zaczyna rewanż”) zamiast lobby lub szkicu. | dołącz do pokoju w fazie DONE | mp-render.js:141-162 | 34 |
| B11 | P2 | **„rywale:” wychodzi poza 16 px margines** (host, kolumny, 375). W czacie roster przewija się poziomo z widocznym paskiem. | Solo, host kolumny | index.html:825, 904, 912 | 20, 21 |
| B12 | P2 | Copy: „host losuje utwór…” przy serwerze-autorytecie; „0 typy”; marka „Uszy & Muzk” vs „STACJA” (link do pokoju). | — | mp-render.js:178, 293 | — |
| B13 | P2 | Roster na ekranie „idziesz dalej” pokazuje stan z poprzedniego pytania. | kliknij „dalej” przed hostem | mp-render.js:202 | 16 |

**Działa dobrze (zweryfikowane):** odświeżenie gościa w trakcie pytania wraca do gry automatycznie (zrzut 27); wyjście ma potwierdzenie z „wrócisz jednym tapnięciem” (28); karta „Wróć do pokoju” w menu; host odzyskuje rolę po powrocie; auto-dalej 10 s; pas i pewniak są widoczne w rosterze i feedzie; rywale widzą „✓ odpowiedział(a)” bez treści; ranking z odpowiedziami rywali po zatwierdzeniu.

---

## 4. Benchmarki — co robią lepiej (konkretnie)

| Obszar | Kahoot | Jackbox | Gartic Phone / Skribbl / SongPop | STACJA dziś | Wniosek |
|---|---|---|---|---|---|
| Start pytania | Karta „Question 3 of 15” + treść + pasek 5 s „get ready” na **wszystkich** ekranach, gong | TV: duży tytuł rundy i instrukcja na 2–3 s, telefony „look at the screen” | SongPop: „Round 2/5 · Playlist: 80s” + odliczanie 3-2-1 | pusta ikona „SŁUCHAJ”, nagłówek ukryty | **intro = karta pytania** (numer, kategoria, zadanie, 3-2-1) |
| Zegar | jeden duży zegar fazy odpowiedzi; czerwony dopiero na końcu | zegar na TV, telefon tylko input | Skribbl: jeden zegar rundy na górze | zegar pytania + lokalny pasek słuchania, czerwony od startu | **jeden zegar na fazę**; odpowiedź liczona po słuchaniu |
| Koniec fazy | koniec, gdy **wszyscy** odpowiedzieli | „Everyone’s in!” → od razu dalej | Gartic: „5/6 gotowych” + auto-start | czeka na hosta/timer | **auto-lock przy 100% typów/pasów** |
| Na kogo czekamy | „12/15 answers” | lista awatarów, które jeszcze piszą (wywoływanie po imieniu) | Gartic: szare awatary niegotowych | „gdy wszyscy przejdą dalej” | **lista imion maruderów** |
| Wynik | scoreboard top-5 po **każdym** pytaniu, animowane przetasowanie, „+850” przy nicku | wynik po rundzie z komentarzem | Skribbl: tabela zawsze widoczna z boku; SongPop: punkty za szybkość na żywo | brak wyniku w trakcie; ranking pod foldem | **punkty w nagłówku + mini-tabela co pytanie** |
| Odpowiadanie | 4 kolorowe kafle, 1 tap | duże pola, jedno zadanie na ekran | SongPop: 4 kafle tytułów | ABCD = wpisz literę; pola tekstowe wąskie | **kafle w ABCD; jedno zadanie na ekran** |
| TV | TV = scena, telefon = pilot (tylko kształty) | TV = scena (QR, kod, wielkie fonty), telefon = input | — | telefonowy widok 880 px | **osobny layout TV** |
| Rola hosta | host nie gra (prowadzi) albo gra jak wszyscy, bez przycisku „koniec” w polu | VIP: „Start” i „Skip” w menu, nie w grze | — | host = gracz + przycisk sędziego w środku | **akcje hosta w menu/arkuszu, nie nad polami** |
| Koniec meczu | podium 3-2-1 z dramaturgią, „Play again” 1 tap | „Same players” 1 tap | Gartic: album do udostępnienia | wynik bez listy utworów, rewanż = ustawienia | **„to samo jeszcze raz” 1 tap + lista utworów + share** |

---

## PLAN UPORZĄDKOWANIA

### P0 — błędy i blokery (10)

| # | Zadanie | Koszt |
|---|---|---|
| P0-1 | **Salon: wyjście TV** (B1). Serwer: TV salonu identyfikować osobnym polem `game.tvId` (nie `hostId`); `viewFor` pełny stan tylko dla `tvId`. Gdy TV wychodzi: awans gracza na hosta bez zmiany widoku (klient: `mpIsSalonHost` = `g.tvId===mpMe.id`) albo pauza „TV rozłączony — wróć / graj bez TV”. Test w `server/test`. | M |
| P0-2 | **Niskie ekrany** (B2, F9): sticky tylko wiersz pól + „WRZUĆ” (max ~140 px), prompt quizu nad kolumnami (nie w stopce), emotki i czat pod foldem lub w zwijanym arkuszu. Reguła `@media (max-height:700px)`. Test 320×568 i 375×667. | M |
| P0-3 | **Czat bez skoków** (B3): composer + pewność przypięte do dołu (`position:sticky; bottom:0`), feed o stałej wysokości `flex:1` ze scrollem; pewniak oddzielony od emotek odstępem i z potwierdzeniem „×2 — na pewno?” przy braku typu. | S |
| P0-4 | Enter w polach kolumn = „WRZUĆ”; `enterkeyhint="send"` na ostatnim polu, `"next"` na wcześniejszych (B4). | S |
| P0-5 | Remis w wyniku: „Remis!” + wspólne miejsce w rankingu (B5). | S |
| P0-6 | Odsłona rok: `<small>` w osobnym wierszu (`white-space:normal`), jedna liczba punktów (B6). | S |
| P0-7 | Okno słuchania przy powrocie: `listenDur = min(listenSecs, endsAt-now)`, a gdy zostało <5 s, od razu kombinuj (B7). | S |
| P0-8 | Stan błędu połączenia w lobby: „Nie łączę się z serwerem — spróbuj ponownie” + retry, zamiast „0 osób” (B8). | S |
| P0-9 | Salon: TV-host poza listą przydziału; blokada startu salonu, gdy graczy < 1 (coop) / < 2 (Drużyny); salon i format nie przechodzą do nowego pokoju (B9). | S |
| P0-10 | Dołączający w DONE: lobby + szkic rewanżu zamiast cudzego wyniku; goście po „REWANŻ” widzą szkic na żywo (B10, F13). | S |

### P1 — flow i komunikacja faz (17)

| # | Zadanie | Koszt |
|---|---|---|
| P1-1 | **Nowe intro = „karta pytania”** (projekt niżej) zamiast pustej ikony; scalić „host losuje” + ARMING + intro w jedną scenę (F3, migotanie). | M |
| P1-2 | **Semantyka czasu** (F1, F2): serwer `endsAt = go + LEAD + listenSecs + timer`, w nagłówku jeden zegar bieżącej fazy („🎧 0:12” → „🧠 0:30”). Czerwień tylko ≤5 s. Klient liczy offset zegara z `serverNow` w stanie (anty-skew). | M |
| P1-3 | **Auto-lock przy 100%**: wszyscy obecni gracze mają typ albo pas → serwer zamyka pytanie po 1,5 s grace („Wszyscy gotowi!”) (F4). | S |
| P1-4 | **„Czekamy na: Ola, Kuba”** — awatary maruderów na ekranie po „dalej”, w ARMING i w kombinuj u hosta (F5, B13). | S |
| P1-5 | **Wynik na żywo**: punkty drużyny/moje w nagłówku („⭐ 270”), na odsłonie animowane „+50”, mini-tabela top-3 (Solo/Drużyny) nad CTA (F7). | M |
| P1-6 | **Odsłona mieści się na ekranie**: CTA „DALEJ” sticky na dole; ranking zwinięty do top-3 + „pokaż wszystkich”; credits tylko w coop ≥2 osób (F8, W7). | S |
| P1-7 | **Krótki mecz miesza**: dla 5 pytań QPC=1 (5 slotów z różnymi kategoriami i trybami), jak Stacja dnia (`matchQpc`); albo uczciwe podsumowanie „5 pytań z 1 kategorii”. | S |
| P1-8 | **ABCD w MP = kafle** (reuse `.mc-opt`), tap = propozycja + głos; odpowiedź drużyny = najczęstsza litera (W5). | M |
| P1-9 | **Copy per format** (W8): Solo „Twoja odpowiedź”, „Ranking graczy”, „wygrywa X”; Drużyny „Odpowiedź drużyny”; bez „przegłosujcie”, gdy drużyna ma 1 osobę. | S |
| P1-10 | **Rola hosta w Solo/Drużynach** (F10): „Zakończ pytanie” w menu ⋯ albo dopiero po upływie 50% czasu; z P1-3 przycisk staje się rzadko potrzebny. | S |
| P1-11 | **Toasty ról**: „👑 Jesteś teraz hostem”, „👑 Kuba znów prowadzi”; nazwy graczy zachowane po rejoin (presence → teams) (F11). | S |
| P1-12 | **Lektor**: opis widoczny też w kombinuj (zwijany, nad polami) (W6). | S |
| P1-13 | **Polecenie zadania w fazie słuchania**: pod winylem „Zgadnij ROK wydania” / „Tytuł + wykonawca” / „Wybierz A–D” (F-b). | S |
| P1-14 | **Rail faz czytelny**: aktywna faza z podpisem („🧠 kombinujcie”), 20 px, bez opacity .38; kolor fazy w tle nagłówka (niebieski słuchaj / fiolet kombinuj / zielony odsłona). | S |
| P1-15 | **Czat jako skórka**: composer zawsze na dole, pola tytuł/wykonawca w 2 wierszach na ≤375 px, pusty feed z podpowiedzią „Wpisz typ — trafi do drużyny, nie na czat” (W4). | S |
| P1-16 | **TV jako scena** (W10): layout ≥1280 px (2 kolumny: pytanie + zegar | drużyny), font ×2, QR + kod na lobby i w rogu, ukryć „ODPOWIADAMY”, „🔈 u hosta” i strzałkę (wyjście w menu). | L |
| P1-17 | **Rewanż 1 tap** („Jeszcze raz — te same ustawienia”) + osobne „Zmień ustawienia”; goście „Gotowy ✓” (F13). | S |

#### Projekt docelowy intro faz (P1-1)

Cel: w tym samym budżecie czasu (wspólny LEAD dla równego startu) pokazać **jedną kartę z kontekstem**, a nie pustą ikonę. Rama ekranu (nagłówek z „Pyt. 3/15”, rail, zegar) **zostaje widoczna** przez cały czas.

| Krok | t (ms) | Co widać | Ruch / dźwięk |
|---|---|---|---|
| 0. Losowanie + ARMING | 0 → gotowość | **Karta pytania** wjeżdża od dołu w miejsce treści: duże „PYTANIE 3/15”, pod spodem chip kategorii („1980–89”) i trybu z zadaniem („♬ Zgadnij ROK wydania”), na dole awatary graczy zapalające się, gdy są gotowi („3/4 gotowych”) | slide-up 280 ms `cubic-bezier(.2,.8,.2,1)`; ciche „whoosh” |
| 1. Odliczanie (LEAD) | od `go`: 0–900 | na karcie duże **3 → 2 → 1** (300 ms każda; z `playAt` serwera, nie z czasu odbioru) | scale 1.15→1 + tik na każdą cyfrę; reduced-motion: tylko zmiana cyfry |
| 2. Start | 900 | karta zwija się do paska pod nagłówkiem (zostaje jako tytuł fazy „🎧 Słuchaj · zgadnij rok”), pod nią winyl + jeden zegar fazy | collapse 240 ms; „sting” 0,4 s (ducking pod zajawkę) |
| 3. Słuchaj → kombinuj | przejście | **bez nakładki**: pasek fazy zmienia kolor (niebieski → fiolet) i tekst „🧠 Kombinujcie · 0:30”; pola wjeżdżają od dołu | 200 ms cross-fade; delikatny „pop” |
| 4. Kombinuj → odsłona | lock | 600 ms „werbel” na ekranie z napisem „Sprawdzamy…”, potem flip karty utworu (istniejący `jSlam`) i baner wyniku z „+50” lecącym do nagłówka | flip 340 ms, liczba punktów count-up 500 ms |
| a11y | — | `aria-live="assertive"`: „Pytanie 3 z 15. Kategoria lata 80. Zgadnij rok wydania. Start za 3…” | — |

Budżet: ARMING (zmienny, zwykle <0,5 s) + 900 ms LEAD = bez zmiany względem dziś. Zysk to kontekst zamiast pustki. Dla `quiz` ikona i odliczanie te same, z treścią pytania widoczną już na karcie (jak Kahoot).

### P2 — wizualne dopracowanie (14)

| # | Zadanie | Koszt |
|---|---|---|
| P2-1 | Lobby: usunąć badge „W POKOJU” (zamiast niego „✓ gotów” w przyszłości), pełne imiona na 375 px (W1). | S |
| P2-2 | Host w „Nowy mecz”: pasek z kodem pokoju i awatarami graczy; na desktopie sticky pasek startu w prawej kolumnie (F12, W11). | S |
| P2-3 | Lobby: stała pozycja CTA (lista z max-height/scroll) — bez skoku przy dojściu gracza (F12). | S |
| P2-4 | Roster „rywale:” w marginesie; czat: roster zawijany zamiast poziomego scrolla (B11). | S |
| P2-5 | Kolumny: pusty stan („Wrzućcie pierwszy typ”), kolumny wycentrowane i bez 150 px pustki; placeholdery „słowo 1/2/3” dla łamigłówek (W3). | S |
| P2-6 | Odsłona pudła: czerwona/szara ramka; usunąć „na półce: 0” (pokazywać tylko >0) (W7). | S |
| P2-7 | Słuchaj: domknąć pustą przestrzeń (CTA bliżej winyla, emotki niżej); status „gra…” normalną czcionką; lektor z ikoną głośnika/mikrofonu zamiast winyla (W2). | S |
| P2-8 | Intro w dark mode: etykieta `var(--ink)` → token kontrastowy, ikona bez opacity <.6 w środkowej fazie (F3). | S |
| P2-9 | Copy: „serwer losuje utwór…”/„losuję…”, „0 typów”, podsumowanie ustawień bez łamania „60 s”, jedna marka w linku pokoju (B12). | S |
| P2-10 | Kafle kategorii z `aria-label` (nazwa + zakres) (W11). | S |
| P2-11 | Wynik: lista zagranych utworów z ❤️ „na półkę”, share obrazka, skala („320 / 500”) (W9). | M |
| P2-12 | Deep link `?room=` → od razu dołącz (pytanie tylko o ksywę przy pierwszym wejściu) (F14). | S |
| P2-13 | Przełącznik skórki w grze (⋯ → „Układ: kolumny/czat”) (F15). | S |
| P2-14 | Dźwięki faz: sting startu, „whoosh” karty, werbel przed odsłoną (z duckingiem pod zajawkę, `app/sfx.js`). | S |

---

*Metodyka i ograniczenia:* zegary/latencje mierzone w panelu przeglądarki z dwoma–trzema kartami jednocześnie (karty w tle są dławione, więc pojedyncze opóźnienia stanu do ~1 s mogą być artefaktem). iTunes działał przez lokalny Worker. Fazy rozbudowanej gry (3+ rundy, 4+ graczy, TV 1920 px) nie były grane, a wnioski o skali rosteru i TV pochodzą z kodu i extrapolacji ze zrzutów.
