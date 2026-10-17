/* core/picker.js — czysta logika „ułóż mecz" (zero DOM).
 * Wspólna dla pickera solo i hosta MP: wybór kategorii/trybów + podsumowanie.
 * Stan (które Set, jak renderować) zostaje w app.js — tu są decyzje. */
import { buildMatch, modesFor, QPC, CPR, clampQuestions } from './match.js';

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

/* Łamigłówki: kategorie quizu z polem `group:'lamiglowki'` mają w pickerze (solo i MP) własny chip „🧩 Łamigłówki"
 * zamiast „Wiedza". Kostka 🎲 ich nie losuje — core/match.randomPools pomija całe kind:'quiz' (świadomy wybór). */
export const PUZZLE_GROUP = 'lamiglowki';
export const isPuzzleCat = (cat) => !!(cat && cat.group === PUZZLE_GROUP);
// klucze quizu podzielone na grupy pickera: 'lamiglowki' → łamigłówki, inaczej (wiedza) → reszta
export function quizGroupKeys(keys, allCats, group){
  const puzzle = group === PUZZLE_GROUP;
  return (keys || []).filter(k => isPuzzleCat(allCats && allCats[k]) === puzzle);
}

// grupa aktywna, gdy choć jeden jej klucz jest wybrany
export function grpActive(keys, picked){
  return keys.some(k => picked.has(k));
}

// tryby, w których „pytanie" to utwór do rozpoznania ze słuchu (reszta: lektor/quiz = pytania)
const AUDIO_MODES = ['music', 'reverse', 'snippet', 'intro', 'abcd', 'year', 'revsnip', 'medley'];   // F8a: + intro/abcd/rok; EKSPERYMENT: + od tyłu krótko/składanka (okładka liczy się jako „pytania")

// podsumowanie meczu: {error} przy braku/niekompatybilności, inaczej liczba pytań.
// F2a: `cats` = FAKTYCZNIE grywalne wybrane kategorie (kompatybilne z którymś trybem), `unit` =
// „utworów" tylko gdy cała pula to audio; z quizem/lektorem → „pytań".
// `len` = liczba rund (stary format: rundy×CPR×QPC) ALBO F6a {questions} (długość meczu w pytaniach).
export function pickSummary(cats, modes, len, allCats){
  if(!cats.size || !modes.size) return { error: 'zaznacz kategorie i tryby' };
  const r = buildMatch([...cats], [...modes], len, allCats);
  if(r.error) return { error: r.error };
  const playable = [...cats].filter(k => modesFor(k, allCats).some(m => modes.has(m)));
  const usedModes = new Set();
  playable.forEach(k => modesFor(k, allCats).forEach(m => { if(modes.has(m)) usedModes.add(m); }));
  const audioOnly = [...usedModes].every(m => AUDIO_MODES.includes(m));
  const unit = audioOnly ? 'utworów' : 'pytań';
  if(len && typeof len==='object'){
    const questions = clampQuestions(len.questions);
    // P1-7: krótki mecz (qpc 1) — każde pytanie osobnym slotem (kategorie i tryby na przemian)
    const qpc = r.qpc || QPC;
    return { count: questions, questions, blocks: questions/qpc, qpc, mixed: qpc===1, rounds: r.rounds, cats: playable.length,
      modes: usedModes.size, unit };
  }
  const rounds = len;
  return { count: rounds * CPR * QPC, rounds, label: plPick(rounds, 'runda', 'rundy', 'rund'),
    cats: playable.length, unit };
}

// F2a: tekst podsumowania pickera (bez HTML) — wspólny kształt; liczba wybranych kategorii jest prawdziwa
// („z 1 kategorii" przy powtórkach zamiast udawania 3 różnych kategorii)
export function pickSummaryText(s){
  if(!s || s.error) return { head: '', total: '', from: '' };
  if(s.questions && s.mixed){   // P1-7: krótki mecz — pytania z różnych kategorii/trybów na przemian
    const from = s.cats > 1 ? ` · na przemian z ${s.cats} ${plPick(s.cats, 'kategorii', 'kategorii', 'kategorii')}` : ' · z 1 kategorii';
    return { head: `${s.count} × 1 pytanie = `, total: `${s.count} ${s.unit}`, from };
  }
  if(s.questions){   // F6a: długość w pytaniach — N bloków (kategorii) po QPC pytań
    const b = s.blocks;
    const blocks = s.cats >= b ? `${b} ${plPick(b, 'kategoria', 'kategorie', 'kategorii')}` : `${b} ${plPick(b, 'blok', 'bloki', 'bloków')}`;
    const from = s.cats > b ? ` · losowane z ${s.cats} wybranych`
      : s.cats < b ? ` · z ${s.cats} ${plPick(s.cats, 'kategorii', 'kategorii', 'kategorii')} (powtarzane)` : '';
    return { head: `${blocks} × ${QPC} pytań = `, total: `${s.count} ${s.unit}`, from };
  }
  const blocks = s.cats >= CPR ? `${CPR} ${plPick(CPR, 'kategoria', 'kategorie', 'kategorii')}` : `${CPR} bloki`;
  const from = s.cats > CPR ? ` · losowane z ${s.cats} wybranych`
    : s.cats < CPR ? ` · z ${s.cats} ${plPick(s.cats, 'kategorii', 'kategorii', 'kategorii')} (powtarzane)` : '';
  return { head: `${s.rounds} ${s.label} × ${blocks} × ${QPC} pytań = `, total: `${s.count} ${s.unit}`, from };
}

/* F6a (R-F1): pula „hitów" do „Graj teraz" — preferowane klucze, które ISTNIEJĄ w runtime i grają muzykę
 * (dane rozbudowywane równolegle — fallback: dekady z muzyką, potem dowolne kategorie muzyczne). */
export const QUICK_PREFERRED = ['80s', '90s', '00s', 'evergreen-pl', 'rock-pl', 'pop-world'];
export function quickPool(allCats, preferred = QUICK_PREFERRED, fallbackKeys = null){
  const musical = k => modesFor(k, allCats).includes('music');
  const pref = preferred.filter(k => allCats[k] && musical(k));
  if(pref.length) return pref;
  const fb = (fallbackKeys || Object.keys(allCats)).filter(k => allCats[k] && musical(k));
  return fb.slice(0, 6);
}
/* F6a: zapamiętana pula pickera (localStorage robi app/) — sanityzacja: tylko istniejące klucze/znane tryby */
export function restorePick(saved, allCats, allModes){
  const o = (saved && typeof saved==='object') ? saved : {};
  const cats = Array.isArray(o.cats) ? o.cats.filter(k => typeof k==='string' && allCats[k]) : [];
  const modes = Array.isArray(o.modes) ? o.modes.filter(m => allModes.includes(m)) : [];
  return { cats, modes, questions: o.questions==null ? null : clampQuestions(o.questions) };
}
