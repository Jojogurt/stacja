/* core/teams.js — czysty generator DRUŻYN multiplayera (zero DOM / sieci).
 * Tryby konkurencyjne sprowadzają się do RÓŻNEGO składu `game.teams`:
 *   - 'coop'  → JEDNA drużyna ze wszystkimi (obecny tryb),
 *   - 'solo'  → N drużyn 1-osobowych (każdy gracz osobno),
 *   - 'teams' → host dzieli graczy na drużyny (Faza 2; `assignments`).
 * Reszta rdzenia (reducer/selektory/ocena) pracuje JEDNOLICIE na `teamId` — nie zna formatu. */

// paleta kolorów drużyn (te same odcienie co awatary w widoku — VOTE_COLORS)
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
    return assignments.map((a,i)=>({ id:a.id, name:a.name||('Drużyna '+(i+1)), color:a.color||teamColor(i), members:(a.members||[]).slice() }));
  }
  return [{ id:COOP_TEAM, name:'Drużyna', color:teamColor(0), members:ps.map(p=>p.id) }];   // coop (domyślny)
}

/* puste buckety stanu odpowiedzi per drużyna — wołane przy starcie meczu i resecie rundy */
export function emptyByTeam(teams){
  const o={}; (teams||[]).forEach(t=>{ o[t.id]={proposals:[],votes:{},sure:[],passed:[]}; }); return o;
}

/* uzgodnij skład drużyn z AKTUALNYM presence (dołączenia/wyjścia między rundami).
 * Mutuje game.teams i game.scores w miejscu; NIE rusza byTeam (caller resetuje go osobno).
 * coop:  drużyna 'all' = wszyscy obecni.
 * solo:  dorzuć brakujących jako nowe 1-os. drużyny; nieobecnych zostaw (wynik historyczny).
 * teams: skład ZAMROŻONY przy starcie (host go ułożył) — nie ruszamy members; późny gracz
 *        bez drużyny gra jako widz do rewanżu (teamOf=null → akcje ignorowane). */
export function reconcileTeams(game, players){
  if(!game) return;
  const ps = players || [];
  game.teams = game.teams || [];
  game.scores = game.scores || {};
  if(game.format==='solo'){
    const have = new Set(game.teams.map(t=>t.id));
    ps.forEach(p=>{ if(!have.has(p.id)){ game.teams.push({ id:p.id, name:p.name||'gracz', color:teamColor(game.teams.length), members:[p.id] }); have.add(p.id); } });
  } else if(game.format==='teams'){
    /* skład zamrożony — bez zmian members */
  } else {   // coop → jedna drużyna ze wszystkimi obecnymi
    const t = game.teams[0] || { id:COOP_TEAM, name:'Drużyna', color:teamColor(0), members:[] };
    t.members = ps.map(p=>p.id);
    game.teams = [t];
  }
  game.teams.forEach(t=>{ if(game.scores[t.id]==null) game.scores[t.id]=0; });
}
