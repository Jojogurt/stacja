# PLAN NAPRAWY — audyt 2026-07 (v42)

> Status: **WYKONANE** (v43–v49, gałąź `audyt-2026-07`). FAZY 0–6 wdrożone; testy zielone
> (462 rdzeń + 17836 danych + 28 serwer authorityRoom + 111 integracja jsdom).
> **Wymaga deployu workera** (`cd server && npm run deploy`) dla FAZY 1.1/1.3/3 — kod klienta
> jest forward-compatible (stary serwer nie psuje nowego klienta).
> **Dorobione później (v50):** 5.3 klawiatura mp-cand/pcz-exit/mp-hd-back→button,
> 5.6 wskaźnik reconnectu (onStatus w transportach + pasek), 5.7 nagłówek solo w grze.
> **Nadal odłożone** (świadomie): 1.6 salon promote (salonScreenId — zmiana serwera),
> 4.5 liczebniki PL/EN (ryzyko regresji), dedup transportów, matchHeader→obiekt, kosmetyka
> danych (18× answers.a[1]), oauth/auth hardening. P!nk≈Pink (tab. 4.4) niemechaniczne.
>
> Źródło: pełny audyt (architektura + UI/UX) oraz głębokie
> polowanie na bugi rozgrywki (MP + solo/audio/scoring/dane). Wszystkie znaleziska
> zweryfikowane w kodzie; scoringowe potwierdzone uruchomieniowo w node.
>
> Konwencja: każda faza kończy się zielonym `npm test` + `npm run test:dom`,
> podbiciem `APP_VERSION`↔`CACHE` i osobnym commitem. Fazy są niezależne —
> można je robić w dowolnej kolejności, ale kolejność poniżej to kolejność ryzyka.

---

## FAZA 0 — jednolinijkowce (15 min, natychmiast)

Trzy potwierdzone błędy, każdy fix ~1 linia:

- [ ] **0.1 XSS przez emotkę** — `app/mp.js:595` (`mpFloatEmoji`): `${emoji}` do innerHTML
  bez escapowania. Fix: whitelist u odbiorcy — `if(!REACTIONS.includes(emoji)) return;`
  na wejściu `mpFloatEmoji` (lepsze niż escapeHtml, bo emotki spoza listy i tak nie chcemy).
  `REACTIONS` importować z mp-render lub przenieść do współdzielonego miejsca.
- [ ] **0.2 Brak importu `isSpeaking`** — `app/mp.js:22`: dopisać `isSpeaking` do importu
  z `./lektor.js` (używane w `app/mp.js:355`; dziś tap gałki w MP-lektorze = ReferenceError).
- [ ] **0.3 Brak importu `resolveTrack`** — `app/mp.js`: dopisać import z
  `../adapters-web/itunesRepository.js` (używane w `mpHostNewRound`, `app/mp.js:497`;
  dziś rollback relay `?authority=0` martwy dla rund audio).
- [ ] **0.4 Martwa kategoria quizu** — dopisać `quiz-muzyka.json` do `data/quiz-index.json`
  (50 pytań nigdy się nie ładuje).

**Testy:** jsdom — tap gałki w MP w trybie lektor nie rzuca; `react` z emotką spoza
listy nie wstawia HTML; walidacja danych złapie quiz-muzyka automatycznie (test danych
liczy pliki z manifestu — sprawdzić, czy liczba pytań wzrośnie do 2350).

---

## FAZA 1 — deadlocki multiplayera (najwyższe ryzyko dla graczy)

### 1.1 Zgubione `ready` → pokój wisi w ARMING na zawsze [PEWNY]

`app/mp.js:334-344` + `adapters-web/roomTransport.js:105-108` + `server/authorityRoom.js:304-306`.
Klient zapisuje `S.lastArmNonce` PRZED wysłaniem `ready`; `send()` przy zamkniętym
sockecie zwraca `false` po cichu; po reconnect ten sam `armNonce` ⇒ ready nigdy nie ponowione.

**Fix — DOKŁADNA SPECYFIKACJA (bez decyzji do podjęcia):**

*Serwer (`server/authorityRoom.js`):* pole `readyIds` w rozsyłanym stanie.
1. W `newRound()` zaraz po `this.ready=new Set();` (linia ~302) dodać
   `this.game.readyIds=[];`.
2. W `maybeGoArming()` po przeliczeniu (`this.game.readyCount=r.count; ...`, linia ~327)
   dodać `this.game.readyIds=[...this.ready];` — PRZED `broadcastState()`.
   (Stan i tak jest persystowany — `readyIds` przeżyje evikcję razem z `ready`.)

*Klient (`app/mp.js`, `mpAfterSync`):* rozszerzyć warunek zbrojenia (linia ~237).
Zamiast:
```js
if(S.game && S.game.phase===MP.ARMING && S.game.armNonce!==S.lastArmNonce && !mpRevealPending()){
```
ma być:
```js
const needArm = S.game && S.game.phase===MP.ARMING && !mpRevealPending() &&
  (S.game.armNonce!==S.lastArmNonce ||
   (Array.isArray(S.game.readyIds) && !S.game.readyIds.includes(mpMe.id)));
if(needArm){
```
Uzasadnienie kompatybilności: stary serwer nie śle `readyIds` → `Array.isArray` false
→ zachowanie identyczne jak dziś (fix jest czysto addytywny; deploy klienta przed
workerem niczego nie psuje). Ponowne `mpArm()` z tym samym nonce jest bezpieczne:
`src` się nie zmienia (element ma go z pierwszego zbrojenia, przeglądarka nie
re-pobiera), a serwerowe `onReady` jest idempotentne (`Set.add`). NIE trzeba
rozróżniać „re-send ready" od „pełne zbrojenie".

*Relay (`?authority=0`):* analogicznie — host w `mpMaybeGo` (mp.js ~370) dopisuje
`S.game.readyIds=[...S.ready]` przed `mpBroadcast()`; klient używa tej samej gałęzi
`needArm` (kod wspólny, zero rozgałęzień po transporcie).

**Testy (jsdom, `test/integration.js`, fake WS z `test/domEnv.js`):**
1. Serwerowy stan ARMING z `readyIds:[]` (bez id klienta) i `armNonce` równym
   `S.lastArmNonce` → asercja: klient wysłał `{t:'action', action:{type:'ready'}}`
   ponownie (przechwycić w fake WS).
2. Stan ARMING z `readyIds:[mpMe.id]` → asercja: klient NIE wysyła nic (anty-pętla).
3. Stan bez pola `readyIds` (stary serwer) + `armNonce===lastArmNonce` → NIE wysyła
   (regresja starego zachowania).

### 1.2 Promote hosta w REVEAL po jego „dalej" → mecz zamrożony [PEWNY]

`app/mp.js:282-296` + `app/mp-render.js:117,138-141` + `server/authorityRoom.js:144-151`.
Nowy host ma `ack===revealNonce` ⇒ ekran czekania bez przycisku hosta; nikt nie wyśle `next`.

**Fix:**
- `mpRenderWaitNext`: gdy `S.host` — renderować przycisk „następne pytanie →"
  (woła `mpHostNextReveal`).
- Dodatkowo w handlerze presence po nabyciu hostowania (patrz 1.5): jeśli faza REVEAL
  i `S.ack===S.revealNonce` → od razu pokaż przycisk (załatwia się samo przez re-render).

**Test:** jsdom — REVEAL, gracz klika „dalej", potem presence-sync ustawia mu
`S.host=true` → asercja, że w DOM jest przycisk „następne".

### 1.3 NETERR/NOLYRIC pod autorytetem = ślepy zaułek [PEWNY]

`app/mp-render.js:142-146` + `server/authorityRoom.js:274-293` + `roomTransport.js:41`.
„Spróbuj ponownie" woła relay-owe `mpHostNewRound`, którego sync serwer ignoruje;
w protokole DO brak `retry`; `mpRenderNoLyric` w ogóle bez przycisku.

**Fix:**
- Serwer: nowa komenda `{t:'retry'}` (tylko od hosta, tylko w fazie NETERR/NOLYRIC)
  → ponowne `newRound()` na bieżącym slocie. Przy NOLYRIC z wyczerpaną pulą —
  `retry` powinno przeskoczyć slot (`matchAdvance`) zamiast kręcić się w kółko.
- Transport (`roomTransport.js`): metoda `retry()` wysyłająca `{t:'retry'}`.
- Render: `mpRenderNetErr`/`mpRenderNoLyric` — pod `SERVER_AUTH` przycisk hosta woła
  `S.ch.retry()`; nie-host widzi „host próbuje ponownie…". Ścieżka relay zostaje
  na `mpHostNewRound` (po fixie importu 0.3 znów działa).

**Testy:** rdzeń/serwer — patrz FAZA 3 (siatka authorityRoom): NETERR → retry → PLAY.

### 1.4 Klientowy auto-lock pod autorytetem (skew zegara = ucięte pytania) [PEWNY]

`app/mp.js:582-589` + `server/authorityRoom.js:208-210,336`.

**Fix:** w `mpTickTimer` gałąź auto-lock (`rem<=0 → mpLock()`) wykonywać TYLKO gdy
`!SERVER_AUTH` — serwer ma własny `scheduleAutoLock` i jest jedynym zegarem prawdy.
Tick zostaje dla paska czasu (sam rysunek reszty czasu może się różnić o skew — akceptowalne;
opcjonalnie: liczyć offset `serverNow - Date.now()` z pola `now` dodanego do broadcastu).
Przy okazji: gasić tick po locku także pod SERVER_AUTH (dziś `mpLock` robi return przed
`S.autoLocked=true` → spam `lock` co 500 ms).

**Test:** jsdom — pod SERVER_AUTH z `endsAt` w przeszłości klient NIE wysyła `lock`.

### 1.5 Brak re-renderu po zmianie `S.host` (przycisk Zatwierdź się nie pojawia) [PRAWDOPODOBNY]

`app/mp.js:167-171`.

**Fix:** w handlerze presence porównać starą i nową wartość `S.host`; przy zmianie —
zawsze `mpRender()` (niezależnie od fazy). To domyka też 1.2.

### 1.6 Salon: promote przenosi rolę TV na gracza [PEWNY]

`server/authorityRoom.js:144-151,225-229` + `app/mp-render.js:28` + `core/teams.js:48-52`.

**Fix (serwer):** trzymać osobno `salonScreenId` (id konta, które wystartowało mecz
salonowy). `mpIsSalonHost` = `mpMe.id===game.salonScreenId` zamiast `S.host && game.salon`.
Promote hosta (uprawnienia do lock/next) nie zmienia wtedy widoku nikomu; `playersOf()`
filtruje `salonScreenId`, nie `hostId` — awansowany gracz zostaje w drużynie.
Reclaim TV po powrocie: bez zmian (starterId).

**Testy:** rdzeń — `reconcileTeams`/`playersOf` z rozdzielonym `salonScreenId`;
jsdom — po promote gracz nadal widzi pola typowania.

### 1.7 Późny dołączający widzi aktywny formularz, akcje po cichu ignorowane [PEWNY]

`core/mpReducer.js:62-63` + `app/mp.js:194`.

**Fix:** w renderze PLAY: gdy `teamOf(S.game, mpMe.id)===null` → baner
„Dołączysz od następnego pytania" + inputy disabled. Bez zmian w reducerze
(odrzucanie jest poprawne — problem jest tylko prezentacyjny).

### 1.8 Mniejsze MP (zrobić przy okazji tej samej fazy)

- [ ] Relay: komunikat „host zniknął" gdy presence przestaje zawierać hosta
  w trakcie meczu (`app/mp.js:162,176`) — relay nie ma promote, więc chociaż komunikat.
- [ ] Martwa zajawka w PLAY: w catchu `play()` rozróżnić `err.name==='NotAllowedError'`
  (→ obecne „stuknij ▶") od reszty (→ „brak zajawki — kombinujcie bez niej", bez pętli)
  — `app/mp.js:349,366-368,388-391`. Dodać listener `error` na trwałym elemencie.
- [ ] Salon: po rozłączeniu gracza w REVEAL przeliczyć komplet „dalej"
  (`app/mp.js:271-280` — wywołać przeliczenie także z handlera presence).
- [ ] `mpRenderWaitNext` pokazuje stare `readyCount/readyTotal` z ARMING — ukryć licznik
  w REVEAL albo słać z serwera aktualny.
- [ ] `mpLeave` nie czyści `S.timerInt` (`app/mp.js:100-111`).

---

## FAZA 2 — audio solo: token rundy (jedna zmiana, cztery bugi)

### 2.1 Token rundy `soloGen` (wzór: `lektorGen` z app/lektor.js)

Licznik w stanie solo, inkrementowany w: `newRound`, `finishMatch`/`sessEnd`, zmianie trybu.
Każda ścieżka asynchroniczna łapie token przed `await`/callbackiem i sprawdza po:

- [ ] `newRound` (`app/solo.js:196-224`): po `await resolveTrack` — jeśli token się
  zmienił, **porzucić wynik** (nie ustawiać `current`, nie startować audio).
  Naprawia: zajawka nad podsumowaniem po „Zakończ" (bug 11 z raportu).
- [ ] `startAudio` (`app/audio.js`): **zawsze** wołać `stopAudio()` na wejściu.
  Naprawia: dwa utwory naraz po kliku w gałkę podczas strojenia (bug 12).
- [ ] `toggleAudio` (`app/audio.js:101-121`): guard `busy` — podczas ładowania pytania
  gałka nieaktywna (spójne z wyłączonymi przyciskami).
- [ ] `playReverse` (`app/audio.js:79-92` + `adapters-web/webAudio.js:54-72`): przekazać
  `shouldPlay: () => gen===soloGen && !!current` (jak robi MP przez `aborted`);
  w `startReverse` guard przed podwójnym startem (flaga „decoding in progress").
  Naprawia: dwie odwrócone zajawki naraz + stary utwór wspak nad summary (bug 13).
- [ ] `lektor.js:21` — `u.onend` sprawdza `lektorGen` (jak reszta `lektorPlay`);
  analogicznie listener `pause` w `bindAudioUI` (`app/audio.js:34`) — ignorować
  eventy z elementu, który nie jest bieżącym `audio`. Naprawia bug 16.

### 2.2 Odporność na błędy sieci w rundzie

- [ ] Listener `error` na elemencie audio w `startSnippet` i `startAudio`
  (`app/audio.js:59-76`): przy 404/stall → komunikat „zajawka niedostępna" +
  `armControls()` (pomiń/sprawdź aktywne). Naprawia soft-lock trybu „fragment" (bug 14).
- [ ] Błąd losowania w środku meczu (`app/solo.js:216-221`): przy `t.error` —
  wyzerować `current`, pokazać przycisk „spróbuj ponownie" (ponowne `newRound()`
  na tym samym slocie) + „pomiń pytanie". Naprawia podwójną ocenę tego samego
  pytania i duplikat w `session.results` (bug 15).
- [ ] Timeout globalny na `resolveFromArtists` (`core/trackSelect.js:52-70`):
  cap całkowity (np. 20 s) zamiast kaskady per-artysta × proxy — po capie `t.error`
  i ścieżka wyżej. (Bug 6 — kilkuminutowy spinner.)

### 2.3 Lektor — porządki

- [ ] Wyczerpanie tekstów: czyścić z `seenTracks` tylko własne wpisy (prompty lektorskie),
  wzór z `newQuizRound` (`app/solo.js:299`), zamiast `seenTracks.clear()`
  (`app/solo.js:268-269`). Naprawia powtórki muzyki w tym samym meczu (bug 17).
- [ ] Piper: `URL.revokeObjectURL` także przy stopie w połowie (bug 18).

**Testy:** rdzeń — timeout `resolveFromArtists` (wstrzyknięty fake itunes, który wisi);
jsdom — „Zakończ" w trakcie strojenia nie startuje audio (fake resolveTrack z opóźnionym
promise); klik gałki podczas strojenia nie gra; error na elemencie audio odblokowuje „pomiń".

---

## FAZA 3 — serwer: bezpieczeństwo i uczciwość gry

### 3.1 Wyciek typów przeciwnych drużyn [KRYTYCZNY dla trybów Solo/Drużyny]

`server/authorityRoom.js:231` (`broadcastState` rozsyła cały `game` z `byTeam` wszystkich).

**Fix — DOKŁADNA SPECYFIKACJA:**

Zastąpić ciało `broadcastState()` (authorityRoom.js:231) wysyłką per-połączenie.
Okrajanie TYLKO przy wysyłce — `this.game` i `persist()` bez zmian (pełny stan).

```js
// authorityRoom.js — zamiast broadcast(JSON.stringify({t:'state', game:this.game}))
broadcastState(){
  for(const c of this.getConnections()){
    const id=c.state && c.state.id; if(!id) continue;
    try{ c.send(JSON.stringify({ t:'state', game:this.viewFor(id) })); }catch(_e){}
  }
}
// widok stanu dla odbiorcy: cudze buckety drużyn okrojone do liczników w fazie odpowiedzi
viewFor(id){
  const g=this.game;
  if(!g || !g.byTeam || g.phase!==MP.PLAY) return g;          // pełny stan poza PLAY
  if(g.salon && id===this.hostId) return g;                    // TV/sędzia widzi wszystko
  const myTeam=teamOf(g, id);                                  // import z core/mpReducer
  const myTid=myTeam && myTeam.id;
  const byTeam={};
  for(const tid of Object.keys(g.byTeam)){
    const b=g.byTeam[tid];
    byTeam[tid] = (tid===myTid) ? b : {
      proposals:{}, votes:{}, pass:b.pass,                     // kształt zachowany (stary render nie padnie)
      sure:b.sure,                                             // pewniak jest publiczny (roster go pokazuje)
      counts:{ proposals:Object.keys(b.proposals||{}).length,
               votes:Object.keys(b.votes||{}).length },
    };
  }
  return { ...g, byTeam };                                     // płytka kopia — reszta pól współdzielona
}
```
Uwagi wykonawcze:
- `teamOf` już jest importowane w innych miejscach serwera przez `core/mpReducer` —
  dopisać do istniejącego importu (linia 25).
- `onConnect` (linia 139) i `case 'hello'` (linia 176) wysyłają stan bezpośrednio —
  podmienić `game:this.game` na `game:this.viewFor(id)` (w onConnect id już jest;
  w hello wziąć z `conn.state`).
- Klient: render czyta wyłącznie własny bucket (potwierdzone w audycie), więc zmiana
  jest niewidoczna dla uczciwego klienta. Jeśli jakiś licznik postępu rywali będzie
  kiedyś potrzebny — czytać `byTeam[tid].counts` z fallbackiem `Object.keys(...).length`.
- REVEAL/DONE/ARMING/LOADING: pełny stan (warunek `phase!==MP.PLAY` to załatwia;
  w REVEAL buckety są już jawne z definicji odsłony).

### 3.2 Spoofowalna liga

`server/api.js:216-224` + `server/lib/recordMatch.js`.

**Fix:** serwerowy cap z konfiguracji meczu: `total_questions ≤ MAX_ROUNDS×CPR×QPC`
(stałe z `core/match.js`), `score ≤ total_questions×2+BONUS_MAX`, cap per-participant
(`score`, `correct_count ≤ total_questions`). Odrzucać, nie przycinać (błąd 400).
Docelowo (poza tym planem): zapis wyniku MP wyłącznie z Durable Object
(serwer-autorytet już zna prawdziwy wynik — `finish()`), a `/api/record-match`
zostawić tylko dla solo z niskim capem.

### 3.3 Capy długości wejścia gracza

- `reduceAction` (`core/mpReducer.js:70,86-87`): `String(v).slice(0,120)` na wartości
  slotów w `propose`/`vote` (w rdzeniu — chroni też relay).
- `authorityRoom.js:185-187` (relay eventów czat/emotki): cap rozmiaru payloadu
  (np. 500 B po JSON.stringify; emotki dodatkowo whitelist), prosty rate-limit
  per-połączenie (np. 10 eventów/s).
- Cap `?name=` i `byName` (np. 40 znaków) przy wejściu do pokoju.

### 3.4 Race podwójnego `next` hosta

`server/authorityRoom.js:359-364`: guard `if(this.game.phase!==MP.REVEAL) return;`
na wejściu `next()` (analogicznie `start()` — tylko z lobby/DONE).

### 3.5 Mniejsze serwerowe

- [ ] `finish()` — `console.warn` w catchu zapisu do D1 (`authorityRoom.js:375`).
- [ ] `MP_SNIP_WINDOW_S` — import z `core/timing.js` zamiast kopii (`authorityRoom.js:34`).
- [ ] Dedup `fromItunes`/`fromDeezer` → wspólny moduł `server/lib/normalize.js`
  (uwaga: wersje już rozjechane — docelowa MUSI filtrować `.filter(t=>t.previewUrl)`).
- [ ] `beerTally` kluczowane po id gracza, nie nicku (`authorityRoom.js:351`).
- [ ] Tokeny: `exp` obowiązkowy dla nowych, data graniczna `iat` dla starych (auth.js:37).
- [ ] `vote` waliduje `a.slot` względem `answerSlots`; `unpropose` zwraca `false`
  gdy nic nie usunął (mpReducer.js:78-80).

### 3.6 Testy authorityRoom (największa luka testowa)

**Lokalizacja i uruchamianie:** `server/test/authority.test.js` (klasa zależy od
pakietu `partyserver`, który jest w `server/node_modules` — NIE da się jej importować
z korzeniowego `test/run.js` bez zależności). Do `server/package.json` dodać
`"test": "node test/authority.test.js"`, a do korzeniowego `package.json` rozszerzyć
`"test"` o `&& npm --prefix server test --silent`. Helpery `group/ok/eq` skopiować
z `test/run.js` (30 linii) albo wydzielić do współdzielonego `test/lib/mini.js`.

**Szkielet fake'ów (wystarczający — klasa używa tylko tych API):**
```js
import { GameAuthority } from '../authorityRoom.js';
import { MP } from '../../core/phases.js';

class FakeStorage {
  #m=new Map(); #alarm=null;
  async get(keys){ return Array.isArray(keys)
    ? new Map(keys.map(k=>[k,this.#m.get(k)])) : this.#m.get(keys); }
  async put(obj){ for(const k of Object.keys(obj)) this.#m.set(k,obj[k]); }
  async setAlarm(ts){ this.#alarm=ts; }
  async deleteAlarm(){ this.#alarm=null; }
  async deleteAll(){ this.#m.clear(); this.#alarm=null; }
}
class FakeConn {
  sent=[]; state=null; closed=null;
  constructor(id,name){ this.state={id,name,verified:true}; }
  send(s){ this.sent.push(JSON.parse(s)); }
  setState(s){ this.state=s; }
  close(code,why){ this.closed={code,why}; }
  last(t){ for(let i=this.sent.length-1;i>=0;i--) if(this.sent[i].t===t) return this.sent[i]; }
}
function makeRoom(){
  const ctx={ storage:new FakeStorage(), blockConcurrencyWhile:(fn)=>fn() };
  // Server z partyserver — konstruktor przyjmuje (ctx, env); jeśli wymaga więcej,
  // utworzyć przez Object.create(GameAuthority.prototype) i ręcznie wywołać
  // logikę konstruktora (wczytanie storage) — preferować zwykłe `new`.
  const room=new GameAuthority(ctx, { TOKEN_SECRET:'x' });
  const conns=[];
  room.getConnections=()=>conns;                 // nadpisanie API partyserver
  room.broadcast=(s)=>conns.forEach(c=>c.send(s));
  room.name='TEST';
  room.join=(id,name)=>{ const c=new FakeConn(id,name); conns.push(c);
    if(!room.hostId) room.hostId=id; room.pushPresence(); return c; };
  room.drop=async(c)=>{ conns.splice(conns.indexOf(c),1); await room.onClose(c); };
  room.msg=(c,obj)=>room.onMessage(c, JSON.stringify(obj));
  return {room, conns};
}
// Pule bez sieci: mecz TYLKO quiz/lektor (resolveTrackServer nie jest wołane).
const POOLS={ q1:{ label:'Quiz', questions:[
  {prompt:'2+2?', slots:[{key:'a',label:'odp'}], answers:{a:['4','cztery']}},
  {prompt:'3+3?', slots:[{key:'a',label:'odp'}], answers:{a:['6']}},
  /* …≥ rounds×QPC pytań */ ]}};
const CONFIG={ rounds:1, timer:0, modes:['quiz'], format:'coop', pools:POOLS };
```
Konwencja scenariusza: `join` graczy → `msg(host,{t:'start',config})` → asercje na
`conn.last('state').game.phase` → `msg(c,{t:'action',action:{type:'ready',armNonce}})` itd.
Timery: auto-lock testować z `timer:1` + `await new Promise(r=>setTimeout(r,1100))`
(realny setTimeout — 1 s w teście jest akceptowalny) albo wołać `room.lock()` wprost.

**Scenariusze (kolejność implementacji):**
1. start → ARMING (armNonce=1, readyTotal=2) → ready obu (z nonce) → PLAY →
   action propose/vote → lock → REVEAL (reveal≠null, scores policzone) → next →
   … → DONE (mvp/tallyList).
2. ready ze złym `armNonce` NIE zwiększa `readyCount`; podwójne ready od tego
   samego id — idempotentne; `readyIds` w stanie ARMING zawiera zgłoszonych (po 1.1).
3. auto-lock: `timer:1` → po ~1.1 s faza REVEAL bez `lock` od hosta; ręczny `lock`
   przed upływem → dokładnie jedno przejście do REVEAL (drugie `lock()` no-op).
4. promote: `drop(host)` → `hostId===drugi gracz`, stan spójny; powrót startera
   (`join` z jego id + `onConnect`-owa ścieżka reclaim — wywołać logikę wprost,
   bo fake nie przechodzi przez onConnect: ustawić `starterId` i sprawdzić warunek).
5. `msg(host,{t:'next'})` w fazie PLAY → faza bez zmian (guard 3.4);
   `{t:'retry'}` w NETERR → ponowne LOADING→ARMING (po 1.3; NETERR wywołać pulą
   `{}` → `netReason:'nocat'`).
6. `clampPools`: 30 kategorii → 24; utwór z `lyric` 20 000 znaków → przycięty do 12 000;
   `clampQuestion`: brak `answers` dla slotu → null; 8 slotów → 6.
7. po 3.1: `viewFor(graczA)` w PLAY — `byTeam[teamB].proposals` puste,
   `counts.proposals` poprawne; `viewFor` w REVEAL — pełne buckety; salon-host — pełne.
8. `server/lib/auth.js` sign/verify (czysty node:crypto — może być w tym samym pliku):
   poprawny token przechodzi, zmieniony 1 bajt payloadu odrzucony, `exp` w przeszłości
   odrzucony.
9. record-match (po 3.2): `total_questions` &gt; MAX → 400; `participants[].score` &gt;
   cap → 400 (testować czystą funkcję walidującą wydzieloną z api.js).

---

## FAZA 4 — scoring (zasady ROZSTRZYGNIĘTE — implementować wg tabel poniżej)

Kolejność wykonania: NAJPIERW dopisać wszystkie przypadki z tabel do `test/run.js`
(grupa `scoring.zasady-2026-07`), zobaczyć czerwone, potem zmieniać `core/scoring.js`
aż wszystko zielone — bez psucia istniejących testów (te są nadrzędne; konflikt
z tabelą = zgłosić w komentarzu commita, tabela ustępuje).

- [ ] **4.1 Duety/feat po separatorach** — w gałęzi dopasowania WYKONAWCY (nie tytułu!):
  oczekiwany string splitować po separatorach `&`, `,`, ` x `, ` i ` (PL), ` feat`, ` ft`
  (regex: `/\s*(?:&|,|\bfeat\.?\b|\bft\.?\b|\bx\b|\bi\b)\s*/i` na ZNORMALIZOWANYM tekście);
  odpowiedź zalicza się, gdy pasuje (istniejącym `textMatch`) do CAŁOŚCI **lub**
  KTÓREGOKOLWIEK członu długości ≥3 po normalizacji. Człony <3 znaki (np. „i")
  ignorować. Odpowiedź gracza NIE jest splitowana.
  | odpowiedź | oczekiwane | wynik |
  |---|---|---|
  | Queen | Queen & David Bowie | ✓ |
  | David Bowie | Queen & David Bowie | ✓ |
  | Bowie | Queen & David Bowie | ✗ (człon to „david bowie", containment wg starych reguł) |
  | Sanah | sanah i Vito Bambino | ✓ |
  | Vito Bambino | sanah i Vito Bambino | ✓ |
  | Queen David | Queen & David Bowie | ✗ (żaden pojedynczy człon) |
- [ ] **4.2 Lev≤1 od 6 znaków** — w `textMatch` warunek gałęzi Levenshteina zmienić
  z `len>=4` na `len>=6` (długość dłuższego z porównywanych po normalizacji);
  dla 4-5 znaków wymagane dokładne dopasowanie po normalizacji.
  | odpowiedź | oczekiwane | wynik |
  |---|---|---|
  | Stan | Stay | ✗ (regresja luzu) |
  | Light | Night | ✗ |
  | Bohemian Rapsody | Bohemian Rhapsody | ✓ (bez zmian, ≥6) |
  | Halo | Halo | ✓ |
- [ ] **4.3 Przedimki** — usuwanie `de/le/la/the/a/an` w `norm` wykonywać TYLKO gdy
  po usunięciu zostaje ≥6 znaków ŁĄCZNIE lub ≥2 tokeny; w przeciwnym razie zostawić
  tekst nietknięty (rozszerzenie istniejącej ochrony przed redukcją „A"→pusty).
  | wejście norm | wynik |
  |---|---|
  | De La Soul | „de la soul" (bez redukcji — po usunięciu zostałby 1 token „soul" <6) |
  | The Beatles | „beatles" (≥6 znaków — bez zmian wobec dziś) |
  Odpowiedź „Soul" dla „De La Soul": ✗. Odpowiedź „De La Soul": ✓.
- [ ] **4.4 Leet warunkowo** — JEDNA reguła, bez wyjątków: de-leet (mapowanie cyfr
  5→s, 0→o, 3→e, 1→i, 4→a) stosować jako DRUGĄ próbę dopasowania — tylko gdy
  pierwsza próba (bez de-leet) nie przeszła ORAZ strona zawierająca cyfrę ma
  po normalizacji ≥6 znaków. Krótkie kody typu „50s" nigdy nie wchodzą w de-leet.
  | odpowiedź | oczekiwane | wynik |
  |---|---|---|
  | sos | 50s | ✗ („50s" ma 3 znaki < 6 — de-leet nie startuje) |
  | P!nk | Pink | ✓ (interpunkcja usuwana w norm, nie leet) |
  | istniejące leet-testy z test/run.js | | muszą zostać ✓ (jeśli któryś ma tekst <6 znaków — podnieść próg tego testu do rangi wyjątku i zgłosić w commicie) |
- [ ] **4.5 Liczebniki PL/EN 1-12** — w `norm`: słownikowa zamiana całych tokenów
  `jeden/dwa/…/dwanaście`, `one/two/…/twelve`, `pierwsza/druga/…` (mianownik+żeński)
  → cyfra. „część druga"≈„część 2" ✓, „two of us"≈„2 of us" ✓. Wykonać jako ostatnie;
  jeśli którykolwiek istniejący test się wywali — wycofać 4.5 w całości i zostawić
  TODO (niski priorytet, nie blokuje fazy).

---

## FAZA 5 — UI/UX i dostępność

- [ ] **5.1 Apostrof w `escapeHtml`** (`core/util.js:11`): dodać `'`→`&#39;`
  + w `mp-picker.js:120`, `social.js:91` przejść z inline `onclick('${...}')`
  na `data-*` + delegację (wzór: `mp-cand`, `mp-render.js:189`).
- [ ] **5.2 `r.art` w atrybucie src** (`mp-render.js:486`): escape + walidacja `^https?://`.
- [ ] **5.3 Klawiatura w MP**: `mp-cand` (głosowanie) → `<button>` zamiast div
  (dziedziczy focus/Enter/Space za darmo); `.pcz-exit`, `.mp-hd-back` → button;
  style guzików wyzerować (`all:unset`-podobne klasy już są w projekcie dla toggli).
- [ ] **5.4 `aria-live`**: `mp-state` i countdown → `role="status" aria-live="polite"`
  (wzór: solo, index.html:1347); feed czatu → `aria-live="polite"` na kontenerze.
- [ ] **5.5 Kontrast**: `--muted` z `#AFAFAF` → ≥`#767676` (jasny motyw, 4.5:1);
  przejrzeć hardcody `#9a958c`, `#bdb8ae` przy labelkach 9-13px → podpiąć pod zmienną.
- [ ] **5.6 Wskaźnik reconnectu**: transporty (cfChannel/roomTransport) emitują
  `onStatus('reconnecting'|'ok')` → mały pasek „łączę ponownie…" nad ekranem MP.
- [ ] **5.7 Nagłówek ekranu solo w grze**: po starcie meczu tytuł „Ułóż mecz" → np.
  „Runda" / nazwa kategorii.
- [ ] **5.8 Kopia „stacja.app/?room="** (index.html:1250): podmienić na realny origin
  (`location.origin`) generowany w JS zamiast hardcodu.
- [ ] **5.9 Manifest**: usunąć `orientation:"portrait"` (salon/TV) lub zmienić na `any`;
  rozdzielić ikony `any` i `maskable`.
- [ ] **5.10 `plSave` w try/catch** (`app/catalog.js:37`) + `plRemove` czyści klucz
  z `soloCats` (`app/solo.js:107`).

---

## FAZA 6 — porządki (bez zmiany zachowania)

- [ ] Martwy JS: `mpRenderMembers` (mp.js:211), `mpPrefillName` (social.js:58),
  `mpAnswerBlockHTML`/`mpReactsOnlyHTML`/`mpLockBtnHTML`/`mpFocusTyp` (mp-render.js);
  zadeklarować `S.startTimer` w mp-state.js.
- [ ] Martwy CSS w index.html: bloki `.menu-btn/.menu-sub`, `.mp-head/.liga-*/.profil-card`,
  `.mp-prop/.mp-vote/...`, `.sess-setup/.lenpick`, stare v1 `.mp-rail/.mp-cand/...`
  (konflikt z v2), duplikat `body.solo.playing .dial`.
  **Uwaga na pułapkę z CLAUDE.md**: po każdym cięciu grep za id/klasami w stringach JS.
- [ ] Dedup transportów cfChannel/roomTransport → wspólna baza (connect/reconnect/backoff)
  + delta protokołu. Zrobić PO fazie 1 i 5.6 (żeby nie refaktorować dwa razy).
- [ ] `matchHeader` zwraca obiekt zamiast HTML (prezentacja poza core) — przy okazji.
- [ ] SW: ograniczyć runtime-cache do SHELL albo dodać limit wpisów (sw.js:60-63).
- [ ] Kosmetyka danych: 18 rozjazdów `answers.a[1]` vs tekst opcji (lista w raporcie
  agenta — quiz-biologia#16, quiz-informatyka#19, quiz-marvel#96-97, …);
  duplikat „Turn The Lights Off" w playlists; rozważyć klucz `seen` = tytuł+artysta.
- [ ] Komentarz timing.js:31 (zakres okna) — poprawić na `[0.5..16]`.
- [ ] oauth.js: negative-cache nieznanego `kid`; auth.js: `unescape` → `decodeURIComponent`-owy odpowiednik.

---

## Kolejność wdrożenia i wersje

| Krok | Zakres | Wersja |
|------|--------|--------|
| 1 | FAZA 0 (jednolinijkowce) | v43 |
| 2 | FAZA 1.1-1.4 (deadlocki MP) | v44 |
| 3 | FAZA 2 (audio solo, token rundy) | v45 |
| 4 | FAZA 3.1-3.4 + 3.6 (serwer + testy DO) | v46 (deploy workera!) |
| 5 | FAZA 1.5-1.8 + 5 (UX/a11y) | v47 |
| 6 | FAZA 4 (scoring — zasady rozstrzygnięte w tabelach) | v48 |
| 7 | FAZA 6 (porządki) | v49 |

Zasady: (a) FAZA 3 wymaga deployu workera — klient i serwer wersjonować razem,
stary klient musi przeżyć nowy serwer (okrojone `byTeam` zachowuje kształt bucketów,
patrz `viewFor`); (b) scoring: zasady rozstrzygnięte w tabelach FAZY 4 — implementować
bez dopytywania, tabele są źródłem prawdy, a istniejące testy nadrzędne;
(c) każda faza osobny commit + wpis wersji.
