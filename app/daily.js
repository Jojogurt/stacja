/* app/daily.js — „Stacja dnia": stan w localStorage (jedna próba dziennie, seria dni) + udostępnianie wyniku.
 * Czysta logika (seed, plan, seria, siatka, tekst) w core/daily.js — tu tylko storage i Web API (share/schowek).
 * Liść zależności (dom.js + core/) — importują go app/solo.js (karta, mecz) i app/social.js (profil). */
import { dateKey, sanitizeDailyStore, dailyStatus, bestStreak } from '../core/daily.js';
import { lsGet, lsSet } from './dom.js';

export const DAILY_KEY = 'stacjaDaily';

// dzisiejszy klucz dnia (Europe/Warsaw). Hak testowy: window.__STACJA_TODAY__ = 'YYYY-MM-DD'.
export function todayKey(){
  const t = typeof window!=='undefined' && window.__STACJA_TODAY__;
  return (typeof t==='string' && t) ? t : dateKey(new Date());
}
export function loadDaily(){
  let o = null; try{ o = JSON.parse(lsGet(DAILY_KEY, 'null')); }catch(_e){ o = null; }
  return sanitizeDailyStore(o);
}
function saveDaily(store){ lsSet(DAILY_KEY, JSON.stringify(sanitizeDailyStore(store))); }
// stan na dziś: { key, n, record|null, streak, best, played }
export function dailyInfo(key = todayKey()){ return dailyStatus(loadDaily(), key); }
// zapis/aktualizacja rekordu dnia (pierwszy zapis = próba wykorzystana; najlepsza seria aktualizowana)
export function saveDailyRecord(rec){
  if(!rec || !rec.key) return;
  const s = loadDaily();
  s.days[rec.key] = rec;
  s.best = Math.max(s.best || 0, bestStreak(Object.keys(s.days)));
  saveDaily(s);
}
// link do gry bez parametrów (bez danych osobowych / pokoju)
export function shareUrl(){ try{ return location.origin + location.pathname; }catch(_e){ return ''; } }

/* Udostępnij tekst: navigator.share (mobile) → schowek → 'failed'. Anulowanie arkusza share = 'cancelled'. */
export async function shareText(text){
  const nav = typeof navigator!=='undefined' ? navigator : null;
  if(nav && typeof nav.share==='function'){
    try{ await nav.share({ text }); return 'shared'; }
    catch(e){ if(e && e.name==='AbortError') return 'cancelled'; /* inny błąd → schowek */ }
  }
  if(nav && nav.clipboard && typeof nav.clipboard.writeText==='function'){
    try{ await nav.clipboard.writeText(text); return 'copied'; }catch(_e){ /* brak uprawnień */ }
  }
  return 'failed';
}
