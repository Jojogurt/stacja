/* app/mp-tv.js — narzędzia DOM sceny TV (P1-16 „TV jako scena", tryb salonowy: host = TV, gracze = telefony-piloty).
 * Samodzielne kawałki bez zależności od mp-render: kod QR (SVG z własnego enkodera core/qr.js), łatanie regionów
 * sceny bez migotania, animacja zmiany miejsc w rankingu (FLIP), motyw TV (domyślnie ciemny), menu ⋯, skróty klawiszowe.
 * Sceny (co pokazać w której fazie) buduje app/mp-render.js; logika (ranking/statusy/sterowanie/klawisze) — core/tvStage.js. */
import { qrEncode, qrSvgPath } from '../core/qr.js';
import { tvKeyAction, tvTheme } from '../core/tvStage.js';
import { escapeHtml } from '../core/util.js';

const $ = id => (typeof document!=='undefined') ? document.getElementById(id) : null;
export const tvReducedMotion = ()=>{ try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(_e){ return false; } };

/* ---------- QR (cache po URL — enkoder liczy 8 masek, nie przy każdym renderze) ---------- */
let qrCache = { url:null, html:'' };
// czarne moduły na BIAŁYM tle zawsze (także w ciemnym motywie) — skanery telefonów wymagają ciemne-na-jasnym
export function tvQrSVG(url){
  if(qrCache.url === url) return qrCache.html;
  const q = qrEncode(url, { minVersion:2 });
  if(!q){ qrCache = { url, html:'' }; return ''; }
  const { d, dim } = qrSvgPath(q, 4);
  const html = `<svg class="tv-qr-svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="Kod QR — dołącz do pokoju: ${escapeHtml(url)}" data-qr-version="${q.version}"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  qrCache = { url, html };
  return html;
}

/* ---------- łatanie regionów: podmień innerHTML tylko gdy wygenerowany HTML się zmienił ---------- */
const lastHtml = new WeakMap();
export function tvPatch(el, html){
  if(!el) return false;
  if(lastHtml.get(el) === html) return false;
  el.innerHTML = html; lastHtml.set(el, html);
  return true;
}
// FLIP: wiersze [data-tvrow] zmieniające pozycję płynnie przesuwają się na nowe miejsce (reduced-motion → bez ruchu)
export function tvPatchFlip(el, html){
  if(!el) return false;
  const before = new Map();
  const anim = !tvReducedMotion() && typeof requestAnimationFrame === 'function';
  if(anim) el.querySelectorAll('[data-tvrow]').forEach(r=>{ const b = r.getBoundingClientRect(); before.set(r.dataset.tvrow, b.top); });
  const changed = tvPatch(el, html);
  if(!changed || !anim || !before.size) return changed;
  el.querySelectorAll('[data-tvrow]').forEach(r=>{
    const was = before.get(r.dataset.tvrow); if(was == null) return;
    const dy = was - r.getBoundingClientRect().top;
    if(Math.abs(dy) < 2) return;
    r.style.transition = 'none'; r.style.transform = `translateY(${Math.round(dy)}px)`;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ r.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1)'; r.style.transform = ''; }));
  });
  return changed;
}

/* ---------- tryb TV na <html>: klasa .tv + motyw (domyślnie ciemny, wybór pamiętany na tym urządzeniu) ---------- */
const THEME_KEY = 'stacjaTvTheme';
const savedTheme = ()=>{ try{ return localStorage.getItem(THEME_KEY); }catch(_e){ return null; } };
let tvActive = false, prevDark = null;
export function tvSetMode(on){
  if(typeof document === 'undefined') return;
  const root = document.documentElement;
  if(on && !tvActive){ tvActive = true; prevDark = root.classList.contains('dark'); }
  if(!on && tvActive){ tvActive = false; root.classList.remove('tv'); if(prevDark != null) root.classList.toggle('dark', prevDark); prevDark = null; tvMenuClose(); return; }
  if(on){ root.classList.add('tv'); root.classList.toggle('dark', tvTheme(savedTheme()) === 'dark'); }
}
export const tvIsActive = ()=> tvActive;
function tvToggleTheme(){
  const next = tvTheme(savedTheme()) === 'dark' ? 'light' : 'dark';
  try{ localStorage.setItem(THEME_KEY, next); }catch(_e){}
  document.documentElement.classList.toggle('dark', next === 'dark');
  tvMenuOpen();   // odśwież etykiety menu
}

/* ---------- menu ⋯ (motyw, pełny ekran, wyjście z potwierdzeniem) ---------- */
export function tvMenuOpen(){
  let el = $('tvMenu');
  if(!el){ el = document.createElement('div'); el.id = 'tvMenu'; el.className = 'tv-menu'; document.body.appendChild(el); }
  const dark = document.documentElement.classList.contains('dark');
  el.innerHTML = `<div class="tv-menu-card" role="dialog" aria-modal="true" aria-label="Menu TV">
      <button type="button" data-tvmenu="theme">${dark ? '☀️ Motyw jasny' : '🌙 Motyw ciemny'}</button>
      <button type="button" data-tvmenu="full">⛶ Pełny ekran</button>
      <button type="button" data-tvmenu="leave">🚪 Opuść pokój…</button>
      <button type="button" data-tvmenu="close" class="ghost">Zamknij <kbd>Esc</kbd></button>
    </div>`;
  el.classList.add('show');
  if(!el.dataset.wired){
    el.dataset.wired = '1';
    el.addEventListener('click', (e)=>{
      const b = e.target.closest && e.target.closest('[data-tvmenu]');
      if(!b){ if(e.target === el) tvMenuClose(); return; }
      const a = b.dataset.tvmenu;
      if(a === 'theme') tvToggleTheme();
      else if(a === 'full'){ tvMenuClose(); try{ const r = document.documentElement; if(!document.fullscreenElement && r.requestFullscreen) r.requestFullscreen(); else if(document.exitFullscreen) document.exitFullscreen(); }catch(_e){} }
      else if(a === 'leave'){ tvMenuClose(); if(window.mpConfirmLeave) window.mpConfirmLeave(tvLeaveKind()); }
      else tvMenuClose();
    });
  }
  const first = el.querySelector('button'); if(first) try{ first.focus(); }catch(_e){}
}
export function tvMenuClose(){ const el = $('tvMenu'); if(el) el.classList.remove('show'); }
const tvMenuShown = ()=>{ const el = $('tvMenu'); return !!(el && el.classList.contains('show')); };
const leaveDlgShown = ()=>{ const el = $('mpLeaveDlg'); return !!(el && el.classList.contains('show')); };

/* ---------- skróty klawiszowe hosta-TV (Spacja/Enter = dalej, S = pomiń, Esc = wyjście z potwierdzeniem) ---------- */
let keyCtx = { controls:null, leaveKind:'game', run:null };
const tvLeaveKind = ()=> keyCtx.leaveKind || 'game';
// render woła po każdym przebudowaniu sceny: bieżące przyciski (core/tvStage.tvControls) + wykonawca akcji
export function tvSetKeys(ctx){ keyCtx = { ...keyCtx, ...ctx }; }
let keysWired = false;
export function initTvKeys(){
  if(keysWired || typeof document === 'undefined') return;
  keysWired = true;
  document.addEventListener('keydown', (e)=>{
    if(!tvActive || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const room = $('mpRoom'); if(room && room.style.display === 'none') return;   // MP nie jest na ekranie
    const t = e.target, tag = (t && t.tagName) || '';
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || !!(t && t.isContentEditable);
    // fokus na przycisku POZA paskiem sterowania (menu, okno, kafle) → Enter/Spacja działają natywnie
    const nativeBtn = (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') && !(t.closest && t.closest('.tv-ctl'));
    if(nativeBtn && (e.key === ' ' || e.key === 'Enter')) return;
    const act = tvKeyAction(e.key, { controls:keyCtx.controls, dialog: tvMenuShown() || leaveDlgShown(), typing, repeat:e.repeat });
    if(!act) return;
    e.preventDefault();
    if(act === 'close'){ tvMenuClose(); if(leaveDlgShown() && window.mpLeaveCancel) window.mpLeaveCancel(); return; }
    if(act === 'leave'){ if(window.mpConfirmLeave) window.mpConfirmLeave(tvLeaveKind()); return; }
    if(keyCtx.run) keyCtx.run(act);
  });
}
