/* server/test/authority.test.js — testy AUTORYTATYWNEGO pokoju (Durable Object) poza Workerem.
 * partyserver stubowany loaderem (register.mjs). Pule bez sieci: mecz TYLKO quiz
 * (resolveTrackServer nie jest wołane). Uruchom: npm --prefix server test
 * (node --import ./test/register.mjs test/authority.test.js). */
import { GameAuthority } from '../authorityRoom.js';
import { MP } from '../../core/phases.js';
import { signToken, verifyToken } from '../lib/auth.js';
import { validateMatchRecord, handleApi } from '../lib/api.js';
import { GameRoom } from '../gameRoom.js';
import { MAX_ROUNDS, CPR } from '../../core/match.js';
import { stageIndexAt } from '../../core/timing.js';

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.error('  ✗ '+m);} };
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b), `${m} — oczekiwano ${JSON.stringify(b)}, było ${JSON.stringify(a)}`);
async function group(name, fn){ console.log('• '+name); try{ await fn(); }catch(e){ fail++; console.error('  ✗ WYJĄTEK: '+(e&&e.stack||e)); } }

/* ---- fake'i (klasa używa tylko tych API) ---- */
class FakeStorage {
  #m=new Map(); #alarm=null;
  async get(keys){ return Array.isArray(keys) ? new Map(keys.map(k=>[k,this.#m.get(k)])) : this.#m.get(keys); }
  async put(obj){ for(const k of Object.keys(obj)) this.#m.set(k,obj[k]); }
  async setAlarm(ts){ this.#alarm=ts; }
  async deleteAlarm(){ this.#alarm=null; }
  async deleteAll(){ this.#m.clear(); this.#alarm=null; }
  async getAlarm(){ return this.#alarm; }
}
class FakeConn {
  constructor(id,name){ this.sent=[]; this.state={id,name,verified:true}; this.closed=null; }
  send(s){ this.sent.push(JSON.parse(s)); }
  setState(s){ this.state=s; }
  close(code,why){ this.closed={code,why}; }
  last(t){ for(let i=this.sent.length-1;i>=0;i--) if(this.sent[i].t===t) return this.sent[i]; }
}
async function makeRoom(env={}){
  let initPromise=null;
  // Worker BLOKUJE wiadomości do końca konstruktorowego blockConcurrencyWhile — tu awaitujemy
  // ten promise, inaczej async-wczytanie storage nadpisałoby stan ustawiony przez start (race).
  const ctx={ storage:new FakeStorage(), blockConcurrencyWhile:(fn)=>{ initPromise=fn(); return initPromise; } };
  const room=new GameAuthority(ctx, { TOKEN_SECRET:'x', ...env });
  await initPromise;
  const conns=[];
  room.getConnections=()=>conns;
  room.broadcast=(s)=>conns.forEach(c=>c.send(s));
  room.name='TEST'; room.hostGraceMs=0;   // dawne zachowanie (awans od razu); testy karencji ustawiają własną
  room.join=(id,name)=>{ const c=new FakeConn(id,name); conns.push(c);
    if(!room.hostId) room.hostId=id; room.pushPresence(); return c; };
  room.drop=async(c)=>{ conns.splice(conns.indexOf(c),1); await room.onClose(c); };
  // F2b: prawdziwe wejście przez onConnect (token → tożsamość; reclaim/promote/coop-rejoin)
  room.connect=async(id,name)=>{ const c=new FakeConn(null,null); c.state=null; conns.push(c);
    const tok=await signToken('x', { sub:id });
    await room.onConnect(c, { request:{ url:'https://w/parties/game-authority/TEST?t='+tok+'&name='+encodeURIComponent(name||id) } });
    return c; };
  room.msg=(c,obj)=>room.onMessage(c, JSON.stringify(obj));
  return {room, conns};
}
// pule bez sieci — mecz wyłącznie quiz
function quizPools(n=30){
  const questions=[]; for(let i=0;i<n;i++) questions.push({ prompt:'P'+i, slots:[{key:'a',label:'odp'}], answers:{a:['x'+i]} });
  return { q1:{ label:'Quiz', kind:'quiz', questions } };
}
const CONFIG=(over={})=>({ rounds:1, timer:0, modes:['quiz'], format:'coop', pools:quizPools(), ...over });

/* ==================== 1. pełny przebieg: start→ARMING→ready→PLAY→lock→REVEAL→…→DONE ==================== */
await group('authority 1: pełny mecz quiz coop dochodzi do DONE (mvp/tally)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG() });
  eq(a.last('state').game.phase, MP.ARMING, 'po start → ARMING');
  ok(a.last('state').game.armNonce>=1, 'armNonce ustawiony');
  eq(a.last('state').game.readyTotal, 2, 'readyTotal = 2 gracze');

  // przejdź cały mecz: ARMING→ready(all), PLAY→lock(host), REVEAL→next(host)
  let guard=0;
  while(room.game && room.game.phase!==MP.DONE && guard++<200){
    const g=room.game;
    if(g.phase===MP.ARMING){
      await room.msg(a, { t:'action', action:{ type:'ready', armNonce:g.armNonce } });
      await room.msg(b, { t:'action', action:{ type:'ready', armNonce:g.armNonce } });
    } else if(g.phase===MP.PLAY){
      // A typuje poprawnie bieżące pytanie? nieistotne — testujemy przejścia; po prostu lock
      await room.msg(a, { t:'lock' });
    } else if(g.phase===MP.REVEAL){
      await room.msg(a, { t:'next' });
    } else break;   // NETERR/NOLYRIC — pula za mała (nie powinno przy 30 pytaniach)
  }
  eq(room.game.phase, MP.DONE, 'mecz kończy się w DONE');
  ok(Array.isArray(room.game.tallyList), 'DONE: tallyList obecny');
});

/* ==================== 2. ready: nonce, idempotencja, readyIds (1.1) ==================== */
await group('authority 2: ready — zły nonce ignorowany, idempotencja, readyIds w ARMING', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG() });
  const nonce=room.game.armNonce;
  // zły nonce → brak zmiany readyCount
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:nonce+99 } });
  eq(room.game.readyCount, 0, 'ready ze złym nonce → readyCount 0');
  // dobry nonce, dwukrotnie od A → idempotentne (Set)
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:nonce } });
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:nonce } });
  eq(room.game.readyCount, 1, 'podwójne ready A → liczy się raz');
  ok((a.last('state').game.readyIds||[]).includes('A'), '1.1: readyIds zawiera zgłoszonego A');
  ok(!(a.last('state').game.readyIds||[]).includes('B'), '1.1: readyIds nie zawiera B (jeszcze nie gotów)');
  eq(room.game.phase, MP.ARMING, 'wciąż ARMING (B niegotowy)');
  await room.msg(b, { t:'action', action:{ type:'ready', armNonce:nonce } });
  eq(room.game.phase, MP.PLAY, 'oboje gotowi → PLAY');
});

/* ==================== 3.4 guard next w PLAY + start tylko z lobby/DONE ==================== */
await group('authority 3: podwójny next hosta w PLAY = no-op (3.4)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG() });
  const n=room.game.armNonce;
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:n } });
  await room.msg(b, { t:'action', action:{ type:'ready', armNonce:n } });
  eq(room.game.phase, MP.PLAY, 'PLAY po ready');
  const nonceBefore=room.game.playNonce;
  await room.msg(a, { t:'next' });   // guard: next tylko z REVEAL
  eq(room.game.phase, MP.PLAY, '3.4: next w PLAY nie zmienia fazy');
  eq(room.game.playNonce, nonceBefore, '3.4: playNonce bez zmian');
});

/* ==================== 1.3 retry NOLYRIC → przeskok slotu ==================== */
await group('authority 4: retry w NOLYRIC przeskakuje slot (1.3)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  // pula z 1 pytaniem → po jego zużyciu kolejny slot da NOLYRIC (noquiz)
  await room.msg(a, { t:'start', config:CONFIG({ pools:quizPools(1) }) });
  // graj aż wpadniemy w NOLYRIC
  let guard=0;
  while(room.game && room.game.phase!==MP.NOLYRIC && room.game.phase!==MP.DONE && guard++<50){
    const g=room.game;
    if(g.phase===MP.ARMING) await room.msg(a, { t:'action', action:{ type:'ready', armNonce:g.armNonce } });
    else if(g.phase===MP.PLAY) await room.msg(a, { t:'lock' });
    else if(g.phase===MP.REVEAL) await room.msg(a, { t:'next' });
    else break;
  }
  if(room.game.phase===MP.NOLYRIC){
    const posBefore=room.game.si*100+room.game.qi;   // matchAdvance rusza qi (a po QPC — si)
    await room.msg(a, { t:'retry' });   // 1.3: przeskocz pozycję (matchAdvance) zamiast pętli na pustej puli
    ok((room.game.si*100+room.game.qi)>posBefore || room.game.phase===MP.DONE, '1.3: retry robi POSTĘP (matchAdvance / DONE), nie kręci w kółko');
  } else {
    ok(room.game.phase===MP.DONE, 'pula 1 pytania zakończyła mecz przed NOLYRIC (akceptowalne)');
  }
});

/* ==================== 3.1 viewFor: cudze buckety okrojone w PLAY ==================== */
await group('authority 5: viewFor okraja cudze buckety drużyn w PLAY (3.1)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  // format solo → dwie drużyny (każdy sam) — jest co izolować
  await room.msg(a, { t:'start', config:CONFIG({ format:'solo' }) });
  const n=room.game.armNonce;
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:n } });
  await room.msg(b, { t:'action', action:{ type:'ready', armNonce:n } });
  eq(room.game.phase, MP.PLAY, 'PLAY');
  // A typuje w swojej drużynie
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ a:'sekret-A' } } });
  const teamA=room.game.teams.find(t=>t.members.includes('A')).id;
  const teamB=room.game.teams.find(t=>t.members.includes('B')).id;
  // widok B: bucket A okrojony (bez proposals), ale z licznikiem
  const vB=room.viewFor('B');
  eq(vB.byTeam[teamA].proposals, [], '3.1: B nie widzi treści propozycji drużyny A');
  ok(vB.byTeam[teamA].counts && vB.byTeam[teamA].counts.proposals===1, '3.1: B widzi licznik propozycji A (counts=1)');
  // widok A: własny bucket pełny
  const vA=room.viewFor('A');
  ok(vA.byTeam[teamA].proposals.length===1 && vA.byTeam[teamA].proposals[0].values.a==='sekret-A', '3.1: A widzi własną propozycję w całości');
  eq(vB.byTeam[teamB].proposals.length, 0, '3.1: B (własna drużyna) — brak propozycji (jeszcze nie typował)');
});

/* ==================== 3.2 validateMatchRecord (czysta funkcja) ==================== */
await group('authority 6: validateMatchRecord odrzuca zawyżony wynik (3.2)', async ()=>{
  eq(validateMatchRecord({ total_questions:15, score:20, participants:[] }), null, 'poprawny wynik → null (ok)');
  ok(validateMatchRecord({ total_questions:99999, score:0 }), 'total_questions > cap → błąd');
  // F6a: wynik w PUNKTACH — cap = total_questions × SCORE_MAX_PER_Q (840): 15 pyt. → 12600
  ok(validateMatchRecord({ total_questions:15, score:15*840+1 }), 'score > cap → błąd');
  eq(validateMatchRecord({ total_questions:15, score:15*840 }), null, 'F6a: score = 15 × 840 (max punktów) → ok');
  eq(validateMatchRecord({ total_questions:10, score:1450, participants:[{ profile_id:'p', score:1450, correct_count:9 }] }), null, 'F6a: typowy wynik punktowy „Graj teraz" przechodzi');
  eq(validateMatchRecord({ total_questions:15, score:9, participants:[{ profile_id:'p', score:9, correct_count:9 }] }), null, 'F6a: stary klient (wynik = trafienia) dalej przechodzi');
  ok(validateMatchRecord({ total_questions:15, score:10, participants:[{ profile_id:'p', score:99999 }] }), 'participant.score > cap → błąd');
  ok(validateMatchRecord({ total_questions:15, score:10, participants:[{ profile_id:'p', correct_count:9999 }] }), 'participant.correct_count > total → błąd');
});

/* ==================== 3.6 #8 auth sign/verify ==================== */
await group('authority 7: auth sign/verify — podpis, manipulacja, exp (3.6)', async ()=>{
  const S='sekret-testowy';
  const tok=await signToken(S, { sub:'u1', iat:1, exp:Math.floor(Date.now()/1000)+3600 });
  const p=await verifyToken(S, tok);
  ok(p && p.sub==='u1', 'poprawny token → payload.sub');
  // zmiana 1 znaku payloadu → odrzucony
  const parts=tok.split('.'); parts[1]=parts[1].slice(0,-1)+(parts[1].slice(-1)==='A'?'B':'A');
  ok((await verifyToken(S, parts.join('.')))===null, 'zmanipulowany payload → null');
  // exp w przeszłości → odrzucony
  const expired=await signToken(S, { sub:'u1', iat:1, exp:1 });
  ok((await verifyToken(S, expired))===null, 'token wygasły (exp w przeszłości) → null');
});

/* ==================== MVP-3: config.groupId → game.groupId (tag drużyny) ==================== */
await group('authority 8: config.groupId taguje mecz (MVP-3)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  await room.msg(a, { t:'start', config:CONFIG({ groupId:'team-42' }) });
  eq(room.game.groupId, 'team-42', 'game.groupId = config.groupId');
  // sanityzacja: bardzo długi groupId przycięty do 64 znaków
  const { room:room2 } = await makeRoom();
  const b=room2.join('B','Bo');
  await room2.msg(b, { t:'start', config:CONFIG({ groupId:'x'.repeat(200) }) });
  ok(room2.game.groupId.length===64, 'groupId sanityzowany do 64 znaków');
});


/* ==================== F1: bezpieczeństwo MP (audyt 2026-10: #1 #2 #4 #5 #9 #10 #14) ==================== */
// wejście w PLAY (coop, 2 graczy) — wspólny setup testów F1
async function toPlay(room, a, b, over={}){
  await room.msg(a, { t:'start', config:CONFIG(over) });
  const n=room.game.armNonce;
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:n } });
  await room.msg(b, { t:'action', action:{ type:'ready', armNonce:n } });
}
const HEX=/^#[0-9a-fA-F]{3,8}$/;
const teamOfId=(game,id)=>{ const t=(game&&game.teams||[]).find(x=>(x.members||[]).includes(id)); return t?t.id:null; };

await group('F1 #1/#4: relay eventów — whitelist nazw (sync odrzucony) + nadawca wymuszony z tokenu', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await toPlay(room, a, b);
  const phase=room.game.phase, nA=a.sent.length;
  // atak #1: gracz B rozsyła „stan" eventem sync (podmiana stanu + XSS przez kolor)
  await room.msg(b, { t:'event', event:'sync', payload:{ phase:'done', format:'teams',
    teams:[{ id:'x', name:'a', color:'red"><img src=x onerror=alert(1)>' }], scores:{ x:1 } } });
  await room.msg(b, { t:'event', event:'act', payload:{ type:'pass' } });
  await room.msg(b, { t:'event', event:'cokolwiek', payload:{} });
  ok(!a.sent.slice(nA).some(m=>m.t==='event'), '#1: event sync/act/nieznany NIE trafia do innych klientów');
  eq(room.game.phase, phase, '#1: stan gry bez zmian');
  // atak #4: B podszywa się pod hosta na czacie
  await room.msg(b, { t:'event', event:'say', payload:{ by:'A', byName:'Host', from:'A', text:'hej' } });
  const ev=a.last('event');
  ok(ev && ev.event==='say', 'say przechodzi (whitelist)');
  eq([ev.payload.by, ev.payload.from, ev.payload.byName, ev.from], ['B','B','Bo','B'], '#4: by/from/byName nadpisane tożsamością połączenia');
  // „dalej" w salonie za innych graczy
  await room.msg(b, { t:'event', event:'advanced', payload:{ by:'A', nonce:1 } });
  eq(a.last('event').payload.by, 'B', '#4: advanced — by = nadawca, nie podany id');
});

await group('F1 #2: sanityzacja start — klucz slotu, kolor/nazwa/członkowie drużyn', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  const pools=quizPools(10);
  pools.q1.questions.push({ prompt:'ZŁE', slots:[{ key:'a" autofocus onfocus="x()" y="', label:'odp' }], answers:{ 'a" autofocus onfocus="x()" y="':['1'] } });
  pools.q1.questions.push({ prompt:'ZŁE2', slots:[{ key:'A', label:'<b>' }], answers:{ A:['1'] } });
  await room.msg(a, { t:'start', config:CONFIG({ pools, format:'teams', assignments:[
    { id:'t0', name:'Rekiny z bardzo długą nazwą', color:'red" onmouseover="alert(1)', members:['A','B','GHOST'] },
    { id:'t1', name:'Orki', color:'#CE82FF', members:['B'] },
  ] }) });
  const qs=room.pools.q1.questions;
  ok(qs.length===10 && qs.every(q=>q.slots.every(s=>/^[a-z0-9_]{1,12}$/.test(s.key))), '#2: pytania ze złym kluczem slotu odrzucone');
  ok(room.game.teams.every(t=>HEX.test(t.color)), '#2: kolor drużyny tylko hex (wstrzyknięcie → paleta)');
  eq(room.game.teams.flatMap(t=>t.members).sort(), ['A','B'], '#2: każdy gracz w max 1 drużynie, bez nieobecnych');
  ok(room.game.teams.every(t=>t.name.length<=14), '#2: nazwa drużyny przycięta');
});

await group('F1 #5: start tylko od hosta (lobby i DONE) + rounds/timer przycięte', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(b, { t:'start', config:CONFIG() });
  eq(room.game, null, '#5: start od nie-hosta w lobby zignorowany');
  eq(room.hostId, 'A', '#5: host nie przejęty');
  await room.msg(a, { t:'start', config:CONFIG({ rounds:200000, timer:999999 }) });
  ok(room.game && room.game.rounds===MAX_ROUNDS, '#5: rounds=200000 → MAX_ROUNDS');
  ok(room.game.slots.length<=MAX_ROUNDS*CPR, '#5: liczba slotów ograniczona');
  ok(room.game.timer<=90, '#5: timer przycięty');
  room.game.phase=MP.DONE;
  await room.msg(b, { t:'start', config:CONFIG() });
  eq([room.game.phase, room.hostId], [MP.DONE, 'A'], '#5: start od nie-hosta po DONE zignorowany');
  await room.msg(a, { t:'start', config:CONFIG({ modes:['quiz','<x>'], format:'evil' }) });
  ok(room.game.phase!==MP.DONE && room.game.format==='coop', 'rewanż hosta po DONE działa; zły format → coop');
});

await group('F1 #14: rate-limit akcji i track (token bucket per połączenie)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await toPlay(room, a, b);
  const nA=a.sent.filter(m=>m.t==='state').length;
  for(let i=0;i<100;i++) await room.msg(b, { t:'action', action:{ type:'pass' } });
  const got=a.sent.filter(m=>m.t==='state').length-nA;
  ok(got>0 && got<=20, `#14: 100× pass → ≤20 broadcastów stanu (było ${got})`);
  const nP=a.sent.filter(m=>m.t==='presence').length;
  for(let i=0;i<50;i++) await room.msg(b, { t:'track', name:'x'+i });
  const gotP=a.sent.filter(m=>m.t==='presence').length-nP;
  ok(gotP<=4, `#14: 50× track → ≤4 presence (było ${gotP})`);
});

/* ---- fake D1 (tylko zapytania używane przez record-match / invite) ---- */
function fakeDB({ friends=[] }={}){
  const db={ matches:[], parts:[], answers:[] };
  const stmt=(sql)=>({ sql, args:[], bind(...a){ this.args=a; return this; },
    async first(){
      if(/COUNT\(\*\) AS n FROM matches/.test(sql)) return { n: db.matches.filter(m=>m.host_id===this.args[0]).length };
      if(/FROM friend_requests f JOIN profiles/.test(sql)){
        const [from,,to]=this.args; return friends.some(([x,y])=>(x===from&&y===to)||(x===to&&y===from)) ? { handle:'Prawdziwy '+from } : null;
      }
      return null;
    },
    async all(){ if(/SELECT id FROM profiles WHERE id IN/.test(sql)) return { results:this.args.map(id=>({id})) }; return { results:[] }; },
    async run(){ if(/INSERT INTO matches/.test(sql)) db.matches.push({ id:this.args[0], mode:this.args[1], host_id:this.args[3], group_id:this.args[4] }); return {}; },
  });
  db.prepare=stmt;
  db.batch=async(stmts)=>{ for(const st of stmts){
    if(/match_participants/.test(st.sql)) db.parts.push({ profile_id:st.args[1], display_name:st.args[2], score:st.args[4] });
    if(/match_answers/.test(st.sql)) db.answers.push({ profile_id:st.args[1], track:st.args[5] });
  } };
  return db;
}
async function api(env, path, tok, body){
  const url=new URL('https://w'+path);
  const req=new Request(url, { method:'POST', headers:{ authorization:'Bearer '+tok, 'content-type':'application/json' }, body:JSON.stringify(body) });
  const res=await handleApi(req, env, url);
  return { status:res.status, body:await res.json() };
}

await group('F1 #9: /api/record-match — zapis tylko profilu z tokena + rate-limit + capy stringów', async ()=>{
  const DB=fakeDB(), env={ TOKEN_SECRET:'x', DB };
  const tokH=await signToken('x', { sub:'H' });
  const rec={ mode:'mp', host_id:'H', score:5, total_questions:15, room_code:'ABCD'.repeat(50), group_id:'cudza-druzyna',
    participants:[ { profile_id:'H', display_name:'Host', role:'host', score:3, correct_count:3 },
                   { profile_id:'VICTIM', display_name:'Ofiara', score:30, correct_count:15 } ],
    answers:[ { q_no:1, track:'x'.repeat(5000), artist:'a', ok:true, profile_id:'VICTIM' } ] };
  const r1=await api(env, '/api/record-match', tokH, rec);
  eq(r1.status, 200, 'zapis hosta przechodzi');
  eq(DB.parts.map(p=>p.profile_id), ['H'], '#9: cudzy uczestnik (VICTIM) NIE dostał meczu/punktów');
  ok(DB.answers.every(a=>a.profile_id!=='VICTIM' && a.track.length<=200), '#9: odpowiedzi bez cudzego profile_id, track przycięty');
  eq(DB.matches[0].group_id, null, '#9: group_id bez członkostwa wołającego → null');
  const r2=await api(env, '/api/record-match', tokH, { ...rec, participants:[{ profile_id:'VICTIM', score:1 }] });
  eq(r2.status, 403, '#9: wołający spoza uczestników → 403');
  await api(env, '/api/record-match', tokH, rec);
  const r4=await api(env, '/api/record-match', tokH, rec);
  eq(r4.status, 429, '#9: 3. zapis w oknie 2 min → 429 (rate-limit per profil)');
});

/* ---- relay GameRoom (rollback ?authority=0 + kanały team-/user-) ---- */
async function makeRelay(name, env={}){
  let initPromise=null;
  const ctx={ storage:new FakeStorage(), blockConcurrencyWhile:(fn)=>{ initPromise=fn(); return initPromise; } };
  const room=new GameRoom(ctx, { TOKEN_SECRET:'x', ...env });
  await initPromise;
  const conns=[];
  room.name=name;
  room.getConnections=()=>conns;
  room.broadcast=(s)=>conns.forEach(c=>c.send(s));
  room.join=async(id,name)=>{ const c=new FakeConn(null,null); c.state=null; conns.push(c);
    const tok=await signToken('x', { sub:id });
    await room.onConnect(c, { request:{ url:'https://w/parties/game-room/'+room.name+'?t='+tok+'&name='+encodeURIComponent(name) } });
    return c; };
  room.msg=(c,obj)=>room.onMessage(c, JSON.stringify(obj));
  return room;
}

await group('F1 #1 relay: sync tylko od hosta relay, nadawca w kopercie, whitelist eventów', async ()=>{
  const room=await makeRelay('ABCD');
  const h=await room.join('H','Host'), p=await room.join('P','Gracz');
  eq(room.hostId, 'H', 'host relay = pierwszy łączący');
  await room.msg(p, { t:'b', event:'sync', payload:{ phase:'done', hostId:'P' } });
  ok(!h.sent.some(m=>m.t==='b' && m.event==='sync'), '#1 relay: sync od gracza NIE rozesłany');
  await room.msg(h, { t:'b', event:'sync', payload:{ phase:'play', hostId:'H' } });
  const s=p.last('b');
  ok(s && s.event==='sync' && s.from==='H', 'sync hosta rozesłany z from=H');
  await room.msg(p, { t:'b', event:'act', payload:{ type:'vote', by:'H' } });
  eq(h.last('b').payload.by, 'P', '#4 relay: act.by wymuszone (gracz nie głosuje za hosta)');
  const n=h.sent.length;
  await room.msg(p, { t:'b', event:'evil', payload:{} });
  eq(h.sent.length, n, 'nieznany event odrzucony');
});

await group('F1 #10: kanał user-<id> — słucha tylko właściciel, invite tylko od znajomego, rate-limit', async ()=>{
  const DB=fakeDB({ friends:[['F','O']] });
  const room=await makeRelay('user-O', { DB });
  const o=await room.join('O','Owner'), f=await room.join('F','Fake name'), x=await room.join('X','Obcy');
  ok(!f.sent.some(m=>m.t==='presence') && !x.sent.some(m=>m.t==='presence'), '#10: nie-właściciel nie dostaje presence');
  await room.msg(x, { t:'b', event:'invite', payload:{ code:'ABCD', byName:'Twoja Mama', by:'F' } });
  ok(!o.sent.some(m=>m.t==='b'), '#10: invite od NIE-znajomego odrzucone');
  await room.msg(f, { t:'b', event:'invite', payload:{ code:'AB<>CD', byName:'Ktoś inny', by:'Q' } });
  const inv=o.last('b');
  ok(inv && inv.event==='invite', 'invite od znajomego dostarczone właścicielowi');
  eq([inv.payload.code, inv.payload.by, inv.payload.byName], ['ABCD','F','Prawdziwy F'], '#10: code oczyszczony, by/byName z serwera (D1)');
  ok(!x.sent.some(m=>m.t==='b') && !f.sent.some(m=>m.t==='b'), '#10: podsłuch — inni nie dostają zaproszeń właściciela');
  for(let i=0;i<10;i++) await room.msg(f, { t:'b', event:'invite', payload:{ code:'ABCD' } });
  ok(o.sent.filter(m=>m.t==='b').length<=3, '#10: rate-limit zaproszeń (burst 3)');
  // bez D1 → fail-closed
  const room2=await makeRelay('user-O');
  const o2=await room2.join('O','Owner'), f2=await room2.join('F','F');
  await room2.msg(f2, { t:'b', event:'invite', payload:{ code:'ABCD' } });
  ok(!o2.sent.some(m=>m.t==='b'), '#10: brak D1 → invite odrzucone (fail-closed)');
});


/* ==================== F2b: odporność MP (audyt 2026-10: #3 #6 #7 #8 #11 #12) ==================== */
const readyAll=async(room, ...cs)=>{ const n=room.game.armNonce; for(const c of cs) await room.msg(c, { t:'action', action:{ type:'ready', armNonce:n } }); };
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

await group('F2b #3: zamknięcie DRUGIEGO socketu hosta nie odbiera mu roli (dwie karty / half-open)', async ()=>{
  const { room } = await makeRoom();
  const h1=room.join('H','Host'), p=room.join('P','Pola');
  await toPlay(room, h1, p);
  const h2=await room.connect('H','Host');          // reconnect / druga karta — H1 jeszcze otwarty
  await room.drop(h1);                              // stary socket H1 zamknięty PO wejściu H2
  eq(room.hostId, 'H', '#3: host zostaje hostem (ma inne połączenie)');
  eq(h2.last('presence').hostId, 'H', '#3: presence nadal hostId=H');
  await room.msg(h2, { t:'lock' });
  eq(room.game.phase, MP.REVEAL, '#3: lock od H2 działa');
});

await group('F2b #3: host sam (bez kogo awansować) → pokój czeka; po powrocie gra toczy się dalej', async ()=>{
  const { room } = await makeRoom();
  const h1=room.join('H','Host');
  await room.msg(h1, { t:'start', config:CONFIG() });
  await readyAll(room, h1);
  eq(room.game.phase, MP.PLAY, 'PLAY');
  const h2=await room.connect('H','Host');
  await room.drop(h1);
  await room.drop(h2);                              // wszyscy wyszli
  eq(room.hostId, 'H', '#3: brak kogo awansować → hostId NIE zerowany');
  const h3=await room.connect('H','Host');          // host wraca
  eq(h3.last('presence').hostId, 'H', '#3: po powrocie presence hostId=H');
  await room.msg(h3, { t:'lock' });
  eq(room.game.phase, MP.REVEAL, '#3: po powrocie lock działa (bez zamrożenia)');
  await room.msg(h3, { t:'next' });
  ok(room.game.phase===MP.ARMING, '#3: next działa → ARMING');
});

await group('F2b #3: host nieobecny → nowy łączący przejmuje; starter wraca → odzyskuje', async ()=>{
  const { room } = await makeRoom();
  const h=room.join('H','Host'), p=room.join('P','Pola');
  await toPlay(room, h, p);
  await room.drop(p); await room.drop(h);           // P wyszedł pierwszy → przy wyjściu H nie ma kogo awansować
  eq(room.hostId, 'H', 'hostId zostaje H');
  const p2=await room.connect('P','Pola');
  eq(room.hostId, 'P', 'P wraca, H nieobecny → P przejmuje (pokój nie zamarza na zawsze)');
  const h2=await room.connect('H','Host');
  eq([room.hostId, h2.last('presence').hostId], ['H','H'], 'starter H wraca → odzyskuje hosta');
});

await group('F2b #6: twardy timeout ARMING → start z gotowymi (AFK nie blokuje pokoju)', async ()=>{
  const { room } = await makeRoom();
  room.armTimeoutMs=30;
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG() });
  ok(a.last('state').game.armMs>0, 'ARMING niesie armMs (licznik w UI)');
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:room.game.armNonce } });
  eq(room.game.phase, MP.ARMING, 'B AFK → ARMING');
  await sleep(80);
  eq(room.game.phase, MP.PLAY, '#6: po timeoucie → PLAY bez B');
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ a:'x' } } });
  ok(room.game.byTeam.all.proposals.length===1, 'niegotowy B gra normalnie po starcie (dogania)');
});

await group('F2b #6: host „pomiń czekających" {t:go} w ARMING; nie-host ignorowany', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG() });
  await room.msg(b, { t:'go' });
  eq(room.game.phase, MP.ARMING, '#6: go od nie-hosta → bez zmian');
  await room.msg(a, { t:'go' });
  eq(room.game.phase, MP.PLAY, '#6: go od hosta → PLAY');
  const pn=room.game.playNonce;
  await room.msg(a, { t:'go' });
  eq(room.game.playNonce, pn, 'go poza ARMING = no-op');
});

await group('F2b #6: timer ARMING wznawiany po restarcie DO (persist armDeadline)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG() });
  room.clearArmTimer();                              // „evikcja": in-memory timer zginął
  const ctx={ storage:room.ctx.storage, blockConcurrencyWhile:null };
  let init=null; ctx.blockConcurrencyWhile=(fn)=>{ init=fn(); return init; };
  room.armDeadline=Date.now()+20; await room.persist();
  const r2=new GameAuthority(ctx, { TOKEN_SECRET:'x' }); await init;
  r2.getConnections=()=>[a,b]; r2.broadcast=(s)=>[a,b].forEach(c=>c.send(s));
  eq(r2.game.phase, MP.ARMING, 'po restarcie ARMING');
  await sleep(70);
  eq(r2.game.phase, MP.PLAY, '#6: wznowiony timer ARMING startuje pytanie');
});

await group('F2b #7: coop — gracz wraca w ARMING/PLAY → dołącza do drużyny i gra', async ()=>{
  const { room } = await makeRoom();
  const h=room.join('H','Host'), p=room.join('P','Pola');
  await toPlay(room, h, p, { rounds:2 });
  await room.msg(h, { t:'lock' });
  await room.drop(p);                               // P traci zasięg na odsłonie…
  await room.msg(h, { t:'next' });                  // …dokładnie gdy host klika „Następne"
  eq(room.game.teams[0].members, ['H'], 'newRound składa drużynę z obecnych (bez P)');
  const p2=await room.connect('P','Pola');          // P wraca w ARMING
  ok(room.game.teams[0].members.includes('P'), '#7: powrót w ARMING → P w drużynie');
  await readyAll(room, h, p2);
  eq(room.game.phase, MP.PLAY, 'PLAY');
  await room.msg(p2, { t:'action', action:{ type:'propose', values:{ a:'cokolwiek' } } });
  ok(room.game.byTeam.all.proposals.some(x=>x.by==='P'), '#7: typ P przyjęty');
  // powrót w trakcie PLAY
  await room.drop(p2);
  room.game.teams[0].members=['H'];                 // jak po newRound bez P
  const p3=await room.connect('P','Pola');
  ok(room.game.teams[0].members.includes('P'), '#7: powrót w PLAY → P w drużynie');
  ok((p3.last('state').game.teams[0].members||[]).includes('P'), 'stan z P w drużynie rozesłany');
});

await group('F2b #7: salon — TV (host) po powrocie NIE trafia do drużyny graczy', async ()=>{
  const { room } = await makeRoom();
  const tv=room.join('TV','Telewizor'), p=room.join('P','Pola');
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true }) });
  const tv2=await room.connect('TV','Telewizor');
  ok(!room.game.teams[0].members.includes('TV'), 'TV poza drużyną');
});

await group('F2b #8: liga — uczestnik = kto odpowiadał (wyszedł przed DONE: jest; widz: nie ma)', async ()=>{
  const DB=fakeDB();
  const { room } = await makeRoom({ DB });
  const h=room.join('H','Host'), p=room.join('P','Pola');
  await toPlay(room, h, p);
  // P trafia każde pytanie, potem wychodzi przed końcem; Z dołącza na sam koniec i nic nie robi
  let guard=0, z=null;
  while(room.game.phase!==MP.DONE && guard++<100){
    const g=room.game;
    room.getConnections().forEach(c=>{ c._tb=null; });   // rate-limit (F1 #14) nie dotyczy symulacji długiego meczu
    if(g.phase===MP.ARMING){ await readyAll(room, ...room.getConnections()); continue; }
    if(g.phase===MP.PLAY){
      const ans=room.current.answers.a[0];
      if(room.getConnections().includes(p)) await room.msg(p, { t:'action', action:{ type:'propose', values:{ a:ans } } });
      await room.msg(h, { t:'lock' });
      continue;
    }
    if(g.phase===MP.REVEAL){
      if(g.qi===2 && room.getConnections().includes(p)) await room.drop(p);
      if(g.qi===3 && !z) z=await room.connect('Z','Zocha');
      await room.msg(h, { t:'next' });
      continue;
    }
    break;
  }
  eq(room.game.phase, MP.DONE, 'mecz dobiegł końca');
  const ids=DB.parts.map(x=>x.profile_id);
  ok(ids.includes('P'), '#8: P (wyszedł przed DONE) zapisany do ligi');
  ok(DB.parts.find(x=>x.profile_id==='P').score>=3, '#8: z jego trafieniami');
  ok(!ids.includes('Z'), '#8: Z (widz bez odpowiedzi) NIE zapisany');
});

await group('F2b #8: salon — TV-host nie trafia do ligi', async ()=>{
  const DB=fakeDB();
  const { room } = await makeRoom({ DB });
  const tv=room.join('TV','Telewizor'), p=room.join('P','Pola');
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true }) });
  let guard=0;
  while(room.game.phase!==MP.DONE && guard++<100){
    const g=room.game;
    room.getConnections().forEach(c=>{ c._tb=null; });   // rate-limit (F1 #14) nie dotyczy symulacji długiego meczu
    if(g.phase===MP.ARMING) await readyAll(room, p);
    else if(g.phase===MP.PLAY){ await room.msg(tv, { t:'action', action:{ type:'vote', slot:'a', value:'x', set:true } });
      await room.msg(p, { t:'action', action:{ type:'pass' } }); await room.msg(tv, { t:'lock' }); }
    else if(g.phase===MP.REVEAL) await room.msg(tv, { t:'next' });
    else break;
  }
  eq(DB.parts.map(x=>x.profile_id), ['P'], '#8: tylko gracz P (TV poza ligą)');
});

await group('F2b #11: ARMING bez treści pytania/tekstu/offsetu — dopiero w PLAY', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG() });
  const arm=b.last('state').game;
  eq(arm.phase, MP.ARMING, 'ARMING');
  eq(arm.prompt||'', '', '#11: brak treści pytania w ARMING');
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:arm.armNonce } });
  eq(b.last('state').game.prompt||'', '', '#11: nadal brak po ready innego gracza');
  await room.msg(b, { t:'action', action:{ type:'ready', armNonce:arm.armNonce } });
  const play=b.last('state').game;
  eq(play.phase, MP.PLAY, 'PLAY');
  ok(/^P\d+$/.test(play.prompt), '#11: treść pytania w PLAY');
  // lektor/fragment: bezpośrednio na stanie serwera (bez sieci — nowa runda ręcznie)
  room.game.phase=MP.ARMING; room.armHidden={ prompt:'', lyric:'tekst piosenki', ttsUrl:'tts/x.mp3', snipStart:7.5 };
  room.game.lyric=''; room.game.ttsUrl=''; room.game.snipStart=0;
  await room.go();
  eq([room.game.lyric, room.game.ttsUrl, room.game.snipStart], ['tekst piosenki','tts/x.mp3',7.5], '#11: lyric/tts/offset fragmentu ujawnione w go()');
});

await group('F2b #11: lektor — tekst/TTS nie w ARMING (newRound z pulą piosenek)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  const pools={ ly:{ label:'Teksty', kind:'lyrics', songs:[{ title:'T', artist:'A', lyric:'la la la', tts:'tts/a.mp3' }] } };
  await room.msg(a, { t:'start', config:CONFIG({ modes:['lektor'], pools }) });
  const g=a.last('state').game;
  if(g.phase===MP.ARMING){
    eq([g.lyric||'', g.ttsUrl||''], ['',''], '#11: lektor w ARMING bez tekstu i TTS');
    await readyAll(room, a);
    eq(a.last('state').game.lyric, 'la la la', '#11: tekst lektora w PLAY');
  } else ok(false, 'lektor: oczekiwano ARMING, było '+g.phase);
});

await group('lektor: język opisu kategorii (lang) → game.lyricLang w PLAY, sanityzacja pl|en', async ()=>{
  for(const [lang, want] of [['en','en'], [undefined,'pl'], ['<script>','pl'], ['EN','en']]){
    const { room } = await makeRoom();
    const a=room.join('A','Ala');
    const ly={ label:'Teksty', kind:'lyrics', songs:[{ title:'T', artist:'A', lyric:'clue in English' }] };
    if(lang!==undefined) ly.lang=lang;
    await room.msg(a, { t:'start', config:CONFIG({ modes:['lektor'], pools:{ ly } }) });
    const g=a.last('state').game;
    eq(g.lyricLang||'', '', 'lang='+lang+': brak języka w ARMING (odsłaniany z tekstem)');
    await readyAll(room, a);
    eq(a.last('state').game.lyricLang, want, 'lang='+lang+' → '+want);
    ok(lang===undefined ? room.pools.ly.lang===undefined : room.pools.ly.lang===want, 'pula po clampPools: lang tylko pl|en');
  }
});

await group('kategoria „akustycznie / unplugged": pole `match` utworu przechodzi przez clampPools (tekst z capem)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  const ak={ label:'akustycznie / unplugged', songs:[{ title:'About a Girl', artist:'Nirvana', year:'1994', match:'unplugged' }, { title:'T', artist:'A', match:'x'.repeat(100) }, { title:'U', artist:'B' }] };
  await room.msg(a, { t:'start', config:CONFIG({ pools:{ ...quizPools(), ak } }) });
  const ps=room.pools && room.pools.ak && room.pools.ak.songs || [];
  eq(ps.map(x=>x.match===undefined ? null : x.match.length), [9, 40, null], 'match: zachowany, przycięty do 40 znaków, brak → brak');
});

await group('F2b #12: duplikat ready nie powoduje broadcastu (bez kaskady re-arm)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG() });
  const n=room.game.armNonce;
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:n } });
  const before=b.sent.filter(m=>m.t==='state').length;
  for(let i=0;i<5;i++) await room.msg(a, { t:'action', action:{ type:'ready', armNonce:n } });
  eq(b.sent.filter(m=>m.t==='state').length, before, '#12: 5× to samo ready → 0 broadcastów');
});

/* ==================== F3: silnik oceny quizu (SPEC v2) po stronie serwera ==================== */
const BALT={ prompt:'Wymień państwa bałtyckie.', slots:[{key:'a',label:'kraj 1'},{key:'b',label:'kraj 2'},{key:'c',label:'kraj 3'}],
  answers:{ a:['Litwa','Łotwa','Estonia'], b:['Litwa','Łotwa','Estonia'], c:['Litwa','Łotwa','Estonia'] },
  pool:[['Litwa'],['Łotwa'],['Estonia']], difficulty:2, fun:'<i>Estonia</i> ma ~2200 wysp.' };
const ABCD={ prompt:'Gdzie powstają krwinki czerwone?\nA) W szpiku kostnym\nB) W sercu\nC) W nadnerczach\nD) W żołądku',
  slots:[{key:'a',label:'odp'}], answers:{ a:['A','W szpiku kostnym','szpik'] }, fun:'U płodu też w wątrobie.' };
const onePool=(q)=>({ q1:{ label:'Quiz', kind:'quiz', questions:[q] } });

await group('F3: clampQuestion przepuszcza pool/difficulty/fun (sanityzacja)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  const evil={ ...BALT, pool:[...BALT.pool, [], [5, null, '  '], 'x', Array(50).fill('y'), ['z'.repeat(500)]],
    difficulty:'2', fun:'f'.repeat(1000) };
  const many={ ...BALT, prompt:'Q2', pool:Array.from({length:60},(_,i)=>['p'+i]), difficulty:7, fun:{ x:1 } };
  await room.msg(a, { t:'start', config:CONFIG({ pools:{ q1:{ label:'Quiz', kind:'quiz', questions:[evil, many] } } }) });
  const [q, q2]=room.pools.q1.questions;
  ok(Array.isArray(q.pool), 'pool przepuszczony');
  eq(q.pool.slice(0,3), [['Litwa'],['Łotwa'],['Estonia']], 'pozycje puli zachowane');
  ok(q.pool.every(it=>Array.isArray(it) && it.length && it.every(v=>typeof v==='string' && v.length && v.length<=120)), 'puste/nie-stringi wycięte, długość aliasu ≤120');
  ok(q.pool.every(it=>it.length<=8), 'max 8 aliasów na pozycję');
  eq(q.difficulty, 2, 'difficulty 1..3 (liczba)');
  eq(q.fun.length, 300, 'fun przycięty do 300');
  eq(q2.pool.length, 24, 'max 24 pozycje puli');
  ok(!('difficulty' in q2) && !('fun' in q2), 'difficulty spoza 1..3 / fun nie-tekst → pominięte');
});

await group('F3: pool — sloty wymienne z dedup (ocena serwera) + fun w odsłonie', async ()=>{
  for(const [vals, want, msg] of [
    [{a:'Estonia',b:'Litwa',c:'Łotwa'}, true, 'dowolna kolejność → ✓'],
    [{a:'Litwa',b:'Litwa',c:'Litwa'}, false, '„Litwa ×3" → ✗ (dedup)'],
  ]){
    const { room } = await makeRoom();
    const a=room.join('A','Ala');
    await room.msg(a, { t:'start', config:CONFIG({ pools:onePool(BALT) }) });
    await readyAll(room, a);
    eq(room.game.phase, MP.PLAY, 'PLAY');
    await room.msg(a, { t:'action', action:{ type:'propose', values:vals } });
    await room.msg(a, { t:'lock' });
    const rv=a.last('state').game.reveal;
    eq(rv.teamOk, want, msg);
    eq(rv.fun, BALT.fun, 'reveal.fun (surowy tekst — escape robi klient)');
    if(want) eq(rv.display, {a:'Estonia',b:'Litwa',c:'Łotwa'}, 'reveal.display = kanoniczne trafione');
  }
});

await group('F3: ABCD tasowane na serwerze — wspólny prompt, litera nie wycieka przed REVEAL, ocena po opcji', async ()=>{
  const letters=new Set();
  for(let i=0;i<16;i++){
    const { room } = await makeRoom();
    const a=room.join('A','Ala'), b=room.join('B','Bo');
    await room.msg(a, { t:'start', config:CONFIG({ pools:onePool(ABCD) }) });
    await readyAll(room, a, b);
    const ga=a.last('state').game, gb=b.last('state').game;
    eq(ga.prompt, gb.prompt, 'ten sam (potasowany) prompt u wszystkich');
    const correct=room.current.mc.correct; letters.add(correct);
    ok(new RegExp('\\n'+correct+'\\) W szpiku kostnym').test(ga.prompt), 'prompt: poprawna opcja pod nową literą');
    // nic z sekretu w stanie przed REVEAL (answers/mc/pool/fun)
    const pre=JSON.stringify(b.sent.filter(m=>m.t==='state'));
    ok(!/"answers"|"mc"|"correct"|płodu/.test(pre), 'answers/mc/fun nie wyciekają przed REVEAL');
    const wrong=['A','B','C','D'].find(l=>l!==correct);
    await room.msg(b, { t:'action', action:{ type:'propose', values:{ a: i%2 ? correct.toLowerCase() : wrong } } });
    await room.msg(a, { t:'lock' });
    const rv=a.last('state').game.reveal;
    eq(rv.teamOk, !!(i%2), i%2 ? 'wybór poprawnej opcji (nowa litera) ✓' : 'inna litera ✗');
    eq(rv.display.a, correct+') W szpiku kostnym', 'reveal.display = „X) tekst"');
    eq(rv.answers.a[0], correct, 'reveal.answers.a[0] = przemapowana litera (stary klient)');
  }
  ok(letters.size>=2, 'poprawna litera zmienia się między meczami ('+[...letters].join('')+')');
});

/* ==================== F6a: długość meczu w pytaniach + punkty na serwerze ==================== */
await group('F6a: start {questions} — 5 pytań = 1 slot; stary klient (tylko rounds) bez zmian; cap MAX', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  await room.msg(a, { t:'start', config:CONFIG({ questions:5, rounds:1 }) });
  eq([room.game.slots.length, room.game.qpc], [5, 1], 'P1-7: questions=5 → 5 slotów po 1 pytaniu (qpc 1)');
  room.game.phase=MP.DONE;
  await room.msg(a, { t:'start', config:CONFIG({ rounds:2 }) });
  eq(room.game.slots.length, 2*CPR, 'stary klient: rounds=2 → 2×CPR slotów');
  room.game.phase=MP.DONE;
  await room.msg(a, { t:'start', config:CONFIG({ questions:1e9, rounds:1 }) });
  ok(room.game.slots.length<=MAX_ROUNDS*CPR, 'questions ogromne → przycięte (≤ MAX slotów)');
});
await group('F6a: lock liczy PUNKTY (scoreRound) + playAt w PLAY + seria', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  await room.msg(a, { t:'start', config:CONFIG({ questions:5, rounds:1 }) });
  await room.msg(a, { t:'action', action:{ type:'ready', armNonce:room.game.armNonce } });
  eq(room.game.phase, MP.PLAY, 'PLAY');
  ok(Number.isFinite(room.game.playAt), 'playAt ustawione na starcie PLAY');
  const good=room.current.answers.a[0];
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ a:good } } });
  await room.msg(a, { t:'lock' });
  const sc=Object.values(room.game.scores)[0];
  ok(sc>=100 && sc<=150, 'trafienie quizu = 100 pkt + bonus za szybkość (≤150): '+sc);
  eq(Object.values(room.game.streaks)[0], 1, 'seria drużyny = 1');
});


await group('F6b: „Jeden głośnik" — audioHostOnly z configu w stanie gry (boolean, sanityzowany)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG({ audioHostOnly:true }) });
  eq(room.game.audioHostOnly, true, 'flaga w stanie gry (wysyłana wszystkim)');
  eq(b.last('state').game.audioHostOnly, true, 'nie-host dostaje flagę w {t:state}');
  const r2=await makeRoom(); const a2=r2.room.join('A','Ala');
  await r2.room.msg(a2, { t:'start', config:CONFIG({ audioHostOnly:'1' }) });
  eq(r2.room.game.audioHostOnly, false, 'nie-boolean → false');
});

await group('F6b: emotka 🍺 przechodzi, 🖕 odrzucona (whitelist wspólna z klientem)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  const n=a.sent.length;
  await room.msg(b, { t:'event', event:'react', payload:{ emoji:'🖕' } });
  ok(!a.sent.slice(n).some(m=>m.t==='event'), '🖕 nie trafia do innych');
  await room.msg(b, { t:'event', event:'react', payload:{ emoji:'🍺' } });
  const ev=a.last('event');
  ok(ev && ev.event==='react' && ev.payload.emoji==='🍺', '🍺 rozsyłane');
});

await group('F6b (#6): salon w formacie Solo — TV poza drużynami, jej akcje ignorowane, widzi stan wszystkich', async ()=>{
  const { room } = await makeRoom();
  const tv=room.join('TV','Telewizor'), p=room.join('P','Pola'), q=room.join('Q','Quba');
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true, format:'solo' }) });
  eq(room.game.teams.length, 2, 'Solo: drużyna na gracza, bez TV');
  ok(!room.game.teams.some(t=>t.members.includes('TV')), 'TV poza drużynami');
  for(const c of [p,q]) await room.msg(c, { t:'action', action:{ type:'ready', armNonce:room.game.armNonce } });
  eq(room.game.phase, MP.PLAY, 'PLAY po gotowości graczy (TV nie czeka)');
  await room.msg(p, { t:'action', action:{ type:'propose', values:{ a:'cokolwiek' } } });
  const before=JSON.stringify(room.game.byTeam);
  await room.msg(tv, { t:'action', action:{ type:'vote', slot:'a', value:'X', set:true } });
  eq(JSON.stringify(room.game.byTeam), before, 'głos TV nie zmienia bucketów drużyn');
  const tvView=tv.last('state').game, qView=q.last('state').game;
  const pTeam=room.game.teams.find(t=>t.members.includes('P')).id;
  ok(tvView.byTeam[pTeam].proposals.length===1, 'TV widzi typy (render pokazuje tylko liczniki)');
  ok(qView.byTeam[pTeam].proposals.length===0, 'rywal nie widzi typów P (izolacja bez zmian)');
  await room.msg(tv, { t:'lock' });
  eq(room.game.phase, MP.REVEAL, 'TV (host) zatwierdza wszystkich');
  ok(Array.isArray(room.game.reveal.ranking) && room.game.reveal.ranking.length===2, 'odsłona z rankingiem drużyn');
  ok(Array.isArray(room.game.reveal.byTeam[pTeam].credits), 'odsłona: credits per drużyna (R8)');
});

/* ==================== F8a: tryby „abcd" i „rok" w MP (autorytet), capabilities, intro tylko solo ==================== */
const audioPools=()=>({ d80:{ label:'80s', range:'1980–89', artists:['Toto','a-ha','Van Halen','Queen'] } });
const TRACK={ track:'Africa', artist:'Toto', year:'1982', album:'Toto IV', preview:'https://p/africa.m4a', art:'' };
function stubResolver(room, { track=TRACK, distractors=[{track:'Jump',artist:'Van Halen'},{track:'Take On Me',artist:'a-ha'},{track:'Radio Ga Ga',artist:'Queen'}] }={}){
  room.resolver={ track: async()=>({ ...track }), distractors: async()=>distractors.slice() };
}
await group('F8a: presence niesie `modes` (capability) — z „intro" (MP pod autorytetem), bez trybów tylko-solo', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  const pr=a.last('presence');
  ok(Array.isArray(pr.modes) && pr.modes.includes('abcd') && pr.modes.includes('year'), 'presence.modes zawiera nowe tryby MP');
  ok(['intro','medley','piano','guitar','timeline','cover'].every(m=>pr.modes.includes(m)), 'tryby tylko-autorytet ogłaszane (intro, składanka, covery, oś czasu, okładka)');
});
await group('F8a: ABCD muzyki — opcje od autorytetu, prompt dopiero w PLAY, litera sekretem do REVEAL', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo'); stubResolver(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['abcd'], format:'coop', pools:audioPools() } });
  let g=a.last('state').game;
  eq(g.phase, MP.ARMING, 'ARMING'); eq(g.mode, 'abcd', 'tryb abcd');
  eq(g.preview, TRACK.preview, 'zajawka do buforowania w ARMING');
  eq(g.prompt, '', 'kafle ukryte w ARMING (F2b #11)');
  eq((g.answerSlots||[]).map(s=>s.key), ['a'], 'jeden slot litery');
  const secret=room.current.mc.correct;
  ok(/^[ABCD]$/.test(secret), 'poprawna litera tylko w this.current');
  ok(!JSON.stringify(g).includes('"correct"') && !JSON.stringify(g).includes('"answers"'), 'stan bez mc.correct/answers');
  for(const c of [a,b]) await room.msg(c, { t:'action', action:{ type:'ready', armNonce:room.game.armNonce } });
  g=b.last('state').game;
  eq(g.phase, MP.PLAY, 'PLAY');
  ok(/^Jaki to utwór\?\nA\) /.test(g.prompt) && g.prompt.includes('Africa — Toto'), 'kafle w PLAY');
  ok(!JSON.stringify(g).includes('"correct"'), 'w PLAY nadal bez poprawnej litery');
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ a:secret } } });
  await room.msg(a, { t:'lock' });
  const r=a.last('state').game.reveal;
  eq(a.last('state').game.phase, MP.REVEAL, 'REVEAL');
  eq(r.kind, 'quiz', 'odsłona jak ABCD quizu'); ok(r.teamOk, 'drużyna trafiła literą');
  eq(r.answers.a[0], secret, 'litera ujawniona dopiero w REVEAL');
  ok(r.gained>=100, 'punkty jak quiz (100 + szybkość)');
  eq(room.game.results[0].track, 'Africa', 'wynik do ligi: tytuł utworu');
});
await group('F8a: ABCD — za mało dystraktorów → pytanie jak muzyka (tytuł+wykonawca)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'); stubResolver(room, { distractors:[{track:'Jump',artist:'Van Halen'}] });
  await room.msg(a, { t:'start', config:{ questions:5, modes:['abcd'], format:'coop', pools:audioPools() } });
  eq(room.game.mode, 'music', 'fallback: muzyka'); eq(room.game.answerSlots, null, 'sloty domyślne (tytuł/wykonawca)');
  ok(!room.current.answers, 'bez answers → ocena muzyki');
});
await group('F8a: tryb „rok" — slot liczbowy, głosowanie co-op, yearScore, notka „wg iTunes"', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo'), c=room.join('C','Cy'); stubResolver(room, { track:{ ...TRACK, year:'2011' } });
  await room.msg(a, { t:'start', config:{ questions:5, modes:['year'], format:'coop', pools:audioPools() } });
  eq(room.game.mode, 'year', 'tryb rok'); eq(room.game.answerSlots, [{key:'year',label:'rok'}], 'slot roku');
  eq(room.current.yearNote, 'rok wg wydania w iTunes', '2011 poza dekadą 80s → notka');
  for(const x of [a,b,c]) await room.msg(x, { t:'action', action:{ type:'ready', armNonce:room.game.armNonce } });
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ year:'2009' } } });
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ year:'2012' } } });
  await room.msg(c, { t:'action', action:{ type:'vote', slot:'year', value:'2012' } });
  await room.msg(a, { t:'lock' });
  const r=room.game.reveal;
  eq(r.kind, 'year', 'odsłona roku'); eq(r.year, '2011', 'rok utworu nienadpisany');
  eq(r.locked.year, '2012', 'odpowiedź drużyny = górka głosów'); eq(r.yearEval.pts, 70, '±1 → 70');
  ok(r.teamOk, '±1 = trafienie'); eq(r.yearNote, 'rok wg wydania w iTunes', 'notka w odsłonie');
});
await group('F8a: tryb „rok" — brak roku (np. Deezer) → pytanie jak muzyka', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'); stubResolver(room, { track:{ ...TRACK, year:'' } });
  await room.msg(a, { t:'start', config:{ questions:5, modes:['year'], format:'coop', pools:audioPools() } });
  eq(room.game.mode, 'music', 'fallback muzyka'); eq(room.game.answerSlots, null, 'sloty domyślne');
});
/* ==================== EKSPERYMENT: „od tyłu krótko" w MP; składanka/okładka tylko solo ==================== */
await group('EKSP.: „od tyłu krótko" — offset okna od autorytetu, ukryty do PLAY, odpowiedź jak muzyka', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo'); stubResolver(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['revsnip'], format:'coop', pools:audioPools() } });
  let g=a.last('state').game;
  eq([g.phase, g.mode], [MP.ARMING, 'revsnip'], 'ARMING, tryb revsnip');
  eq(g.snipStart, 0, 'offset ukryty w ARMING (F2b #11)');
  eq(g.answerSlots, null, 'sloty domyślne (tytuł + wykonawca)');
  const hidden=room.armHidden && room.armHidden.snipStart;
  ok(hidden>=8 && hidden<=20, 'koniec okna w [8..20] — '+hidden);
  for(const c of [a,b]) await room.msg(c, { t:'action', action:{ type:'ready', armNonce:room.game.armNonce } });
  g=b.last('state').game;
  eq(g.phase, MP.PLAY, 'PLAY'); eq(g.snipStart, hidden, 'offset ujawniony w PLAY');
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ title:'Africa', artist:'Toto' } } });
  await room.msg(a, { t:'lock' });
  const r=a.last('state').game.reveal;
  eq(r.kind, 'music', 'odsłona jak muzyka'); ok(r.teamOk && r.gained>=100, 'trafienie tytuł+wykonawca punktuje jak muzyka');
});
/* ==================== EKSPERYMENT: „zwolnione obroty"/„przyspieszone" w MP (tempo lokalne), „oś czasu" tylko solo ==================== */
await group('EKSP.: „zwolnione obroty" — flaga trybu w stanie, pytanie jak muzyka, mnożnik ×1.5 (fastmo ×1.2)', async ()=>{
  for(const [mode, mult] of [['slowmo',1.5],['fastmo',1.2]]){
    const { room } = await makeRoom();
    const a=room.join('A','Ala'), b=room.join('B','Bo'); stubResolver(room);
    await room.msg(a, { t:'start', config:{ questions:5, modes:[mode], format:'coop', pools:audioPools() } });
    let g=a.last('state').game;
    eq([g.phase, g.mode], [MP.ARMING, mode], mode+': ARMING, flaga trybu w stanie gry');
    eq(g.preview, TRACK.preview, mode+': zwykła zajawka (tempo liczy klient)'); eq(g.answerSlots, null, mode+': sloty tytuł+wykonawca');
    for(const c of [a,b]) await room.msg(c, { t:'action', action:{ type:'ready', armNonce:room.game.armNonce } });
    await room.msg(b, { t:'action', action:{ type:'propose', values:{ title:'Africa', artist:'Toto' } } });
    room.game.playAt=null;   // bez bonusu za szybkość → czysty mnożnik
    await room.msg(a, { t:'lock' });
    const r=a.last('state').game.reveal;
    eq(r.kind, 'music', mode+': odsłona jak muzyka'); ok(r.teamOk, mode+': trafienie');
    eq(r.gained, Math.round(100*mult), mode+': 100 × '+mult);
  }
});

/* ==================== Łamigłówki: track/tracks/display/partial ==================== */
const REBUS={ prompt:'🟣 🌧️\n🎵 tytuł · hit lat 80.', slots:[{key:'a',label:'tytuł'}], answers:{ a:['Purple Rain'] },
  display:'rebus', track:{ title:'Purple Rain', artist:'Prince' } };
const LADDER={ prompt:'Jedna litera różnicy:\n1) Radiohead 1992\n2) post-grunge\n3) Nirvana', partial:true,
  slots:[{key:'a',label:'1'},{key:'b',label:'2'},{key:'c',label:'3'}], answers:{ a:['Creep'], b:['Creed'], c:['Breed'] },
  tracks:[{ title:'Creep', artist:'Radiohead' }, null, { title:'Breed', artist:'Nirvana' }] };

await group('Łamigłówki: clampQuestion — track/tracks sanityzowane (stringi przycięte, ≤3), display tylko rebus, partial bool', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  const evil={ ...LADDER, prompt:'Q-evil', display:'<script>', partial:'tak',
    track:{ title:'  '+'t'.repeat(500)+' ', artist:'A', extra:'x' },
    tracks:[{ title:'X', artist:'Y' }, { title:5, artist:{} }, null, { title:'Z', artist:'W' }, { title:'Q', artist:'R' }] };
  await room.msg(a, { t:'start', config:CONFIG({ pools:{ q1:{ label:'Łamigłówki', kind:'quiz', questions:[REBUS, LADDER, evil] } } }) });
  const [qr, ql, qe]=room.pools.q1.questions;
  eq([qr.display, qr.track], ['rebus', { title:'Purple Rain', artist:'Prince' }], 'rebus: display + track przepuszczone');
  eq([ql.partial, ql.tracks], [true, LADDER.tracks], 'drabinka: partial + tracks (z null per slot)');
  ok(!('display' in qe) && !('partial' in qe), 'display spoza „rebus" / partial nie-bool → pominięte');
  eq(qe.track.title.length, 120, 'tytuł tracka przycięty do 120');
  ok(!('extra' in qe.track), 'obce pola tracka wycięte');
  eq(qe.tracks.length, 3, 'tracks ≤ 3 elementy');
  eq(qe.tracks[1], null, 'zły element → null');
});

await group('Łamigłówki: track TYLKO w REVEAL (nie w ARMING/PLAY) + promptStyle rebus + reveal.listen', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG({ pools:onePool(REBUS) }) });
  eq(a.last('state').game.promptStyle, 'rebus', 'ARMING: promptStyle = rebus (render, bez odpowiedzi)');
  await readyAll(room, a, b);
  eq(room.game.phase, MP.PLAY, 'PLAY');
  const pre=JSON.stringify(b.sent.filter(m=>m.t==='state'));
  ok(!/Prince|"listen"|"track":\{/.test(pre), 'utwór-rozwiązanie NIE wycieka w stanie przed REVEAL');
  ok(/🟣/.test(b.last('state').game.prompt), 'PLAY: rebus w prompt');
  ok(room.current.listen && room.current.listen.length===1, 'sekret w this.current.listen');
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ a:'purple rain' } } });
  await room.msg(a, { t:'lock' });
  const rv=b.last('state').game.reveal;
  eq(rv.listen, [{ title:'Purple Rain', artist:'Prince', label:'' }], 'REVEAL: reveal.listen = utwór do odsłuchu');
  eq(rv.promptStyle, 'rebus', 'REVEAL: promptStyle');
  ok(rv.teamOk, 'trafienie');
});

await group('Łamigłówki: partial — częściowe punkty drużyny na serwerze, listen per slot', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  await room.msg(a, { t:'start', config:CONFIG({ pools:onePool(LADDER) }) });
  await readyAll(room, a);
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ a:'Creep', b:'Greed', c:'Breed' } } });
  await room.msg(a, { t:'lock' });
  const rv=a.last('state').game.reveal;
  ok(!rv.teamOk, 'nie komplet');
  ok(rv.gained>=67 && rv.gained<=101, '2/3 słów → częściowe punkty (67 × szybkość ≤1.5): '+rv.gained);
  eq(rv.listen.map(x=>x.label), ['1','3'], 'listen: utwory slotów 1 i 3 (null pominięty)');
});
/* ==================== „Nowy mecz": szkic konfiguracji MP dla gości (event `draft`) ==================== */
await group('draft (autorytet): tylko od hosta, sanityzowany, w lobby; dochodzący dostaje ostatni; rate-limit; po starcie znika', async ()=>{
  const { room } = await makeRoom();
  const h=room.join('H','Host'), p=room.join('P','Pola');
  const drafts=(c)=>c.sent.filter(m=>m.t==='event' && m.event==='draft');
  await room.msg(p, { t:'event', event:'draft', payload:{ preset:'Podróbka', cats:[{k:'80s',l:'lata 80'}], modes:['music'], questions:5 } });
  eq(drafts(h).length+drafts(p).length, 0, 'szkic od gracza (nie hosta) odrzucony');
  await room.msg(h, { t:'event', event:'draft', payload:{ preset:'Hity', cats:[{k:'80s',l:'<b>lata 80</b>'},{k:'80s',l:'dup'}], modes:['music','hack','abcd'], questions:999, timer:-3, format:'evil', evil:'x', by:'P' } });
  const d=drafts(p).pop();
  ok(d && d.from==='H' && d.payload.from==='H' && d.payload.by==='H', 'szkic hosta rozesłany, nadawca z tokenu (by=H mimo by:P)');
  eq([d.payload.cats.length, d.payload.modes, d.payload.questions, d.payload.timer, d.payload.format, 'evil' in d.payload], [1, ['music','abcd'], 60, 0, 'coop', false], 'sanityzacja: duplikaty/nieznane tryby/capy/nieznane pola');
  const late=await room.connect('L','Late');
  await room.msg(late, { t:'hello' });
  ok(drafts(late).length===1 && drafts(late)[0].payload.preset==='Hity', 'dochodzący gość (hello) dostaje ostatni szkic');
  const n=drafts(p).length;
  for(let i=0;i<20;i++) await room.msg(h, { t:'event', event:'draft', payload:{ preset:'S'+i, cats:[], modes:['music'], questions:15 } });
  ok(drafts(p).length-n<=6, 'rate-limit szkicu (burst 6): '+(drafts(p).length-n));
  await room.msg(h, { t:'start', config:CONFIG() });
  ok(room.draft===null, 'start meczu czyści szkic');
  const m=drafts(p).length;
  await room.msg(h, { t:'event', event:'draft', payload:{ preset:'W grze', cats:[], modes:['music'], questions:15 } });
  eq(drafts(p).length, m, 'w trakcie meczu szkic ignorowany');
  const big={ preset:'x', cats:Array.from({length:200},(_,i)=>({k:'k'+i+'x'.repeat(50), l:'L'.repeat(60)})), modes:['music'], questions:15 };
  const { room:r2 } = await makeRoom(); const h2=r2.join('H','Host'), p2=r2.join('P','P');
  await r2.msg(h2, { t:'event', event:'draft', payload:big });
  const bd=drafts(p2).pop();
  ok(bd && bd.payload.cats.length===24 && bd.payload.more===176, 'duży szkic przycięty do 24 kategorii (+ more)');
});

await group('draft (relay): ROOM_EVENTS + tylko host relay, sanityzacja, kopertowy nadawca', async ()=>{
  const room=await makeRelay('DRFT');
  const h=await room.join('H','Host'), p=await room.join('P','Gracz');
  await room.msg(p, { t:'b', event:'draft', payload:{ preset:'Podróbka', cats:[], modes:['music'], questions:5 } });
  ok(!h.sent.some(m=>m.t==='b' && m.event==='draft'), 'szkic od gracza relay odrzucony');
  await room.msg(h, { t:'b', event:'draft', payload:{ preset:'Hity', cats:[{k:'80s',l:'lata 80'}], modes:['music','evil'], questions:30, salon:true } });
  const d=p.sent.filter(m=>m.t==='b' && m.event==='draft').pop();
  ok(d && d.from==='H' && d.payload.by==='H', 'szkic hosta relay rozesłany (from=H)');
  eq([d.payload.modes, d.payload.questions, d.payload.audioHostOnly], [['music'], 30, true], 'sanityzacja (nieznany tryb wycięty, salon ⇒ dźwięk u hosta)');
});

/* ==================== gust etap 3: „🎧 Gust stołu" — półki graczy, capability, pula od serwera ==================== */
const SHELF=(pre, n=10, artist='Art')=>Array.from({ length:n }, (_,i)=>({ title:pre+' '+i, artist:artist+' '+pre, year:String(1980+i) }));
function tableResolver(room){
  room.resolver={ track: async({ cat, seen })=>{ const s=(cat.songs||[]).find(x=>!seen.has(x.title)) || cat.songs[0]; seen.add(s.title);
    return { track:s.title, artist:s.artist, year:s.year||'', album:'', preview:'https://p/'+encodeURIComponent(s.title)+'.m4a', art:'', ...(s.from?{ from:s.from }:{}) }; },
    distractors: async()=>[] };
}
await group('gust3: presence niesie caps tableTaste + licznik półek obecnych graczy', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo'), c=room.join('C','Cy');
  let p=a.last('presence');
  ok(p.caps.includes('tableTaste'), 'capability tableTaste w presence');
  eq(p.shelves, [], 'na starcie brak półek');
  await room.msg(a, { t:'shelf', items:SHELF('a') });
  await room.msg(b, { t:'shelf', items:SHELF('b', 30) });
  p=c.last('presence');
  eq(p.shelves, [{ id:'A', n:10 }, { id:'B', n:20 }], 'półki od 2/3 graczy; max 20 utworów na gracza');
  ok(!JSON.stringify(p).includes('a 0'), 'presence bez tytułów — tylko liczniki');
  await room.msg(b, { t:'shelf', items:[] });
  eq(c.last('presence').shelves, [{ id:'A', n:10 }], 'pusta lista = wycofanie półki (gust ukryty)');
  await room.msg(c, { t:'shelf', items:[{ title:'<img src=x onerror=1>', artist:'' }, 'x', null, { title:'T'.repeat(999), artist:'Y', year:'1e9' }] });
  eq(room.shelves.get('C'), [{ title:'T'.repeat(200), artist:'Y' }], 'sanityzacja: śmieci odrzucone, tekst przycięty, zły rok wycięty');
  await room.drop(a);
  eq(c.last('presence').shelves.map(x=>x.id), ['C'], 'gracz wyszedł → jego półka nie liczy się (tylko obecni)');
  const st=await room.ctx.storage.get('shelves');
  ok(Array.isArray(st) && st.length>=1, 'półki w storage pokoju (przeżyją ewikcję DO; nie D1)');
});
await group('gust3: start z „Gust stołu" — pula od serwera z półek obecnych, odsłona „z półki: <ksywa>"', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'), b=room.join('B','Bo'); tableResolver(room);
  await room.msg(a, { t:'shelf', items:SHELF('a', 6) });
  await room.msg(b, { t:'shelf', items:[...SHELF('b', 5), { title:'a 0', artist:'Art a', year:'1980' }] });
  // host podsyła pod kluczem stołu śmieci — serwer je ignoruje i składa pulę sam
  await room.msg(a, { t:'start', config:{ questions:5, modes:['music'], format:'coop', pools:{ 'gust-stolu':{ label:'🎧 Gust stołu', kind:'playlist', songs:[{ title:'Hack', artist:'Evil' }] } } } });
  const pool=room.pools['gust-stolu'];
  ok(pool && pool.songs.length===11, 'pula = 6 + 5 unikalnych utworów (duplikat połączony): '+(pool&&pool.songs.length));
  ok(!pool.songs.some(s=>s.title==='Hack'), 'utwory hosta pod kluczem stołu zignorowane');
  eq(pool.songs.find(s=>s.title==='a 0').from, 'Ala, Bo', 'wspólny utwór: „z półki: Ala, Bo"');
  eq(pool.songs.slice(0,4).map(s=>s.from), ['Ala, Bo','Bo','Ala','Bo'], 'sprawiedliwie: po kolei od graczy (a0 — wspólny)');
  eq(room.game.catLabel, '🎧 Gust stołu', 'etykieta kategorii w stanie');
  const g=a.last('state').game;
  ok(!JSON.stringify(g).includes('"from"'), 'ARMING: bez „z półki" (nie zdradza odpowiedzi)');
  for(const c of [a,b]) await room.msg(c, { t:'action', action:{ type:'ready', armNonce:room.game.armNonce } });
  ok(!JSON.stringify(b.last('state').game).includes('"from"'), 'PLAY: bez „z półki"');
  await room.msg(a, { t:'lock' });
  const r=b.last('state').game.reveal;
  ok(r && /^(Ala|Bo|Ala, Bo)$/.test(r.from), 'odsłona: reveal.from = ksywa właściciela półki: '+(r&&r.from));
});
await group('gust3: „Gust stołu" za mało utworów (< 8) → kategoria wycięta; sama → brak meczu', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'); tableResolver(room);
  await room.msg(a, { t:'shelf', items:SHELF('a', 5) });
  await room.msg(a, { t:'start', config:{ questions:5, modes:['music'], format:'coop', pools:{ 'gust-stolu':{ label:'x', kind:'playlist' } } } });
  eq(room.game, null, 'tylko stół z 5 utworami → start zignorowany');
  await room.msg(a, { t:'start', config:{ questions:5, modes:['music','quiz'], format:'coop', pools:{ 'gust-stolu':{ label:'x', kind:'playlist' }, ...quizPools() } } });
  ok(room.game && !room.pools['gust-stolu'] && room.game.catKey==='q1', 'stół wycięty, mecz z pozostałych kategorii');
});
/* ==================== FIX „host nie widział moich odpowiedzi" (gość z telefonu) ==================== */
// propozycja gościa → stan u HOSTA (coop: pełna treść; Solo/Drużyny: bez treści w PLAY, `answered` + odsłona z odpowiedzią)
async function guestScenario(format, { late=false }={}){
  const { room } = await makeRoom();
  const h=await room.connect('H','Host');
  // Drużyny/późny: A = host + Pola, B = Ola → gość trafia do najmniejszej (B), czyli do RYWALI hosta
  const extra = (format==='teams' && late) ? [await room.connect('P','Pola'), await room.connect('O','Ola')] : [];
  let g=late ? null : await room.connect('G','Gosc');
  const assignments = format==='teams' ? (late ? [{ id:'t0', name:'A', members:['H','P'] }, { id:'t1', name:'B', members:['O'] }]
    : [{ id:'t0', name:'A', members:['H'] }, { id:'t1', name:'B', members:['G'] }]) : undefined;
  await room.msg(h, { t:'start', config:CONFIG({ format, assignments }) });
  if(late) g=await room.connect('G','Gosc');              // gość wchodzi w trakcie (ARMING)
  await readyAll(room, h, g, ...extra);
  eq(room.game.phase, MP.PLAY, format+(late?' (późny)':'')+': PLAY');
  await room.msg(g, { t:'action', action:{ type:'propose', values:{ a:'typ-goscia' } } });
  return { room, h, g };
}
await group('FIX odpowiedzi gościa: coop — typ gościa w stanie hosta i w odsłonie', async ()=>{
  const { room, h } = await guestScenario('coop');
  const vh=h.last('state').game;
  ok(vh.byTeam.all.proposals.some(p=>p.by==='G' && p.values.a==='typ-goscia'), 'host widzi treść typu gościa (coop)');
  await room.msg(h, { t:'lock' });
  eq(h.last('state').game.reveal.locked, { a:'typ-goscia' }, 'odsłona: odpowiedź drużyny = typ gościa');
});
for(const format of ['solo','teams']){
  for(const late of [false, true]){
    await group(`FIX odpowiedzi gościa: ${format}${late?' — gość dołącza W TRAKCIE':''} — typ przyjęty, host widzi „odpowiedział", odsłona z treścią`, async ()=>{
      const { room, h } = await guestScenario(format, { late });
      const gt=teamOfId(room.game, 'G');
      ok(!!gt, format+': gość ma drużynę (dawniej Drużyny: widz do końca meczu / Solo: do następnego pytania)');
      ok(gt && room.game.byTeam[gt].proposals.some(p=>p.by==='G'), format+': reducer przyjął typ gościa');
      const vh=h.last('state').game;
      ok(gt && vh.byTeam[gt].proposals.length===0, format+': host w PLAY NIE widzi treści (anty-ściąganie bez zmian)');
      ok(gt && Array.isArray(vh.byTeam[gt].answered) && vh.byTeam[gt].answered.includes('G'), format+': host widzi, KTO odpowiedział (answered)');
      await room.msg(h, { t:'lock' });
      const r=h.last('state').game.reveal;
      eq(r && r.byTeam[gt] && r.byTeam[gt].locked, { a:'typ-goscia' }, format+': odsłona u hosta zawiera odpowiedź gościa');
    });
  }
}
await group('FIX odpowiedzi gościa: Solo — wejście już w PLAY → własna drużyna od razu', async ()=>{
  const { room } = await makeRoom();
  const h=await room.connect('H','Host');
  await room.msg(h, { t:'start', config:CONFIG({ format:'solo' }) });
  await readyAll(room, h);
  eq(room.game.phase, MP.PLAY, 'PLAY');
  const g=await room.connect('G','Gosc');
  ok(room.game.teams.some(t=>t.id==='G' && t.members.includes('G')), 'gość w PLAY dostał drużynę od razu');
  eq(g.last('state').game.teams.length, 2, 'gość dostaje stan z nowym składem');
  await room.msg(g, { t:'action', action:{ type:'propose', values:{ a:'x' } } });
  ok(room.game.byTeam.G.proposals.length===1, 'typ gościa przyjęty w tym samym pytaniu');
  eq(room.game.scores.G, 0, 'wynik gościa od 0');
  await room.msg(g, { t:'track', name:'Gosia' });
  eq(room.game.teams.find(t=>t.id==='G').name, 'Gosia', 'ksywa z track (po onConnect) → nazwa drużyny Solo (nie „gracz")');
});

/* ==================== Przegląd MP 2026-10 — etap A ==================== */
const quiz2=()=>({ ...quizPools(), q2:{ label:'Quiz 2', kind:'quiz', questions:Array.from({ length:30 }, (_,i)=>({ prompt:'R'+i, slots:[{key:'a',label:'odp'}], answers:{a:['y'+i]} })) } });
await group('P0-1 + salon: wyjście TV — host ZOSTAJE przy TV (gracz nigdy nie jest hostem), gracze grają dalej', async ()=>{
  const { room } = await makeRoom();
  const tv=await room.connect('TV','Telewizor'), p1=await room.connect('P1','Ola'), p2=await room.connect('P2','Kuba');
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true, format:'solo' }) });
  eq(room.game.tvId, 'TV', 'tvId = TV (kto wystartował salon)');
  await readyAll(room, p1, p2);
  eq(room.game.phase, MP.PLAY, 'PLAY');
  await room.msg(p2, { t:'action', action:{ type:'propose', values:{ a:'typ-kuby' } } });
  await room.drop(tv);                                    // TV wychodzi → host ZOSTAJE (salon: gracz nigdy nie jest hostem)
  eq(room.hostId, 'TV', 'host zostaje przy nieobecnej TV — P1 NIE przejmuje');
  const p3=await room.connect('P3','Ewa'); await room.drop(p3);
  eq(room.hostId, 'TV', 'dołączający gracz też nie przejmuje hosta salonu');
  eq(room.game.tvId, 'TV', 'tvId zostaje przy TV (rola TV nie przechodzi)');
  const v1=room.viewFor('P1');
  eq(v1.byTeam.P2.proposals.length, 0, 'P1 NIE widzi treści typów rywala');
  ok(teamOfId(room.game,'P1')==='P1', 'P1 dalej ma swoją drużynę');
  await room.msg(p1, { t:'action', action:{ type:'propose', values:{ a:'typ-oli' } } });
  ok(room.game.byTeam.P1.proposals.some(p=>p.by==='P1'), 'P1 nadal odpowiada (nie jest TV)');
  ok(room.playersOf().some(m=>m.id==='P1'), 'P1 na liście graczy (gotowość/drużyny)');
  // TV wraca → odzyskuje hosta (starter) i pełny widok, ale nie trafia do drużyn
  await room.connect('TV','Telewizor');
  eq(room.hostId, 'TV', 'TV po powrocie odzyskuje hosta');
  eq(room.viewFor('TV').byTeam.P2.proposals.length, 1, 'TV widzi stan wszystkich (jak dotąd)');
  ok(!teamOfId(room.game,'TV'), 'TV poza drużynami');
});
await group('salon coop bez TV: gracz może zatwierdzić (tvAway), ale NIE jest hostem; większość wygrywa', async ()=>{
  const { room } = await makeRoom();
  const tv=await room.connect('TV','Telewizor'), p1=await room.connect('P1','Ola'), p2=await room.connect('P2','Kuba'), p3=await room.connect('P3','Ala');
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true }) });
  await readyAll(room, p1, p2, p3);
  await room.drop(tv);
  eq(room.hostId, 'TV', 'host = nieobecna TV (nie P1)');
  await room.msg(p1, { t:'action', action:{ type:'propose', values:{ a:'zle' } } });
  await room.msg(p2, { t:'action', action:{ type:'propose', values:{ a:'dobrze' } } });
  await room.msg(p3, { t:'action', action:{ type:'vote', slot:'a', value:'dobrze' } });
  await room.msg(p1, { t:'lock' });
  eq(room.game.reveal.locked.a, 'dobrze', 'odpowiedź = większość (2:1), nie głos nowego hosta');
});
await group('P0-9: salon bez graczy (TV sam w pokoju) — start odrzucony, host dostaje stan', async ()=>{
  const { room } = await makeRoom();
  const tv=await room.connect('TV','Telewizor');
  const n0=tv.sent.filter(m=>m.t==='state').length;
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true }) });
  ok(!room.game || room.game.phase==null, 'mecz NIE wystartował');
  ok(tv.sent.filter(m=>m.t==='state').length>n0, 'host dostał stan (koniec optymistycznego „ładowania")');
  await room.connect('P1','Ola');
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true }) });
  ok(room.game && room.game.phase===MP.ARMING, 'z 1 graczem salon startuje');
});
await group('P1-2: czas na odpowiedź PO słuchaniu — endsAt = go + LEAD + słuchanie + timer; serverNow w ramce stanu', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG({ timer:30 }) });
  ok(Number.isFinite(a.last('state').serverNow), 'ramka stanu ma serverNow (zegar serwera)');
  await readyAll(room, a, b);
  const g=room.game;
  eq(g.listenEndsAt - g.playAt, 900+15000, 'listenEndsAt = playAt + LEAD 900 + słuchanie 15 s');
  eq(g.endsAt - g.listenEndsAt, 30000, 'endsAt = koniec słuchania + 30 s (dawniej go+30 s)');
  ok(Math.abs(a.last('state').serverNow - Date.now())<1000, 'serverNow ≈ teraz');
  await room.msg(a, { t:'lock' });
  eq([room.game.endsAt, room.game.listenEndsAt], [null, null], 'po lock terminy wyczyszczone');
});
await group('P1-3: auto-lock, gdy wszyscy obecni dali typ albo pas (karencja), cofnięcie anuluje', async ()=>{
  const { room } = await makeRoom();
  room.allDoneGraceMs=30;
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG({ format:'solo' }) });
  await readyAll(room, a, b);
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ a:'x' } } });
  eq(room.game.allDoneAt, null, 'B jeszcze myśli → brak auto-zamknięcia');
  await room.msg(b, { t:'action', action:{ type:'pass' } });
  ok(room.game.allDoneAt>0, 'A typ + B pas → allDoneAt („Wszyscy gotowi!")');
  ok(b.last('state').game.allDoneAt>0, 'klienci dostają allDoneAt');
  await room.msg(b, { t:'action', action:{ type:'pass' } });   // B cofa pas w karencji
  eq(room.game.allDoneAt, null, 'cofnięcie pasu → karencja zdjęta');
  await sleep(60);
  eq(room.game.phase, MP.PLAY, 'bez kompletu nie zamyka');
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ a:'y' } } });
  await sleep(80);
  eq(room.game.phase, MP.REVEAL, 'komplet → po karencji REVEAL (bez hosta i bez timera)');
});
await group('P1-3: wyjście ostatniego „myślącego" domyka komplet; dojście nowego gracza zdejmuje karencję', async ()=>{
  const { room } = await makeRoom();
  room.allDoneGraceMs=40;
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG({ format:'coop' }) });
  await readyAll(room, a, b);
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ a:'x' } } });
  await room.drop(b);
  ok(room.game.allDoneAt>0, 'B wyszedł → komplet obecnych');
  await room.connect('C','Cela');
  eq(room.game.allDoneAt, null, 'C dochodzi (niegotowy) → karencja zdjęta');
  await sleep(70);
  eq(room.game.phase, MP.PLAY, 'czekamy na C');
});
await group('P1-11: ksywy graczy w stanie gry (game.names) — po wyjściu i powrocie bez ksywy', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG({ format:'solo' }) });
  eq(room.game.names, { A:'Ala', B:'Bo' }, 'names z obecnych przy starcie');
  await room.drop(b);
  eq(a.last('state').game.names.B, 'Bo', 'po wyjściu B jego ksywa nadal w stanie');
  await room.connect('C','');                              // dołącza bez ksywy (onConnect przed track)
  await room.msg(room.getConnections().find(c=>c.state.id==='C'), { t:'track', name:'Cela' });
  eq(room.game.names.C, 'Cela', 'ksywa z track → names');
  eq(room.game.teams.find(t=>t.id==='C').name, 'Cela', 'solo: nazwa drużyny z ksywy');
});
await group('P1-7: krótki mecz (5 pytań) — 5 slotów z różnych kategorii, koniec po 5 pytaniach', async ()=>{
  const { room } = await makeRoom();
  room.allDoneGraceMs=1e9;
  const a=await room.connect('A','Ala');
  await room.msg(a, { t:'start', config:CONFIG({ questions:5, rounds:1, pools:quiz2() }) });
  eq([room.game.slots.length, room.game.qpc], [5, 1], '5 slotów, qpc 1');
  eq(new Set(room.game.slots.map(x=>x.cat)).size, 2, 'obie kategorie w meczu');
  let n=0, guard=0;
  while(room.game.phase!==MP.DONE && guard++<50){
    const g=room.game;
    if(g.phase===MP.ARMING) await readyAll(room, a);
    else if(g.phase===MP.PLAY){ n++; await room.msg(a, { t:'lock' }); }
    else if(g.phase===MP.REVEAL) await room.msg(a, { t:'next' });
    else break;
  }
  eq(n, 5, 'zagrano dokładnie 5 pytań');
});
/* ===== etap B (P1-8): ABCD w MP = kafle — tap = `propose` {slot: litera}; odpowiedź drużyny = najczęstsza litera.
 * Serwer bez zmian protokołu (zwykły propose → reducer: jedna odpowiedź na gracza + auto-głos); test pilnuje kontraktu. */
const mcPools=()=>({ q1:{ label:'Quiz', kind:'quiz', questions:[{ prompt:'Ile to 1+1?\nA) 1\nB) 2\nC) 3\nD) 4', slots:[{key:'a',label:'litera lub odpowiedź'}], answers:{a:['B','2']} }] } });
await group('P1-8: ABCD (kafle) — najczęstsza litera drużyny wygrywa; treść z opcjami jawna dopiero w PLAY', async ()=>{
  const { room } = await makeRoom();
  room.allDoneGraceMs=20;
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo'), c=await room.connect('C','Cela');
  await room.msg(a, { t:'start', config:CONFIG({ format:'coop', pools:mcPools() }) });
  eq(room.game.phase, MP.ARMING, 'ARMING');
  eq(b.last('state').game.prompt, '', 'ARMING: opcje ukryte (kafle dopiero w PLAY)');
  await readyAll(room, a, b, c);
  eq(room.game.phase, MP.PLAY, 'PLAY');
  const prompt=b.last('state').game.prompt;
  ok(/\nA\) /.test(prompt) && /\nD\) /.test(prompt), 'PLAY: treść z opcjami A–D (źródło kafli u klienta)');
  const ok_=room.current.mc.correct, wrong=['A','B','C','D'].find(l=>l!==ok_);
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ a:wrong } } });
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ a:ok_ } } });
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ a:ok_ } } });   // A zmienia zdanie (tap w inny kafel)
  eq(room.game.byTeam.all.proposals.filter(p=>p.by==='A').length, 1, 'jedna odpowiedź na gracza (zmiana zastępuje)');
  await room.msg(c, { t:'action', action:{ type:'propose', values:{ a:wrong } } });
  await sleep(50);   // komplet tapów → auto-zamknięcie (P1-3)
  eq(room.game.phase, MP.REVEAL, 'wszyscy tapnęli → odsłona');
  eq(room.game.reveal.locked.a, ok_, 'odpowiedź drużyny = najczęstsza litera (2:1)');
  ok(room.game.reveal.teamOk, 'najczęstsza litera poprawna → trafienie');
});
await group('P1-8: ABCD Solo — tap rywala niewidoczny w PLAY (tylko „answered")', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  await room.msg(a, { t:'start', config:CONFIG({ format:'solo', pools:mcPools() }) });
  await readyAll(room, a, b);
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ a:'C' } } });
  const vb=b.last('state').game.byTeam.A;
  eq([vb.proposals.length, Object.keys(vb.votes).length, vb.answered], [0, 0, ['A']], 'B widzi tylko, że A odpowiedział');
});
/* ==================== MP okładka (autorytet): album od serwera, etapy z timera DO, URL etapu, mnożnik z czasu propozycji ==================== */
const COVER_ART='https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/x.jpg/600x600bb.jpg';
const COVER={ artist:'Toto', artistAlt:'Toto', album:'Toto IV', albumRaw:'Toto IV (Remastered)', year:'1982', art:COVER_ART, tier:0 };
function stubCover(room, cover=COVER){
  stubResolver(room);
  room.resolver.cover=async({ seen })=>{ if(cover && cover.error) return cover; if(seen) seen.add('album:toto iv'); return { ...cover }; };
  room.coverStepMs=150; room.stageLeadMs=30;   // krótki harmonogram w teście (prod: 6 s, LEAD = MP_INTRO_MS)
}
const until=async(fn, ms=1500)=>{ const t0=Date.now(); while(!fn() && Date.now()-t0<ms) await sleep(5); return fn(); };
await group('MP okładka: runda cover → ARMING bez audio → PLAY etap 0 (16×16) → podbicia etapów (do 64×64) → mnożnik → REVEAL z pełną okładką', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  stubCover(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['cover'], format:'coop', pools:audioPools() } });
  let g=b.last('state').game;
  eq([g.phase, g.mode], [MP.ARMING, 'cover'], 'ARMING, tryb okładka');
  eq(g.preview, '', 'bez zajawki — klient zgłasza gotowość od razu');
  eq((g.answerSlots||[]).map(s=>s.key), ['artist','album'], 'sloty: wykonawca + album');
  ok(!g.coverArt, 'ARMING: bez obrazu');
  eq([room.current.artist, room.current.album, room.current.year, room.current.art], ['Toto','Toto IV','1982',COVER_ART], 'sekret w this.current (pełna okładka 600×600)');
  ok(!JSON.stringify(g).includes('Toto') && !JSON.stringify(g).includes('600x600'), 'stan ARMING bez wykonawcy/albumu/pełnej okładki');
  await readyAll(room, a, b);
  g=b.last('state').game;
  eq(g.phase, MP.PLAY, 'PLAY');
  eq([g.stage, g.coverStage], [0, 0], 'etap 0');
  ok(/\/16x16bb\.jpg$/.test(g.coverArt), 'etap 0: obraz 16×16 — '+g.coverArt);
  ok(!JSON.stringify(g).includes('600x600'), 'PLAY etap 0: pełny URL nie trafia do stanu');
  eq(g.stageStarts.map(t=>t-g.playAt), [30,180,330], 'rzeczywiste starty etapów w stanie (LEAD 30 + krok 150 ms w teście)');
  eq([g.stageAt, g.stageNextAt], [g.playAt+30, g.playAt+180], 'stageAt / stageNextAt');
  eq(g.listenEndsAt-g.playAt, 900+300, 'okno „patrz" do ostatniego etapu → czas na odpowiedź po nim');
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ artist:'toto', album:'Toto IV' }, at:1 } });
  const p=room.game.byTeam.all.proposals[0];
  ok(p.at>=g.playAt && p.at<=Date.now(), 'czas propozycji z zegara serwera (klientowe at:1 zignorowane)');
  ok(await until(()=>room.game.stage>=1), 'timer DO podbił etap');
  const g1=b.last('state').game;
  ok(g1.stage>=1 && /\/(24x24|40x40)bb\.jpg$/.test(g1.coverArt), 'broadcast etapu z nowym URL — '+g1.coverArt);
  ok(await until(()=>room.game.stage===2), 'etap 2 (64×64)');
  const g2=b.last('state').game;
  ok(/\/40x40bb\.jpg$/.test(g2.coverArt) && !JSON.stringify(g2).includes('600x600'), 'ostatni etap 40×40 — pełny URL dalej ukryty');
  eq(room.game.stageNextAt, null, 'po ostatnim etapie brak kolejnego terminu');
  await sleep(30);
  ok(!room._stageTimer, 'timer etapów zatrzymany po ostatnim');
  ok(!JSON.stringify(b.last('state').game).includes('600x600'), 'PLAY po ostatnim etapie: nadal bez pełnej okładki');
  await room.msg(a, { t:'lock' });
  const st=b.last('state').game, r=st.reveal;
  eq(st.phase, MP.REVEAL, 'REVEAL');
  eq(st.coverArt, COVER_ART, 'REVEAL: pełna okładka w stanie — dopiero teraz');
  eq([r.kind, r.artist, r.album, r.year, r.art], ['cover','Toto','Toto IV','1982',COVER_ART], 'odsłona: pełna okładka + wykonawca/album/rok');
  eq([r.teamOk, r.stageEval.stage, r.stageEval.blocks, r.stageEval.mult, r.okBySlot.album], [true, 0, 16, 2, true], 'mnożnik etapu, na którym padła odpowiedź (16×16 → ×2) + album');
  eq(r.gained, 240, '(wykonawca 100 + album 20) × 2 — bez bonusu za szybkość');
  eq(room.game.results[0].track, 'Toto IV', 'wynik do ligi: album');
});
await group('MP okładka: „wyraźniej" (dowolny gracz) — następny etap od razu, nonce/etap, rate-limit, okno odpowiedzi wcześniej', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo'), c=await room.connect('C','Cy');
  stubCover(room); room.coverStepMs=5000;
  await room.msg(a, { t:'start', config:{ questions:5, modes:['cover'], format:'coop', timer:30, pools:audioPools() } });
  await readyAll(room, a, b, c);
  await sleep(40);   // etap 0 ruszył (LEAD 30 ms)
  const g0=JSON.parse(JSON.stringify(room.game));
  await room.msg(c, { t:'more', playNonce:g0.playNonce+1, stage:0 });
  eq(room.game.stage, 0, 'zły nonce → bez zmian');
  await room.msg(c, { t:'more', playNonce:g0.playNonce, stage:1 });
  eq(room.game.stage, 0, 'nie ten etap → bez zmian');
  await room.msg(b, { t:'more', playNonce:g0.playNonce, stage:0 });   // gość (nie host)
  const g1=b.last('state').game;
  eq([g1.stage, g1.coverStage], [1, 1], 'gracz (nie host) → etap 1 od razu');
  ok(/\/24x24bb\.jpg$/.test(g1.coverArt), 'od razu obraz 24×24');
  ok(Math.abs(g1.stageStarts[1]-Date.now())<50 && g1.stageStarts[0]===g0.stageStarts[0], 'start etapu 1 = teraz; miniony bez zmian');
  const shift=g0.stageStarts[1]-g1.stageStarts[1];
  ok(shift>4000, 'przesunięcie ~ krok etapu — '+shift);
  eq(g1.stageStarts[2]-g1.stageStarts[1], g0.stageStarts[2]-g0.stageStarts[1], 'odstęp do kolejnego etapu zachowany');
  eq([g0.listenEndsAt-g1.listenEndsAt, g0.endsAt-g1.endsAt], [shift, shift], 'okno „patrz" i czas na odpowiedź też wcześniej');
  await room.msg(a, { t:'more', playNonce:g0.playNonce, stage:0 });   // spóźniony duplikat (A kliknął na etapie 0)
  eq(room.game.stage, 1, 'duplikat „wyraźniej" dla etapu 0 → nie przeskakuje dwóch etapów');
  await room.msg(a, { t:'more', playNonce:g0.playNonce, stage:1 });
  eq(room.game.stage, 2, 'etap 2 (64×64)');
  await room.msg(b, { t:'more', playNonce:g0.playNonce, stage:2 });
  eq(room.game.stage, 2, 'ostatni etap — dalej nie ma (pełna tylko w odsłonie)');
  ok(!b.last('state').game.coverArt.includes('600x600'), 'nadal bez pełnej okładki');
  // rate-limit (bucket 'more': burst 2) — flood nie przesuwa harmonogramu w nieskończoność
  const d=await room.connect('D','Dee'); let sent=0;
  for(let i=0;i<10;i++) if(room.allowRate(d, 'more')) sent++;
  ok(sent<=2, 'rate-limit „more": burst ≤ 2 — '+sent);
  room.clearAutoLock(); room.clearStageTimer();
});
await group('MP okładka: wszyscy odpowiedzieli → auto-lock jak dziś; timer etapów zatrzymany', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  stubCover(room); room.coverStepMs=5000; room.allDoneGraceMs=20;
  await room.msg(a, { t:'start', config:{ questions:5, modes:['cover'], format:'solo', pools:audioPools() } });
  await readyAll(room, a, b);
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ artist:'Toto' } } });
  await room.msg(b, { t:'action', action:{ type:'pass' } });
  ok(await until(()=>room.game.phase===MP.REVEAL, 500), 'komplet → odsłona po karencji');
  ok(!room._stageTimer, 'timer etapów wyczyszczony przy lock');
  eq([room.game.reveal.byTeam.A.stageEval.mult, room.game.reveal.byTeam.A.gained], [2, 200], 'Solo: odpowiedź na etapie 0 → ×2');
  eq(room.game.coverArt, COVER_ART, 'REVEAL: pełna okładka w stanie');
});
await group('MP okładka: brak albumu / nieznany CDN okładki → pytanie jak muzyka; wznowienie timera po evikcji', async ()=>{
  for(const [cov, why] of [[{ error:true, reason:'empty' }, 'brak albumu'], [{ ...COVER, art:'https://example.com/x/600x600bb.jpg' }, 'okładka spoza znanych CDN (bez wersji etapów)']]){
    const { room } = await makeRoom();
    const a=room.join('A','Ala'); stubCover(room, cov);
    await room.msg(a, { t:'start', config:{ questions:5, modes:['cover'], format:'coop', pools:audioPools() } });
    eq([room.game.mode, room.game.answerSlots, room.game.preview], ['music', null, TRACK.preview], why+' → muzyka (tytuł + wykonawca, zajawka)');
  }
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'); stubCover(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['cover'], format:'coop', pools:audioPools() } });
  await readyAll(room, a);
  room.clearStageTimer();   // „evikcja" — timer ginie
  let init=null;
  const ctx={ storage:room.ctx.storage, blockConcurrencyWhile:(fn)=>{ init=fn(); return init; } };
  const r2=new GameAuthority(ctx, { TOKEN_SECRET:'x' }); await init;
  const conns=[]; r2.getConnections=()=>conns; r2.broadcast=()=>{};
  ok(!!r2._stageTimer, 'konstruktor wznawia timer etapów (stageNextAt w stanie)');
  ok(await until(()=>r2.game.stage>=1), 'wznowiony timer podbija etap (wg stageStarts ze stanu)');
  r2.clearStageTimer(); room.clearAutoLock(); r2.clearAutoLock();
});
/* ==================== MP intro (autorytet): etapy 1-2-4-8-16 s z timera DO, „+ więcej", introMult z czasu propozycji ==================== */
function stubIntro(room){
  stubResolver(room);
  room.introGapMs=40; room.introUnitMs=20; room.stageLeadMs=30;   // etapy 20/40/80/160/320 ms + przerwa 40 ms (prod: s + 3 s)
}
await group('MP intro: presence ogłasza intro; ARMING buforuje zajawkę; PLAY etap 0 = 1 s; podbicia; mnożnik etapu; REVEAL', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  ok(a.last('presence').modes.includes('intro'), 'presence.modes: intro (MP pod autorytetem)');
  stubIntro(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['intro'], format:'coop', pools:audioPools() } });
  let g=b.last('state').game;
  eq([g.phase, g.mode, g.preview, g.answerSlots], [MP.ARMING, 'intro', TRACK.preview, null], 'ARMING: zajawka do buforowania (pełny plik), sloty tytuł + wykonawca');
  eq(g.stageStarts, null, 'ARMING: bez harmonogramu');
  await readyAll(room, a, b);
  g=b.last('state').game;
  eq([g.phase, g.stage, g.stageSecs], [MP.PLAY, 0, 1], 'PLAY: etap 0 — klient gra [0, 1 s]');
  eq(g.stageStarts.map(t=>t-g.playAt), [30, 90, 170, 290, 490], 'starty etapów: LEAD + (etap + przerwa) — wspólne dla wszystkich');
  eq(g.stageAt, g.stageStarts[0], 'stageAt = wspólny start odsłuchu (zegar serwera; klient koryguje offsetem)');
  eq(g.listenEndsAt-g.playAt, 900+460+320, 'okno „słuchaj" = do końca ostatniego etapu (16 s)');
  ok(await until(()=>room.game.stage>=1), 'timer DO podbił etap');
  eq(b.last('state').game.stageSecs, [1,2,4,8,16][room.game.stage], 'stageSecs = długość odsłuchu etapu');
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ title:'Africa', artist:'Toto' } } });
  const stageAtProposal=stageIndexAt(room.game.stageStarts, room.game.byTeam.all.proposals[0].at);   // z rzeczywistych startów (bez wyścigu z timerem)
  ok(await until(()=>room.game.stage===4, 2000), 'ostatni etap (16 s)');
  eq(room.game.stageNextAt, null, 'po ostatnim — bez terminu');
  await room.msg(a, { t:'lock' });
  const r=b.last('state').game.reveal;
  eq([r.kind, r.teamOk, r.stageEval.stage, r.stageEval.secs], ['music', true, stageAtProposal, [1,2,4,8,16][stageAtProposal]], 'odsłona: etap, na którym padła odpowiedź (nie zatwierdzenia)');
  eq(r.stageEval.mult, [2,1.6,1.3,1.1,1][stageAtProposal], 'introMult etapu propozycji');
  eq(r.gained, Math.round(100*r.stageEval.mult), 'punkty: (50 + 50) × mnożnik etapu, bez bonusu za szybkość');
  ok(!room._stageTimer, 'timer etapów zatrzymany');
});
await group('MP intro: „+ więcej" — dowolny gracz, etap od razu, wyższy mnożnik dla szybkiego typu przed prośbą', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  stubIntro(room); room.introUnitMs=1000; room.introGapMs=3000;   // pełny harmonogram (bez czekania — „+ więcej")
  await room.msg(a, { t:'start', config:{ questions:5, modes:['intro'], format:'solo', pools:audioPools() } });
  await readyAll(room, a, b);
  await sleep(40);
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ title:'Africa', artist:'Toto' } } });   // A na etapie 0
  await sleep(5);   // prośba później niż typ A (ten sam ms = już nowy etap)
  const n=room.game.playNonce;
  await room.msg(b, { t:'more', playNonce:n, stage:0 });
  eq([room.game.stage, room.game.stageSecs], [1, 2], 'gracz B → etap 1 (2 s) od razu');
  await room.msg(b, { t:'more', playNonce:n, stage:1 });
  eq(room.game.stage, 2, 'kolejna prośba (limit burst 2) → etap 2 (4 s)');
  await sleep(5);
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ title:'Africa', artist:'Toto' } } });   // B na etapie 2
  await room.msg(a, { t:'lock' });
  const r=room.game.reveal;
  eq([r.byTeam.A.stageEval.mult, r.byTeam.B.stageEval.mult, r.byTeam.A.gained, r.byTeam.B.gained], [2, 1.3, 200, 130], 'A (1 s) ×2.0, B (po „+ więcej", 4 s) ×1.3');
  await room.msg(b, { t:'more', playNonce:n, stage:2 });
  eq(room.game.phase, MP.REVEAL, '„+ więcej" poza PLAY ignorowane');
});
/* ==================== MP składanka / fortepian-gitara / oś czasu (autorytet) ==================== */
await group('presence: „od tyłu krótko" i obroty nadal ogłaszane (regresja)', async ()=>{
  const { room } = await makeRoom();
  const pr=room.join('A','Ala').last('presence');
  ok(['revsnip','slowmo','fastmo'].every(m=>pr.modes.includes(m)), 'presence.modes: revsnip + slowmo + fastmo');
});
const MEDLEY={ artist:'Toto', artistAlt:'TOTO', clips:['Africa','Rosanna','Hold the Line','Pamela'].map((t,i)=>({ track:t, artist:'Toto', year:'198'+i, album:'', preview:'https://p/m'+i+'.m4a', art:'https://a/'+i+'.jpg' })) };
await group('MP składanka: serwer rozwiązuje 4 utwory, ARMING z 4 zajawkami + startami od serwera, sekret = wykonawca, REVEAL z utworami', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  stubResolver(room); room.resolver.medley=async()=>JSON.parse(JSON.stringify(MEDLEY));
  await room.msg(a, { t:'start', config:{ questions:5, modes:['medley'], format:'coop', pools:audioPools() } });
  let g=b.last('state').game;
  eq([g.phase, g.mode, (g.answerSlots||[]).map(s=>s.key)], [MP.ARMING, 'medley', ['artist']], 'ARMING, slot: wykonawca');
  eq(g.medley.map(c=>c.preview), MEDLEY.clips.map(c=>c.preview), '4 zajawki do buforowania (gotowość dopiero po wszystkich)');
  ok(g.medley.every(c=>c.start>=8 && c.start<=20), 'starty wycinków od serwera (8–20 s) — równo u wszystkich');
  eq(g.preview, MEDLEY.clips[0].preview, 'preview = 1. zajawka (zgodność: gałka/odtwarzacz)');
  ok(!JSON.stringify(g).includes('Toto') && !JSON.stringify(g).includes('Africa'), 'w stanie bez wykonawcy i tytułów (SEKRET)');
  await readyAll(room, a, b);
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ artist:'toto' } } });
  await room.msg(a, { t:'lock' });
  const r=b.last('state').game.reveal;
  eq([r.kind, r.teamOk, r.artist], ['medley', true, 'Toto'], 'odsłona składanki: trafiony wykonawca');
  eq(r.clips.map(c=>c.track), ['Africa','Rosanna','Hold the Line','Pamela'], 'zagrane utwory w odsłonie');
  ok(r.gained>=100, 'punkty: wykonawca 100 + szybkość');
  eq(room.game.medley, MEDLEY.clips.map(c=>({ preview:c.preview, start:room.game.medley[MEDLEY.clips.indexOf(c)].start })), 'zajawki zostają do odsłony');
});
await group('MP składanka: < 3 utworów / błąd → pytanie jak muzyka; następna runda bez game.medley', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'); stubResolver(room);
  room.resolver.medley=async()=>({ ...MEDLEY, clips:MEDLEY.clips.slice(0,2) });
  await room.msg(a, { t:'start', config:{ questions:5, modes:['medley'], format:'coop', pools:audioPools() } });
  eq([room.game.mode, room.game.answerSlots, room.game.medley, room.game.preview], ['music', null, null, TRACK.preview], '2 utwory → muzyka (tytuł + wykonawca)');
});
const COVERQ={ ...TRACK, origPreview:TRACK.preview, preview:'https://c/piano.m4a', coverArtist:'Pianovus', coverTrack:'Africa (Piano Version)', instrument:'piano' };
await group('MP fortepian/gitara: serwer znajduje cover, klient gra zajawkę coveru, odpowiedź = oryginał, w odsłonie kto grał', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  stubResolver(room); let asked=null;
  room.resolver.instrumental=async({ instrument })=>{ asked=instrument; return { ...COVERQ, instrument }; };
  await room.msg(a, { t:'start', config:{ questions:5, modes:['guitar'], format:'coop', pools:audioPools() } });
  let g=b.last('state').game;
  eq([g.phase, g.mode, g.preview, g.answerSlots, asked], [MP.ARMING, 'guitar', COVERQ.preview, null, 'guitar'], 'ARMING: zajawka COVERU, sloty tytuł + wykonawca');
  ok(!JSON.stringify(g).includes('Pianovus') && !JSON.stringify(g).includes('Toto'), 'kto grał cover i oryginał = SEKRET');
  await readyAll(room, a, b);
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ title:'Africa', artist:'Toto' } } });
  await room.msg(a, { t:'lock' });
  const r=b.last('state').game.reveal;
  eq([r.kind, r.teamOk, r.coverArtist, r.instrument, r.artist], ['music', true, 'Pianovus', 'guitar', 'Toto'], 'odsłona: oryginał + „🎸 Pianovus"');
  ok(r.gained>=100, 'punkty jak muzyka');
});
await group('MP fortepian/gitara: brak coveru → muzyka; kategoria polska → tryb niedostępny (polishDominant)', async ()=>{
  let { room } = await makeRoom();
  let a=room.join('A','Ala'); stubResolver(room); room.resolver.instrumental=async()=>({ error:true, reason:'empty' });
  await room.msg(a, { t:'start', config:{ questions:5, modes:['piano'], format:'coop', pools:audioPools() } });
  eq([room.game.mode, room.game.preview], ['music', TRACK.preview], 'brak coveru → zwykła muzyka (jak solo)');
  ({ room } = await makeRoom());
  a=room.join('A','Ala'); stubResolver(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['piano'], format:'coop', pools:{ 'rock-pl':{ label:'rock PL', artists:['Perfect','Lady Pank'] } } } });
  ok(!room.game || room.game.phase==null, 'tylko fortepian + kategoria polska → brak meczu (instrumentalCapable)');
});
// utwory o kolejnych latach z dekady 80s (wiarygodny rok → karta osi)
function stubYears(room, years=[1984,1981,1987,1983,1989,1982,1986]){
  stubResolver(room); let i=0;
  room.resolver.track=async()=>{ const y=years[i%years.length]; i++; return { ...TRACK, track:'T'+i, artist:'A'+i, year:String(y), preview:'https://p/t'+i+'.m4a' }; };
}
await group('MP oś czasu (coop): kotwica od serwera, slot szczeliny, walidacja, dobra szczelina → karta na osi drużyny', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  stubYears(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['timeline'], format:'coop', pools:audioPools() } });
  let g=b.last('state').game;
  eq([g.phase, g.mode, (g.answerSlots||[]).map(s=>s.key)], [MP.ARMING, 'timeline', ['gap','title','artist']], 'ARMING, sloty: szczelina + tytuł + wykonawca');
  eq(g.timeline.all.map(c=>[c.year, !!c.anchor]), [[1984, true]], 'kotwica (karta jawna) na osi drużyny');
  ok(!JSON.stringify(g).includes('1981'), 'rok karty pytania = SEKRET');
  eq(room.current.tlCard.year, 1981, 'karta pytania w this.current');
  await readyAll(room, a, b);
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ gap:'5', title:'T2' } } });
  eq(room.game.byTeam.all.proposals[0].values, { title:'T2' }, 'zła szczelina odrzucona przez reducer (serwer)');
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ gap:'0', title:'T2', artist:'A2' } } });   // 1981 przed 1984 → dobrze
  await room.msg(a, { t:'lock' });
  const st=b.last('state').game, r=st.reveal;
  eq([r.kind, r.teamOk, r.timelineEval.gap, r.year], ['timeline', true, 0, '1981'], 'odsłona osi: dobre miejsce');
  ok(r.gained>=140, 'punkty: 100 + żetony 20/20 (+ szybkość)');
  eq(st.timeline.all.map(c=>c.year), [1981, 1984], 'karta wstawiona na oś drużyny (stan jawny)');
  await room.msg(a, { t:'next' });
  g=room.game;
  eq([g.mode, g.timeline.all.length], ['timeline', 2], 'następne pytanie: ta sama oś (bez nowej kotwicy)');
  ok(room.current.tlCard && room.current.tlCard.year===1987, 'karta kolejnego pytania');
});
await group('MP oś czasu (Solo): kotwica per gracz, oceny na własnych osiach; utwór bez wiarygodnego roku → muzyka', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  stubYears(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['timeline'], format:'solo', pools:audioPools() } });
  const tl=room.game.timeline;
  eq([tl.A.length, tl.B.length, tl.A[0].year, tl.B[0].year], [1, 1, 1984, 1981], 'każdy gracz ma własną kotwicę');
  eq(room.current.tlCard.year, 1987, 'karta pytania');
  await readyAll(room, a, b);
  await room.msg(a, { t:'action', action:{ type:'propose', values:{ gap:'1' } } });   // A: po 1984 → dobrze
  await room.msg(b, { t:'action', action:{ type:'propose', values:{ gap:'0' } } });   // B: przed 1981 → źle
  await room.msg(a, { t:'lock' });
  const r=room.game.reveal;
  eq([r.byTeam.A.teamOk, r.byTeam.B.teamOk, room.game.timeline.A.length, room.game.timeline.B.length], [true, false, 2, 1], 'karta tylko u gracza, który trafił');
  // poza dekadą (rok z iTunes = remaster) → bez karty; po próbach gramy jak muzykę
  const { room:r2 } = await makeRoom();
  const c=r2.join('C','Cy'); stubYears(r2, [2011]);
  await r2.msg(c, { t:'start', config:{ questions:5, modes:['timeline'], format:'coop', pools:audioPools() } });
  eq([r2.game.mode, r2.game.answerSlots], ['music', null], 'brak wiarygodnego roku → pytanie jak muzyka');
});
/* ==================== dług MP: „Gotowy ✓", karencja hosta (przeładowanie TV), pokój mieszany (adv) ==================== */
await group('„Gotowy ✓" w lobby: toggle, presence.ready, tylko poza meczem, reset przy starcie i wyjściu, start NIE blokowany', async ()=>{
  const { room } = await makeRoom();
  const h=await room.connect('H','Host'), a=await room.connect('A','Ala'), b=await room.connect('B','Bo');
  ok(h.last('presence').caps.includes('lobbyReady'), 'capability lobbyReady w presence');
  eq(h.last('presence').ready, [], 'na start nikt gotowy');
  await room.msg(a, { t:'lobbyReady', on:true });
  eq(h.last('presence').ready, ['A'], 'A gotowa — wszyscy widzą');
  await room.msg(b, { t:'lobbyReady', on:true }); await room.msg(b, { t:'lobbyReady', on:false });
  eq(h.last('presence').ready, ['A'], 'toggle: B cofa gotowość');
  await room.msg(b, { t:'lobbyReady', on:true });
  await room.drop(b);
  eq(h.last('presence').ready, ['A'], 'wyjście gracza → znika z gotowych');
  await room.msg(h, { t:'start', config:CONFIG() });   // host startuje mimo niegotowych (nie blokuje)
  eq(room.game.phase, MP.ARMING, 'start bez kompletu gotowych — NIE blokowany');
  eq(h.last('presence').ready, [], 'start meczu → reset gotowości');
  await room.msg(a, { t:'lobbyReady', on:true });
  eq(room.lobbyReady.size, 0, 'w trakcie meczu „Gotowy" ignorowany');
  room.clearArmTimer(); room.clearAutoLock();
});
await group('karencja hosta: TV (salon) przeładowuje się i wraca w karencji → hostId i tvId zostają przy TV', async ()=>{
  const { room } = await makeRoom(); room.hostGraceMs=80;
  const tv=await room.connect('TV','TV'), p1=await room.connect('P1','Ola'), p2=await room.connect('P2','Kuba');
  // lobby (przed meczem): przeładowanie TV
  await room.drop(tv);
  eq(room.hostId, 'TV', 'lobby: TV wyszła → w karencji host zostaje TV (bez awansu gracza)');
  const p3=await room.connect('P3','Ewa');   // ktoś dołącza w karencji — nie przejmuje
  eq(room.hostId, 'TV', 'dołączający w karencji nie przejmuje hosta');
  let tv2=await room.connect('TV','TV');
  eq([room.hostId, tv2.last('presence').hostId], ['TV','TV'], 'TV wraca w karencji → nadal host');
  await sleep(120);
  eq(room.hostId, 'TV', 'po upływie karencji (TV obecna) bez zmian');
  // mecz salonowy: przeładowanie TV w trakcie
  await room.msg(tv2, { t:'start', config:CONFIG({ salon:true }) });
  eq([room.game.tvId, room.hostId], ['TV','TV'], 'salon: TV = host i tvId');
  await room.drop(tv2);
  eq([room.hostId, room.game.hostId, room.game.tvId], ['TV','TV','TV'], 'w karencji: gracz NIE przejmuje hosta ani ekranu');
  const tv3=await room.connect('TV','TV');
  eq([room.hostId, room.game.tvId, tv3.last('state').game.tvId], ['TV','TV','TV'], 'TV po reloadzie w karencji: host + TV');
  // nie wraca → host ZOSTAJE przy TV (salon: gracz nigdy nie jest hostem); gra toczy się sama (timery + „dalej" graczy)
  await room.drop(tv3);
  await sleep(130);
  eq([room.hostId, room.game.tvId], ['TV','TV'], 'TV nie wraca → po karencji host nadal TV (bez awansu gracza)');
  const tv4=await room.connect('TV','TV');
  eq(room.hostId, 'TV', 'starter-TV wraca później → odzyskuje hosta (reclaim)');
  room.clearArmTimer(); room.clearAutoLock(); room.clearHostGrace();
  void p1; void p2; void p3; void tv4;
});
await group('salon bez TV: „dalej" wszystkich graczy w REVEAL → serwer sam przechodzi; z TV — nie (robi to TV)', async ()=>{
  const { room } = await makeRoom();
  const tv=await room.connect('TV','TV'), p1=await room.connect('P1','Ola'), p2=await room.connect('P2','Kuba');
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true, questions:15 }) });
  await readyAll(room, p1, p2);
  await room.msg(tv, { t:'lock' });
  eq(room.game.phase, MP.REVEAL, 'REVEAL');
  const q0=room.game.qi;
  await room.msg(p1, { t:'event', event:'advanced', payload:{ nonce:room.game.playNonce } });
  await room.msg(p2, { t:'event', event:'advanced', payload:{ nonce:room.game.playNonce } });
  eq([room.game.phase, room.game.qi], [MP.REVEAL, q0], 'TV obecna → serwer nie przechodzi sam (robi to TV)');
  await room.drop(tv);
  await room.msg(p1, { t:'event', event:'advanced', payload:{} });
  eq(room.game.phase, MP.REVEAL, 'jeden z dwóch — czekamy');
  await room.msg(p2, { t:'event', event:'advanced', payload:{} });
  ok(room.game.phase!==MP.REVEAL, 'wszyscy gracze „dalej" bez TV → następne pytanie');
  eq(room.hostId, 'TV', 'host dalej TV');
  room.clearArmTimer(); room.clearAutoLock(); room.clearHostGrace();
});
// restart DO: nowa instancja na TYM SAMYM storage (stare in-memory timery giną), połączenia = podane
async function restartRoom(room, conns, over={}){
  room.clearHostGrace(true); room.clearArmTimer(); room.clearAutoLock();
  let init=null; const ctx={ storage:room.ctx.storage, blockConcurrencyWhile:(fn)=>{ init=fn(); return init; } };
  const r2=new GameAuthority(ctx, { TOKEN_SECRET:'x' }); await init;
  Object.assign(r2, { hostGraceMs:room.hostGraceMs }, over);
  r2.getConnections=()=>conns; r2.broadcast=(s)=>conns.forEach(c=>c.send(s)); r2.name='TEST';
  return r2;
}
await group('karencja hosta przeżywa evikcję DO: restart po terminie → awans gracza', async ()=>{
  const { room, conns } = await makeRoom(); room.hostGraceMs=40;
  const tv=await room.connect('TV','TV'), p=await room.connect('P1','Ola');
  await room.drop(tv);
  eq(room.hostId, 'TV', 'w karencji host bez zmian');
  ok(room.hostAwayUntil>0 && (await room.ctx.storage.get('hostAwayUntil'))>0, 'termin karencji w storage');
  ok((await room.ctx.storage.getAlarm())>0, 'alarm ustawiony (wybudzi evikowany DO)');
  await sleep(70);                                   // termin minął, a „DO spał" — timer zginął
  room.clearHostGrace(true);
  const r2=await restartRoom(room, conns);
  await until(()=>r2.hostId==='P1', 500);
  eq(r2.hostId, 'P1', 'po restarcie z wygasłą karencją gracz awansuje od razu');
  eq(r2.hostAwayUntil, 0, 'karencja wyczyszczona');
  eq(await r2.ctx.storage.get('hostId'), 'P1', 'awans zapisany w storage');
  void p;
});
await group('karencja hosta: restart przed terminem → host wraca w czasie → zostaje hostem', async ()=>{
  const { room, conns } = await makeRoom(); room.hostGraceMs=150;
  const tv=await room.connect('TV','TV'); await room.connect('P1','Ola');
  await room.drop(tv);
  const r2=await restartRoom(room, conns);
  eq([r2.hostId, r2.hostAwayId], ['TV','TV'], 'po restarcie karencja wczytana');
  ok(r2._hostGrace!==null, 'timer na pozostały czas zaplanowany');
  const c=new FakeConn(null,null); c.state=null; conns.push(c);
  const tok=await signToken('x', { sub:'TV' });
  await r2.onConnect(c, { request:{ url:'https://w/parties/game-authority/TEST?t='+tok+'&name=TV' } });
  eq([r2.hostId, r2.hostAwayUntil], ['TV',0], 'host wrócił w karencji → nadal host');
  await sleep(200);
  eq(r2.hostId, 'TV', 'po terminie nadal host (timer zdjęty)');
  r2.clearHostGrace();
});
await group('karencja hosta: alarm z wygasłą karencją awansuje gracza i NIE kasuje niepustego pokoju', async ()=>{
  const { room } = await makeRoom(); room.hostGraceMs=40;
  const tv=await room.connect('TV','TV'); await room.connect('P1','Ola');
  await room.drop(tv);
  room.clearHostGrace(true);                         // timer zginął; zostaje sam alarm
  await sleep(60);
  await room.onAlarm();
  eq(room.hostId, 'P1', 'alarm: awans gracza');
  ok(room.game===null || room.game!==undefined, 'pokój żyje');
  ok((await room.ctx.storage.get('hostId'))==='P1', 'storage NIE skasowany (niepusty pokój)');
  eq(await room.ctx.storage.getAlarm(), null, 'alarm zdjęty po obsłudze');
});
await group('sprzątanie: alarm przed TTL przestawia termin; pusty pokój po TTL kasowany', async ()=>{
  const { room, conns } = await makeRoom(); room.hostGraceMs=40;
  const tv=await room.connect('TV','TV');
  await room.drop(tv);                               // pusto: karencja + sprzątanie
  const al=await room.ctx.storage.getAlarm();
  eq(al, room.hostAwayUntil, 'alarm = min(karencja, sprzątanie) = karencja');
  ok(room.cleanupAt>room.hostAwayUntil, 'sprzątanie później niż karencja');
  await sleep(60);
  await room.onAlarm();                              // karencja wygasła, pokój pusty, TTL jeszcze nie
  ok((await room.ctx.storage.get('hostId'))==='TV', 'przed TTL storage zostaje');
  eq(await room.ctx.storage.getAlarm(), room.cleanupAt, 'alarm przestawiony na termin sprzątania');
  room.cleanupAt=Date.now()-1;                       // „minął TTL"
  await room.onAlarm();
  eq(await room.ctx.storage.get('hostId'), undefined, 'po TTL pusty pokój wyczyszczony');
  eq([room.hostId, room.cleanupAt], [null,0], 'stan zresetowany');
  void conns;
});
await group('karencja hosta: po meczu (DONE) w salonie TV odzyskuje hosta po reloadzie (rewanż ustawia TV)', async ()=>{
  const { room } = await makeRoom();   // hostGraceMs 0 → awans od razu (najgorszy przypadek)
  const tv=await room.connect('TV','TV'), p=await room.connect('P','Ola');
  await room.msg(tv, { t:'start', config:CONFIG({ salon:true, questions:5 }) });
  room.game.phase=MP.DONE;
  await room.drop(tv);
  eq(room.hostId, 'TV', 'salon (DONE): bez awansu gracza nawet bez karencji');
  await room.connect('TV','TV');
  eq(room.hostId, 'TV', 'DONE + salon: TV (starter) odzyskuje hosta');
  room.clearArmTimer(); room.clearAutoLock(); void p;
});
await group('pokój mieszany: presence.members[].adv tylko dla klientów ogłaszających `adv` w hello (stary klient — bez)', async ()=>{
  const { room } = await makeRoom();
  const a=await room.connect('A','Nowy'), b=await room.connect('B','Stary');
  await room.msg(a, { t:'hello', caps:['adv'] });
  await room.msg(b, { t:'hello' });
  const ms=a.last('presence').members;
  eq(ms.map(m=>[m.id, !!m.adv]), [['A',true],['B',false]], 'adv przy nowym kliencie, brak przy starym');
  await room.msg(a, { t:'track', name:'Nowy2' });
  ok(a.last('presence').members.find(m=>m.id==='A').adv, '`track` (zmiana ksywy) nie gubi flagi adv');
});
console.log(`\n${fail?'❌':'✅'} authority: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
