/* adapters-web/cf.js — klient danych na Cloudflare Worker REST API (`/api/*`).
 * Zastępuje `supabase.js`. Tożsamość: device-UUID + podpisany token (HMAC) z Workera,
 * trzymany w localStorage. Brak kont/haseł/OAuth — wyczyszczenie tokenu = nowy profil
 * (jak dawniej anon-auth). Realtime idzie osobno przez `cfChannel.js` (nie tędy).
 *
 * Parytet nazw eksportów z dawnym supabase.js, więc app.js zmienia tylko ścieżkę importu.
 * Wrappery drużyn/znajomi zwracają {data}/{error} jak dawne rpc-wrappery. */

const LS_ID = 'stacjaId', LS_TOKEN = 'stacjaToken';
const base = () => (window.STACJA_CONFIG && window.STACJA_CONFIG.roomsBase) || '';
const getId = () => { try { return localStorage.getItem(LS_ID); } catch (_e) { return null; } }
const getToken = () => { try { return localStorage.getItem(LS_TOKEN); } catch (_e) { return null; } }

// niskopoziomowy fetch do API. Dokłada Bearer, parsuje JSON, rzuca przy !ok.
async function call(path, { method = 'GET', body = null } = {}) {
  const b = base(); if (!b) throw new Error('no-backend');
  const headers = {};
  const tok = getToken(); if (tok) headers['Authorization'] = 'Bearer ' + tok;
  if (body != null) headers['Content-Type'] = 'application/json';
  const r = await fetch(b + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (_e) { /* puste/nie-JSON */ }
  if (!r.ok) { const msg = (data && data.error) || ('http ' + r.status); const e = new Error(msg); e.status = r.status; throw e; }
  return data;
}
// owijka {data}/{error} dla wywołań „rpc-podobnych" (drużyny/znajomi/meInfo)
async function wrap(p) { try { return { data: await p }; } catch (e) { return { error: String(e && e.message || e) }; } }

/* ---- sesja / tożsamość ---- */
// utwórz lub odśwież sesję; zapisz {id,token}; zwróć id (null gdy brak backendu/błąd).
export async function ensureSession() {
  try {
    const me = await call('/api/session', { method: 'POST', body: {} });
    if (me && me.id) { try { localStorage.setItem(LS_ID, me.id); if (me.token) localStorage.setItem(LS_TOKEN, me.token); } catch (_e) {} return me.id; }
    return null;
  } catch (e) { console.warn('[stacja] session:', e && e.message || e); return null; }
}
export function myId() { return getId(); }
export const meInfo = () => wrap(call('/api/me').then((row) => [row]));   // parytet: {data:[row]}

export async function setHandle(handle) {
  if (!handle) return;
  try { await call('/api/handle', { method: 'POST', body: { handle } }); } catch (_e) { /* nieblokujące */ }
}

/* ---- mecze / liga / profil ---- */
export async function recordMatch(payload) {
  try { const d = await call('/api/record-match', { method: 'POST', body: payload }); return (d && d.id) || null; }
  catch (e) { console.warn('[stacja] record-match:', e && e.message || e); return null; }
}
export async function fetchLeague(limit = 50) {
  try { return (await call('/api/league?limit=' + encodeURIComponent(limit))) || []; } catch (_e) { return []; }
}
export async function fetchProfile() {
  try { return await call('/api/profile'); } catch (_e) { return null; }
}

/* ---- drużyny (zwracają {data}/{error}) ---- */
export const teamCreate  = (name, emoji) => wrap(call('/api/group/create', { method: 'POST', body: { name, emoji } }));
export const teamJoin    = (code)        => wrap(call('/api/group/join',   { method: 'POST', body: { code } }));
export const teamLeave   = (id)          => wrap(call('/api/group/leave',  { method: 'POST', body: { id } }));
export const myTeams     = ()            => wrap(call('/api/groups'));
export const teamMembers = (id)          => wrap(call('/api/group/members?id=' + encodeURIComponent(id)));

/* ---- znajomi (zwracają {data}/{error}) ---- */
export const friendAdd      = (code)       => wrap(call('/api/friend/add',     { method: 'POST', body: { code } }));
export const friendRespond  = (id, accept) => wrap(call('/api/friend/respond', { method: 'POST', body: { id, accept } }));
export const friendsList    = ()           => wrap(call('/api/friends'));
export const pendingFriends = ()           => wrap(call('/api/friends/pending'));
