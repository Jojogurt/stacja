/* server/test/authority.test.js — testy AUTORYTATYWNEGO pokoju (Durable Object) poza Workerem.
 * partyserver stubowany loaderem (register.mjs). Pule bez sieci: mecz TYLKO quiz
 * (resolveTrackServer nie jest wołane). Uruchom: npm --prefix server test
 * (node --import ./test/register.mjs test/authority.test.js). */
import { GameAuthority } from '../authorityRoom.js';
import { MP } from '../../core/phases.js';
import { signToken, verifyToken } from '../lib/auth.js';
import { validateMatchRecord } from '../lib/api.js';

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

console.log(`\n${fail?'❌':'✅'} authority: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
