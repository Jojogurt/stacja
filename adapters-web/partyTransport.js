/* adapters-web/partyTransport.js — implementacja RealtimeTransport na Durable Object.
 *
 * Etap 2. Plain WebSocket + JSON przez partysocket (auto-reconnect, buforowanie,
 * działa też w React Native → ten sam protokół na natywie). Ładowane z CDN, więc
 * statyczna strona dalej bez build-stepu.
 *
 * Status: GOTOWE, ale NIEPODPIĘTE. app.js nadal używa Supabase Realtime.
 * Aktywacja = osobny, ostrożny krok (migracja MP w app.js na port).
 *
 * Użycie (docelowo):
 *   import { partyTransport } from './adapters-web/partyTransport.js';
 *   const t = partyTransport({ host: STACJA_CONFIG.roomsHost });   // np. stacja-rooms.<konto>.workers.dev
 *   t.onState(g => { mpGame = g; mpAfterSync(); });
 *   t.onEvent(e => { ...emotki/czat/presence... });
 *   await t.join(code, mpMe);
 *   t.send({ type:'vote', pid });
 */
import { PartySocket } from 'https://esm.sh/partysocket@1';

export function partyTransport({ host }) {
  let ps = null, onStateCb = null, onEventCb = null;

  return {
    join(roomCode, me) {
      ps = new PartySocket({ host, party: 'game-room', room: roomCode });
      ps.addEventListener('message', (e) => {
        let msg; try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.t === 'state' && onStateCb) onStateCb(msg.game);
        else if (msg.t === 'event' && onEventCb) onEventCb(msg);
      });
      return new Promise((resolve) => {
        ps.addEventListener('open', () => {
          ps.send(JSON.stringify({ t: 'hello', id: me.id, name: me.name }));
          resolve();
        }, { once: true });
      });
    },
    send(action) { if (ps) ps.send(JSON.stringify({ t: 'action', action })); },
    event(payload) { if (ps) ps.send(JSON.stringify({ t: 'event', ...payload })); },
    onState(cb) { onStateCb = cb; },
    onEvent(cb) { onEventCb = cb; },
    leave() { if (ps) { ps.close(); ps = null; } },
  };
}
