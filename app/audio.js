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
import { playReverse, unlockAudioElement, fetchAudioBytes, sliceBuffer, buildMedleyBuffer, playBuffer, decodeAudio, setElementRate } from '../adapters-web/webAudio.js';
import { SNIP_SECS as SNIP, soloSnipStart, introStageSecs, revsnipEnd, revsnipWindow, medleyClipStart, MEDLEY_CLIP_S, MEDLEY_GAP_S, isTempoMode, tempoRate } from '../core/timing.js';
import { MEDLEY_MIN } from '../core/trackSelect.js';
import { registerMusicProbe, playSfx } from './sfx.js';

let el = null;           // trwały element HTMLAudio (music/snippet/fallback „od tyłu")
let round = null;        // bieżące odtwarzanie na `el`: {cur, mode, said} — null = element bezczynny
let revSrc = null;       // uchwyt BufferSource (WebAudio): „od tyłu" (playReverse), EKSPERYMENT: „od tyłu krótko", składanka
let revCache = null;     // EKSPERYMENT „od tyłu krótko": {url, decoded} — „dłużej"/↻ bez ponownego pobierania i dekodowania
let bufStartGen = null;  // EKSPERYMENT: start bufora (składanka/„od tyłu krótko") tej rundy w toku — bez podwójnego startu po geście
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
    if(round.mode==='intro'){ armIntroStop(); setState('intro '+introStageSecs(round.cur.introStage)+' s…'); return; }   // F8a
    if(round.mode==='medley'){ setState('składanka '+(round.ci+1)+'/'+round.cur.clips.length+'…'); return; }   // EKSPERYMENT (zapas na <audio>)
    if(!round.said){ round.said=true; setState(round.mode==='snippet'?'słuchaj — krótki fragment!':(round.mode==='reverse'?'„od tyłu" niedostępne tutaj — gram normalnie':(round.mode==='tempo'?tempoPlayingState(round.rate):'słuchaj uważnie…'))); } });
  el.addEventListener('play',   ()=>{ if(round) setIcon('pause'); });
  el.addEventListener('pause',  ()=>{ if(round && round.stopT) clearTimeout(round.stopT); if(round && !el.ended) setIcon('play'); });   // F8a: pauza intro wstrzymuje timer etapu
  el.addEventListener('waiting',()=>{ if(round) setIcon('wait'); });
  // 2.2: 404/stall zajawki → nie zawieszaj rundy; pokaż komunikat i odblokuj pomiń/sprawdź
  el.addEventListener('error',  ()=>{ if(!round) return; if(round.mode==='medley'){ medleyElNext(); return; }   // EKSPERYMENT: zepsuty wycinek → następny
    if(round.mode==='intro') round.cur.introBroken=true;   // F8a: bez zajawki intro = jak muzyka (bez mnożnika)
    setIcon('play'); setState('zajawka niedostępna — pomiń albo sprawdź'); armControls(); });
  el.addEventListener('ended',  ()=>{ if(!round) return; if(round.mode==='medley'){ medleyElNext(); return; }
    round=null; setIcon('play'); setRing(1); setState('koniec zajawki · ↻ od nowa'); });
  el.addEventListener('loadedmetadata',()=>{
    if(round && round.mode==='medley' && !round.seeked){   // EKSPERYMENT: zapas składanki — seek do wycinka
      round.seeked=true; const c=round.cur.clips[round.ci];
      if(c.start==null) c.start=medleyClipStart(el.duration||30);
      round.clipStart=c.start; try{ el.currentTime=c.start; }catch(_e){}
      playEl(); return;
    }
    if(!round || round.mode!=='snippet' || round.seeked) return;
    round.seeked=true;
    const cur=round.cur, dur=el.duration||25;
    if(cur.snipStart==null) cur.snipStart=soloSnipStart(dur);
    try{ el.currentTime=cur.snipStart; }catch(_e){}
    playEl();
  });
  el.addEventListener('timeupdate',()=>{
    if(!round) return;
    if(round.mode==='intro'){ introTick(); return; }   // F8a
    if(round.mode==='medley'){ medleyElTick(); return; }   // EKSPERYMENT
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

/* F8a: tryb „intro" (Heardle) — gra od POCZĄTKU zajawki do długości etapu (core/timing.INTRO_STAGES).
 * Stop pilnują dwa mechanizmy: timeupdate (~4 Hz) i precyzyjny setTimeout uzbrajany na 'playing'
 * (etap 1 s nie może przeciec do 1,25 s). Koniec etapu = round.snipDone (gałka/↻ gra etap od nowa). */
function introDone(){
  if(!round || round.mode!=='intro' || round.snipDone) return;
  const lim=introStageSecs(round.cur.introStage);
  round.snipDone=true; clearTimeout(round.stopT); el.pause(); setIcon('play'); setRing(1);
  setState('intro '+lim+' s · zgaduj albo „+ więcej"');
}
function introTick(){
  const lim=introStageSecs(round.cur.introStage);
  setRing(Math.min(1, el.currentTime/lim));
  if(el.currentTime>=lim) introDone();
}
function armIntroStop(){
  if(!round || round.mode!=='intro') return;
  clearTimeout(round.stopT);
  const r=round, lim=introStageSecs(r.cur.introStage);
  r.stopT=setTimeout(()=>{ if(round===r) introDone(); }, Math.max(0, (lim-(el.currentTime||0))*1000));
}
function startIntro(){
  const current=getCurrent();
  loadEl(current, 'intro');
  try{ el.currentTime=0; }catch(_e){}
  playEl();
}
/* ===== EKSPERYMENT: „składanka" — 4 wycinki × 1,5 s, przerwa 250 ms + cichy tik =====
 * Tor główny: WebAudio (patrz adapters-web/webAudio.js — dlaczego nie <audio> na iOS). Wszystkie zajawki pobierane
 * RÓWNOLEGLE, dekodowane po kolei (mniejszy szczyt pamięci: ~10 MB na zdekodowane 30 s), z każdej zostaje tylko
 * wycinek → jeden sklejony bufor `cur.medleyBuf`. Zapas (WebAudio/CORS padło, < MEDLEY_MIN wycinków): kolejne
 * wycinki na TRWAŁYM elemencie (seek + stop + przerwa) — mniej precyzyjnie, ale gra. */
export async function loadMedley(cur, { onProgress, alive=()=>true }={}){
  const clips=cur.clips||[], cfg=window.STACJA_CONFIG;
  let ctx=null; try{ ctx=ensureCtx(); }catch(_e){ ctx=null; }
  if(!ctx || typeof ctx.decodeAudioData!=='function' || typeof ctx.createBuffer!=='function'){ cur.medleyBuf=null; return 0; }
  const bytes=clips.map(c=>fetchAudioBytes(c.preview, cfg).catch(()=>null));
  const parts=[]; let done=0;
  for(let i=0;i<clips.length;i++){
    const b=await bytes[i];
    if(!alive()) return 0;
    try{
      if(!b) throw new Error('fetch');
      const dec=await ctx.decodeAudioData(b);
      if(!alive()) return 0;
      const c=clips[i]; c.start=medleyClipStart(dec.duration);
      parts.push(sliceBuffer(ctx, dec, c.start, MEDLEY_CLIP_S)); c.ok=true;
    }catch(_e){ clips[i].ok=false; }
    done++; if(onProgress) onProgress(done, clips.length);
  }
  cur.medleyBuf = parts.length>=Math.min(MEDLEY_MIN, clips.length) ? buildMedleyBuffer(ctx, parts, { gap:MEDLEY_GAP_S }) : null;
  if(cur.medleyBuf) cur.playedClips=clips.filter(c=>c.ok);   // odsłona: tytuły, które NAPRAWDĘ zagrały
  return parts.length;
}
// wspólny start bufora WebAudio z obsługą iOS (kontekst wstrzymany poza gestem) i tokenem rundy
async function startBuffer(make, { playingState, endState, rate=1, offset=0, onEnd }){
  const gen=getGen();
  if(bufStartGen===gen) return;   // start tej rundy w toku (np. czeka na gest) — drugi klik nie gra drugi raz
  bufStartGen=gen;
  let ctxState='running'; try{ ctxState=ensureCtx().state; }catch(_e){}
  if(ctxState==='suspended'){ setIcon('play'); setState('stuknij ▶, by odtworzyć'); armControls(); }
  else { setIcon('wait'); }
  try{
    const ctx=await ensureCtxResumed();
    if(getGen()!==gen || !getCurrent()) return;
    const buf=await make(ctx);
    if(getGen()!==gen || !getCurrent()) return;
    if(!buf) return 'fail';
    revSrc=playBuffer(ctx, buf, { rate, offset, onProgress:f=>setRing(f), onEnded:()=>{ revSrc=null; if(onEnd) onEnd(); setIcon('play'); setRing(1); setState(endState); } });
    setIcon('pause'); setState(playingState); armControls();
  } catch(_e){ return 'fail'; }
  finally { if(bufStartGen===gen) bufStartGen=null; }
}
async function startMedley(){
  const cur=getCurrent();
  if(!cur.medleyBuf){ startMedleyEl(); return; }
  await startBuffer(async()=>cur.medleyBuf, { playingState:'słuchaj — składanka ('+(cur.playedClips||cur.clips).length+' utwory)!', endState:'koniec składanki · ↻ od nowa' });
}
function startMedleyEl(){ const cur=getCurrent(); armControls(); medleyElClip(cur, 0); }
function medleyElClip(cur, i){
  if(getCurrent()!==cur) return;
  const clips=cur.clips||[];
  if(i>=clips.length){ round=null; setIcon('play'); setRing(1); setState('koniec składanki · ↻ od nowa'); return; }
  ensureEl();
  round={ cur, mode:'medley', ci:i, said:true, seeked:false, snipDone:false, clipStart:null };
  el.muted=false; el.src=clips[i].preview;
  setIcon('wait'); setState('składanka '+(i+1)+'/'+clips.length+' — ładowanie…');
}
function medleyElTick(){
  const r=round, n=r.cur.clips.length;
  if(r.clipStart==null) return;
  const t=el.currentTime-r.clipStart;
  setRing(Math.min(1, (r.ci+Math.min(1, Math.max(0,t)/MEDLEY_CLIP_S))/n));
  if(t>=MEDLEY_CLIP_S) medleyElNext();
}
function medleyElNext(){
  const r=round; if(!r || r.mode!=='medley' || r.snipDone) return;
  r.snipDone=true; r.cur.clips[r.ci].ok=true;
  try{ el.pause(); }catch(_e){}
  playSfx('tick');   // cichy „tik" między wycinkami (zapas: dźwięk UI)
  setTimeout(()=>{ if(round===r) medleyElClip(r.cur, r.ci+1); }, MEDLEY_GAP_S*1000);
}

/* ===== EKSPERYMENT: „od tyłu krótko" — okno 3 s (etap „dłużej": 5 s) z zajawki, odwrócone =====
 * Zdekodowana zajawka trzymana w revCache (↻ / „dłużej" bez ponownego pobierania). Koniec okna `cur.revEnd`
 * losowany raz na pytanie (core/timing.revsnipEnd), więc „dłużej" zaczyna od tych samych 3 s i dokłada 2 s. */
async function startRevsnip(){
  const cur=getCurrent(), url=cur.preview;
  const res=await startBuffer(async(ctx)=>{
    let dec = revCache && revCache.url===url ? revCache.decoded : null;
    if(!dec){ setState('odwracam…'); dec=await decodeAudio(ctx, url, window.STACJA_CONFIG); revCache={ url, decoded:dec }; }
    if(cur.revEnd==null) cur.revEnd=revsnipEnd(dec.duration);
    const w=revsnipWindow(cur.revEnd, cur.revStage||0);
    return sliceBuffer(ctx, dec, w.start, w.secs, { reverse:true });
  }, { playingState:'słuchaj — '+revsnipWindow(cur.revEnd||10, cur.revStage||0).secs+' s od tyłu!', endState:'koniec · ↻ od nowa albo „dłużej"' });
  if(res==='fail' && getCurrent()===cur){   // proxy/dekodowanie padło → zagraj normalnie (jak „od tyłu"), runda działa
    loadEl(cur, 'reverse'); playEl();
  }
}

/* ===== EKSPERYMENT: „zwolnione obroty" (0.6× → „szybciej" 0.75×) / „przyspieszone" (1.5×) =====
 * Tor główny: WebAudio — AudioBufferSourceNode.playbackRate (resampling: tempo I wysokość jak płyta na złych
 * obrotach). Dlaczego nie trwały <audio> z F2a? playbackRate + preservesPitch=false działa w Chrome/Firefox,
 * ale Safari/iOS bywa niekonsekwentny (prefiks webkitPreservesPitch, część wersji ignoruje zmianę wysokości,
 * a nowy .src przywraca defaultPlaybackRate) — a AudioContext odblokowany w geście („Zacznij mecz"/„Następny",
 * jak „od tyłu") gra bufor z dokładnie zadanym tempem. Zdekodowana zajawka w revCache (pauza/„szybciej"/↻ bez
 * ponownego pobierania). Pauza zapamiętuje miejsce (cur.tempoPos), „szybciej" gra dalej od tego samego miejsca.
 * Zapas (CORS/dekodowanie padło): trwały element z playbackRate + preservesPitch=false (adapters-web/setElementRate).
 * Odsłona (cur.tempoReveal): oryginał 1.0× na elemencie (zwykła ścieżka „muzyki"). */
const tempoPlayingState = r => r<1 ? `słuchaj — płyta na ${String(r).replace('.',',')}×…` : `słuchaj — przyspieszone ${String(r).replace('.',',')}×!`;
export function tempoPosition(){
  if(revSrc && typeof revSrc.position==='function') return revSrc.position();
  if(round && round.mode==='tempo' && el) return el.currentTime||0;
  const cur=getCurrent(); return (cur && cur.tempoPos) || 0;
}
async function startTempo(){
  const cur=getCurrent(), url=cur.preview, rate=tempoRate(getMode(), cur.tempoStage||0);
  const res=await startBuffer(async(ctx)=>{
    let dec = revCache && revCache.url===url ? revCache.decoded : null;
    if(!dec){ setState('kładę płytę…'); dec=await decodeAudio(ctx, url, window.STACJA_CONFIG); revCache={ url, decoded:dec }; }
    if((cur.tempoPos||0) >= (dec.duration||0)-0.25) cur.tempoPos=0;   // dograła do końca → od początku
    return dec;
  }, { rate, offset:cur.tempoPos||0, playingState:tempoPlayingState(rate), endState:'koniec · ↻ od nowa', onEnd:()=>{ cur.tempoPos=0; } });
  if(res==='fail' && getCurrent()===cur){   // proxy/dekodowanie padło → trwały element z playbackRate (bez gwarancji wysokości na iOS)
    loadEl(cur, 'tempo', rate);
    const start=cur.tempoPos||0;
    if(start>0){ const seek=()=>{ try{ el.currentTime=start; }catch(_e){} }; if(el.readyState>=1) seek(); else el.addEventListener('loadedmetadata', seek, { once:true }); }
    playEl();
  }
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
function loadEl(cur, mode, rate=1){
  ensureEl();
  round={ cur, mode, said:false, seeked:false, snipDone:false, rate };
  el.muted=false;
  setElementRate(el, rate);   // EKSPERYMENT: trwały element — tempo zawsze ustawiane (inne tryby: 1.0× z zachowaną wysokością)
  el.src=cur.preview;
  setIcon('wait'); setState('ładowanie…');
}

// dyspozytor — wybiera sposób odtwarzania wg trybu
export function startAudio(){
  stopAudio();                // 2.1: nigdy dwa utwory naraz (np. klik w gałkę podczas strojenia)
  audioSession('playback');   // quiz przejmuje dźwięk (wszystkie tryby: music/snippet/reverse)
  const mode=getMode(), current=getCurrent();
  if(!current) return;
  if(mode==='cover' || mode==='quiz') return;          // EKSPERYMENT: okładka — bez audio
  if(mode==='reverse'){ return startReverse(); }
  if(mode==='revsnip'){ return startRevsnip(); }       // EKSPERYMENT
  if(mode==='medley'){ return startMedley(); }         // EKSPERYMENT
  if(mode==='snippet'){ return startSnippet(); }
  if(isTempoMode(mode) && !current.tempoReveal){ return startTempo(); }   // EKSPERYMENT (odsłona: oryginał 1.0× na elemencie)
  if(mode==='intro' && !current.introFull){ return startIntro(); }   // F8a (po odsłonie ↻ gra całą zajawkę)
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
  if(r && r.stopT) clearTimeout(r.stopT);     // F8a: timer końca etapu „intro"
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
  if(mode==='quiz' || mode==='cover'){ return; }   // wiedza ogólna / EKSPERYMENT okładka — brak audio do odtworzenia
  if(mode==='lektor'){
    if(isSpeaking()){ lektorStop(); setIcon('play'); setState('pauza · ▶ wznów'); return; }   // czyta → stop
    lektorPlay(current.lyric, current.tts, setState, { lang:current.lang }); return;
  }
  if(isTempoMode(mode) && !current.tempoReveal && !round){   // EKSPERYMENT: tempo na WebAudio — pauza ZAPAMIĘTUJE miejsce
    if(revSrc){ current.tempoPos=tempoPosition(); stopAudio(); setIcon('play'); setState('pauza · ▶ wznów'); return; }
    startAudio(); return;                                     // wznów od current.tempoPos (albo od początku)
  }
  if((mode==='reverse' || mode==='revsnip' || mode==='medley') && !round){   // EKSPERYMENT: + bufory WebAudio
    if(revSrc){ stopAudio(); setIcon('play'); setState('pauza · ↻ od nowa'); return; }     // od tyłu: stop (replay od nowa)
    startAudio(); return;
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
  if(mode==='lektor'){ lektorPlay(current.lyric, current.tts, setState, { lang:current.lang }); return; }
  current.tempoPos=0;   // EKSPERYMENT: ↻ od nowa = od początku zajawki (także w tempie)
  stopAudio(); startAudio();
}

// F6b (U4): duck — UI-dźwięki milkną, gdy gra zajawka solo (element/„od tyłu") albo lektor
registerMusicProbe(()=> !!(round && el && !el.paused && !el.ended) || !!revSrc || !!isSpeaking());

// do testów (siatka jsdom): trwały element solo i stan dekodowania „od tyłu"
export const _soloAudioDebug = () => ({ el, round, revDecodingGen, revSrc, revCache });
