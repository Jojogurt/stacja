/* core/mpReducer.js — czysta logika multiplayera (host = źródło prawdy).
 * Zero DOM / sieci / Supabase — to jest „reduce" host-authority z analizy:
 * akcje gracza → nowy stan gry. Efekty (broadcast/render/audio) zostają w app.js. */
import { textMatch } from './scoring.js';
import { MP } from './phases.js';

const rid = () => Math.random().toString(36).slice(2,8);

/* ---- reducer akcji w fazie gry (propose/unpropose/vote/sure) ----
 * Mutuje `game` w miejscu (broadcast wysyła tę samą referencję) i zwraca
 * `true`, gdy akcja coś zmieniła — wtedy caller robi broadcast+render. */
export function reduceAction(game, a){
  if(!game || game.phase!==MP.PLAY) return false;
  switch(a.type){
    case 'propose':
      if(!a.title && !a.artist) return false;
      game.proposals.push({ id:rid(), by:a.by, byName:a.byName, title:a.title||'', artist:a.artist||'', votes:[] });
      return true;
    case 'unpropose':                                  // tylko autor usuwa swoją
      game.proposals = game.proposals.filter(p=>!(p.id===a.pid && p.by===a.by));
      return true;
    case 'vote':
      game.proposals.forEach(p=>{ p.votes = p.votes.filter(v=>v!==a.by); });
      { const t=game.proposals.find(p=>p.id===a.pid); if(t && !t.votes.includes(a.by)) t.votes.push(a.by); }
      return true;
    case 'sure': {                                     // toggle „pewniaka"
      const i=game.sure.findIndex(s=>s.id===a.by);
      if(i>=0) game.sure.splice(i,1); else game.sure.push({ id:a.by, name:a.byName });
      return true;
    }
    case 'pass': {                                     // toggle „pasu" (już nic nie dodam)
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

/* ---- ocena odpowiedzi drużyny (dawne wnętrze mpLock) — czysta ----
 * Zwraca obiekt reveal + wyliczenia, które app.js nakłada na stan/tally. */
export function evaluateAnswer(game, current, locked, match=textMatch){
  const okTitle = match(locked.title, current.track);
  const okArtist = match(locked.artist, current.artist);
  const teamOk = okTitle && okArtist;
  const pewniacy = (game.sure||[]).map(s=>s.name);
  const anySure = pewniacy.length>0;
  const gained = teamOk ? (anySure?2:1) : 0;

  // kto PIERWSZY zaproponował trafny tytuł+wykonawcę (bonus/MVP)
  let firstBy=null, firstById=null;
  for(const p of game.proposals){
    if(match(p.title,current.track) && match(p.artist,current.artist)){ firstBy=p.byName; firstById=p.by; break; }
  }

  const reveal = {
    track:current.track, artist:current.artist, year:current.year, album:current.album, art:current.art,
    okTitle, okArtist, teamOk, locked:{ title:locked.title, artist:locked.artist }, firstBy,
    pewniacy, gained, pewniakWin: teamOk&&anySure, pewniakLose: !teamOk&&anySure,
  };
  return {
    reveal, gained, teamOk, anySure, pewniacy, firstBy, firstById,
    result: { round:game.round, cat:game.catKey, mode:game.mode, track:current.track, artist:current.artist, ok:teamOk },
  };
}

/* ---- selektory (czyste) ---- */
export function myVote(game, myId){
  if(!game || !game.proposals) return null;
  const p=game.proposals.find(p=>p.votes.includes(myId));
  return p?p.id:null;
}
export function topProposal(game){
  if(!game || !game.proposals || !game.proposals.length) return null;
  return [...game.proposals].sort((a,b)=>b.votes.length-a.votes.length)[0];
}
