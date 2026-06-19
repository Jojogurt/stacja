/* ============================================================
   config.js — połączenie z Supabase (tryb gry ze znajomymi)
   ------------------------------------------------------------
   Klucz publishable jest BEZPIECZNY do trzymania w kliencie
   (do tego służy). Gra używa tylko Realtime (kanały broadcast +
   presence) — żadnych tabel, żadnych danych w bazie.

   Chcesz użyć innego projektu Supabase? Podmień url + key.
   ============================================================ */
window.STACJA_CONFIG = {
  supabaseUrl: 'https://agkarxtjcgklepefurza.supabase.co',
  supabaseKey: 'sb_publishable_PhmUtO0IGY3kFwuWDuGrsQ_972DSP4B',
};
