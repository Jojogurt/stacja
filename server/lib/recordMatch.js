/* server/lib/recordMatch.js — wspólny INSERT meczu (matches + participants + answers).
 * Reużywane przez `/api/record-match` (klient solo/MP-relay) i autorytatywny DO
 * (`server/authorityRoom.js`, który liczy wynik sam i zapisuje wprost do D1).
 * Walidacja autoryzacji/score zostaje po stronie wołającego — tu tylko bezpieczny zapis
 * (cap anty-flood + jedno `WHERE id IN (...)` zamiast N+1). Zwraca id meczu. */
import { newId } from './auth.js';

export async function insertMatch(env, p){
  const qTotal = parseInt(p.total_questions||0,10)||0;
  const score  = parseInt(p.score||0,10)||0;
  const parts   = (Array.isArray(p.participants)?p.participants:[]).slice(0, 32);   // cap anty-flood
  const answers = (Array.isArray(p.answers)?p.answers:[]).slice(0, 1000);

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO matches (id,mode,room_code,host_id,group_id,config,score,total_questions,started_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(id, p.mode||'solo', p.room_code||null, p.host_id||null, p.group_id||null,
         JSON.stringify(p.config||{}), score, qTotal, p.started_at||null).run();

  // które profile_id uczestników istnieją — JEDNO zapytanie zamiast N+1 SELECT-ów
  const ids = [...new Set(parts.map(e=>e&&e.profile_id).filter(Boolean).map(String))];
  let known = new Set();
  if(ids.length){
    const ph = ids.map(()=>'?').join(',');
    const { results } = await env.DB.prepare(`SELECT id FROM profiles WHERE id IN (${ph})`).bind(...ids).all();
    known = new Set((results||[]).map(r=>String(r.id)));
  }

  const stmts=[];
  for(const e of parts){
    if(!known.has(String(e.profile_id))) continue;          // pomiń uczestnika bez profilu
    stmts.push(env.DB.prepare(
      `INSERT INTO match_participants (match_id,profile_id,display_name,role,score,correct_count)
       VALUES (?,?,?,?,?,?) ON CONFLICT(match_id,profile_id) DO NOTHING`
    ).bind(id, e.profile_id, e.display_name||'gracz', e.role||'player',
           parseInt(e.score||0,10)||0, parseInt(e.correct_count||0,10)||0));
  }
  for(const a of answers){
    stmts.push(env.DB.prepare(
      `INSERT INTO match_answers (match_id,profile_id,q_no,cat_key,mode,track,artist,ok)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, a.profile_id||null, parseInt(a.q_no||0,10)||null, a.cat_key||null, a.mode||null,
           a.track||null, a.artist||null, a.ok?1:0));
  }
  if(stmts.length) await env.DB.batch(stmts);
  return id;
}
