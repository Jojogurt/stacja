/* adapters-web/roomTransport.js — transport klienta na AUTORYTATYWNY DO (TASK 6.3).
 *
 * `authorityChannel(code, cfg)` wystawia TĘ SAMĄ powierzchnię co `cfChannel` (relay):
 * `.on/.subscribe/.track/.send/.presenceState/.unsubscribe` — więc `mpEnterRoom` i nadawcy
 * emotek w `app.js` działają bez zmian. RÓŻNICA: tu serwer jest autorytetem — klient NIE
 * rozsyła stanu, tylko WYSYŁA AKCJE i DOSTAJE autorytatywny `{t:'state'}`. Plus komendy
 * hosta: `.startMatch/.lock/.next/.retry/.go` i odczyt `.hostId`; każdego gracza: `.more` (etap odsłony wcześniej).
 *
 * Mapowanie `send({type:'broadcast', event, payload})`:
 *   event 'sync'             → IGNOR (stan należy do DO, klient go nie rozsyła)
 *   event 'act'              → {t:'action', action:payload}      (propose/vote/sure/pass/ready)
 *   event 'react/say/typing' → {t:'event', event, payload}       (ulotne — DO przekazuje)
 * Odbiór: {t:'state',game,serverNow} → cb 'sync' ({payload:game, serverNow, recvAt}) — P1-2: zegar serwera do offsetu;
 *         {t:'event',event,payload} → cb event;
 *         {t:'presence',members,hostId} → presence cb + zapis hostId/presenceState.
 *
 * F1 (#1): STAN gry wyłącznie z {t:'state'}. {t:'event'} trafia do callbacków TYLKO dla nazw
 * z RELAY_EVENTS — nigdy 'sync'/'act' (inaczej gracz podmieniałby stan u wszystkich, nawet przez
 * stary serwer bez whitelisty). Nowy serwer dokłada `payload.from` (nadawca z tokenu).
 */
// ulotne eventy przekazywane przez DO (musi = server/authorityRoom.js RELAY_EVENTS)
export const RELAY_EVENTS = ['react', 'say', 'typing', 'advanced', 'draft'];   // draft: szkic meczu od hosta — serwer przepuszcza tylko od hosta
export function authorityChannel(code, cfg = {}) {
  const base = (window.STACJA_CONFIG && window.STACJA_CONFIG.roomsBase) || '';
  const wss = base.replace(/^http/, 'ws').replace(/\/+$/, '');
  const myId = (cfg.config && cfg.config.presence && cfg.config.presence.key) || '';

  const bcast = {};            // event → [cb]   (sync/react/say/typing)
  let presenceCb = null;
  let presence = {};           // { id:[{name}] }
  // P1-11: ksywa znana od PIERWSZEGO połączenia (?name=) — dawniej pusta do `track` → serwer dopisywał gracza jako „gracz"
  let subCb = null, myName = (cfg && typeof cfg.name === 'string') ? cfg.name : '', statusCb = null;   // 5.6: onStatus('reconnecting'|'ok')
  let ws = null, closed = false, firstOpen = true, retry = 0, retryTimer = null;
  let myShelf = null;          // gust etap 3: moja półka do „Gust stołu" — dosyłana ponownie po każdym (re)connect
  const emitStatus = (s)=>{ if(statusCb) try{ statusCb(s); }catch(_e){} };

  const api = {
    hostId: null,              // ostatni autorytatywny host (z presence)
    serverModes: null,         // F8a: tryby znane serwerowi (presence.modes); null = stary serwer → tylko dawne tryby
    serverCaps: [],            // gust etap 3: capability serwera (presence.caps, np. 'tableTaste'); stary serwer → []
    shelves: [],               // gust etap 3: [{id, n}] — kto z obecnych dosłał półkę (presence.shelves)
    readyIds: [],              // „Gotowy ✓” w lobby / przy rewanżu (presence.ready; stary serwer → [])

    on(kind, opts, cb) {
      if (kind === 'broadcast') { const e = opts && opts.event; (bcast[e] = bcast[e] || []).push(cb); }
      else if (kind === 'presence') { presenceCb = cb; }
      else if (kind === 'status') { statusCb = cb; }   // 5.6
      return api;
    },
    subscribe(cb) { subCb = cb; connect(); return api; },
    track({ name } = {}) { myName = name || myName; return send({ t: 'track', name: myName }); },

    // surowy „kanałowy" send z app.js — tłumaczony na protokół autorytetu
    send({ event, payload } = {}) {
      if (event === 'sync') return false;                       // stan należy do DO
      if (event === 'act')  return send({ t: 'action', action: payload });
      if (!RELAY_EVENTS.includes(event)) return false;          // F1: tylko znane ulotne eventy
      return send({ t: 'event', event, payload });             // react/say/typing/advanced
    },

    // komendy hosta (dodatkowe wobec cfChannel)
    startMatch(config) { return send({ t: 'start', config }); },
    lock() { return send({ t: 'lock' }); },
    next() { return send({ t: 'next' }); },
    retry() { return send({ t: 'retry' }); },   // 1.3: host ponawia rundę zablokowaną w NETERR/NOLYRIC
    go() { return send({ t: 'go' }); },         // F2b #6: host „pomiń czekających" w ARMING (stary serwer: ignoruje)
    lobbyReady(on) { return send({ t: 'lobbyReady', on: on === true }); },   // „Gotowy ✓” (toggle; stary serwer: ignoruje)
    more(playNonce, stage) { return send({ t: 'more', playNonce, stage }); },   // MP okładka/intro: „+ więcej"/„wyraźniej" — dowolny gracz (stary serwer: ignoruje)
    // gust etap 3: półka do „Gust stołu" (items = top ❤️ {title,artist,year}; [] = wycofaj). Zapamiętana do reconnectu.
    shareShelf(items) { myShelf = Array.isArray(items) ? items : []; return send({ t: 'shelf', items: myShelf }); },

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
      send({ t: 'hello', caps: ['adv'] });   // pokój mieszany: ten klient wysyła `advanced` po „dalej” także poza salonem
      if (myName) send({ t: 'track', name: myName });
      if (myShelf && myShelf.length) send({ t: 'shelf', items: myShelf });   // gust etap 3: DO mógł zgubić półkę
      if (subCb) subCb('SUBSCRIBED');
      if (!firstOpen) emitStatus('ok');   // 5.6: wróciliśmy po zerwaniu
      firstOpen = false;
    };
    ws.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'state') {
        const recvAt = Date.now();
        const serverNow = Number.isFinite(msg.serverNow) ? msg.serverNow : null;   // stary serwer → null
        (bcast['sync'] || []).forEach((cb) => { try { cb({ payload: msg.game, serverNow, recvAt }); } catch (_e) {} });
      } else if (msg.t === 'event') {
        // F1 (#1): event ≠ stan — 'sync'/'act'/nieznane nazwy odrzucane (stan tylko z t:'state')
        if (!RELAY_EVENTS.includes(msg.event)) return;
        const p = (msg.payload && typeof msg.payload === 'object') ? msg.payload : {};
        if (msg.from && !p.from) p.from = msg.from;              // nadawca z koperty (nowy serwer)
        (bcast[msg.event] || []).forEach((cb) => { try { cb({ payload: p, from: p.from || null }); } catch (_e) {} });
      } else if (msg.t === 'presence') {
        api.hostId = msg.hostId || null;
        if (Array.isArray(msg.modes)) api.serverModes = msg.modes.filter((m) => typeof m === 'string').slice(0, 32);   // F8a: capability
        api.serverCaps = Array.isArray(msg.caps) ? msg.caps.filter((m) => typeof m === 'string').slice(0, 16) : [];
        api.shelves = Array.isArray(msg.shelves) ? msg.shelves.filter((x) => x && typeof x.id === 'string')
          .map((x) => ({ id: x.id, n: Math.max(0, Math.min(20, x.n | 0)) })).slice(0, 64) : [];
        api.readyIds = Array.isArray(msg.ready) ? msg.ready.filter((x) => typeof x === 'string').slice(0, 64) : [];
        presence = {};
        (msg.members || []).forEach((m) => { if (m && m.id) presence[m.id] = [{ name: m.name || '', adv: m.adv === true }]; });
        if (presenceCb) { try { presenceCb(); } catch (_e) {} }
      }
    };
    ws.onerror = () => { if (firstOpen && subCb) subCb('CHANNEL_ERROR'); };
    ws.onclose = (ev) => {
      ws = null;
      if (ev && ev.code === 4001) { closed = true; if (subCb) subCb('CHANNEL_ERROR'); return; }   // odrzut auth → nie reconnectuj
      if (!closed) scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (closed || retryTimer) return;
    emitStatus('reconnecting');   // 5.6: pasek „łączę ponownie…"
    const delay = Math.min(1000 * Math.pow(2, retry++), 8000);
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
  }
  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(obj)); return true; } catch (_e) {} }
    return false;
  }

  return api;
}
