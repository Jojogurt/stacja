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
  // TASK 6 — serwer-autorytet MP. false = relay (host-authority, dzisiejsze). true = DO jest
  // autorytetem (pętla gry na serwerze, brak SPOF). Testowo też ?authority=1 / localStorage 'stacjaAuthority'='1'.
  serverAuthority: false,
};
