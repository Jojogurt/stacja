/* core/picker.js — czysta logika „ułóż mecz" (zero DOM).
 * Wspólna dla pickera solo i hosta MP: wybór kategorii/trybów + podsumowanie.
 * Stan (które Set, jak renderować) zostaje w app.js — tu są decyzje. */
import { buildMatch, QPC, CPR } from './match.js';

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

// podsumowanie meczu: {error} przy braku/niekompatybilności, inaczej liczba utworów
export function pickSummary(cats, modes, rounds, allCats){
  if(!cats.size || !modes.size) return { error: 'zaznacz kategorie i tryby' };
  const r = buildMatch([...cats], [...modes], rounds, allCats);
  if(r.error) return { error: r.error };
  return { count: rounds * CPR * QPC, rounds, label: plPick(rounds, 'runda', 'rundy', 'rund') };
}
