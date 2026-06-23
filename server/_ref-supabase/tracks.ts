// REFERENCJA (Supabase Edge Function, Deno) — do przeniesienia na trasę Workera /tracks.
// Kontrakt klienta: GET /tracks?artist=<term>  →  { source, results:[{trackName,artistName,collectionName,releaseDate,previewUrl,artworkUrl100}] }
// Logika identyczna na Workerze (fetch/Response/URL te same) — zmienia się tylko opakowanie handlera.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json; charset=utf-8',
};

function jsonResp(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: CORS });
}

async function fromItunes(artist: string) {
  const q = new URLSearchParams({ term: artist, media: 'music', entity: 'song', attribute: 'artistTerm', limit: '60', country: 'PL' });
  const r = await fetch('https://itunes.apple.com/search?' + q.toString());
  if (!r.ok) throw new Error('itunes ' + r.status);
  const d = await r.json();
  return (d.results || []).map((t: any) => ({
    trackName: t.trackName, artistName: t.artistName, collectionName: t.collectionName || '',
    releaseDate: t.releaseDate || '', previewUrl: t.previewUrl || '',
    artworkUrl100: t.artworkUrl100 || '',
  })).filter((t: any) => t.previewUrl);
}

async function fromDeezer(artist: string) {
  const q = 'artist:"' + artist.replace(/"/g, '') + '"';
  const r = await fetch('https://api.deezer.com/search?limit=60&q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('deezer ' + r.status);
  const d = await r.json();
  return (d.data || []).map((t: any) => ({
    trackName: t.title, artistName: (t.artist && t.artist.name) || '',
    collectionName: (t.album && t.album.title) || '', releaseDate: '',
    previewUrl: t.preview || '',
    artworkUrl100: (t.album && (t.album.cover_medium || t.album.cover)) || '',
  })).filter((t: any) => t.previewUrl);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const artist = (url.searchParams.get('artist') || '').trim();
  if (!artist) return jsonResp({ source: null, results: [] });
  let results: any[] = [];
  let source = '';
  try { results = await fromItunes(artist); source = 'itunes'; } catch (_e) { /* nastepne zrodlo */ }
  if (!results.length) {
    try { results = await fromDeezer(artist); source = 'deezer'; } catch (_e) { /* brak */ }
  }
  return jsonResp({ source, results });
});
