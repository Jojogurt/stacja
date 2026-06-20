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

// liga (widok agregujący) — do ekranu rankingu
export async function fetchLeague(limit=50){
  const c=sb(); if(!c) return [];
  try{
    const { data, error } = await c.from('league_standings').select('*').limit(limit);
    return error ? [] : (data||[]);
  }catch(e){ return []; }
}

// mój uid (jak zalogowany) — do podświetlenia siebie w lidze
export async function myId(){
  const c=sb(); if(!c) return null;
  try{ const { data:{ session } } = await c.auth.getSession(); return session?.user?.id || null; }
  catch(e){ return null; }
}

// profil zalogowanego: ksywka, pozycja w lidze, celność per kategoria (z match_answers).
// null = brak sesji/backendu.
export async function fetchProfile(){
  const c=sb(); if(!c) return null;
  try{
    const { data:{ session } } = await c.auth.getSession();
    const id=session?.user?.id; if(!id) return null;
    const prof = (await c.from('profiles').select('handle').eq('id',id).maybeSingle()).data;
    const standing = (await c.from('league_standings').select('matches,correct,points').eq('profile_id',id).maybeSingle()).data;
    const answers = (await c.from('match_answers').select('cat_key,ok').eq('profile_id',id)).data || [];
    const byCat={};
    answers.forEach(a=>{ const k=a.cat_key||'?'; (byCat[k]=byCat[k]||{n:0,ok:0}); byCat[k].n++; if(a.ok) byCat[k].ok++; });
    return { id, handle: prof?.handle || 'gracz', standing: standing || {matches:0,correct:0,points:0}, byCat };
  }catch(e){ return null; }
}
