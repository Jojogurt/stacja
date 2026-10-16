/* app/cover.js — EKSPERYMENT: tryb „okładka" (solo). Okładka albumu odsłaniana ETAPAMI rozdzielczości
 * (core/timing.COVER_STAGES: 8 → 16 → 32 → 64 bloki na bok → pełna), auto co COVER_STEP_MS albo przyciskiem
 * „wyraźniej" (app/solo.js).
 *
 * CORS: obraz z iTunes CDN (mzstatic) ładujemy BEZ crossOrigin i NIGDY nie czytamy pikseli (getImageData/toDataURL).
 * Rysowanie obcego obrazu na canvasie jest dozwolone — „tainted" blokuje tylko odczyt, nie wyświetlanie. Dzięki temu
 * działa niezależnie od nagłówków CDN (dziś mzstatic i tak wysyła ACAO: *). Pikselizacja: zmniejszanie połówkami
 * (64 → 32 → 16 → 8, z wygładzaniem = uśrednianie bloków), potem powiększenie na canvasie widoku z
 * imageSmoothingEnabled=false (+ CSS image-rendering: pixelated jako zapas). Pełny etap = zwykły <img>.
 * Rozpikselowanie na starcie ukrywa też nazwę zespołu na okładce (bez OCR). */
import { coverStageBlocks, coverNextStage, COVER_STEP_MS, COVER_STAGES } from '../core/timing.js';

const VIEW = 320;            // wewnętrzna rozdzielczość canvasu widoku (CSS skaluje do szerokości pudełka)
let img = null, stage = 0, timer = null, onStageCb = null, token = 0;
const $ = id => document.getElementById(id);

function ctx2d(c){ try{ return c && c.getContext ? c.getContext('2d') : null; }catch(_e){ return null; } }
function canvas(n){ const c=document.createElement('canvas'); c.width=n; c.height=n; return c; }

// narysuj bieżący etap (gdy obraz już wczytany)
function draw(){
  const box=$('coverBox'), view=$('coverCanvas'), full=$('coverImg');
  if(!box || !view || !full) return;
  const blocks=coverStageBlocks(stage);
  box.dataset.stage=String(stage);
  box.dataset.blocks=String(blocks);
  if(!blocks){ view.hidden=true; full.hidden=false; return; }   // pełna okładka
  full.hidden=true; view.hidden=false;
  if(!img || !img.complete || !img.naturalWidth) return;      // jeszcze się wczytuje → narysuje onload
  // zmniejszanie połówkami: 64 → … → blocks (każdy krok uśrednia 2×2 — bez migotania przy dużej redukcji)
  let src=img, size=64;
  let small=canvas(size), c=ctx2d(small); if(!c) return;
  c.imageSmoothingEnabled=true; c.drawImage(src, 0, 0, size, size);
  while(size>blocks){
    const next=Math.max(blocks, size/2), nc=canvas(next), x=ctx2d(nc); if(!x) return;
    x.imageSmoothingEnabled=true; x.drawImage(small, 0, 0, next, next);
    small=nc; size=next;
  }
  const v=ctx2d(view); if(!v) return;
  view.width=VIEW; view.height=VIEW;
  v.imageSmoothingEnabled=false;                               // twarde bloki przy powiększeniu
  v.clearRect(0,0,VIEW,VIEW);
  v.drawImage(small, 0, 0, VIEW, VIEW);
}
function arm(){
  clearTimeout(timer); timer=null;
  if(coverNextStage(stage)==null) return;
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
  onStageCb=onStage || null;
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
// zatrzymaj auto-odsłonę; full → pokaż pełną okładkę (odsłona po „Sprawdź")
export function coverStop(full){
  token++; clearTimeout(timer); timer=null; onStageCb=null;
  if(full){ stage=COVER_STAGES.length-1; draw(); }
}
// schowaj pudełko okładki (nowe pytanie / koniec meczu)
export function coverHide(){
  coverStop(false);
  const box=$('coverBox'); if(box){ box.hidden=true; box.classList.remove('broken'); }
  img=null;
}
// do testów (siatka jsdom)
export const _coverDebug = () => ({ stage, timer: !!timer, img });
