/* server/index.js — wejście Workera.
   /api/*        → REST API danych (D1) — profile, liga, mecze, drużyny, znajomi
   /parties/*    → Durable Object pokoju (realtime, na razie szkielet)
   reszta        → 404 */
import { routePartykitRequest } from 'partyserver';
import { handleApi } from './lib/api.js';

export { GameRoom } from './gameRoom.js';

function cors(res){
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
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
    const party = await routePartykitRequest(request, env);
    if (party) return party;
    return new Response('stacja-rooms: not found', { status: 404 });
  },
};
