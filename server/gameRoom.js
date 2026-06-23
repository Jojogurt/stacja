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
import { verifyToken } from './lib/auth.js';

export class GameRoom extends Server {
  // klient się łączy → zapamiętaj tożsamość z query, rozgłoś obecność
  // TASK 6.1 — tożsamość połączenia z PODPISANEGO TOKENU (nie ufamy klientowemu ?id=).
  // INTERIM (kompat wstecz, zero zrywania): token ważny → id z tokenu; brak/niepoprawny → ?id=.
  // Enforcement (odrzucanie połączeń bez ważnego tokenu) flipnie w 6.2, gdy DO przejmie autorytet.
  async onConnect(conn, ctx) {
    let id = null, name = '', verified = false;
    try {
      const q = new URL(ctx.request.url).searchParams;
      name = q.get('name') || '';
      const token = q.get('t');
      const payload = token ? await verifyToken(this.env.TOKEN_SECRET, token) : null;
      if (payload && payload.sub) { id = payload.sub; verified = true; }   // TOŻSAMOŚĆ Z TOKENU
      else id = q.get('id') || null;                                       // stary klient / zły token → fallback
    } catch (_e) { /* brak query — id dojdzie z track albo zostanie null */ }
    conn.setState({ id, name, verified });
    this.pushPresence();
  }

  onClose() { this.pushPresence(); }
  onError() { this.pushPresence(); }

  onMessage(conn, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.t === 'track') {
      const s = conn.state || {};
      conn.setState({ id: s.id, name: msg.name || s.name || '', verified: s.verified });   // nie gub tożsamości z tokenu
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
