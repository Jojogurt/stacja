/* server/gameRoom.js — autorytet POKOJU jako Durable Object (Cloudflare).
 *
 * Jeden żywy obiekt na pokój. Trzyma stan gry w pamięci, jest jedynym arbitrem
 * (sprawiedliwy buzzer = serwer stempluje kolejność), rozsyła stan po WebSockecie.
 *
 * KLUCZOWE: odpala TEN SAM czysty reducer co web — `core/mpReducer.js`. Autorytet
 * przenosi się z telefonu hosta na serwer bez przepisywania reguł gry.
 *
 * Status: SZKIELET. Akcje gracza (vote/propose/sure/unpropose) + przekazywanie
 * zdarzeń (emotki/czat) + obecność — działają. Orkiestracja hosta (losowanie
 * utworu, faza gotowości, zatwierdzanie, następne pytanie) jest STUBem do
 * doportowania z app.js — patrz TODO niżej. Niepodpięte do produkcji.
 */
import { Server } from 'partyserver';
import { reduceAction, evaluateAnswer } from '../core/mpReducer.js';
import { MP } from '../core/phases.js';

const fresh = () => ({ phase: null, proposals: [], sure: [], results: [], score: 0 });

export class GameRoom extends Server {
  // stan współdzielony pokoju (autorytatywny)
  game = fresh();
  hostId = null;

  // klient łączy się → wyślij mu bieżący stan
  onConnect(conn) {
    conn.send(JSON.stringify({ t: 'state', game: this.game }));
    this.pushPresence();
  }

  onClose() { this.pushPresence(); }

  onMessage(conn, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.t) {
      case 'hello':
        // tożsamość połączenia = auth.uid (przekazany przez klienta)
        conn.setState({ id: msg.id, name: msg.name });
        if (!this.hostId) this.hostId = msg.id;           // pierwszy = host (na razie)
        conn.send(JSON.stringify({ t: 'state', game: this.game }));
        this.pushPresence();
        break;

      case 'action': {
        // akcje gracza w fazie gry — CZYSTY reducer (ten sam plik co web)
        if (reduceAction(this.game, msg.action)) this.broadcastState();
        // TODO(orkiestracja hosta): 'buzz' (kto pierwszy — serwer rozsądza),
        //   'lock' → evaluateAnswer(...), 'next' → matchAdvance + nowa runda.
        //   Doportować z app.js: mpHostNewRound (losowanie utworu BEZ CORS —
        //   serwer uderza wprost w iTunes/Deezer), mpArm/mpGo (faza gotowości),
        //   mpLock (evaluateAnswer), mpNext/mpFinish, zapis przez record_match.
        break;
      }

      case 'event':
        // ulotne (emotki/czat) — przekaż innym, bez zmiany stanu
        this.broadcast(raw, [conn.id]);
        break;
    }
  }

  broadcastState() {
    this.broadcast(JSON.stringify({ t: 'state', game: this.game }));
  }

  pushPresence() {
    const members = [...this.getConnections()]
      .map(c => c.state)
      .filter(s => s && s.id)
      .map(s => ({ id: s.id, name: s.name }));
    this.broadcast(JSON.stringify({ t: 'event', kind: 'presence', members, hostId: this.hostId }));
  }
}
