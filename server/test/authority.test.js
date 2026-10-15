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
async function makeRoom(){
  let initPromise=null;
  // Worker BLOKUJE wiadomości do końca konstruktorowego blockConcurrencyWhile — tu awaitujemy
  // ten promise, inaczej async-wczytanie storage nadpisałoby stan ustawiony przez start (race).
  const ctx={ storage:new FakeStorage(), blockConcurrencyWhile:(fn)=>{ initPromise=fn(); return initPromise; } };
  const room=new GameAuthority(ctx, { TOKEN_SECRET:'x' });
  await initPromise;
  const conns=[];
  room.getConnections=()=>conns;
  room.broadcast=(s)=>conns.forEach(c=>c.send(s));
  room.name='TEST';
  room.join=(id,name)=>{ const c=new FakeConn(id,name); conns.push(c);
    if(!room.hostId) room.hostId=id; room.pushPresence(); return c; };
  room.drop=async(c)=>{ conns.splice(conns.indexOf(c),1); await room.onClose(c); };
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
  ok(validateMatchRecord({ total_questions:15, score:9999 }), 'score > cap → błąd');
  ok(validateMatchRecord({ total_questions:15, score:10, participants:[{ profile_id:'p', score:9999 }] }), 'participant.score > cap → błąd');
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

console.log(`\n${fail?'❌':'✅'} authority: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
