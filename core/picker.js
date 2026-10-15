/* core/picker.js — czysta logika „ułóż mecz" (zero DOM).
 * Wspólna dla pickera solo i hosta MP: wybór kategorii/trybów + podsumowanie.
 * Stan (które Set, jak renderować) zostaje w app.js — tu są decyzje. */
import { buildMatch, modesFor, QPC, CPR } from './match.js';

// polska liczba mnoga: 1 → one, 2–4 (poza 12–14) → few, reszta → many
export function plPick(n, one, few, many){
  if(n === 1) return one;
  const t = n % 10, h = n % 100;
  return (t >= 2 && t <= 4 && !(h >= 12 && h <= 14)) ? few : many;
}

// przełącz przynależność klucza w zbiorze (multi-select)
export function togglePick(set, key){
  if(set.has(key)) set.delete(key); else set.add(key);
  return set;
}

// „zaznacz wszystko / odznacz wszystko": gdy komplet → wyczyść, inaczej dodaj wszystkie
export function toggleAllPick(allKeys, set){
  if(allKeys.length && allKeys.every(k => set.has(k))) set.clear();
  else allKeys.forEach(k => set.add(k));
  return set;
}

// czy zaznaczono komplet kluczy
export function allSelected(allKeys, set){
  return allKeys.length > 0 && allKeys.every(k => set.has(k));
}

// kategoria kind:'quiz' wymaga trybu 'quiz' (buildMatch) — trzymaj go automatycznie
export function syncQuizMode(cats, modes, allCats){
  const hasQuiz = [...cats].some(k => allCats[k] && allCats[k].kind === 'quiz');
  if(hasQuiz) modes.add('quiz'); else modes.delete('quiz');
  return modes;
}

// grupa aktywna, gdy choć jeden jej klucz jest wybrany
export function grpActive(keys, picked){
  return keys.some(k => picked.has(k));
}

// tryby, w których „pytanie" to utwór do rozpoznania ze słuchu (reszta: lektor/quiz = pytania)
const AUDIO_MODES = ['music', 'reverse', 'snippet'];

// podsumowanie meczu: {error} przy braku/niekompatybilności, inaczej liczba pytań.
// F2a: `cats` = FAKTYCZNIE grywalne wybrane kategorie (kompatybilne z którymś trybem), `unit` =
// „utworów" tylko gdy cała pula to audio; z quizem/lektorem → „pytań". Rund×CPR×QPC bez zmian
// (buildMatch zawsze układa CPR bloków na rundę — przy małej puli kategorie się powtarzają).
export function pickSummary(cats, modes, rounds, allCats){
  if(!cats.size || !modes.size) return { error: 'zaznacz kategorie i tryby' };
  const r = buildMatch([...cats], [...modes], rounds, allCats);
  if(r.error) return { error: r.error };
  const playable = [...cats].filter(k => modesFor(k, allCats).some(m => modes.has(m)));
  const usedModes = new Set();
  playable.forEach(k => modesFor(k, allCats).forEach(m => { if(modes.has(m)) usedModes.add(m); }));
  const audioOnly = [...usedModes].every(m => AUDIO_MODES.includes(m));
  return { count: rounds * CPR * QPC, rounds, label: plPick(rounds, 'runda', 'rundy', 'rund'),
    cats: playable.length, unit: audioOnly ? 'utworów' : 'pytań' };
}

// F2a: tekst podsumowania pickera (bez HTML) — wspólny kształt; liczba wybranych kategorii jest prawdziwa
// („z 1 kategorii" przy powtórkach zamiast udawania 3 różnych kategorii)
export function pickSummaryText(s){
  if(!s || s.error) return { head: '', total: '', from: '' };
  const blocks = s.cats >= CPR ? `${CPR} ${plPick(CPR, 'kategoria', 'kategorie', 'kategorii')}` : `${CPR} bloki`;
  const from = s.cats > CPR ? ` · losowane z ${s.cats} wybranych`
    : s.cats < CPR ? ` · z ${s.cats} ${plPick(s.cats, 'kategorii', 'kategorii', 'kategorii')} (powtarzane)` : '';
  return { head: `${s.rounds} ${s.label} × ${blocks} × ${QPC} pytań = `, total: `${s.count} ${s.unit}`, from };
}
