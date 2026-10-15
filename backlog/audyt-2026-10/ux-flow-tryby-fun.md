# STACJA / „Uszy & Muzk" — audyt produktowy i UX

*Perspektywa: product designer gier imprezowych/quizowych. Benchmarki: Kahoot, Jackbox, SongPop, Heardle, Hitster, Trivia Crack, Spin the Beat.*
*Stan kodu: v51 (app.js:9). Repo czytane wyłącznie (bez edycji). Odwołania `plik:linia` dotyczą stanu na dziś.*

---

## TL;DR

STACJA ma **solidny silnik i kilka naprawdę oryginalnych mechanik** (co-op z głosowaniem na sloty, „pewniak ×2 / stawiasz kolejkę", lektor czytający zagadki, zsynchronizowany start audio u wszystkich, tryb salonowy). Produktowo jest jednak **„konstruktorem meczu", a nie grą**. Żeby usłyszeć pierwszy dźwięk, trzeba coś skonfigurować. Domyślny mecz ma 60 pytań. Punktacja jest zero-jedynkowa, bez czasu, serii i bonusów, choć UI je obiecuje. Nie ma powodu, żeby wrócić jutro (brak wyzwania dnia, serii dni, udostępniania). Do tego 26 paczek wiedzy ogólnej rozmywa muzyczną tożsamość: kostka 🎲 w 56% meczów miesza pytania niemuzyczne.

Największe dźwignie przy najmniejszym koszcie:
1. „Graj teraz” jednym tapnięciem i krótszy mecz.
2. Prawdziwa punktacja (szybkość, seria, częściowe trafienia).
3. Wyzwanie dnia z udostępnialnym wynikiem.
4. Lepszy dobór utworów (hity, a nie losowe ścieżki z dyskografii).
5. Jeden głośnik przy stoliku / w salonie.

---

## 1. FLOW

### Co działa dobrze
- **Menu jest czytelne.** Dwa wielkie CTA, SOLO i ZE ZNAJOMYMI (index.html:1243-1251), w stylu Duolingo z 3D „grubością”.
- **Dołączanie kodem jest zrobione wzorowo.** 4 osobne komórki z auto-przeskokiem, Backspace cofa, wklejenie całego linku wyciąga kod (mp.js:131-150). Kod bez mylących znaków (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, mp.js:61). `navigator.share` z fallbackiem do schowka (mp.js:154-158).
- **Brak tarcia z kontem.** Ksywa losuje się sama (social.js:48-55), nie ma rejestracji ani pola „imię” przed grą.
- **Równy start audio u wszystkich.** Faza ARMING (gotowość/buforowanie) plus wspólny LEAD intra (mp-render.js:83-86) to rzadkość nawet w komercyjnych muzycznych party-games.
- **Ścieżki błędów sieci są obsłużone.** Retry hosta w NETERR/NOLYRIC (mp-render.js:145-157), pasek „łączę ponownie…” (mp.js:64-68), późny dołączający widzi baner „dołączysz od następnego pytania” (mp-render.js:409-411).
- **Solo da się wznowić.** Strzałka „←” w trakcie meczu nie kasuje sesji (mp.js:104-108 tylko stopuje audio), powrót do SOLO wznawia grę.

### Problemy

| # | Waga | Problem | Gdzie |
|---|---|---|---|
| F1 | **wysoka** | **Brak „graj teraz”.** Pierwsze uruchomienie: SOLO → picker z **pustą** pulą (`soloCats=new Set()`, solo.js:33), a podsumowanie wita błędem „zaznacz kategorie i tryby” (core/picker.js:45). Minimalna ścieżka do dźwięku to 4 tapnięcia: SOLO → chip „Dekady” (tylko rozwija pasek, solo.js:173-178) → np. „80” → „Zacznij mecz”. Do tego nowy gracz musi zrozumieć różnicę „chip grupy = rozwiń” i „tick = wybierz”. Kahoot/Heardle: 0–1 tapnięcie. | solo.js:33, 170-183; index.html:1323-1404 |
| F2 | **wysoka** | **Domyślny mecz jest absurdalnie długi.** `soloRounds=4` (solo.js:35, index.html:1385 `class="on"`) × CPR 3 × QPC 5 (core/match.js:5) = **60 pytań**. Przy ~30 s zajawki i ~15 s pisania to 40–50 min solo, a w MP z intrami jeszcze dłużej. Mobilny trening „w tramwaju” to 5–10 pytań. Brak też wyboru długości w pytaniach (tylko rundy 1–4, a minimum to 15 pytań). | solo.js:35; core/match.js:5; mp-picker.js:15 |
| F3 | **wysoka** | **Kostka 🎲 miesza wiedzę ogólną.** `randomPools` losuje tryby z `ALL_MODES` łącznie z `quiz`, a pula `ALL_KEYS` to ~28 kategorii muzycznych + 26 paczek quizu (core/match.js:46-51). Symulacja 20k losowań: **56% meczów zawiera pytania niemuzyczne, 30% wszystkich slotów to wiedza, 8% meczów jest w całości niemuzycznych** (np. „Kosmetyki i uroda”). Pierwszy „🎲 + Zacznij” w apce muzycznej może więc zadać pytanie o Marvela. | core/match.js:46-51; app/catalog.js:24-25 |
| F4 | średnia | **Lobby MP odwraca kolejność z projektu.** Host w poczekalni widzi „ZACZNIJ →”, które *nie startuje* gry, tylko otwiera picker „Ułóż mecz” (mp-render.js:47-48, mp.js:160). Goście w tym czasie widzą tylko „czekamy, aż host ułoży mecz…”: bez ustawień, statusu gotowości i dźwięku. Projekt 06-lobby pokazuje ustawienia meczu gościom, stan „GOTOWY/GOTOWA” i CTA „ZACZNIJ — CZEKAM NA 1 OSOBĘ”. | mp-render.js:34-59; _designref/ekrany/06-lobby.html |
| F5 | średnia | **Deep-link `?room=` tylko wypełnia kod**, gracz musi jeszcze trafić „DOŁĄCZ” (mp.js:40-43). Przy linku wysłanym na Messengerze to zbędny krok; Jackbox po linku od razu pyta tylko o imię. | mp.js:40-43, 138-145 |
| F6 | **wysoka** | **Wyjście z meczu MP bez potwierdzenia i bez powrotu.** Strzałka w nagłówku gry (`mp-hd-back`, mp-render.js:348) i „wyjdź” w lobby (mp-render.js:52) od razu wołają `mpLeave()` (mp.js:110-124). Kod pokoju jest zerowany, nie ma „wróć do pokoju ABCD”. Przy stoliku w pubie przypadkowe tapnięcie kciukiem w lewym górnym rogu wyrzuca z meczu. W trybie relay wyjście hosta zatrzymuje grę (mp.js:190-193). | mp-render.js:348, 52; mp.js:110-124 |
| F7 | średnia | **Mecz MP blokuje się na najwolniejszym.** Pytanie startuje dopiero, gdy *wszyscy* zgłoszą gotowość („brak twardego timeoutu”, mp.js:~560). Nie-host zgłasza ją dopiero po swoim „dalej” na odsłonie (mp.js:325-339). Jedna osoba, która poszła do baru, wstrzymuje stół. Brakuje auto-dalej po X s i „kick/pomiń gracza” u hosta. | mp.js:325-339, 555-563 |
| F8 | średnia | **Zatwierdzenie odpowiedzi drużyny to maleńki ✓ (36 px) u hosta** (mp-render.js:217; index.html:761). W projekcie 07 to pełny przycisk „ZATWIERDŹ (host)”. Przy timerze „bez” (mp-picker.js:102) host jest jedynym zegarem, a inni nie wiedzą, na co czekają. | mp-render.js:217 |
| F9 | średnia | **Intra faz kosztują ~7 s na pytanie.** Każda faza (słuchaj → kombinujcie → odsłona) ma ikonę na ~2,3 s plus wyjście (mp-render.js:298, 313-315), także przy reduced-motion (statycznie). Przy domyślnych 60 pytaniach to **~7 min samych intr**. Rytm Kahoota to ~1 s „get ready”, a dalej plansza. | mp-render.js:280-317 |
| F10 | średnia | **Komunikaty błędów pisane dla dewelopera.** „Jeśli to podgląd — otwórz jojogurt.github.io/stacja na telefonie” (solo.js:231). „Dodaj songs[] z polem lyric w categories.js” (solo.js:292). „Brak pliku categories.js obok index.html” (solo.js:94). „(prześlij mi ten komunikat)” (social.js:140). | solo.js:94, 231, 292; social.js:140 |
| F11 | średnia | **Brak trybu offline jako ścieżki.** Quiz i lektor (pre-gen/systemowy TTS) działają bez sieci, a SW cache’uje shell (sw.js). Gdy iTunes nie odpowiada, apka pokazuje tylko błąd i nie proponuje „zagraj w lektora/wiedzę offline”. W tramwaju i metrze to częsty stan. | solo.js:227-234 |
| F12 | niska | **Nagłówek mówi „Ułóż mecz” w trakcie gry** po powrocie z menu do trwającego solo: `showScreen('solo')` ustawia `SCR_HEAD.solo` (social.js:23-27), a nie runda/kategoria. Menu nie pokazuje też „Kontynuuj mecz”, więc gracz nie wie, że coś trwa. | social.js:23-27; solo.js:403-408 |
| F13 | niska | **Puste stany częściowo nieprzyjazne.** „Twoje” pokazuje 10-pikselowe „brak — kliknij „+ ze Spotify"” (solo.js:101), a kreatora „+ nowa” (lepszej ścieżki) nie ma w pickerze MP (mp-picker.js:90). „Brak rozegranych pytań solo” w profilu nie ma CTA (social.js:315), choć projekt 13 je ma. | solo.js:101; mp-picker.js:90; social.js:315 |
| F14 | niska | **Ustawienia (skórka MP, motyw, dźwięki) leżą na ekranie menu** (index.html:1253-1275). Nowy gracz musi wybrać „Układ gry ze znajomymi: kolumny/czat”, zanim zobaczył którykolwiek. To decyzja bez kontekstu; lepiej przełącznik w grze albo ⚙️. | index.html:1253-1261 |

### Rekomendacje (FLOW)
- **R-F1 „Graj teraz” (S).** Trzecia karta albo duży przycisk w hero: 10 pytań z „hitów PL+świat”, tryb muzyka, bez pickera. Pierwszy dźwięk po 1 tapnięciu. Picker zostaje jako „Własny mecz”. Domyślnie zaznaczyć ostatnio używaną pulę (localStorage) zamiast pustej.
- **R-F2 Długość meczu w pytaniach (S).** Segment „Krótki 5 / Standard 15 / Pełny 30” zamiast „rundy 1–4”. Domyślnie 15 (1 runda). W `core/match.js` dodać `buildMatch(..., {questions})`; QPC może zostać 5.
- **R-F3 Kostka tylko w obrębie muzyki (S).** `randomPools(ALL_KEYS.filter(k=>kind!=='quiz'))` i `ALL_MODES.filter(m=>m!=='quiz')`. Wiedza wyłącznie świadomym wyborem.
- **R-F4 Lobby z projektu 06 (M).** Host układa mecz *w lobby* (picker jako arkusz), goście widzą podsumowanie ustawień i swój status. CTA hosta: „ZACZNIJ (4/4 gotowi)”. Goście w poczekalni mogą słuchać „rozgrzewki” (np. 3 zajawki bez punktów).
- **R-F5 Auto-join z linku (S):** `?room=` przy znanej ksywie od razu wchodzi do pokoju. **R-F6 Potwierdzenie wyjścia + „Wróć do pokoju ABCD” (S):** zapisać `lastRoom` w sessionStorage i pokazać baner w menu.
- **R-F7 Auto-dalej (S):** po odsłonie licznik 8 s → auto-ack. U hosta „pomiń czekających”.
- **R-F9 Intra (S):** 2,3 s → 0,8 s; intro tylko przed „słuchaj”, „kombinujcie” bez ikony.
- **R-F10 Copy błędów (S):** przepisać na język gracza. Offline: „Brak internetu — zagraj w Lektora albo Wiedzę (działają offline)” plus przycisk.

---

## 2. UI

### Co działa dobrze
- **Spójny design system Duolingo-like.** Nunito 600–900, zmienne kolorów (index.html:26-44), przyciski 3D z „grubością” i wciśnięciem, ikony Phosphor-bold jako inline SVG (spójny zestaw zamiast mieszanki emoji w nawigacji).
- **Solo w grze ma mocny moment wizualny.** Ciemna karta decku z equalizerem i pierścieniem postępu na gałce (index.html:903-911). Nagłówek odsłony zielony/żółty/czerwony z „Dobrze! / Prawie! / Pudło” i 🔥 serią (solo.js:499-507). ABCD koloruje poprawną na zielono, a błędny wybór na czerwono (solo.js:537-541).
- **Juice istnieje:** confetti i oklaski przy trafieniu, flip karty odsłony MP (index.html:79-80), licznik wyniku końcowego „bije” od 0 (mp-render.js:546-558), pulsujący timer na ostatnich 5 s (index.html:83), latające emotki z ksywą.
- **A11y ma porządny fundament.** `aria-live` na stanie decku i countdown, `prefers-reduced-motion` globalnie (index.html:90-92), kandydaci jako `<button>`, kontrast `--muted` podniesiony do #767676.
- **Ciemny motyw istnieje** (index.html:1093+) i ustawia się przed renderem bez mignięcia (index.html:1234).

### Problemy

| # | Waga | Problem | Gdzie |
|---|---|---|---|
| U1 | **wysoka** | **Mikrotypografia w pubie.** W CSS jest **75 deklaracji fontu 8–11 px**, m.in. podpisy ticków kategorii 9 px uppercase (index.html:122), etykiety pól „TYTUŁ/WYKONAWCA” 11 px (index.html:225), stan decku 12 px uppercase (index.html:204), etykiety odsłony 9 px (index.html:271), „TOP” 9 px (index.html:748), przyciski „↻ od nowa / ↷ pomiń” 11 px (index.html:213), pewniak/pas 11 px (index.html:728). Ciemny pub plus telefon na stole w odległości ramienia oznacza minimum 13–14 px na treść i 16+ px na akcje. | index.html (75×) |
| U2 | **wysoka** | **Feedback po odpowiedzi nie mówi, co było źle (muzyka solo).** `line(ok,'Tytuł',current.track)` (solo.js:486-489) pokazuje tylko poprawną wartość i ✓/✗, bez echa tego, co gracz wpisał. Projekt 04 ma „teen spirt — ✓ literówka OK” i „1992 — ±2 zalicza”, co uczy, jak działa tolerancja dopasowania. Quiz otwarty pokazuje „(Ty: …)” (solo.js:547), muzyka nie. | solo.js:484-496 vs _designref/04 |
| U3 | **wysoka** | **Obiecane bonusy nie istnieją.** Pola „Rok — bonus / Album — bonus” (index.html:1442-1443) i stopka „year/album = bonus” sugerują punkty, ale `roundOk = okTitle && okArtist` (core/scoring.js:101), a wynik solo to liczba pełnych trafień (solo.js:480, core/matchRecord.js:7). Rok i album nic nie dają. Projekt 04 ma „+30” i „+5 bonus do serii”. To łamie zaufanie. | index.html:1442; solo.js:480 |
| U4 | średnia | **Brak dźwięku porażki, odliczania, „ding” odsłony.** sfx.js ma tylko `click` i `clap` (sfx.js:7). Pudło jest ciche, timer cichy, nowe pytanie bez „stingu”. W party-games dźwięk to 50% emocji (Kahoot: muzyka lobby, tik-tak, gong). Uwaga: klik i SFX muszą być wyciszane w trakcie zajawki, żeby nie zagłuszać utworu. | app/sfx.js |
| U5 | średnia | **Odkrywalność kategorii.** Ticki są w poziomym scrollu z **ukrytym scrollbarem** (`scrollbar-width:none`, index.html:117-118). 26 paczek „Wiedza” czy 9 stylów w jednym rzędzie bez wskaźnika, że jest więcej, zachęca do wybierania tylko tego, co widać. | index.html:117-118, 1047 |
| U6 | średnia | **Słaby kontrast nieaktywnych chipów.** `.grp-chip` ma kolor #b3aea4 na białym (index.html:1037), ok. 2,2:1. To tekst nawigacyjny kategorii, czyli rzecz kluczowa. Podobnie „▲ głosy” nie-TOP #bdb8ae (index.html:744). | index.html:1037, 744 |
| U7 | średnia | **Dark mode tylko ręczny i niepełny.** Brak `prefers-color-scheme` (tylko klasa `html.dark` z localStorage, index.html:1234). Kolory stanu rostera są hardkodowane w JS (`ROSTER_META`, mp-render.js:161-167), podobnie baner błędu (social.js:69, `#FFF1F1`) i białe tła w kilku komponentach (`.mp-seg`, `.dn-menu`, `.mp-cand`: index.html:728, 893, 737). W pubie wieczorem dark powinien być domyślny albo „systemowy”. | index.html:1234; mp-render.js:161-167 |
| U8 | średnia | **Projekt kontra implementacja: rozjazdy, które bolą.** (a) Brak paska postępu zajawki 0:12/0:30 i „nie wiem — pomiń ›” pod CTA (03). (b) Brak punktów na odsłonie (04, 09). (c) Usunięty rail faz (mp-render.js:273-275), a w projekcie 07/08/09 to główna orientacja „co teraz”; intro go nie zastępuje, bo znika. (d) Brak poziomu „niepewny” (brief: 3 poziomy pewności; implementacja tylko pewniak/pas, mp-render.js:225-232). (e) Brak „🔒 audio tylko w fazie słuchania”. (f) Brak nazwy drużyny w nagłówku MP („🍺 The Beerles”). | mp-render.js:273-275, 225-232, 344-358 |
| U9 | średnia | **Dwie marki.** UI, `<title>` i manifest: „Uszy & Muzk” (index.html:8, 1245; manifest). Udostępnienie pokoju: „STACJA — dołącz do pokoju” (mp.js:156). Docs i projekt: STACJA. Znajomy dostaje link „STACJA”, a otwiera się „Uszy & Muzk”, co wygląda na phishing lub pomyłkę. | index.html:8; mp.js:156; manifest.webmanifest |
| U10 | średnia | **Treści nieodpowiednie dla części kontekstów.** Reakcja 🖕 na stałe w pasku emotek (mp-render.js:19). Losowe ksywy typu „Analny Korsarz”, „Dua Cipa”, „Mokra Włoszka”, „Łóżkowy Sprinter” (social.js:35-45) przypisywane **automatycznie** nowemu graczowi, także w meczu „rodzinnym” czy firmowym. Humor jest atutem, ale musi być opt-in. | mp-render.js:19; social.js:35-45 |
| U11 | niska | **Ikonografia emoji vs SVG niespójna w MP.** Nawigacja i chipy są w SVG, ale pewniak to 🟡, pas ✋, roster „🟡 pewniak”, a legenda czatu ma 🤚, nie ✋ (mp-render.js:320 vs 230). | mp-render.js:165-166, 230, 320 |
| U12 | niska | **Odznaki „1 / 12” to placeholder.** Definicje są 4, jedna zawsze zablokowana „—” (social.js:318-321). Licznik /12 obiecuje coś, czego nie ma. `acc` jest liczone i nieużywane (social.js:298). „Najlepsze kategorie” są sortowane po liczbie pytań, nie po skuteczności (social.js:309). | social.js:298-332 |
| U13 | niska | **Intra MP grają przy reduced-motion** (świadomie, dla równego startu, mp-render.js:83-86). OK, ale 2,3 s pustego ekranu dla czytnika ekranu bez `aria-live` z nazwą fazy. | mp-render.js:300-317 |

### Rekomendacje (UI)
- **R-U1 Skala typograficzna „pub mode” (S).** Minimum 13 px dla podpisów i 15 px dla akcji. Etykiety pól 13 px. Stan decku 15 px bez uppercase. Przyciski mini min. 44×44 px. Jeden przegląd CSS i zamiana 75 miejsc na 3–4 tokeny (`--fs-xs/sm/md`).
- **R-U2 Odsłona edukacyjna (S).** Wiersz: *twoja odpowiedź → poprawna*, plus tag „literówka OK”, „brak »feat.« OK”, „rok ±2”. Te dane już są (`g` w solo.js:478, `evaluateGuess`). To tani sposób, żeby gracz zaufał tolerancji i nauczył się pisowni.
- **R-U3 Uczciwe bonusy (S).** Albo punkty (tytuł 1, wykonawca 1, rok ±2 = +1, album = +1, seria ×1,5), albo usunąć słowo „bonus”. Patrz sekcja 4.
- **R-U4 Paczka 5 SFX (S):** pudło (krótki „bzzt”), tik ostatnich 5 s, „ding” odsłony, fanfara końca, „whoosh” intra. Duck pod zajawkę.
- **R-U5 Siatka zamiast scrolla (S)** dla pasków z ponad 6 elementami (`flex-wrap` albo 2 rzędy), z licznikiem „+12 więcej”.
- **R-U7 Motyw „Systemowy” jako domyślny (S)** plus migracja hardkodów kolorów z JS do zmiennych CSS.
- **R-U8 Przywrócić kompaktowy rail faz (S)** (3 kropki: 🎧 · 🧠 · 👁) w nagłówku MP, a intro skrócić (R-F9).
- **R-U9 Jedna marka (S):** zdecydować STACJA albo Uszy & Muzk i ujednolicić share/manifest/title.
- **R-U10 „Tryb rodzinny” domyślnie WŁ (S):** pula ksyw neutralno-zabawnych domyślnie, „pikantne” jako opt-in w ustawieniach, 🖕 zamienić na 🍺 lub 💪 (jak w projekcie 07).

---

## 3. TRYBY

### Inwentarz (stan obecny)

**Typy pytań (`ALL_MODES`, core/match.js:6):**
| Tryb | Co słyszysz/widzisz | Odpowiedź | Źródło |
|---|---|---|---|
| ♪ muzyka | 30-s zajawka iTunes | tytuł + wykonawca (+rok/album „bonus” w solo) | dekady/style (pule wykonawców), playlisty, „Twoje” |
| 🔄 od tyłu | zajawka odwrócona (Web Audio) | jw. | jw. |
| ✂️ fragment | 2 s z losowego miejsca (core/timing.js:5, 23-31) | jw. | jw. |
| 🗣 lektor | TTS czyta autorski opis/zagadkę (lyrics.js), też „EN dla polskiego hitu / PL dla światowego” | tytuł + wykonawca | 6 kategorii tekstów + `hits-now` (5 piosenek) |
| 🧠 wiedza (quiz) | treść pytania | ABCD (~26%) albo otwarte 1..N slotów (~74%) | 26 paczek, ~2300 pytań |

**Formaty MP (mp-picker.js:104):** Wspólna (co-op: jedna drużyna, sloty z głosowaniem, pewniak ×2), Solo (każdy sam, ranking), Drużyny (2–4, ręczny przydział).
**Warianty prezentacji:** skórka kolumny / czat (per gracz), tryb salonowy TV (tylko co-op), timer bez/30/60/90.
**Meta:** trener „częściej pytania, które oblałeś” (**tylko quiz solo**, solo.js:322-330), kreator własnych kategorii (catEditor.js), import playlisty Spotify, drużyny i znajomi, profil ze statystykami.

### Ocena różnorodności
- **Naprawdę różne doświadczenia (3):**
  - *rozpoznawanie audio*: muzyka i od tyłu (od tyłu to realnie inna łamigłówka);
  - *zagadka słowna* (lektor): inna kognitywnie, oryginalna, mocny wyróżnik;
  - *co-op z głosowaniem i pewniakiem kontra rywalizacja*: inna dynamika społeczna.
- **Wariacje tego samego:**
  - *fragment 2 s* to „muzyka, tylko trudniej”, bez progresji; losowy start bywa ciszą lub intrem;
  - *kolumny/czat* to dwa UI tego samego stanu i decyzja dla gracza, nie mechanika;
  - *salon* to prezentacja, nie tryb.
- **Ciało obce:** *wiedza ogólna* to osobny gatunek (Trivia Crack) wpięty w muzyczny silnik. Patrz sekcja 6.
- **Brak całych osi, które definiują gatunek:**
  1. **czas/szybkość** (Kahoot, SongPop: im szybciej, tym więcej punktów);
  2. **progresja ujawniania** (Heardle 1-2-4-7-11-16 s);
  3. **odpowiedź tapnięciem** dla muzyki: wszystko wymaga pisania na klawiaturze, co w głośnym pubie i dla rodziny jest barierą (SongPop i Kahoot to 4 kafle);
  4. **oś czasu / rok** (Hitster, najpopularniejsza muzyczna gra imprezowa ostatnich lat);
  5. **dzienne wspólne wyzwanie** (Heardle/Wordle).

### Propozycje nowych trybów i mechanik

Koszt: S ≤1 dzień, M 2–4 dni, L ponad tydzień przy obecnej architekturze (`core/` czysty + `app/` + DO). Priorytet: P1 (zrobić w najbliższym kwartale) … P3.

| # | Tryb / mechanika | Opis | Dlaczego fun | Implementacja w STACJA | Koszt | Prio |
|---|---|---|---|---|---|---|
| 1 | **Intro 1-2-4-8 s („Heardle”)** | Zajawka odsłania się etapami 1→2→4→8→16 s. Zgadujesz w dowolnym momencie; im wcześniej, tym więcej punktów (5/4/3/2/1). Pominięcie odsłania kolejny etap. | Najczystsze napięcie „wiem/nie wiem”, natychmiast zrozumiałe, świetnie pasuje do share’a (🟩⬛⬛). | Nowy mode `intro` w `ALL_MODES`. Etapy jako stała w `core/timing.js` (obok `SNIP_SECS`). Ocena „w którym etapie” w `core/scoring` (czyste). Audio: reuse `startSnippet` z `snipStart=0` i rosnącym limitem (audio.js:67-81). MP: etap jako pole stanu w reducerze. | M (solo S) | **P1** |
| 2 | **Wyzwanie dnia „Stacja dnia”** | Codziennie te same 10 utworów dla wszystkich (seed = data). Jedna próba, wynik jako siatka emoji do skopiowania („STACJA #142 🟩🟩🟨⬛🟩… 7/10 🔥12”). | Główna pętla retencji Wordle/Heardle; darmowy marketing przez udostępnienia; seria dni. | `buildMatch` jest deterministyczny przy wstrzykniętym `rnd` (backlog/plan-rozwiniecia…: „ten sam seed ⇒ ten sam mecz”). MVP bez serwera: seed z daty plus kuratorowana pula z zapisanym `preview`/`trackId` (jak `songs` w playlists.js). Seria w localStorage, share przez `navigator.share`. Później ranking dnia przez istniejący `record_match`. Kart „Wyzwanie dnia” jest już w projekcie 01. | M | **P1** |
| 3 | **Szybkie ABCD dla muzyki** | Zamiast pisać: 4 kafle z tytułami (dystraktory z tej samej kategorii lub wykonawcy). Opcjonalnie drugi etap: wykonawca ABCD. | Działa w hałasie, jedną ręką, dla dzieci i seniorów; tempo jak Kahoot/SongPop. | Dystraktory z wyników `itunes(artist)` (i tak pobieranych, trackSelect.js:58-72) albo z innych `songs` kategorii. Render reuse `.mc-opt` (solo.js:367-370). W MP: slot ABCD już obsługiwany w odsłonie quizu (mp-render.js:515-520). | S–M | **P1** |
| 4 | **Punkty za szybkość + seria (mechanika)** | `pkt = baza × (0,5 + 0,5·pozostały_czas)`, seria 3+ daje ×1,5, 5+ daje ×2. W Solo/Drużyny MP „pierwsza poprawna drużyna +bonus”. | Napięcie przy każdym pytaniu; komentarze „byłem pierwszy!”; daje sens timerowi. | Czysta funkcja w `core/scoring.js` + pola w `evaluateAnswer` (mpReducer.js:180-192 już liczy `firstBy`). Autorytet zna `endsAt`. | S | **P1** |
| 5 | **Odgadnij dekadę / rok na osi (Hitster-lite)** | Słyszysz utwór i stawiasz go na osi czasu: rok ±0 = 3 pkt, ±2 = 2, właściwa dekada = 1. Wariant drużynowy: budujecie wspólną oś z poprzednich kart (Hitster). | Grają wszyscy, także ci, którzy nie znają tytułów. Wiedza „feelingowa” daje świetne kłótnie przy stole. | Slider roku zamiast pól tekstowych (nowy slot `year`). `yearMatch` już jest (core/scoring.js:91-93). **Warunek: wiarygodny rok** (obecny `releaseDate` z iTunes to często data remasteru/kompilacji, trackSelect.js:43). Potrzebna kuratorowana pula z rokiem oryginału. | M (z danymi L) | **P1** |
| 6 | **Jeden głośnik / pilot** | Tryb „stolik”: gra tylko telefon hosta (albo TV), pozostali są pilotami bez audio. Rozszerzenie salonu na formaty Solo/Drużyny. | W pubie 4–6 telefonów z lekko przesuniętą zajawką to kakofonia; jeden głośnik = prawdziwy pubquiz. Jackbox udowodnił model „TV + telefony”. | Flaga `audioHostOnly` w stanie gry; w `mpAfterSync` (mp.js:274-279) pominąć `mpPlayLocal()` u nie-hosta. **Dziś nawet w salonie telefony też grają** (brak warunku w mp.js:270-279/418-440). Zdjąć blokadę „salon tylko co-op” (mp-picker.js:18-23). | S | **P1** |
| 7 | **Jokery** | 1 na mecz na gracza/drużynę: 50/50 (ABCD), „pierwsza litera tytułu”, „drugi odsłuch” (w MP audio tylko w fazie słuchania), „kradzież” (Drużyny: przejmij punkty za cudzą błędną odpowiedź). | Decyzje taktyczne, comeback mechanics, momenty „ha!”. | Akcje w `mpReducer` (wzór `sure`/`pass`, mpReducer.js:93-105). Render przycisków jak `mpConfHTML`. | M | P2 |
| 8 | **Playlist battle** | Każda drużyna przynosi własną kategorię (kreator już jest), rundy naprzemiennie: drużyna A zgaduje playlistę B. Bonus dla autora, gdy rywale polegną. | Personalizacja i trash talk („wasze wesele to same disco polo”); wykorzystuje świeży edytor B-MVP. | Format `teams` + przypisanie kategorii do drużyny w pickerze. `mpBuildPools` już wysyła własne kategorie (mp-picker.js:165-186). Sloty „kto zgaduje” w `buildMatch`. | M | P2 |
| 9 | **Kto śpiewa — duet / feat.** | Utwory z 2+ wykonawcami; punkt za każdego, bonus za komplet. | Wykorzystuje świeże `artistMatch` (core/scoring.js:83-88), uczy ft-ów, które często padają na pubquizach. | Filtr `artist` z separatorami w puli + `answerSlots` [wyk.1, wyk.2]. Sloty N już działają (mpReducer). | S | P3 |
| 10 | **Nagła śmierć / ostatni na placu** | Format Solo MP: kto się pomyli, odpada; ostatni wygrywa. Odpadnięci zostają kibicami z emotkami. | Finałowa runda z napięciem; idealna na koniec wieczoru; świetna na TV. | Pole `alive` per gracz w stanie gry + render; reuse rankingów. | M | P2 |
| 11 | **Łańcuch artystów** | Odpowiedź musi „połączyć się” z poprzednią (wspólny feat., ten sam zespół, ta sama dekada). Wariant prosty: następny wykonawca na ostatnią literę. | Kreatywność, rozmowa; dobre na Discord. | Walidacja powiązań wymaga danych (MusicBrainz) albo wersji literowej (czysta, S). | L (literowa S) | P3 |
| 12 | **Dokończ tekst** | Lektor czyta pół wersu, gracze dopisują resztę (1–3 słowa, slot „3 słowa” jest w briefie). | Klasyk pubquizów i karaoke; świetne przy alkoholu. | Technicznie S (sloty + `textMatch`). **Ryzyko prawne:** dosłowne teksty są chronione (lyrics.js celowo używa autorskich opisów). Tylko z licencją albo dla domeny publicznej / własnych kategorii. | S tech / ryzyko | P3 |

---

## 4. FUN / RETENCJA

### Pętla rdzeniowa dziś
`ułóż mecz → słuchaj → wpisz → ✓/✗ → (×60) → wynik X/60 → koniec`. Brak nagrody zewnętrznej i brak „następnego celu”.

### Co działa dobrze
- **Pewniak ×2 i „STAWIA KOLEJKĘ 🍺”** (mp-render.js:474-475, 568-569) to najlepsza mechanika w apce: realne stawki ze świata pubu, humor i decyzja ryzyka. Plus „MVP stołu” (mp-render.js:567).
- **Co-op z głosowaniem na sloty** (najlepsze pola od różnych osób) sprzyja rozmowie; to inne niż typowe „każdy sam”.
- **Humor w ksywach** (social.js:35-45) i kopie typu „odbiór na żywo 😏” budują ton.
- **Trener słabych pytań** (solo.js:322-330, 572-586) to dobry zalążek nauki.

### Problemy

| # | Waga | Problem | Gdzie |
|---|---|---|---|
| R1 | **wysoka** | **Brak powodu, żeby wrócić jutro.** Nie ma wyzwania dnia, serii dni, poziomów/XP, celów tygodniowych ani powiadomień. Projekt ma „🔥 7” w menu, „Wyzwanie dnia” (01), „seria 7 dni”, „Liga Złota” (11, 12). Z tego nic nie wdrożono. `/api/league` istnieje w adapterze (adapters-web/cf.js:66), ale nie ma żadnego UI (zakładka Liga zastąpiona przez Drużyna). | _designref/01, 11, 12; cf.js:66 |
| R2 | **wysoka** | **Punktacja zero-jedynkowa bez emocji.** Solo: trafienie = tytuł **i** wykonawca, a sam tytuł daje 0 (`±` tylko w podsumowaniu, solo.js:458). MP: `gained = teamOk ? (anySure?2:1) : 0` (mpReducer.js:183). Nie ma czasu, serii jako mnożnika ani częściowych punktów. Seria 🔥 jest tylko wyświetlana (solo.js:506). Timer wpływa wyłącznie na auto-lock. Wynik końcowy to mała liczba (np. 9), a nie „680” jak w projekcie 10. | core/scoring.js:101; mpReducer.js:183 |
| R3 | **wysoka** | **Trener nie trenuje muzyki.** „Częściej pytania, które oblałeś” działa wyłącznie dla quizu wiedzy (`mode==='quiz' && current.statKey`, solo.js:532; etykieta „quiz · solo”, index.html:1393). Główny use case z README („nauka tytułów i wykonawców przed pubquizem”) nie ma powtórek rozłożonych w czasie ani listy „Twoje pudła”. | solo.js:322-332, 532 |
| R4 | **wysoka** | **Rytm meczu za wolny i za długi.** 60 pytań domyślnie (F2) plus ~7 s intr (F9) plus czekanie na najwolniejszego (F7). Bez przerw i „half-time” (np. tabela po każdej rundzie). Kahoot: 10–15 pytań, ~20 s każde, tabela co pytanie. | core/match.js:5; mp-render.js:298 |
| R5 | średnia | **Brak udostępniania wyniku.** Ekrany końcowe solo (solo.js:445-469) i MP (mp-render.js:586-589) nie mają share’a, obrazka wyniku, „wyzwij znajomego na ten sam mecz” ani listy utworów meczu w MP (do dosłuchania i nauki). | solo.js:445-469; mp-render.js:560-590 |
| R6 | średnia | **Profil bez progresji.** 3 liczby (mecze/trafne/punkty), kategorie i 3 realne odznaki (social.js:318-320). Nie ma poziomu, „następnej odznaki za X”, „% trafień w tym tygodniu vs poprzednim” ani „najsłabszej dekady → zagraj trening”. | social.js:289-334 |
| R7 | średnia | **Odtwarzanie bez limitu w solo.** „↻ od nowa” i ponowny „fragment 2 s” są nielimitowane (audio.js; solo.js:244). Tryb „fragment” traci sens, bo można słuchać 2 s w kółko. | app/audio.js; solo.js:244 |
| R8 | niska | **Odsłona MP nie mówi, kto co wniósł.** Projekt 09: „Złożona z głosów drużyny: kaśka → tytuł, mati_dj → wyk.”. Implementacja: tylko `firstBy` (mp-render.js:476). Mniej uznania dla graczy. | mp-render.js:473-477 |

### Co sprawi, że gracz wróci jutro (rekomendacje)
1. **Stacja dnia** (tryb #2) z serią dni 🔥 w menu i siatką do udostępnienia. Jedna rzecz, która robi 80% retencji Wordle/Heardle.
2. **Prawdziwa punktacja** (tryb #4): szybkość + seria + częściowe (tytuł 1, wykonawca 1, rok/album +1). Liczby rzędu setek, „+30” na odsłonie jak w projekcie 04.
3. **„Twoje pudła” jako kategoria** (M): każdy nietrafiony utwór solo trafia do lokalnej talii z powtórkami 1-3-7 dni (Leitner). W menu „5 utworów do powtórki dziś”. Reuse `stacjaQuizStats` (solo.js:573-580), kluczem `norm(track)+artist`, plus `preview` do odtworzenia.
4. **Mini-tabela co rundę w MP** (S): po 5 pytaniach 3-sekundowy „half-time” z rankingiem i „kto prowadzi”. Daje rytm i comeback.
5. **Share wyniku i „wyzwij”** (S–M): obrazek/siatka plus link `?challenge=seed`, czyli ten sam mecz u znajomego (asynchroniczny Pub Night z backlogu w wersji „lite”, bez serwera, przez seed).
6. **Odznaki, które coś znaczą** (S): „Seria 10 w meczu”, „Pewniak ×5”, „Wszystkie dekady 70%+”, „Od tyłu — 3 z rzędu”, „Stawiałeś kolejkę 3×”. Dane już są w `matches`/`answers`.
7. **Liga tygodniowa** (M): API jest. Wystarczy ekran z projektu 12, choćby wśród znajomych i drużyny.

---

## 5. USE CASES

| Scenariusz | Ocena | Co działa | Braki (konkretnie) |
|---|---|---|---|
| **Nauka przed pubquizem, sam w tramwaju** | **3/5** | Solo, tolerancyjne dopasowanie (literówki, diakrytyki, feat.), lektor offline, PWA instalowalna | Brak „graj teraz” (F1). Mecz za długi (F2). **Brak powtórek pudeł dla muzyki** (R3). Dekady to losowe utwory artysty, nie hity dekady (sekcja 6, T2). Brak „szybkiej odpowiedzi” jedną ręką (ABCD, tryb #3). Offline nie proponuje lektora/wiedzy (F11). Transfer danych: 30-s zajawki × 60. |
| **Rozgrzewka drużyny przy stoliku przed pubquizem** | **2,5/5** | Kod 4-znakowy, co-op z głosowaniem i pewniakiem (bardzo w duchu pubquizu), „stawia kolejkę” | **Każdy telefon gra audio** (kakofonia w hałasie, tryb #6). Pisanie na klawiaturze w głośnym, ciemnym miejscu, małe fonty (U1). Wolny rytm (F9, R4). Wyjście jednym tapnięciem (F6). Host musi tapnąć mały ✓ (F8). |
| **Impreza domowa z TV** | **3/5** | Tryb salonowy: TV prowadzi, telefony to kontrolery, większe fonty (index.html:1175-1191), licznik „X/Y kliknęło dalej” | Salon tylko dla co-op (mp-picker.js:18-23), więc brak rywalizacji drużyn na TV, a to najlepszy format imprezowy. **Telefony nadal grają audio równolegle z TV** (mp.js:270-279). Max szerokość 880 px na TV 1080p. Brak QR kodu na ekranie TV do dołączenia (dziś trzeba przepisać kod). Brak muzyki lobby. |
| **Rodzinnie (dzieci, dziadkowie)** | **2/5** | Evergreeny PL, disco polo, dekady 60–80, lektor | Ksywy przypisywane automatycznie z wulgarnych (U10) i 🖕 w emotkach. Wymóg pisania tytułu i wykonawcy (bez ABCD dla muzyki). Brak poziomów trudności. Brak trybu „tylko dekada/rok” (tryb #5), w którym mogą grać wszyscy. |
| **Zdalnie ze znajomymi (Discord)** | **3,5/5** | **Mocna strona:** każdy słyszy u siebie, równy start po ARMING i intrze, wbudowany czat ze `@typ`, pasek reconnectu, zaproszenia do znajomych | Rozbieżność kanałów (rozmowa na Discordzie, typy w apce: OK). Brak powrotu do pokoju po rozłączeniu (F6). Jedna osoba z lagiem blokuje start (F7). Brak trybu widza dla streamera. |
| **Rywalizacja „Kahoot” w większej grupie (8–15 osób)** | **2,5/5** | Formaty Solo i Drużyny, ranking na odsłonie (mp-render.js:463-471) | Brak punktów za szybkość (R2), brak dramatu tabeli co pytanie, ręczny przydział drużyn tapnięciami (mp-picker.js:118-121) bez losowania, roster i kolumny nieskalowane na 15 osób. |
| **Liga/stała drużyna pubquizowa (tydzień do tygodnia)** | **2/5** | Trwałe drużyny, znajomi, tag `group_id` meczu | Statystyki drużyny i Pub Night odłożone (backlog). Nie widać progresu drużyny ani „najsłabszych kategorii drużyny przed czwartkiem”. |

---

## 6. TREŚĆ jako produkt

### Co działa dobrze
- **Kategorie teksty/lektor są unikatowe.** „Polskie po angielsku”, „rap PL — zagadki” i autorskie opisy bez łamania praw do tekstów (lyrics.js:1-16) to coś, czego nie ma SongPop ani Heardle.
- **Polski kontekst** (rap PL, rock PL, disco polo, evergreeny PL, `country:'PL'` w iTunes) jest dopasowany do realnych polskich pubquizów.
- **Kreator własnych kategorii** (catEditor.js) z odsłuchem, deduplikacją i eksportem JSON to killer feature na wesela i 30-tki.

### Problemy

| # | Waga | Problem | Gdzie |
|---|---|---|---|
| T1 | **wysoka** | **Wiedza ogólna rozmywa tożsamość.** 26 paczek (~2300 pytań: Kosmetyki, Lotnictwo, Medycyna, Królowie Polscy, Marvel, Wiedźmin…) wobec ~28 kategorii muzycznych. Liczbowo **połowa katalogu nie jest o muzyce**, a kostka miesza ją domyślnie (F3). Apka nazywa się „trener muzycznego pubquizu” (manifest, README). Gracz dostaje pytanie o kosmetyki i nie wie, czym jest produkt. Dodatkowo 74% pytań quizu to otwarte pola tekstowe, niewygodne na telefonie. | data/quiz-index.json; core/match.js:46-51 |
| T2 | **wysoka** | **„Dekady” nie są dekadami, a „style” nie dają hitów.** Kategorie to listy 11–16 wykonawców (categories.js:24-49). `pickTrack` bierze **losowy** utwór z ≤60 wyników iTunes artysty (trackSelect.js:22-35), bez filtra roku, popularności, wersji live ani remiksów (BAD łapie tylko karaoke/cover/tribute, trackSelect.js:11). Efekt: w „lata 80” może paść Madonna z 2019 albo Queen z 1975, a często album-filler, którego nikt nie zna. To przeciwieństwo pubquizu (Spin the Beat gra hity). Rok w odsłonie bywa datą remasteru (trackSelect.js:43), co psuje bonus roku i tryb „oś czasu”. | categories.js:24-49; core/trackSelect.js:11, 22-35, 43 |
| T3 | średnia | **„Poziom średni” na wszystkich 26 paczkach jest bezużyteczny.** Etykieta nie niesie informacji, skoro nie ma innych poziomów. W solo w ogóle się nie wyświetla (tick pokazuje „N pytań”, solo.js:88), w MP pickerze tak (mp-picker.js:96). Brak trudności per pytanie, więc nie da się zrobić „łatwe na rozgrzewkę → trudne w finale” ani adaptacji. | data/quiz-*.json `desc`; solo.js:88 |
| T4 | średnia | **Gracz nie rozumie, co wybiera.** Podpisy w stylu „1960–69”, „polski hip-hop”, „top 50 teraz” są 9-pikselowe (U1), bez przykładowych wykonawców i trudności. „Playlisty” vs „Style” vs „Dekady” nakładają się (rock: `rock-world`, `rock-pl`, `dz-rock`), bez wyjaśnienia różnicy. „Teksty” mają opis „tłumaczenia 🌐 (tryb lektor)”, ale chip trybu nazywa się „🗣 lektor”, a nie „teksty”. Tryb lektor w kategoriach audio działa tylko dla `hits-now` (5 piosenek, categories.js:41-47), więc wybór „lektor” + „Dekady” daje błąd kompatybilności (core/match.js:28). | solo.js:42-92; core/match.js:12-19, 28 |
| T5 | średnia | **„Gotowe playlisty” to zrzut chartów Deezer z danego dnia** (playlists.js:1-8: „top 50 teraz”). Starzeją się w tygodnie, część utworów jest niszowa (np. w „dance”). Etykieta „teraz” wprowadza w błąd za kilka miesięcy. | playlists.js |
| T6 | niska | **Paczka „Muzyka” (quiz) ma 0 pytań ABCD i tylko 50 pytań**, choć to jedyna paczka quizowa zgodna z tożsamością. Najmocniejsza treść quizowa jest najsłabiej rozwinięta. | data/quiz-muzyka.json |

### Rekomendacje (TREŚĆ)
- **R-T1 Odseparować wiedzę ogólną (S).** Opcje (od najtańszej):
  - (a) wyłączyć wiedzę z kostki i z domyślnych pul (R-F3) i schować grupę „Wiedza” za przełącznikiem „Dodatki: wiedza ogólna”;
  - (b) zostawić tylko quizy około-muzyczne (Muzyka, Film, Gry wideo: soundtracki) i rozwinąć je (rok, wytwórnia, „kto napisał”, ABCD);
  - (c) jeśli wiedza ma zostać, zrobić z niej **osobny produkt/tryb „Pubquiz ogólny”** na menu z własną ikoną, a nie kategorię w muzycznym pickerze.

  Rekomendacja: **(a) od razu, (b) docelowo**. Muzyczna marka zyskuje na ostrości.
- **R-T2 Pule „hitów”, nie dyskografii (S–M).**
  - (1) Szybko (S): w `pickTrack` dorzucić filtr `/\blive\b|remix|remaster|demo|acoustic|edit\)/i`, preferować `trackNumber<=3` lub ważyć po pozycji w wynikach iTunes (wyniki są posortowane mniej więcej po popularności, więc wziąć top 15 zamiast wszystkich 60).
  - (2) Docelowo (M): kategorie dekad jako kuratorowane `songs[]` z **rokiem oryginału** i `trackId` (format już obsługiwany przez `resolveFromSongs`, trackSelect.js:46-59). Prawdziwe „hity lat 80”, gotowe pod tryb oś czasu (#5) i wyzwanie dnia (#2).
- **R-T3 Trudność, która coś znaczy (M).** Pole `difficulty: 1-3` per pytanie/utwór (można wyliczyć z globalnego % trafień w `answers` po kilku tygodniach) i chipy „Łatwy / Mix / Ekspert” w pickerze. Usunąć „poziom średni” z `desc`, a pokazywać „100 pytań · 26% ABCD”.
- **R-T4 Karty kategorii (S):** zamiast 9-pikselowego podpisu 2–3 przykładowych wykonawców („Maanam, Lady Pank, a-ha…”) i ikona trybów, które kategoria wspiera. Złączyć „Style” i „Playlisty” w jedną grupę „Gatunki”.
- **R-T5 Playlisty „teraz” z datą (S)** („charty · lipiec 2026”) albo regenerowane automatycznie w CI.

---

## Top 10 rekomendacji (kolejność: wartość / koszt)

| # | Rekomendacja | Wartość | Koszt | Odwołania |
|---|---|---|---|---|
| 1 | **„Graj teraz” jednym tapnięciem + krótki mecz domyślnie (10–15 pytań) + zapamiętana pula** zamiast pustego pickera i 60 pytań | b. wysoka (onboarding, retencja D1) | S | solo.js:33-35; core/match.js:5; F1, F2 |
| 2 | **Kostka i domyślne pule tylko muzyczne; wiedza ogólna za przełącznikiem** | wysoka (tożsamość, pierwsze wrażenie) | S | core/match.js:46-51; F3, T1 |
| 3 | **Jeden głośnik: telefony nie grają audio w salonie + tryb „stolik” (tylko host gra) dla wszystkich formatów** | wysoka (główny use case pub/TV) | S | mp.js:270-279, 418-440; mp-picker.js:18-23; tryb #6 |
| 4 | **Prawdziwa punktacja: szybkość + mnożnik serii + częściowe punkty + realny bonus rok/album, „+30” na odsłonie** | wysoka (napięcie, sens timera, zaufanie) | S | core/scoring.js:96-102; mpReducer.js:183; U3, R2 |
| 5 | **Odsłona edukacyjna (twoja odp. → poprawna, „literówka OK”) + 5 SFX (pudło, tik, ding, fanfara) + „pub-mode” typografia (min 13/15 px)** | wysoka (czytelność, feedback) | S | solo.js:484-496; app/sfx.js; index.html (75× ≤11 px); U1, U2, U4 |
| 6 | **Higiena: potwierdzenie wyjścia + „wróć do pokoju”, auto-join z linku, auto-dalej po 8 s, copy błędów dla gracza, jedna marka, tryb rodzinny (ksywy/🖕)** | średnio-wysoka (mniej frustracji, bezpieczeństwo marki) | S | mp-render.js:348, 19; mp.js:40-43, 110-124; solo.js:231; social.js:35-45; F5-F7, F10, U9, U10 |
| 7 | **Lepszy dobór utworów: filtr live/remix/remaster + top-N wyników zamiast losu z 60; docelowo kuratorowane dekady z rokiem oryginału** | wysoka (jakość rdzenia: „znam to!”) | S → M | core/trackSelect.js:11, 22-35; categories.js; T2 |
| 8 | **Stacja dnia: 10 utworów z seeda daty, jedna próba, seria dni 🔥 w menu, siatka emoji do udostępnienia** | b. wysoka (retencja, viral) | M | core/match.js (seed); _designref/01; tryb #2 |
| 9 | **Tryb Intro 1-2-4-8 s (Heardle) + Szybkie ABCD dla muzyki** jako dwa nowe, tapowalne typy pytań | wysoka (różnorodność, pub/rodzina) | M | app/audio.js:67-81; solo.js:367-370; tryby #1, #3 |
| 10 | **„Twoje pudła” (powtórki muzyki 1-3-7 dni) + ekran końca MP z listą utworów, share i „wyzwij na ten sam mecz”** | wysoka dla use case’u „nauka” | M | solo.js:572-586; mp-render.js:560-590; R3, R5 |

*Kolejne w kolejce (P2):*
- lobby z projektu 06 (ustawienia widoczne dla gości, gotowość);
- przywrócony kompaktowy rail faz i krótsze intra;
- oś czasu / rok (po kuratorowanych danych z #7);
- jokery;
- nagła śmierć;
- liga tygodniowa (API gotowe);
- dark mode „systemowy”.
