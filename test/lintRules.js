/* test/lintRules.js — czyste reguły lintu paczek (wspólne: test/lint-data.js + testy w test/run.js).
 * Łamigłówki (group:'lamiglowki'): drabinka „Jedna litera różnicy" i pola odsłuchu/rebusu. */
import { textMatch } from '../core/scoring.js';

// „Jedna litera różnicy": porównanie bez wielkości liter, ZE spacjami i polskimi znakami (ą≠a — to inna litera),
// po znakach (code points). Dokładnie jedna podmiana, ta sama długość (bez wstawiania/usuwania liter).
export function oneLetterApart(a, b){
  const x = Array.from(String(a || '').toLocaleLowerCase('pl'));
  const y = Array.from(String(b || '').toLocaleLowerCase('pl'));
  if(!x.length || x.length !== y.length) return false;
  let diff = 0;
  for(let i = 0; i < x.length; i++) if(x[i] !== y[i] && ++diff > 1) return false;
  return diff === 1;
}

// błędy drabinki dla pytania: kanoniczne odpowiedzi kolejnych slotów (answers[k][0]) slot1↔slot2, slot2↔slot3…
export function ladderErrors(q){
  const keys = (Array.isArray(q && q.slots) ? q.slots : []).map(s => s && s.key).filter(Boolean);
  const can = keys.map(k => (q.answers && Array.isArray(q.answers[k]) ? q.answers[k][0] : '') || '');
  const out = [];
  if(keys.length < 2) out.push(`drabinka wymaga ≥2 slotów (jest ${keys.length})`);
  for(let i = 0; i + 1 < can.length; i++){
    if(!oneLetterApart(can[i], can[i + 1])) out.push(`„${can[i]}" → „${can[i + 1]}" nie różnią się dokładnie jedną literą`);
  }
  // silnik oceny toleruje literówki (core/scoring.textMatch: 1 litera od 6 znaków) — hasło sąsiada wpisane
  // w zły slot NIE może się zaliczyć (inaczej drabinka sama się rozwiązuje). Sprawdzamy wszystkie warianty.
  const vars = keys.map(k => (q.answers && Array.isArray(q.answers[k]) ? q.answers[k] : []).filter(v => typeof v === 'string'));
  for(let i = 0; i < vars.length; i++) for(let j = 0; j < vars.length; j++){
    if(i === j) continue;
    const hit = vars[i].find(g => vars[j].some(v => textMatch(g, v)));
    if(hit && i < j) out.push(`„${hit}" (slot ${i + 1}) zalicza się też w slocie ${j + 1} (tolerancja literówek) — skróć hasła do ≤5 znaków`);
  }
  return out;
}

const isTrack = (t) => !!(t && typeof t === 'object' && !Array.isArray(t) &&
  typeof t.title === 'string' && t.title.trim() && typeof t.artist === 'string' && t.artist.trim());

// błędy pól łamigłówek: display (tylko 'rebus' i wtedy wymagany track), partial (bool), track/tracks (kształt)
export function puzzleFieldErrors(q){
  const out = [];
  if(!q) return out;
  if(q.display !== undefined && q.display !== 'rebus') out.push(`display=${JSON.stringify(q.display)} (dozwolone tylko 'rebus')`);
  if(q.display === 'rebus' && !isTrack(q.track)) out.push('rebus (display:"rebus") bez poprawnego track {title, artist}');
  if(q.partial !== undefined && typeof q.partial !== 'boolean') out.push('partial musi być true/false');
  if(q.track !== undefined && !isTrack(q.track)) out.push('track ≠ {title, artist} (niepuste stringi)');
  if(q.tracks !== undefined){
    const n = Array.isArray(q.slots) ? q.slots.length : 0;
    if(!Array.isArray(q.tracks) || !q.tracks.length) out.push('tracks musi być niepustą listą');
    else {
      if(q.tracks.length > 3) out.push(`tracks ma ${q.tracks.length} elementów (max 3)`);
      if(n && q.tracks.length > n) out.push(`tracks (${q.tracks.length}) dłuższe niż sloty (${n})`);
      q.tracks.forEach((t, i) => { if(t !== null && !isTrack(t)) out.push(`tracks[${i}] ≠ {title, artist} | null`); });
      if(q.tracks.every(t => t === null)) out.push('tracks bez żadnego utworu (same null)');
    }
  }
  return out;
}
