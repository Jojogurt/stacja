/* app/cover.js — EKSPERYMENT: tryb „okładka" (solo). Okładka albumu odsłaniana ETAPAMI rozdzielczości
 * (core/timing.COVER_STAGES: 16 → 24 → 40 → 64 → 100 bloków na bok), auto co COVER_STEP_MS (6 s) albo przyciskiem
 * „wyraźniej" (app/solo.js). PEŁNA okładka (często z nazwą zespołu) dopiero w odsłonie — coverStop(true).
 *
 * CORS: obraz z iTunes CDN (mzstatic) ładujemy BEZ crossOrigin i NIGDY nie czytamy pikseli (getImageData/toDataURL).
 * Rysowanie obcego obrazu na canvasie jest dozwolone — „tainted" blokuje tylko odczyt, nie wyświetlanie. Dzięki temu
 * działa niezależnie od nagłówków CDN (dziś mzstatic i tak wysyła ACAO: *). Pikselizacja: zmniejszanie połówkami
 * (100 → 50 → 25…, z wygładzaniem = uśrednianie bloków), potem powiększenie na canvasie widoku z
 * imageSmoothingEnabled=false (+ CSS image-rendering: pixelated jako zapas). Pełny etap = zwykły <img>.
 * Rozpikselowanie na starcie ukrywa też nazwę zespołu na okładce (bez OCR). */
import { coverStageBlocks, coverNextStage, COVER_STEP_MS } from '../core/timing.js';

const VIEW = 320;            // wewnętrzna rozdzielczość canvasu widoku (CSS skaluje do szerokości pudełka)
let img = null, stage = 0, timer = null, onStageCb = null, token = 0, fullShown = false;
const $ = id => document.getElementById(id);

function ctx2d(c){ try{ return c && c.getContext ? c.getContext('2d') : null; }catch(_e){ return null; } }
function canvas(n){ const c=document.createElement('canvas'); c.width=n; c.height=n; return c; }

// narysuj bieżący etap (gdy obraz już wczytany)
function draw(){
  const box=$('coverBox'), view=$('coverCanvas'), full=$('coverImg');
  if(!box || !view || !full) return;
  const blocks=coverStageBlocks(stage);
  box.dataset.stage=String(stage);
  box.dataset.blocks=String(fullShown ? 0 : blocks);
  if(fullShown){ view.hidden=true; full.hidden=false; return; }   // pełna okładka — tylko odsłona
  full.hidden=true; view.hidden=false;
  if(!img || !img.complete || !img.naturalWidth) return;      // jeszcze się wczytuje → narysuje onload
  coverDrawPixels(view, img, blocks);
}
/* WSPÓLNE (solo + MP): narysuj obraz `src` pikselowo — `blocks` bloków na bok, powiększone do `px` bez wygładzania.
 * Zmniejszanie połówkami: min(rozmiar źródła, max(blocks, 64)) → … → blocks (każdy krok uśrednia 2×2 — bez migotania przy dużej
 * redukcji). MP: serwer przysyła obraz JUŻ w rozdzielczości etapu (np. 16×16) → rysowany 1:1 i powiększany. */
export function coverDrawPixels(view, src, blocks, px=VIEW){
  const b=Math.floor(Number(blocks));
  if(!view || !src || !src.naturalWidth || !(b>0)) return false;
  let size=Math.min(src.naturalWidth, Math.max(b, 64));
  let small=canvas(size), c=ctx2d(small); if(!c) return false;
  c.imageSmoothingEnabled=true; c.drawImage(src, 0, 0, size, size);
  while(size>b){
    const next=Math.max(b, Math.floor(size/2)), nc=canvas(next), x=ctx2d(nc); if(!x) return false;
    x.imageSmoothingEnabled=true; x.drawImage(small, 0, 0, next, next);
    small=nc; size=next;
  }
  const v=ctx2d(view); if(!v) return false;
  view.width=px; view.height=px;
  v.imageSmoothingEnabled=false;                               // twarde bloki przy powiększeniu
  v.clearRect(0,0,px,px);
  v.drawImage(small, 0, 0, px, px);
  return true;
}
/* MP okładka: odmaluj pudełka `.mp-cover[data-art]` (telefon i TV) — to, co przyszło od serwera (game.coverArt
 * w rozdzielczości etapu, data-blocks). Bez własnych timerów odsłony: etap zmienia tylko nowy stan. Obrazy w małym
 * cache (ten sam URL = bez ponownego pobrania; po przebudowie DOM rysuje od razu). Pełny etap (blocks 0) = zwykły <img>. */
const mpImgs=new Map();
function mpImg(url){
  let im=mpImgs.get(url);
  if(!im){
    im=document.createElement('img'); im.decoding='async';
    try{ im.referrerPolicy='no-referrer'; }catch(_e){}
    im.src=url; mpImgs.set(url, im);
    while(mpImgs.size>8) mpImgs.delete(mpImgs.keys().next().value);
  }
  return im;
}
export function coverPaintBoxes(root=document){
  if(!root || !root.querySelectorAll) return;
  root.querySelectorAll('.mp-cover[data-art]').forEach(box=>{
    const url=box.dataset.art||'', blocks=Math.floor(Number(box.dataset.blocks))||0;
    const key=url+'|'+blocks;
    if(box.dataset.painted===key) return;
    const cv=box.querySelector('canvas'), full=box.querySelector('img');
    if(!url){ box.classList.add('broken'); box.dataset.painted=key; return; }   // brak obrazu → placeholder (CSS)
    if(!blocks){ if(cv) cv.hidden=true; if(full){ full.hidden=false; if(full.getAttribute('src')!==url) full.src=url; } box.dataset.painted=key; return; }
    if(full) full.hidden=true; if(cv) cv.hidden=false;
    const im=mpImg(url);
    const draw=()=>{ if(box.dataset.art!==url || !box.isConnected) return; if(coverDrawPixels(cv, im, blocks)){ box.dataset.painted=key; box.classList.remove('broken'); } };
    if(im.complete && im.naturalWidth) draw();
    else { im.addEventListener('load', draw, { once:true }); im.addEventListener('error', ()=>{ if(box.dataset.art===url) box.classList.add('broken'); }, { once:true }); }
  });
}
/* pierścień postępu w ramce okładki (jak na winylu): obiega ramkę przez COVER_STEP_MS do następnego wyostrzenia;
 * ostatni etap / stop → schowany. Zastępuje napis „okładka odsłania się co kilka sekund" (zgłoszenie 2026-10-18). */
function ring(){
  const box=$('coverBox'); if(!box) return null;
  let r=box.querySelector('.cover-ring');
  if(!r){ box.insertAdjacentHTML('beforeend', '<svg class="cover-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="1.5" y="1.5" width="97" height="97" rx="5" pathLength="100"/></svg>'); r=box.querySelector('.cover-ring'); }
  return r;
}
function ringRun(ms){
  const r=ring(); if(!r) return; const rect=r.querySelector('rect'); if(!rect) return;
  r.classList.toggle('on', ms>0);
  rect.style.transition='none'; rect.style.strokeDashoffset='100';
  if(!(ms>0)) return;
  try{ rect.getBoundingClientRect(); }catch(_e){}   // wymuś reflow — animacja od zera przy każdym etapie
  rect.style.transition=`stroke-dashoffset ${ms}ms linear`; rect.style.strokeDashoffset='0';
}
function arm(){
  clearTimeout(timer); timer=null;
  if(coverNextStage(stage)==null){ ringRun(0); return; }
  ringRun(COVER_STEP_MS);
  const t=token;
  timer=setTimeout(()=>{
    if(t!==token) return;
    const nx=coverNextStage(stage); if(nx==null) return;
    // wołający może odmówić (pytanie już ocenione) — wtedy stop
    if(onStageCb && onStageCb(nx)===false) return;
    stage=nx; draw(); arm();
  }, COVER_STEP_MS);
}

// pokaż okładkę bieżącego pytania od etapu 0 i uruchom auto-odsłonę
export function coverShow(cur, { onStage }={}){
  token++; clearTimeout(timer); timer=null;
  stage=Math.max(0, Math.floor(Number(cur && cur.coverStage)) || 0);
  onStageCb=onStage || null; fullShown=false;
  const box=$('coverBox'), full=$('coverImg');
  if(!box || !full) return;
  box.hidden=false; box.classList.remove('broken');
  const t=token;
  img=document.createElement('img');
  img.decoding='async';
  try{ img.referrerPolicy='no-referrer'; }catch(_e){}
  img.onload=()=>{ if(t===token) draw(); };
  img.onerror=()=>{ if(t===token) box.classList.add('broken'); };
  img.src=(cur && cur.art) || '';
  full.src=(cur && cur.art) || '';
  draw(); arm();
}
// ręczny następny etap („wyraźniej") — auto-odsłona liczy od nowa
export function coverStage(n){
  stage=Math.max(0, Math.floor(Number(n)) || 0);
  draw(); arm();
}
// zatrzymaj auto-odsłonę; full → pokaż pełną okładkę (odsłona po „Sprawdź"/pominięciu)
export function coverStop(full){
  token++; clearTimeout(timer); timer=null; onStageCb=null; ringRun(0);
  if(full){ fullShown=true; draw(); }
}
// schowaj pudełko okładki (nowe pytanie / koniec meczu)
export function coverHide(){
  coverStop(false);
  const box=$('coverBox'); if(box){ box.hidden=true; box.classList.remove('broken'); }
  img=null; fullShown=false;
}
// do testów (siatka jsdom)
export const _coverDebug = () => ({ stage, timer: !!timer, img, fullShown });
