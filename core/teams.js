/* core/teams.js — czysty generator DRUŻYN multiplayera (zero DOM / sieci).
 * Tryby konkurencyjne sprowadzają się do RÓŻNEGO składu `game.teams`:
 *   - 'coop'  → JEDNA drużyna ze wszystkimi (obecny tryb),
 *   - 'solo'  → N drużyn 1-osobowych (każdy gracz osobno),
 *   - 'teams' → host dzieli graczy na drużyny (Faza 2; `assignments`).
 * Reszta rdzenia (reducer/selektory/ocena) pracuje JEDNOLICIE na `teamId` — nie zna formatu. */

// paleta kolorów drużyn (te same odcienie co awatary w widoku — VOTE_COLORS)
import { safeColor, clipText } from './util.js';

const TEAM_COLORS = ['#58CC02','#CE82FF','#FFC800','#FF4B4B','#1CB0F6','#1899D6','#FF9600','#2EC4B6'];
export const teamColor = (i)=> TEAM_COLORS[((i%TEAM_COLORS.length)+TEAM_COLORS.length)%TEAM_COLORS.length];

export const COOP_TEAM = 'all';   // stały id drużyny w trybie wspólnym

/* złóż listę drużyn dla formatu. `players` = [{id,name}] (obecni gracze, bez salon-hosta).
 * coop: 1 drużyna 'all' ze wszystkimi. solo: drużyna == gracz (id drużyny = id gracza). */
export function buildTeams(format, players, assignments){
  const ps = players || [];
  if(format==='solo'){
    return ps.map((p,i)=>({ id:p.id, name:p.name||'gracz', color:teamColor(i), members:[p.id] }));
  }
  if(format==='teams' && Array.isArray(assignments) && assignments.length){   // Faza 2
    const teams = sanitizeAssignments(assignments, ps);
    if(teams.length) return teams;
  }
  return [{ id:COOP_TEAM, name:'Drużyna', color:teamColor(0), members:ps.map(p=>p.id) }];   // coop (domyślny)
}

/* F1 (#2): podział hosta z sieci → bezpieczne drużyny. Host NIE jest zaufany (dowolny klient może
 * wysłać `start`): kolor tylko hex (inaczej paleta teamColor(i) — `red" onmouseover=…` nie trafi do
 * style=), nazwa = tekst przycięty do TEAM_NAME_MAX, id = /^t\d{1,2}$/ (unikalne), members = tylko
 * OBECNI gracze, każdy gracz w max JEDNEJ drużynie (pierwsze przypisanie wygrywa). Puste drużyny
 * i nadmiar ponad TEAMS_MAX odpadają. */
export const TEAMS_MAX = 8;
export const TEAM_NAME_MAX = 14;
export function sanitizeAssignments(assignments, players){
  const present = new Set((players||[]).map(p=>p && p.id).filter(Boolean));
  const taken = new Set(), ids = new Set(), out = [];
  for(const a of (Array.isArray(assignments)?assignments:[]).slice(0, TEAMS_MAX)){
    if(!a || typeof a!=='object') continue;
    const i = out.length;
    let id = (typeof a.id==='string' && /^t\d{1,2}$/.test(a.id)) ? a.id : 't'+i;
    if(ids.has(id)) id = 't'+i+'_';                   // kolizja id → wymuś unikalny
    if(ids.has(id)) continue;
    const members = (Array.isArray(a.members)?a.members:[])
      .filter(m=>typeof m==='string' && present.has(m) && !taken.has(m));
    if(!members.length) continue;
    members.forEach(m=>taken.add(m)); ids.add(id);
    out.push({ id, name: clipText(a.name, TEAM_NAME_MAX) || ('Drużyna '+(i+1)),
               color: safeColor(a.color, teamColor(i)), members });
  }
  return out;
}

/* puste buckety stanu odpowiedzi per drużyna — wołane przy starcie meczu i resecie rundy */
export function emptyByTeam(teams){
  const o={}; (teams||[]).forEach(t=>{ o[t.id]={proposals:[],votes:{},sure:[],passed:[]}; }); return o;
}

/* dopisz OBECNEGO gracza bez drużyny do składu (późne wejście / powrót). Mutuje game.teams/scores; zwraca true,
 * gdy skład się zmienił. Gracz już w jakiejś drużynie → bez zmian (powrót po reconnect zachowuje drużynę).
 * coop:  do jedynej drużyny 'all'.
 * solo:  nowa 1-os. drużyna (id = id gracza).
 * teams: do NAJMNIEJSZEJ drużyny (remis → pierwsza) — podział hosta dla obecnych zostaje nietknięty.
 *        Dawniej późny gracz był „widzem do rewanżu": jego typy reducer odrzucał po cichu (teamOf=null),
 *        a baner obiecywał „dołączysz od następnego pytania" — host nie widział jego odpowiedzi przez cały mecz. */
export function joinTeam(game, player){
  if(!game || !player || !player.id) return false;
  const id = player.id;
  game.teams = game.teams || [];
  game.scores = game.scores || {};
  if(game.teams.some(t=>(t.members||[]).includes(id))) return false;
  const fmt = game.format || 'coop';
  let t = null;
  if(fmt==='solo'){
    if(game.teams.some(x=>x.id===id)) return false;          // anty-kolizja id (nie powinno się zdarzyć)
    t = { id, name:clipText(player.name, 40) || 'gracz', color:teamColor(game.teams.length), members:[] };
    game.teams.push(t);
  } else if(fmt==='teams'){
    if(!game.teams.length) return false;                      // brak podziału — nie wymyślamy drużyn
    t = game.teams.reduce((a,b)=> ((b.members||[]).length < (a.members||[]).length ? b : a));
  } else {
    t = game.teams[0];
    if(!t){ t = { id:COOP_TEAM, name:'Drużyna', color:teamColor(0), members:[] }; game.teams.push(t); }
  }
  t.members = t.members || [];
  t.members.push(id);
  if(game.scores[t.id]==null) game.scores[t.id]=0;
  return true;
}

/* uzgodnij skład drużyn z AKTUALNYM presence (dołączenia/wyjścia między rundami).
 * Mutuje game.teams i game.scores w miejscu; NIE rusza byTeam (caller resetuje go osobno).
 * coop:  drużyna 'all' = wszyscy obecni.
 * solo:  dorzuć brakujących jako nowe 1-os. drużyny; nieobecnych zostaw (wynik historyczny).
 * teams: podział hosta ZOSTAJE (nikogo nie przenosimy); późny gracz bez drużyny → do najmniejszej (joinTeam). */
export function reconcileTeams(game, players){
  if(!game) return;
  const ps = players || [];
  game.teams = game.teams || [];
  game.scores = game.scores || {};
  if(game.format==='solo' || game.format==='teams'){
    ps.forEach(p=>joinTeam(game, p));
  } else {   // coop → jedna drużyna ze wszystkimi obecnymi
    const t = game.teams[0] || { id:COOP_TEAM, name:'Drużyna', color:teamColor(0), members:[] };
    t.members = ps.map(p=>p.id);
    game.teams = [t];
  }
  game.teams.forEach(t=>{ if(game.scores[t.id]==null) game.scores[t.id]=0; });
}

/* P0-5 (przegląd MP 2026-10): ranking z REMISAMI — wspólne miejsce przy równych punktach (1, 1, 3) i flaga `tie`
 * (remis na czele). Dawniej 0:0 ogłaszało „X wygrywa!" (pierwszy po sortowaniu). Kolejność remisujących = jak w `teams`.
 * → { rows:[{id,name,color,score,place}], tie, winner (null przy remisie / braku drużyn) } */
export function standings(teams, scores){
  const sc = scores || {};
  const rows = (teams || []).map((t, i)=>({ id:t.id, name:t.name, color:t.color, score:Number(sc[t.id])||0, i }))
    .sort((a, b)=> b.score - a.score || a.i - b.i);
  let place = 0;
  rows.forEach((r, k)=>{ if(k===0 || r.score!==rows[k-1].score) place = k+1; r.place = place; delete r.i; });
  const tie = rows.length>1 && rows[0].score===rows[1].score;
  return { rows, tie, winner: rows.length && !tie ? rows[0] : null };
}
