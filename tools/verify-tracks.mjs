/* tools/verify-tracks.mjs — weryfikacja utworów odsłuchu łamigłówek (pola `track` / `tracks`) w iTunes PL.
 * Ta sama ścieżka co gra (core/trackSelect.matchSong — F5): najpierw wyszukiwanie „artysta tytuł" (entity=song),
 * potem po wykonawcy (artistTerm); utwór MUSI się zgadzać tytułem I wykonawcą i mieć previewUrl.
 * Odstęp ~300 ms między zapytaniami (limit iTunes).
 *
 *   node tools/verify-tracks.mjs                       wszystkie paczki z group:'lamiglowki'
 *   node tools/verify-tracks.mjs quiz-rebusy.json      jedna paczka
 *   node tools/verify-tracks.mjs --cats [klucz]        utwory `songs[]` kategorii z categories.js, które mają pole `match`
 *                                                      (np. „akustycznie / unplugged") albo jednej kategorii o kluczu
 *     — ta sama ścieżka co gra: core/trackSelect.songTerms (najpierw „artysta tytuł <słowo z match>") + matchSong
 *       (tytuł, wykonawca ORAZ słowo z `match` w trackName/collectionName — żeby nie zagrała wersja studyjna).
 *       VERBOSE=1 wypisuje też rozwiązane (z albumem i rokiem wydania w iTunes).
 * Wyjście: lista nierozwiązanych (exit 1, gdy są). */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { matchSong, songTerms } from '../core/trackSelect.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const catsMode = process.argv[2] === '--cats';
const only = catsMode ? null : process.argv[2];
const files = readdirSync(DATA).filter(f => /^quiz-.*\.json$/.test(f) && f !== 'quiz-index.json' && (!only || f === only));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const strip = (x) => String(x || '').replace(/\(([^)]*)\)|\[([^\]]*)\]/g, ' ').replace(/\s+(?:feat\.?|ft\.?)\s.*$/i, ' ').replace(/\s+/g, ' ').trim();
async function search(params){
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch('https://itunes.apple.com/search?' + new URLSearchParams(params));
      if (r.status === 403 || r.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
      return (await r.json()).results || [];
    } catch (_e) { await sleep(1500); }
  }
  return null;
}
const cache = new Map();
async function resolve(t){
  const k = (t.artist + '|' + t.title).toLowerCase();
  if (cache.has(k)) return cache.get(k);
  let hit = null, net = false;
  const tries = [
    { term: strip(t.artist) + ' ' + strip(t.title), media: 'music', entity: 'song', limit: '25', country: 'PL' },
    { term: t.artist, media: 'music', entity: 'song', attribute: 'artistTerm', limit: '60', country: 'PL' },
  ];
  for (const p of tries) {
    const res = await search(p); await sleep(300);
    if (res) net = true;
    hit = res && matchSong(res, t);
    if (hit) break;
  }
  const out = hit ? { ok: true, got: `${hit.trackName} — ${hit.artistName}` } : { ok: false, net };
  cache.set(k, out);
  return out;
}

// kategorie z categories.js (window.CATEGORIES — ładowane w piaskownicy vm, jak w przeglądarce)
async function resolveSong(s){
  for (const [term, opts] of songTerms(s)) {
    const p = opts && opts.song
      ? { term, media: 'music', entity: 'song', limit: '25', country: 'PL' }
      : { term, media: 'music', entity: 'song', attribute: 'artistTerm', limit: '60', country: 'PL' };
    const res = await search(p); await sleep(300);
    const hit = res && matchSong(res, s);
    if (hit) return { ok: true, got: `${hit.trackName} — ${hit.artistName} [${hit.collectionName}, ${String(hit.releaseDate || '').slice(0, 4)}]` };
  }
  return { ok: false };
}
if (catsMode) {
  const want = process.argv[3];
  const box = { window: {} };
  vm.runInNewContext(readFileSync(join(ROOT, 'categories.js'), 'utf8'), box);
  const C = box.window.CATEGORIES || {};
  const cats = Object.assign({}, C.decades, C.styles);
  let n = 0; const miss = [];
  for (const [k, c] of Object.entries(cats)) {
    if (want ? k !== want : !(c.songs || []).some(s => s.match)) continue;
    for (const s of c.songs || []) {
      n++;
      const r = await resolveSong(s);
      if (!r.ok) { miss.push(`${k}: „${s.title}" — ${s.artist}${s.match ? ' [' + s.match + ']' : ''}`); console.log('✗', miss[miss.length - 1]); }
      else if (process.env.VERBOSE) console.log('✓', `${k}: ${s.title} — ${s.artist}  ⇒  ${r.got}`);
    }
  }
  console.log(`\nutworów: ${n}, nierozwiązanych: ${miss.length}`);
  process.exit(miss.length ? 1 : 0);
}

let total = 0, bad = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  if (j.group !== 'lamiglowki') continue;
  for (const [i, q] of (j.questions || []).entries()) {
    const list = [q.track, ...(Array.isArray(q.tracks) ? q.tracks : [])].filter(Boolean);
    for (const t of list) {
      total++;
      const r = await resolve(t);
      if (!r.ok) { bad.push(`${f}#${i}: „${t.title}" — ${t.artist}${r.net ? '' : ' (brak sieci)'}`); console.log('✗', bad[bad.length - 1]); }
      else if (process.env.VERBOSE) console.log('✓', `${f}#${i}: ${t.title} — ${t.artist}  ⇒  ${r.got}`);
    }
  }
}
console.log(`\nutworów: ${total}, nierozwiązanych: ${bad.length}`);
process.exit(bad.length ? 1 : 0);
