/* core/matchRecord.js — czysty builder payloadu do record_match (zero DOM/sieci).
 * Reużywany: klient w Etapie 1, Durable Object w Etapie 2 (host pisze mecz). */
import { QPC } from './match.js';

// SOLO: wynik = liczba w pełni trafionych (tytuł+wykonawca)
// F2b (liga): total_questions = ROZEGRANE pytania (każde sprawdzone/pominięte pytanie = 1 wynik).
// Przerwany mecz („Zakończ" po 3 z 15) nie zapisuje pełnej długości meczu — inaczej zaniżał średnią.
// Cap: nigdy więcej niż sloty × QPC (gdy znamy sloty).
export function buildSoloRecord({ results, slots, config, profileId, displayName }){
  const full = (slots ? slots.length : 0) * QPC;
  const played = (results || []).length;
  const total = full ? Math.min(played, full) : played;
  const hits = results.filter(r => r.okTitle && r.okArtist).length;
  return {
    mode: 'solo',
    score: hits,
    total_questions: total,
    config: config || {},
    participants: [{
      profile_id: profileId, display_name: displayName || 'ja',
      role: 'player', score: hits, correct_count: hits,
    }],
    answers: results.map((r, i) => ({
      q_no: i + 1, cat_key: r.cat || '', mode: r.mode || '',
      track: r.track, artist: r.artist, ok: !!(r.okTitle && r.okArtist),
      profile_id: profileId,
    })),
  };
}

/* F2b (#8): historia UDZIAŁU w meczu MP — kto odpowiadał (typ/głos/pewniak/pas) w KTÓRYMKOLWIEK
 * pytaniu. Wołane przy zatwierdzeniu pytania (lock), zanim buckety zostaną wyczyszczone na następne.
 * Mutuje game.playedBy = {id: nazwa} (kumulatywnie). Liga liczy uczestników z tej historii, a nie
 * z obecnych przy DONE (gubiło tych, którym padła bateria; dopisywało widzów/TV z 0 pkt). */
export function noteAnswerers(game){
  if(!game || typeof game!=='object') return;
  const seen = game.playedBy = (game.playedBy && typeof game.playedBy==='object') ? game.playedBy : {};
  // id → nazwa (pierwsza niepusta wygrywa; głos/vote nie niesie nazwy → '' do czasu typu/pewniaka)
  const add = (id, name)=>{ if(typeof id!=='string' || !id) return; if(!seen[id]) seen[id] = name ? String(name).slice(0,40) : ''; };
  for(const b of Object.values(game.byTeam || {})){
    if(!b || typeof b!=='object') continue;
    (b.proposals || []).forEach(p=>p && add(p.by, p.byName));
    Object.values(b.votes || {}).forEach(sv=>{ if(sv && typeof sv==='object') Object.keys(sv).forEach(id=>add(id)); });
    (b.sure || []).forEach(p=>p && add(p.id, p.name));
    (b.passed || []).forEach(p=>p && add(p.id, p.name));
  }
}

// MP: drużynowy wynik na meczu; per gracz liczymy jego trafne typy (tally) — to jest
// jego wkład do ligi. Odpowiedzi zapisujemy drużynowo (profile_id null).
// F2b (#8): uczestnicy = kto ODPOWIADAŁ w meczu (game.playedBy ∪ tally), bez salon-hosta (TV);
// stary stan bez historii (playedBy brak) → jak dawniej: obecni przy DONE.
export function buildMpRecord({ game, tally, members, hostId, roomCode }){
  const total = (game.slots ? game.slots.length : 0) * QPC;
  const t = tally || {};
  const names = {}; (members || []).forEach(m=>{ if(m && m.id) names[m.id] = m.name; });
  const hist = (game.playedBy && typeof game.playedBy==='object') ? game.playedBy : null;
  const ids = hist ? new Set([ ...Object.keys(hist), ...Object.keys(t) ])
                   : new Set((members || []).map(m=>m && m.id).filter(Boolean));
  if(game.salon && hostId) ids.delete(hostId);   // TV w salonie prowadzi, nie gra
  const nameOf = (id)=> (t[id] && t[id].name) || (hist && hist[id]) || names[id] || 'gracz';
  // wynik meczu = wynik najlepszej drużyny (coop: jedyna drużyna; konkurencja: zwycięzca)
  const score = game.scores ? Math.max(0, ...Object.values(game.scores)) : (game.score || 0);
  return {
    mode: 'mp',
    room_code: roomCode || null,
    host_id: hostId || null,
    group_id: game.groupId || null,   // MVP-3: mecz „z drużyną" jest tagowany id drużyny (inaczej null)
    score,
    total_questions: total,
    config: { rounds: game.rounds },
    participants: [...ids].map(id => ({
      profile_id: id, display_name: nameOf(id),
      role: id === hostId ? 'host' : 'player',
      score: (t[id] && t[id].correct) || 0,
      correct_count: (t[id] && t[id].correct) || 0,
    })),
    answers: (game.results || []).map((r, i) => ({
      q_no: i + 1, cat_key: r.cat || '', mode: r.mode || '',
      track: r.track, artist: r.artist, ok: !!r.ok, profile_id: null,
    })),
  };
}
