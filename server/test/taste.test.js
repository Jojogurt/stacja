/* server/test/taste.test.js — „Twój gust" (etap 1): /api/taste (GET/POST/DELETE) poza Workerem.
 * Dwa backendy D1: (1) mały fake w pamięci (zawsze — CI na Node 20), (2) PRAWDZIWY SQLite z node:sqlite (gdy dostępny,
 * Node ≥ 22.5) z migracjami 0001 + 0004 + 0005 — sprawdza też składnię migracji i UPSERT-a z warunkiem LWW.
 * Uruchom: npm --prefix server test. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { signToken } from '../lib/auth.js';
import { handleApi, validateTasteBatch, TASTE_LIMITS } from '../lib/api.js';
import { trackKey, TASTE_MAX, TASTE_BATCH } from '../../core/taste.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.error('  ✗ '+m);} };
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b), `${m} — oczekiwano ${JSON.stringify(b)}, było ${JSON.stringify(a)}`);
async function group(name, fn){ console.log('• '+name); try{ await fn(); }catch(e){ fail++; console.error('  ✗ WYJĄTEK: '+(e&&e.stack||e)); } }

/* ---- fake D1: tylko zapytania /api/taste (regex po SQL) ---- */
function fakeD1(){
  const rows=new Map();   // `${pid}|${key}` → wiersz (updated_at = ms)
  const vis=new Map();    // profile_id → taste_visibility (etap 2)
  const winMs=w=>/minute/.test(w) ? 60e3*Math.abs(parseInt(w,10)) : 86400e3*Math.abs(parseInt(w,10));
  const mine=pid=>[...rows.values()].filter(r=>r.profile_id===pid);
  const exec=(sql, a)=>{
    if(/^\s*INSERT INTO taste_ratings/.test(sql)){
      const [profile_id, track_key, title, artist, year, genre, art, cat, rating, source, ts]=a;
      const k=profile_id+'|'+track_key, prev=rows.get(k);
      if(prev && ts<prev.ts) return;   // WHERE excluded.ts >= taste_ratings.ts
      rows.set(k, { profile_id, track_key, title, artist, year, genre, art, cat, rating, source, ts, updated_at:Date.now() });
      return;
    }
    if(/^\s*DELETE FROM taste_ratings/.test(sql)){ rows.delete(a[0]+'|'+a[1]); return; }
    if(/^\s*UPDATE profiles SET taste_visibility=\? WHERE id=\?/.test(sql)){ if(vis.has(a[1])) vis.set(a[1], a[0]); return; }
    throw new Error('fakeD1: nieznany run: '+sql);
  };
  const stmt=(sql)=>({ sql, args:[], bind(...a){ this.args=a; return this; },
    async first(){
      if(/COUNT\(\*\) AS n FROM taste_ratings WHERE profile_id=\? AND updated_at/.test(sql)){
        const since=Date.now()-winMs(this.args[1]); return { n: mine(this.args[0]).filter(r=>r.updated_at>since).length };
      }
      if(/COUNT\(\*\) AS n FROM taste_ratings WHERE profile_id=\?/.test(sql)) return { n: mine(this.args[0]).length };
      if(/SELECT taste_visibility FROM profiles WHERE id=\?/.test(sql)) return vis.has(this.args[0]) ? { taste_visibility:vis.get(this.args[0]) } : null;
      throw new Error('fakeD1: nieznany first: '+sql);
    },
    async all(){
      if(/SELECT track_key FROM taste_ratings WHERE profile_id=\? AND track_key IN/.test(sql)){
        const [pid, ...keys]=this.args; return { results: mine(pid).filter(r=>keys.includes(r.track_key)).map(r=>({ track_key:r.track_key })) };
      }
      if(/FROM taste_ratings\s+WHERE profile_id=\? ORDER BY ts DESC LIMIT \?/.test(sql)){
        return { results: mine(this.args[0]).sort((x,y)=>y.ts-x.ts).slice(0, this.args[1]) };
      }
      throw new Error('fakeD1: nieznany all: '+sql);
    },
    async run(){ exec(sql, this.args); return {}; },
  });
  return { prepare:stmt, async batch(sts){ for(const s of sts) exec(s.sql, s.args); },
    profile(pid){ vis.set(pid, 'friends'); },
    // seed: n ocen profilu „zapisanych dawno" (poza oknem rate-limitu)
    seed(pid, n){ for(let i=0;i<n;i++) rows.set(pid+'|seed '+i+'|x', { profile_id:pid, track_key:'seed '+i+'|x', title:'x', artist:'seed '+i, year:'', genre:'', art:'', cat:'', rating:1, source:'swipe', ts:1, updated_at:0 }); } };
}

/* ---- D1 na prawdziwym SQLite (node:sqlite) + migracje repo ---- */
async function sqliteD1(){
  let DatabaseSync;
  try{ ({ DatabaseSync } = await import('node:sqlite')); }catch(_e){ return null; }
  const db=new DatabaseSync(':memory:');
  for(const f of ['0001_init.sql', '0004_oauth.sql', '0005_taste.sql']) db.exec(readFileSync(join(HERE, '..', 'migrations', f), 'utf8'));
  const stmt=(sql)=>({ sql, args:[], bind(...a){ this.args=a; return this; },
    async first(){ return db.prepare(sql).get(...this.args) ?? null; },
    async all(){ return { results: db.prepare(sql).all(...this.args) }; },
    async run(){ db.prepare(sql).run(...this.args); return {}; },
  });
  return { prepare:stmt, raw:db,
    profile(pid){ db.prepare(`INSERT INTO profiles (id, handle) VALUES (?, 'gracz')`).run(pid); },
    async batch(sts){ db.exec('BEGIN'); try{ for(const s of sts) db.prepare(s.sql).run(...s.args); db.exec('COMMIT'); }catch(e){ db.exec('ROLLBACK'); throw e; } },
    seed(pid, n){ const st=db.prepare(`INSERT INTO taste_ratings (profile_id, track_key, title, artist, rating, ts, updated_at) VALUES (?,?,?,?,1,1,'2000-01-01 00:00:00')`);
      for(let i=0;i<n;i++) st.run(pid, 'seed '+i+'|x', 'x', 'seed '+i); } };
}

async function api(env, method, path, tok, body){
  const url=new URL('https://w'+path);
  const headers={ 'content-type':'application/json' }; if(tok) headers.authorization='Bearer '+tok;
  const req=new Request(url, { method, headers, body: body!==undefined ? JSON.stringify(body) : undefined });
  const res=await handleApi(req, env, url);
  return { status:res.status, body:await res.json() };
}
const R=(i, over={})=>({ title:'Song '+i, artist:'Artist', year:'1985', genre:'Pop', art:'https://is1.mzstatic.com/a'+i+'.jpg', cat:'80s', rating:1, source:'swipe', ts:1000+i, ...over });

/* ==================== czysta walidacja batcha ==================== */
await group('taste: validateTasteBatch — sanityzacja, limit batcha, duplikaty', async ()=>{
  eq(validateTasteBatch({}).error, 'items_required', 'brak items → błąd');
  eq(validateTasteBatch({ items:'x' }).error, 'items_required', 'items nie-tablica → błąd');
  eq(validateTasteBatch({ items:Array.from({length:TASTE_BATCH+1}, (_,i)=>R(i)) }).error, 'batch_too_large', `> ${TASTE_BATCH} → batch_too_large`);
  const v=validateTasteBatch({ items:[
    R(1, { trackKey:'cudzy|klucz', art:'javascript:alert(1)', cat:'80s"><img', year:'abcd', title:'  Song   1 (2011 Remaster) ' }),
    R(2, { rating:5 }), R(3, { rating:'2', source:'hack' }), null, R(4, { title:'' }),
    R(1, { ts:5000, rating:2 }),   // duplikat klucza Song 1 — nowszy wygrywa
  ] });
  eq(v.rejected, 3, 'odrzucone: rating 5, null, pusty tytuł');
  eq(v.items.length, 2, 'zostały 2 unikalne oceny');
  const s1=v.items.find(x=>x.trackKey===trackKey('Artist','Song 1'));
  ok(s1 && s1.rating===2 && s1.ts===5000, 'duplikat w batchu → nowszy ts');
  const s3=v.items.find(x=>x.trackKey===trackKey('Artist','Song 3'));
  ok(s3 && s3.rating===2 && s3.source==='swipe', 'rating „2" (string) → 2, nieznane source → swipe');
  const v2=validateTasteBatch({ items:[ R(9, { trackKey:'cudzy|klucz', art:'javascript:alert(1)', cat:'80s"><img', year:'abcd' }) ] }).items[0];
  eq([v2.trackKey, v2.art, v2.cat, v2.year], [trackKey('Artist','Song 9'), '', '', ''], 'klucz liczony z artysta+tytuł; złe art/cat/rok → puste');
});

for(const [label, makeDB] of [['fake D1', async()=>fakeD1()], ['SQLite (node:sqlite) + migracje', sqliteD1]]){
  const probe=await makeDB();
  if(!probe){ console.log(`• taste [${label}]: pominięte (brak node:sqlite w tej wersji Node)`); continue; }

  await group(`taste [${label}]: auth, upsert, GET tylko własne, LWW, DELETE`, async ()=>{
    const DB=await makeDB(), env={ TOKEN_SECRET:'x', DB };
    const tA=await signToken('x', { sub:'A' }), tB=await signToken('x', { sub:'B' });
    eq((await api(env, 'GET', '/api/taste', null)).status, 401, 'bez tokenu → 401');
    eq((await api(env, 'POST', '/api/taste', 'zly.token.x', { items:[R(1)] })).status, 401, 'zły token → 401');
    const p=await api(env, 'POST', '/api/taste', tA, { items:[R(1), R(2, { rating:2 }), R(3, { rating:7 })] });
    eq([p.status, p.body.saved, p.body.rejected], [200, 2, 1], 'POST: 2 zapisane, 1 odrzucona');
    await api(env, 'POST', '/api/taste', tB, { items:[R(1, { rating:-1 }), R(50)] });
    const gA=await api(env, 'GET', '/api/taste', tA);
    eq(gA.status, 200, 'GET 200');
    eq(gA.body.items.map(x=>x.title).sort(), ['Song 1','Song 2'], 'GET: tylko oceny profilu z tokena (bez cudzych)');
    const s1=gA.body.items.find(x=>x.title==='Song 1');
    eq([s1.rating, s1.trackKey, s1.year, s1.genre, s1.cat, s1.source], [1, trackKey('Artist','Song 1'), '1985', 'Pop', '80s', 'swipe'], 'kształt oceny z GET');
    // LWW: starszy ts nie nadpisuje, nowszy tak
    await api(env, 'POST', '/api/taste', tA, { items:[R(1, { rating:-1, ts:10 })] });
    eq((await api(env, 'GET', '/api/taste', tA)).body.items.find(x=>x.title==='Song 1').rating, 1, 'LWW: starsza ocena nie nadpisuje');
    await api(env, 'POST', '/api/taste', tA, { items:[R(1, { rating:2, ts:9999 })] });
    eq((await api(env, 'GET', '/api/taste', tA)).body.items.find(x=>x.title==='Song 1').rating, 2, 'LWW: nowsza ocena nadpisuje');
    // DELETE
    eq((await api(env, 'DELETE', '/api/taste?key='+encodeURIComponent('<script>'), tA)).status, 400, 'DELETE: zły klucz → 400');
    eq((await api(env, 'DELETE', '/api/taste?key='+encodeURIComponent(trackKey('Artist','Song 1')), tA)).status, 200, 'DELETE własnej oceny → 200');
    eq((await api(env, 'GET', '/api/taste', tA)).body.items.map(x=>x.title), ['Song 2'], 'po DELETE: Song 1 zniknęła');
    eq((await api(env, 'GET', '/api/taste', tB)).body.items.map(x=>x.title).sort(), ['Song 1','Song 50'], 'DELETE nie rusza tej samej piosenki u innego profilu');
    eq((await api(env, 'POST', '/api/taste', tA, { items:Array.from({length:51}, (_,i)=>R(i)) })).status, 400, 'POST > 50 → 400');
  });

  await group(`taste [${label}]: rate-limit per profil + limit ${TASTE_MAX} ocen`, async ()=>{
    const DB=await makeDB(), env={ TOKEN_SECRET:'x', DB };
    const tA=await signToken('x', { sub:'A' }), tC=await signToken('x', { sub:'C' });
    const perMin=TASTE_LIMITS[0].max;
    let last=null;
    for(let b=0; b*TASTE_BATCH<perMin; b++){
      last=await api(env, 'POST', '/api/taste', tA, { items:Array.from({length:TASTE_BATCH}, (_,i)=>R(b*TASTE_BATCH+i, { artist:'RL' })) });
    }
    eq(last.status, 200, `${perMin} ocen w minutę przechodzi`);
    eq((await api(env, 'POST', '/api/taste', tA, { items:[R(9999)] })).status, 429, 'kolejny zapis w oknie → 429');
    eq((await api(env, 'DELETE', '/api/taste?key='+encodeURIComponent(trackKey('RL','Song 1')), tA)).status, 429, 'DELETE też limitowany');
    // limit ocen: profil C ma TASTE_MAX-1 „starych" ocen → 1 nowa wchodzi, druga odrzucona; aktualizacja istniejącej OK
    DB.seed('C', TASTE_MAX-1);
    const r=await api(env, 'POST', '/api/taste', tC, { items:[R(1), R(2)] });
    eq([r.status, r.body.saved, r.body.rejected], [200, 1, 1], `limit ${TASTE_MAX}: wchodzi tylko 1 nowa`);
    const u=await api(env, 'POST', '/api/taste', tC, { items:[R(1, { rating:2, ts:99999 })] });
    eq([u.status, u.body.saved], [200, 1], 'przy pełnym limicie aktualizacja istniejącej przechodzi');
    eq((await api(env, 'GET', '/api/taste', tC)).body.items.length, TASTE_MAX, `GET zwraca ≤ ${TASTE_MAX}`);
  });

  await group(`taste [${label}]: POST /api/taste/visibility — walidacja, tylko własny profil, GET zwraca ustawienie`, async ()=>{
    const DB=await makeDB(), env={ TOKEN_SECRET:'x', DB };
    DB.profile('A'); DB.profile('B');
    const tA=await signToken('x', { sub:'A' }), tB=await signToken('x', { sub:'B' });
    eq((await api(env, 'GET', '/api/taste', tA)).body.visibility, 'friends', 'domyślnie friends (DEFAULT kolumny)');
    eq((await api(env, 'POST', '/api/taste/visibility', null, { visibility:'hidden' })).status, 401, 'bez tokenu → 401');
    for(const bad of ['public', '', null, 'HIDDEN', ['hidden'], { v:1 }]){
      eq((await api(env, 'POST', '/api/taste/visibility', tA, { visibility:bad })).status, 400, 'zła wartość → 400: '+JSON.stringify(bad));
    }
    eq((await api(env, 'POST', '/api/taste/visibility', tA, {})).status, 400, 'brak pola → 400');
    const r=await api(env, 'POST', '/api/taste/visibility', tA, { visibility:'hidden', profile_id:'B', id:'B' });
    eq([r.status, r.body.visibility], [200, 'hidden'], 'hidden → 200');
    eq((await api(env, 'GET', '/api/taste', tA)).body.visibility, 'hidden', 'GET: moje ustawienie = hidden');
    eq((await api(env, 'GET', '/api/taste', tB)).body.visibility, 'friends', 'id w body ignorowane — cudzy profil nietknięty');
    await api(env, 'POST', '/api/taste/visibility', tA, { visibility:'friends' });
    eq((await api(env, 'GET', '/api/taste', tA)).body.visibility, 'friends', 'powrót do friends');
    eq((await api(env, 'GET', '/api/taste/visibility', tA)).status, 404, 'GET /api/taste/visibility — brak trasy (404)');
  });
}

console.log(`\n${fail?'❌':'✅'} taste: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
