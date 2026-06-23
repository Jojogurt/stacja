// api.js — REST API danych (D1), zastępuje Supabase Postgres + RPC + auth.
// Tożsamość = profile id z podpisanego tokenu (Authorization: Bearer ...).
import { signToken, verifyToken, newId, friendCode } from './auth.js';
import { insertMatch } from './recordMatch.js';

const json = (obj, status=200) => new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json' } });
const err  = (msg, status=400) => json({ error: msg }, status);

async function body(req){ try{ return await req.json(); }catch(e){ return {}; } }
function bearer(req){ const h=req.headers.get('authorization')||''; return h.startsWith('Bearer ')?h.slice(7):null; }
async function uid(req, env){ const p = await verifyToken(env.TOKEN_SECRET, bearer(req)); return p && p.sub ? p.sub : null; }

async function ensureProfile(env, id){
  await env.DB.prepare(
    `INSERT INTO profiles (id, friend_code) VALUES (?, ?) ON CONFLICT(id) DO NOTHING`
  ).bind(id, friendCode()).run();
}
async function uniqueGroupCode(env){
  for(let i=0;i<8;i++){ const c=friendCode(); const hit=await env.DB.prepare(`SELECT 1 FROM groups WHERE code=?`).bind(c).first(); if(!hit) return c; }
  return friendCode();
}

export async function handleApi(req, env, url){
  const path = url.pathname.replace(/\/+$/,'');           // bez końcowego /
  const m = req.method;

  // ---- sesja: pobierz/utwórz tożsamość (device-UUID + token) ----
  if(path==='/api/session' && m==='POST'){
    let id = await uid(req, env);                          // ma ważny token? użyj jego id
    if(!id) id = newId();                                  // inaczej wygeneruj nowe (klient nie wybiera id)
    await ensureProfile(env, id);
    const token = await signToken(env.TOKEN_SECRET, { sub:id, iat:Math.floor(Date.now()/1000) });
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

  // ---- wszystko poniżej wymaga tożsamości ----
  const me = await uid(req, env);
  if(!me) return err('not_authenticated', 401);

  if(path==='/api/me' && m==='GET'){
    const row = await env.DB.prepare(`SELECT id, handle, emoji, friend_code FROM profiles WHERE id=?`).bind(me).first();
    return json(row||null);
  }

  if(path==='/api/handle' && m==='POST'){
    const { handle } = await body(req);
    const h = String(handle||'').trim().slice(0,16);
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
    return json({ id:me, handle:prof?prof.handle:'gracz', standing: standing||{matches:0,correct:0,points:0}, byCat });
  }

  if(path==='/api/record-match' && m==='POST'){
    return recordMatch(env, me, await body(req));
  }

  // ===== drużyny =====
  if(path==='/api/group/create' && m==='POST'){
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

  // ===== znajomi =====
  if(path==='/api/friend/add' && m==='POST'){
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

  return err('not_found', 404);
}

// record_match — walidacja (autoryzacja + zakres score), insert deleguje do wspólnego insertMatch.
async function recordMatch(env, caller, p){
  const qTotal = parseInt(p.total_questions||0,10)||0;
  const score  = parseInt(p.score||0,10)||0;
  if(score < 0 || score > qTotal*2 + 10) return err('score_out_of_range');
  const host = p.host_id || null;
  const parts = (Array.isArray(p.participants)?p.participants:[]).slice(0, 32);
  if(host !== caller && !parts.some(e=>String(e.profile_id)===caller)) return err('caller_not_in_match', 403);
  const id = await insertMatch(env, p);                    // wspólny zapis (cap + bez N+1)
  return json({ id });
}
