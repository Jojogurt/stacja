/* server/index.js — wejście Workera.
   /api/*        → REST API danych (D1) — profile, liga, mecze, drużyny, znajomi
   /parties/*    → Durable Object pokoju (realtime, na razie szkielet)
   reszta        → 404 */
import { routePartykitRequest } from 'partyserver';
import { handleApi } from './lib/api.js';
import { handleProxy } from './lib/proxies.js';

const PROXY_PATHS = ['/tracks', '/spotify', '/audio'];

// S3 — rate-limit proxy przez NATYWNY binding Cloudflare (platformowy, spójny w całym brzegu,
// darmowy). Per-IP, 90/60 s (konfig w wrangler.toml). Licznik w pamięci isolate'u NIE działa na
// Workers (żądania rozpraszają się po isolate'ach), dlatego binding. Brak bindingu (np. lokalnie) → nie blokuj.
async function proxyRateLimited(env, request){
  if(!env.PROXY_RL) return false;
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  try{ const { success } = await env.PROXY_RL.limit({ key: ip }); return !success; }
  catch(e){ return false; }
}

export { GameRoom } from './gameRoom.js';                  // relay (żywy MP)
export { GameAuthority } from './authorityRoom.js';        // autorytatywny pokój (TASK 6.2) — trasa /parties/game-authority/<kod>

function cors(res){
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Authorization,Content-Type,Range');
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return cors(await handleApi(request, env, url)); }
      catch (e) { return cors(new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers:{'content-type':'application/json'} })); }
    }
    if (PROXY_PATHS.includes(url.pathname)) {
      if (await proxyRateLimited(env, request)) return cors(new Response('rate limited', { status: 429 }));   // S3
      try { return cors(await handleProxy(request, url)); }
      catch (e) { return cors(new Response('proxy error: ' + String(e && e.message || e), { status: 502 })); }
    }
    const party = await routePartykitRequest(request, env);
    if (party) return party;
    return new Response('stacja-rooms: not found', { status: 404 });
  },
};
