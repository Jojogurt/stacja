/* app/dom.js — bezstanowe prymitywy DOM/FX (warstwa-liść).
 * Zależą tylko od DOM + core/util; NIE znają stanu aplikacji ani siebie nawzajem
 * (poza flash→setIcon). Dzięki temu można je importować bez ryzyka cykli. */
import { escapeHtml } from '../core/util.js';

// ikona pokrętła odtwarzania: play / pause / wait (spinner)
export function setIcon(mode){
  const i=document.getElementById('knobIcon');
  if(mode==='pause') i.innerHTML='<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  else if(mode==='wait') i.innerHTML='<path d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="currentColor" stroke-width="2.4"/>';
  else i.innerHTML='<path d="M8 5v14l11-7z"/>';
}

// pierścień postępu (0..1) wokół pokrętła
export function setRing(p){ document.getElementById('ring').style.background=
  `conic-gradient(var(--gold) ${Math.max(0,Math.min(1,p))*360}deg, var(--line) 0deg)`; }

export function setState(t){ const e=document.getElementById('state'); e.classList.remove('err'); e.textContent=t; }
export function flash(t){ const e=document.getElementById('state'); e.classList.add('err'); e.textContent=t; setIcon('play'); }

// one-shot animacja wejścia pod-ekranu (tylko przy realnej zmianie widoku)
export function animIn(el){
  if(!el) return;
  try{ if(matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
  el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in');
}

// wspólny loader „Beat & Beka" (3 kropki) — używany tam, gdzie ekran czeka na dane (profil/liga/MP)
export const bbLoader = '<div class="bb-loader"><i></i><i></i><i></i></div>';

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
export function hideReveal(){ document.getElementById('reveal').classList.remove('show'); }

// #14: tekst piosenki na ekranie (tryb lektor) — czytany ORAZ widoczny
export function showLyric(text){ const b=document.getElementById('lyricBox'); if(!b) return;
  b.classList.remove('quiz');
  b.innerHTML='<span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>'+escapeHtml(text||''); b.hidden=false; }
export function hideLyric(){ const b=document.getElementById('lyricBox'); if(b){ b.hidden=true; b.innerHTML=''; b.classList.remove('quiz'); } }
