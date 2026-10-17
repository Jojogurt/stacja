/* app/mpResultCard.js — P2-11: wynik meczu MP jako obrazek PNG 1080×1350 (canvas) do udostępnienia.
 * Wzorzec i narzędzia z app/tasteCard.js (paleta, zawijanie, render → share z plikiem / pobranie + schowek).
 * Dane karty składa app/mp-render.js (wynik, skala „320 / 500", zwycięzca/ranking, lista utworów z ✓/✗);
 * tekst do udostępnienia — core/mpView.resultShareText. Bez danych osobowych poza ksywami widocznymi przy stole. */
import { C, f, rr, wrap, renderCardPng, shareCardPng, CARD_W, CARD_H } from './tasteCard.js';
import { resultShareText } from '../core/mpView.js';

export const RESULT_FILE = 'wynik-meczu.png';

/* rysuje kartę na kontekście 2D (testowalne fałszywym ctx).
 * d = { appName, subtitle, score, scale, hits, played, comp, winner, tie, ranking:[{name,score,place}], mvp:{name,correct}, tracks:[{title,artist,ok}], url } */
export function drawMpResultCard(ctx, d){
  const tracks=Array.isArray(d.tracks) ? d.tracks : [], ranking=Array.isArray(d.ranking) ? d.ranking : [];
  ctx.fillStyle=C.bg; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle=C.gold; ctx.fillRect(0, 0, CARD_W, 14);
  ctx.globalAlpha=0.12; ctx.fillStyle=C.green; ctx.beginPath(); ctx.arc(990, 130, 230, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle=C.blue; ctx.beginPath(); ctx.arc(70, 1290, 190, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
  // marka + podtytuł
  ctx.textAlign='left'; ctx.fillStyle=C.green; ctx.font=f(900, 58); ctx.fillText(String(d.appName||'').slice(0, 28), 60, 112);
  ctx.fillStyle=C.muted; ctx.font=f(800, 30); ctx.fillText(String(d.subtitle||'MECZ ZE ZNAJOMYMI').toUpperCase().slice(0, 52), 60, 164);
  // panel wyniku
  ctx.fillStyle=C.bg2; rr(ctx, 60, 200, 960, 330, 36); ctx.fill();
  ctx.strokeStyle=C.line; ctx.lineWidth=4; rr(ctx, 60, 200, 960, 330, 36); ctx.stroke();
  ctx.textAlign='center';
  const head = d.comp ? (d.tie ? '🤝 Remis!' : (d.winner ? `🏆 ${d.winner} wygrywa!` : 'Koniec meczu')) : '🏆 Mecz zakończony!';
  ctx.fillStyle=C.ink; ctx.font=f(900, 50);
  let hl=wrap(ctx, head, 880, 1);
  if(ctx.measureText(head).width>880){ ctx.font=f(900, 40); hl=wrap(ctx, head, 880, 2); }   // długa ksywa zwycięzcy — 2 linie zamiast „…"
  hl.forEach((l,i)=>ctx.fillText(l, 540, hl.length>1 ? 262+i*46 : 282));
  const sc=String(Math.round(Number(d.score)||0)), sl=d.scale>0 ? ` / ${Math.round(d.scale)}` : '';
  ctx.font=f(900, 150); const w1=ctx.measureText(sc).width; ctx.font=f(900, 64); const w2=sl ? ctx.measureText(sl).width : 0;
  const x0=540-(w1+w2)/2;
  ctx.textAlign='left'; ctx.fillStyle=C.gold; ctx.font=f(900, 150); ctx.fillText(sc, x0, 440);
  if(sl){ ctx.fillStyle=C.muted; ctx.font=f(900, 64); ctx.fillText(sl, x0+w1, 440); }
  ctx.textAlign='center'; ctx.fillStyle=C.muted; ctx.font=f(800, 32);
  ctx.fillText(d.played>0 ? `${d.hits}/${d.played} trafionych${d.scale>0 ? ' · skala bez premii' : ''}` : 'punkty', 540, 498);
  let y=600; ctx.textAlign='left';
  // ranking (Solo/Drużyny) albo MVP (Wspólna)
  if(d.comp && ranking.length){
    ctx.fillStyle=C.muted; ctx.font=f(900, 30); ctx.fillText('RANKING', 60, y); y+=20;
    ranking.slice(0, 3).forEach(r=>{
      ctx.fillStyle=C.ink; ctx.font=f(900, 40); ctx.textAlign='left';
      ctx.fillText(String(r.place||'')+'.', 60, y+46);
      wrap(ctx, String(r.name||''), 720, 1).forEach(l=>ctx.fillText(l, 130, y+46));
      ctx.textAlign='right'; ctx.fillStyle=C.gold; ctx.fillText(String(Math.round(Number(r.score)||0)), 1020, y+46);
      ctx.textAlign='left'; y+=62;
    });
    y+=56;
  } else if(d.mvp && d.mvp.name){
    ctx.fillStyle=C.muted; ctx.font=f(900, 30); ctx.fillText('⭐ MVP STOŁU', 60, y);
    ctx.fillStyle=C.ink; ctx.font=f(900, 44); wrap(ctx, `${d.mvp.name} · ${d.mvp.correct} trafnych`, 960, 1).forEach(l=>ctx.fillText(l, 60, y+56));
    y+=120;
  }
  // zagrane utwory
  if(tracks.length){
    const max=Math.max(1, Math.min(tracks.length, Math.floor((1210-y-30)/58)));
    ctx.fillStyle=C.muted; ctx.font=f(900, 30); ctx.fillText('ZAGRANE UTWORY', 60, y); y+=16;
    tracks.slice(0, max).forEach(t=>{
      ctx.fillStyle=t.ok ? C.green : C.red; ctx.font=f(900, 38); ctx.fillText(t.ok ? '✓' : '✗', 60, y+44);
      ctx.fillStyle=C.ink; ctx.font=f(800, 34);
      wrap(ctx, `${t.title} — ${t.artist}`, 900, 1).forEach(l=>ctx.fillText(l, 116, y+44));
      y+=58;
    });
    if(tracks.length>max){ ctx.fillStyle=C.muted; ctx.font=f(800, 30); ctx.fillText(`+ ${tracks.length-max} więcej`, 116, y+36); }
  }
  // stopka
  ctx.textAlign='left'; ctx.fillStyle=C.muted; ctx.font=f(700, 30);
  const host=String(d.url||'').replace(/^https?:\/\//, '').replace(/\/$/, '');
  ctx.fillText(host ? `Zagraj z nami: ${host}`.slice(0, 60) : 'Zagraj z nami!', 60, 1300);
}

/* udostępnij: obrazek (share z plikiem) → fallback: pobranie PNG + tekst do schowka */
export async function shareMpResult(d){
  const text=resultShareText(d);
  const blob=await renderCardPng(ctx=>drawMpResultCard(ctx, d));
  return shareCardPng({ blob, file:RESULT_FILE, text, title:'Wynik meczu' });
}
