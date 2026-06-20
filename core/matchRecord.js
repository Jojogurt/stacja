/* core/matchRecord.js — czysty builder payloadu do record_match (zero DOM/sieci).
 * Reużywany: klient w Etapie 1, Durable Object w Etapie 2 (host pisze mecz). */
import { QPC } from './match.js';

// SOLO: wynik = liczba w pełni trafionych (tytuł+wykonawca)
export function buildSoloRecord({ results, slots, config, profileId, displayName }){
  const total = (slots ? slots.length : 0) * QPC;
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

// MP: drużynowy wynik na meczu; per gracz liczymy jego trafne typy (tally) — to jest
// jego wkład do ligi. Odpowiedzi zapisujemy drużynowo (profile_id null).
export function buildMpRecord({ game, tally, members, hostId, roomCode }){
  const total = (game.slots ? game.slots.length : 0) * QPC;
  const t = tally || {};
  return {
    mode: 'mp',
    room_code: roomCode || null,
    host_id: hostId || null,
    score: game.score || 0,
    total_questions: total,
    config: { rounds: game.rounds },
    participants: (members || []).map(m => ({
      profile_id: m.id, display_name: m.name,
      role: m.id === hostId ? 'host' : 'player',
      score: (t[m.id] && t[m.id].correct) || 0,
      correct_count: (t[m.id] && t[m.id].correct) || 0,
    })),
    answers: (game.results || []).map((r, i) => ({
      q_no: i + 1, cat_key: r.cat || '', mode: r.mode || '',
      track: r.track, artist: r.artist, ok: !!r.ok, profile_id: null,
    })),
  };
}
