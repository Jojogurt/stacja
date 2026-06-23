/* server/index.js — wejście Workera.
   /api/*        → REST API danych (D1) — profile, liga, mecze, drużyny, znajomi
   /parties/*    → Durable Object pokoju (realtime, na razie szkielet)
   reszta        → 404 */
import { routePartykitRequest } from 'partyserver';
import { handleApi } from './lib/api.js';
import { handleProxy } from './lib/proxies.js';

const PROXY_PATHS = ['/tracks', '/spotify', '/audio'];

export { GameRoom } from './gameRoom.js';

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
      try { return cors(await handleProxy(request, url)); }
      catch (e) { return cors(new Response('proxy error: ' + String(e && e.message || e), { status: 502 })); }
    }
    const party = await routePartykitRequest(request, env);
    if (party) return party;
    return new Response('stacja-rooms: not found', { status: 404 });
  },
};
