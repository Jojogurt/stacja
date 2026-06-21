/* adapters-web/supabase.js — JEDEN współdzielony klient Supabase (Realtime + Auth + RPC).
 * Wspólny klient = jedna sesja (JWT nosi się do RPC/RLS) i brak ostrzeżenia
 * „Multiple GoTrueClient instances". Anonimowo-first: gracz dostaje trwały
 * `auth.uid` bez logowania; konto może „przejąć" historię później. */
import { captchaToken } from './captcha.js';
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
    // CAPTCHA włączona w projekcie → dołóż token hCaptcha (invisible)
    const token = await captchaToken(window.STACJA_CONFIG?.hcaptchaSiteKey);
    const { data, error } = await c.auth.signInAnonymously(token ? { options:{ captchaToken: token } } : undefined);
    if(error){ console.warn('[stacja] anonimowe logowanie:', error.message); return null; }
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

// ===== Drużyny i znajomi (MVP-1) — wszystko przez RPC SECURITY DEFINER =====
async function rpc(fn, args){
  const c=sb(); if(!c) return { error:'no-backend' };
  try{ const { data, error } = await c.rpc(fn, args||{}); return error ? { error:error.message } : { data }; }
  catch(e){ return { error:String(e?.message||e) }; }
}
export const teamCreate  = (name,emoji)=> rpc('app_create_group', { p_name:name, p_emoji:emoji });
export const teamJoin    = (code)=> rpc('app_join_group', { p_code:code });
export const teamLeave   = (id)=> rpc('app_leave_group', { p_group:id });
export const myTeams     = ()=> rpc('app_my_groups');
export const teamMembers = (id)=> rpc('app_group_members', { p_group:id });
export const friendAdd      = (code)=> rpc('app_add_friend', { p_code:code });
export const friendRespond  = (id,accept)=> rpc('app_respond_friend', { p_id:id, p_accept:accept });
export const friendsList    = ()=> rpc('app_friends');
export const pendingFriends = ()=> rpc('app_pending_friends');
export const meInfo         = ()=> rpc('app_me');

// ===== opcjonalne logowanie (anon → konto, ten sam uid) =====
export async function authInfo(){
  const c=sb(); if(!c) return null;
  try{ const { data:{ session } } = await c.auth.getSession(); const u=session?.user; if(!u) return null;
    return { id:u.id, isAnon: !!u.is_anonymous, email:u.email||null }; }catch(e){ return null; }
}
export async function linkOAuth(provider){
  const c=sb(); if(!c) return { error:'no-backend' };
  try{ const { error } = await c.auth.linkIdentity({ provider, options:{ redirectTo: location.href.split('#')[0] } });
    return error ? { error:error.message } : { ok:true }; }catch(e){ return { error:String(e?.message||e) }; }
}
export async function linkEmail(email){
  const c=sb(); if(!c) return { error:'no-backend' };
  try{ const { error } = await c.auth.updateUser({ email });
    return error ? { error:error.message } : { ok:true }; }catch(e){ return { error:String(e?.message||e) }; }
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
