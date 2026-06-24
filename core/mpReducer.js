/* core/mpReducer.js — czysta logika multiplayera (host = źródło prawdy).
 * Zero DOM / sieci / Supabase — to jest „reduce" host-authority z analizy:
 * akcje gracza → nowy stan gry. Efekty (broadcast/render/audio) zostają w app.js.
 *
 * MODEL ODPOWIEDZI = SLOTY (uogólnienie tytuł/wykonawca → N pól):
 *   - answerSlots: [{key,label}]   — definicja pól odpowiedzi dla pytania
 *   - proposal:    {id, by, byName, conf, values:{[slotKey]:string}}
 *   - votes:       {[slotKey]: {[voterId]: wartość}}   — jeden głos na osobę PER slot
 * Odpowiedź drużyny = górka głosów w każdym slocie (miks najlepszych pól). */
import { textMatch, norm } from './scoring.js';
import { MP } from './phases.js';

const rid = () => Math.random().toString(36).slice(2,8);

/* —— definicja slotów odpowiedzi (jedno źródło prawdy: render + scoring + composer) ——
 * Dziś zawsze tytuł+wykonawca; przyszłe tryby (np. uzupełnij słowa) zwrócą inne sloty. */
export function slotsFor(/* mode, cat */){
  return [ {key:'title', label:'tytuł'}, {key:'artist', label:'wykonawca'} ];
}
// mapowanie klucza slotu → pole w obiekcie utworu (current) do oceny
export const SLOT_FIELD = { title:'track', artist:'artist' };
const DEFAULT_SLOTS = slotsFor();
const slotsOf = (game)=> (game && game.answerSlots) || DEFAULT_SLOTS;

// „mocniejsza" pewność wygrywa przy tagu kandydata (sure > unsure)
function markConf(entry, conf){
  if(conf==='sure') entry.sawSure=true;
  else if(conf==='unsure') entry.sawUnsure=true;
  else entry.sawNormal=true;
}

/* ---- reducer akcji w fazie gry (propose/unpropose/vote/sure/pass) ----
 * Mutuje `game` w miejscu (broadcast wysyła tę samą referencję) i zwraca
 * `true`, gdy akcja coś zmieniła — wtedy caller robi broadcast+render. */
export function reduceAction(game, a){
  if(!game || game.phase!==MP.PLAY) return false;
  const slots = slotsOf(game);
  switch(a.type){
    case 'propose': {
      const values = a.values || {};
      const clean = {};
      slots.forEach(s=>{ const v=(values[s.key]||'').trim(); if(v) clean[s.key]=v; });
      if(!Object.keys(clean).length) return false;          // pusty typ odrzucony
      game.proposals.push({ id:rid(), aid:a.aid, by:a.by, byName:a.byName, conf:a.conf||'normal', values:clean });
      // auto-głos: wrzucając typ głosuję własną wartością w każdym wypełnionym slocie
      game.votes = game.votes || {};
      slots.forEach(s=>{ const v=clean[s.key]; if(v){ (game.votes[s.key]=game.votes[s.key]||{})[a.by]=v; } });
      return true;
    }
    case 'unpropose':                                        // tylko autor usuwa swoją
      game.proposals = game.proposals.filter(p=>!(p.id===a.pid && p.by===a.by));
      return true;
    case 'vote': {                                           // głos na (slot, wartość); ponowny = wycofanie
      if(!a.slot) return false;
      game.votes = game.votes || {};
      const sv = game.votes[a.slot] = game.votes[a.slot] || {};
      if(sv[a.by] === a.value) delete sv[a.by]; else sv[a.by] = a.value;
      return true;
    }
    // „pewniak" nie jest osobnym zakładem — to typ z conf='sure' (pewniacy liczeni z proposals)
    case 'pass': {                                           // toggle „pasu" (już nic nie dodam)
      game.passed = game.passed || [];
      const i=game.passed.findIndex(p=>p.id===a.by);
      if(i>=0) game.passed.splice(i,1); else game.passed.push({ id:a.by, name:a.byName });
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

/* ---- selektory (czyste) ---- */
// kandydaci na dany slot: deduplikacja po norm, liczba głosów + tag pewności
export function candidatesForSlot(game, slotKey){
  if(!game) return [];
  const byNorm = new Map();   // normKey → {value, voters:Set, sawSure, sawUnsure, sawNormal}
  const get=(val)=>{ const k=norm(val); if(!k) return null;
    let e=byNorm.get(k); if(!e){ e={value:val, voters:new Set()}; byNorm.set(k,e); } return e; };
  (game.proposals||[]).forEach(p=>{
    const v=(p.values&&p.values[slotKey]||'').trim(); if(!v) return;
    const e=get(v); if(e) markConf(e, p.conf);
  });
  const sv=(game.votes&&game.votes[slotKey])||{};
  Object.entries(sv).forEach(([voter,val])=>{ const e=get(val); if(e) e.voters.add(voter); });
  return [...byNorm.values()].map(e=>({
    value:e.value, votes:[...e.voters],
    tag: e.sawSure ? 'sure' : (e.sawUnsure && !e.sawNormal ? 'unsure' : null),
  })).sort((a,b)=>b.votes.length-a.votes.length);
}
// odpowiedź drużyny = górka głosów w każdym slocie (''-jeśli nikt nie zagłosował)
export function teamAnswer(game){
  const out={};
  slotsOf(game).forEach(s=>{ const c=candidatesForSlot(game, s.key); out[s.key] = (c.length && c[0].votes.length) ? c[0].value : ''; });
  return out;
}
// na co zagłosowałem w danym slocie (wartość) — do podświetlenia
export function myVoteForSlot(game, slotKey, myId){
  return (game && game.votes && game.votes[slotKey] && game.votes[slotKey][myId]) || null;
}
// stan gracza do paska osób (priorytet: pas > pewny > niepewny > wrzucił > pisze > myśli)
export function rosterState(game, id, typingSet){
  if(!game) return 'idle';
  if((game.passed||[]).some(p=>p.id===id)) return 'pass';
  const mine=(game.proposals||[]).filter(p=>p.by===id);
  if(mine.some(p=>p.conf==='sure')) return 'sure';
  if(mine.length && mine.every(p=>p.conf==='unsure')) return 'unsure';
  if(mine.length) return 'ans';
  if(typingSet && typingSet.has && typingSet.has(id)) return 'type';
  return 'idle';
}

/* ---- ocena odpowiedzi drużyny (dawne wnętrze mpLock) — czysta ----
 * `locked` domyślnie składany per slot z odpowiedzi drużyny (górka głosów).
 * Zwraca obiekt reveal + wyliczenia, które app.js nakłada na stan/tally.
 * Kształt reveal/result zachowany wstecznie (PR1: sloty zawsze title+artist). */
export function evaluateAnswer(game, current, locked, match=textMatch){
  locked = locked || teamAnswer(game);
  const slots = slotsOf(game);
  const fieldVal = (key)=> current[SLOT_FIELD[key]] || '';
  const okBySlot = {};
  slots.forEach(s=>{ okBySlot[s.key] = match(locked[s.key]||'', fieldVal(s.key)); });
  const teamOk = slots.every(s=>okBySlot[s.key]);
  const okTitle = !!okBySlot.title, okArtist = !!okBySlot.artist;

  // pewniacy = autorzy typów oznaczonych jako „pewniak" (conf='sure'), bez duplikatów
  const pewniacy=[], seenSure=new Set();
  for(const p of (game.proposals||[])){ if(p.conf==='sure' && !seenSure.has(p.by)){ seenSure.add(p.by); pewniacy.push(p.byName); } }
  const anySure = pewniacy.length>0;
  const gained = teamOk ? (anySure?2:1) : 0;

  // kto PIERWSZY zaproponował komplet trafnych slotów (bonus/MVP)
  let firstBy=null, firstById=null;
  for(const p of (game.proposals||[])){
    if(slots.every(s=> match((p.values&&p.values[s.key])||'', fieldVal(s.key)))){ firstBy=p.byName; firstById=p.by; break; }
  }

  const reveal = {
    track:current.track, artist:current.artist, year:current.year, album:current.album, art:current.art,
    okTitle, okArtist, okBySlot, teamOk, locked:{ title:locked.title||'', artist:locked.artist||'' }, firstBy,
    pewniacy, gained, pewniakWin: teamOk&&anySure, pewniakLose: !teamOk&&anySure,
  };
  return {
    reveal, gained, teamOk, anySure, pewniacy, firstBy, firstById,
    result: { round:game.round, cat:game.catKey, mode:game.mode, track:current.track, artist:current.artist, ok:teamOk },
  };
}
