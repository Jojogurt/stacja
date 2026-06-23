/* server/gameRoom.js — POKÓJ jako Durable Object w roli PRZEKAŹNIKA (relay).
 *
 * NIE pełny autorytet — host-authority zostaje w app.js (telefon hosta rozsądza
 * buzzer/orkiestrację). DO zastępuje TYLKO transport Supabase Realtime:
 *   • broadcast z `self=true`  → każdą wiadomość rozsyłamy do WSZYSTKICH (z nadawcą),
 *   • presence                 → na connect/track/disconnect rozsyłamy listę {id,name}.
 *
 * Protokół (JSON po WebSockecie), zgodny z shimem `adapters-web/cfChannel.js`:
 *   klient → DO:  {t:'track', name}              ustaw/zmień nick obecności
 *                 {t:'b', event, payload}         broadcast (sync/act/react/say/typing)
 *   DO → klient:  {t:'b', event, payload}         broadcast (też do nadawcy)
 *                 {t:'presence', members:[{id,name}]}
 *
 * Tożsamość połączenia: `?id=` (z presence.key = auth/profile id) + `?name=` (opcjonalny,
 * pierwszy nick); nick może dojść/zmienić się późniejszym `track`.
 * (PartyServer ma hibernację WS — pasuje do długo żyjącego, rzadko gadającego pokoju.)
 */
import { Server } from 'partyserver';

export class GameRoom extends Server {
  // klient się łączy → zapamiętaj tożsamość z query, rozgłoś obecność
  onConnect(conn, ctx) {
    let id = null, name = '';
    try {
      const q = new URL(ctx.request.url).searchParams;
      id = q.get('id') || null;
      name = q.get('name') || '';
    } catch (_e) { /* brak query — id dojdzie z track albo zostanie null */ }
    conn.setState({ id, name });
    this.pushPresence();
  }

  onClose() { this.pushPresence(); }
  onError() { this.pushPresence(); }

  onMessage(conn, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'track') {
      const s = conn.state || {};
      conn.setState({ id: s.id, name: msg.name || s.name || '' });
      this.pushPresence();
      return;
    }

    if (msg.t === 'b') {
      // relay broadcast do WSZYSTKICH (z nadawcą = self:true). Przekazujemy tylko
      // event+payload, by klient nie zależał od pól transportowych.
      this.broadcast(JSON.stringify({ t: 'b', event: msg.event, payload: msg.payload }));
    }
  }

  // lista obecnych {id,name} (dubel po id usuwany — ostatnie połączenie wygrywa)
  pushPresence() {
    const byId = new Map();
    for (const c of this.getConnections()) {
      const s = c.state;
      if (s && s.id) byId.set(s.id, { id: s.id, name: s.name || '' });
    }
    this.broadcast(JSON.stringify({ t: 'presence', members: [...byId.values()] }));
  }
}
