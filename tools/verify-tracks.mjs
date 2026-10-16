/* tools/verify-tracks.mjs — weryfikacja utworów odsłuchu łamigłówek (pola `track` / `tracks`) w iTunes PL.
 * Ta sama ścieżka co gra (core/trackSelect.matchSong — F5): najpierw wyszukiwanie „artysta tytuł" (entity=song),
 * potem po wykonawcy (artistTerm); utwór MUSI się zgadzać tytułem I wykonawcą i mieć previewUrl.
 * Odstęp ~300 ms między zapytaniami (limit iTunes).
 *
 *   node tools/verify-tracks.mjs                       wszystkie paczki z group:'lamiglowki'
 *   node tools/verify-tracks.mjs quiz-rebusy.json      jedna paczka
 * Wyjście: lista nierozwiązanych (exit 1, gdy są). */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { matchSong } from '../core/trackSelect.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const only = process.argv[2];
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
