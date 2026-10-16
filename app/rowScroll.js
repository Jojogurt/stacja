/* app/rowScroll.js — rzędy kategorii (.ticks: picker solo i MP) z poziomym scrollem bez paska.
 * Poprawka tymczasowa (pełne przeprojektowanie ekranu osobno): na desktopie kółko myszy nie przewijało rzędów,
 * a ukryty scrollbar nie podpowiadał, że jest ich więcej. Od 600 px CSS zawija rzędy (siatka) — tu nic do roboty.
 * Węziej: klasy more-l/more-r (gradient + strzałka na krawędzi) i — na urządzeniach z myszą — kółko przewija poziomo.
 * Decyzje (krawędzie, docelowe scrollLeft) w core/picker.js (rowEdges / wheelScrollTarget). Rzędy powstają w innerHTML
 * (solo i MP), więc: delegacja na dokumencie + MutationObserver (odświeżenie klas po renderze, throttle przez rAF). */
import { rowEdges, wheelScrollTarget } from '../core/picker.js';

const raf = typeof requestAnimationFrame==='function' ? requestAnimationFrame : (cb=>setTimeout(cb, 16));
function finePointer(){
  try{ return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches); }catch(_e){ return false; }
}
export function syncRow(el){
  if(!el || !el.classList) return;
  const e=rowEdges({ scrollLeft:el.scrollLeft, scrollWidth:el.scrollWidth, clientWidth:el.clientWidth });
  el.classList.toggle('more-l', e.left);
  el.classList.toggle('more-r', e.right);
}
let queued=false;
export function syncRows(){
  queued=false;
  if(typeof document==='undefined') return;
  document.querySelectorAll('.ticks').forEach(syncRow);
}
// rAF (po layoucie) + zapasowy timer: w karcie w tle rAF nie rusza, a zawieszona flaga blokowałaby kolejne odświeżenia
function queue(){ if(queued) return; queued=true; const run=()=>{ if(queued) syncRows(); }; raf(run); setTimeout(run, 150); }

if(typeof document!=='undefined'){
  // kółko myszy → poziomy scroll rzędu (tylko gdy rząd faktycznie może się jeszcze przesunąć)
  document.addEventListener('wheel', (e)=>{
    const el=e.target && e.target.closest ? e.target.closest('.ticks') : null;
    if(!el || !finePointer()) return;
    const to=wheelScrollTarget({ deltaX:e.deltaX, deltaY:e.deltaY, deltaMode:e.deltaMode, scrollLeft:el.scrollLeft, scrollWidth:el.scrollWidth, clientWidth:el.clientWidth });
    if(to==null) return;
    e.preventDefault();
    el.scrollLeft=to;
    syncRow(el);
  }, { passive:false });
  // scroll elementów nie bąbelkuje — łapiemy w fazie capture
  document.addEventListener('scroll', (e)=>{ const t=e.target; if(t && t.classList && t.classList.contains('ticks')) syncRow(t); }, true);
  window.addEventListener('resize', queue);
  // pasma kategorii otwierają się zmianą KLASY (bez zmiany drzewa) — odśwież po każdym kliknięciu/klawiszu
  document.addEventListener('click', queue, true);
  document.addEventListener('keyup', queue, true);
  try{ new MutationObserver(queue).observe(document.body || document.documentElement, { childList:true, subtree:true }); }catch(_e){}
  queue();
}
