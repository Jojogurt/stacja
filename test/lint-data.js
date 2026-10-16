/* test/lint-data.js — lint jakości paczek pytań (data/quiz-*.json) + lyrics.js.
 * Kontrakt: backlog/audyt-2026-10/SPEC-paczki-v2.md. Twarda strukturalna walidacja zostaje w
 * test/data.js (`npm test`); tu jest raport jakościowy (`npm run lint:data`).
 *
 *   node test/lint-data.js                       pełny raport
 *   node test/lint-data.js --file quiz-sport.json   tylko ten plik (duplikaty liczone względem WSZYSTKICH paczek)
 *   node test/lint-data.js --strict              exit 1 przy jakimkolwiek BŁĘDZIE (CI)
 *   node test/lint-data.js --summary             tylko podsumowania, bez listy
 *   node test/lint-data.js --no-lyrics           pomiń lyrics.js
 *
 * Reguły (BŁĄD / OSTRZ):
 *   1  wyciek odpowiedzi (wariant lub rdzeń) w treści pytania              BŁĄD
 *   2  wyciek krzyżowy: kanoniczna odpowiedź X w treści/opcjach innego Y    OSTRZ
 *   3  ABCD: ≠4 opcje / alias=litera / litera↔tekst                         BŁĄD;  poprawna ≥1.5× dłuższa  OSTRZ
 *   4  identyczne listy slotów bez `pool`                                   BŁĄD;  „Wymień/Podaj N" bez pool  OSTRZ
 *   5  duplikat treści (w paczce i między paczkami)                         BŁĄD;  prawie-duplikat (odp.+3 najdłuższe słowa)  OSTRZ
 *   6  warianty zbędne (ten sam norm) / zduplikowane w liście               OSTRZ
 *   7  warianty/opcje różniące się tylko liczbą lub cyfrą rzymską           OSTRZ
 *   8  desc zawiera „poziom" lub liczba w desc ≠ liczba pytań               BŁĄD
 *   9  ten sam początek treści (3 słowa) w >10% paczki                      OSTRZ  (bez łamigłówek — stały format)
 *   J1 „Jedna litera różnicy" (quiz-jedna-litera.json / id): kanoniczne odpowiedzi kolejnych slotów
 *      różnią się DOKŁADNIE jedną literą (podmiana, ta sama długość; bez wielkości liter, ze spacjami
 *      i polskimi znakami); bez pól odsłuchu track/tracks (decyzja: bez audio)  BŁĄD
 *   R1 łamigłówki: display (tylko 'rebus' i wtedy wymagany track), partial bool, kształt track/tracks  BŁĄD
 *   L1 lyrics: tytuł/wykonawca w polu `lyric` (całość/wykonawca BŁĄD, pojedyncze słowo tytułu OSTRZ)
 *   L2 lyrics: duplikat tytuł+wykonawca (w kategorii BŁĄD, między kategoriami OSTRZ) */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import vm from 'node:vm';
import { norm, deLatin } from '../core/scoring.js';
import { ladderErrors, puzzleFieldErrors } from './lintRules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

// ---- argumenty ----
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const SUMMARY_ONLY = argv.includes('--summary');
const NO_LYRICS = argv.includes('--no-lyrics');
const fi = argv.indexOf('--file');
let ONLY = null;
if (fi >= 0) {
  if (!argv[fi + 1]) { console.error('--file wymaga nazwy pliku'); process.exit(2); }
  ONLY = basename(argv[fi + 1]);
  if (!/\.json$/.test(ONLY)) ONLY = (/^quiz-/.test(ONLY) ? ONLY : 'quiz-' + ONLY) + '.json';
}

// ---- wyniki ----
const RULE_NAMES = {
  '1': 'wyciek odpowiedzi w treści', '2': 'wyciek krzyżowy', '3': 'ABCD (opcje/aliasy/litera/długość)',
  '4': 'sloty bez pool / „Wymień N"', '5': 'duplikaty', '6': 'warianty zbędne', '7': 'warianty liczbowe/rzymskie',
  '8': 'desc paczki', '9': 'szablon początku treści', 'J1': 'jedna litera różnicy (drabinka)', 'R1': 'łamigłówki: rebus/track/partial', 'L1': 'lyrics: wyciek tytułu/wykonawcy', 'L2': 'lyrics: duplikaty',
};
const findings = []; // {sev:'BŁĄD'|'OSTRZ', rule, id, file, msg}
const add = (sev, rule, file, id, msg) => findings.push({ sev, rule, file, id, msg });
const err = (rule, file, id, msg) => add('BŁĄD', rule, file, id, msg);
const warn = (rule, file, id, msg) => add('OSTRZ', rule, file, id, msg);

// ---- narzędzia tekstowe ----
// fold: małe litery, bez diakrytyków (też ₂→2), same a-z0-9 rozdzielone spacją
const fold = (s) => deLatin(String(s || '').toLowerCase()).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const toks = (s) => { const f = fold(s); return f ? f.split(' ') : []; };
const nsp = (s) => s.replace(/ /g, '');

const ENDINGS = ['ego', 'iej', 'ach', 'ami', 'owi', 'ów', 'om', 'em', 'ie', 'ia', 'ej', 'ą', 'ę', 'a', 'e', 'i', 'y', 'u', 'o']
  .map(e => deLatin(e)).sort((a, b) => b.length - a.length);
// prosty stem: obetnij typową polską końcówkę, zostaw ≥5 znaków; krótkie słowa → 4-znakowy prefiks
function stem(t) {
  if (t.length >= 6) {
    for (const e of ENDINGS) if (t.endsWith(e) && t.length - e.length >= 5) return t.slice(0, -e.length);
    return t;
  }
  if (t.length === 5 && /[aeiouy]$/.test(t)) return t.slice(0, -1);
  return t;
}
function tokMatch(t, h) {
  if (t === h) return true;
  if (t.length < 4) return false;
  if (!h.startsWith(stem(t))) return false;
  return t.length > 5 || h.length <= t.length + 3; // krótkie: tylko fleksja, nie „mars"→„marsz"
}
// czy ciąg tokenów `ph` występuje (z fleksją) w `hay`
function hasPhrase(hay, ph) {
  if (!ph.length) return false;
  outer: for (let i = 0; i + ph.length <= hay.length; i++) {
    for (let k = 0; k < ph.length; k++) if (!tokMatch(ph[k], hay[i + k])) continue outer;
    return true;
  }
  return false;
}
// tokeny wariantu do porównań (norm z core/scoring.js; fallback fold); null gdy < 4 znaki
function variantTokens(v) {
  let n = norm(v);
  if (!n) n = fold(v);
  if (nsp(n).length < 4) return null;
  return n.split(' ');
}

// ---- rozbiór pytania ----
const OPT_RE = /^\s*([A-Z])\)\s*(.*?)\s*$/;
function parseQ(q) {
  const prompt = String(q.prompt || '');
  const isMC = /\nA\)/.test(prompt);
  const stemLines = [], opts = {}, optList = [];
  for (const l of prompt.split('\n')) {
    const m = isMC ? l.match(OPT_RE) : null;
    if (m) { opts[m[1]] = m[2]; optList.push(m[1]); } else stemLines.push(l);
  }
  return { prompt, isMC, stem: stemLines.join(' ').trim(), opts, optList };
}
const slotKeys = (q) => (Array.isArray(q.slots) ? q.slots : []).map(s => s && s.key).filter(Boolean);
const ansList = (q, k) => (q.answers && Array.isArray(q.answers[k]) ? q.answers[k].filter(x => typeof x === 'string') : []);
// kanoniczne odpowiedzi pytania (pool → [0] każdej pozycji; ABCD → tekst opcji [1]; inaczej [0] slotów)
function canonicals(q, p) {
  if (Array.isArray(q.pool)) return q.pool.map(it => Array.isArray(it) ? it[0] : null).filter(x => typeof x === 'string');
  const out = [];
  for (const k of slotKeys(q)) {
    const a = ansList(q, k);
    const c = p.isMC ? a[1] : a[0];
    if (c) out.push(c);
  }
  return out;
}
// wszystkie warianty, które mają być ukryte przed graczem (bez liter ABCD)
function allVariants(q, p) {
  const out = new Set();
  for (const k of slotKeys(q)) ansList(q, k).forEach((v, i) => { if (!(p.isMC && i === 0)) out.add(v); });
  if (Array.isArray(q.pool)) for (const it of q.pool) if (Array.isArray(it)) it.forEach(v => typeof v === 'string' && out.add(v));
  return [...out];
}

// wzorzec z liczbą/rzymską zastąpioną '#'; null gdy brak liczb lub brak innej treści (czyste „1989" vs „1990" to nie kolizja)
const ROMAN = /^(?=[IVXLCDM]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const NUM_STOP = new Set(['okolo', 'ponad', 'prawie', 'mniej', 'wiecej', 'ok', 'rok', 'roku', 'lat', 'w', 'na']);
function numPattern(s) {
  const raw = String(s || '').replace(/[()[\].,;:!?"„”'’–—-]/g, ' ').split(/\s+/).filter(Boolean);
  let hasNum = false, hasName = false;
  const out = raw.map(w => {
    const f = fold(w);
    if (/^\d+$/.test(f) || (ROMAN.test(w) && raw.length > 1)) { hasNum = true; return '#'; }
    // „nazwa własna": słowo z wielkiej litery spoza krótkiej listy przysłówków (Apollo, Ludwik, Rocky…)
    if (/^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(w) && f.length >= 3 && !NUM_STOP.has(f)) hasName = true;
    return f;
  }).filter(Boolean);
  return hasNum && hasName ? out.join(' ') : null; // czyste „1989" vs „1990" czy „5 litrów" vs „8 litrów" to nie kolizja
}

// ---- wczytanie paczek ----
const allFiles = readdirSync(DATA).filter(f => /^quiz-.*\.json$/.test(f) && f !== 'quiz-index.json').sort();
if (ONLY && !allFiles.includes(ONLY)) { console.error(`brak pliku data/${ONLY}`); process.exit(2); }
const packs = [];
for (const f of allFiles) {
  try { packs.push({ file: f, slug: f.replace(/^quiz-/, '').replace(/\.json$/, ''), j: JSON.parse(readFileSync(join(DATA, f), 'utf8')) }); }
  catch (e) { if (!ONLY || ONLY === f) err('8', f, f, `nie-parsowalny JSON: ${e.message}`); }
}
const report = (pack) => !ONLY || pack.file === ONLY;

// ---- cross-pack: indeksy duplikatów ----
const exactSeen = new Map(); // klucz → id pierwszego wystąpienia
const nearSeen = new Map();
const wordsKey = (stemText) => {
  const w = [...new Set(toks(stemText).filter(x => x.length >= 4))]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).slice(0, 3);
  return w.length === 3 ? w.sort().join(' ') : null;
};

const stats = { files: 0, questions: 0, mc: 0 };

for (const pack of packs) {
  const { file, slug, j } = pack;
  const rep = report(pack);
  if (!j || !Array.isArray(j.questions)) continue;
  const qs = j.questions;
  if (rep) { stats.files++; stats.questions += qs.length; }

  // 8: desc
  if (rep && typeof j.desc === 'string') {
    if (/poziom/i.test(j.desc)) err('8', file, slug, `desc zawiera „poziom": „${j.desc}"`);
    const m = j.desc.match(/\d+/);
    if (m && +m[0] !== qs.length) err('8', file, slug, `desc podaje ${m[0]} pytań, w paczce jest ${qs.length}`);
  }

  const P = qs.map(q => parseQ(q || {}));
  const isLadder = file === 'quiz-jedna-litera.json' || j.id === 'jedna-litera';   // J1
  const isPuzzle = j.group === 'lamiglowki';   // 9: stały format treści łamigłówek — bez ostrzeżenia o szablonie
  const H = P.map(p => toks(p.prompt));       // pełna treść (z opcjami) — do wycieku krzyżowego
  const S = P.map(p => toks(p.stem));          // sama treść — do wycieku bezpośredniego
  const prefixCount = new Map();

  qs.forEach((q, i) => {
    q = q || {};
    const p = P[i], id = `${slug}#${i}`;
    if (p.isMC && rep) stats.mc++;
    const keys = slotKeys(q);
    const pool = Array.isArray(q.pool);

    // 5: duplikaty (indeks liczony dla wszystkich paczek, raport tylko dla wybranych)
    // Łamigłówki: rebus = emoji (fold je wycina) → duplikat liczony po surowej treści
    const exactKey = q.display === 'rebus' ? 'rebus:' + p.stem.replace(/\s+/g, ' ').trim() : fold(p.stem);
    let exactDup = false;
    if (exactKey) {
      if (exactSeen.has(exactKey)) {
        exactDup = true;
        if (rep) err('5', file, id, `duplikat treści pytania (= ${exactSeen.get(exactKey)})`);
      } else exactSeen.set(exactKey, id);
    }
    const wk = wordsKey(p.stem);
    const can0 = canonicals(q, p).map(c => norm(c) || fold(c)).sort().join('|');
    if (wk && can0) {
      const nk = can0 + '||' + wk;
      if (nearSeen.has(nk)) {
        if (rep && !exactDup) warn('5', file, id, `prawie-duplikat (ta sama odpowiedź i słowa „${wk}") = ${nearSeen.get(nk)}`);
      } else nearSeen.set(nk, id);
    }

    if (!rep) return;

    // J1 / R1: łamigłówki
    if (isLadder) for (const m of ladderErrors(q)) err('J1', file, id, m);
    for (const m of puzzleFieldErrors(q)) err('R1', file, id, m);

    // 9: początek treści
    const pre = S[i].slice(0, 3).join(' ');
    if (S[i].length >= 3) prefixCount.set(pre, (prefixCount.get(pre) || 0) + 1);

    // 1: wyciek
    const variants = allVariants(q, p);
    const leaked = [];
    for (const v of variants) {
      const t = variantTokens(v);
      if (t && hasPhrase(S[i], t)) leaked.push(v);
    }
    if (leaked.length) err('1', file, id, `odpowiedź w treści pytania: ${leaked.slice(0, 3).map(x => `„${x}"`).join(', ')}${leaked.length > 3 ? '…' : ''}`);

    // 2: wyciek krzyżowy
    const cans = canonicals(q, p);
    const hits = [];
    for (const c of cans) {
      const t = variantTokens(c);
      if (!t || nsp(t.join(' ')).length < 5) continue;
      for (let o = 0; o < qs.length; o++) {
        if (o === i) continue;
        if (hasPhrase(H[o], t)) { hits.push(`„${c}"→#${o}`); }
      }
    }
    if (hits.length) warn('2', file, id, `kanoniczna odpowiedź w innym pytaniu: ${hits.slice(0, 4).join(', ')}${hits.length > 4 ? ` (+${hits.length - 4})` : ''}`);

    // 3: ABCD
    if (p.isMC) {
      const letters = p.optList;
      if (letters.length !== 4) err('3', file, id, `ABCD ma ${letters.length} opcji (${letters.join('') || 'brak'}), wymagane dokładnie 4 (A–D)`);
      else if (letters.join('') !== 'ABCD') err('3', file, id, `ABCD: opcje ${letters.join('')} zamiast ABCD`);
      const a = ansList(q, 'a');
      const letter = a[0];
      if (!/^[A-D]$/.test(letter || '')) err('3', file, id, `answers.a[0] nie jest literą A–D: ${JSON.stringify(letter)}`);
      a.slice(1).forEach(al => {
        if (/^[a-d]$/.test(fold(al))) err('3', file, id, `alias „${al}" normalizuje się do pojedynczej litery`);
      });
      if (/^[A-D]$/.test(letter || '') && p.opts[letter] != null && a[1] != null) {
        const o = fold(p.opts[letter]).replace(/ /g, ''), t = fold(a[1]).replace(/ /g, '');
        if (!(o === t || o.includes(t) || t.includes(o))) err('3', file, id, `litera ${letter}="${p.opts[letter]}" niezgodna z tekstem odpowiedzi „${a[1]}"`);
      }
      if (/^[A-D]$/.test(letter || '') && p.opts[letter] != null) {
        const others = Object.entries(p.opts).filter(([k]) => k !== letter).map(([, v]) => v.length);
        const mx = Math.max(0, ...others);
        if (mx > 0 && p.opts[letter].length >= 1.5 * mx) warn('3', file, id, `poprawna opcja (${p.opts[letter].length} zn.) ≥1.5× dłuższa od najdłuższego dystraktora (${mx})`);
      }
      // 7 (opcje): różnią się tylko liczbą / cyfrą rzymską
      const optPats = Object.entries(p.opts).map(([k, v]) => [k, v, numPattern(v)]);
      for (let x = 0; x < optPats.length; x++) for (let y = x + 1; y < optPats.length; y++) {
        const [kx, vx, px] = optPats[x], [ky, vy, py] = optPats[y];
        if (px && px === py && vx !== vy) warn('7', file, id, `opcje ${kx}) „${vx}" i ${ky}) „${vy}" różnią się tylko liczbą/numeracją`);
      }
    }

    // 4: sloty identyczne / „Wymień N"
    if (!pool && keys.length > 1) {
      const sig = keys.map(k => JSON.stringify([...new Set(ansList(q, k).map(v => norm(v) || fold(v)))].sort()));
      const dup = sig.some((s, x) => sig.indexOf(s) !== x);
      if (dup) err('4', file, id, `sloty z identycznymi listami odpowiedzi bez \`pool\` (dodaj pool)`);
      if (/^\s*(wymień|wymien|podaj)\b/i.test(p.stem) && /(\d+|dw(a|ie|óch|u|oje)|trz(y|ech|ej)|cztery|czterech|pięć|pięciu|sześć|sześciu|siedem|osiem|dziewięć|dziesięć|kilka)/i.test(p.stem.slice(0, 40)))
        warn('4', file, id, `pytanie „Wymień/Podaj N" z ${keys.length} slotami bez \`pool\``);
    }

    // 6: warianty zbędne (per slot / pool-pozycja) + 7 (warianty liczbowe)
    const lists = keys.map(k => ansList(q, k).filter((_, ix) => !(p.isMC && ix === 0)));
    if (pool) for (const it of q.pool) if (Array.isArray(it)) lists.push(it.filter(x => typeof x === 'string'));
    const seen6 = new Set();
    lists.forEach(l => {
      for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
        const kk = `${l[x]}\u0000${l[y]}`;
        if (seen6.has(kk)) continue; seen6.add(kk);
        if (l[x] === l[y]) warn('6', file, id, `duplikat wariantu „${l[x]}"`);
        else {
          const nx = norm(l[x]) || fold(l[x]), ny = norm(l[y]) || fold(l[y]);
          if (nx && nx === ny) warn('6', file, id, `wariant „${l[y]}" zbędny wobec „${l[x]}" (różnią się diakrytykami/wielkością/interpunkcją)`);
        }
        const px = numPattern(l[x]), py = numPattern(l[y]);
        if (px && px === py && l[x] !== l[y] && !seen6.has('n' + kk)) { seen6.add('n' + kk); warn('7', file, id, `warianty „${l[x]}" i „${l[y]}" różnią się tylko liczbą/numeracją`); }
      }
    });
  });

  // 9: szablon
  if (rep && !isPuzzle) {
    const lim = qs.length * 0.1;
    for (const [pre, n] of [...prefixCount].sort((a, b) => b[1] - a[1])) {
      if (n > lim && n >= 3) warn('9', file, slug, `${n}/${qs.length} pytań (${Math.round(100 * n / qs.length)}%) zaczyna się od „${pre}…"`);
    }
  }
}

// ---- lyrics.js ----
let lyricsInfo = null;
if (!NO_LYRICS && !ONLY) {
  const lf = 'lyrics.js';
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(readFileSync(join(ROOT, lf), 'utf8'), sandbox, { filename: lf });
    const cats = (sandbox.window && sandbox.window.CATEGORIES) || {};
    let songsN = 0, catsN = 0;
    const globalSeen = new Map();
    // window.CATEGORIES.lyrics = { '<klucz>': {kind:'lyrics', songs:[…]}, … } (albo kategoria wprost)
    const flat = [];
    for (const [k0, c0] of Object.entries(cats)) {
      if (c0 && c0.kind === 'lyrics' && Array.isArray(c0.songs)) flat.push([k0, c0]);
      else if (c0 && typeof c0 === 'object') for (const [k1, c1] of Object.entries(c0)) if (c1 && c1.kind === 'lyrics' && Array.isArray(c1.songs)) flat.push([k1, c1]);
    }
    for (const [ck, cat] of flat) {
      catsN++;
      const localSeen = new Map();
      cat.songs.forEach((s, i) => {
        songsN++;
        const id = `lyrics:${ck}#${i}`;
        const lyric = toks(s.lyric || '');
        // L1: tytuł
        const tt = (norm(s.title) || fold(s.title)).split(' ').filter(Boolean);
        if (tt.length && nsp(tt.join('')).length >= 4 && hasPhrase(lyric, tt)) err('L1', lf, id, `cały tytuł „${s.title}" w polu lyric`);
        else {
          const words = [...new Set(tt.filter(w => w.length >= 4))].filter(w => hasPhrase(lyric, [w]));
          if (words.length) warn('L1', lf, id, `słowo tytułu „${words.join(', ')}" („${s.title}") w polu lyric`);
        }
        // L1: wykonawca (całość lub człon duetu ≥4 zn.)
        const parts = String(s.artist || '').split(/\s*(?:&|,|\bfeat\.?|\bft\.?|\bx\b|\bi\b)\s*/i).filter(Boolean);
        const artistHit = [...new Set([s.artist, ...parts])].filter(Boolean).filter(a => {
          const at = (norm(a) || fold(a)).split(' ').filter(Boolean);
          return at.length && nsp(at.join('')).length >= 4 && hasPhrase(lyric, at);
        });
        if (artistHit.length) err('L1', lf, id, `wykonawca „${artistHit[0]}" w polu lyric`);
        // L2: duplikaty
        const key = (norm(s.title) || fold(s.title)) + '|' + (norm(s.artist) || fold(s.artist));
        if (localSeen.has(key)) err('L2', lf, id, `duplikat tytuł+wykonawca w kategorii (= #${localSeen.get(key)}): „${s.title}" — ${s.artist}`);
        else {
          localSeen.set(key, i);
          if (globalSeen.has(key)) warn('L2', lf, id, `ten sam utwór w innej kategorii (= ${globalSeen.get(key)}): „${s.title}" — ${s.artist}`);
          else globalSeen.set(key, id);
        }
      });
    }
    lyricsInfo = { cats: catsN, songs: songsN };
  } catch (e) { err('L1', lf, lf, `nie udało się załadować lyrics.js: ${e.message}`); }
}

// ---- wydruk ----
const errs = findings.filter(f => f.sev === 'BŁĄD'), warns = findings.filter(f => f.sev === 'OSTRZ');
console.log(`lint:data — ${stats.files} plików, ${stats.questions} pytań (${stats.mc} ABCD)` +
  (lyricsInfo ? `, lyrics.js: ${lyricsInfo.cats} kategorii / ${lyricsInfo.songs} utworów` : '') + (ONLY ? `  [tylko ${ONLY}]` : ''));

console.log('\nPodsumowanie per reguła:');
const rules = Object.keys(RULE_NAMES).filter(r => findings.some(f => f.rule === r) || !ONLY);
console.log('  reguła  BŁĘDY  OSTRZ.  opis');
for (const r of rules) {
  const e = errs.filter(f => f.rule === r).length, w = warns.filter(f => f.rule === r).length;
  console.log(`  ${r.padEnd(6)} ${String(e).padStart(6)} ${String(w).padStart(7)}  ${RULE_NAMES[r]}`);
}
console.log(`  ${'RAZEM'.padEnd(6)} ${String(errs.length).padStart(6)} ${String(warns.length).padStart(7)}`);

console.log('\nPodsumowanie per plik:');
const fileNames = [...new Set(findings.map(f => f.file))];
const shown = (ONLY ? [ONLY] : [...allFiles, ...(lyricsInfo ? ['lyrics.js'] : [])]);
console.log('  plik                               BŁĘDY  OSTRZ.');
for (const f of shown) {
  const e = errs.filter(x => x.file === f).length, w = warns.filter(x => x.file === f).length;
  console.log(`  ${f.padEnd(34)} ${String(e).padStart(5)} ${String(w).padStart(7)}`);
}
void fileNames;

if (!SUMMARY_ONLY && findings.length) {
  console.log('\nSzczegóły:');
  const order = (f) => shown.indexOf(f.file);
  const sorted = [...findings].sort((a, b) => order(a) - order(b) || (a.sev === b.sev ? 0 : a.sev === 'BŁĄD' ? -1 : 1) ||
    (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
  let cur = null;
  for (const f of sorted) {
    if (f.file !== cur) { cur = f.file; console.log(`\n# ${cur}`); }
    console.log(`${f.sev} ${f.rule} ${f.id}: ${f.msg}`);
  }
}
console.log(`\n${errs.length} BŁĘDÓW, ${warns.length} OSTRZEŻEŃ${STRICT ? ' (--strict)' : ''}`);
if (STRICT && errs.length) process.exit(1);
