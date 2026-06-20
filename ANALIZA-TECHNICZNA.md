# STACJA — analiza techniczna i plan pod portowalność

*Wygenerowano na życzenie. Kontekst: aplikacja działa i spełnia cel, pytanie brzmi „jak ją utrzymać i ewentualnie przenieść na Flutter / iOS / Android / Godot".*

---

## 0. TL;DR (werdykt)

Kod jest **pragmatycznym, działającym prototypem webowym** — dobrze nazwane funkcje, sensowne komentarze (PL), spójny design system. Jako produkt: OK. Jako **baza pod port natywny: wymaga refaktoru**, bo logika gry jest *zrośnięta* z DOM-em i Web API (Audio, AudioContext, fetch, localStorage, Supabase JS, speechSynthesis). Nie ma warstw, klas, modułów ani granic — wszystko to 1291 linii imperatywnego JS w jednym `index.html`, na 35 globalnych zmiennych stanu.

**Najważniejszy ruch pod Twój cel (port):** wydzielić **czysty rdzeń domenowy** (mecz, punktacja, maszyna stanów, reducer multiplayera) od **adapterów platformy** (audio, sieć, realtime, storage) i od **UI**. Rdzeń jest już w ~70% czysty (matematyka i przejścia stanów) — to on przenosi się 1:1 na Dart/Swift/Kotlin/GDScript. Reszta to wymienne wtyczki per platforma.

---

## 1. Metryki (fakty, nie wrażenia)

| Metryka | Wartość | Komentarz |
|---|---|---|
| `index.html` | 1777 linii | HTML ~180 + CSS ~300 + JS ~1291, wszystko inline |
| Funkcje top-level | 113 | brak enkapsulacji, wszystkie w jednym zakresie |
| Globalne `let`/`var` (stan) | 35 | mutowalny stan globalny (`mode`, `current`, `session`, `mpGame`, `audio`, `mp*…`) |
| Klasy ES / moduły / import-export | **0** | czysto proceduralnie, brak granic modułów |
| Bezpośrednie dotknięcia DOM | 169 | `getElementById`/`innerHTML`/`.value`/`addEventListener` rozsiane w logice |
| Wywołania Web API (browser-only) | 49 | `new Audio`, `AudioContext`, `fetch`, `localStorage`, `speechSynthesis` |
| Dispatch po stringach (`mode===`, `phase===`) | 33 | nieformalna maszyna stanów rozsmarowana po `if`-ach |

Wniosek liczbowy: **wysokie sprzężenie logiki z platformą** (169 DOM + 49 Web API) i **rozproszona maszyna stanów** (33 porównania stringów) — dokładnie te dwie rzeczy najbardziej bolą przy porcie.

---

## 2. Analiza wg wymiarów

### Architektura ogólna
Monolit jednoplikowy, styl imperatywno-proceduralny, **zero warstw**. Dane (`categories.js`/`playlists.js`/`lyrics.js` → `window.CATEGORIES`) + `config.js` + edge functions (Deno: `tracks`, `spotify`, `audio`) + Supabase Realtime. Brak kroku build, brak frameworka, brak typów. Dla hobby-webówki: rozsądny minimalizm. Dla wieloplatformowości: brak fundamentu.

### Czytelność
Plus: konsekwentne nazewnictwo (camelCase, prefiks `mp*` dla multiplayera), komentarze tłumaczące „dlaczego", spójny CSS z tokenami. Minus: **bardzo długie funkcje** (`mpRender`, `mpHostNewRound`, `check`, `mpLock`, `finishMatch`, `startReverse`), **HTML budowany wielkimi literałami szablonowymi** wewnątrz logiki (kruche — stąd realny bug „rebuild per `round` vs `playNonce`"), magiczne wartości, brak typów = brak wsparcia IDE.

### Oddzielenie UI od logiki — **najsłabszy punkt**
Praktycznie brak. Funkcje logiki wołają wprost DOM: `check()` liczy punkty **i** renderuje odsłonę; `mpHandleAct()` mutuje stan **i** woła `mpRender()`; `mpPlayLocal()` steruje audio **i** ikoną gałki. Nie ma warstwy widoku ani ViewModeli. To jest powód, dla którego „przepisanie na Flutter" = dziś faktyczne pisanie od zera, a nie tłumaczenie.

### KISS
Generalnie spełnione — brak przeinżynierowania, rozwiązania wprost. Akceptowalny dług w jednym miejscu: render MP z ręcznym „pełny rebuild vs częściowy update" (to obejście problemu, którego nie byłoby z prawdziwym diffem/frameworkiem).

### DRY — kilka wyraźnych naruszeń
- **Picker** kategorii/trybów istnieje dwa razy: solo (DOM, `renderModeChips`/ticki) i MP (string, `mpPickerHTML`).
- **Audio**: `startAudio`/`startReverse`/`startSnippet` (solo) duplikują `mpPlayLocal`/`mpPlayReverse` (MP).
- **Odsłona/reveal**: osobno solo (`check`→`line()`) i MP (`mpRender` faza `reveal`).
- Dobrze zrobione (DRY): `norm`/`textMatch`/`lev`, model meczu (`buildMatch`/`matchAdvance`) współdzielony solo+MP.

### SOLID (w praktyce N/A bez klas, ale duch zasad)
- **SRP** — łamane: funkcje mieszają stan + IO + DOM.
- **OCP** — łamane: dodanie nowego trybu wymaga dotknięcia wielu miejsc (`startAudio` dispatch, `mpPlayLocal`, `modesFor`, `MODE_LABEL`, picker). Brak jednego „rejestru trybów".
- **LSP/ISP** — N/A (brak abstrakcji).
- **DIP** — **kluczowo łamane**: logika wysokiego poziomu zależy wprost od konkretów (`new Audio`, `fetch`, `supabase`). Brak interfejsów = brak wymienialności = trudny port i trudne testy.

### Patterny — co pasuje
- **Maszyna stanów: TAK, wręcz prosi się.** `mpGame.phase` (`null`/`loading`/`arming`/`play`/`reveal`/`done`/`neterr`/`nolyric`) to już *nieformalny* FSM, obsłużony switchem w `mpRender`. Solo też (idle→loading→playing→reveal). Formalizacja (jawne stany, dozwolone przejścia, guardy) usunęłaby całą klasę bugów (podwójny `mpGo`, wyścig arming, rebuild guard).
- **Flux/Redux-like: już tu jest, nieświadomie.** MP = host-authority: jedno źródło prawdy (`mpGame`), akcje (`act`), host „reduce'uje". To dosłownie reducer — warto go wyekstrahować jako czystą funkcję `(state, action) → state`.
- **Repository**: brakuje. `itunes()` + fallbacki + playlisty + Spotify rozsiane. Powinien być `TrackRepository.resolve(catKey, mode) → Track`.
- **UseCase/Interactor**: „zbuduj mecz", „oceń odpowiedź", „następne pytanie", „zatwierdź odpowiedź drużyny" — to use-case'y, dziś jako luźne funkcje.
- **ViewModel**: brak. Stan i widok sklejone.

### Clean Architecture / Repository / UseCase / ViewModel — czy są?
Dziś: **nie ma żadnego z nich.** I dla *czystej webówki* to było OK. Ale skoro celem jest port — to właśnie te wzorce dają przenośność. Nie chodzi o ciężki „enterprise", tylko o **3 warstwy z jasnymi granicami** (niżej).

---

## 3. Portowalność: Flutter / iOS / Android / Godot

### Co przenosi się ŁATWO (czysta logika — przepisanie 1:1)
- Model meczu: `QPC`/`CPR`, `modesFor`, `buildMatch`, `matchSlot`/`matchAdvance`/`matchHeader`.
- Punktacja i dopasowanie: `norm`, `lev` (Levenshtein), `textMatch`, rok ±2.
- FSM multiplayera + reducer akcji (gdy wyekstrahowany).
- To są czyste algorytmy/dane → Dart, Swift, Kotlin, GDScript bez bólu.

### Co jest TRUDNE (zależne od platformy — wymaga adapterów)
- **Audio**: odtwarzanie zajawek, „od tyłu" (decode+reverse bufora), „fragment", TTS lektora. Na natywie *lepsze i prostsze* (Flutter `just_audio`/`audioplayers`, iOS `AVFoundation`, Android `ExoPlayer`, Godot `AudioStreamPlayer`).
- **Sieć**: na natywie **znika problem CORS** → edge functions `tracks`/`audio` (proxy CORS) **przestają być potrzebne** — można uderzać wprost w iTunes/Deezer. Backend się *kurczy*.
- **Realtime (multiplayer)**: Supabase ma SDK dla Flutter (`supabase_flutter`), iOS i Kotlin. Godot — trzeba by klienta WebSocket/własny.
- **Storage**: `localStorage` → `shared_preferences` / `UserDefaults` / `DataStore`.
- **UI/render**: cały DOM + innerHTML → natywne widoki. To jest „przepisz", nie „przetłumacz".

### Rekomendacja wyboru platformy
- **Jeśli natywnie → Flutter.** Najbliżej obecnej architektury (jeden codebase iOS+Android, może też web/desktop), świetne audio i oficjalne Supabase SDK, port czystego rdzenia z JS na Dart jest mechaniczny. Możesz nawet celować Flutter Web i częściowo reużyć obecny backend.
- **iOS/Android natywnie osobno** = 2× robota; sensowne tylko jeśli chcesz maksymalnej jakości audio/UX na każdej platformie osobno.
- **Godot** = tylko jeśli chcesz mocno „growego" feelingu (animacje, fizyka, efekciarstwo). Audio DSP (reverse) wykonalne, ale realtime i ekosystem słabsze do tego typu appki. Dla quizu muzycznego to overkill.
- **Web zostaje sensowny**, jeśli priorytetem jest zero-instalacji i natychmiastowy deploy. Wtedy refaktor (niżej) i tak się opłaca — pod testy i utrzymanie.

**Niezależnie od wyboru:** utrzymuj rdzeń czysty. Wtedy decyzja „web czy natywnie" przestaje być kosztowna — piszesz tylko nowe adaptery + UI wokół tego samego rdzenia.

---

## 4. Proponowana struktura docelowa (lekka, bez „enterprise")

Nawet w czystym JS (ES modules, bez frameworka) da się to rozdzielić tak, by port był tłumaczeniem:

```
core/                 # CZYSTE, zero DOM/Web API → przenośne na każdą platformę
  match.js            # QPC, CPR, modesFor, buildMatch, matchSlot/Advance/Header
  scoring.js          # norm, lev, textMatch, ocena tytuł/wykonawca/rok
  soloMachine.js      # FSM solo (idle→loading→playing→reveal→done)
  mpReducer.js        # (state, action) → state  +  FSM faz multiplayera
  types.js            # Match, Slot, Question, GameState (jsdoc/typedef)

ports/                # INTERFEJSY (kontrakty), implementacje per platforma
  AudioPort           # play/pause/reverse/snippet/seek + zdarzenia
  TrackRepository     # resolve(catKey, mode) → Track  (iTunes/Deezer/Spotify/cache)
  RealtimeTransport   # join/leave/broadcast/onMessage/presence
  KeyValueStore       # get/set (localStorage / prefs / UserDefaults)

adapters-web/         # implementacje webowe (obecny kod, posprzątany)
ui-web/               # renderery (zastępują dzisiejsze innerHTML)
```

Granica: `core` **nie wie**, że istnieje DOM, `fetch` czy Supabase. UI i adaptery zależą od `core`, nigdy odwrotnie (Dependency Inversion). To jest minimalna „clean architecture" wystarczająca do taniego portu.

---

## 5. PIĘĆ usprawnień obecnej wersji (konkretne, wykonalne)

1. **Wydziel czysty rdzeń do ES modules** (`core/match.js`, `core/scoring.js`, `core/mpReducer.js`) — bez DOM i Web API, ładowane przez `<script type="module">` (zero build-stepu). Największy zwrot pod port **i** testowalność. Dorzuć garść testów jednostkowych (`buildMatch`, `textMatch`, reducer) — dziś weryfikacja jest ręczna w przeglądarce.
2. **Sformalizuj maszynę stanów** — jawne stany + dozwolone przejścia + guardy zamiast 33 rozsianych `phase===`/`mode===`. Eliminuje całą klasę bugów (podwójny start, wyścig „arming", rebuild guard, który już raz ugryzł).
3. **Abstrakcja audio (`AudioPort`)** — jeden interfejs `play/pause/reverse/snippet/seek` + zdarzenia; usuwa duplikację solo (`startAudio`/`startReverse`/`startSnippet`) vs MP (`mpPlayLocal`/`mpPlayReverse`), centralizuje ikonę z realnych eventów, a na natywie podmieniasz tylko implementację.
4. **`TrackRepository` z cache** — schowaj iTunes/Deezer/Spotify/proxy/playlisty za jednym `resolve(catKey, mode)`; usuwa powtórki w solo i MP-host, daje jeden punkt na retry/timeout/anty-powtórki i jeden punkt do podmiany na natywie (gdzie nie ma CORS).
5. **Rozbij `mpRender`/`check` i ujednolić odsłonę** — jeden współdzielony renderer „pytanie/odsłona" solo+MP, mniejsze funkcje, HTML przez małe helpery zamiast wielkich literałów. Przy okazji: nazwane stałe zamiast magic numbers, sprzątanie martwego kodu, podstawowa dostępność (focus, aria).

---

## 6. PIĘĆ propozycji rozwoju aplikacji

1. **Brakujące tryby z prawdziwego pubquizu** — „kto pierwszy" (bzyczek/przycisk na czas), „intro coraz krótsze" (1 s → 0.5 s), „dokończ tekst", rok/album jako osobno punktowane pod-pytania. (Uwaga: stems/pianino/nucenie były świadomie odrzucone — wymagają ciężkiego ML offline, nie wracać do nich bez powodu.)
2. **Profile graczy + trening adaptacyjny** — konta (Supabase Auth), historia meczów, statystyki per kategoria/tryb, wykrywanie słabych punktów i **powtórki rozłożone w czasie** (spaced repetition) na nietrafionych utworach. To zamienia „grę" w realny *trener*.
3. **Rywalizacja między drużynami / ligi** — wspólna baza wyników, rankingi, sezonowe ligi, wyzwania asynchroniczne (ten sam mecz, różne czasy). Już zapisane w planach jako „później" — to naturalny next-level multiplayera.
4. **Edytor i społeczność treści** — UI do tworzenia własnych kategorii/playlist/tekstów (zamiast ręcznej edycji plików), współdzielenie kodem, „mecz dnia", więcej źródeł importu. Odblokowuje wzrost bez Twojej pracy nad contentem.
5. **Aplikacja natywna (Flutter) z offline + background audio** — pobrane paczki zajawek do grania bez sieci, lepsze efekty audio bez proxy, natywny lektor TTS (jakość > Web Speech), powiadomienia push („mecz za 10 min"), obecność w App Store / Google Play. To jednocześnie domyka temat portu z sekcji 3.

---

*Koniec raportu. Jeśli chcesz, następnym krokiem mogę zacząć od usprawnienia #1 (wydzielenie rdzenia do modułów) — to fundament pod wszystkie pozostałe i pod ewentualny Flutter.*
