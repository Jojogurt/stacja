/* app/audio.js — odtwarzanie audio w trybie SOLO (element HTMLAudio + „od tyłu" + fragment).
 * Stan odtwarzacza (element `audio`, `revSrc`) zamknięty w module. Stan gry (`current`/`mode`)
 * i wznowienie rundy (`newRound`) wstrzykiwane przez initAudio — bez cyklu z app.js. */
import { setIcon, setRing, setState, flash } from './dom.js';
import { lektorStop, lektorPlay, isSpeaking } from './lektor.js';
import { ensureCtxResumed, unlockCtx } from './audioCtx.js';
import { playReverse } from '../adapters-web/webAudio.js';
import { SNIP_SECS as SNIP, soloSnipStart } from '../core/timing.js';

let audio = null;        // bieżący element HTMLAudio (music/snippet/fallback)
let revSrc = null;       // uchwyt BufferSource trybu „od tyłu" (z playReverse)
// iOS: zajawka quizu PRZEJMUJE dźwięk ('playback'); po stopie wracamy do 'ambient' (UI miksuje, nie pauzuje muzyki)
const audioSession = t => { try{ if(navigator.audioSession) navigator.audioSession.type = t; }catch(e){} };

// wstrzyknięte zależności (stan gry + wznowienie rundy + token rundy + flaga „strojenie")
let getCurrent = () => null, getMode = () => 'music', requestRound = () => {}, getGen = () => 0, getBusy = () => false;
let revDecoding = false;   // 2.1: guard przed podwójnym startem dekodowania „od tyłu"
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

// ikona gałki STEROWANA REALNYM stanem odtwarzacza (nie optymistycznie) —
// inaczej ikona „pauza" pokazywała się mimo ciszy/buforowania (#1/#3)
// 2.1: WSZYSTKIE listenery ignorują zdarzenia z elementu, który nie jest już bieżącym `audio`
// (stary element z poprzedniej rundy dograwa/pauzuje i inaczej nadpisywałby ikonę/status nowej).
function bindAudioUI(el){
  el.addEventListener('playing',()=>{ if(el===audio) setIcon('pause'); });
  el.addEventListener('play',   ()=>{ if(el===audio) setIcon('pause'); });
  el.addEventListener('pause',  ()=>{ if(el===audio && !el.ended) setIcon('play'); });
  el.addEventListener('waiting',()=>{ if(el===audio) setIcon('wait'); });
  // 2.2: 404/stall zajawki → nie zawieszaj rundy; pokaż komunikat i odblokuj pomiń/sprawdź
  el.addEventListener('error',  ()=>{ if(el!==audio) return; setIcon('play'); setState('zajawka niedostępna — pomiń albo sprawdź'); armControls(); });
}

// dyspozytor — wybiera sposób odtwarzania wg trybu
export function startAudio(){
  stopAudio();                // 2.1: nigdy dwa utwory naraz (np. klik w gałkę podczas strojenia)
  audioSession('playback');   // quiz przejmuje dźwięk (wszystkie tryby: music/snippet/reverse)
  const mode=getMode(), current=getCurrent();
  if(!current) return;
  if(mode==='reverse'){ return startReverse(); }
  if(mode==='snippet'){ return startSnippet(); }
  audio=new Audio(current.preview); audio.preload='auto';
  bindAudioUI(audio);
  setIcon('wait'); setState('ładowanie…');
  audio.addEventListener('timeupdate',()=>{
    const p=audio.duration?audio.currentTime/audio.duration:0;
    setRing(p);
  });
  // tekst stanu dopiero gdy dźwięk RZECZYWIŚCIE leci (#5: nie udawaj, że gra)
  audio.addEventListener('playing',()=>setState('słuchaj uważnie…'),{once:true});
  audio.addEventListener('ended',()=>{ audio=null; setIcon('play'); setRing(1); setState('koniec zajawki · ↻ od nowa'); });
  audio.play().then(()=>{ armControls(); })
    .catch(()=>{ setIcon('play'); setState('naciśnij ▶, by odtworzyć'); armControls(); });
}

// ✂️ fragment — krótkie okno z losowego miejsca zajawki
function startSnippet(){
  const current=getCurrent();
  audio=new Audio(current.preview); audio.preload='auto';
  bindAudioUI(audio);
  setIcon('wait'); setState('ładowanie…');
  audio.addEventListener('loadedmetadata',()=>{
    const dur=audio.duration||25;
    if(current.snipStart==null) current.snipStart=soloSnipStart(dur);
    audio.currentTime=current.snipStart;
    audio.play().then(()=>{ setState('słuchaj — krótki fragment!'); armControls(); }).catch(()=>{ setIcon('play'); setState('naciśnij ▶'); armControls(); });
  });
  audio.addEventListener('timeupdate',()=>{
    if(current.snipStart==null) return;
    const el=audio.currentTime-current.snipStart;
    setRing(Math.min(1, el/SNIP));
    if(el>=SNIP){ audio.pause(); setIcon('play'); setRing(1); setState('fragment '+SNIP+'s · ↻ jeszcze raz'); }
  });
}

// 🔄 od tyłu — dekoduje zajawkę i odtwarza odwróconą (Web Audio, przez AudioPort)
async function startReverse(){
  if(revDecoding) return;   // 2.1: dekodowanie w toku → nie startuj drugiego (dwie odwrócone naraz)
  const current=getCurrent();
  const gen=getGen();       // 2.1: token rundy — po zdekodowaniu graj tylko, jeśli runda ta sama
  setIcon('wait'); setState('odwracam…');
  revDecoding=true;
  const ctx=await ensureCtxResumed();
  const r=await playReverse(ctx, current.preview, {
    cfg: window.STACJA_CONFIG,
    shouldPlay: ()=>getGen()===gen && !!getCurrent(),   // runda mogła się zmienić w trakcie dekodowania
    onProgress: f=>setRing(f),
    onEnded: ()=>{ revSrc=null; setIcon('play'); setRing(1); setState('koniec · ↻ od nowa'); },
  });
  revDecoding=false;
  if(r.aborted) return;                                 // runda już inna → cisza, bez fallbacku
  if(getGen()!==gen || !getCurrent()) return;           // podwójny bezpiecznik po awaitach
  if(r.ok){ revSrc=r; setIcon('pause'); setState('słuchaj — od tyłu!'); armControls(); return; }
  // i proxy i dekodowanie padło → zagraj normalnie, żeby runda działała
  audio=new Audio(current.preview); bindAudioUI(audio);
  audio.play().then(()=>{ setState('„od tyłu" niedostępne tutaj — gram normalnie'); armControls(); }).catch(()=>{ setState('nie udało się odtworzyć'); armControls(); });
}

export function stopAudio(){
  if(audio){audio.pause();audio=null;}
  if(revSrc){ revSrc.stop(); revSrc=null; }   // uchwyt z playReverse sam czyści timer
  lektorStop(); setRing(0); document.getElementById('knob').classList.remove('live');
  audioSession('ambient');   // koniec zajawki → oddaj dźwięk muzyce w tle
}

export function toggleAudio(){
  if(getBusy()) return;   // 2.1: podczas ładowania pytania (strojenie) gałka nieaktywna — spójne z wyłączonymi przyciskami
  unlockCtx();
  const current=getCurrent(), mode=getMode();
  if(!current){ requestRound(); return; }
  if(mode==='quiz'){ return; }   // wiedza ogólna — brak audio do odtworzenia
  if(mode==='lektor'){
    if(isSpeaking()){ lektorStop(); setIcon('play'); setState('pauza · ▶ wznów'); return; }   // czyta → stop
    lektorPlay(current.lyric, current.tts, setState); return;
  }
  if(mode==='reverse'){
    if(revSrc){ stopAudio(); setIcon('play'); setState('pauza · ↻ od nowa'); return; }     // od tyłu: stop (replay od nowa)
    startReverse(); return;
  }
  // music / snippet — trwały element HTMLAudio z eventami: pauza/wznów BEZ restartu (jak w multi)
  if(audio && !audio.paused && !audio.ended){ audio.pause(); return; }                       // gra → pauza
  const snipDone = mode==='snippet' && audio && current.snipStart!=null && (audio.currentTime-current.snipStart)>=SNIP;
  if(audio && audio.src && !audio.ended && audio.currentTime>0 && !snipDone){
    audio.play().catch(()=>{}); return;                                                      // pauza → wznów (od miejsca)
  }
  startAudio();   // świeże / po 'ended' (audio=null) / fragment dograł → od nowa
}

export function replay(){
  const current=getCurrent(), mode=getMode();
  if(!current) return;
  if(mode==='lektor'){ lektorPlay(current.lyric, current.tts, setState); return; }
  stopAudio(); startAudio();
}
