/* server/gameRoom.js — POKÓJ jako Durable Object w roli PRZEKAŹNIKA (relay).
 *
 * NIE pełny autorytet — host-authority zostaje w app.js (telefon hosta rozsądza
 * buzzer/orkiestrację). DO zastępuje TYLKO transport Supabase Realtime:
 *   • broadcast z `self=true`  → każdą wiadomość rozsyłamy do WSZYSTKICH (z nadawcą),
 *   • presence                 → na connect/track/disconnect rozsyłamy listę {id,name}.
 *
 * Protokół (JSON po WebSockecie), zgodny z shimem `adapters-web/cfChannel.js`:
 *   klient → DO:  {t:'track', name}              ustaw/zmień nick obecności
 *                 {t:'b', event, payload}         broadcast (sync/act/react/say/typing/advanced)
 *   DO → klient:  {t:'b', event, payload, from}   broadcast (też do nadawcy); `from` = id nadawcy z TOKENU
 *                 {t:'presence', members:[{id,name}]}
 *
 * Tożsamość połączenia: podpisany token (`?t=`) + `?name=` (opcjonalny, pierwszy nick);
 * nick może dojść/zmienić się późniejszym `track`.
 *
 * F1 — ten sam DO obsługuje TRZY rodzaje kanałów (po nazwie pokoju):
 *   • pokój gry (rollback `?authority=0`): whitelista eventów, nadawca wymuszony (`from`, `by`, `byName`),
 *     `sync` (stan gry) tylko od HOSTA relay = pierwszy zweryfikowany łączący (#1 w trybie relay),
 *   • `team-<kod>` (lobby drużyny): tylko `gamestart`, nadawca wymuszony,
 *   • `user-<id>` (zaproszenia znajomych, #10): słucha WYŁĄCZNIE właściciel (token.sub === id);
 *     inni łączą się tylko do NADANIA `invite` — nie dostają nic (presence/zaproszeń innych),
 *     nadawca musi być zaakceptowanym znajomym (D1), rate-limit, by/byName z serwera.
 * (PartyServer ma hibernację WS — pasuje do długo żyjącego, rzadko gadającego pokoju.)
 */
import { Server } from 'partyserver';
import { verifyToken } from './lib/auth.js';

const NAME_MAX = 40;
const EVENT_PAYLOAD_MAX = 500;                 // cap ulotnych eventów (nie dotyczy `sync`/`act` hosta)
const SYNC_PAYLOAD_MAX = 512*1024;             // cap stanu gry od hosta relay (anty-OOM)
const REACTIONS = ['😂','🔥','🎉','🤔','😱','🖕'];
const HOST_RESET_MS = 2*60*1000;               // pusty pokój dłużej niż to → następny łączący zostaje hostem
// dozwolone eventy per rodzaj kanału (musi = adapters-web/cfChannel.js)
export const ROOM_EVENTS = ['sync','act','react','say','typing','advanced'];
export const TEAM_EVENTS = ['gamestart'];
export const USER_EVENTS = ['invite'];
// token bucket per połączenie (rate/s, burst)
const RATE = {
  sync:   { rate:20,   burst:40 },             // host relay pcha stan przy każdej zmianie
  act:    { rate:8,    burst:20 },
  event:  { rate:10,   burst:10 },
  meta:   { rate:1,    burst:4  },
  invite: { rate:0.1,  burst:3  },             // max ~3 zaproszenia naraz, potem 1 / 10 s
};

export function channelKind(name){
  const n = String(name||'');
  if(n.startsWith('user-')) return 'user';
  if(n.startsWith('team-')) return 'team';
  return 'room';
}

export class GameRoom extends Server {
  hostId = null;          // relay: host pokoju gry (pierwszy zweryfikowany łączący) — jedyny nadawca `sync`
  emptyAt = null;         // kiedy pokój opustoszał (reset hosta po HOST_RESET_MS)

  constructor(ctx, env){
    super(ctx, env);
    if(ctx && ctx.blockConcurrencyWhile && ctx.storage){
      ctx.blockConcurrencyWhile(async () => {
        try{
          const s = await ctx.storage.get(['hostId','emptyAt']);
          this.hostId = (s && s.get('hostId')) || null;
          this.emptyAt = (s && s.get('emptyAt')) || null;
        }catch(_e){}
      });
    }
  }
  kind(){ return channelKind(this.name); }
  ownerId(){ return this.kind()==='user' ? String(this.name).slice(5) : null; }
  async save(){ try{ await this.ctx.storage.put({ hostId:this.hostId, emptyAt:this.emptyAt }); }catch(_e){} }

  // klient się łączy → tożsamość z PODPISANEGO TOKENU (HARD-REQUIRE: bez ważnego tokenu odrzut)
  async onConnect(conn, ctx) {
    let id = null, name = '';
    try {
      const q = new URL(ctx.request.url).searchParams;
      name = (q.get('name') || '').slice(0, NAME_MAX);
      const payload = await verifyToken(this.env.TOKEN_SECRET, q.get('t'));   // bez tokenu → null
      if (payload && payload.sub) id = payload.sub;
    } catch (_e) { /* zostanie null → odrzut */ }
    if (!id) { try { conn.close(4001, 'auth'); } catch (_e) {} return; }       // koniec fallbacku ?id=
    const owner = this.kind()==='user' ? id===this.ownerId() : undefined;
    conn.setState({ id, name, verified: true, ...(owner!==undefined ? { owner } : {}) });
    if(this.kind()==='room'){
      // host relay = pierwszy łączący; po dłuższym opustoszeniu pokój „zapomina" hosta (nowa gra pod tym kodem)
      if(this.hostId && this.emptyAt && Date.now()-this.emptyAt > HOST_RESET_MS) this.hostId = null;
      if(!this.hostId) this.hostId = id;
      this.emptyAt = null;
      await this.save();
    }
    this.pushPresence();
  }

  async onClose(conn) {
    this.pushPresence();
    if(this.kind()==='room' && [...this.getConnections()].filter(c => c !== conn).length === 0){
      this.emptyAt = Date.now(); await this.save();
    }
  }
  onError() { this.pushPresence(); }

  async onMessage(conn, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if(!msg || typeof msg!=='object') return;
    const s = conn.state || {};
    if(!s.id) return;

    if (msg.t === 'track') {
      if(!this.allowRate(conn, 'meta')) return;
      const nm = typeof msg.name==='string' ? msg.name.trim().slice(0, NAME_MAX) : '';
      conn.setState({ ...s, name: nm || s.name || '' });   // nie gub tożsamości z tokenu
      this.pushPresence();
      return;
    }

    if (msg.t === 'b') {
      const kind = this.kind(), ev = msg.event;
      if(kind==='user'){ await this.onInvite(conn, ev, msg.payload); return; }
      const allowed = kind==='team' ? TEAM_EVENTS : ROOM_EVENTS;
      if(!allowed.includes(ev)) return;                       // F1: whitelista nazw eventów
      if(!this.allowRate(conn, (ev==='sync'||ev==='act') ? ev : 'event')) return;
      const src = msg.payload;
      if(!src || typeof src!=='object' || Array.isArray(src)) return;
      let payload;
      if(ev==='sync'){
        // F1 (#1, relay): stan gry nadaje TYLKO host relay — gracz nie podmieni stanu u wszystkich
        if(s.id !== this.hostId) return;
        payload = src;                                        // stan 1:1 (nadawca w kopercie `from`)
      } else {
        // F1 (#4): nadawca wymuszony z tokenu (act: autor akcji, której host użyje do głosów/typów)
        payload = { ...src, from: s.id, by: s.id, byName: s.name || '' };
        if(ev==='react' && !REACTIONS.includes(payload.emoji)) return;
      }
      let out; try { out = JSON.stringify({ t: 'b', event: ev, payload, from: s.id }); } catch(_e) { return; }
      const cap = ev==='sync' ? SYNC_PAYLOAD_MAX : (ev==='act' ? 4*EVENT_PAYLOAD_MAX : EVENT_PAYLOAD_MAX);
      if(out.length > cap + 200) return;
      this.broadcast(out);
    }
  }

  // F1 (#10): `user-<id>` — nadać `invite` może tylko zaakceptowany znajomy właściciela; dostarczamy
  // WYŁĄCZNIE do połączeń właściciela, z by/byName z serwera (handle z D1), z rate-limitem.
  async onInvite(conn, ev, src){
    const s = conn.state || {};
    if(ev!=='invite' || s.owner) return;                       // właściciel nic nie nadaje na własny kanał
    if(!this.allowRate(conn, 'invite')) return;
    const code = String((src && src.code) || '').replace(/[^A-Za-z0-9]/g,'').slice(0, 8);
    if(!code) return;
    const owner = this.ownerId();
    const sender = await this.friendInfo(s.id, owner);
    if(!sender) return;                                        // nie-znajomy / brak D1 → odrzuć (fail-closed)
    const out = JSON.stringify({ t:'b', event:'invite', from:s.id,
      payload:{ code, by:s.id, from:s.id, byName: (sender.handle || s.name || 'Znajomy').slice(0, 32) } });
    for(const c of this.getConnections()){ if(c.state && c.state.owner){ try{ c.send(out); }catch(_e){} } }
  }
  // zaakceptowana relacja znajomości (friend_requests) + handle nadawcy; null gdy brak
  async friendInfo(fromId, toId){
    const db = this.env && this.env.DB;
    if(!db || !fromId || !toId || fromId===toId) return null;
    try{
      const row = await db.prepare(
        `SELECT p.handle AS handle FROM friend_requests f JOIN profiles p ON p.id=?
         WHERE f.status='accepted' AND ((f.from_id=? AND f.to_id=?) OR (f.from_id=? AND f.to_id=?)) LIMIT 1`
      ).bind(fromId, fromId, toId, toId, fromId).first();
      return row ? { handle: row.handle || '' } : null;
    }catch(_e){ return null; }
  }

  // token bucket per połączenie (stan ulotny na obiekcie połączenia)
  allowRate(conn, kind, now=Date.now()){
    const cfg = RATE[kind] || RATE.event;
    const all = conn._tb || (conn._tb = {});
    const b = all[kind] || (all[kind] = { tokens:cfg.burst, ts:now });
    b.tokens = Math.min(cfg.burst, b.tokens + (now-b.ts)/1000*cfg.rate); b.ts = now;
    if(b.tokens < 1) return false;
    b.tokens -= 1; return true;
  }

  // lista obecnych {id,name} (dubel po id usuwany — ostatnie połączenie wygrywa).
  // `user-<id>`: presence tylko do właściciela (nadawcy zaproszeń nic nie widzą).
  pushPresence() {
    const byId = new Map();
    for (const c of this.getConnections()) {
      const s = c.state;
      if (s && s.id && (this.kind()!=='user' || s.owner)) byId.set(s.id, { id: s.id, name: s.name || '' });
    }
    const out = JSON.stringify({ t: 'presence', members: [...byId.values()] });
    if(this.kind()==='user'){
      for(const c of this.getConnections()){ if(c.state && c.state.owner){ try{ c.send(out); }catch(_e){} } }
      return;
    }
    this.broadcast(out);
  }
}
