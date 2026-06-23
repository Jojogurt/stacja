/* server/lib/proxies.js — proxy zewnętrznych źródeł (port z Supabase Edge Functions).
 *   GET /tracks?artist=<term>  → { source, results:[{trackName,artistName,collectionName,releaseDate,previewUrl,artworkUrl100}] }
 *   GET /spotify?url=<link>     → { name, count, tracks:[{title,artist,preview}] }
 *   GET /audio?u=<https url>    → bajty audio + CORS + Range (allowlista hostów)
 * Logika identyczna jak w `_ref-supabase/*` — zmienia się tylko opakowanie (Deno.serve → trasa Workera).
 * CORS dokłada globalnie index.js; tu pilnujemy tylko Range/content-range dla /audio. */

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/* ---------- /tracks (iTunes → fallback Deezer) ---------- */
async function fromItunes(artist) {
  const q = new URLSearchParams({ term: artist, media: 'music', entity: 'song', attribute: 'artistTerm', limit: '60', country: 'PL' });
  const r = await fetch('https://itunes.apple.com/search?' + q.toString());
  if (!r.ok) throw new Error('itunes ' + r.status);
  const d = await r.json();
  return (d.results || []).map((t) => ({
    trackName: t.trackName, artistName: t.artistName, collectionName: t.collectionName || '',
    releaseDate: t.releaseDate || '', previewUrl: t.previewUrl || '', artworkUrl100: t.artworkUrl100 || '',
  })).filter((t) => t.previewUrl);
}
async function fromDeezer(artist) {
  const q = 'artist:"' + artist.replace(/"/g, '') + '"';
  const r = await fetch('https://api.deezer.com/search?limit=60&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('deezer ' + r.status);
  const d = await r.json();
  return (d.data || []).map((t) => ({
    trackName: t.title, artistName: (t.artist && t.artist.name) || '',
    collectionName: (t.album && t.album.title) || '', releaseDate: '',
    previewUrl: t.preview || '', artworkUrl100: (t.album && (t.album.cover_medium || t.album.cover)) || '',
  })).filter((t) => t.previewUrl);
}
async function handleTracks(url) {
  const artist = (url.searchParams.get('artist') || '').trim();
  if (!artist) return json({ source: null, results: [] });
  let results = [], source = '';
  try { results = await fromItunes(artist); source = 'itunes'; } catch (_e) { /* następne źródło */ }
  if (!results.length) { try { results = await fromDeezer(artist); source = 'deezer'; } catch (_e) { /* brak */ } }
  return json({ source, results });
}

/* ---------- /spotify (HTML embed → __NEXT_DATA__.trackList) ---------- */
function findKey(o, key, depth = 0) {
  if (depth > 10 || o == null) return null;
  if (Array.isArray(o)) { for (const v of o) { const r = findKey(v, key, depth + 1); if (r != null) return r; } }
  else if (typeof o === 'object') {
    if (key in o && o[key] != null) return o[key];
    for (const k of Object.keys(o)) { const r = findKey(o[k], key, depth + 1); if (r != null) return r; }
  }
  return null;
}
function playlistId(input) {
  const m = input.match(/playlist[/:]([A-Za-z0-9]{16,})/);
  if (m) return m[1];
  const m2 = input.match(/[A-Za-z0-9]{22}/);
  return m2 ? m2[0] : '';
}
async function handleSpotify(url) {
  const id = playlistId((url.searchParams.get('url') || '').trim());
  if (!id) return json({ error: 'Nie rozpoznano ID playlisty' }, 400);
  let html = '';
  try {
    const r = await fetch('https://open.spotify.com/embed/playlist/' + id, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!r.ok) return json({ error: 'Spotify zwrocil ' + r.status }, 502);
    html = await r.text();
  } catch (_e) { return json({ error: 'Nie udalo sie pobrac playlisty' }, 502); }
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return json({ error: 'Brak danych w playliscie (czy jest publiczna?)' }, 502);
  let data;
  try { data = JSON.parse(m[1]); } catch (_e) { return json({ error: 'Blad parsowania' }, 502); }
  const tl = findKey(data, 'trackList') || [];
  const name = findKey(data, 'name') || 'Playlista Spotify';
  const tracks = tl
    .map((t) => ({ title: t.title, artist: t.subtitle, preview: (t.audioPreview && t.audioPreview.url) || '' }))
    .filter((t) => t.title && t.artist);
  return json({ name, count: tracks.length, tracks });
}

/* ---------- /audio (proxy z allowlistą hostów + Range) ---------- */
const ALLOW = [
  'mzstatic.com', 'apple.com', 'phobos.apple.com', 'audio-ssl.itunes.apple.com',
  'dzcdn.net', 'deezer.com', 'scdn.co', 'spotifycdn.com',
];
const AUDIO_MAX_BYTES = 12 * 1024 * 1024;   // S4: zajawki to ~0.5–1 MB; 12 MB = generous cap
function hostOk(u) {
  const h = u.hostname.toLowerCase();
  return ALLOW.some((d) => h === d || h.endsWith('.' + d));
}
async function handleAudio(req, url) {
  const raw = url.searchParams.get('u');
  if (!raw) return new Response('missing u', { status: 400 });
  let target;
  try { target = new URL(raw); } catch { return new Response('bad url', { status: 400 }); }
  if (target.protocol !== 'https:' || !hostOk(target)) return new Response('host not allowed', { status: 403 });
  try {
    const range = req.headers.get('range');
    // S4: redirect:'manual' → nie podążaj za 302 poza allowlistę (3xx wpadnie w gałąź 502 niżej)
    const up = await fetch(target.toString(), { headers: range ? { range } : {}, redirect: 'manual' });
    if (!up.ok && up.status !== 206) return new Response('upstream ' + up.status, { status: 502 });
    const len = parseInt(up.headers.get('content-length') || '0', 10) || 0;
    if (len > AUDIO_MAX_BYTES) return new Response('too large', { status: 413 });   // S4: limit rozmiaru zajawki
    const h = new Headers();
    h.set('content-type', up.headers.get('content-type') || 'audio/mpeg');
    const cl = up.headers.get('content-length'); if (cl) h.set('content-length', cl);
    const cr = up.headers.get('content-range'); if (cr) h.set('content-range', cr);
    h.set('accept-ranges', 'bytes');
    h.set('cache-control', 'public, max-age=86400');
    return new Response(up.body, { status: up.status, headers: h });
  } catch { return new Response('fetch failed', { status: 502 }); }
}

// router proxy — woła go index.js dla /tracks, /spotify, /audio (CORS dokłada index.js)
export async function handleProxy(req, url) {
  switch (url.pathname) {
    case '/tracks':  return handleTracks(url);
    case '/spotify': return handleSpotify(url);
    case '/audio':   return handleAudio(req, url);
    default:         return new Response('proxy: not found', { status: 404 });
  }
}
