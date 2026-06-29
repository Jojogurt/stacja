/* core/mpReducer.js — czysta logika multiplayera (host = źródło prawdy).
 * Zero DOM / sieci / Supabase — to jest „reduce" host-authority z analizy:
 * akcje gracza → nowy stan gry. Efekty (broadcast/render/audio) zostają w app.js.
 *
 * MODEL ODPOWIEDZI = SLOTY (uogólnienie tytuł/wykonawca → N pól):
 *   - answerSlots: [{key,label}]   — definicja pól odpowiedzi dla pytania
 *   - proposal:    {id, by, byName, values:{[slotKey]:string}}
 *   - votes:       {[slotKey]: {[voterId]: wartość}}   — jeden głos na osobę PER slot
 * Odpowiedź drużyny = górka głosów w każdym slocie (miks najlepszych pól).
 *
 * PEWNIAK / PAS = niezależne per-gracz toggle (NIE są właściwością typu):
 *   - sure:   [{id,name}]   — kto postawił „pewniaka" (zakład ×2 dla CAŁEJ drużyny)
 *   - passed: [{id,name}]   — kto już nic nie doda
 * Działają dla każdego uczestnika — też dla osoby, która tylko głosowała, nie wrzuciła
 * własnego typu. Pewniak i pas wzajemnie się wykluczają (włączenie jednego gasi drugi).
 *
 * DRUŻYNY (tryby konkurencyjne) — stan odpowiedzi jest PER-DRUŻYNA:
 *   - teams:   [{id,name,color,members:[playerId]}]   — skład (coop=1 drużyna, solo=N×1)
 *   - byTeam:  {[teamId]: {proposals, votes, sure, passed}}   — izolowany bucket każdej drużyny
 *   - scores:  {[teamId]: liczba}                              — wynik per drużyna
 * Reducer routuje akcję do bucketu drużyny AKTORA (teamOf po a.by — anty-spoof). Selektory
 * dostają teamId i czytają tylko swój bucket. coop = jedna drużyna 'all' (ta sama ścieżka). */
import { textMatch, norm } from './scoring.js';
import { MP } from './phases.js';
import { COOP_TEAM } from './teams.js';

const rid = () => Math.random().toString(36).slice(2,8);

/* drużyna gracza (membership po a.by). Salon-host (sędzia) nie jest członkiem — w coop
 * sędziuje jedyną drużynę, więc dostaje teams[0]. Brak dopasowania → null (akcja ignorowana). */
export function teamOf(game, playerId){
  if(!game || !Array.isArray(game.teams)) return null;
  for(const t of game.teams){ if((t.members||[]).includes(playerId)) return t.id; }
  if(game.salon && playerId===game.hostId && game.teams.length) return game.teams[0].id;
  return null;
}
// bucket stanu odpowiedzi drużyny (lazy-init) — jedno źródło prawdy reducer/selektory
function bucketOf(game, teamId){
  game.byTeam = game.byTeam || {};
  return game.byTeam[teamId] || (game.byTeam[teamId] = { proposals:[], votes:{}, sure:[], passed:[] });
}
// tylko-do-odczytu bucket (selektory) — pusty placeholder, gdy drużyny jeszcze nie ma
const readBucket = (game, teamId)=> (game && game.byTeam && game.byTeam[teamId]) || { proposals:[], votes:{}, sure:[], passed:[] };

/* —— definicja slotów odpowiedzi (jedno źródło prawdy: render + scoring + composer) ——
 * Dziś zawsze tytuł+wykonawca; przyszłe tryby (np. uzupełnij słowa) zwrócą inne sloty. */
export function slotsFor(mode, cat, q){
  // pytanie z własnymi slotami (quiz, wiedza ogólna) → użyj ich; inaczej domyślne tytuł+wykonawca
  if(q && Array.isArray(q.slots) && q.slots.length) return q.slots;
  return [ {key:'title', label:'tytuł'}, {key:'artist', label:'wykonawca'} ];
}
// mapowanie klucza slotu → pole w obiekcie utworu (current) do oceny
export const SLOT_FIELD = { title:'track', artist:'artist' };
const DEFAULT_SLOTS = slotsFor();
const slotsOf = (game)=> (game && game.answerSlots) || DEFAULT_SLOTS;

/* ---- reducer akcji w fazie gry (propose/unpropose/vote/sure/pass) ----
 * Mutuje `game` w miejscu (broadcast wysyła tę samą referencję) i zwraca
 * `true`, gdy akcja coś zmieniła — wtedy caller robi broadcast+render. */
export function reduceAction(game, a){
  if(!game || game.phase!==MP.PLAY) return false;
  const teamId = teamOf(game, a.by);     // routuj do drużyny AKTORA (membership po wymuszonym a.by)
  if(!teamId) return false;              // gracz spoza drużyn (np. jeszcze nieprzydzielony) → ignoruj
  const bkt = bucketOf(game, teamId);
  const slots = slotsOf(game);
  switch(a.type){
    case 'propose': {
      const values = a.values || {};
      const clean = {};
      slots.forEach(s=>{ const v=(values[s.key]||'').trim(); if(v) clean[s.key]=v; });
      if(!Object.keys(clean).length) return false;          // pusty typ odrzucony
      bkt.proposals = (bkt.proposals||[]).filter(p=>p.by!==a.by);   // JEDNA odpowiedź na gracza — nowa zastępuje poprzednią
      bkt.proposals.push({ id:rid(), aid:a.aid, by:a.by, byName:a.byName, values:clean });
      // auto-głos: wrzucając typ głosuję własną wartością w każdym wypełnionym slocie
      slots.forEach(s=>{ const v=clean[s.key]; if(v){ (bkt.votes[s.key]=bkt.votes[s.key]||{})[a.by]=v; } });
      return true;
    }
    case 'unpropose':                                        // tylko autor usuwa swoją
      bkt.proposals = (bkt.proposals||[]).filter(p=>!(p.id===a.pid && p.by===a.by));
      return true;
    case 'vote': {                                           // głos na (slot, wartość); ponowny = wycofanie
      if(!a.slot) return false;
      const sv = bkt.votes[a.slot] = bkt.votes[a.slot] || {};
      // a.set = jawny WYBÓR (host „wybiera odpowiedź") → zawsze ustaw, bez przełączania.
      // Bez a.set → toggle (klik na własny głos = wycofanie), jak dotąd.
      if(a.set) sv[a.by] = a.value;
      else if(sv[a.by] === a.value) delete sv[a.by]; else sv[a.by] = a.value;
      return true;
    }
    case 'sure': {                                           // toggle „pewniaka" (zakład ×2) — per gracz, niezależny od typu/głosu
      const i=(bkt.sure||[]).findIndex(p=>p.id===a.by);
      if(i>=0){ bkt.sure.splice(i,1); }
      else { bkt.sure.push({ id:a.by, name:a.byName });
        bkt.passed = (bkt.passed||[]).filter(p=>p.id!==a.by); }     // pewniak gasi pas (przeciwne intencje)
      return true;
    }
    case 'pass': {                                           // toggle „pasu" (już nic nie dodam)
      const i=(bkt.passed||[]).findIndex(p=>p.id===a.by);
      if(i>=0){ bkt.passed.splice(i,1); }
      else { bkt.passed.push({ id:a.by, name:a.byName });
        bkt.sure = (bkt.sure||[]).filter(p=>p.id!==a.by); }         // pas gasi pewniaka
      return true;
    }
    default:
      return false;
  }
}

/* ---- liczenie gotowości w fazie „arming" (czyste) ---- */
export function countReady(expectedIds, readySet){
  const count = expectedIds.filter(id=>readySet.has(id)).length;
  return { count, total: expectedIds.length, all: expectedIds.length>0 && count===expectedIds.length };
}

/* ---- selektory (czyste) — każdy czyta bucket SWOJEJ drużyny (izolacja) ---- */
// kandydaci na dany slot W DRUŻYNIE: deduplikacja po norm, liczba głosów
export function candidatesForSlot(game, teamId, slotKey){
  if(!game) return [];
  const bkt=readBucket(game, teamId);
  const byNorm = new Map();   // normKey → {value, voters:Set}
  const get=(val)=>{ const k=norm(val); if(!k) return null;
    let e=byNorm.get(k); if(!e){ e={value:val, voters:new Set()}; byNorm.set(k,e); } return e; };
  (bkt.proposals||[]).forEach(p=>{
    const v=(p.values&&p.values[slotKey]||'').trim(); if(!v) return;
    get(v);
  });
  const sv=(bkt.votes&&bkt.votes[slotKey])||{};
  Object.entries(sv).forEach(([voter,val])=>{ const e=get(val); if(e) e.voters.add(voter); });
  return [...byNorm.values()].map(e=>({ value:e.value, votes:[...e.voters] }))
    .sort((a,b)=>b.votes.length-a.votes.length);
}
// odpowiedź DRUŻYNY = górka głosów w każdym slocie (''-jeśli nikt nie zagłosował).
// SALON: host (TV-sędzia) może nadpisać górkę — jego głos w slocie wygrywa z większością.
export function teamAnswer(game, teamId){
  const out={};
  const bkt=readBucket(game, teamId);
  const hostId = game && game.salon ? game.hostId : null;
  slotsOf(game).forEach(s=>{
    const c=candidatesForSlot(game, teamId, s.key);
    const pick = hostId && bkt.votes && bkt.votes[s.key] && bkt.votes[s.key][hostId];
    out[s.key] = pick || ((c.length && c[0].votes.length) ? c[0].value : '');
  });
  return out;
}
// na co zagłosowałem w danym slocie (wartość) — do podświetlenia
export function myVoteForSlot(game, teamId, slotKey, myId){
  const bkt=readBucket(game, teamId);
  return (bkt.votes && bkt.votes[slotKey] && bkt.votes[slotKey][myId]) || null;
}
// stan gracza do paska osób (priorytet: pas > pewniak > wrzucił typ > pisze > myśli)
export function rosterState(game, teamId, id, typingSet){
  if(!game) return 'idle';
  const bkt=readBucket(game, teamId);
  if((bkt.passed||[]).some(p=>p.id===id)) return 'pass';
  if((bkt.sure||[]).some(p=>p.id===id)) return 'sure';
  if((bkt.proposals||[]).some(p=>p.by===id)) return 'ans';
  if(typingSet && typingSet.has && typingSet.has(id)) return 'type';
  return 'idle';
}

/* ---- ocena JEDNEJ drużyny (dawne wnętrze mpLock) — czysta ----
 * locked = odpowiedź tej drużyny (górka głosów w jej buckecie). Zwraca per-drużyna wyliczenia. */
function evaluateTeam(game, teamId, current, match){
  const locked = teamAnswer(game, teamId);
  const bkt = readBucket(game, teamId);
  const slots = slotsOf(game);
  // QUIZ (wiedza ogólna): current.answers = {slot:[warianty]} → slot trafiony, gdy guess pasuje do
  // DOWOLNEGO wariantu. MUZYKA: porównanie z polem utworu (SLOT_FIELD). Ta sama funkcja match.
  const hasAnswers = !!(current && current.answers && typeof current.answers==='object');
  const slotOk = (key, guess)=> hasAnswers
    ? (current.answers[key]||[]).some(v=> match(guess||'', v))
    : match(guess||'', current[SLOT_FIELD[key]] || '');
  const okBySlot = {};
  slots.forEach(s=>{ okBySlot[s.key] = slotOk(s.key, locked[s.key]||''); });
  const teamOk = slots.every(s=>okBySlot[s.key]);
  const okTitle = !!okBySlot.title, okArtist = !!okBySlot.artist;
  // pewniacy = gracze drużyny, którzy postawili „pewniaka" (bkt.sure)
  const pewniacy = (bkt.sure||[]).map(p=>p.name);
  const anySure = pewniacy.length>0;
  const gained = teamOk ? (anySure?2:1) : 0;
  // kto PIERWSZY w drużynie zaproponował komplet trafnych slotów (bonus/MVP)
  let firstBy=null, firstById=null;
  for(const p of (bkt.proposals||[])){
    if(slots.every(s=> slotOk(s.key, (p.values&&p.values[s.key])||''))){ firstBy=p.byName; firstById=p.by; break; }
  }
  const lockedAll = {};
  slots.forEach(s=>{ lockedAll[s.key] = locked[s.key]||''; });
  return { okTitle, okArtist, okBySlot, teamOk, locked: lockedAll, firstBy, firstById,
    pewniacy, gained, anySure, pewniakWin: teamOk&&anySure, pewniakLose: !teamOk&&anySure };
}
/* ---- ocena CAŁEGO pytania: każda drużyna osobno + ranking — czysta ----
 * reveal niesie wspólne fakty utworu + `byTeam` (wynik każdej drużyny) + `ranking`.
 * Dla coop (1 drużyna) pola jedynej drużyny są SPŁASZCZONE na top-level reveal →
 * mpRenderRevealCard działa bez zmian (wsteczna zgodność). app.js nakłada scores/tally w pętli. */
export function evaluateAnswer(game, current, match=textMatch){
  const hasAnswers = !!(current && current.answers && typeof current.answers==='object');
  const slots = slotsOf(game);
  const teams = (game.teams && game.teams.length) ? game.teams : [{ id:COOP_TEAM, name:'Drużyna' }];
  const perTeam = {};
  teams.forEach(t=>{ perTeam[t.id] = evaluateTeam(game, t.id, current, match); });
  const ranking = teams.map(t=>({ teamId:t.id, name:t.name, color:t.color,
      gained: perTeam[t.id].gained, teamOk: perTeam[t.id].teamOk,
      score: ((game.scores&&game.scores[t.id])||0) + perTeam[t.id].gained }))
    .sort((a,b)=> b.score-a.score);
  const isCoop = (game.format||'coop')==='coop';
  const flat = isCoop ? perTeam[teams[0].id] : {};   // coop: spłaszcz pola jedynej drużyny
  const reveal = {
    track:current.track, artist:current.artist, year:current.year, album:current.album, art:current.art,
    kind: hasAnswers ? 'quiz' : 'music', prompt: current.prompt || '',
    slots, answers: hasAnswers ? current.answers : null,
    byTeam: perTeam, ranking,
    ...flat,   // coop → okTitle/okArtist/okBySlot/teamOk/locked/firstBy/pewniacy/gained/pewniakWin/pewniakLose
  };
  // wynik do ligi: 1 wpis/pytanie (kształt coop). ok = czy ZWYCIĘSKA drużyna trafiła.
  const anyOk = ranking.length ? !!ranking[0].teamOk : false;
  return {
    reveal, perTeam, ranking,
    result: { round:game.round, cat:game.catKey, mode:game.mode,
      track: hasAnswers ? (current.prompt||'') : current.track,
      artist: hasAnswers ? '' : current.artist, ok:anyOk },
  };
}
