/* adapters-web/supabase.js — JEDEN współdzielony klient Supabase (Realtime + Auth + RPC).
 * Wspólny klient = jedna sesja (JWT nosi się do RPC/RLS) i brak ostrzeżenia
 * „Multiple GoTrueClient instances". Anonimowo-first: gracz dostaje trwały
 * `auth.uid` bez logowania; konto może „przejąć" historię później. */
let _sb=null;

export function sb(){
  if(_sb) return _sb;
  const cfg=window.STACJA_CONFIG;
  if(!cfg || !window.supabase) return null;
  _sb=window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  return _sb;
}

// zwróć id zalogowanego usera; jak brak sesji — zaloguj anonimowo.
// null = brak backendu / anonimowe logowanie wyłączone w projekcie (gra działa dalej).
export async function ensureSession(){
  const c=sb(); if(!c) return null;
  try{
    const { data:{ session } } = await c.auth.getSession();
    if(session?.user?.id) return session.user.id;
    const { data, error } = await c.auth.signInAnonymously();
    if(error){ console.warn('[stacja] anonimowe logowanie niedostępne:', error.message); return null; }
    return data?.user?.id || null;
  }catch(e){ console.warn('[stacja] auth:', e?.message||e); return null; }
}

// ustaw ksywkę profilu (z nicka MP). Best-effort — bez sesji nic nie robi.
export async function setHandle(handle){
  const c=sb(); if(!c || !handle) return;
  try{
    const { data:{ session } } = await c.auth.getSession();
    const id=session?.user?.id; if(!id) return;
    await c.from('profiles').update({ handle }).eq('id', id);
  }catch(e){ /* nieblokujące */ }
}

// zapis wyniku przez jedyny seam record_match (Etap 1: klient; Etap 2: ten sam RPC z DO).
// Zwraca id meczu albo null (brak backendu / błąd). Nieblokujące dla UI.
export async function recordMatch(payload){
  const c=sb(); if(!c) return null;
  try{
    const { data, error } = await c.rpc('record_match', { p: payload });
    if(error){ console.warn('[stacja] record_match:', error.message); return null; }
    return data;
  }catch(e){ console.warn('[stacja] record_match:', e?.message||e); return null; }
}

// liga (widok agregujący) — do ekranu rankingu w Fazie D
export async function fetchLeague(limit=50){
  const c=sb(); if(!c) return [];
  try{
    const { data, error } = await c.from('league_standings').select('*').limit(limit);
    return error ? [] : (data||[]);
  }catch(e){ return []; }
}
