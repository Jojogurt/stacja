// REFERENCJA (Supabase Edge Function, Deno) — do przeniesienia na trasę Workera /spotify.
// Kontrakt klienta: GET /spotify?url=<link playlisty>  →  { name, count, tracks:[{title, artist, preview}] }
// Bez kluczy/OAuth: pobiera HTML embed playlisty i parsuje __NEXT_DATA__.trackList.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json; charset=utf-8',
};
function jsonResp(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: CORS });
}
function findKey(o: any, key: string, depth = 0): any {
  if (depth > 10 || o == null) return null;
  if (Array.isArray(o)) {
    for (const v of o) { const r = findKey(v, key, depth + 1); if (r != null) return r; }
  } else if (typeof o === 'object') {
    if (key in o && o[key] != null) return o[key];
    for (const k of Object.keys(o)) { const r = findKey(o[k], key, depth + 1); if (r != null) return r; }
  }
  return null;
}
function playlistId(input: string): string {
  const m = input.match(/playlist[/:]([A-Za-z0-9]{16,})/);
  if (m) return m[1];
  const m2 = input.match(/[A-Za-z0-9]{22}/);
  return m2 ? m2[0] : '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const id = playlistId((url.searchParams.get('url') || '').trim());
  if (!id) return jsonResp({ error: 'Nie rozpoznano ID playlisty' }, 400);
  let html = '';
  try {
    const r = await fetch('https://open.spotify.com/embed/playlist/' + id, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!r.ok) return jsonResp({ error: 'Spotify zwrocil ' + r.status }, 502);
    html = await r.text();
  } catch (_e) { return jsonResp({ error: 'Nie udalo sie pobrac playlisty' }, 502); }
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return jsonResp({ error: 'Brak danych w playliscie (czy jest publiczna?)' }, 502);
  let data: any;
  try { data = JSON.parse(m[1]); } catch (_e) { return jsonResp({ error: 'Blad parsowania' }, 502); }
  const tl = findKey(data, 'trackList') || [];
  const name = findKey(data, 'name') || 'Playlista Spotify';
  const tracks = (tl as any[])
    .map((t) => ({ title: t.title, artist: t.subtitle, preview: (t.audioPreview && t.audioPreview.url) || '' }))
    .filter((t) => t.title && t.artist);
  return jsonResp({ name, count: tracks.length, tracks });
});
