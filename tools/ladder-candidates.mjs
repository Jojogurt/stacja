/* tools/ladder-candidates.mjs — kandydaci do paczki „Jedna litera różnicy" (data/quiz-jedna-litera.json).
 * Zbiera nazwy wykonawców (categories.js / playlists.js / lyrics.js) i tytuły utworów (playlists.js, lyrics.js,
 * opcjonalnie top wyników iTunes PL wykonawców: --itunes) i szuka par różniących się JEDNĄ literą
 * (podmiana, ta sama długość — test/lintRules.oneLetterApart), a potem drabinek A→B→C.
 * Wynik to SUROWY materiał — redakcja wybiera rozpoznawalne hasła i pisze własne opisy (fakty pewne).
 *
 *   node tools/ladder-candidates.mjs            pary + drabinki z danych lokalnych
 *   node tools/ladder-candidates.mjs --itunes   + tytuły z iTunes PL (top 25 utworów/wykonawcę, ~300 ms odstępu)
 *   node tools/ladder-candidates.mjs --words    + słownik muzyczny (gatunki/instrumenty) jako „mosty" drabinek */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { oneLetterApart } from '../test/lintRules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const sandbox = { window: {} };
for (const f of ['categories.js', 'playlists.js', 'lyrics.js']) {
  try { vm.runInNewContext(readFileSync(join(ROOT, f), 'utf8'), sandbox, { filename: f }); } catch (e) { console.warn('pomijam', f, e.message); }
}
const C = sandbox.window.CATEGORIES || {};
const names = new Map();   // hasło → źródło
const add = (s, src) => { const t = String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); if (t.length >= 4 && t.length <= 14) names.set(t, names.get(t) || src); };
const walk = (o, src) => {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o.artists)) o.artists.forEach(a => add(a, src + ':wyk'));
  if (Array.isArray(o.songs)) o.songs.forEach(s => { add(s.title, src + ':tyt'); add(s.artist, src + ':wyk'); });
  for (const v of Object.values(o)) if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, src);
};
walk(C, 'dane');

if (argv.includes('--words')) {
  ['rock', 'rap', 'soul', 'funk', 'punk', 'folk', 'jazz', 'blues', 'disco', 'opera', 'tango', 'polka', 'samba', 'salsa', 'banjo', 'piano', 'organy', 'bas',
    'trąbka', 'flet', 'harfa', 'lira', 'werbel', 'gong', 'dzwon', 'nuta', 'takt', 'rytm', 'hymn', 'pieśń', 'aria', 'ballada', 'chór', 'solo', 'duet', 'trio']
    .forEach(w => add(w, 'słowo'));
}

if (argv.includes('--itunes')) {
  const artists = [...names].filter(([, src]) => /wyk/.test(src)).map(([n]) => n).slice(0, 400);
  for (const a of artists) {
    try {
      const q = new URLSearchParams({ term: a, media: 'music', entity: 'song', attribute: 'artistTerm', limit: '25', country: 'PL' });
      const r = await fetch('https://itunes.apple.com/search?' + q).then(x => x.json());
      (r.results || []).forEach(t => add(t.trackName, 'itunes:' + a));
    } catch (_e) { /* sieć */ }
    await new Promise(r => setTimeout(r, 300));
  }
}

const list = [...names.keys()];
const byLen = new Map();
list.forEach(n => { const k = Array.from(n).length; (byLen.get(k) || byLen.set(k, []).get(k)).push(n); });
const adj = new Map();
for (const group of byLen.values()) {
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    if (oneLetterApart(group[i], group[j])) {
      (adj.get(group[i]) || adj.set(group[i], []).get(group[i])).push(group[j]);
      (adj.get(group[j]) || adj.set(group[j], []).get(group[j])).push(group[i]);
    }
  }
}
const pairs = new Set();
for (const [a, bs] of adj) for (const b of bs) pairs.add([a, b].sort().join('  ↔  '));
console.log(`hasła: ${list.length}, pary (1 litera): ${pairs.size}`);
[...pairs].sort().forEach(p => console.log('  ' + p));
console.log('\ndrabinki A → B → C:');
const seen = new Set();
for (const [b, as] of adj) {
  if (as.length < 2) continue;
  for (let i = 0; i < as.length; i++) for (let j = i + 1; j < as.length; j++) {
    const k = [as[i], b, as[j]].join(' → ');
    if (seen.has(k)) continue; seen.add(k);
    console.log(`  ${as[i]} [${names.get(as[i])}] → ${b} [${names.get(b)}] → ${as[j]} [${names.get(as[j])}]`);
  }
}
