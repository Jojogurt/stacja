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
const APP_VERSION = 'v60';   // audyt 2026-10 F8b: Stacja dnia (seed daty, jedna próba, seria dni, udostępnianie), lepsze dystraktory ABCD, legenda wg trybu
try{ window.STACJA_VERSION = APP_VERSION; const _v=document.getElementById('appVer'); if(_v) _v.textContent = APP_VERSION; }catch(_e){}

/* ---- motyw: segment w ustawieniach menu (#themeSeg) — Jasny / Ciemny / Systemowy (F6a, R-U7).
   Brak wyboru (albo 'system') → decyduje prefers-color-scheme (też na żywo, gdy system zmieni motyw).
   Klasa html.dark; wczesny skrypt w <head> ustawia ją przed renderem ---- */
(function wireTheme(){
  const seg=document.getElementById('themeSeg');
  let mq=null; try{ mq=window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; }catch(e){}
  const pref=()=>{ let t=null; try{ t=localStorage.getItem('stacjaTheme'); }catch(e){} return (t==='dark'||t==='light') ? t : 'system'; };
  const apply=()=>{
    const p=pref(), dark = p==='dark' || (p==='system' && !!(mq && mq.matches));
    document.documentElement.classList.toggle('dark', dark);
    if(seg) seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.theme===p));
    const m=document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute('content', dark?'#15121E':'#58CC02');
  };
  if(seg) seg.querySelectorAll('button').forEach(b=> b.onclick=()=>{
    try{ localStorage.setItem('stacjaTheme', b.dataset.theme); }catch(e){}
    apply();
  });
  try{ if(mq){ const on=()=>{ if(pref()==='system') apply(); }; if(mq.addEventListener) mq.addEventListener('change', on); else if(mq.addListener) mq.addListener(on); } }catch(e){}
  apply();
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
