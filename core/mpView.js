/* core/mpView.js — czyste helpery WIDOKU multiplayera (pakiet P2 przeglądu MP 2026-10, „dopracowanie wizualne").
 * Bez DOM/fetch: copy (losowanie, liczebniki, placeholdery pól łamigłówek), lista zagranych utworów i skala wyniku
 * na ekranie końcowym (P2-11), tekst udostępnienia wyniku, głośność dźwięków faz wg roli ekranu (P2-14).
 * Warstwa app/ (mp-render, mp, sfx, mpResultCard) tylko składa HTML / gra dźwięk / rysuje kartę z tych danych. */
import { norm } from './scoring.js';

/* ---- liczebniki (polska odmiana: 1 typ · 2–4 typy · 0/5+ typów; 12–14 → „typów") ---- */
export function plural(n, one, few, many){
  const a = Math.abs(Math.trunc(Number(n) || 0));
  if(a === 1) return one;
  const d = a % 10, h = a % 100;
  return (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) ? few : many;
}
export const countText = (n, one, few, many) => `${Math.max(0, Math.trunc(Number(n) || 0))} ${plural(n, one, few, many)}`;
export const typCountText = (n) => countText(n, 'typ', 'typy', 'typów');   // P2-9: dawniej „0 typy"

/* P2-9: kto losuje — przy serwerze-autorytecie „serwer losuje…" (dawniej „host losuje" — nieprawda), relay: host sam / gość czeka */
export function loadingText({ authority = false, host = false, mode = '' } = {}){
  const what = mode === 'quiz' ? 'pytanie' : 'utwór';
  if(authority) return `serwer losuje ${what}…`;
  return host ? `losuję ${what}…` : `host losuje ${what}…`;
}

/* P2-5: placeholder pola slotu — łamigłówki („Jedna litera różnicy") mają sloty „1", „2", „3", które nic nie mówią → „słowo 1" */
export function slotPlaceholder(label){
  const l = String(label == null ? '' : label).trim();
  return /^\d{1,2}$/.test(l) ? `słowo ${l}` : l;
}

/* ---- P2-11: wynik meczu — skala i lista zagranych utworów ---- */
// bazowe maksimum za pytanie (bez premii za szybkość/serię/pewniaka): muzyka tytuł 50 + wykonawca 50, wiedza/ABCD 100, rok dokładnie 100
export const SCALE_PER_Q = 100;
export function scoreScale(played){ const n = Math.max(0, Math.trunc(Number(played) || 0)); return n * SCALE_PER_Q; }

const str = (v, max) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim().slice(0, max) : '';
const httpsUrl = (v) => (typeof v === 'string' && /^https:\/\//.test(v) && v.length < 600) ? v : '';
const keyOf = (t) => norm(t.artist) + '|' + norm(t.title);
// wpis listy z dowolnego źródła (historia klienta / game.results serwera) — tylko bezpieczne, przycięte pola
function cleanEntry(x){
  if(!x || typeof x !== 'object') return null;
  const title = str(x.title != null ? x.title : x.track, 120), artist = str(x.artist, 120);
  if(!title || !artist || !norm(title) || !norm(artist)) return null;   // quiz bez utworu (sama treść pytania) — poza listą
  return { title, artist, year: str(x.year, 12), art: httpsUrl(x.art), preview: httpsUrl(x.preview), cat: str(x.cat, 60),
    ok: x.ok === true, gained: Math.max(0, Math.round(Number(x.gained) || 0)) };
}
/* Lista zagranych utworów: kolejność i komplet z `results` (serwer, stan DONE — także dla dołączających w trakcie),
 * wzbogacona historią TEGO klienta (okładka, rok, zajawka, wynik MOJEJ drużyny, +N) dopasowaną po wykonawca|tytuł.
 * Historia bez wpisu w results (stary host relay) dopisywana na końcu. Duplikaty (ten sam utwór 2×) — raz. */
export function matchPlaylist({ results = [], history = [], max = 30 } = {}){
  const hist = (Array.isArray(history) ? history : []).map(cleanEntry).filter(Boolean);
  const used = new Set(), out = [], seen = new Set();
  const push = (e) => { const k = keyOf(e); if(seen.has(k) || out.length >= max) return; seen.add(k); out.push(e); };
  for(const r of (Array.isArray(results) ? results : [])){
    const base = cleanEntry(r); if(!base) continue;
    const k = keyOf(base);
    const hi = hist.findIndex((h, i) => !used.has(i) && keyOf(h) === k);
    if(hi >= 0){ used.add(hi); const h = hist[hi]; push({ ...base, ...h, title: h.title || base.title, artist: h.artist || base.artist, cat: h.cat || base.cat }); }
    else push(base);
  }
  hist.forEach((h, i) => { if(!used.has(i)) push(h); });
  return out;
}
/* liczba rozegranych pytań i trafień (do „4/5 trafionych"): z perspektywy TEGO gracza (historia klienta: ✓ MOJEJ drużyny),
 * gdy obejmuje cały mecz; inaczej (dołączył w trakcie / TV bez drużyny) — results serwera (ok = drużyna prowadząca w pytaniu) */
export function matchTally({ results = [], history = [] } = {}){
  const rs = Array.isArray(results) ? results.filter(r => r && typeof r === 'object') : [];
  const hs = Array.isArray(history) ? history.filter(h => h && typeof h === 'object') : [];
  const src = hs.length && hs.length >= rs.length ? hs : rs;
  return { played: Math.max(src.length, rs.length), hits: src.filter(r => r.ok === true).length };
}

/* tekst do udostępnienia wyniku (share / schowek) — bez danych osobowych poza ksywą zwycięzcy (już widoczną przy stole) */
export function resultShareText({ appName = '', score = 0, scale = 0, hits = 0, played = 0, comp = false, winner = '', tie = false, url = '' } = {}){
  const lines = [`🎧 ${appName || 'Muzyczny quiz'} — mecz ze znajomymi`];
  lines.push(`⭐ ${Math.round(Number(score) || 0)}${scale > 0 ? ' / ' + Math.round(scale) : ''} pkt` + (played > 0 ? ` · ${hits}/${played} trafionych` : ''));
  if(comp) lines.push(tie ? '🤝 Remis!' : (winner ? `🏆 ${str(winner, 40)} wygrywa!` : ''));
  if(url) lines.push(`Zagraj z nami: ${url}`);
  return lines.filter(Boolean).join('\n');
}

/* ---- P2-14: dźwięki faz (sting startu, whoosh karty, werbel przed odsłoną) wg roli ekranu ----
 * TV salonu — głośniej/wyraźniej (słychać z kanapy); telefon-pilot w salonie — wyciszony (TV gra za cały stół);
 * zwykły telefon — 1×. Pozostałe dźwięki (klik, ding, tik, fanfara) — bez zmian (1×). */
export const PHASE_SFX = ['sting', 'whoosh', 'drum'];
export const TV_SFX_GAIN = 1.8;
export function phaseSfxGain(name, role = 'normal'){
  if(!PHASE_SFX.includes(name)) return 1;
  if(role === 'remote') return 0;
  if(role === 'tv') return TV_SFX_GAIN;
  return 1;
}
// rola ekranu: TV salonu / telefon w salonie (pilot) / zwykły
export function sfxRole({ tv = false, salon = false } = {}){ return tv ? 'tv' : (salon ? 'remote' : 'normal'); }
