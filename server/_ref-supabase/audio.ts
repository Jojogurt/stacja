// REFERENCJA (Supabase Edge Function, Deno) — do przeniesienia na trasę Workera /audio.
// Kontrakt klienta: GET /audio?u=<https url do zajawki>  →  bajty audio z CORS (+ obsługa Range).
// Proxy z allowlistą hostów (anty open-proxy) — dla trybu „od tyłu" (dekodowanie w Web Audio).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ALLOW = [
  'mzstatic.com', 'apple.com', 'phobos.apple.com', 'audio-ssl.itunes.apple.com',
  'dzcdn.net', 'deezer.com',
  'scdn.co', 'spotifycdn.com',
];

function hostOk(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return ALLOW.some((d) => h === d || h.endsWith('.' + d));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const raw = new URL(req.url).searchParams.get('u');
  if (!raw) return new Response('missing u', { status: 400, headers: CORS });
  let target: URL;
  try { target = new URL(raw); } catch { return new Response('bad url', { status: 400, headers: CORS }); }
  if (target.protocol !== 'https:' || !hostOk(target)) {
    return new Response('host not allowed', { status: 403, headers: CORS });
  }
  try {
    const range = req.headers.get('range');
    const up = await fetch(target.toString(), { headers: range ? { range } : {} });
    if (!up.ok && up.status !== 206) {
      return new Response('upstream ' + up.status, { status: 502, headers: CORS });
    }
    const h = new Headers(CORS);
    h.set('content-type', up.headers.get('content-type') || 'audio/mpeg');
    const cl = up.headers.get('content-length'); if (cl) h.set('content-length', cl);
    const cr = up.headers.get('content-range'); if (cr) h.set('content-range', cr);
    h.set('accept-ranges', 'bytes');
    h.set('cache-control', 'public, max-age=86400');
    return new Response(up.body, { status: up.status, headers: h });
  } catch {
    return new Response('fetch failed', { status: 502, headers: CORS });
  }
});
