/* app/tasteCard.js — „Twój gust" (etap 2): karta do udostępnienia — obrazek PNG 1080×1350 rysowany na <canvas>
 * (archetyp, top dekady i gatunki, top 3 artystów z półki, PL/świat, nazwa aplikacji + link) i udostępnianie:
 * navigator.share z plikiem (gdy canShare({files})) → inaczej pobranie PNG + skopiowanie tekstu do schowka.
 * Bez danych osobowych — ksywa tylko, gdy użytkownik zaznaczy. Tekst karty: core/tasteProfile.shareText. */
import { shareText, topList, APP_NAME, DECADE_LONG, GENRE_SHORT } from '../core/tasteProfile.js';

export const CARD_W = 1080, CARD_H = 1350;
export const CARD_FILE = 'moj-gust-uszy-mozg.png';
// kolory karty stałe (obrazek wygląda tak samo niezależnie od motywu) — paleta design systemu (wariant ciemny)
export const C = { bg:'#15121E', bg2:'#221C33', line:'#39314F', ink:'#ECE9F4', muted:'#A79FBD', green:'#58CC02', blue:'#1CB0F6', gold:'#FFC800', red:'#FF4B4B', track:'#2C2540' };
const FONT = "'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const f = (w, px) => `${w} ${px}px ${FONT}`;

export function rr(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}
// zawijanie tekstu do szerokości; ostatnia linia z „…", gdy przekracza maxLines
export function wrap(ctx, text, maxW, maxLines){
  const words=String(text||'').split(/\s+/).filter(Boolean), lines=[];
  let cur='';
  for(const w of words){
    const t=cur ? cur+' '+w : w;
    if(cur && ctx.measureText(t).width>maxW){ lines.push(cur); cur=w; } else cur=t;
  }
  if(cur) lines.push(cur);
  if(lines.length>maxLines){
    const keep=lines.slice(0, maxLines); let last=keep[maxLines-1]+'…';
    while(last.length>1 && ctx.measureText(last).width>maxW) last=last.slice(0, -2)+'…';
    keep[maxLines-1]=last; return keep;
  }
  return lines;
}
function bars(ctx, title, rows, y, color){
  ctx.fillStyle=C.muted; ctx.font=f(900, 30); ctx.textAlign='left'; ctx.fillText(title, 60, y);
  y+=26;
  rows.forEach(r=>{
    const [label, pct]=r;
    ctx.fillStyle=C.ink; ctx.font=f(800, 36); ctx.textAlign='left'; ctx.fillText(label, 60, y+36);
    const x0=380, bw=520, h=34;
    ctx.fillStyle=C.track; rr(ctx, x0, y+8, bw, h, h/2); ctx.fill();
    if(pct>0){ ctx.fillStyle=color; rr(ctx, x0, y+8, Math.max(h, bw*pct/100), h, h/2); ctx.fill(); }
    ctx.fillStyle=C.ink; ctx.font=f(900, 36); ctx.textAlign='right'; ctx.fillText(pct+'%', 1020, y+36);
    y+=58;
  });
  return y;
}
const rowsOf = (v, label) => topList(v, 3, label).map(s=>{ const m=s.match(/^(.*) (\d+)%$/); return m ? [m[1], +m[2]] : [s, 0]; });

/* rysuje kartę na podanym kontekście 2D (testowalne fałszywym ctx) */
export function drawTasteCard(ctx, p, { handle='', url='', logo=null }={}){
  const a=p.archetype;
  // tło + akcenty
  ctx.fillStyle=C.bg; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle=C.green; ctx.fillRect(0, 0, CARD_W, 14);
  ctx.globalAlpha=0.12; ctx.fillStyle=C.blue; ctx.beginPath(); ctx.arc(980, 120, 220, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle=C.gold; ctx.beginPath(); ctx.arc(60, 1290, 180, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
  // marka: logo graficzne (icons/logo.webp, wczytane przez renderTasteCard); brak obrazu → napis jak dawniej
  ctx.textAlign='left';
  if(logo && logo.naturalWidth){
    const lh=112, lw=Math.round(lh*logo.naturalWidth/logo.naturalHeight);
    ctx.drawImage(logo, 52, 30, lw, lh);
  } else {
    ctx.font=f(900, 58);
    const w1=ctx.measureText('Uszy ').width, w2=ctx.measureText('& ').width;
    ctx.fillStyle=C.green; ctx.fillText('Uszy ', 60, 112);
    ctx.fillStyle=C.gold; ctx.fillText('& ', 60+w1, 112);
    ctx.fillStyle=C.green; ctx.fillText('Mózg', 60+w1+w2, 112);
  }
  ctx.fillStyle=C.muted; ctx.font=f(800, 30);
  ctx.fillText((handle ? 'GUST MUZYCZNY: '+handle : 'MÓJ GUST MUZYCZNY').toUpperCase().slice(0, 48), 60, 180);
  // karta archetypu
  ctx.fillStyle=C.bg2; rr(ctx, 60, 200, 960, 360, 36); ctx.fill();
  ctx.strokeStyle=C.line; ctx.lineWidth=4; rr(ctx, 60, 200, 960, 360, 36); ctx.stroke();
  ctx.font=f(400, 120); ctx.textAlign='left'; ctx.fillStyle=C.ink; ctx.fillText(a.emoji, 100, 350);
  ctx.font=f(900, 66);
  const nameL=wrap(ctx, a.name, 680, 2);
  nameL.forEach((l,i)=>ctx.fillText(l, 270, 300+i*74));
  ctx.fillStyle=C.muted; ctx.font=f(700, 36);
  wrap(ctx, a.desc, 880, 3).forEach((l,i)=>ctx.fillText(l, 100, 300+nameL.length*74+40+i*46));
  let y=622;
  if(a.id!=='poznajemy'){
    const d=rowsOf(p.decades, DECADE_LONG), g=rowsOf(p.genres, GENRE_SHORT);
    if(d.length) y=bars(ctx, 'TOP DEKADY', d, y, C.green)+48;
    if(g.length) y=bars(ctx, 'TOP GATUNKI', g, y, C.blue)+48;
  } else {
    ctx.fillStyle=C.ink; ctx.font=f(800, 40);
    wrap(ctx, `Oceniono ${p.total} utworów — profil dopiero się układa.`, 960, 2).forEach((l,i)=>ctx.fillText(l, 60, y+40+i*52));
    y+=170;
  }
  const ar=p.topArtists.slice(0, 3).map(x=>x.artist);
  if(ar.length && y<=1160){
    ctx.fillStyle=C.muted; ctx.font=f(900, 30); ctx.textAlign='left'; ctx.fillText('NA MOJEJ PÓŁCE ❤️', 60, y);
    ctx.fillStyle=C.ink; ctx.font=f(800, 38);
    wrap(ctx, ar.join(' · '), 960, 1).forEach(l=>ctx.fillText(l, 60, y+52));
  }
  // stopka: PL/świat + link
  ctx.textAlign='left'; ctx.fillStyle=C.ink; ctx.font=f(800, 32);
  if(p.liked && a.id!=='poznajemy') ctx.fillText(`Polska ${p.pl.pct}% · świat ${p.pl.worldPct}%`, 60, 1250);
  ctx.fillStyle=C.muted; ctx.font=f(700, 30);
  const host=String(url||'').replace(/^https?:\/\//, '').replace(/\/$/, '');
  ctx.fillText(host ? `Sprawdź swój gust: ${host}`.slice(0, 60) : `Sprawdź swój gust w ${APP_NAME}`, 60, 1300);
}

async function fontsReady(){
  try{
    if(typeof document!=='undefined' && document.fonts && document.fonts.load){
      await Promise.race([ Promise.all([document.fonts.load(f(900, 60)), document.fonts.load(f(800, 36)), document.fonts.load(f(700, 36))]),
        new Promise(r=>setTimeout(r, 800)) ]);
    }
  }catch(_e){}
}
/* PNG (Blob) albo null (brak canvas / toBlob — np. stara przeglądarka, jsdom). P2-11: wspólne dla kart (gust, wynik meczu MP) */
export async function renderCardPng(draw, w = CARD_W, h = CARD_H){
  try{
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    const ctx=cv.getContext && cv.getContext('2d');
    if(!ctx || typeof cv.toBlob!=='function') return null;
    await fontsReady();
    draw(ctx);
    return await new Promise(res=>{ try{ cv.toBlob(b=>res(b||null), 'image/png'); }catch(_e){ res(null); } });
  }catch(_e){ return null; }
}
// logo do kart PNG (ten sam origin — canvas nie jest „skażony", toBlob działa); limit 1,5 s, błąd → null (napis)
export function loadLogo(src='icons/logo.webp', ms=1500){
  return new Promise(res=>{
    try{
      const im=new Image(); let done=false; const end=(v)=>{ if(!done){ done=true; res(v); } };
      im.onload=()=>end(im.naturalWidth ? im : null); im.onerror=()=>end(null); setTimeout(()=>end(null), ms);
      im.src=src;
    }catch(_e){ res(null); }
  });
}
export async function renderTasteCard(p, opts={}){ const logo=await loadLogo(); return renderCardPng(ctx=>drawTasteCard(ctx, p, { ...opts, logo })); }

async function copyText(text){
  const nav=typeof navigator!=='undefined' ? navigator : null;
  if(nav && nav.clipboard && typeof nav.clipboard.writeText==='function'){
    try{ await nav.clipboard.writeText(text); return true; }catch(_e){}
  }
  try{
    const ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly', ''); ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); const okc=document.execCommand && document.execCommand('copy'); ta.remove(); return !!okc;
  }catch(_e){ return false; }
}
function download(blob, name = CARD_FILE){
  try{
    const u=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=u; a.download=name; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>{ try{ URL.revokeObjectURL(u); }catch(_e){} }, 4000);
    return true;
  }catch(_e){ return false; }
}

/* Udostępnij obrazek (P2-11: wspólne dla karty gustu i wyniku meczu MP): navigator.share z plikiem (gdy canShare({files}))
 * → inaczej pobranie PNG + tekst do schowka. Wynik: { how:'shared'|'cancelled'|'fallback'|'failed', png:bool, copied:bool, text } */
export async function shareCardPng({ blob, file = CARD_FILE, text = '', title = '' }){
  const nav=typeof navigator!=='undefined' ? navigator : null;
  let f=null;
  try{ if(blob && typeof File==='function') f=new File([blob], file, { type:'image/png' }); }catch(_e){ f=null; }
  if(f && nav && typeof nav.share==='function' && (typeof nav.canShare!=='function' || nav.canShare({ files:[f] }))){
    try{ await nav.share({ files:[f], text, title }); return { how:'shared', png:true, copied:false, text }; }
    catch(e){ if(e && e.name==='AbortError') return { how:'cancelled', png:false, copied:false, text }; /* inny błąd → fallback */ }
  }
  const png=blob ? download(blob, file) : false;
  const copied=await copyText(text);
  return { how: (png || copied) ? 'fallback' : 'failed', png, copied, text };
}
export async function shareTasteCard(p, opts={}){
  const text=shareText(p, opts);
  const blob=await renderTasteCard(p, opts);
  return shareCardPng({ blob, file:CARD_FILE, text, title:'Mój gust muzyczny' });
}
