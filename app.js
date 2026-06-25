/* app.js — entry point STACJA: montaż modułów + bootstrap (wersja, motyw).
 * Cała logika żyje w core/ (czysty rdzeń, bez DOM) i app/ (warstwa DOM/sieć):
 *   app/solo.js — tryb solo · app/mp.js — multiplayer · app/social.js — ekrany/liga/profil
 *   app/audio·audioCtx·lektor·dom — odtwarzanie i prymitywy · app/catalog.js — dane kategorii.
 * Granica zależności: app/ zależy od core/, nigdy od app.js. */
import './app/solo.js';                              // tryb SOLO (self-wiring; ciągnie catalog/audio/lektor/mp)
import { initMp, mpBootDeepLink } from './app/mp.js';

// wersja apki — pokazywana pod logo. Bumpuj RAZEM z CACHE w sw.js (np. v12 → v13),
// inaczej PWA serwuje stary kod.
const APP_VERSION = 'v18';   // MP salon: normalne fazy większe + host nadpisuje board; nicki, emotki (🖕, dark podpis), layout faz, sticky dół
try{ window.STACJA_VERSION = APP_VERSION; const _v=document.getElementById('appVer'); if(_v) _v.textContent = APP_VERSION; }catch(_e){}

/* ---- motyw jasny/ciemny (klasa html.dark; wczesny skrypt w <head> ustawia ją przed renderem) ---- */
(function wireTheme(){
  const btn=document.getElementById('themeToggle'); if(!btn) return;
  const sync=()=>{ const dark=document.documentElement.classList.contains('dark');
    btn.textContent=dark?'☀️':'🌙';
    const m=document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute('content', dark?'#15121E':'#58CC02');
  };
  btn.onclick=()=>{ const dark=document.documentElement.classList.toggle('dark');
    try{ localStorage.setItem('stacjaTheme', dark?'dark':'light'); }catch(e){} sync(); };
  sync();
})();

initMp();             // mp.js woła initSocial (powiązania MP↔social)
mpBootDeepLink();     // ?room= w URL → wejdź do lobby (po initMp/initSocial)
