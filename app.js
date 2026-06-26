/* app.js — entry point STACJA: montaż modułów + bootstrap (wersja, motyw).
 * Cała logika żyje w core/ (czysty rdzeń, bez DOM) i app/ (warstwa DOM/sieć):
 *   app/solo.js — tryb solo · app/mp.js — multiplayer · app/social.js — ekrany/liga/profil
 *   app/audio·audioCtx·lektor·dom — odtwarzanie i prymitywy · app/catalog.js — dane kategorii.
 * Granica zależności: app/ zależy od core/, nigdy od app.js. */
import './app/solo.js';                              // tryb SOLO (self-wiring; ciągnie catalog/audio/lektor/mp)
import './app/sfx.js';                               // UI-dźwięki (klik na buttonach, oklaski przy trafieniu)
import { initMp, mpBootDeepLink } from './app/mp.js';

// wersja apki — pokazywana pod logo. Bumpuj RAZEM z CACHE w sw.js (np. v12 → v13),
// inaczej PWA serwuje stary kod.
const APP_VERSION = 'v34';   // MP: fix migania treści przed intrem — ukrycie synchroniczne (przed innerHTML), nie w rAF
try{ window.STACJA_VERSION = APP_VERSION; const _v=document.getElementById('appVer'); if(_v) _v.textContent = APP_VERSION; }catch(_e){}

/* ---- motyw jasny/ciemny: segment w ustawieniach menu (#themeSeg, jak układ gry);
   klasa html.dark, wczesny skrypt w <head> ustawia ją przed renderem ---- */
(function wireTheme(){
  const seg=document.getElementById('themeSeg'); if(!seg) return;
  const sync=()=>{ const dark=document.documentElement.classList.contains('dark');
    seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.theme===(dark?'dark':'light')));
    const m=document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute('content', dark?'#15121E':'#58CC02');
  };
  seg.querySelectorAll('button').forEach(b=> b.onclick=()=>{
    const dark=b.dataset.theme==='dark';
    document.documentElement.classList.toggle('dark', dark);
    try{ localStorage.setItem('stacjaTheme', dark?'dark':'light'); }catch(e){} sync();
  });
  sync();
})();

/* ---- dźwięki UI (klik + oklaski) wł/wył — segment w ustawieniach. NIE dotyka muzyki quizu
   (ta gra niezależnie). Flaga localStorage 'bbSfx'; app/sfx.js czyta ją przy każdym dźwięku. ---- */
(function wireSfx(){
  const seg=document.getElementById('sfxSeg'); if(!seg) return;
  const sync=()=>{ let on=true; try{ on=localStorage.getItem('bbSfx')!=='off'; }catch(e){}
    seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.sfx===(on?'on':'off'))); };
  seg.querySelectorAll('button').forEach(b=> b.onclick=()=>{
    try{ localStorage.setItem('bbSfx', b.dataset.sfx==='off'?'off':'on'); }catch(e){} sync();
  });
  sync();
})();

initMp();             // mp.js woła initSocial (powiązania MP↔social)
mpBootDeepLink();     // ?room= w URL → wejdź do lobby (po initMp/initSocial)
