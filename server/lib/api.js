// api.js — REST API danych (D1), zastępuje Supabase Postgres + RPC + auth.
// Tożsamość = profile id z podpisanego tokenu (Authorization: Bearer ...).
import { signToken, verifyToken, newId, friendCode } from './auth.js';
import { insertMatch } from './recordMatch.js';
import { verifyIdToken } from './oauth.js';
import { MAX_QUESTIONS } from '../../core/match.js';
import { SCORE_MAX_PER_Q } from '../../core/scoring.js';
import { sanitizeRating, isTrackKey, isTasteVisibility, TASTE_MAX, TASTE_BATCH } from '../../core/taste.js';
import { publicRating } from '../../core/tasteCompare.js';

// 3.2: serwerowy cap wyniku wg stałych meczu — ODRZUCAMY (400), nie przycinamy.
// F1: limit pytań z core/match.js (to samo źródło co picker i clamp `start` w DO).
// F6a: wynik to PUNKTY (core/scoring.scoreRound) → cap = total_questions × SCORE_MAX_PER_Q (pełna baza × szybkość ×
// seria ×2 × pewniak ×2 = 840/pyt.). Stare klienty (wynik = trafienia ≤ 2/pyt.) mieszczą się w nowym capie.
export function validateMatchRecord(p){
  const qMax = MAX_QUESTIONS;
  const qTotal = parseInt(p&&p.total_questions||0,10)||0;
  const score  = parseInt(p&&p.score||0,10)||0;
  const sMax = qTotal*SCORE_MAX_PER_Q;
  if(qTotal < 0 || qTotal > qMax) return 'total_questions_out_of_range';
  if(score < 0 || score > sMax) return 'score_out_of_range';
  const parts = Array.isArray(p&&p.participants)?p.participants:[];
  for(const e of parts){
    const ps=parseInt(e&&e.score||0,10)||0;
    const cc=parseInt(e&&e.correct_count||0,10)||0;
    if(ps < 0 || ps > sMax) return 'participant_score_out_of_range';
    if(cc < 0 || cc > qTotal) return 'participant_correct_out_of_range';
  }
  return null;   // ok
}

const json = (obj, status=200) => new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json' } });
const err  = (msg, status=400) => json({ error: msg }, status);

async function body(req){ try{ return await req.json(); }catch(e){ return {}; } }
function bearer(req){ const h=req.headers.get('authorization')||''; return h.startsWith('Bearer ')?h.slice(7):null; }
async function uid(req, env){ const p = await verifyToken(env.TOKEN_SECRET, bearer(req)); return p && p.sub ? p.sub : null; }

// S6: wylosuj friend_code nieużywany jeszcze przez żaden profil (jak uniqueGroupCode)
async function uniqueFriendCode(env){
  for(let i=0;i<8;i++){ const c=friendCode(); const hit=await env.DB.prepare(`SELECT 1 FROM profiles WHERE friend_code=?`).bind(c).first(); if(!hit) return c; }
  return friendCode();
}
async function ensureProfile(env, id){
  await env.DB.prepare(
    `INSERT INTO profiles (id, friend_code) VALUES (?, ?) ON CONFLICT(id) DO NOTHING`
  ).bind(id, await uniqueFriendCode(env)).run();
}
async function uniqueGroupCode(env){
  for(let i=0;i<8;i++){ const c=friendCode(); const hit=await env.DB.prepare(`SELECT 1 FROM groups WHERE code=?`).bind(c).first(); if(!hit) return c; }
  return friendCode();
}

const TOKEN_TTL = 90*24*3600;   // S2: token ważny 90 dni; każde /api/session odświeża

// czy profil ma podpięte konto (Google/Apple) — gating drużyn/znajomych
async function isSecured(env, id){
  return !!(await env.DB.prepare(`SELECT 1 FROM oauth_identities WHERE profile_id=?`).bind(id).first());
}

export async function handleApi(req, env, url){
  const path = url.pathname.replace(/\/+$/,'');           // bez końcowego /
  const m = req.method;

  // ---- sesja: pobierz/utwórz tożsamość (device-UUID + token) ----
  if(path==='/api/session' && m==='POST'){
    let id = await uid(req, env);                          // ma ważny token? użyj jego id
    if(!id) id = newId();                                  // inaczej wygeneruj nowe (klient nie wybiera id)
    await ensureProfile(env, id);
    const now = Math.floor(Date.now()/1000);
    const token = await signToken(env.TOKEN_SECRET, { sub:id, iat:now, exp:now+TOKEN_TTL });
    const me = await env.DB.prepare(`SELECT id, handle, emoji, friend_code FROM profiles WHERE id=?`).bind(id).first();
    return json({ ...me, token });
  }

  // ---- liga (publiczna) ----
  if(path==='/api/league' && m==='GET'){
    const limit = Math.min(parseInt(url.searchParams.get('limit')||'50',10)||50, 200);
    const { results } = await env.DB.prepare(
      `SELECT pr.id AS profile_id, pr.handle,
              COUNT(DISTINCT mp.match_id) AS matches,
              COALESCE(SUM(mp.correct_count),0) AS correct,
              COALESCE(SUM(mp.score),0) AS points
       FROM profiles pr JOIN match_participants mp ON mp.profile_id=pr.id
       GROUP BY pr.id, pr.handle ORDER BY points DESC LIMIT ?`
    ).bind(limit).all();
    return json(results||[]);
  }

  // ---- logowanie kontem (Google/Apple): podepnij do profilu albo zaloguj cross-device ----
  if(path==='/api/auth/oauth' && m==='POST'){
    const { provider, idToken } = await body(req);
    const aud = provider==='google' ? env.GOOGLE_CLIENT_ID : provider==='apple' ? env.APPLE_SERVICES_ID : null;
    if(!aud) return err('provider_unconfigured', 400);
    const v = await verifyIdToken(provider, idToken, aud);
    if(!v) return err('invalid_token', 401);
    const existing = await env.DB.prepare(`SELECT profile_id FROM oauth_identities WHERE provider=? AND sub=?`).bind(provider, v.sub).first();
    let pid;
    if(existing){
      pid = existing.profile_id;                           // konto już znane → ten profil (cross-device)
      if(v.email) await env.DB.prepare(`UPDATE oauth_identities SET email=? WHERE provider=? AND sub=?`).bind(v.email, provider, v.sub).run();
    } else {
      pid = (await uid(req, env)) || newId();              // podepnij do OBECNEGO profilu (zachowaj staty) albo nowy
      await ensureProfile(env, pid);
      await env.DB.prepare(
        `INSERT INTO oauth_identities (provider, sub, profile_id, email) VALUES (?,?,?,?)
         ON CONFLICT(provider,sub) DO UPDATE SET profile_id=excluded.profile_id, email=excluded.email`
      ).bind(provider, v.sub, pid, v.email).run();
    }
    const now = Math.floor(Date.now()/1000);
    const token = await signToken(env.TOKEN_SECRET, { sub:pid, iat:now, exp:now+TOKEN_TTL });
    const me = await env.DB.prepare(`SELECT id, handle, emoji, friend_code FROM profiles WHERE id=?`).bind(pid).first();
    return json({ ...me, token, secured:true, email:v.email });
  }

  // ---- wszystko poniżej wymaga tożsamości ----
  const me = await uid(req, env);
  if(!me) return err('not_authenticated', 401);

  if(path==='/api/me' && m==='GET'){
    const row = await env.DB.prepare(`SELECT id, handle, emoji, friend_code FROM profiles WHERE id=?`).bind(me).first();
    const oa = await env.DB.prepare(`SELECT email FROM oauth_identities WHERE profile_id=? LIMIT 1`).bind(me).first();
    return json(row ? { ...row, secured: !!oa, email: oa?oa.email:null } : null);
  }

  if(path==='/api/handle' && m==='POST'){
    const { handle } = await body(req);
    const h = String(handle||'').trim().slice(0,32);
    if(h) await env.DB.prepare(`UPDATE profiles SET handle=? WHERE id=?`).bind(h, me).run();
    return json({ ok:true });
  }

  if(path==='/api/profile' && m==='GET'){
    const prof = await env.DB.prepare(`SELECT id, handle FROM profiles WHERE id=?`).bind(me).first();
    const standing = await env.DB.prepare(
      `SELECT COUNT(DISTINCT match_id) AS matches, COALESCE(SUM(correct_count),0) AS correct, COALESCE(SUM(score),0) AS points
       FROM match_participants WHERE profile_id=?`).bind(me).first();
    const { results } = await env.DB.prepare(`SELECT cat_key, ok FROM match_answers WHERE profile_id=?`).bind(me).all();
    const byCat={}; (results||[]).forEach(a=>{ const k=a.cat_key||'?'; (byCat[k]=byCat[k]||{n:0,ok:0}); byCat[k].n++; if(a.ok) byCat[k].ok++; });
    const oa = await env.DB.prepare(`SELECT email FROM oauth_identities WHERE profile_id=? LIMIT 1`).bind(me).first();
    return json({ id:me, handle:prof?prof.handle:'gracz', standing: standing||{matches:0,correct:0,points:0}, byCat, secured: !!oa, email: oa?oa.email:null });
  }

  if(path==='/api/record-match' && m==='POST'){
    return recordMatch(env, me, await body(req));
  }

  // ===== drużyny ===== (zakładanie/dołączanie wymaga konta — trwałość cross-device)
  if(path==='/api/group/create' && m==='POST'){
    if(!(await isSecured(env, me))) return err('requires_account', 403);
    const { name, emoji } = await body(req);
    const id=newId(), code=await uniqueGroupCode(env);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO groups (id,name,emoji,code,owner_id) VALUES (?,?,?,?,?)`)
        .bind(id, (String(name||'').trim()||'Drużyna'), (String(emoji||'').trim()||'🍺'), code, me),
      env.DB.prepare(`INSERT INTO group_members (group_id,profile_id,role) VALUES (?,?, 'owner')`).bind(id, me),
    ]);
    const g=await env.DB.prepare(`SELECT id,name,emoji,code,owner_id FROM groups WHERE id=?`).bind(id).first();
    return json(g);
  }
  if(path==='/api/group/join' && m==='POST'){
    if(!(await isSecured(env, me))) return err('requires_account', 403);
    const { code } = await body(req);
    const g=await env.DB.prepare(`SELECT id,name,emoji,code,owner_id FROM groups WHERE code=?`).bind(String(code||'').trim().toUpperCase()).first();
    if(!g) return err('group_not_found');
    await env.DB.prepare(`INSERT INTO group_members (group_id,profile_id) VALUES (?,?) ON CONFLICT DO NOTHING`).bind(g.id, me).run();
    return json(g);
  }
  if(path==='/api/group/leave' && m==='POST'){
    const { id } = await body(req);
    await env.DB.prepare(`DELETE FROM group_members WHERE group_id=? AND profile_id=?`).bind(id, me).run();
    return json({ ok:true });
  }
  if(path==='/api/groups' && m==='GET'){
    const { results } = await env.DB.prepare(
      `SELECT g.id,g.name,g.emoji,g.code,g.owner_id,
              (SELECT COUNT(*) FROM group_members m2 WHERE m2.group_id=g.id) AS members
       FROM groups g JOIN group_members m ON m.group_id=g.id AND m.profile_id=?
       ORDER BY g.created_at`).bind(me).all();
    return json(results||[]);
  }
  if(path==='/api/group/members' && m==='GET'){
    const gid=url.searchParams.get('id');
    const member=await env.DB.prepare(`SELECT 1 FROM group_members WHERE group_id=? AND profile_id=?`).bind(gid, me).first();
    if(!member) return err('not_member', 403);
    const { results } = await env.DB.prepare(
      `SELECT p.id AS profile_id, p.handle, p.emoji, m.role
       FROM group_members m JOIN profiles p ON p.id=m.profile_id
       WHERE m.group_id=? ORDER BY (m.role='owner') DESC, m.joined_at`).bind(gid).all();
    return json(results||[]);
  }

  // ===== znajomi ===== (dodawanie/odpowiadanie wymaga konta)
  if(path==='/api/friend/add' && m==='POST'){
    if(!(await isSecured(env, me))) return err('requires_account', 403);
    const { code } = await body(req);
    const target=await env.DB.prepare(`SELECT id FROM profiles WHERE friend_code=?`).bind(String(code||'').trim().toUpperCase()).first();
    if(!target) return err('profile_not_found');
    if(target.id===me) return err('self');
    // jeśli istnieje pending OD targeta DO mnie → akceptuj
    const incoming=await env.DB.prepare(`SELECT id FROM friend_requests WHERE from_id=? AND to_id=? AND status='pending'`).bind(target.id, me).first();
    if(incoming){ await env.DB.prepare(`UPDATE friend_requests SET status='accepted' WHERE id=?`).bind(incoming.id).run(); return json({ ok:true, accepted:true }); }
    await env.DB.prepare(
      `INSERT INTO friend_requests (from_id,to_id) VALUES (?,?)
       ON CONFLICT(from_id,to_id) DO UPDATE SET status=CASE WHEN friend_requests.status='declined' THEN 'pending' ELSE friend_requests.status END`
    ).bind(me, target.id).run();
    return json({ ok:true });
  }
  if(path==='/api/friend/respond' && m==='POST'){
    if(!(await isSecured(env, me))) return err('requires_account', 403);
    const { id, accept } = await body(req);
    await env.DB.prepare(`UPDATE friend_requests SET status=? WHERE id=? AND to_id=? AND status='pending'`)
      .bind(accept?'accepted':'declined', id, me).run();
    return json({ ok:true });
  }
  if(path==='/api/friends' && m==='GET'){
    const { results } = await env.DB.prepare(
      `SELECT p.id AS profile_id, p.handle, p.emoji, p.friend_code FROM friend_requests f
       JOIN profiles p ON p.id = (CASE WHEN f.from_id=? THEN f.to_id ELSE f.from_id END)
       WHERE f.status='accepted' AND (f.from_id=? OR f.to_id=?) ORDER BY p.handle`).bind(me, me, me).all();
    return json(results||[]);
  }
  if(path==='/api/friends/pending' && m==='GET'){
    const { results } = await env.DB.prepare(
      `SELECT f.id AS req_id, p.id AS profile_id, p.handle, p.emoji FROM friend_requests f
       JOIN profiles p ON p.id=f.from_id WHERE f.to_id=? AND f.status='pending' ORDER BY f.created_at DESC`).bind(me).all();
    return json(results||[]);
  }
  // wysłane (wychodzące) zaproszenia — żeby nadawca widział, że coś się stało
  if(path==='/api/friends/sent' && m==='GET'){
    const { results } = await env.DB.prepare(
      `SELECT f.id AS req_id, p.id AS profile_id, p.handle, p.emoji FROM friend_requests f
       JOIN profiles p ON p.id=f.to_id WHERE f.from_id=? AND f.status='pending' ORDER BY f.created_at DESC`).bind(me).all();
    return json(results||[]);
  }

  // ===== „Twój gust" (etap 1) — WYŁĄCZNIE własne oceny (profil z tokena); cudzych endpointy nie ujawniają =====
  if(path==='/api/taste' && m==='GET'){
    const { results } = await env.DB.prepare(
      `SELECT track_key, title, artist, year, genre, art, cat, rating, source, ts FROM taste_ratings
       WHERE profile_id=? ORDER BY ts DESC LIMIT ?`).bind(me, TASTE_MAX).all();
    // etap 2: widoczność gustu (sync ustawienia między urządzeniami); stara baza bez kolumny → domyślnie 'friends'
    let visibility='friends';
    try{ const r=await env.DB.prepare(`SELECT taste_visibility FROM profiles WHERE id=?`).bind(me).first();
      if(r && isTasteVisibility(r.taste_visibility)) visibility=r.taste_visibility; }catch(_e){}
    return json({ items: (results||[]).map(tasteRow), visibility });
  }
  if(path==='/api/taste' && m==='POST'){
    return tasteUpsert(env, me, await body(req));
  }
  if(path==='/api/taste' && m==='DELETE'){
    const key=String(url.searchParams.get('key')||'');
    if(!isTrackKey(key)) return err('bad_key');
    if(await tasteRateLimited(env, me)) return err('rate_limited', 429);
    await env.DB.prepare(`DELETE FROM taste_ratings WHERE profile_id=? AND track_key=?`).bind(me, key).run();
    return json({ ok:true });
  }
  // etap 2 (pod etap 3): „Mój gust widzą znajomi / ukryty" — WYŁĄCZNIE własny profil (id z tokena, nie z body)
  if(path==='/api/taste/visibility' && m==='POST'){
    const p=await body(req), v=p && p.visibility;
    if(!isTasteVisibility(v)) return err('bad_visibility');
    await env.DB.prepare(`UPDATE profiles SET taste_visibility=? WHERE id=?`).bind(v, me).run();
    return json({ ok:true, visibility:v });
  }
  // etap 3: porównanie gustu — oceny ZNAJOMEGO w ograniczonej formie (bez ts/source; ≤ TASTE_MAX). Porównanie liczy
  // klient (core/tasteCompare.compareTaste — ten sam rdzeń; klient ma też oceny jeszcze niezsynchronizowane).
  // Warunki: zaakceptowani znajomi (w dowolnym kierunku) ORAZ znajomy ma taste_visibility='friends'.
  // Kolejność: rate-limit → znajomość (403 not_friends — także nieistniejący profil, bez wycieku istnienia) → ukryty (403 hidden).
  if(path==='/api/taste/compare' && m==='GET'){
    const friend=String(url.searchParams.get('friend')||'');
    if(!friend || friend.length>64 || !/^[\w-]+$/.test(friend)) return err('bad_friend');
    if(friend===me) return err('self');
    if(await compareRateLimited(env, me)) return err('rate_limited', 429);
    const fr=await env.DB.prepare(
      `SELECT 1 FROM friend_requests WHERE status='accepted' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) LIMIT 1`
    ).bind(me, friend, friend, me).first();
    if(!fr) return err('not_friends', 403);
    const p=await env.DB.prepare(`SELECT handle, emoji, taste_visibility FROM profiles WHERE id=?`).bind(friend).first();
    if(!p) return err('not_friends', 403);
    if(p.taste_visibility!=='friends') return err('hidden', 403);
    const { results } = await env.DB.prepare(
      `SELECT title, artist, year, genre, art, cat, rating FROM taste_ratings WHERE profile_id=? ORDER BY ts DESC LIMIT ?`
    ).bind(friend, TASTE_MAX).all();
    return json({ friend:{ profile_id:friend, handle:p.handle||'gracz', emoji:p.emoji||'' }, visibility:'friends',
      items:(results||[]).map(publicRating).filter(Boolean) });
  }

  return err('not_found', 404);
}

/* ---- „Twój gust": upsert ocen (batch ≤ TASTE_BATCH), last-write-wins po ts, limit TASTE_MAX/profil ----
 * Rate-limit per profil z tokena (D1 — liczniki w pamięci isolate'u nie działają): liczba wierszy zapisanych
 * w oknie (updated_at). Sesja „Oceń 20" to ~20 ocen/kilka minut; 300/min i 3000/dobę to z dużym zapasem. */
export const TASTE_LIMITS = [ { window:'-1 minutes', max:300 }, { window:'-1 day', max:3000 } ];
const tasteRow = r => ({ trackKey:r.track_key, title:r.title, artist:r.artist, year:r.year||'', genre:r.genre||'',
  art:r.art||'', cat:r.cat||'', rating:Number(r.rating), source:r.source||'swipe', ts:Number(r.ts)||0 });
async function tasteRateLimited(env, me){
  for(const l of TASTE_LIMITS){
    const r=await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM taste_ratings WHERE profile_id=? AND updated_at > datetime('now', ?)`
    ).bind(me, l.window).first();
    if(r && (r.n|0) >= l.max) return true;
  }
  return false;
}
/* etap 3: rate-limit porównań per profil z tokena — log zapytań w D1 (taste_compare_log, 0005_taste.sql).
 * Lista znajomych ładuje % leniwie (1 zapytanie / znajomy, klient trzyma wynik w pamięci) → 60/min i 600/dobę z zapasem.
 * Każde zapytanie (także 403) liczy się do limitu — utrudnia sondowanie cudzych id. Stare wpisy (> doba) sprzątane. */
export const COMPARE_LIMITS = [ { window:'-1 minutes', max:60 }, { window:'-1 day', max:600 } ];
async function compareRateLimited(env, me){
  for(const l of COMPARE_LIMITS){
    const r=await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM taste_compare_log WHERE profile_id=? AND at > datetime('now', ?)`
    ).bind(me, l.window).first();
    if(r && (r.n|0) >= l.max) return true;
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM taste_compare_log WHERE profile_id=? AND at <= datetime('now', '-1 day')`).bind(me),
    env.DB.prepare(`INSERT INTO taste_compare_log (profile_id, at) VALUES (?, datetime('now'))`).bind(me),
  ]);
  return false;
}
// walidacja + sanityzacja batcha → { items, rejected } albo { error } (czyste — testowane bez D1)
export function validateTasteBatch(p, now=Date.now()){
  const raw = p && Array.isArray(p.items) ? p.items : null;
  if(!raw) return { error:'items_required' };
  if(raw.length > TASTE_BATCH) return { error:'batch_too_large' };
  const byKey=new Map(); let rejected=0;
  for(const r of raw){
    const s=sanitizeRating(r, now);
    if(!s){ rejected++; continue; }
    const prev=byKey.get(s.trackKey);
    if(!prev || s.ts>=prev.ts) byKey.set(s.trackKey, s);   // duplikat w batchu → nowszy
  }
  return { items:[...byKey.values()], rejected };
}
async function tasteUpsert(env, me, p){
  const v=validateTasteBatch(p);
  if(v.error) return err(v.error);
  if(!v.items.length) return json({ ok:true, saved:0, rejected:v.rejected });
  if(await tasteRateLimited(env, me)) return err('rate_limited', 429);
  let items=v.items, rejected=v.rejected;
  const cnt=await env.DB.prepare(`SELECT COUNT(*) AS n FROM taste_ratings WHERE profile_id=?`).bind(me).first();
  const have=(cnt && cnt.n|0) || 0;
  if(have+items.length > TASTE_MAX){   // limit: aktualizacje istniejących zawsze, nowe tylko do TASTE_MAX
    const q=items.map(()=>'?').join(',');
    const { results } = await env.DB.prepare(`SELECT track_key FROM taste_ratings WHERE profile_id=? AND track_key IN (${q})`)
      .bind(me, ...items.map(x=>x.trackKey)).all();
    const exists=new Set((results||[]).map(r=>r.track_key));
    let room=Math.max(0, TASTE_MAX-have);
    items=items.filter(x=>{ if(exists.has(x.trackKey)) return true; if(room>0){ room--; return true; } rejected++; return false; });
    if(!items.length) return json({ ok:true, saved:0, rejected, limit:TASTE_MAX });
  }
  await env.DB.batch(items.map(x=>env.DB.prepare(
    `INSERT INTO taste_ratings (profile_id, track_key, title, artist, year, genre, art, cat, rating, source, ts, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
     ON CONFLICT(profile_id, track_key) DO UPDATE SET title=excluded.title, artist=excluded.artist, year=excluded.year,
       genre=excluded.genre, art=excluded.art, cat=excluded.cat, rating=excluded.rating, source=excluded.source,
       ts=excluded.ts, updated_at=excluded.updated_at
     WHERE excluded.ts >= taste_ratings.ts`
  ).bind(me, x.trackKey, x.title, x.artist, x.year, x.genre, x.art, x.cat, x.rating, x.source, x.ts)));
  return json({ ok:true, saved:items.length, rejected });
}

// F1 (#9): limity zapisu meczu przez KLIENTA (per profil z tokena; D1 — liczniki w pamięci
// isolate'u nie działają na Workers). Mecz ma ≥15 pytań, więc 2 / 2 min i 60 / dobę to z zapasem.
export const RECORD_LIMITS = [ { window:'-2 minutes', max:2 }, { window:'-1 day', max:60 } ];
const clip = (v, n) => (v==null ? null : String(v).slice(0, n));
// obiekt z sieci → ten sam, gdy jego JSON ≤ max znaków; inaczej {} (config meczu w D1)
function smallObj(o, max){
  if(!o || typeof o!=='object') return {};
  try{ return JSON.stringify(o).length<=max ? o : {}; }catch(_e){ return {}; }
}

/* record_match — zapis meczu zgłoszonego przez KLIENTA.
 * F1 (#9) DECYZJA: klient zapisuje WYŁĄCZNIE siebie (profil z tokena). Uczestnicy spoza tokena są
 * IGNOROWANI (nie odrzucamy całego meczu — host relay dalej zapisze swój wynik). Punkty/mecze INNYM
 * profilom dopisuje tylko autorytatywny DO (`server/authorityRoom.js` → `insertMatch` wprost,
 * z wynikiem policzonym na serwerze, sekret serwera = brak ścieżki przez to API). Pod
 * `serverAuthority:true` klient MP w ogóle tu nie pisze; w rollbacku relay (?authority=0) mecz MP
 * zalicza się tylko hostowi — świadomy koszt za zamknięcie dopisywania wyników cudzym profilom.
 * Plus: rate-limit per profil (RECORD_LIMITS), cap długości stringów (anty-puchnięcie D1),
 * host_id = wołający, group_id tylko gdy wołający jest członkiem drużyny. */
async function recordMatch(env, caller, p){
  p = (p && typeof p==='object') ? p : {};
  const bad = validateMatchRecord(p);   // 3.2: odrzuć zawyżony wynik (400)
  if(bad) return err(bad);
  const parts = (Array.isArray(p.participants)?p.participants:[]).slice(0, 32);
  const mine = parts.find(e => e && String(e.profile_id)===caller);
  if(!mine) return err('caller_not_in_match', 403);
  for(const l of RECORD_LIMITS){
    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM matches WHERE host_id=? AND finished_at > datetime('now', ?)`
    ).bind(caller, l.window).first();
    if(r && (r.n|0) >= l.max) return err('rate_limited', 429);
  }
  let groupId = null;
  if(p.group_id){
    const g = String(p.group_id).slice(0, 64);
    const member = await env.DB.prepare(`SELECT 1 FROM group_members WHERE group_id=? AND profile_id=?`).bind(g, caller).first();
    if(member) groupId = g;
  }
  const qMax = MAX_QUESTIONS;
  const safe = {
    mode: p.mode==='mp' ? 'mp' : 'solo',
    room_code: clip(p.room_code, 8), host_id: caller, group_id: groupId,
    config: smallObj(p.config, 2000),
    score: p.score, total_questions: p.total_questions, started_at: clip(p.started_at, 40),
    participants: [{
      profile_id: caller, display_name: clip(mine.display_name || 'gracz', 32),
      role: mine.role==='host' ? 'host' : 'player', score: mine.score, correct_count: mine.correct_count,
    }],
    answers: (Array.isArray(p.answers)?p.answers:[]).slice(0, qMax).filter(a=>a && typeof a==='object').map(a=>({
      q_no: a.q_no, cat_key: clip(a.cat_key, 64), mode: clip(a.mode, 16),
      track: clip(a.track, 200), artist: clip(a.artist, 200), ok: !!a.ok,
      profile_id: (a.profile_id!=null && String(a.profile_id)===caller) ? caller : null,
    })),
  };
  const id = await insertMatch(env, safe);                 // wspólny zapis (cap + bez N+1)
  return json({ id });
}
