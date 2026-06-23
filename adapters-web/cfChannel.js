/* adapters-web/cfChannel.js — shim kanału realtime na Durable Object (relay).
 *
 * Odtwarza 1:1 interfejs kanału Supabase Realtime, którego używa app.js (mpEnterRoom),
 * więc podmiana to jedna linia: `client.channel('stacja-'+code, cfg)` → `cfChannel(code, cfg)`.
 * Transport: natywny WebSocket do  wss://<roomsBase>/parties/game-room/<code>  (z reconnectem,
 * bez build-stepu). Protokół zgodny z `server/gameRoom.js` (relay).
 *
 * Wspierane (tyle używa app.js):
 *   .on('broadcast',{event:E}, cb)   cb({payload})        E ∈ sync|act|react|say|typing
 *   .on('presence',{event:'sync'}, cb)  cb()  → potem .presenceState()
 *   .subscribe(cb)                   cb('SUBSCRIBED' | 'CHANNEL_ERROR')
 *   .track({name})                   ustaw nick obecności
 *   .send({type:'broadcast', event, payload})   broadcast (self:true → wraca też do nadawcy)
 *   .presenceState()                 → { id:[{name}], ... }
 *   .unsubscribe()                   zamknij i posprzątaj
 */
export function cfChannel(code, cfg = {}) {
  const base = (window.STACJA_CONFIG && window.STACJA_CONFIG.roomsBase) || '';
  const wss = base.replace(/^http/, 'ws').replace(/\/+$/, '');
  const myId = (cfg.config && cfg.config.presence && cfg.config.presence.key) || '';

  const bcast = {};            // event → [cb]
  let presenceCb = null;       // handler 'presence sync'
  let presence = {};           // { id:[{name}] }  (jak Supabase presenceState)
  let subCb = null;            // callback z .subscribe
  let myName = '';             // ostatni nick (do re-track po reconnect)
  let ws = null, closed = false, firstOpen = true, retry = 0, retryTimer = null;

  function url() {
    const q = new URLSearchParams({ id: myId });
    if (myName) q.set('name', myName);
    return `${wss}/parties/game-room/${encodeURIComponent(code)}?${q.toString()}`;
  }

  function connect() {
    if (closed) return;
    try { ws = new WebSocket(url()); }
    catch (_e) { scheduleReconnect(); if (subCb) subCb('CHANNEL_ERROR'); return; }

    ws.onopen = () => {
      retry = 0;
      if (myName) send({ t: 'track', name: myName });   // odtwórz obecność po reconnect
      if (subCb) subCb('SUBSCRIBED');                    // re-track w app.js jest idempotentny
      firstOpen = false;
    };
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'b') {
        (bcast[msg.event] || []).forEach((cb) => { try { cb({ payload: msg.payload }); } catch (_e) {} });
      } else if (msg.t === 'presence') {
        presence = {};
        (msg.members || []).forEach((m) => { if (m && m.id) presence[m.id] = [{ name: m.name || '' }]; });
        if (presenceCb) { try { presenceCb(); } catch (_e) {} }
      }
    };
    ws.onerror = () => { if (firstOpen && subCb) subCb('CHANNEL_ERROR'); };
    ws.onclose = () => { ws = null; if (!closed) scheduleReconnect(); };
  }

  function scheduleReconnect() {
    if (closed || retryTimer) return;
    const delay = Math.min(1000 * Math.pow(2, retry++), 8000);
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(obj)); return true; } catch (_e) {} }
    return false;
  }

  const api = {
    on(kind, opts, cb) {
      if (kind === 'broadcast') { const e = opts && opts.event; (bcast[e] = bcast[e] || []).push(cb); }
      else if (kind === 'presence') { presenceCb = cb; }
      return api;            // łańcuchowanie jak w supabase-js
    },
    subscribe(cb) { subCb = cb; connect(); return api; },
    track({ name } = {}) { myName = name || myName; return send({ t: 'track', name: myName }); },
    send({ event, payload } = {}) { return send({ t: 'b', event, payload }); },
    presenceState() { return presence; },
    unsubscribe() {
      closed = true;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (ws) { try { ws.close(); } catch (_e) {} ws = null; }
      return Promise.resolve();
    },
  };
  return api;
}
