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
 *   DO → klient:  {t:'state', game}  (BEZ sekretu — pełny utwór tylko w game.reveal przy REVEAL)
 *                 {t:'presence', members, hostId}
 *
 * SEKRET: pełny utwór (current) trzymany POZA `game`; do `game.reveal` trafia dopiero przy lock.
 * PERSYSTENCJA: stan w `ctx.storage` (przeżyć eviction DO w trakcie meczu).
 * PROMOTE: host wyjdzie → awans najstarszego obecnego (rola `hostId` w stanie).
 */
import { Server } from 'partyserver';
import { verifyToken } from './lib/auth.js';
import { reduceAction, evaluateAnswer, slotsFor, countReady } from '../core/mpReducer.js';
import { MP, assertMp } from '../core/phases.js';
import { buildMatch, matchAdvance } from '../core/match.js';
import { buildMpRecord } from '../core/matchRecord.js';
import { norm } from '../core/scoring.js';
import { resolveTrackServer } from './lib/resolve.js';
import { insertMatch } from './lib/recordMatch.js';

const MP_SNIP_WINDOW_S = 16;         // okno losowania startu fragmentu
const ROOM_TTL_MS = 15*60*1000;      // sprzątanie storage pustego pokoju po 15 min (karencja na reconnect)
const POOL_MAX_CATS = 24;            // defensywne capy pul (DO nie ufa rozmiarowi od klienta)
const POOL_MAX_SONGS = 120;
const POOL_LYRIC_MAX = 12000;        // max długość tekstu (lektor) na utwór
const POOL_MAX_QUESTIONS = 200;      // cap pytań (wiedza ogólna) na kategorię
const POOL_MAX_SLOTS = 6;            // cap slotów odpowiedzi na pytanie
const POOL_MAX_VARIANTS = 12;        // cap wariantów poprawnej odpowiedzi na slot
const POOL_PROMPT_MAX = 600;         // max długość treści pytania

// sanityzacja pytania quizu: prompt/sloty/warianty (anty-flood/anty-OOM, tylko klucze slotów)
function clampQuestion(q){
  if(!q || typeof q!=='object') return null;
  const prompt=String(q.prompt||'').slice(0, POOL_PROMPT_MAX);
  const slots=(Array.isArray(q.slots)?q.slots:[]).slice(0, POOL_MAX_SLOTS)
    .map(s=>({ key:String(s&&s.key||''), label:String((s&&s.label)||(s&&s.key)||'') }))
    .filter(s=>s.key);
  if(!prompt || !slots.length) return null;
  const answers={};
  const src=(q.answers&&typeof q.answers==='object')?q.answers:{};
  for(const s of slots){
    const arr=Array.isArray(src[s.key])?src[s.key]:[];
    answers[s.key]=arr.slice(0, POOL_MAX_VARIANTS).map(v=>String(v).slice(0, POOL_PROMPT_MAX)).filter(Boolean);
  }
  if(!slots.every(s=>answers[s.key].length)) return null;   // każdy slot musi mieć ≥1 wariant
  return { prompt, slots, answers };
}

// przytnij przychodzące pule: ogranicz liczbę kategorii/utworów i długość tekstów (anty-flood/anty-OOM)
function clampPools(pools){
  const out={};
  if(!pools || typeof pools!=='object') return out;
  for(const k of Object.keys(pools).slice(0, POOL_MAX_CATS)){
    const c=pools[k]; if(!c || typeof c!=='object') continue;
    const o={ label:c.label, range:c.range, kind:c.kind };
    if(Array.isArray(c.artists)) o.artists=c.artists.slice(0, POOL_MAX_SONGS).map(String);
    if(Array.isArray(c.songs)) o.songs=c.songs.slice(0, POOL_MAX_SONGS).map(s=>{
      const r={ title:s&&s.title, artist:s&&s.artist };
      if(s&&s.preview) r.preview=s.preview; if(s&&s.year) r.year=s.year; if(s&&s.album) r.album=s.album;
      if(s&&s.lyric) r.lyric=String(s.lyric).slice(0, POOL_LYRIC_MAX); if(s&&s.tts) r.tts=s.tts;
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
  starterId = null;       // kto wystartował mecz — odzyskuje hosta po reconnect (nie zostaje przy promote)
  ready = new Set();      // id graczy zgłaszających gotowość w bieżącym armNonce
  hostSeen = new Set();   // anty-powtórki tytułów
  recent = [];            // anty-powtórki artystów
  _autoLock = null;       // serwerowy timer auto-locka (koniec czasu pytania)

  constructor(ctx, env){
    super(ctx, env);
    // wczytaj stan z trwałego magazynu (po eviccie/restarcie DO) zanim obsłużymy żądania
    ctx.blockConcurrencyWhile(async () => {
      const s = await ctx.storage.get(['game','current','pools','hostId','starterId','hostSeen','recent','ready']);
      this.game = s.get('game') || null;
      this.current = s.get('current') || null;
      this.pools = s.get('pools') || null;
      this.hostId = s.get('hostId') || null;
      this.starterId = s.get('starterId') || null;
      this.hostSeen = new Set(s.get('hostSeen') || []);
      this.recent = s.get('recent') || [];
      this.ready = new Set(s.get('ready') || []);
      // WZNÓW serwerowy auto-lock po restarcie (in-memory setTimeout ginie przy evikcji DO).
      // ARMING nie potrzebuje timera — gotowość przeliczy onConnect (maybeGoArming) gdy klienci wrócą.
      if(this.game && this.game.phase===MP.PLAY && this.game.timer>0 && this.game.endsAt){
        this.scheduleAutoLock(Math.max(0, this.game.endsAt - Date.now()));   // auto-lock wg pozostałego czasu
      }
    });
  }

  async persist(){
    await this.ctx.storage.put({
      game:this.game, current:this.current, pools:this.pools,
      hostId:this.hostId, starterId:this.starterId, hostSeen:[...this.hostSeen], recent:this.recent, ready:[...this.ready],
    });
  }

  /* ---- tożsamość połączenia z tokenu (HARD-REQUIRE) ---- */
  async onConnect(conn, ctx){
    let id=null, name='';
    try{
      const q=new URL(ctx.request.url).searchParams;
      name=q.get('name')||'';
      const payload=await verifyToken(this.env.TOKEN_SECRET, q.get('t'));   // bez tokenu → null
      if(payload && payload.sub) id=payload.sub;
    }catch(e){ /* zostanie null → odrzut */ }
    if(!id){ try{ conn.close(4001,'auth'); }catch(_e){} return; }            // brak ważnego tokenu → odrzuć (koniec ?id=)
    conn.setState({ id, name, verified:true });
    try{ await this.ctx.storage.deleteAlarm(); }catch(_e){}                   // ktoś wrócił → anuluj zaplanowane sprzątanie
    if(!this.hostId){ this.hostId=id; await this.persist(); }                 // pierwszy obecny = host (przenoszalny)
    // STABILNOŚĆ HOSTA: starter meczu wraca po reconnect → odzyskuje hosta (a nie zostaje przy
    // tym, kto został awansowany promote'em w jego nieobecności). Działa w trakcie aktywnego meczu.
    else if(this.starterId && id===this.starterId && this.hostId!==id && this.game && this.game.phase!=null && this.game.phase!==MP.DONE){
      this.hostId=id; this.game.hostId=id; await this.persist();
    }
    conn.send(JSON.stringify({ t:'state', game:this.game }));
    this.pushPresence();
    await this.maybeGoArming();   // restart/redołączenie w ARMING → przelicz gotowość (anty-deadlock, bez timera)
  }

  async onClose(conn){
    const left = conn.state && conn.state.id;
    if(left && left===this.hostId){                                   // promote: awansuj najstarszego obecnego
      const others=[...this.getConnections()].map(c=>c.state).filter(s=>s&&s.id&&s.id!==left);
      this.hostId = others.length ? others[0].id : null;
      if(this.game) this.game.hostId=this.hostId;
      await this.persist();
    }
    this.pushPresence();
    await this.maybeGoArming();   // ktoś wyszedł w ARMING → jeśli reszta gotowa, startuj (nie blokuj na nieobecnym)
    // pokój opustoszał → zaplanuj sprzątanie storage (karencja na reconnect; alarm i tak re-sprawdzi przy odpaleniu)
    if([...this.getConnections()].filter(c => c !== conn).length === 0){
      try{ await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS); }catch(_e){}
    }
  }
  onError(){ this.pushPresence(); }

  // sprzątanie: alarm odpala po karencji od opustoszenia — jeśli nadal pusto, skasuj storage pokoju
  async onAlarm(){
    if([...this.getConnections()].length > 0) return;          // ktoś wrócił — nie kasuj
    await this.ctx.storage.deleteAll();                        // kasuje też alarm
    this.game=null; this.current=null; this.pools=null; this.hostId=null;
    this.ready=new Set(); this.hostSeen=new Set(); this.recent=[];
    this.clearAutoLock();
  }

  async onMessage(conn, raw){
    let msg; try{ msg=JSON.parse(raw); }catch{ return; }
    const me = conn.state && conn.state.id;

    switch(msg.t){
      case 'hello':
        conn.send(JSON.stringify({ t:'state', game:this.game }));
        this.pushPresence();
        return;

      case 'track':                                   // aktualizacja nicka obecności (jak relay)
        conn.setState({ id:(conn.state&&conn.state.id)||null, name:msg.name||(conn.state&&conn.state.name)||'', verified:conn.state&&conn.state.verified });
        this.pushPresence();
        return;

      case 'event':                                   // ulotne (emotki/czat/typing) — relay do wszystkich (z nadawcą)
        this.broadcast(JSON.stringify({ t:'event', event:msg.event, payload:msg.payload }));
        return;

      case 'start':                                   // kto startuje mecz, ten zostaje hostem
        // (host w onConnect jest tylko prowizoryczny do crowna w lobby; start go potwierdza —
        //  deterministyczne „twórca = host", odporne na wyścig verifyToken przy łączeniu)
        if(me && (!this.game || this.game.phase==null || this.game.phase===MP.DONE)){
          this.hostId=me; this.starterId=me; this.pushPresence();   // twórca = host; zapamiętany do reclaim po reconnect
          await this.startMatch(msg.config||{});
        }
        return;

      case 'action': {
        if(!this.game) return;
        const a = { ...(msg.action||{}) };
        a.by = me;                                    // WYMUSZONE z tożsamości połączenia (anty-spoof)
        a.byName = (conn.state && conn.state.name) || a.byName || '';
        if(a.type==='ready'){ await this.onReady(me, a.armNonce); return; }
        if(reduceAction(this.game, a)){ this.broadcastState(); await this.persist(); }
        return;
      }

      case 'lock':                                    // tylko host (auto-lock robi timer)
        if(me && me===this.hostId) await this.lock();
        return;

      case 'next':                                    // tylko host
        if(me && me===this.hostId) await this.next();
        return;
    }
  }

  /* ---- presence / broadcast ---- */
  members(){
    const byId=new Map();
    for(const c of this.getConnections()){ const s=c.state; if(s&&s.id) byId.set(s.id,{id:s.id,name:s.name||''}); }
    return [...byId.values()];
  }
  pushPresence(){ this.broadcast(JSON.stringify({ t:'presence', members:this.members(), hostId:this.hostId })); }
  broadcastState(){ this.broadcast(JSON.stringify({ t:'state', game:this.game })); }

  catLabelOf(catKey){ const c=this.pools&&this.pools[catKey]; return c ? (c.range||c.label||catKey) : catKey; }

  /* ---- start meczu (host wgrywa pule) ---- */
  async startMatch(config){
    const { rounds=4, timer=0, modes=[] } = config;
    const salon = !!config.salon;                   // tryb salonowy: TV = prowadzący (render+roster), tempo bez zmian
    const pools = clampPools(config.pools);         // DEFENSYWNIE: nie ufaj rozmiarowi od klienta
    const catKeys = Object.keys(pools);
    const r = buildMatch(catKeys, modes, rounds, pools);
    if(r.error || !r.slots) return;                 // klient waliduje przed wysłaniem — zignoruj zły config
    this.pools = pools; this.hostSeen = new Set(); this.recent = [];
    const s0=r.slots[0];
    this.game = {
      hostId:this.hostId, phase:MP.PLAY, slots:r.slots, rounds:r.rounds, si:0, qi:0,
      score:0, catKey:s0.cat, mode:s0.mode, round:s0.round, catLabel:this.catLabelOf(s0.cat),
      answerSlots:slotsFor(s0.mode, s0.cat), proposals:[], votes:{}, passed:[],
      reveal:null, results:[], preview:'', lyric:'', playNonce:0, salon,
      timer:timer||0, endsAt:null, beerTally:{}, tally:{},
    };
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
    this.game.phase=MP.LOADING; this.game.proposals=[]; this.game.votes={}; this.game.passed=[];
    this.game.reveal=null; this.game.endsAt=null; this.current=null;
    this.broadcastState();
    const cat=this.pools[this.game.catKey];
    if(!cat){ this.game.phase=MP.NETERR; this.game.netReason='nocat'; this.broadcastState(); await this.persist(); return; }

    if(this.game.mode==='quiz'){
      // WIEDZA OGÓLNA: wylosuj pytanie z puli (bez audio). answers = SEKRET (zostaje na serwerze).
      const qs=(cat.questions||[]).filter(q=>q && q.prompt && !this.hostSeen.has(norm(q.prompt)));
      if(!qs.length){ this.game.phase=MP.NOLYRIC; this.game.netReason='noquiz'; this.broadcastState(); await this.persist(); return; }
      const q=qs[Math.floor(Math.random()*qs.length)];
      this.current={ prompt:q.prompt, slots:q.slots, answers:q.answers, track:'', artist:'', year:'', album:'', art:'', preview:'', lyric:'' };
      this.hostSeen.add(norm(q.prompt));
      this.game.answerSlots=q.slots; this.game.prompt=q.prompt; this.game.preview=''; this.game.lyric=''; this.game.ttsUrl='';
    } else if(this.game.mode==='lektor'){
      const songs=(cat.songs||[]).filter(x=>x.lyric && !this.hostSeen.has(norm(x.title)));
      if(!songs.length){ this.game.phase=MP.NOLYRIC; this.broadcastState(); await this.persist(); return; }
      const x=songs[Math.floor(Math.random()*songs.length)];
      this.current={ track:x.title, artist:x.artist, year:x.year||'', album:x.album||'', art:'', preview:'', lyric:x.lyric };
      this.hostSeen.add(norm(x.title));
      this.game.lyric=x.lyric; this.game.preview=''; this.game.ttsUrl=x.tts||''; this.game.prompt='';
    } else {
      const t=await resolveTrackServer({ cat, seen:this.hostSeen, recent:this.recent });
      if(t.error){ this.game.phase=MP.NETERR; this.game.netReason=t.reason; this.broadcastState(); await this.persist(); return; }
      this.current={ ...t, lyric:'' };
      this.game.preview=t.preview; this.game.lyric=''; this.game.ttsUrl=''; this.game.prompt='';
    }
    this.game.snipStart = this.game.mode==='snippet' ? Math.max(0.5, Math.random()*MP_SNIP_WINDOW_S) : 0;
    // FAZA GOTOWOŚCI: roześlij utwór (bez odpowiedzi), czekaj aż wszyscy zbuforują
    this.game.phase=MP.ARMING; this.game.armNonce=(this.game.armNonce||0)+1;
    this.game.endsAt=null; this.game.readyCount=0; this.game.readyTotal=this.expectedReady().length;
    this.ready=new Set();
    this.broadcastState(); await this.persist();
    // BRAK timera startu: PLAY rusza dopiero gdy WSZYSCY OBECNI zgłoszą ready. Klient nie zbroi się,
    // póki nie zamknie u siebie ekranu odpowiedzi (reveal) → czekamy aż każdy sam przejdzie do nowego pytania.
    // Zawieszony bufor nie blokuje: klient self-reportuje ready w MP_BUFFER_TIMEOUT_MS mimo błędu audio.
  }

  async onReady(id, armNonce){
    if(!this.game || this.game.phase!==MP.ARMING) return;
    if(armNonce!==this.game.armNonce) return;       // ready ze starej rundy
    this.ready.add(id);
    await this.maybeGoArming();
  }

  // id-ki, na które czekamy w fazie gotowości. SALON: TV (host) nie gra → czekamy TYLKO na graczy
  // (TV i tak buforuje audio niezależnie). Brak graczy → fallback na wszystkich (anty-deadlock).
  expectedReady(){
    const ids=this.members().map(m=>m.id);
    if(this.game && this.game.salon){ const ps=ids.filter(id=>id!==this.hostId); return ps.length?ps:ids; }
    return ids;
  }
  // przelicz gotowość i wystartuj, gdy wszyscy OCZEKIWANI gotowi (woła: onReady, onConnect, onClose)
  async maybeGoArming(){
    if(!this.game || this.game.phase!==MP.ARMING) return;
    const r=countReady(this.expectedReady(), this.ready);
    this.game.readyCount=r.count; this.game.readyTotal=r.total;
    if(r.all){ await this.go(); return; }
    this.broadcastState(); await this.persist();
  }

  async go(){
    if(!this.game || this.game.phase!==MP.ARMING) return;
    this.game.phase=assertMp(this.game.phase, MP.PLAY, console.warn);
    this.game.playNonce=(this.game.playNonce||0)+1;
    if(this.game.timer>0) this.game.endsAt=Date.now()+this.game.timer*1000;   // serwerowy stempel czasu
    this.broadcastState(); await this.persist();
    if(this.game.timer>0) this.scheduleAutoLock(this.game.timer*1000);
  }

  /* ---- zatwierdzenie odpowiedzi (host albo serwerowy timer) ---- */
  async lock(){
    if(!this.game || this.game.phase!==MP.PLAY) return;
    this.clearAutoLock();
    const ev=evaluateAnswer(this.game, this.current);
    this.game.score += ev.gained;
    if(ev.firstById){ this.game.tally[ev.firstById]=this.game.tally[ev.firstById]||{name:ev.firstBy,correct:0}; this.game.tally[ev.firstById].correct++; }
    this.game.results.push(ev.result);
    if(!ev.teamOk && ev.anySure){ this.game.beerTally=this.game.beerTally||{}; ev.pewniacy.forEach(n=>{ this.game.beerTally[n]=(this.game.beerTally[n]||0)+1; }); }
    this.game.reveal=ev.reveal;                     // DOPIERO TERAZ odpowiedź trafia do rozsyłanego stanu
    this.game.phase=assertMp(this.game.phase, MP.REVEAL, console.warn); this.game.endsAt=null;
    this.broadcastState(); await this.persist();
  }

  async next(){
    if(!this.game) return;
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
      const payload=buildMpRecord({ game:this.game, tally:this.game.tally, members:this.members(), hostId:this.hostId, roomCode:this.name });
      await insertMatch(this.env, payload);
    }catch(e){ /* nieblokujące */ }
    await this.persist();
  }

  /* ---- serwerowy auto-lock (koniec czasu pytania) ---- */
  scheduleAutoLock(ms){ this.clearAutoLock(); this._autoLock=setTimeout(()=>{ this.lock().catch(()=>{}); }, ms); }
  clearAutoLock(){ if(this._autoLock){ clearTimeout(this._autoLock); this._autoLock=null; } }
}
