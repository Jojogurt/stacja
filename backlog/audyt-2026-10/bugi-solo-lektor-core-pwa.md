# Review SOLO / LEKTOR / QUIZ / AUDIO / PWA — stacja v51 (2026-10-15)

Zakres: core/*, app/solo|lektor|audio|audioCtx|catalog|catEditor|dom|sfx|social(profil), adapters-web/itunesRepository|webAudio, quiz-loader.js, sw.js, index.html, manifest.
Testy: `npm test` ✅ (464 rdzeń + 17836 danych + 30 authority), `npm run test:dom` ✅ (124). Skrypty potwierdzające w scratchpad/: shellcheck.mjs, score.mjs, data*.mjs, v.mjs, race.mjs.
Znaleziska z planu audytu 2026-07 pominięte, chyba że fix niepełny (#17).

## Znaleziska (od najpoważniejszych)

### 1. sw.js: brak `core/teams.js` w SHELL → aplikacja martwa offline po aktualizacji SW
- Plik: sw.js:7-32 (SHELL); importowany przez core/mpReducer.js i app/mp*.js
- Waga: WYSOKA · Pewność: POTWIERDZONE skryptem (graf importów od quiz-loader.js vs SHELL: brakuje dokładnie `core/teams.js`; dodatkowo brak `data/quiz-muzyka.json`)
- Scenariusz: 1) użytkownik otwiera apkę online → instaluje się nowy SW (stacja-v51); `activate` kasuje stary runtime-cache (`stacja-v50-rt`), nowy RUNTIME jest pusty, a otwarta strona załadowała moduły jeszcze przed przejęciem przez SW; 2) zamyka apkę, idzie do pubu bez zasięgu; 3) otwiera PWA → `core/teams.js` nie ma ani w CACHE, ani w RUNTIME → fetch rzuca → import `app/mp.js` pada → `import('./app.js')` w quiz-loaderze się wysypuje → pusty ekran (nawet solo/quiz offline nie działa). Kategoria quiz-muzyka offline po cichu znika.
- Fix: dopisać `./core/teams.js` i `./data/quiz-muzyka.json` do SHELL; dodać test (node), który liczy graf importów i manifest danych i porównuje z SHELL (jak skrypt w scratchpad/shellcheck.mjs).

### 2. Quiz wielopolowy: ocena zależy od KOLEJNOŚCI pól → fałszywe odrzucenia (112 pytań „Wymień…")
- Plik: app/solo.js:527 (`okBySlot[s.key]=(current.answers[s.key]||[]).some(...)` — slot i ↔ lista i); to samo w MP: core/mpReducer.js:174
- Waga: WYSOKA (dotyczy poprawnych odpowiedzi, solo i MP) · Pewność: POTWIERDZONE skryptem (scratchpad/data3.mjs, data4.mjs)
- Scenariusz: „Wymień trzy państwa bałtyckie” (quiz-geografia#94), pola „kraj 1/2/3” z listami [Litwa], [Łotwa], [Estonia]. Gracz wpisuje „Estonia, Łotwa, Litwa” → `false` (Pudło), choć odpowiedź jest w pełni poprawna. Tak samo: 4 oceany (#98), aktorzy Bonda (film#86: „Daniel Craig, Roger Moore, Sean Connery” → odrzucone), Czechy/Słowacja (#90). Skrypt: 112 pytań „Wymień…” ma listy przypięte do pozycji, a etykiety pól („kraj 1”, „ocean 2”) nie mówią graczowi, która pozycja jest która.
- Fix: dla pytań-list (wszystkie etykiety typu „X n” albo flaga `unordered:true` w danych) oceniać bez kolejności: dopasowanie dwudzielne (każdy wpis gracza do innej puli/wariantu, bez powtórzeń) — czysta funkcja w core/scoring.js (`evaluateSlots(guesses, slots, answers)`), wspólna dla solo i mpReducer, z testami.

### 3. solo: „Zakończ" w trakcie strojenia + szybki „Nowy mecz" → nowy mecz utyka na pierwszym pytaniu
- Plik: app/solo.js:204-226 (`if(busy) return;` + `busy=false` dopiero po `await resolveTrack`), 387, 433-434 (finishMatch/endMatch nie resetują busy)
- Waga: WYSOKA · Pewność: POTWIERDZONE skryptem (jsdom, scratchpad/race.mjs: nowy mecz B stoi na „strojenie…”, check/skip disabled także po zwolnieniu starego fetcha)
- Scenariusz: 1) pytanie muzyczne, `newRound` czeka na `resolveTrack` (słaba sieć → do 20 s, RESOLVE_CAP_MS); `busy=true`; 2) gracz klika „Zakończ" (soloGen++), potem „Nowy mecz" i „Zacznij mecz"; 3) `startMatch → loadSlotQuestion → newRound()` trafia w `if(busy) return;` — po cichu nic; przyciski check/skip/replay zostają disabled z poprzedniej rundy, ikona „wait", stan „strojenie…"; 4) stary resolve kończy się, `busy=false`, ale `gen!==soloGen` → return. Nowy mecz stoi; gałka (`toggleAudio`) ma `current` = utwór z poprzedniego meczu → zagra STARY utwór, a „Sprawdź" go oceni jako pytanie 1 nowego meczu.
- Fix: busy wiązać z tokenem (`busy` = `busyGen===soloGen`), albo w finishMatch/endMatch/zmianie trybu ustawić `busy=false; current=null`; w newRound po porzuceniu gen nie dotykać busy, jeśli należy już do nowszej rundy.

### 4. solo: „Pomiń" aktywne po „Sprawdź" → podwójny wpis tego samego pytania w wynikach meczu
- Plik: app/solo.js:380-384 (skip) + 474-513/515-560 (check/checkQuiz nie wyłączają #skip); CSS index.html:212 (.mini widoczne w odsłonie)
- Waga: ŚREDNIA · Pewność: POTWIERDZONE skryptem (jsdom, scratchpad/race.mjs: po check+skip podsumowanie ma 2 wiersze dla 1 pytania: ✗ i ↷)
- Scenariusz: 1) mecz, pytanie → „Sprawdź" (wynik wpisany do `session.results`, reveal widoczny); 2) zamiast „Następny →" użytkownik stuka „↷ pomiń" (widoczny i enabled w decku); 3) `skip` widzi `session && current` → push drugiego wpisu `skipped:true` dla tego samego utworu, `streak=0` (zerowana seria po trafieniu), `advance()`. Podsumowanie pokazuje pytanie 2× (✓ i ↷), `buildSoloRecord.answers` ma dodatkowy wiersz → statystyki per-kategoria w profilu (serwer liczy z answers) zaniżone, q_no przesunięte.
- Fix: w `check()`/`checkQuiz()` ustawić `skip.disabled=true` (albo w handlerze skip: jeśli `#reveal.show` → tylko `advance()` bez push i bez zerowania serii).

### 5. Quiz wielopolowy: identyczne listy wariantów → ten sam wpis 2-3× zaliczony (11 pytań)
- Plik: app/solo.js:527-528; core/mpReducer.js:174
- Waga: ŚREDNIA · Pewność: POTWIERDZONE skryptem
- Scenariusz: „Wymień trzy owady” (quiz-zwierzeta#99) — pola a/b/c mają tę samą pulę. Wpisanie „mucha” w trzy pola → ✓ (trafienie). Tak samo disney#23 („Flora” ×2), disney#65, star-wars#91, sztuka#97-99, zwierzeta#93-96. Dodatkowo nakładające się listy w historia-polski#84 (Sobieski w obu polach), muzyka#47 („Bon Jovi” w obu), sport#97 (Małysz/Fortuna w a i c).
- Fix: ten sam algorytm co w #2 — wymagać różnych wpisów (po `norm`) i przypisania każdego do innego slotu; test „mucha×3 → ✗”.

### 6. Tolerancja literówki (lev≤1 od 6 znaków) zalicza INNY numer/liczebnik rzymski
- Plik: core/scoring.js:59 (`if(d<=1 && Math.max(len)>=6) return true;`) + ratio 0.84 (l.61)
- Waga: ŚREDNIA · Pewność: POTWIERDZONE skryptem (scratchpad/score.mjs)
- Scenariusz: `textMatch` → true dla: „Apollo 12”≈„Apollo 11”, „Henryk V”≈„Henryk IV”, „Ludwik XV”≈„Ludwik XIV”, „Elżbieta I”≈„Elżbieta II”, „Zygmunt II Waza”≈„Zygmunt III Waza”, „Windows 98”≈„95”, „Boeing 737”≈„747”, „Airbus A320”≈„A380”, „16 lipca 1410”≈„15 lipca 1410”, „Fiat 126p”≈„125p”. W danych 136 wariantów odpowiedzi ≥6 znaków zawiera cyfrę lub liczebnik rzymski (np. historia-polski: Mieszko I, Kazimierz III Wielki, Jan III Sobieski, Zygmunt II August; historia-swiata#85 Apollo 11; informatyka „8 bitów”, „32 bity”, „127.0.0.1”). Również „Mieszko II”≈„Mieszko I” i „Zygmunt III”≈„Zygmunt II” (sprawdzone; „Zygmunt III” vs pełne „Zygmunt II August” akurat NIE przechodzi). Muzyka: tytuły typu „1999”/„22” są krótkie (ok), ale „Symphony No. 5” vs „No. 9” — też przechodzi.
- Fix: w `nearMatch` przed tolerancją porównać tokeny „liczbowe” (`/^\d+$/` i rzymskie `^[ivxlcdm]+$`) obu stron — muszą być identyczne (multizbiór); tolerancja Levenshteina tylko dla reszty. Test z powyższymi parami.

### 7. pickTrack: dopasowanie wykonawcy przez `includes` → zajawka INNEGO artysty w kategorii
- Plik: core/trackSelect.js:29-30 (`if(!(ra.includes(na)||na.includes(ra))) return false;`) — wspólne solo + serwer
- Waga: ŚREDNIA · Pewność: POTWIERDZONE skryptem (v.mjs) dla logiki; to, co iTunes faktycznie zwraca — PRAWDOPODOBNE
- Scenariusz: kategoria lat 70/80 ma „Queen”; iTunes (`attribute=artistTerm`, limit 60) zwraca też „Queen Latifah”, „Queensrÿche” → `'queen latifah'.includes('queen')` → utwór Queen Latifah gra w kategorii rocka. Podobnie z puli kategorii (31 krótkich nazw): „Boys” → „Backstreet Boys”, „Mig” → „Migos”, „Hey” → „Hey Violet”, „Kiss”, „Toto” → „Toto Cutugno”. Dodatkowo wykonawca zapisany niełacińsko (np. „Культ”) ma `norm()===''` i `'kult'.includes('')` → przechodzi dla KAŻDEJ kategorii. Odpowiedź jest spójna z odtworzonym utworem, ale kategoria/epoka kłamie.
- Fix: wymagać równości po `norm` (lub `textMatch(r.artistName, artist)`), dopuszczając tylko sufiksy duetów („X & Y”, „X feat. Y”) przez `artistMatch(artist, r.artistName)`; odrzucać `ra===''`.

### 8. PWA: network-first bez timeoutu + quiz-loader czeka na 27 żądań → przy słabym zasięgu biały ekran zamiast cache
- Plik: sw.js:65-83 (`await fetch(req)` bez limitu czasu, fallback do cache dopiero po błędzie); quiz-loader.js:24-45 (`Promise.all` 1+26 fetchy bez timeoutu, `import('./app.js')` dopiero w `finally`)
- Waga: ŚREDNIA · Pewność: PEWNE z kodu (czas zależy od sieci)
- Scenariusz: pub z „lie-fi” (jest sygnał, pakiety giną). Nawigacja i każdy plik idą najpierw do sieci; `fetch` nie rzuca od razu, tylko wisi do timeoutu TCP (dziesiątki sekund), więc fallback do cache nie rusza. quiz-loader czeka na NAJWOLNIEJSZY z 27 plików (126 KB gzip łącznie), zanim zaimportuje app.js → ekran bez działających przycisków. Komentarz w loaderze („loader nigdy nie może zablokować bootu”) jest nieprawdziwy dla zawieszonego fetcha.
- Fix: w SW `Promise.race([fetch(req), timeout(3000)])` → przy timeoucie odpowiedź z cache (a sieć w tle aktualizuje cache — stale-while-revalidate dla data/*.json i modułów); w loaderze `AbortController` 4-5 s na manifest i pliki, albo start app.js od razu i dociąganie quizów leniwie (tylko gdy gracz wybierze grupę „Wiedza”).

### 9. iOS: solo tworzy NOWY element Audio po `await` w każdej rundzie; AudioContext „od tyłu” nieodblokowany przy starcie meczu
- Plik: app/audio.js:52,62 (`new Audio()` + `play()` po `await resolveTrack` w solo.js:224), 69/76 (fragment), 93 (`ensureCtxResumed` po await); app/solo.js:390-401 (`startMatch` nie woła `unlockCtx()`/odblokowania elementu)
- Waga: ŚREDNIA (UX na głównej platformie mobilnej) · Pewność: PRAWDOPODOBNE (MP celowo używa jednego trwałego, odblokowanego elementu — komentarz „iOS odblokowuje per-element” w webAudio.js:30; solo tego nie robi)
- Scenariusz: iPhone, mecz solo: każde pytanie muzyczne kończy się `play()` → NotAllowedError → „naciśnij ▶, by odtworzyć” — każda runda wymaga dodatkowego stuknięcia. Gdy pierwszy slot to „od tyłu”: `AudioContext` tworzony poza gestem → `await c.resume()` wisi do pierwszego dotknięcia, `revDecoding=true`, spinner „odwracam…” bez podpowiedzi, przyciski wyłączone (gracz nie wie, że ma dotknąć gałki).
- Fix: jak w MP — jeden trwały `<audio>` odblokowany w geście „Zacznij mecz”/„Następny” (`unlockAudioElement`), zmiana `.src` per runda; w `startMatch` wołać `unlockCtx()`; w stanie oczekiwania na resume pokazać „stuknij ▶”.

### 10. Po „Zakończ” w trakcie pytania deck + formularz pod podsumowaniem zostają aktywne
- Plik: app/solo.js:433-470 (finishMatch nie zeruje `current`, nie wyłącza #check/#skip/#replay, nie zdejmuje `quiz-mode`); CSS index.html:382-385 (`body.playing` zostaje → deck/form widoczne nad summary)
- Waga: NISKA-ŚREDNIA · Pewność: PEWNE z kodu
- Scenariusz: 1) mecz, pytanie wczytane (Sprawdź aktywne); 2) „Zakończ” → podsumowanie, ale deck i formularz wciąż na ekranie; 3) gracz wpisuje odpowiedź → „Sprawdź” (lub Enter) → `check()` z `session=null` zmienia globalne `score/total/streak`, dla quizu zapisuje statystykę trenera (`recordQuizStat`), pokazuje reveal z „Następny →”, który nic nie robi (`advance` → `!session`). Gałka/↻ odtwarzają utwór z zakończonego meczu.
- Fix: w finishMatch: `current=null`, wyłączyć check/skip/replay, `knob.classList.remove('live')`, `body.classList.remove('quiz-mode')`; ewentualnie CSS: `body.solo.playing:has(.summary.show) .deck, … .form{display:none}`.

### 11. lektor.js: niechroniony `localStorage` przy imporcie modułu → cała aplikacja nie startuje przy zablokowanym storage
- Plik: app/lektor.js:35 (`let piperOn = localStorage.getItem('stacjaPiper')==='1';` na poziomie modułu) i :83 (setItem bez try)
- Waga: NISKA-ŚREDNIA · Pewność: PEWNE z kodu (zachowanie przeglądarek: dostęp do `localStorage` rzuca SecurityError przy zablokowanych cookies/danych witryn w Safari/Firefox i w iframe sandbox)
- Scenariusz: użytkownik z „Blokuj wszystkie cookies” (Safari) otwiera apkę → ewaluacja `app/lektor.js` rzuca → padają `audio.js`, `solo.js`, `app.js` → nic nie działa, mimo że reszta kodu (catalog/sfx/app.js/cf.js) owija storage w try/catch.
- Fix: `let piperOn=(()=>{try{return localStorage.getItem('stacjaPiper')==='1'}catch(_e){return false}})();` + try wokół setItem (to samo mp.js:82/606-607 — poza zakresem, ale ten sam boot).

### 12. artistMatch: rozbijanie po przecinku/& na SUROWYM tekście zalicza pojedyncze słowo nazwy zespołu
- Plik: core/scoring.js:80-87 (ARTIST_SEP z `,` i `&`, człon ≥3 znaki)
- Waga: NISKA-ŚREDNIA · Pewność: POTWIERDZONE skryptem
- Scenariusz: wykonawca „Mumford & Sons” → odpowiedź „Sons” ✓; „Earth, Wind & Fire” → „Fire” ✓ (też „Wind”); „Tyler, the Creator” → „Tyler” ✓; „Crosby, Stills, Nash & Young” → „Young” ✓; polski „Raz, Dwa, Trzy” → „Dwa” ✓. Reguła 4.1 miała obsłużyć DUETY („Queen & David Bowie”), a łapie też nazwy zespołów zawierające „&”/przecinek.
- Fix: dzielić tylko po separatorach duetu ze spacjami po obu stronach i tylko gdy każdy człon to osobny wykonawca — praktycznie: lista wyjątków nie wystarczy; lepiej wymagać, by człon miał ≥2 tokeny LUB ≥6 znaków i nie był ostatnim słowem nazwy z „&” (albo trzymać duety jawnie w danych: `artists:[...]` z iTunes `artistName` rozbitym tylko po „ feat.”/„ & ” gdy obie strony są znanymi wykonawcami). Minimum: usunąć `,` z ARTIST_SEP.

### 13. ABCD: literę błędnej opcji zalicza wariant tekstowy z jednoliterowym rdzeniem
- Plik: app/solo.js:525 (`(current.answers.a||[]).some(v=>textMatch(guess, v))` — litera porównywana ze WSZYSTKIMI wariantami, także tekstowymi); dane quiz-biologia.json#56
- Waga: NISKA (1 pytanie dziś, ale klasa błędu) · Pewność: POTWIERDZONE skryptem (data2.mjs)
- Scenariusz: „Która witamina powstaje w skórze…? A) A B) C C) D D) B12”, answers.a=["C","Witamina D","d","witamina d"]. Gracz wybiera **D** (Witamina B12 — źle) → `textMatch('D','d')` → ✓. Analogicznie każde przyszłe pytanie, gdzie wariant tekstowy to pojedyncza litera A-D.
- Fix: w ABCD porównywać tylko literę: `roundOk = guess && guess.toUpperCase()===String(current.answers.a[0]).toUpperCase()`; walidator danych (test/data.js) niech odrzuca jednoliterowe warianty A-D poza [0].

### 14. „Od tyłu”: flaga `revDecoding` blokuje start nowej rundy, gdy poprzednie dekodowanie jeszcze trwa
- Plik: app/audio.js:17,88,92,100
- Waga: NISKA · Pewność: PEWNE z kodu
- Scenariusz: runda „od tyłu” dekoduje (wolny fetch przez proxy /audio, kilka s); gracz klika „Zakończ” → „Nowy mecz” (albo w wolnej grze zmienia tryb i losuje ponownie) → nowa runda `startAudio → startReverse` trafia w `if(revDecoding) return;` — brak dźwięku, stan „strojenie…”, check/skip disabled; dopiero tap w gałkę (po zakończeniu starego dekodowania) ratuje rundę.
- Fix: zamiast globalnej flagi — token: `revGen=getGen()`; nowa runda zawsze startuje, a stary wynik odrzuca `shouldPlay` (już jest). Flagę trzymać tylko dla tej samej `gen`.

### 15. Fragment: listener `loadedmetadata`/`timeupdate` starego elementu operuje na NOWYM `audio`
- Plik: app/audio.js:55-58, 72-83 (handlery czytają zmienną modułu `audio`, nie `el`; brak guardu `el===audio`, który dodano tylko w bindAudioUI)
- Waga: NISKA · Pewność: PEWNE z kodu
- Scenariusz: fragment wolno ładuje metadane; runda się zmienia (Zakończ → nowy mecz / tryb). Spóźniony `loadedmetadata` starego elementu ustawia `audio.currentTime=staryCurrent.snipStart` i woła `audio.play()` na elemencie NOWEJ rundy (np. muzyka przeskakuje w losowe miejsce) albo rzuca TypeError, gdy `audio===null` (po stopAudio). `pause()` na starym elemencie emituje `timeupdate` → `audio.duration` na null → TypeError w konsoli przy każdym stopie.
- Fix: w obu funkcjach używać lokalnej stałej `const el=new Audio(...)` i na wejściu każdego handlera `if(el!==audio) return;`.

### 16. Lektor: brak `onerror` na wypowiedzi i brak obsługi końca/błędu pre-gen audio → ikona „pauza” i „lektor czyta…” na stałe
- Plik: app/lektor.js:22 (tylko `u.onend`), :58 (ścieżka `ttsUrl`: `a.play().catch(()=>{})` — bez onended/onerror/ustawienia stanu)
- Waga: NISKA · Pewność: PEWNE z kodu
- Scenariusz: synteza zgłasza `error` (Chrome „synthesis-failed”, iOS „interrupted” przy przejęciu sesji audio, brak głosu pl) → `onend` nie przychodzi → gałka pokazuje pauzę, status „lektor czyta…”; `isSpeaking()` zwraca false, więc tap gałki zaczyna czytać od nowa zamiast „stop”. Dla `tts` (pre-gen) ikona/status w ogóle się nie zmieniają.
- Fix: `u.onerror = u.onend` (z tym samym guardem `gen`); dla `ttsUrl` dodać `onended/onerror` → `setIcon('play')`, a `play().catch` → komunikat „stuknij ▶”.

### 17. [niepełny fix 5.1] `escapeHtml` nie chroni wartości w inline `onclick="f('${…}')"` — social.js:91 i :130 nadal tak robią
- Plik: app/social.js:91 (`onclick="dzCopy('${escapeHtml(team.code)}')"`), :92 (`dzLeave('${team.id}')` bez escape), :130 (`dzCopy('${escapeHtml(myCode)}')`); plan 5.1 wymieniał social.js:91 do przepisania na `data-*`
- Waga: NISKA (wartości generuje serwer) · Pewność: PEWNE z kodu
- Scenariusz: parser HTML dekoduje `&#39;` → `'` ZANIM atrybut trafi do JS, więc `x');alert(1);//` z serwera (lub z przyszłego pola edytowalnego przez użytkownika) wykona się mimo escapowania. Dodanie `'` do escapeHtml (5.1) tego kontekstu nie naprawia — wymagana była zmiana na `data-*` + delegację, której w social.js nie zrobiono (i nadal jest w mp-picker.js:86/91/96 dla kluczy kategorii).
- Fix: `data-code="${escapeHtml(code)}" onclick="dzCopy(this.dataset.code)"` (wzór już jest w `dz-invite`, social.js:122).

### 18. SW: żądania Range dla audio same-origin → `cache.put` rzuca dla 206, odpowiedź zastępowana pełnym 200 z cache
- Plik: sw.js:67-74 (`res.ok` jest true dla 206; `Cache.put` odrzuca odpowiedź 206 TypeErrorem → wpada w `catch` → `caches.match`)
- Waga: NISKA · Pewność: PEWNE z kodu (Cache.put odrzuca 206 wg specyfikacji); skutek w Safari PRAWDOPODOBNY
- Scenariusz: `new Audio('./click.wav')`/`clapping.wav` (sfx.js) — przeglądarka wysyła `Range: bytes=…`; SW dostaje 206, `put` się wywala, a elementowi audio oddaje pełne 200 z precache (Safari bywa na to wrażliwy — dźwięki UI mogą milknąć w PWA) albo, gdy nie ma w cache, rzuca błąd sieci mimo działającej sieci. Do tego błąd w konsoli przy każdym kliknięciu.
- Fix: w SW `if(req.headers.has('range')) return;` (nie przechwytuj) albo cache'uj tylko `res.status===200`.

### 19. Dane: błąd merytoryczny w odpowiedziach — Małysz jako indywidualny mistrz olimpijski
- Plik: data/quiz-sport.json#97 (sloty a i c zawierają „Adam Małysz”)
- Waga: NISKA · Pewność: PEWNE (Małysz ma 4 medale olimpijskie, żadnego złota; mistrzowie: Fortuna 1972, Stoch 2014/2018)
- Scenariusz: odpowiedź „Małysz” jest zaliczana, a poprawny trzeci skoczek nie istnieje (jest tylko dwóch indywidualnych mistrzów) — pytanie „wymień trzech” jest nierozwiązywalne zgodnie z faktami.
- Fix: przeformułować na „wymień dwóch” (Fortuna, Stoch) albo zmienić na „medalistów olimpijskich”.

### 20. Dostępność: stan wyboru ABCD i wynik opcji tylko kolorem/klasą; gałka z niezmiennym aria-label
- Plik: app/solo.js:355-359, 368-370, 537-541 (`.sel/.ok/.no` bez `aria-pressed`/tekstu); index.html:1424 (`aria-label="Odtwórz"` nigdy nie aktualizowany, ikona zmienia się tylko w SVG — dom.js:7-12); #lyricBox z pytaniem bez `aria-live`
- Waga: NISKA · Pewność: PEWNE z kodu
- Scenariusz: czytnik ekranu: po wybraniu opcji nie słychać, która jest zaznaczona; po „Sprawdź” poprawna/błędna opcja rozróżniona tylko kolorem (tekst w #rmeta jest, więc gra jest możliwa — nie blokuje); gałka zawsze „Odtwórz”, nawet gdy gra (pauza).
- Fix: `aria-pressed` na `.mc-opt`, po ocenie `aria-label` „poprawna/twój błędny wybór”; `setIcon` niech ustawia też `aria-label` gałki („Odtwórz”/„Pauza”/„Ładowanie”).

## Dług techniczny / ryzyka

- **Brak testu spójności SW↔graf modułów↔manifest danych** — #1 wróci przy każdym nowym pliku. Dodać do `test/data.js` skrypt typu scratchpad/shellcheck.mjs (graf importów od quiz-loader.js + data/quiz-index.json ⊆ SHELL).
- **`busy` i `current` jako globalne flagi obok tokenu `soloGen`** — token z FAZY 2 chroni wynik async, ale nie stan UI (busy, przyciski, `revDecoding`). Docelowo jeden obiekt rundy `{gen, phase, current}` + `canTransitionSolo` z core/phases.js (dziś SOLO FSM jest zdefiniowana, ale solo.js jej NIE używa).
- **Ocena slotów rozproszona** (solo.js:525-528 i mpReducer.js:174) — przenieść do jednej czystej funkcji w core/scoring.js (`evaluateQuiz`) z testami: ABCD tylko po literze, listy bez kolejności i bez duplikatów.
- **Dane quizu jako zaufany HTML-free input** — `s.label`/`s.key` idą bez escapowania do innerHTML/atrybutu id (solo.js:373, 547 przez `line()`), `ERAS[k].label/desc` też (solo.js:45,59). Dziś to dane z repo, ale MP przesyła pule od hosta — wystarczy, że ten sam renderer kiedyś dostanie pytania z sieci.
- **Runtime-cache SW (60 wpisów) jest mniejszy niż liczba żądań jednego bootu (~70)** — przy każdym starcie najstarsze wpisy wypadają; działa tylko dlatego, że precache je dubluje. Precache przez `cache.add` korzysta z HTTP-cache (GitHub Pages max-age=600) → po deployu SW może zapisać stare pliki pod nową wersją; użyć `new Request(u,{cache:'reload'})`.
- **Piper z `https://esm.sh/...` bez SRI** — opcjonalny, ale to zdalny kod wykonywany w originie aplikacji (dostęp do tokenu w localStorage). Rozważyć self-hosting lub `integrity` przez importmap.
- **`fetch` w cf.js bez timeoutu** — `renderProfil` (social.js:292) czeka na `ensureSession()` bez limitu (w Drużynie jest race 5 s); przy wiszącym Workerze loader profilu kręci się bez końca.
- **Quiz stats w localStorage rosną bez limitu** (klucz = kategoria + pełny znormalizowany prompt) — dziś ok (~2300 pytań), ale bez wersji/migracji: zmiana treści pytania osieroca statystyki.
- **Drobne UX**: profil „2 meczów” (brak `plPick`, social.js:304), „Odznaki n / 12” przy 4 zdefiniowanych; eksport JSON w edytorze pokazuje „skopiowano”, gdy `navigator.clipboard` nie istnieje albo `writeText` odrzuci (catEditor.js:133 — promise bez `.catch`); `speechSynthesis.cancel()` tuż przed `speak()` bywa na iOS/Chrome przyczyną zgubionej wypowiedzi (lektor.js:17).
- **Mecz liczy się w lidze po 1 odpowiedzi** — „Zakończ” po pierwszym pytaniu zapisuje pełny mecz (`total_questions` = cały mecz) i nabija licznik meczów/odznakę „10 meczów”.
