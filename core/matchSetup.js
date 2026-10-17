/* core/matchSetup.js — czysta logika ekranu „Nowy mecz" (zero DOM), wspólna dla solo i hosta MP
 * (komponent: app/matchSetup.js). Gotowce, filtr wyszukiwarki kategorii, stan trybów (rodziny +
 * kompatybilność + dostępność w MP), podsumowania i szkic konfiguracji MP dla gości (sanityzacja
 * wspólna z serwerem). Dane kategorii (`allCats`) wstrzykiwane parametrem. */
import { modesFor, ALL_MODES, MODE_FAMILIES, MODE_PICK_LABEL, MODE_SHORT, SOLO_ONLY_MODES, MP_FORMATS, clampQuestions } from './match.js';
import { clampTimer } from './timing.js';
import { plPick, pickSummary } from './picker.js';
import { clipText } from './util.js';
import { SHELF_PLAY_MIN, SHELF_QUESTIONS } from './tasteCompare.js';   // „Twój gust": gotowiec „Z mojej półki"

/* ===== GOTOWCE („Szybki start") — jedno tapnięcie = kategorie + tryby + długość =====
 * `cats`: lista kluczy ALBO funkcja (allCats) → klucze (np. „Z mojej półki" — pula z gustu gracza). Klucze, których nie ma w runtime, są pomijane; gotowiec bez żadnej kategorii jest ukryty.
 * `modes` przycinane do trybów dostępnych w kontekście (MP: bez solo-only / nieznanych serwerowi) i zgodnych
 * z kategoriami. `sub` — własny podpis; brak → lista trybów. Dopisanie gotowca = nowy obiekt w tablicy. */
export const PRESETS = [
  { id:'hity',  name:'Hity wszech czasów', cats:['80s','90s','00s','pop-world'],          modes:['music','intro','abcd'],         questions:15 },
  { id:'pl',    name:'Polska klasyka',     cats:['evergreen-pl','rock-pl','disco-polo'],  modes:['music','year'],                 questions:15 },
  { id:'dek',   name:'Lata 80 · 90 · 00',  cats:['80s','90s','00s'],                      modes:['music','timeline'],             questions:15 },
  { id:'lam',   name:'Łamigłówki',         cats:['rebusy','jedna-litera'],                modes:['quiz'],                         questions:15, sub:'rebusy i litery' },
  { id:'hard',  name:'Hardcore',           cats:['80s','90s','rock-world'],               modes:['reverse','revsnip','slowmo'],   questions:15, sub:'od tyłu i obroty' },
  // „Twój gust": pula z ❤️/👍 WŁASNEJ półki — kategoria tymczasowa SHELF_PRESET_KEY (app/solo.js rejestruje ją w ALL_CATS,
  // gdy półka ma ≥ SHELF_PLAY_MIN utworów). Tylko solo (MP ma „🎧 Gust stołu"); za mało → nieaktywny z podpowiedzią.
  { id:'polka', name:'Z mojej półki', ctx:'solo', cats:(allCats)=>shelfPresetKeys(allCats), modes:['music','abcd'], questions:SHELF_QUESTIONS,
    locked:(allCats, env)=>shelfPresetLock(allCats, env) },
];
export const SHELF_PRESET_KEY = 'polka-moja';
const shelfN = (allCats) => { const c = allCats && allCats[SHELF_PRESET_KEY]; return c && Array.isArray(c.songs) ? c.songs.length : 0; };
export function shelfPresetKeys(allCats){ return shelfN(allCats) >= SHELF_PLAY_MIN ? [SHELF_PRESET_KEY] : []; }
// env.shelf = ile polubionych utworów ma półka gracza (app) — podpowiedź „masz N"
export function shelfPresetLock(allCats, env = {}){
  if(shelfN(allCats) >= SHELF_PLAY_MIN) return '';
  const n = Math.max(0, Math.floor(Number(env && env.shelf)) || 0);
  return `polub min. ${SHELF_PLAY_MIN} utworów (❤️/👍) — masz ${n}`;
}

// gotowiec → konkretna pula w tym kontekście albo null (brak kategorii / żaden tryb nie pasuje).
// env: { ctx:'solo'|'mp', shelf } — gotowiec z `ctx` tylko w tym kontekście; `locked(allCats, env)` → niepusty tekst =
// gotowiec NIEAKTYWNY ({ disabled:true, sub:podpowiedź }, bez puli).
export function resolvePreset(p, allCats, available = ALL_MODES, env = {}){
  if(!p || !allCats) return null;
  if(p.ctx && (env || {}).ctx !== p.ctx) return null;
  if(typeof p.locked === 'function'){
    let lock = ''; try{ lock = p.locked(allCats, env || {}) || ''; }catch(_e){ lock = ''; }
    if(lock) return { id:p.id, name:p.name, sub:String(lock), cats:[], modes:[], questions:clampQuestions(p.questions), disabled:true };
  }
  let keys = [];
  try{ keys = typeof p.cats === 'function' ? p.cats(allCats) : p.cats; }catch(_e){ keys = []; }
  const cats = [...new Set((Array.isArray(keys) ? keys : []).filter(k => typeof k === 'string' && allCats[k]))];
  if(!cats.length) return null;
  const fits = (m) => available.includes(m) && cats.some(k => modesFor(k, allCats).includes(m));
  let modes = (p.modes || []).filter(fits);
  if(cats.some(k => allCats[k].kind === 'quiz') && !modes.includes('quiz') && fits('quiz')) modes.push('quiz');
  if(!modes.length && fits('music')) modes = ['music'];
  if(!modes.length) return null;
  const questions = clampQuestions(p.questions);
  const tail = p.sub || modes.filter(m => m !== 'quiz').map(m => MODE_SHORT[m] || m).join(', ') || MODE_PICK_LABEL.quiz;
  return { id:p.id, name:p.name, sub:`${questions} pyt · ${tail}`, cats, modes, questions };
}
export function presetsFor(allCats, available = ALL_MODES, list = PRESETS, env = {}){
  return list.map(p => resolvePreset(p, allCats, available, env)).filter(Boolean);
}
// czy bieżący wybór to dokładnie ten gotowiec (np. po odtworzeniu zapisanej puli)
export function presetMatches(r, cats, modes, questions){
  if(!r || r.disabled) return false;
  const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  return questions === r.questions && sameSet(new Set(cats), new Set(r.cats)) && sameSet(new Set(modes), new Set(r.modes));
}

/* ===== wyszukiwarka kategorii (filtruje WSZYSTKIE grupy) ===== */
// normalizacja zapytania/tekstu: małe litery, bez polskich znaków i diakrytyków, zwinięte spacje
export function normQuery(s){
  return String(s == null ? '' : s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
// groups: [{id,label,keys}] → [{key, group}] (bez duplikatów; kolejność grup). Każde słowo zapytania musi być
// POCZĄTKIEM któregoś słowa etykiety / zakresu / opisu / nazwy grupy / klucza („9" → lata 90, nie 1980–89). Puste → [].
export function searchCats(groups, q, allCats){
  const words = normQuery(q).split(' ').filter(Boolean);
  if(!words.length) return [];
  const out = [], seen = new Set();
  for(const g of (groups || [])){
    for(const k of (g.keys || [])){
      if(seen.has(k)) continue;
      const c = allCats && allCats[k]; if(!c) continue;
      const hay = normQuery([c.label, c.range, c.desc, g.label, k].filter(Boolean).join(' ')).split(' ');
      if(words.every(w => hay.some(h => h.startsWith(w)))){ seen.add(k); out.push({ key:k, group:g.id }); }
    }
  }
  return out;
}

/* ===== tryby: rodziny + stan każdego trybu =====
 * reason: 'cats' (nie pasuje do wybranych kategorii) | 'solo' (MP: tylko solo) | 'server' (MP: serwer nie zna).
 * „quiz" jest AUTOMATYCZNY (core/picker.syncQuizMode) — `auto:true`, `on` = jest kategoria quizu. */
export const MODE_REASON = {
  cats:'nie pasuje do wybranych kategorii',
  solo:'tylko w grze solo',
  server:'serwer pokoju jeszcze tego nie obsługuje',
};
export function modeStates({ cats, modes, allCats, available = ALL_MODES, families = MODE_FAMILIES }){
  const catList = [...(cats || [])].filter(k => allCats && allCats[k]);
  const fits = (m) => !catList.length || catList.some(k => modesFor(k, allCats).includes(m));
  const hasQuizCat = catList.some(k => allCats[k].kind === 'quiz');
  const reasons = new Set(), active = [];
  const fams = families.map(f => ({ id:f.id, name:f.name, desc:f.desc, modes: f.modes.map(m => {
    const label = MODE_PICK_LABEL[m] || m;
    if(m === 'quiz'){
      const on = hasQuizCat && available.includes('quiz');
      if(on) active.push(m);
      return { mode:m, label, auto:true, on, disabled:!on, reason:'' };
    }
    let reason = '';
    if(!available.includes(m)) reason = SOLO_ONLY_MODES.includes(m) ? 'solo' : 'server';
    else if(!fits(m)) reason = 'cats';
    if(reason) reasons.add(reason);
    const on = !reason && !!(modes && modes.has(m));
    if(on) active.push(m);
    return { mode:m, label, auto:false, on, disabled:!!reason, reason };
  }) }));
  return { families:fams, reasons:[...reasons], active };
}
// jedno-/dwuzdaniowe wyjaśnienie wyszarzeń pod sekcją trybów
export function modeNote(reasons){
  const r = new Set(reasons || []), parts = [];
  if(r.has('cats')) parts.push('Wyszarzone tryby nie pasują do wybranych kategorii — np. covery wymagają światowych hitów, lektor kategorii z zakładki Teksty.');
  if(r.has('solo')) parts.push('Tryby „tylko solo" (intro, oś czasu, składanka, okładka, covery) nie działają w grze ze znajomymi.');
  if(r.has('server')) parts.push('Część trybów jest wyłączona, bo serwer pokoju jeszcze ich nie obsługuje.');
  return parts.join(' ');
}

/* ===== podsumowania ===== */
// pasek startu: „15 utworów · 4 kat. · 3 tryby" albo co brakuje (ok:false → start zablokowany)
export function setupSummary({ cats, active, questions, allCats }){
  if(!cats || !cats.size) return { ok:false, text:'Wybierz co najmniej jedną kategorię' };
  if(!active || !active.length) return { ok:false, text:'Wybierz co najmniej jeden tryb pasujący do kategorii' };
  const s = pickSummary(cats, new Set(active), { questions }, allCats);
  if(s.error) return { ok:false, text:'Wybrane tryby nie pasują do kategorii' };
  const n = active.length;
  // P1-7: krótki mecz miesza kategorie i tryby (slot = pytanie) — „z powtórkami" tylko gdy blokom brakuje kategorii
  const rep = s.mixed ? ((s.cats>1 || n>1) ? ' · na przemian' : '') : (s.cats < s.blocks ? ' · z powtórkami' : '');
  return { ok:true, text:`${s.count} ${s.unit} · ${s.cats} kat. · ${n} ${plPick(n, 'tryb', 'tryby', 'trybów')}${rep}`, summary:s };
}
export const FORMAT_LABEL = { coop:'Wspólna drużyna', solo:'Każdy sam', teams:'Drużyny' };
/* P1-9 (przegląd MP 2026-10): copy per format — Solo mówi do gracza („Twoja odpowiedź", „Ranking graczy"), Drużyny
 * i Wspólna — do drużyny; „przegłosujcie" tylko gdy w drużynie są ≥ 2 osoby. teamSize = liczba osób w MOJEJ drużynie. */
export function formatCopy(format, teamSize = 1){
  const f = MP_FORMATS.includes(format) ? format : 'coop';
  const many = (Number(teamSize) || 0) >= 2;
  const solo = f === 'solo';
  return {
    answerLabel: solo ? 'TWOJA ODPOWIEDŹ' : 'ODPOWIEDŹ DRUŻYNY',
    emptyHint: solo || !many ? '— wpisz swój typ —' : '— wrzućcie typy i przegłosujcie —',
    lockedLabel: solo ? 'Twoja odpowiedź' : 'odpowiedź drużyny',
    typLabel: solo ? 'Twój typ' : 'drużyna',
    rankingTitle: solo ? 'RANKING GRACZY' : 'RANKING DRUŻYN',
    doneRanking: solo ? 'Ranking graczy' : 'Ranking drużyn',
    winnerSub: solo ? 'zwycięzca · punkty' : f === 'teams' ? 'zwycięska drużyna · punkty' : 'punkty drużyny',
    hitTitle: solo ? 'Trafione!' : 'Drużyna trafiła!',
  };
}
export const timerLabel = (t) => { const s = clampTimer(t); return s ? `${s} s` : 'bez limitu'; };
// jednolinijkowe podsumowanie zwiniętych „Ustawień meczu"
export function settingsSummary({ ctx = 'solo', questions, trener = false, format = 'coop', timer = 0, salon = false }){
  const q = `${clampQuestions(questions)} pytań`;
  if(ctx !== 'mp') return `${q} · trener ${trener ? 'wł.' : 'wył.'}`;
  return [q, FORMAT_LABEL[format] || FORMAT_LABEL.coop, timerLabel(timer)].concat(salon ? ['TV'] : []).join(' · ');
}

/* ===== szkic konfiguracji MP dla gości („Mecz, który ustawia host" — na żywo) =====
 * Host rozsyła ulotny event `draft`; serwer (relay i autorytet) przepuszcza go TYLKO od hosta, po tej samej
 * sanityzacji (znane pola, przycięte teksty, capy) i z limitem częstotliwości. Klient sanityzuje ponownie. */
export const DRAFT_MAX_CATS = 24;
export const DRAFT_LABEL_MAX = 40;
export const DRAFT_PAYLOAD_MAX = 4000;   // cap rozmiaru po JSON (serwer)
export function sanitizeDraft(d){
  if(!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const rawCats = Array.isArray(d.cats) ? d.cats : [];
  const cats = [], seen = new Set();
  for(const c of rawCats.slice(0, DRAFT_MAX_CATS)){
    if(!c || typeof c !== 'object') continue;
    const k = clipText(c.k, 60); if(!k || seen.has(k)) continue;
    seen.add(k); cats.push({ k, l: clipText(c.l, DRAFT_LABEL_MAX) || k });
  }
  const more = Math.max(0, Math.min(999, Math.floor(Number(d.more)) || 0)) + Math.max(0, rawCats.length - DRAFT_MAX_CATS);
  const modes = [...new Set((Array.isArray(d.modes) ? d.modes : []).filter(m => ALL_MODES.includes(m)))];
  const salon = d.salon === true;
  return {
    preset: clipText(d.preset, DRAFT_LABEL_MAX),
    cats, more: Math.min(999, more), modes,
    questions: clampQuestions(d.questions),
    timer: clampTimer(d.timer),
    format: MP_FORMATS.includes(d.format) ? d.format : 'coop',
    salon,
    audioHostOnly: salon || d.audioHostOnly === true,
  };
}
// tryby szkicu do wyświetlenia gościowi („muzyka · intro 1–16 s · ABCD")
export function draftModesText(modes){
  const list = (modes || []).filter(m => ALL_MODES.includes(m));
  return list.length ? list.map(m => MODE_PICK_LABEL[m] || MODE_SHORT[m] || m).join(' · ') : '—';
}
