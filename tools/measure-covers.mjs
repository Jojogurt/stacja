#!/usr/bin/env node
/* tools/measure-covers.mjs — pomiar pokrycia coverów instrumentalnych (fortepian/gitara) na żywych API.
 * Dla ~40 światowych hitów × {piano, guitar} × {iTunes, Deezer /search?q=, scalone} sprawdza, czy
 * core/trackSelect.pickInstrumentalCover znajduje akceptowalny cover (dokładnie te same zapytania co resolveInstrumentalCover).
 * Tylko odczyt (GET), pauza ~300 ms między zapytaniami. Zero zależności.
 *
 *   node tools/measure-covers.mjs                    # pobiera z sieci, zapisuje cache (domyślnie /tmp/measure-covers-cache.json)
 *   node tools/measure-covers.mjs --offline          # analiza z cache (bez sieci) — do iteracji nad regułami
 *   node tools/measure-covers.mjs --accepted         # dodatkowo lista zaakceptowanych coverów do ręcznego przeglądu
 *   node tools/measure-covers.mjs --cache plik.json
 */
import fs from 'node:fs';
import { coverQueries, pickInstrumentalCover, coverTitleKey, COVER_INSTRUMENTS, sameArtist } from '../core/trackSelect.js';
import { deezerRows, mergeSources } from '../core/sources.js';

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline'), SHOW = args.includes('--accepted');
const ci = args.indexOf('--cache');
const CACHE = ci >= 0 ? args[ci + 1] : '/tmp/measure-covers-cache.json';
const PAUSE = 300;

export const HITS = [
  ['Wonderwall','Oasis'],['Africa','Toto'],['Hotel California','Eagles'],['Bohemian Rhapsody','Queen'],['Billie Jean','Michael Jackson'],
  ['Smells Like Teen Spirit','Nirvana'],['Hallelujah','Jeff Buckley'],['Yesterday','The Beatles'],['Imagine','John Lennon'],
  ["Sweet Child O' Mine","Guns N' Roses"],['Stairway to Heaven','Led Zeppelin'],['Zombie','The Cranberries'],['Creep','Radiohead'],
  ['Someone Like You','Adele'],['Shape of You','Ed Sheeran'],['Rolling in the Deep','Adele'],['Hey Jude','The Beatles'],['Let It Be','The Beatles'],
  ['Every Breath You Take','The Police'],['Take On Me','a-ha'],['Perfect','Ed Sheeran'],['Thinking Out Loud','Ed Sheeran'],
  ['Wish You Were Here','Pink Floyd'],['Nothing Else Matters','Metallica'],['Don\'t Stop Believin\'','Journey'],['Livin\' on a Prayer','Bon Jovi'],
  ['Losing My Religion','R.E.M.'],['Everybody Hurts','R.E.M.'],['With or Without You','U2'],['Tears in Heaven','Eric Clapton'],
  ['Knockin\' on Heaven\'s Door','Bob Dylan'],['Total Eclipse of the Heart','Bonnie Tyler'],['Gimme Gimme Gimme','ABBA'],['Dancing Queen','ABBA'],
  ['Wicked Game','Chris Isaak'],['Enjoy the Silence','Depeche Mode'],['Sultans of Swing','Dire Straits'],['Californication','Red Hot Chili Peppers'],
  ['Layla','Eric Clapton'],['Heal the World','Michael Jackson'],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let cache = {};
if (fs.existsSync(CACHE)) { try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (_e) { cache = {}; } }
const save = () => fs.writeFileSync(CACHE, JSON.stringify(cache));

async function getJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'stacja-measure-covers/1.0' } });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
async function itunes(q) {
  const k = 'it|' + q.toLowerCase();
  if (cache[k]) return cache[k];
  if (OFFLINE) return [];
  const p = new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: '25', country: 'PL' });
  let d;
  for (let n = 0; n < 4 && !d; n++) {   // 429 → odczekaj i ponów (limit iTunes ~20/min na IP)
    try { d = await getJson('https://itunes.apple.com/search?' + p); } catch (e) { console.error('iTunes', q, e.message); await sleep(4000 * (n + 1)); }
  }
  if (!d) return [];
  await sleep(PAUSE);
  const rows = (d.results || []).map(t => ({ trackName: t.trackName, artistName: t.artistName, collectionName: t.collectionName || '',
    releaseDate: t.releaseDate || '', previewUrl: t.previewUrl || '', artworkUrl100: t.artworkUrl100 || '', primaryGenreName: t.primaryGenreName || '' })).filter(t => t.previewUrl);
  cache[k] = rows; save(); return rows;
}
async function deezer(q) {
  const k = 'dz|' + q.toLowerCase();
  if (cache[k]) return cache[k];
  if (OFFLINE) return [];
  let d; try { d = await getJson('https://api.deezer.com/search?limit=25&q=' + encodeURIComponent(q)); } catch (e) { console.error('Deezer', q, e.message); return []; }
  if (d && d.error) { console.error('Deezer error', q, JSON.stringify(d.error)); await sleep(2000); return []; }
  await sleep(PAUSE);
  const rows = deezerRows({ tracks: d.data });
  cache[k] = rows; save(); return rows;
}

// przyczyna braku akceptacji: najdalszy etap, do którego doszedł jakikolwiek kandydat o tym samym tytule
function whyNot(rows, orig, name) {
  const inst = COVER_INSTRUMENTS[name], want = coverTitleKey(orig.track, name);
  let stage = 0; const labels = ['brak tytułu', 'brak słowa instr.', 'REJECT', 'album', 'strict', 'kolizja'];
  for (const r of rows) {
    if (!r || !r.previewUrl) continue;
    if (sameArtist(r.artistName, orig.artist) || sameArtist(orig.artist, r.artistName)) continue;
    const got = coverTitleKey(r.trackName, name);
    if (!got || got !== want) continue;
    stage = Math.max(stage, 1);
    const text = r.trackName + ' \u0001 ' + r.artistName + ' \u0001 ' + (r.collectionName || '');
    if (!inst.word.test(text)) continue;
    stage = Math.max(stage, 2);
    if (inst.reject.test(text)) continue;
    stage = Math.max(stage, 3);
    if (inst.albumOk && !inst.word.test(r.trackName + ' \u0001 ' + r.artistName) && !inst.albumOk.test(r.collectionName || '')) continue;
    stage = Math.max(stage, 4);
    if (inst.strict && !inst.strict(r)) continue;
    stage = 5;   // przeszedł wszystko poza kolizją
  }
  return labels[stage];
}

const SRC = ['itunes', 'deezer', 'merged'];
const stats = {}, reasons = {}, accepted = [];
for (const inst of ['piano', 'guitar']) for (const s of SRC) { stats[inst + '|' + s] = 0; reasons[inst + '|' + s] = {}; }
const rowsOut = [];
for (const [track, artist] of HITS) {
  const orig = { track, artist }, line = { hit: track + ' — ' + artist };
  for (const inst of ['piano', 'guitar']) {
    const by = { itunes: [], deezer: [] };
    for (const q of coverQueries(orig, inst)) {
      by.itunes = by.itunes.concat(await itunes(q));
      by.deezer = by.deezer.concat(await deezer(q));
    }
    // scalone: per zapytanie jak w kliencie (iTunes pierwszy, Deezer dopełnia) — tu przybliżenie: scal całość
    const merged = mergeSources(by.itunes, by.deezer);
    // akceptacja per zapytanie (jak resolveInstrumentalCover: pierwsze zapytanie, które daje cover) — używamy wyników z pojedynczych zapytań
    for (const s of SRC) {
      let hit = null, all = [];
      for (const q of coverQueries(orig, inst)) {
        const a = cache['it|' + q.toLowerCase()] || [], b = cache['dz|' + q.toLowerCase()] || [];
        const res = s === 'itunes' ? a : s === 'deezer' ? b : mergeSources(a, b);
        all = all.concat(res);
        hit = hit || pickInstrumentalCover(res, orig, inst);
      }
      line[inst + '|' + s] = hit ? 'OK' : '-';
      if (hit) { stats[inst + '|' + s]++; if (s === 'merged' || s === 'deezer' || s === 'itunes') accepted.push(`${inst}/${s}: ${track} — ${artist}  ⇒  "${hit.trackName}" | ${hit.artistName} | ${hit.collectionName}`); }
      else { const w = whyNot(all, orig, inst); reasons[inst + '|' + s][w] = (reasons[inst + '|' + s][w] || 0) + 1; line[inst + '|' + s] = '- ' + w; }
    }
  }
  rowsOut.push(line);
}
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('hit', 42) + ['piano', 'guitar'].map(i => SRC.map(s => pad(i[0] + ':' + s, 18)).join('')).join(''));
for (const l of rowsOut) console.log(pad(l.hit, 42) + ['piano', 'guitar'].map(i => SRC.map(s => pad(l[i + '|' + s], 18)).join('')).join(''));
console.log('\nPOKRYCIE (z ' + HITS.length + ' hitów)');
for (const inst of ['piano', 'guitar']) for (const s of SRC)
  console.log(pad(inst + ' / ' + s, 20) + pad(stats[inst + '|' + s] + '/' + HITS.length, 8) + (100 * stats[inst + '|' + s] / HITS.length).toFixed(0) + '%   odrzuty: ' + JSON.stringify(reasons[inst + '|' + s]));
if (SHOW) { console.log('\nZAAKCEPTOWANE (do ręcznego przeglądu):'); accepted.sort().forEach(a => console.log(a)); }
