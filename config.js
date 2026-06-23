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
};
