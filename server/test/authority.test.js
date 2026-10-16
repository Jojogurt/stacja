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
  room.name='TEST';
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
  eq(room.game.slots.length, 1, 'questions=5 → 1 slot (5 pytań)');
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
await group('F8a: presence niesie `modes` (capability) — bez „intro"', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala');
  const pr=a.last('presence');
  ok(Array.isArray(pr.modes) && pr.modes.includes('abcd') && pr.modes.includes('year'), 'presence.modes zawiera nowe tryby MP');
  ok(!pr.modes.includes('intro'), 'intro tylko solo — serwer go nie ogłasza');
});
await group('F8a: start z samym „intro" → zignorowany (tryb tylko solo)', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'); stubResolver(room);
  await room.msg(a, { t:'start', config:{ questions:5, modes:['intro'], format:'coop', pools:audioPools() } });
  ok(!room.game || room.game.phase==null, 'brak meczu (sanitizeMpConfig wycina intro → buildMatch error)');
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
await group('EKSP.: presence ogłasza „od tyłu krótko", bez składanki/okładki; start z samymi trybami solo → brak meczu', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'); stubResolver(room);
  const pr=a.last('presence');
  ok(pr.modes.includes('revsnip'), 'presence.modes: revsnip');
  ok(!pr.modes.includes('medley') && !pr.modes.includes('cover'), 'składanka/okładka tylko solo');
  await room.msg(a, { t:'start', config:{ questions:5, modes:['medley','cover'], format:'coop', pools:audioPools() } });
  ok(!room.game || room.game.phase==null, 'start tylko z trybami solo → zignorowany');
});
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
await group('EKSP.: presence ogłasza obroty (bez osi czasu); start z samą osią czasu → brak meczu', async ()=>{
  const { room } = await makeRoom();
  const a=room.join('A','Ala'); stubResolver(room);
  const pr=a.last('presence');
  ok(pr.modes.includes('slowmo') && pr.modes.includes('fastmo'), 'presence.modes: slowmo + fastmo');
  ok(!pr.modes.includes('timeline'), 'oś czasu tylko solo');
  await room.msg(a, { t:'start', config:{ questions:5, modes:['timeline'], format:'coop', pools:audioPools() } });
  ok(!room.game || room.game.phase==null, 'start z samą osią czasu → zignorowany');
});
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
console.log(`\n${fail?'❌':'✅'} authority: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
