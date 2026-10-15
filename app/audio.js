/* app/audio.js — odtwarzanie audio w trybie SOLO (element HTMLAudio + „od tyłu" + fragment).
 * Stan odtwarzacza (element `el`, `revSrc`) zamknięty w module. Stan gry (`current`/`mode`)
 * i wznowienie rundy (`newRound`) wstrzykiwane przez initAudio — bez cyklu z app.js.
 *
 * F2a #9 (iOS): JEDEN trwały element <audio> (jak mpEnsureAudio w MP) — odblokowany w geście
 * („Zacznij mecz"/„Następny"/„pomiń") przez unlockSoloAudio, potem tylko zmiana .src per runda.
 * iOS odblokowuje per-element, więc nowy `new Audio()` po await w każdej rundzie kończył się
 * NotAllowedError i dodatkowym stuknięciem.
 * F2a #15: listenery są trwałe i działają TYLKO na bieżącą rundę odtwarzania (`round`), którą
 * stopAudio zeruje — spóźnione zdarzenia poprzedniej rundy nic nie ruszają. */
import { setIcon, setRing, setState } from './dom.js';
import { lektorStop, lektorPlay, isSpeaking } from './lektor.js';
import { ensureCtx, ensureCtxResumed, unlockCtx } from './audioCtx.js';
import { playReverse, unlockAudioElement } from '../adapters-web/webAudio.js';
import { SNIP_SECS as SNIP, soloSnipStart } from '../core/timing.js';

let el = null;           // trwały element HTMLAudio (music/snippet/fallback „od tyłu")
let round = null;        // bieżące odtwarzanie na `el`: {cur, mode, said} — null = element bezczynny
let revSrc = null;       // uchwyt BufferSource trybu „od tyłu" (z playReverse)
// iOS: zajawka quizu PRZEJMUJE dźwięk ('playback'); po stopie wracamy do 'ambient' (UI miksuje, nie pauzuje muzyki)
const audioSession = t => { try{ if(navigator.audioSession) navigator.audioSession.type = t; }catch(e){} };

// wstrzyknięte zależności (stan gry + wznowienie rundy + token rundy + flaga „strojenie")
let getCurrent = () => null, getMode = () => 'music', requestRound = () => {}, getGen = () => 0, getBusy = () => false;
let revDecodingGen = null;   // F2a #14: dekodowanie „od tyłu" w toku DLA tej rundy (token, nie globalna flaga)
export function initAudio({ current, mode, newRound, gen, busy }){
  getCurrent = current; getMode = mode; requestRound = newRound;
  if(gen) getGen = gen; if(busy) getBusy = busy;
}

function armControls(){
  document.getElementById('knob').classList.add('live');
  document.getElementById('check').disabled=false;
  document.getElementById('replay').disabled=false;
  document.getElementById('skip').disabled=false;
  document.getElementById('fTitle').focus({preventScroll:true});
}

// trwały element + listenery wiązane RAZ; każdy handler sprawdza `round` (bieżące odtwarzanie)
function ensureEl(){
  if(el) return el;
  el = new Audio(); el.preload='auto';
  // ikona gałki STEROWANA REALNYM stanem odtwarzacza (nie optymistycznie) — #1/#3
  el.addEventListener('playing',()=>{ if(!round) return; setIcon('pause');
    if(!round.said){ round.said=true; setState(round.mode==='snippet'?'słuchaj — krótki fragment!':(round.mode==='reverse'?'„od tyłu" niedostępne tutaj — gram normalnie':'słuchaj uważnie…')); } });
  el.addEventListener('play',   ()=>{ if(round) setIcon('pause'); });
  el.addEventListener('pause',  ()=>{ if(round && !el.ended) setIcon('play'); });
  el.addEventListener('waiting',()=>{ if(round) setIcon('wait'); });
  // 2.2: 404/stall zajawki → nie zawieszaj rundy; pokaż komunikat i odblokuj pomiń/sprawdź
  el.addEventListener('error',  ()=>{ if(!round) return; setIcon('play'); setState('zajawka niedostępna — pomiń albo sprawdź'); armControls(); });
  el.addEventListener('ended',  ()=>{ if(!round) return; round=null; setIcon('play'); setRing(1); setState('koniec zajawki · ↻ od nowa'); });
  el.addEventListener('loadedmetadata',()=>{
    if(!round || round.mode!=='snippet' || round.seeked) return;
    round.seeked=true;
    const cur=round.cur, dur=el.duration||25;
    if(cur.snipStart==null) cur.snipStart=soloSnipStart(dur);
    try{ el.currentTime=cur.snipStart; }catch(_e){}
    playEl();
  });
  el.addEventListener('timeupdate',()=>{
    if(!round) return;
    if(round.mode==='snippet'){
      const cur=round.cur; if(cur.snipStart==null) return;
      const t=el.currentTime-cur.snipStart;
      setRing(Math.min(1, t/SNIP));
      if(t>=SNIP){ round.snipDone=true; el.pause(); setIcon('play'); setRing(1); setState('fragment '+SNIP+'s · ↻ jeszcze raz'); }
      return;
    }
    setRing(el.duration?el.currentTime/el.duration:0);
  });
  return el;
}

// F2a #9: odblokowanie w GEŚCIE (synchronicznie) — AudioContext („od tyłu") i trwały element.
// Element odblokowujemy tylko, gdy nie gra (ciche WAV podmienia .src).
export function unlockSoloAudio({ ctx=true } = {}){
  if(ctx) unlockCtx();
  const e=ensureEl();
  if(!round) unlockAudioElement(e);
}

function playEl(){
  const r=round;
  el.play().then(()=>{ if(round===r) armControls(); })
    .catch(()=>{ if(round!==r) return; setIcon('play'); setState('stuknij ▶, by odtworzyć'); armControls(); });
}

// załaduj zajawkę bieżącej rundy na trwały element
function loadEl(cur, mode){
  ensureEl();
  round={ cur, mode, said:false, seeked:false, snipDone:false };
  el.muted=false;
  el.src=cur.preview;
  setIcon('wait'); setState('ładowanie…');
}

// dyspozytor — wybiera sposób odtwarzania wg trybu
export function startAudio(){
  stopAudio();                // 2.1: nigdy dwa utwory naraz (np. klik w gałkę podczas strojenia)
  audioSession('playback');   // quiz przejmuje dźwięk (wszystkie tryby: music/snippet/reverse)
  const mode=getMode(), current=getCurrent();
  if(!current) return;
  if(mode==='reverse'){ return startReverse(); }
  if(mode==='snippet'){ return startSnippet(); }
  loadEl(current, 'music');
  playEl();   // tekst stanu dopiero gdy dźwięk RZECZYWIŚCIE leci ('playing') — #5: nie udawaj, że gra
}

// ✂️ fragment — krótkie okno z losowego miejsca zajawki (seek + play po loadedmetadata)
function startSnippet(){
  const current=getCurrent();
  loadEl(current, 'snippet');   // seek + play w trwałym listenerze 'loadedmetadata'
}

// 🔄 od tyłu — dekoduje zajawkę i odtwarza odwróconą (Web Audio, przez AudioPort)
async function startReverse(){
  const gen=getGen();       // 2.1: token rundy — po zdekodowaniu graj tylko, jeśli runda ta sama
  if(revDecodingGen===gen) return;   // F2a #14: dekodowanie TEJ rundy w toku → nie startuj drugiego; inna runda startuje zawsze
  const current=getCurrent();
  revDecodingGen=gen;
  // F2a #9: kontekst wstrzymany (iOS poza gestem) — powiedz graczowi, że trzeba stuknąć gałkę
  let ctxState='running'; try{ ctxState=ensureCtx().state; }catch(_e){}
  if(ctxState==='suspended'){ setIcon('play'); setState('stuknij ▶, by odtworzyć „od tyłu"'); armControls(); }
  else { setIcon('wait'); setState('odwracam…'); }
  let r;
  try{
    const ctx=await ensureCtxResumed();
    if(getGen()===gen && ctxState==='suspended'){ setIcon('wait'); setState('odwracam…'); }
    r=await playReverse(ctx, current.preview, {
      cfg: window.STACJA_CONFIG,
      shouldPlay: ()=>getGen()===gen && !!getCurrent(),   // runda mogła się zmienić w trakcie dekodowania
      onProgress: f=>setRing(f),
      onEnded: ()=>{ revSrc=null; setIcon('play'); setRing(1); setState('koniec · ↻ od nowa'); },
    });
  } finally {
    if(revDecodingGen===gen) revDecodingGen=null;
  }
  if(!r || r.aborted) return;                           // runda już inna → cisza, bez fallbacku
  if(getGen()!==gen || !getCurrent()){ if(r.ok) r.stop(); return; }   // podwójny bezpiecznik po awaitach
  if(r.ok){ revSrc=r; setIcon('pause'); setState('słuchaj — od tyłu!'); armControls(); return; }
  // i proxy i dekodowanie padło → zagraj normalnie (na trwałym, odblokowanym elemencie), żeby runda działała
  loadEl(current, 'reverse');
  playEl();
}

export function stopAudio(){
  const r=round; round=null;                  // F2a #15: najpierw odepnij rundę — 'pause' poniżej już nic nie ruszy
  if(el && r){ try{ el.pause(); }catch(_e){} }
  if(revSrc){ revSrc.stop(); revSrc=null; }   // uchwyt z playReverse sam czyści timer
  lektorStop(); setRing(0); document.getElementById('knob').classList.remove('live');
  audioSession('ambient');   // koniec zajawki → oddaj dźwięk muzyce w tle
}

export function toggleAudio(){
  if(getBusy()) return;   // 2.1: podczas ładowania pytania (strojenie) gałka nieaktywna — spójne z wyłączonymi przyciskami
  unlockCtx();
  const current=getCurrent(), mode=getMode();
  if(!current){ unlockSoloAudio({ctx:false}); requestRound(); return; }
  if(mode==='quiz'){ return; }   // wiedza ogólna — brak audio do odtworzenia
  if(mode==='lektor'){
    if(isSpeaking()){ lektorStop(); setIcon('play'); setState('pauza · ▶ wznów'); return; }   // czyta → stop
    lektorPlay(current.lyric, current.tts, setState); return;
  }
  if(mode==='reverse' && !round){
    if(revSrc){ stopAudio(); setIcon('play'); setState('pauza · ↻ od nowa'); return; }     // od tyłu: stop (replay od nowa)
    startReverse(); return;
  }
  // music / snippet (i fallback „od tyłu") — trwały element: pauza/wznów BEZ restartu (jak w multi)
  if(round && !el.paused && !el.ended){ el.pause(); return; }                                // gra → pauza
  if(round && round.cur===current && !el.ended && el.currentTime>0 && !round.snipDone){
    el.play().catch(()=>{}); return;                                                         // pauza → wznów (od miejsca)
  }
  startAudio();   // świeże / po 'ended' / fragment dograł → od nowa
}

export function replay(){
  const current=getCurrent(), mode=getMode();
  if(!current) return;
  if(mode==='lektor'){ lektorPlay(current.lyric, current.tts, setState); return; }
  stopAudio(); startAudio();
}

// do testów (siatka jsdom): trwały element solo i stan dekodowania „od tyłu"
export const _soloAudioDebug = () => ({ el, round, revDecodingGen });
