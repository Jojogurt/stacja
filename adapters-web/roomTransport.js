/* adapters-web/roomTransport.js — transport klienta na AUTORYTATYWNY DO (TASK 6.3).
 *
 * `authorityChannel(code, cfg)` wystawia TĘ SAMĄ powierzchnię co `cfChannel` (relay):
 * `.on/.subscribe/.track/.send/.presenceState/.unsubscribe` — więc `mpEnterRoom` i nadawcy
 * emotek w `app.js` działają bez zmian. RÓŻNICA: tu serwer jest autorytetem — klient NIE
 * rozsyła stanu, tylko WYSYŁA AKCJE i DOSTAJE autorytatywny `{t:'state'}`. Plus komendy
 * hosta: `.startMatch/.lock/.next` i odczyt `.hostId`.
 *
 * Mapowanie `send({type:'broadcast', event, payload})`:
 *   event 'sync'             → IGNOR (stan należy do DO, klient go nie rozsyła)
 *   event 'act'              → {t:'action', action:payload}      (propose/vote/sure/pass/ready)
 *   event 'react/say/typing' → {t:'event', event, payload}       (ulotne — DO przekazuje)
 * Odbiór: {t:'state',game} → cb 'sync' ({payload:game}); {t:'event',event,payload} → cb event;
 *         {t:'presence',members,hostId} → presence cb + zapis hostId/presenceState.
 */
export function authorityChannel(code, cfg = {}) {
  const base = (window.STACJA_CONFIG && window.STACJA_CONFIG.roomsBase) || '';
  const wss = base.replace(/^http/, 'ws').replace(/\/+$/, '');
  const myId = (cfg.config && cfg.config.presence && cfg.config.presence.key) || '';

  const bcast = {};            // event → [cb]   (sync/react/say/typing)
  let presenceCb = null;
  let presence = {};           // { id:[{name}] }
  let subCb = null, myName = '';
  let ws = null, closed = false, firstOpen = true, retry = 0, retryTimer = null;

  const api = {
    hostId: null,              // ostatni autorytatywny host (z presence)

    on(kind, opts, cb) {
      if (kind === 'broadcast') { const e = opts && opts.event; (bcast[e] = bcast[e] || []).push(cb); }
      else if (kind === 'presence') { presenceCb = cb; }
      return api;
    },
    subscribe(cb) { subCb = cb; connect(); return api; },
    track({ name } = {}) { myName = name || myName; return send({ t: 'track', name: myName }); },

    // surowy „kanałowy" send z app.js — tłumaczony na protokół autorytetu
    send({ event, payload } = {}) {
      if (event === 'sync') return false;                       // stan należy do DO
      if (event === 'act')  return send({ t: 'action', action: payload });
      return send({ t: 'event', event, payload });             // react/say/typing
    },

    // komendy hosta (dodatkowe wobec cfChannel)
    startMatch(config) { return send({ t: 'start', config }); },
    lock() { return send({ t: 'lock' }); },
    next() { return send({ t: 'next' }); },

    presenceState() { return presence; },
    unsubscribe() {
      closed = true;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (ws) { try { ws.close(); } catch (_e) {} ws = null; }
      return Promise.resolve();
    },
  };

  function url() {
    const q = new URLSearchParams({ id: myId });
    if (myName) q.set('name', myName);
    let tok = null; try { tok = localStorage.getItem('stacjaToken'); } catch (_e) {}
    if (tok) q.set('t', tok);
    return `${wss}/parties/game-authority/${encodeURIComponent(code)}?${q.toString()}`;
  }

  function connect() {
    if (closed) return;
    try { ws = new WebSocket(url()); }
    catch (_e) { scheduleReconnect(); if (subCb) subCb('CHANNEL_ERROR'); return; }

    ws.onopen = () => {
      retry = 0;
      send({ t: 'hello' });
      if (myName) send({ t: 'track', name: myName });
      if (subCb) subCb('SUBSCRIBED');
      firstOpen = false;
    };
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'state') {
        (bcast['sync'] || []).forEach((cb) => { try { cb({ payload: msg.game }); } catch (_e) {} });
      } else if (msg.t === 'event') {
        (bcast[msg.event] || []).forEach((cb) => { try { cb({ payload: msg.payload }); } catch (_e) {} });
      } else if (msg.t === 'presence') {
        api.hostId = msg.hostId || null;
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

  return api;
}
