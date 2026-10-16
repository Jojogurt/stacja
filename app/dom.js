/* app/dom.js — bezstanowe prymitywy DOM/FX (warstwa-liść).
 * Zależą tylko od DOM + core/util; NIE znają stanu aplikacji ani siebie nawzajem
 * (poza flash→setIcon). Dzięki temu można je importować bez ryzyka cykli. */
import { escapeHtml } from '../core/util.js';
import { listenStop } from './listen.js';   // Łamigłówki: zamknięcie odsłony ucisza „▶ posłuchaj" (listen.js to też liść)

/* F2a #11: bezpieczny dostęp do localStorage. Safari/Firefox z zablokowanymi danymi witryn (i iframe
   sandbox) RZUCA SecurityError już przy odczycie `localStorage` — moduł, który dotknie go przy imporcie
   bez try, wywraca cały boot. Każdy odczyt/zapis w app/ idzie przez te helpery. */
export function lsGet(key, def=null){ try{ const v=localStorage.getItem(key); return v==null ? def : v; }catch(_e){ return def; } }
export function lsSet(key, value){ try{ localStorage.setItem(key, String(value)); return true; }catch(_e){ return false; } }

/* EKSPERYMENT (płyta winylowa, app/vinyl.js): obserwatorzy REALNEGO stanu odtwarzacza — ikona gałki (play/pause/wait)
 * i postęp pierścienia to jedno źródło prawdy dla wszystkich torów audio (element, WebAudio), więc płyta słucha tego samego. */
const knobObs=[], ringObs=[];
export function onKnob(fn){ if(typeof fn==='function') knobObs.push(fn); }
export function onRing(fn){ if(typeof fn==='function') ringObs.push(fn); }
// stan odtwarzacza solo: play / pause / wait (ładowanie) / error — płyta winylowa (app/vinyl.js) słucha przez onKnob.
// (dawna okrągła gałka #knob zastąpiona płytą we wszystkich trybach — poprawki po testach)
export function setIcon(mode){ knobObs.forEach(f=>{ try{ f(mode); }catch(_e){} }); }
// postęp zajawki (0..1) — złoty łuk na obwodzie płyty + ramię gramofonu (onRing)
export function setRing(p){ ringObs.forEach(f=>{ try{ f(p); }catch(_e){} }); }
// „runda uzbrojona" (dawniej .knob.live) — klasa na płycie
export function setLive(on){ const v=document.getElementById('vinyl'); if(v) v.classList.toggle('live', !!on); }

export function setState(t){ const e=document.getElementById('state'); e.classList.remove('err'); e.textContent=t; }
export function flash(t){ const e=document.getElementById('state'); e.classList.add('err'); e.textContent=t; setIcon('play'); }

// one-shot animacja wejścia pod-ekranu (tylko przy realnej zmianie widoku)
export function animIn(el){
  if(!el) return;
  try{ if(matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
  el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in');
}

// confetti przy trafieniu (lekkie, czysty DOM/CSS; pomijane przy reduce-motion)
export function confetti(n=90){
  try{ if(matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
  let fx=document.getElementById('confettiFx');
  if(!fx){ fx=document.createElement('div'); fx.id='confettiFx'; document.body.appendChild(fx); }
  const colors=['#58CC02','#1CB0F6','#FFC800','#FF4B4B','#CE82FF'];
  for(let i=0;i<n;i++){
    const p=document.createElement('i'); p.className='cf';
    p.style.left=Math.random()*100+'%';
    p.style.background=colors[i%colors.length];
    p.style.setProperty('--x',(Math.random()*220-110)+'px');
    p.style.setProperty('--r',(Math.random()*720-360)+'deg');
    p.style.animationDelay=(Math.random()*0.2).toFixed(2)+'s';
    p.style.animationDuration=(1.6+Math.random()*1.2).toFixed(2)+'s';
    if(i%3===0) p.style.borderRadius='50%';
    fx.appendChild(p); setTimeout(()=>p.remove(), 3200);
  }
}

export function val(id){ return document.getElementById(id).value.trim(); }
export function resetForm(){ ['fTitle','fArtist','fYear','fAlbum'].forEach(id=>document.getElementById(id).value=''); }
export function hideReveal(){ listenStop(); document.getElementById('reveal').classList.remove('show'); }

/* Łamigłówki: treść pytania jako HTML (escapowana). style 'rebus' → pierwsza linia (emoji) DUŻA i wyśrodkowana,
   reszta (podpowiedź kategorii „🎵 tytuł…") zwykłym krojem. Wspólne dla solo (#lyricBox) i MP (mpPromptHTML). */
export function promptBodyHTML(text, style){
  const t=String(text||'');
  if(style!=='rebus') return escapeHtml(t);
  const lines=t.split('\n'); const big=lines.shift()||'';
  const rest=lines.join('\n').trim();
  return `<span class="rebus-big">${escapeHtml(big)}</span>`+(rest?`<span class="rebus-hint">${escapeHtml(rest)}</span>`:'');
}

// #14: tekst piosenki na ekranie (tryb lektor) — czytany ORAZ widoczny
export function showLyric(text){ const b=document.getElementById('lyricBox'); if(!b) return;
  b.classList.remove('quiz','rebus');
  b.innerHTML='<span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>'+escapeHtml(text||''); b.hidden=false; }
export function hideLyric(){ const b=document.getElementById('lyricBox'); if(b){ b.hidden=true; b.innerHTML=''; b.classList.remove('quiz','rebus'); } }
