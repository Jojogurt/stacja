/* ============================================================
   config.js — połączenie z backendem STACJA (Cloudflare Worker)
   ------------------------------------------------------------
   Cały backend (profile, liga, mecze, drużyny, znajomi, realtime,
   proxy iTunes/Spotify/audio) stoi na jednym Workerze. Bez kont,
   bez kluczy w kliencie — tożsamość to device-UUID + podpisany token
   wydawany przez Worker (trzymany w localStorage).

   Inny deploy Workera? Podmień `roomsBase`.
   ============================================================ */
window.STACJA_CONFIG = {
  roomsBase: 'https://stacja-rooms.kedziora-karol.workers.dev',
  // TASK 6 — serwer-autorytet MP. true = DO jest autorytetem (pętla gry na serwerze, brak SPOF).
  // false = relay (host-authority, stare). Rollback bez deployu: ?authority=0 lub localStorage 'stacjaAuthority'='0'.
  serverAuthority: true,
  // OAuth (logowanie Google/Apple — wymagane do drużyn/znajomych). Publiczne identyfikatory klienta.
  // Wpisz po utworzeniu w konsolach. Pusty = przycisk ukryty. (Te same wartości w Worker [vars].)
  googleClientId: '457977357449-dfbs62prkpt65m4rv92lm7pqda0ge08t.apps.googleusercontent.com',
  appleServicesId: 'com.kked.apps.stacja.web',
};
// DEV: lokalny Worker (`wrangler dev`) — `?rooms=http://127.0.0.1:8787` (zapamiętane w localStorage 'stacjaRooms').
// Akceptowane WYŁĄCZNIE, gdy strona stoi na localhost/127.0.0.1 i adres też jest lokalny — produkcji nie da się przekierować.
(function devRoomsOverride(){
  try{
    const local=/^(localhost|127\.0\.0\.1|\[::1\])$/;
    if(!local.test(location.hostname)) return;
    const okUrl=(u)=> typeof u==='string' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?\/?$/.test(u);
    const q=new URLSearchParams(location.search).get('rooms');
    if(q==='0' || q===''){ localStorage.removeItem('stacjaRooms'); return; }
    if(okUrl(q)) localStorage.setItem('stacjaRooms', q);
    const v=localStorage.getItem('stacjaRooms');
    if(okUrl(v)) window.STACJA_CONFIG.roomsBase=v.replace(/\/$/,'');
  }catch(_e){}
})();
