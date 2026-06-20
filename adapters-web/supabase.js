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
