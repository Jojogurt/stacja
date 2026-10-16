/* app/vinyl.js — EKSPERYMENT: płyta winylowa zamiast okrągłej gałki w trybach „zwolnione obroty" / „przyspieszone".
 *
 * SVG (index.html #vinyl): czarna płyta z rowkami (koncentryczne okręgi) + STATYCZNY połysk nad nią (połysk się nie
 * kręci — jak światło na prawdziwej płycie, obrót widać po naklejce), naklejka „?" (NIE okładka — zdradzałaby
 * odpowiedź), ramię gramofonu: opada przy starcie, odsuwa się przy pauzie, w trakcie gry przesuwa się do środka
 * wg postępu zajawki.
 *
 * Stan odtwarzania NIE jest tu zgadywany: płyta słucha ikony gałki (app/dom.onKnob: 'pause' = gra, 'play' = stoi,
 * 'wait' = ładowanie) — to jedno źródło prawdy dla wszystkich torów audio (trwały <audio> i WebAudio).
 * Prędkość obrotu ∝ tempo (core/timing.vinylTurnSecs: 1.0× ≈ 1,8 s/obrót, 0.6× → 3 s, 1.5× → 1,2 s).
 * Zmiana tempa / start po pauzie zaczyna od BIEŻĄCEGO kąta (bez skoku): kąt czytany z getComputedStyle (macierz),
 * animacja startuje od `--vn-a0`. Pauza = płynne wyhamowanie: przejście transform z ease-out (droga ≈ v0·T/2).
 * W odsłonie naklejka → okładka albumu, płyta rozpędza się do 1.0× (oryginał).
 * prefers-reduced-motion → płyta stoi (klasa `still`), ramię zmienia pozycję bez animacji. */
import { vinylTurnSecs } from '../core/timing.js';
import { onKnob, onRing } from './dom.js';

const BRAKE_S = 0.9;                 // czas wyhamowania (s)
const $ = id => document.getElementById(id);
let rate = 1, state = 'idle', angle = 0, prog = 0, revealed = false;

function reducedMotion(){
  try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(_e){ return false; }
}
const fmtRate = r => String(Math.round(r*100)/100).replace('.', ',') + '×';
// bieżący kąt płyty (deg) z macierzy transformacji; brak/nieczytelna → ostatni znany
function readAngle(disc){
  try{
    const t = getComputedStyle(disc).transform;
    const m = t && t.match(/matrix\(([^)]+)\)/);
    if(m){ const [a,b] = m[1].split(',').map(parseFloat); if(Number.isFinite(a) && Number.isFinite(b)) return Math.atan2(b,a)*180/Math.PI; }
  }catch(_e){}
  return angle;
}
function sync(){
  const v=$('vinyl'); if(!v) return;
  v.dataset.state = state;
  v.dataset.rate = String(rate);
  v.style.setProperty('--vn-turn', vinylTurnSecs(rate).toFixed(2)+'s');
  v.style.setProperty('--vn-prog', String(Math.max(0, Math.min(1, prog))));
  v.classList.toggle('still', reducedMotion());
  v.classList.toggle('arm-down', state==='playing' || state==='loading');
  v.setAttribute('aria-pressed', state==='playing' ? 'true' : 'false');
  v.setAttribute('aria-label', state==='playing' ? `Pauza — płyta gra (${fmtRate(rate)})`
    : state==='loading' ? 'Ładowanie płyty…' : `Odtwórz płytę (${fmtRate(rate)})`);
}
// (re)start obrotu od bieżącego kąta z bieżącym tempem
function spin(){
  const v=$('vinyl'), disc=$('vinylDisc'); if(!v || !disc) return;
  if(reducedMotion()){ v.classList.remove('spinning'); return; }   // płyta stoi (statyczna)
  if(v.classList.contains('spinning')) angle = readAngle(disc);
  disc.style.transition='none'; disc.style.transform='';
  v.classList.remove('spinning');
  v.style.setProperty('--vn-a0', angle.toFixed(1)+'deg');
  void disc.getBoundingClientRect();   // reflow → animacja rusza od nowa (od --vn-a0)
  v.classList.add('spinning');
}
// płynne wyhamowanie (ease-out ≈ stałe opóźnienie: droga = v0·T/2)
function brake(){
  const v=$('vinyl'), disc=$('vinylDisc'); if(!v || !disc) return;
  if(!v.classList.contains('spinning')) return;
  angle = readAngle(disc);
  v.classList.remove('spinning');
  if(reducedMotion()){ disc.style.transform=`rotate(${angle}deg)`; return; }
  disc.style.transition='none'; disc.style.transform=`rotate(${angle}deg)`;
  void disc.getBoundingClientRect();
  const dist = (360/vinylTurnSecs(rate)) * BRAKE_S / 2;
  angle += dist;
  disc.style.transition=`transform ${BRAKE_S}s cubic-bezier(.33,.66,.66,1)`;
  disc.style.transform=`rotate(${angle.toFixed(1)}deg)`;
  v.classList.add('braking');
  setTimeout(()=>{ const vv=$('vinyl'); if(vv) vv.classList.remove('braking'); }, BRAKE_S*1000);
}
function setState(next){
  if(next===state){ sync(); return; }
  const was=state; state=next; sync();
  const v=$('vinyl');
  if(next==='paused' && v && v.classList.contains('spinning') && was==='loading'){ brake(); return; }   // ładowanie → stop (np. błąd) z kręcącej się płyty
  if(next==='playing') spin();
  else if(was==='playing' && next!=='loading') brake();   // ładowanie w trakcie gry (np. „szybciej") — płyta kręci się dalej
}

// gałka → płyta (tylko gdy płyta widoczna w trybie tempa; poza nim i tak `display:none`)
onKnob(mode=>{ setState(mode==='pause' ? 'playing' : mode==='wait' ? 'loading' : (state==='idle' ? 'idle' : 'paused')); });
onRing(p=>{ const n=Number(p); prog = Number.isFinite(n) ? n : 0; const v=$('vinyl'); if(v) v.style.setProperty('--vn-prog', String(Math.max(0, Math.min(1, prog)))); });

// nowe pytanie: naklejka „?", tempo etapu, płyta stoi, ramię w spoczynku
export function vinylPrepare(r){
  rate = Number(r)>0 ? Number(r) : 1; revealed=false; prog=0;
  const v=$('vinyl'), disc=$('vinylDisc');
  if(v && disc && v.classList.contains('spinning')) angle=readAngle(disc);
  if(v){ v.classList.remove('spinning','braking','revealed'); }
  if(disc){ disc.style.transition='none'; disc.style.transform=`rotate(${angle.toFixed(1)}deg)`; }
  const art=$('vinylArt'); if(art){ art.setAttribute('href',''); art.setAttribute('visibility','hidden'); }
  state='idle'; sync();
}
// zmiana tempa (np. „szybciej" 0.6× → 0.75×, odsłona → 1.0×) — gra dalej od bieżącego kąta
export function vinylRate(r){
  const n=Number(r); if(!(n>0)) return;
  rate=n; sync();
  if(state==='playing') spin();
}
// odsłona: naklejka → okładka albumu (bez okładki zostaje „?"), płyta rozpędza się do 1.0×
export function vinylReveal(artUrl, r=1){
  revealed=true;
  const v=$('vinyl'), art=$('vinylArt');
  if(art && artUrl){ art.setAttribute('href', artUrl); art.setAttribute('visibility','visible'); }
  if(v) v.classList.toggle('revealed', !!artUrl);
  vinylRate(r);
}
// do testów (siatka jsdom)
export const _vinylDebug = () => ({ rate, state, angle, prog, revealed, reduced: reducedMotion() });
