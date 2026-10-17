/* server/authorityRoom.js — POKÓJ jako AUTORYTATYWNY serwer gry (Durable Object).
 *
 * TASK 6.2. W przeciwieństwie do `gameRoom.js` (relay) — to TU żyje pętla gry:
 * losowanie utworu, faza gotowości, serwerowy timer/auto-lock, ocena odpowiedzi,
 * sekwencja rund, zapis meczu. Odpala TEN SAM rdzeń co web (`core/mpReducer.js`,
 * `core/phases.js`, `core/match.js`, `core/trackSelect.js`) — przenosiny logiki, nie
 * przepisywanie. Klient staje się cienki (render + lokalne audio + input).
 *
 * Osobna klasa/trasa od relay → `/parties/game-authority/<kod>`. Żywy relay nietknięty;
 * klient wybiera transport flagą (6.3). Tożsamość połączenia z PODPISANEGO TOKENU (6.1):
 * pole `by` akcji jest WYMUSZANE z tożsamości połączenia — koniec spoofowania.
 *
 * Protokół (JSON/WS):
 *   klient → DO:  {t:'hello'} · {t:'start', config} (host) · {t:'action', action}
 *                 (propose/vote/unpropose/pass/ready) · {t:'lock'} (host) · {t:'next'} (host)
 *                 · {t:'go'} (host, F2b #6: „pomiń czekających" w ARMING)
 *   DO → klient:  {t:'state', game, serverNow}  (BEZ sekretu — pełny utwór tylko w game.reveal przy REVEAL;
 *                 P1-2: serverNow = zegar serwera do korekty skew klienta; game.listenEndsAt/endsAt w czasie serwera;
 *                 P1-3: game.allDoneAt = termin auto-zamknięcia, gdy wszyscy obecni dali typ/pas;
 *                 P0-1: game.tvId = TV salonu (osobna rola, nie aktualny host); P1-11: game.names = {id: ksywa})
 *                 {t:'presence', members, hostId, modes}  (F8a: `modes` = tryby, które ten serwer zna —
 *                 capability dla pickera MP; stary serwer bez pola → klient ukrywa nowe tryby)
 *                 + `caps:['tableTaste']` i `shelves:[{id,n}]` (gust etap 3: kto z OBECNYCH dosłał półkę i ile utworów)
 *   klient → DO:  {t:'shelf', items:[{title,artist,year}]} — „🎧 Gust stołu": top ❤️ gracza (≤ 20, sanityzowane;
 *                 [] = wycofaj). Trzymane w stanie pokoju (storage DO, sprzątane z pokojem) — NIGDY w D1.
 *
 * SEKRET: pełny utwór (current) trzymany POZA `game`; do `game.reveal` trafia dopiero przy lock.
 * PERSYSTENCJA: stan w `ctx.storage` (przeżyć eviction DO w trakcie meczu).
 * PROMOTE: host wyjdzie → awans najstarszego obecnego (rola `hostId` w stanie). F2b #3: tylko gdy
 * NIE został żaden inny socket z id hosta (druga karta / reconnect przed zamknięciem starego);
 * pusty pokój → hostId zostaje (czeka na powrót), a nieobecnego hosta przejmuje pierwszy łączący.
 */
import { Server } from 'partyserver';
import { verifyToken } from './lib/auth.js';
import { reduceAction, evaluateAnswer, applyEvaluation, slotsFor, countReady, teamOf, tvIdOf, allSettled } from '../core/mpReducer.js';
import { buildTeams, emptyByTeam, reconcileTeams, joinTeam } from '../core/teams.js';
import { MP, assertMp } from '../core/phases.js';
import { buildMatch, matchAdvance, sanitizeMpConfig, MP_MODES } from '../core/match.js';
import { isSlotKey, clipText } from '../core/util.js';
import { REACTIONS } from '../core/chatFeed.js';
import { sanitizeDraft, DRAFT_PAYLOAD_MAX } from '../core/matchSetup.js';   // szkic meczu dla gości (lobby)
import { buildMpRecord, noteAnswerers } from '../core/matchRecord.js';
import { norm, quizKey, shuffleMC, parseYear, clampQuizTrack, quizListen } from '../core/scoring.js';
import { buildTrackMC, yearReliable } from '../core/trackSelect.js';
import { lektorLang, catLektorLang } from '../core/lektorVoice.js';   // język lektora (pl|en) z puli
import { mpSnipOffset, MP_ARM_TIMEOUT_MS, MP_INTRO_MS, MP_ALL_DONE_GRACE_MS, listenSecs, phaseDeadlines } from '../core/timing.js';   // 3.5: jedno źródło okna fragmentu; F2b #6: limit ARMING; P1-2/P1-3
import { resolveTrackServer, resolveDistractorsServer } from './lib/resolve.js';
import { insertMatch } from './lib/recordMatch.js';
import { sanitizeTableShelf, buildTablePool, tablePoolCategory, TABLE_KEY, TABLE_MIN_SONGS } from '../core/tasteCompare.js';

const ROOM_TTL_MS = 15*60*1000;      // sprzątanie storage pustego pokoju po 15 min (karencja na reconnect)
const POOL_MAX_CATS = 24;            // defensywne capy pul (DO nie ufa rozmiarowi od klienta)
const POOL_MAX_SONGS = 120;
const POOL_LYRIC_MAX = 12000;        // max długość tekstu (lektor) na utwór
const POOL_MAX_QUESTIONS = 200;      // cap pytań (wiedza ogólna) na kategorię
const POOL_MAX_SLOTS = 6;            // cap slotów odpowiedzi na pytanie
const POOL_MAX_VARIANTS = 12;        // cap wariantów poprawnej odpowiedzi na slot
const POOL_PROMPT_MAX = 600;         // max długość treści pytania
const POOL_MAX_ITEMS = 24;           // F3: `pool` (sloty wymienne) — max pozycji na pytanie
const POOL_MAX_ALIASES = 8;          //     max aliasów na pozycję
const POOL_ALIAS_MAX = 120;          //     max długość aliasu
const FUN_MAX = 300;                 //     ciekawostka (odsłona)
const NAME_MAX = 40;                 // 3.3: cap długości nicka (?name= / track / byName)
const EVENT_PAYLOAD_MAX = 500;       // 3.3: cap rozmiaru payloadu ulotnego eventu (po JSON.stringify)
// 3.3: whitelist emotek — F6b: wspólna z klientem (core/chatFeed.js), 🖕 → 🍺
// F1 (#1): JEDYNE ulotne eventy przekazywane między klientami (musi = adapters-web/roomTransport.js
// RELAY_EVENTS). Stan gry NIGDY nie idzie eventem — tylko {t:'state'} od DO ('sync'/'act' odrzucane).
// 'draft' = szkic konfiguracji meczu od hosta (lobby, „Mecz, który ustawia host") — TYLKO od hosta, tylko poza grą,
// sanityzowany (core/matchSetup.sanitizeDraft), z osobnym limitem; ostatni zapamiętany dla dochodzących (hello).
export const RELAY_EVENTS = ['react','say','typing','advanced','draft'];
// F1 (#14): token bucket per połączenie dla wszystkich typów wiadomości (rate/s, burst)
const RATE = {
  event:  { rate:10, burst:10 },   // emotki/czat/typing/advanced (dawny allowEvent 10/s)
  action: { rate:8,  burst:20 },   // propose/vote/sure/pass/ready — każda = broadcast + persist
  meta:   { rate:1,  burst:4  },   // hello/track — każda = pushPresence do wszystkich
  start:  { rate:0.2, burst:3 },   // start (host) — buildMatch + pełny broadcast; lock/next/retry są
                                   // strzeżone fazą (no-op poza PLAY/REVEAL/NETERR) → bez limitu
  draft:  { rate:2,   burst:6 },   // szkic meczu (host w pickerze; klient i tak debounce'uje)
};
const SLOT_LABEL_MAX = 40;
export const CAPS = ['tableTaste'];   // gust etap 3: capability w presence (stary serwer bez pola → klient chowa „Gust stołu")
const SHELVES_MAX = 32;               // max półek w pamięci pokoju (anty-flood: tyle co rozsądny pokój)
const CAT_TEXT_MAX = 80;             // label/range/kind kategorii
const SONG_TEXT_MAX = 200;           // title/artist/album/year utworu
const URL_MAX = 500;
// F1: preview tylko https (audio pobiera KAŻDY klient — bez http/javascript:/data:); tts: https albo ścieżka względna
const okPreview = (u)=> typeof u==='string' && u.length<=URL_MAX && /^https:\/\//.test(u);
const okTts = (u)=> typeof u==='string' && u.length<=URL_MAX && (/^https:\/\//.test(u) || (/^[\w-][\w\-./]*$/.test(u) && !u.includes('..')));

// sanityzacja pytania quizu: prompt/sloty/warianty (anty-flood/anty-OOM, tylko klucze slotów)
function clampQuestion(q){
  if(!q || typeof q!=='object') return null;
  const prompt=String(q.prompt||'').slice(0, POOL_PROMPT_MAX);
  const raw=(Array.isArray(q.slots)?q.slots:[]).slice(0, POOL_MAX_SLOTS);
  // F1 (#2): klucz slotu trafia do id="mpProp_<key>" u KAŻDEGO klienta → tylko /^[a-z0-9_]{1,12}$/.
  // Jeden zły klucz → odrzuć całe pytanie (nie zgaduj intencji hosta).
  if(raw.some(s=>!s || !isSlotKey(s.key))) return null;
  const slots=raw.map(s=>({ key:s.key, label:clipText(s.label, SLOT_LABEL_MAX) || s.key }));
  if(new Set(slots.map(s=>s.key)).size!==slots.length) return null;   // duplikat klucza
  if(!prompt || !slots.length) return null;
  const answers={};
  const src=(q.answers&&typeof q.answers==='object')?q.answers:{};
  for(const s of slots){
    const arr=Array.isArray(src[s.key])?src[s.key]:[];
    answers[s.key]=arr.slice(0, POOL_MAX_VARIANTS).map(v=>String(v).slice(0, POOL_PROMPT_MAX)).filter(Boolean);
  }
  if(!slots.every(s=>answers[s.key].length)) return null;   // każdy slot musi mieć ≥1 wariant
  const out={ prompt, slots, answers };
  // F3 (SPEC v2): pool = lista list stringów (capy liczby/długości; puste wycięte), difficulty 1..3, fun = tekst
  if(Array.isArray(q.pool)){
    const pool=q.pool.slice(0, POOL_MAX_ITEMS).filter(Array.isArray)
      .map(it=>it.slice(0, POOL_MAX_ALIASES).filter(v=>typeof v==='string').map(v=>v.trim().slice(0, POOL_ALIAS_MAX)).filter(Boolean))
      .filter(it=>it.length);
    if(pool.length) out.pool=pool;
  }
  const d=Number(q.difficulty); if(d===1 || d===2 || d===3) out.difficulty=d;
  const fun=clipText(q.fun, FUN_MAX); if(fun) out.fun=fun;
  // Łamigłówki: duży rebus (display), częściowe punkty (partial), utwór-rozwiązanie do odsłuchu (track/tracks:
  // stringi przycięte, ≤3 el.). Pola zostają w puli/this.current (SEKRET) — do stanu trafiają dopiero w game.reveal.
  if(q.display==='rebus') out.display='rebus';
  if(q.partial===true) out.partial=true;
  Object.assign(out, clampQuizTrack(q));
  return out;
}

// przytnij przychodzące pule: ogranicz liczbę kategorii/utworów i długość tekstów (anty-flood/anty-OOM)
function clampPools(pools){
  const out={};
  if(!pools || typeof pools!=='object') return out;
  for(const k of Object.keys(pools).slice(0, POOL_MAX_CATS)){
    const c=pools[k]; if(!c || typeof c!=='object') continue;
    // F1: wszystko z hosta jako TEKST z capem (catLabel/utwór lecą do stanu u wszystkich)
    const o={ label:clipText(c.label, CAT_TEXT_MAX), range:clipText(c.range, CAT_TEXT_MAX), kind:clipText(c.kind, 16) };
    if(c.lang!=null) o.lang=lektorLang(c.lang);   // język opisów lektora: tylko 'pl' | 'en'
    { const ls=Math.floor(Number(c.listenSecs)); if(ls>=5 && ls<=60) o.listenSecs=ls; }   // P1-2: własne okno „słuchaj" kategorii
    if(Array.isArray(c.artists)) o.artists=c.artists.slice(0, POOL_MAX_SONGS).map(a=>clipText(a, SONG_TEXT_MAX)).filter(Boolean);
    if(Array.isArray(c.songs)) o.songs=c.songs.slice(0, POOL_MAX_SONGS).filter(s=>s && typeof s==='object').map(s=>{
      const r={ title:clipText(s.title, SONG_TEXT_MAX), artist:clipText(s.artist, SONG_TEXT_MAX) };
      if(okPreview(s.preview)) r.preview=s.preview;
      if(s.year) r.year=clipText(s.year, 16); if(s.album) r.album=clipText(s.album, SONG_TEXT_MAX);
      if(s.match) r.match=clipText(s.match, 40);   // wersja akustyczna/unplugged (słowo wymagane w tytule/albumie wyniku)
      if(s.lyric) r.lyric=String(s.lyric).slice(0, POOL_LYRIC_MAX); if(okTts(s.tts)) r.tts=s.tts;
      return r;
    });
    if(Array.isArray(c.questions)) o.questions=c.questions.slice(0, POOL_MAX_QUESTIONS).map(clampQuestion).filter(Boolean);
    out[k]=o;
  }
  return out;
}

export class GameAuthority extends Server {
  game = null;            // stan ROZSYŁANY (bez sekretu odpowiedzi)
  current = null;         // pełny utwór — SEKRET, tylko serwer
  pools = null;           // wgrane pule kategorii (cats dla buildMatch/resolve)
  hostId = null;          // rola hosta (przenoszalna — promote)
  draft = null;           // ostatni szkic meczu od hosta (ulotny, nie persystowany) — dla dochodzących w lobby
  idle(){ return !this.game || this.game.phase==null || this.game.phase===MP.DONE; }
  starterId = null;       // kto wystartował mecz — odzyskuje hosta po reconnect (nie zostaje przy promote)
  ready = new Set();      // id graczy zgłaszających gotowość w bieżącym armNonce
  hostSeen = new Set();   // anty-powtórki tytułów
  recent = [];            // anty-powtórki artystów
  shelves = new Map();    // gust etap 3: id gracza → półka [{title,artist,year}] (≤ 20) — „Gust stołu"
  _autoLock = null;       // serwerowy timer auto-locka (koniec czasu pytania)
  _allDone = null;        // P1-3: timer karencji „wszyscy gotowi" → lock
  allDoneGraceMs = MP_ALL_DONE_GRACE_MS;   // P1-3: karencja (testy podmieniają)
  // F2b #6: twardy limit fazy gotowości — po nim pytanie rusza z gotowymi (persist: armDeadline)
  armTimeoutMs = MP_ARM_TIMEOUT_MS;
  armDeadline = null;     // epoch ms końca ARMING (wznowienie timera po evikcji DO)
  _armTimer = null;
  // F2b #11: treść pytania/tekst lektora/TTS/offset fragmentu odsłaniane DOPIERO w PLAY (go()).
  // W ARMING rozsyłamy tylko to, co trzeba buforować (URL zajawki — bez niego nie ma równego startu).
  armHidden = null;
  // F8a: sieć rozwiązywania utworu/dystraktorów — pole instancji (testy podmieniają bez fetch)
  resolver = { track: resolveTrackServer, distractors: resolveDistractorsServer };

  constructor(ctx, env){
    super(ctx, env);
    // wczytaj stan z trwałego magazynu (po eviccie/restarcie DO) zanim obsłużymy żądania
    ctx.blockConcurrencyWhile(async () => {
      const s = await ctx.storage.get(['game','current','pools','hostId','starterId','hostSeen','recent','ready','armDeadline','armHidden','shelves']);
      this.game = s.get('game') || null;
      this.current = s.get('current') || null;
      this.pools = s.get('pools') || null;
      this.hostId = s.get('hostId') || null;
      this.starterId = s.get('starterId') || null;
      this.hostSeen = new Set(s.get('hostSeen') || []);
      this.recent = s.get('recent') || [];
      this.ready = new Set(s.get('ready') || []);
      this.armDeadline = s.get('armDeadline') || null;
      this.armHidden = s.get('armHidden') || null;
      this.shelves = new Map(Array.isArray(s.get('shelves')) ? s.get('shelves') : []);
      // WZNÓW serwerowy auto-lock po restarcie (in-memory setTimeout ginie przy evikcji DO).
      if(this.game && this.game.phase===MP.PLAY && this.game.timer>0 && this.game.endsAt){
        this.scheduleAutoLock(Math.max(0, this.game.endsAt - Date.now()));   // auto-lock wg pozostałego czasu
      }
      // P1-3: wznów karencję „wszyscy gotowi" (termin w stanie)
      if(this.game && this.game.phase===MP.PLAY && this.game.allDoneAt){
        this.scheduleAllDone(Math.max(0, this.game.allDoneAt - Date.now()));
      }
      // F2b #6: wznów twardy limit ARMING (gotowość przelicza też onConnect/maybeGoArming)
      if(this.game && this.game.phase===MP.ARMING && this.armDeadline){
        this.scheduleArmTimer(Math.max(0, this.armDeadline - Date.now()));
      }
    });
  }

  async persist(){
    await this.ctx.storage.put({
      game:this.game, current:this.current, pools:this.pools,
      hostId:this.hostId, starterId:this.starterId, hostSeen:[...this.hostSeen], recent:this.recent, ready:[...this.ready],
      armDeadline:this.armDeadline, armHidden:this.armHidden, shelves:[...this.shelves],
    });
  }

  /* ---- tożsamość połączenia z tokenu (HARD-REQUIRE) ---- */
  async onConnect(conn, ctx){
    let id=null, name='';
    try{
      const q=new URL(ctx.request.url).searchParams;
      name=(q.get('name')||'').slice(0, NAME_MAX);   // 3.3: cap nicka
      const payload=await verifyToken(this.env.TOKEN_SECRET, q.get('t'));   // bez tokenu → null
      if(payload && payload.sub) id=payload.sub;
    }catch(e){ /* zostanie null → odrzut */ }
    if(!id){ try{ conn.close(4001,'auth'); }catch(_e){} return; }            // brak ważnego tokenu → odrzuć (koniec ?id=)
    conn.setState({ id, name, verified:true });
    try{ await this.ctx.storage.deleteAlarm(); }catch(_e){}                   // ktoś wrócił → anuluj zaplanowane sprzątanie
    // F2b #3: host NIEOBECNY (wyszedł, gdy nie było kogo awansować) → pierwszy łączący przejmuje
    // (jak dawniej przy hostId=null). Sam host po powrocie ma hostId===id → nic się nie zmienia.
    const hostHere = !!this.hostId && this.idPresent(this.hostId, conn);
    if(!this.hostId || (!hostHere && this.hostId!==id)){                      // pierwszy obecny = host (przenoszalny)
      this.hostId=id; if(this.game) this.game.hostId=id; await this.persist();
    }
    // STABILNOŚĆ HOSTA: starter meczu wraca po reconnect → odzyskuje hosta (a nie zostaje przy
    // tym, kto został awansowany promote'em w jego nieobecności). Działa w trakcie aktywnego meczu.
    if(this.starterId && id===this.starterId && this.hostId!==id && this.game && this.game.phase!=null && this.game.phase!==MP.DONE){
      this.hostId=id; this.game.hostId=id; await this.persist();
    }
    // F2b #7: powrót (albo wejście) w trakcie pytania → dołącz do drużyny OD RAZU (dawniej skład liczony tylko
    // w newRound → krótki rozłącz między pytaniami = całe pytanie bez gry). Fix „host nie widział moich odpowiedzi":
    // dotyczy też Solo (własna drużyna) i Drużyn (najmniejsza drużyna) — wcześniej tylko coop, a typy późnego
    // gracza Solo/Drużyn reducer odrzucał po cichu (teamOf=null; w Drużynach do końca meczu).
    const named=this.noteName(id, name);   // P1-11: ksywa zachowana w stanie gry (wracający nie jest „graczem"/„?")
    if(this.rejoin(id, name) || named){ this.broadcastState(); await this.persist(); }
    conn.send(this.stateMsg(id));   // 3.1: okrojony widok
    this.pushPresence();
    await this.maybeGoArming();   // restart/redołączenie w ARMING → przelicz gotowość (+ twardy limit armTimeoutMs, F2b #6)
    await this.checkAllDone();    // P1-3: nowy (niegotowy) gracz w PLAY → zdejmij karencję „wszyscy gotowi"
  }

  async onClose(conn){
    const left = conn.state && conn.state.id;
    // F2b #3: promote TYLKO gdy host nie ma już ŻADNEGO innego połączenia (druga karta / nowy socket
    // po reconnect, a stary half-open zamknięty później) — dawniej awansował innego mimo obecnego hosta.
    if(left && left===this.hostId && !this.idPresent(left, conn)){     // promote: awansuj najstarszego obecnego
      const others=[...this.getConnections()].filter(c=>c!==conn).map(c=>c.state).filter(s=>s&&s.id&&s.id!==left);
      // nikogo do awansu → hostId ZOSTAJE (pokój czeka na powrót hosta; inny łączący przejmie w onConnect).
      // Dawniej null → klient hosta po powrocie nie dostawał roli, a serwer odrzucał lock/next → zamrożenie.
      if(others.length){
        this.hostId = others[0].id;
        if(this.game) this.game.hostId=this.hostId;
        await this.persist();
      }
    }
    this.pushPresence();
    await this.maybeGoArming();   // ktoś wyszedł w ARMING → jeśli reszta gotowa, startuj (nie blokuj na nieobecnym)
    await this.checkAllDone(conn); // P1-3: wyszedł ostatni niegotowy → reszta ma typy → zamknij po karencji
    // pokój opustoszał → zaplanuj sprzątanie storage (karencja na reconnect; alarm i tak re-sprawdzi przy odpaleniu)
    if([...this.getConnections()].filter(c => c !== conn).length === 0){
      try{ await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS); }catch(_e){}
    }
  }
  onError(){ this.pushPresence(); }
  // czy id ma jeszcze jakieś połączenie poza `except` (wiele kart / reconnect przed zamknięciem starego)
  idPresent(id, except){
    return [...this.getConnections()].some(c=>c!==except && c.state && c.state.id===id);
  }
  // F2b #7: dopisz OBECNEGO gracza bez drużyny w LOADING/ARMING/PLAY (salon: nie TV-hosta) — core/teams.joinTeam:
  // coop → 'all', solo → własna drużyna, teams → najmniejsza. Zwraca true, gdy skład się zmienił.
  rejoin(id, name){
    const g=this.game;
    if(!g || ![MP.LOADING, MP.ARMING, MP.PLAY].includes(g.phase)) return false;
    if(g.salon && id===tvIdOf(g)) return false;   // P0-1: TV salonu (nie awansowany gracz) poza drużynami
    if((g.format||'coop')==='coop' && !(g.teams||[])[0]) return false;   // coop bez drużyny (stan sprzed startu) — bez zmian
    const m=this.members().find(x=>x.id===id);
    return joinTeam(g, { id, name:(m && m.name) || name || '' });
  }
  coopRejoin(id){ return this.rejoin(id); }   // zgodność wsteczna (nazwa z F2b #7)

  // sprzątanie: alarm odpala po karencji od opustoszenia — jeśli nadal pusto, skasuj storage pokoju
  async onAlarm(){
    if([...this.getConnections()].length > 0) return;          // ktoś wrócił — nie kasuj
    await this.ctx.storage.deleteAll();                        // kasuje też alarm
    this.game=null; this.current=null; this.pools=null; this.hostId=null; this.starterId=null;
    this.ready=new Set(); this.hostSeen=new Set(); this.recent=[]; this.armDeadline=null; this.armHidden=null; this.draft=null; this.shelves=new Map();
    this.clearAutoLock(); this.clearArmTimer(); this.clearAllDone();
  }

  async onMessage(conn, raw){
    let msg; try{ msg=JSON.parse(raw); }catch{ return; }
    if(!msg || typeof msg!=='object') return;
    const me = conn.state && conn.state.id;
    if(!me) return;                                   // połączenie bez tożsamości (odrzucone w onConnect)
    // F1 (#14): token bucket per połączenie — flood dowolnym typem nie wzmacnia broadcastów/persist
    const kind = msg.t==='event' ? (msg.event==='draft' ? 'draft' : 'event') : msg.t==='action' ? 'action'
      : (msg.t==='hello' || msg.t==='track' || msg.t==='shelf') ? 'meta' : msg.t==='start' ? 'start' : null;
    if(kind && !this.allowRate(conn, kind)) return;

    switch(msg.t){
      case 'hello':
        conn.send(this.stateMsg(me));   // 3.1: okrojony widok
        if(this.draft && this.idle() && me!==this.hostId) conn.send(JSON.stringify({ t:'event', event:'draft', payload:{ ...this.draft, from:this.hostId, by:this.hostId }, from:this.hostId }));
        this.pushPresence();
        return;

      case 'track':                                   // aktualizacja nicka obecności (jak relay)
        conn.setState({ id:(conn.state&&conn.state.id)||null, name:clipText(msg.name, NAME_MAX)||(conn.state&&conn.state.name)||'', verified:conn.state&&conn.state.verified });
        this.pushPresence();
        // Solo: drużyna = gracz. Gość dołączający w trakcie dostaje drużynę w onConnect, ZANIM klient przyśle ksywę
        // (track po otwarciu socketu) → nazwa „gracz" w rankingu. Ksywa z track nadpisuje nazwę jego 1-os. drużyny.
        if(this.noteName(me, conn.state.name)){ this.broadcastState(); await this.persist(); }   // P1-11
        if(this.game && this.game.format==='solo' && conn.state.name){
          const t=(this.game.teams||[]).find(x=>x.id===me && (x.members||[]).length===1 && x.members[0]===me);
          if(t && t.name!==conn.state.name){ t.name=conn.state.name; this.broadcastState(); await this.persist(); }
        }
        return;

      case 'shelf': {                                 // gust etap 3: półka gracza do „Gust stołu" (tylko własna — id z tokenu)
        const items=sanitizeTableShelf(msg.items);
        this.shelves.delete(me);                      // odśwież kolejność (najnowsze na końcu)
        if(items.length) this.shelves.set(me, items);
        while(this.shelves.size>SHELVES_MAX) this.shelves.delete(this.shelves.keys().next().value);
        this.pushPresence(); await this.persist();
        return;
      }

      case 'event': {                                 // ulotne (emotki/czat/typing/„dalej") — relay do wszystkich
        // F1 (#1): TYLKO whitelista nazw. Dawniej dowolna nazwa (np. 'sync') szła do wszystkich i klient
        // brał ją za stan gry → podmiana stanu/XSS przez każdego gracza.
        if(!RELAY_EVENTS.includes(msg.event)) return;
        if(msg.event==='draft'){                       // szkic meczu: tylko host, tylko w lobby (przed/po meczu)
          if(me!==this.hostId || !this.idle()) return;
          const d=sanitizeDraft(msg.payload); if(!d) return;
          const out=JSON.stringify({ t:'event', event:'draft', payload:{ ...d, from:me, by:me }, from:me });
          if(out.length>DRAFT_PAYLOAD_MAX+200) return;
          this.draft=d;
          this.broadcast(out);
          return;
        }
        const src=msg.payload;
        const p=(src && typeof src==='object' && !Array.isArray(src)) ? { ...src } : {};
        if(msg.event==='react' && !REACTIONS.includes(p.emoji)) return;   // 3.3: whitelist emotek
        // F1 (#4): nadawca WYMUSZONY z tożsamości połączenia (nadpisuje by/byName/from klienta) —
        // koniec podszywania się na czacie / „dalej" w salonie / emotkach.
        p.from=me; p.by=me; p.byName=(conn.state && conn.state.name) || '';
        let raw; try{ raw=JSON.stringify(p); }catch(_e){ return; }
        if(raw.length>EVENT_PAYLOAD_MAX) return;      // 3.3: cap rozmiaru payloadu (anty-flood)
        this.broadcast(JSON.stringify({ t:'event', event:msg.event, payload:p, from:me }));
        return;
      }

      case 'start': {
        // F1 (#5): start TYLKO od aktualnego hosta pokoju (lobby: host z onConnect/promote; po DONE: host).
        // Dawniej dowolny gracz startował mecz i przejmował hosta. Starter = host (reclaim po reconnect).
        const idle = !this.game || this.game.phase==null || this.game.phase===MP.DONE;
        if(!idle || me!==this.hostId) return;
        const cfg=(msg.config && typeof msg.config==='object') ? msg.config : {};
        // P0-9: salon bez ani jednego gracza (TV samo w pokoju) — nikt by nie grał → odrzuć; host dostaje stan (koniec „ładowania")
        if(cfg.salon===true && !this.members().some(m=>m.id!==me)){ conn.send(this.stateMsg(me)); return; }
        this.starterId=me; this.draft=null; this.pushPresence();
        await this.startMatch(cfg);
        return;
      }

      case 'action': {
        if(!this.game) return;
        if(!msg.action || typeof msg.action!=='object') return;
        const a = { ...msg.action };
        a.by = me;                                    // WYMUSZONE z tożsamości połączenia (anty-spoof)
        a.byName = (conn.state && conn.state.name) || clipText(a.byName, NAME_MAX);
        if(a.type==='ready'){ await this.onReady(me, a.armNonce); return; }
        if(reduceAction(this.game, a)){ this.broadcastState(); await this.persist(); await this.checkAllDone(); }
        return;
      }

      case 'lock':                                    // tylko host (auto-lock robi timer)
        if(me && me===this.hostId) await this.lock();
        return;

      case 'next':                                    // tylko host
        if(me && me===this.hostId) await this.next();
        return;

      case 'retry':                                   // tylko host, tylko w NETERR/NOLYRIC (1.3)
        if(me && me===this.hostId) await this.retry();
        return;

      case 'go':                                      // F2b #6: host „pomiń czekających" — tylko w ARMING (go() strzeże fazy)
        if(me && me===this.hostId) await this.go();
        return;
    }
  }

  // 1.3: host ponawia zablokowaną rundę. NETERR (sieć) → ten sam slot od nowa;
  // NOLYRIC (pula wyczerpana) → przeskocz slot (inaczej kręci się w kółko na pustej puli).
  async retry(){
    if(!this.game) return;
    if(this.game.phase===MP.NETERR){ await this.newRound(); return; }
    if(this.game.phase===MP.NOLYRIC){
      const more=matchAdvance(this.game);
      if(!more){ await this.finish(); return; }
      await this.nextQuestion();
    }
  }

  /* ---- presence / broadcast ---- */
  members(){
    const byId=new Map();
    for(const c of this.getConnections()){ const s=c.state; if(s&&s.id) byId.set(s.id,{id:s.id,name:s.name||''}); }
    return [...byId.values()];
  }
  // GRACZE = członkowie bez salon-hosta (TV nie gra) — do budowy/uzgodnienia drużyn
  // P0-1: w trakcie meczu TV = game.tvId (nie aktualny host — po wyjściu TV awansowany gracz dalej GRA)
  playersOf(salon){
    const ms=this.members();
    if(salon==null && this.game && this.game.salon){ const tv=tvIdOf(this.game); return tv ? ms.filter(m=>m.id!==tv) : ms; }
    const s = salon!=null ? salon : (this.game && this.game.salon);
    return (s && this.hostId) ? ms.filter(m=>m.id!==this.hostId) : ms;
  }
  // P1-11: ksywa gracza w stanie gry (game.names) — po wyjściu/powrocie widać imię, nie „gracz"/„?". true = zmiana.
  noteName(id, name){
    const g=this.game; const n=clipText(name, NAME_MAX);
    if(!g || g.phase==null || !id || !n) return false;
    g.names = g.names || {};
    if(g.names[id]===n) return false;
    if(Object.keys(g.names).length>=64 && !(id in g.names)) return false;   // cap (anty-flood)
    g.names[id]=n;
    // solo: drużyna = gracz — przywróć nazwę drużyny, gdy dołączył bez ksywy („gracz")
    if(g.format==='solo'){ const t=(g.teams||[]).find(x=>x.id===id && (x.members||[]).length===1 && x.members[0]===id); if(t && (!t.name || t.name==='gracz')) t.name=n; }
    return true;
  }
  // P1-2: ramka stanu z zegarem serwera (klient liczy offset — anty-skew)
  stateMsg(id){ return JSON.stringify({ t:'state', game:this.viewFor(id), serverNow:Date.now() }); }
  pushPresence(){ this.broadcast(JSON.stringify({ t:'presence', members:this.members(), hostId:this.hostId, modes:MP_MODES,
    caps:CAPS, shelves:this.shelfInfo() })); }
  // gust etap 3: półki OBECNYCH (kolejność = kolejność w pokoju) — licznik dla hosta i źródło puli „Gust stołu"
  presentShelves(){ return this.members().filter(m=>this.shelves.has(m.id)).map(m=>({ id:m.id, name:m.name||'gracz', items:this.shelves.get(m.id) })); }
  shelfInfo(){ return this.presentShelves().map(s=>({ id:s.id, n:s.items.length })); }
  // 3.1: rozsyłka per-połączenie z okrojeniem cudzych bucketów drużyn (wyciek typów rywali w PLAY).
  broadcastState(){
    for(const c of this.getConnections()){
      const id=c.state && c.state.id; if(!id) continue;
      try{ c.send(this.stateMsg(id)); }catch(_e){}
    }
  }
  // widok stanu dla odbiorcy: cudze buckety drużyn okrojone do liczników w fazie odpowiedzi.
  // this.game i persist() bez zmian (pełny stan) — okrajanie TYLKO przy wysyłce.
  viewFor(id){
    const g=this.game;
    if(!g || !g.byTeam || g.phase!==MP.PLAY) return g;         // pełny stan poza PLAY (REVEAL i tak jawny)
    if(g.salon && id===tvIdOf(g)) return g;                    // TV/sędzia widzi wszystko (P0-1: TV, nie awansowany gracz)
    const myTid=teamOf(g, id);                                 // teamOf zwraca ID drużyny (string), nie obiekt
    const byTeam={};
    for(const tid of Object.keys(g.byTeam)){
      const b=g.byTeam[tid];
      byTeam[tid] = (tid===myTid) ? b : {
        proposals:[], votes:{}, passed:b.passed,               // kształt zachowany; treść odpowiedzi rywali wycięta
        sure:b.sure,                                           // pewniak/pas publiczne (statusy, nie odpowiedzi)
        answered:[...new Set((b.proposals||[]).map(p=>p.by))], // KTO już dał typ (status „✓ odpowiedział", bez treści)
        counts:{ proposals:(b.proposals||[]).length,
                 votes:Object.keys(b.votes||{}).length },
      };
    }
    return { ...g, byTeam };                                   // płytka kopia — reszta pól współdzielona
  }

  catLabelOf(catKey){ const c=this.pools&&this.pools[catKey]; return c ? (c.range||c.label||catKey) : catKey; }

  /* ---- start meczu (host wgrywa pule) ---- */
  async startMatch(config){
    // F1 (#5): rounds∈[1..MAX_ROUNDS] (rounds=200000 → 25 MB stanu = martwy pokój), timer clamp,
    // modes ⊂ ALL_MODES, format ∈ coop/solo/teams. assignments sanityzuje buildTeams (kolor/nazwa/members).
    const { questions, timer, modes, format, salon, audioHostOnly } = sanitizeMpConfig(config);   // F6b: + „Jeden głośnik"   // F6a: długość w pytaniach (stary klient: z rounds)
    const assignments = Array.isArray(config.assignments) ? config.assignments : undefined;
    const groupId = (typeof config.groupId==='string' && config.groupId) ? config.groupId.slice(0,64) : null;   // MVP-3: tag drużyny (sanityzowany)
    const pools = clampPools(config.pools);         // DEFENSYWNIE: nie ufaj rozmiarowi od klienta
    // gust etap 3: „🎧 Gust stołu" — pulę składa SERWER z półek obecnych graczy (to, co przysłał host pod tym kluczem, ignorowane)
    if(pools[TABLE_KEY]){
      const songs=buildTablePool(this.presentShelves());
      if(songs.length>=TABLE_MIN_SONGS) pools[TABLE_KEY]=tablePoolCategory(songs); else delete pools[TABLE_KEY];
    }
    const catKeys = Object.keys(pools);
    const r = buildMatch(catKeys, modes, { questions }, pools);
    if(r.error || !r.slots) return;                 // klient waliduje przed wysłaniem — zignoruj zły config
    this.pools = pools; this.hostSeen = new Set(); this.recent = [];
    const s0=r.slots[0];
    // DRUŻYNY wg formatu (coop=1, solo=N×1, teams=podział hosta z `assignments`). Stan odpowiedzi per-drużyna.
    const teams = buildTeams(format, this.playersOf(salon), assignments);
    const scores = {}; teams.forEach(t=>{ scores[t.id]=0; });
    const names = {}; this.members().forEach(m=>{ if(m.name) names[m.id]=clipText(m.name, NAME_MAX); });   // P1-11
    this.game = {
      hostId:this.hostId, phase:MP.PLAY, slots:r.slots, rounds:r.rounds, si:0, qi:0,
      catKey:s0.cat, mode:s0.mode, round:s0.round, catLabel:this.catLabelOf(s0.cat),
      answerSlots:slotsFor(s0.mode, s0.cat),
      format, teams, byTeam:emptyByTeam(teams), scores,
      reveal:null, results:[], preview:'', lyric:'', playNonce:0, salon, audioHostOnly, groupId,   // MVP-3: tag drużyny; F6b: audio tylko u hosta
      timer:timer||0, endsAt:null, beerTally:{}, tally:{}, streaks:{}, playAt:null,
      tvId: salon ? this.hostId : null,   // P0-1: TV salonu = kto wystartował (osobno od hostId, który przechodzi przy wyjściu)
      names,                              // P1-11: ksywy graczy (po wyjściu z presence)
      listenEndsAt:null, allDoneAt:null,  // P1-2 / P1-3
    };
    if(r.qpc) this.game.qpc=r.qpc;        // P1-7: krótki mecz — 1 pytanie na slot (kategorie i tryby na przemian)
    await this.nextQuestion();
  }

  async nextQuestion(){
    const s=this.game.slots[this.game.si];
    if(!s){ await this.finish(); return; }
    this.game.catKey=s.cat; this.game.mode=s.mode; this.game.round=s.round; this.game.catLabel=this.catLabelOf(s.cat);
    this.game.answerSlots=slotsFor(s.mode, s.cat);
    await this.newRound();
  }

  /* ---- nowa runda: rozwiąż utwór (sekret), faza gotowości ---- */
  async newRound(){
    reconcileTeams(this.game, this.playersOf());   // dołączenia/wyjścia między pytaniami (solo: nowi → nowe drużyny)
    this.game.phase=MP.LOADING; this.game.byTeam=emptyByTeam(this.game.teams);   // czyste buckety; scores kumulują się
    this.game.reveal=null; this.game.endsAt=null; this.game.playAt=null; this.current=null;
    this.game.listenEndsAt=null; this.game.allDoneAt=null; this.clearAllDone();
    this.broadcastState();
    const cat=this.pools[this.game.catKey];
    const hidden={ prompt:'', lyric:'', ttsUrl:'', lyricLang:'', snipStart:0 };   // F2b #11: odsłaniane w go()
    this.game.promptStyle='';   // Łamigłówki: ustawiane tylko dla pytania-rebusu
    this.armHidden=null; this.armDeadline=null; this.clearArmTimer();
    if(!cat){ this.game.phase=MP.NETERR; this.game.netReason='nocat'; this.broadcastState(); await this.persist(); return; }

    if(this.game.mode==='quiz'){
      // WIEDZA OGÓLNA: wylosuj pytanie z puli (bez audio). answers = SEKRET (zostaje na serwerze).
      // F3 #5: seen-set tylko w obrębie meczu (hostSeen) — trwały seen-set jest per urządzenie (solo/relay-host)
      const qs=(cat.questions||[]).filter(q=>q && q.prompt && !this.hostSeen.has(quizKey(q)));
      if(!qs.length){ this.game.phase=MP.NOLYRIC; this.game.netReason='noquiz'; this.broadcastState(); await this.persist(); return; }
      const q=qs[Math.floor(Math.random()*qs.length)];
      // F3 #3: tasowanie ABCD TU (strona autorytatywna) — wspólne dla wszystkich; litera/answers/pool/fun = SEKRET
      // w this.current (do game.reveal dopiero przy lock); klient widzi tylko potasowany prompt (od PLAY)
      const sq=shuffleMC(q);
      // Łamigłówki: listen (utwór-rozwiązanie) = SEKRET jak answers — do stanu dopiero w game.reveal (evaluateAnswer)
      this.current={ prompt:sq.prompt, slots:sq.slots, answers:sq.answers, pool:sq.pool, fun:sq.fun||'', mc:sq.mc||null,
        partial:sq.partial===true, display:sq.display==='rebus'?'rebus':'', listen:quizListen(sq),
        track:'', artist:'', year:'', album:'', art:'', preview:'', lyric:'' };
      this.hostSeen.add(quizKey(q));
      this.game.answerSlots=sq.slots; this.game.prompt=''; this.game.preview=''; this.game.lyric=''; this.game.ttsUrl='';
      this.game.promptStyle = sq.display==='rebus' ? 'rebus' : '';   // sposób renderu treści (nie zdradza odpowiedzi)
      hidden.prompt=sq.prompt;                      // F2b #11: treść pytania dopiero w PLAY
    } else if(this.game.mode==='lektor'){
      const songs=(cat.songs||[]).filter(x=>x.lyric && !this.hostSeen.has(norm(x.title)));
      if(!songs.length){ this.game.phase=MP.NOLYRIC; this.broadcastState(); await this.persist(); return; }
      const x=songs[Math.floor(Math.random()*songs.length)];
      this.current={ track:x.title, artist:x.artist, year:x.year||'', album:x.album||'', art:'', preview:'', lyric:x.lyric };
      this.hostSeen.add(norm(x.title));
      this.game.lyric=''; this.game.preview=''; this.game.ttsUrl=''; this.game.prompt=''; this.game.answerSlots=null; this.game.lyricLang='';
      hidden.lyric=x.lyric; hidden.ttsUrl=x.tts||'';   // F2b #11: tekst/TTS lektora dopiero w PLAY
      hidden.lyricLang=catLektorLang(cat);              // język głosu lektora (klient bez pola → 'pl')
    } else {
      const t=await this.resolver.track({ cat, seen:this.hostSeen, recent:this.recent });
      if(t.error){ this.game.phase=MP.NETERR; this.game.netReason=t.reason; this.broadcastState(); await this.persist(); return; }
      this.current={ ...t, lyric:'' };
      this.game.preview=t.preview; this.game.lyric=''; this.game.ttsUrl=''; this.game.prompt=''; this.game.answerSlots=null;
      if(this.game.mode==='year'){
        // F8a „rok": jeden slot liczbowy; brak roku (np. fallback Deezer) → to pytanie jak zwykła muzyka
        if(parseYear(t.year)==null) this.game.mode='music';
        else {
          this.game.answerSlots=slotsFor('year');
          if(!yearReliable(t.year, cat.range, t.yearSrc)) this.current.yearNote='rok wg wydania w iTunes';
        }
      } else if(this.game.mode==='abcd'){
        // F8a „abcd": opcje generuje AUTORYTET — prompt z kaflami odsłaniany w PLAY (hidden.prompt), poprawna litera
        // (answers/mc) zostaje w this.current (SEKRET) do REVEAL. Za mało dystraktorów → pytanie jak muzyka.
        let ds=[]; try{ ds=await this.resolver.distractors({ cat, correct:t }); }catch(_e){ ds=[]; }
        const q=buildTrackMC(t, ds);
        if(q){
          Object.assign(this.current, { prompt:q.prompt, slots:q.slots, answers:q.answers, mc:q.mc });
          this.game.answerSlots=q.slots; hidden.prompt=q.prompt;
        } else this.game.mode='music';
      }
    }
    // muzyka/lektor → sloty DEFAULT (tytuł+wykonawca); inaczej runda audio po quizie dziedziczy sloty quizu
    // F2b #11: offset fragmentu ustalany na serwerze, ale wysyłany dopiero w PLAY (w ARMING 0).
    // Klient i tak buforuje CAŁY plik zajawki (URL musi być znany w ARMING dla równego startu) —
    // ukrywamy tylko, KTÓRY 2-s wycinek zagra.
    // EKSPERYMENT: „od tyłu krótko" — ten sam mechanizm: offset = KONIEC okna 3 s odwracanego u klientów (core/timing.mpSnipOffset)
    hidden.snipStart = mpSnipOffset(this.game.mode);
    this.game.snipStart = 0;
    this.armHidden = hidden;
    // FAZA GOTOWOŚCI: roześlij utwór (bez odpowiedzi), czekaj aż wszyscy zbuforują
    this.game.phase=MP.ARMING; this.game.armNonce=(this.game.armNonce||0)+1;
    this.game.endsAt=null; this.game.readyCount=0; this.game.readyTotal=this.expectedReady().length;
    this.ready=new Set(); this.game.readyIds=[];   // 1.1: kto już zgłosił ready (klient wykrywa zgubione ready po reconnect)
    // F2b #6: PLAY rusza, gdy WSZYSCY OBECNI zgłoszą ready ALBO po twardym limicie (armMs) — z gotowymi.
    // Niegotowi (np. AFK na odsłonie) dołączają w PLAY z audio „na dogonienie". Host może też wysłać {t:'go'}.
    this.game.armMs=this.armTimeoutMs;
    this.armDeadline=Date.now()+this.armTimeoutMs;
    this.broadcastState(); await this.persist();
    this.scheduleArmTimer(this.armTimeoutMs);
  }

  async onReady(id, armNonce){
    if(!this.game || this.game.phase!==MP.ARMING) return;
    if(armNonce!==this.game.armNonce) return;       // ready ze starej rundy
    // F2b #12: duplikat (ten sam gracz, ten sam nonce) → bez broadcastu. Dawniej każde ready = rozsyłka
    // ARMING do wszystkich, a u wolnych klientów każda taka rozsyłka mogła wywołać ponowne zbrojenie.
    if(this.ready.has(id)) return;
    this.ready.add(id);
    await this.maybeGoArming();
  }

  // id-ki, na które czekamy w fazie gotowości. SALON: TV (host) nie gra → czekamy TYLKO na graczy
  // (TV i tak buforuje audio niezależnie). Brak graczy → fallback na wszystkich (anty-deadlock).
  expectedReady(){
    const ids=this.members().map(m=>m.id);
    if(this.game && this.game.salon){ const tv=tvIdOf(this.game); const ps=ids.filter(id=>id!==tv); return ps.length?ps:ids; }
    return ids;
  }
  // przelicz gotowość i wystartuj, gdy wszyscy OCZEKIWANI gotowi (woła: onReady, onConnect, onClose)
  async maybeGoArming(){
    if(!this.game || this.game.phase!==MP.ARMING) return;
    const r=countReady(this.expectedReady(), this.ready);
    this.game.readyCount=r.count; this.game.readyTotal=r.total;
    this.game.readyIds=[...this.ready];   // 1.1: rozsyłaj listę zgłoszonych — klient dosyła zgubione ready
    if(r.all){ await this.go(); return; }
    this.broadcastState(); await this.persist();
  }

  async go(){
    if(!this.game || this.game.phase!==MP.ARMING) return;
    this.clearArmTimer(); this.armDeadline=null;
    // F2b #11: odsłoń treść pytania / tekst lektora / TTS / offset fragmentu dopiero teraz
    const h=this.armHidden;
    if(h){
      if(h.prompt) this.game.prompt=h.prompt;
      if(h.lyric) this.game.lyric=h.lyric;
      if(h.ttsUrl) this.game.ttsUrl=h.ttsUrl;
      if(h.lyricLang) this.game.lyricLang=h.lyricLang;
      if(h.snipStart) this.game.snipStart=h.snipStart;
      this.armHidden=null;
    }
    // F2b #7: skład = wszyscy obecni gracze także na starcie PLAY (dopisz, nie usuwaj) — każdy format
    this.playersOf().forEach(p=>this.rejoin(p.id, p.name));
    this.game.phase=assertMp(this.game.phase, MP.PLAY, console.warn);
    this.game.playNonce=(this.game.playNonce||0)+1;
    this.game.playAt=Date.now();                    // F6a: start PLAY → bonus za szybkość liczony do zatwierdzenia
    // P1-2: czas na odpowiedź liczony PO słuchaniu — endsAt = go + LEAD (intro) + okno „słuchaj" + timer
    const cat=this.pools && this.pools[this.game.catKey];
    const dl=phaseDeadlines({ playAt:this.game.playAt, leadMs:MP_INTRO_MS, listenMs:listenSecs(this.game.mode, cat && cat.listenSecs)*1000, timerS:this.game.timer });
    this.game.listenEndsAt=dl.listenEndsAt; this.game.endsAt=dl.endsAt; this.game.allDoneAt=null;
    this.broadcastState(); await this.persist();
    if(this.game.endsAt) this.scheduleAutoLock(Math.max(0, this.game.endsAt-Date.now()));
  }

  /* ---- P1-3: auto-zamknięcie, gdy WSZYSCY obecni gracze dali typ albo pas (karencja allDoneGraceMs) ----
   * Woła: akcja gracza, wejście/wyjście z pokoju. Ktoś cofnie typ / dojdzie niegotowy → karencja zdjęta. */
  async checkAllDone(except){
    const g=this.game;
    if(!g || g.phase!==MP.PLAY){ this.clearAllDone(); return; }
    const ids=[...new Set([...this.getConnections()].filter(c=>c!==except && c.state && c.state.id).map(c=>c.state.id))];
    const done=allSettled(g, ids);
    if(done && !g.allDoneAt){
      g.allDoneAt=Date.now()+this.allDoneGraceMs;
      this.broadcastState(); await this.persist();
      this.scheduleAllDone(this.allDoneGraceMs);
    } else if(!done && g.allDoneAt){
      g.allDoneAt=null; this.clearAllDone();
      this.broadcastState(); await this.persist();
    }
  }
  scheduleAllDone(ms){
    this.clearAllDone();
    const nonce=this.game && this.game.playNonce;
    this._allDone=setTimeout(()=>{
      this._allDone=null;
      if(this.game && this.game.phase===MP.PLAY && this.game.playNonce===nonce && this.game.allDoneAt) this.lock().catch(()=>{});
    }, ms);
  }
  clearAllDone(){ if(this._allDone){ clearTimeout(this._allDone); this._allDone=null; } }

  /* ---- zatwierdzenie odpowiedzi (host albo serwerowy timer) ---- */
  async lock(){
    if(!this.game || this.game.phase!==MP.PLAY) return;
    this.clearAutoLock(); this.clearAllDone();
    noteAnswerers(this.game);                       // F2b #8: historia udziału (liga) przed czyszczeniem bucketów
    const ev=evaluateAnswer(this.game, this.current, undefined, Date.now());   // ocenia KAŻDĄ drużynę (ev.perTeam); F6a: punkty + szybkość
    applyEvaluation(this.game, ev, (this.game.tally=this.game.tally||{}));   // F6a: punkty/serie/tally/pewniaki/wynik/reveal — wspólne z hostem relay
    this.game.phase=assertMp(this.game.phase, MP.REVEAL, console.warn); this.game.endsAt=null;
    this.game.listenEndsAt=null; this.game.allDoneAt=null;
    this.broadcastState(); await this.persist();
  }

  async next(){
    if(!this.game || this.game.phase!==MP.REVEAL) return;   // 3.4: podwójny „next" hosta → tylko z REVEAL
    const more=matchAdvance(this.game);             // qi++ / si++ po 5 pytaniach
    if(!more){ await this.finish(); return; }
    await this.nextQuestion();
  }

  async finish(){
    const arr=Object.values(this.game.tally||{}).sort((a,b)=>b.correct-a.correct);
    this.game.mvp = arr.length && arr[0].correct>0 ? arr[0] : null;
    this.game.tallyList=arr;
    this.game.phase=MP.DONE; this.broadcastState();
    // zapis do D1 — AUTORYTATYWNY (DO liczył wynik sam; bez klientowego podawania)
    try{
      // F2b #8: uczestnicy z historii odpowiedzi (game.playedBy), nie z obecnych przy DONE; salon bez TV
      // P0-1: w salonie „host" rekordu = TV (wykluczane z graczy) — nie awansowany gracz, który przejął po wyjściu TV
      const payload=buildMpRecord({ game:this.game, tally:this.game.tally, members:this.members(), hostId:tvIdOf(this.game) || this.hostId, roomCode:this.name });
      await insertMatch(this.env, payload);
    }catch(e){ try{ console.warn('finish: zapis meczu do D1 nieudany', e&&e.message||e); }catch(_e){} }   // 3.5: nie połykaj po cichu
    await this.persist();
  }

  // F1 (#14): token bucket per połączenie i rodzaj wiadomości (event/action/meta/start). Stan na
  // obiekcie połączenia (ulotny — po hibernacji/reconnect bucket startuje pełny, co jest OK).
  allowRate(conn, kind, now=Date.now()){
    const cfg=RATE[kind] || RATE.event;
    const all=conn._tb || (conn._tb={});
    const b=all[kind] || (all[kind]={ tokens:cfg.burst, ts:now });
    b.tokens=Math.min(cfg.burst, b.tokens + (now-b.ts)/1000*cfg.rate); b.ts=now;
    if(b.tokens<1) return false;
    b.tokens-=1; return true;
  }
  // 3.3 (zgodność wsteczna): dawny limiter eventów — teraz token bucket 'event'
  allowEvent(conn){ return this.allowRate(conn, 'event'); }

  /* ---- serwerowy auto-lock (koniec czasu pytania) ---- */
  scheduleAutoLock(ms){ this.clearAutoLock(); this._autoLock=setTimeout(()=>{ this.lock().catch(()=>{}); }, ms); }
  clearAutoLock(){ if(this._autoLock){ clearTimeout(this._autoLock); this._autoLock=null; } }
  /* ---- F2b #6: twardy limit fazy gotowości (ARMING) ---- */
  scheduleArmTimer(ms){
    this.clearArmTimer();
    const nonce=this.game && this.game.armNonce;
    this._armTimer=setTimeout(()=>{
      this._armTimer=null;
      if(this.game && this.game.phase===MP.ARMING && this.game.armNonce===nonce) this.go().catch(()=>{});
    }, ms);
  }
  clearArmTimer(){ if(this._armTimer){ clearTimeout(this._armTimer); this._armTimer=null; } }
}
