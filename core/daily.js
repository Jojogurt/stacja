/* core/daily.js — „Stacja dnia" (wyzwanie dnia, wzór Wordle/Heardle). Czysty rdzeń: zero DOM / fetch / storage.
 * Wszyscy grają tego samego dnia ten sam plan: seed = lokalna data Europe/Warsaw ('YYYY-MM-DD'),
 * seedowany PRNG (mulberry32) układa 10 pytań {cat, mode} z puli popularnych kategorii (dekady + PL),
 * a osobny strumień rnd per pytanie wybiera wykonawcę/utwór (core/trackSelect.resolveTrack({rnd})).
 * Jedna próba dziennie i seria dni 🔥 — stan trzyma app/daily.js (localStorage), tu tylko obliczenia.
 *
 * Tryb: same „♪ muzyka" (DAILY_MODES). Uzasadnienie: (1) siatka 🟩/🟨/⬛ ma jednoznaczny sens
 * (tytuł+wykonawca / jedno z dwóch / nic), porównywalny między graczami; (2) ABCD wymaga dystraktorów
 * z sieci — u różnych osób różne kafle; (3) „rok" bywa datą remasteru z iTunes, a „intro" premiuje
 * cierpliwość, nie wiedzę — wynik dnia byłby mniej porównywalny. dailyPlan przyjmuje inne tryby (opts.modes). */
import { modesFor } from './match.js';

export const DAILY_TZ = 'Europe/Warsaw';
export const DAILY_EPOCH = '2026-10-15';          // Stacja dnia #1 (dzień wydania audytu 2026-10)
export const DAILY_QUESTIONS = 10;
export const DAILY_MODES = ['music'];
// popularne kategorie: dekady 70–20 + polskie (klucze z categories.js; brakujące w runtime pomijane)
export const DAILY_PREFERRED = ['70s', '80s', '90s', '00s', '10s', '20s', 'evergreen-pl', 'rock-pl', 'rap-pl'];
export const DAILY_KEEP_DAYS = 400;               // ile dni historii trzymamy w storage

/* ---------- data ---------- */
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n, w = 2) => String(n).padStart(w, '0');
// Date → 'YYYY-MM-DD' w strefie `tz` (Intl — ECMAScript, działa w przeglądarce, Node i Workerze)
export function dateKey(date = new Date(), tz = DAILY_TZ){
  const d = date instanceof Date ? date : new Date(date);
  if(!Number.isFinite(d.getTime())) return null;
  try{
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = t => (parts.find(p => p.type === t) || {}).value;
    const k = `${get('year')}-${get('month')}-${get('day')}`;
    if(KEY_RE.test(k)) return k;
  }catch(_e){ /* brak danych stref — lokalna data urządzenia */ }
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function isDayKey(k){
  const m = typeof k === 'string' && k.match(KEY_RE); if(!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
// numer dnia kalendarzowego (UTC, więc zmiana czasu letni/zimowy nie przesuwa granicy)
export function dayIndex(key){
  if(!isDayKey(key)) return NaN;
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export function addDays(key, n){
  const i = dayIndex(key); if(!Number.isFinite(i)) return null;
  const d = new Date((i + n) * 86400000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
// „Stacja dnia #N": DAILY_EPOCH = #1
export function dailyNumber(key, epoch = DAILY_EPOCH){
  const n = dayIndex(key) - dayIndex(epoch) + 1;
  return Number.isFinite(n) ? n : 0;
}

/* ---------- seed + PRNG ---------- */
// 32-bit hash tekstu (FNV-1a + końcowe mieszanie) — stabilny między przeglądarkami/Node
export function hash32(str){
  let h = 0x811c9dc5;
  const s = String(str);
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
// mulberry32: szybki, deterministyczny PRNG → funkcja () => [0, 1)
export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// seed dnia: Date (→ data w Europe/Warsaw) albo gotowy klucz 'YYYY-MM-DD'
export function dailySeed(date = new Date()){
  const key = typeof date === 'string' ? date : dateKey(date);
  return hash32('stacja-daily:' + key);
}
// niezależny strumień losowości dla pytania `i` (0-based): wybór utworu nie zależy od tego, ile losowań
// zużyły poprzednie pytania (np. przy błędzie sieci)
export function dailyQuestionRnd(trackSeed, i){
  return mulberry32(hash32('q:' + (trackSeed >>> 0) + ':' + (i | 0)));
}

/* ---------- plan dnia ---------- */
// pula: preferowane klucze istniejące w runtime z trybem „muzyka" — POSORTOWANE (kolejność kluczy obiektu
// nie może wpływać na plan)
export function dailyPool(allCats, preferred = DAILY_PREFERRED){
  const ok = k => allCats && allCats[k] && modesFor(k, allCats).includes('music');
  const pool = preferred.filter(ok);
  return (pool.length ? pool : Object.keys(allCats || {}).filter(ok)).slice().sort();
}
/* Plan: `questions` pytań po jednym (qpc:1) — kolejne pytania z różnych kategorii (powtórka dopiero, gdy pula
 * mniejsza niż liczba pytań; nigdy ta sama kategoria dwa razy z rzędu, gdy pula > 1).
 * → { slots:[{round:1, cat, mode}], rounds:1, qpc:1, questions, trackSeed } albo { error }. */
export function dailyPlan(seed, cats, opts = {}){
  const questions = Math.max(1, Math.floor(opts.questions || DAILY_QUESTIONS));
  const modes = Array.isArray(opts.modes) && opts.modes.length ? opts.modes : DAILY_MODES;
  const keys = [...new Set((cats || []).filter(k => typeof k === 'string'))].sort();
  if(!keys.length) return { error: 'Brak kategorii do Stacji dnia.' };
  const rnd = mulberry32(seed);
  const shuffled = arr => { const a = arr.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const order = [];
  while(order.length < questions){
    let pass = shuffled(keys);
    if(order.length && pass.length > 1 && pass[0] === order[order.length - 1]) pass.push(pass.shift());
    order.push(...pass);
  }
  const slots = order.slice(0, questions).map(cat => {
    const ok = opts.allCats ? modes.filter(m => modesFor(cat, opts.allCats).includes(m)) : modes;
    const pick = ok.length ? ok : ['music'];
    return { round: 1, cat, mode: pick[Math.floor(rnd() * pick.length)] };
  });
  return { slots, rounds: 1, qpc: 1, questions, trackSeed: hash32('tracks:' + (seed >>> 0)) };
}

/* ---------- seria dni ---------- */
// bieżąca seria: dni z rzędu kończące się dziś (albo wczoraj — seria jeszcze żyje, dziś nie zagrano)
export function dailyStreak(keys, today){
  const set = new Set((keys || []).filter(isDayKey).map(dayIndex));
  const t = dayIndex(today); if(!Number.isFinite(t)) return 0;
  let d = set.has(t) ? t : (set.has(t - 1) ? t - 1 : null);
  if(d == null) return 0;
  let n = 0; while(set.has(d)){ n++; d--; }
  return n;
}
// najdłuższa seria w historii
export function bestStreak(keys){
  const idx = [...new Set((keys || []).filter(isDayKey).map(dayIndex))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for(const i of idx){ run = (prev != null && i === prev + 1) ? run + 1 : 1; best = Math.max(best, run); prev = i; }
  return best;
}

/* ---------- siatka emoji + tekst udostępniania (bez danych osobowych) ---------- */
export const CELL = { full: '🟩', part: '🟨', miss: '⬛', none: '⬜' };
// wynik pytania (kształt session.results z app/solo.js) → kratka
export function dailyCell(r){
  if(!r || typeof r !== 'object') return CELL.none;
  if(r.skipped) return CELL.miss;
  if(r.okTitle && r.okArtist) return CELL.full;
  if(r.okTitle || r.okArtist || (+r.points > 0)) return CELL.part;
  return CELL.miss;
}
// siatka: kratka na każde rozegrane pytanie, nierozegrane (przerwany mecz) → ⬜ do `total`
export function resultGrid(results, total){
  const res = Array.isArray(results) ? results : [];
  const n = Math.max(res.length, Math.floor(total) || 0);
  let s = '';
  for(let i = 0; i < n; i++) s += i < res.length ? dailyCell(res[i]) : CELL.none;
  return s;
}
export function countHits(results){ return (Array.isArray(results) ? results : []).filter(r => r && r.okTitle && r.okArtist && !r.skipped).length; }
// „STACJA #N 🎧 7/10 · 🔥3\n🟩🟩🟨…\n<link>"
export function dailyShareText({ n, hits, total = DAILY_QUESTIONS, streak = 0, grid = '', url = '' }){
  const head = `STACJA #${Math.max(0, Math.floor(n) || 0)} 🎧 ${Math.max(0, hits | 0)}/${Math.max(0, total | 0)}` + (streak > 0 ? ` · 🔥${streak | 0}` : '');
  return [head, grid, url].filter(Boolean).join('\n');
}
// zwykły mecz solo: „STACJA 🎧 450 pkt · 7/10\n🟩…\n<link>"
export function matchShareText({ points = 0, hits = 0, total = 0, grid = '', url = '' }){
  const head = `STACJA 🎧 ${Math.max(0, Math.round(+points) || 0)} pkt · ${Math.max(0, hits | 0)}/${Math.max(0, total | 0)}`;
  return [head, grid, url].filter(Boolean).join('\n');
}

/* ---------- zapis dnia (kształt w storage) ---------- */
// rekord dnia z wyników meczu; `done` = mecz skończony (false → przerwany/w toku = wynik częściowy)
export function dailyRecord({ key, results = [], points = 0, total = DAILY_QUESTIONS, done = false }){
  const res = (Array.isArray(results) ? results : []).slice(0, total).map(r => ({
    track: String((r && r.track) || '').slice(0, 120), artist: String((r && r.artist) || '').slice(0, 120),
    c: dailyCell(r), points: Math.max(0, Math.round(+(r && r.points) || 0)),
  }));
  return { key, n: dailyNumber(key), hits: countHits(results), total, points: Math.max(0, Math.round(+points) || 0),
    grid: resultGrid(results, total), played: res.length, done: !!done, results: res };
}
// sanityzacja magazynu z localStorage (śmieci / stara wersja → pusty), przycięcie historii
export function sanitizeDailyStore(o, keep = DAILY_KEEP_DAYS){
  const src = (o && typeof o === 'object' && o.days && typeof o.days === 'object') ? o.days : {};
  const all = Object.keys(src).filter(k => isDayKey(k) && src[k] && typeof src[k] === 'object').sort();
  const keys = all.slice(-keep);
  const days = {};
  keys.forEach(k => { days[k] = src[k]; });
  const best = Math.max(Number.isFinite(+o?.best) ? +o.best : 0, bestStreak(all));   // przed przycięciem historii
  return { v: 1, days, best };
}
// stan karty/profilu: dzisiejszy rekord, seria, najlepsza seria
export function dailyStatus(store, today){
  const s = sanitizeDailyStore(store);
  const keys = Object.keys(s.days);
  return { key: today, n: dailyNumber(today), record: s.days[today] || null,
    streak: dailyStreak(keys, today), best: Math.max(s.best, bestStreak(keys)), played: keys.length };
}
