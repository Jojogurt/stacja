/* core/phases.js — jawne maszyny stanów (czyste, zero DOM/Web API).
 * Zastępują rozsiane porównania `phase===` / `mode===` jedną tabelą przejść. */

// —— SOLO: idle → loading → playing → reveal → (loading | done) ——
export const SOLO = { IDLE:'idle', LOADING:'loading', PLAYING:'playing', REVEAL:'reveal', DONE:'done' };
const SOLO_NEXT = {
  idle:    ['loading'],
  loading: ['playing','idle'],          // sukces → playing, błąd/anulowanie → idle
  playing: ['reveal','loading','idle'], // sprawdź → reveal, pomiń → loading
  reveal:  ['loading','done','idle'],   // następne → loading, koniec meczu → done
  done:    ['idle','loading'],
};

// —— MULTIPLAYER (host = źródło prawdy) ——
export const MP = {
  NEW:'new', LOADING:'loading', ARMING:'arming', PLAY:'play',
  REVEAL:'reveal', DONE:'done', NETERR:'neterr', NOLYRIC:'nolyric',
};
const MP_NEXT = {
  new:     ['loading'],
  loading: ['arming','neterr','nolyric'],
  arming:  ['play','loading'],
  play:    ['reveal'],
  reveal:  ['loading','done'],
  done:    ['new','loading'],
  neterr:  ['loading','new'],
  nolyric: ['loading','new'],
};

function allows(table, from, to){
  if(from==null) return true;          // pierwszy stan zawsze dozwolony
  return (table[from]||[]).includes(to);
}

export const canTransitionSolo = (from,to)=> allows(SOLO_NEXT, from, to);
export const canTransitionMp    = (from,to)=> allows(MP_NEXT, from, to);

// guard nie-rzucający: loguje nielegalne przejście (łapie regresje), ale nie blokuje
// działania — refaktor ma być zachowawczy, nie wprowadzać nowych ścieżek błędu.
export function assertMp(from, to, warn){
  if(!canTransitionMp(from,to) && typeof warn==='function'){
    warn(`MP: nielegalne przejście ${from} → ${to}`);
  }
  return to;
}
