/* server/lib/sources.js — JEDNO miejsce pobierania utworów/albumów z zewnętrznych źródeł (iTunes + Deezer).
 * Używane przez proxy `/tracks` (proxies.js) i rozwiązywanie utworu w pokoju (resolve.js).
 * Dlaczego dwa źródła: iTunes Search API zwraca 429/403 dla wspólnego adresu wyjściowego Workerów
 * Cloudflare, więc samo iTunes bywa puste. Odpytujemy OBA łącznie (Promise.allSettled) i scalamy
 * (core/sources.mergeSources: iTunes pierwszy, Deezer dopełnia i uzupełnia rok/gatunek).
 * Deezer po WYKONAWCY: /search/artist → właściwy wykonawca → /top + /albums (rok i gatunek z albumu). */
import { norm, artistMatch } from '../../core/scoring.js';
import { deezerRows, mergeSources } from '../../core/sources.js';

const ITUNES_MS = 4000, DEEZER_MS = 5000;

// GET JSON z timeoutem; 429/403/inne !ok → rzuca (wywołujący traktuje jako brak źródła)
async function getJson(url, ms){
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try{
    const r = await fetch(url, { signal: ctrl.signal });
    if(!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}

/* ---------- iTunes ---------- */
// song=true → „artysta tytuł" bez artistTerm (playlisty); domyślnie po wykonawcy
export async function itunesTracks(term, song = false){
  const q = new URLSearchParams(song
    ? { term, media: 'music', entity: 'song', limit: '25', country: 'PL' }
    : { term, media: 'music', entity: 'song', attribute: 'artistTerm', limit: '60', country: 'PL' });
  const d = await getJson('https://itunes.apple.com/search?' + q.toString(), ITUNES_MS);
  return (d.results || []).map((t) => ({
    trackName: t.trackName, artistName: t.artistName, collectionName: t.collectionName || '',
    releaseDate: t.releaseDate || '', previewUrl: t.previewUrl || '', artworkUrl100: t.artworkUrl100 || '',
    primaryGenreName: t.primaryGenreName || '',   // gust: gatunek (core normalize → genre)
  })).filter((t) => t.previewUrl);
}
// MP okładka: albumy wykonawcy (entity=album, top ≈ popularność) — kształt jak core/trackSelect.pickAlbum
export async function itunesAlbums(term){
  const q = new URLSearchParams({ term, media: 'music', entity: 'album', attribute: 'artistTerm', limit: '25', country: 'PL' });
  const d = await getJson('https://itunes.apple.com/search?' + q.toString(), ITUNES_MS);
  return (d.results || []).map((a) => ({ collectionName: a.collectionName || '', artistName: a.artistName || '',
    collectionArtistName: a.collectionArtistName || '', artworkUrl100: a.artworkUrl100 || '', releaseDate: a.releaseDate || '',
    trackCount: a.trackCount, collectionId: a.collectionId }));
}

/* ---------- Deezer ---------- */
const DZ = 'https://api.deezer.com';
// wykonawca o pasującej nazwie (najpopularniejszy wg nb_fan — „Queen" ma kilku imienników); inaczej pierwszy wynik
export function pickDeezerArtist(term, list){
  const arr = (list || []).filter((a) => a && a.id != null);
  if(!arr.length) return null;
  // najpierw dokładna nazwa (artistMatch toleruje literówki: „Queenie" ≈ „Queen"), dopiero potem tolerancja
  const exact = arr.filter((a) => norm(a.name) === norm(term));
  const hit = exact.length ? exact : arr.filter((a) => artistMatch(term, a.name || ''));
  const pool = hit.length ? hit : [arr[0]];
  return pool.reduce((b, a) => ((a.nb_fan || 0) > (b.nb_fan || 0) ? a : b));
}
export async function deezerByArtist(term){
  const s = await getJson(DZ + '/search/artist?limit=5&q=' + encodeURIComponent(term), DEEZER_MS);
  const art = pickDeezerArtist(term, s.data);
  if(!art) return [];
  const [top, albs] = await Promise.allSettled([
    getJson(DZ + '/artist/' + art.id + '/top?limit=50', DEEZER_MS),
    getJson(DZ + '/artist/' + art.id + '/albums?limit=100', DEEZER_MS),
  ]);
  if(top.status !== 'fulfilled') throw top.reason;
  return deezerRows({ tracks: top.value.data, albums: albs.status === 'fulfilled' ? albs.value.data : [] });
}
export async function deezerBySong(term){
  const d = await getJson(DZ + '/search?limit=25&q=' + encodeURIComponent(term), DEEZER_MS);
  return deezerRows({ tracks: d.data });
}
// Deezer: wyszukiwanie albumów (okładka z dzcdn — core/timing.coverStageUrl zna jej wzór rozmiaru)
export async function deezerAlbums(term){
  const d = await getJson(DZ + '/search/album?limit=25&q=' + encodeURIComponent('artist:"' + term.replace(/"/g, '') + '"'), DEEZER_MS);
  return (d.data || []).map((a) => ({ collectionName: a.title || '', artistName: (a.artist && a.artist.name) || '',
    artworkUrl100: a.cover_medium || a.cover || '', releaseDate: '', trackCount: a.nb_tracks, collectionId: a.id }));
}

/* ---------- API ---------- */
const val = (s) => (s.status === 'fulfilled' && Array.isArray(s.value) ? s.value : []);

// utwory: oba źródła łącznie → { source: 'itunes' | 'deezer' | 'itunes+deezer' | '', results }
export async function fetchTracks(term, song = false){
  const [it, dz] = await Promise.allSettled([
    itunesTracks(term, song),
    song ? deezerBySong(term) : deezerByArtist(term),
  ]);
  const a = val(it), b = val(dz);
  const source = a.length && b.length ? 'itunes+deezer' : a.length ? 'itunes' : b.length ? 'deezer' : '';
  return { source, results: mergeSources(a, b) };
}
// albumy (tryb okładka): iTunes, a gdy pusto/zablokowane — Deezer
export async function fetchAlbums(term){
  try{ const r = await itunesAlbums(term); if(r.length) return r; }catch(_e){ /* Deezer */ }
  try{ return await deezerAlbums(term); }catch(_e){ return []; }
}
