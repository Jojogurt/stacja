/* adapters-web/webAudio.js — webowa implementacja AudioPort (fetch + „od tyłu").
 * Centralizuje to, co solo (startReverse) i MP (mpPlayReverse) dotąd duplikowały. */

// pobierz bajty zajawki — najpierw wprost (iTunes daje CORS), a gdy padnie
// (np. previews Deezer *.dzcdn.net bez ACAO) — przez proxy audio na Workerze (#13)
export async function fetchAudioBytes(url, cfg={}){
  try{ return await (await fetch(url,{mode:'cors'})).arrayBuffer(); }
  catch(e){
    if(!cfg.roomsBase) throw e;
    const pu=cfg.roomsBase+'/audio?u='+encodeURIComponent(url);
    return await (await fetch(pu)).arrayBuffer();
  }
}

// krótki cichy WAV (data-URI) do odblokowania elementu audio w geście
let _silent=null;
function silentWav(){
  if(_silent) return _silent;
  const sr=8000, n=200, bytes=44+n*2, buf=new ArrayBuffer(bytes), dv=new DataView(buf);
  const w=(o,s)=>{ for(let i=0;i<s.length;i++) dv.setUint8(o+i, s.charCodeAt(i)); };
  w(0,'RIFF'); dv.setUint32(4,bytes-8,true); w(8,'WAVE'); w(12,'fmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*2,true); dv.setUint16(32,2,true);
  dv.setUint16(34,16,true); w(36,'data'); dv.setUint32(40,n*2,true);   // próbki = zera (cisza)
  let bin=''; const u8=new Uint8Array(buf); for(let i=0;i<u8.length;i++) bin+=String.fromCharCode(u8[i]);
  _silent='data:audio/wav;base64,'+btoa(bin);
  return _silent;
}
// Odblokuj element <audio> w geście użytkownika (mobilna autoplay-policy):
// zagraj na nim moment ciszy. iOS odblokowuje per-element, Android — całą stronę.
// Dlatego MP używa JEDNEGO trwałego elementu (ten odblokowany), zmienianego przez .src.
export function unlockAudioElement(el){
  try{
    const silent=silentWav();
    el.muted=true; el.src=silent;
    const p=el.play();
    // F2a #9: jeśli w międzyczasie na elemencie wystartowała prawdziwa zajawka (.src zmieniony) — NIE pauzuj jej
    const done=()=>{ try{ if(el.src===silent){ el.pause(); el.currentTime=0; } }catch(e){} el.muted=false; };
    if(p&&p.then) p.then(done).catch(()=>{ el.muted=false; });
    else done();
  }catch(e){ try{ el.muted=false; }catch(_){} }
}

// zdekoduj zajawkę i odwróć próbki w każdym kanale → AudioBuffer „od tyłu"
export async function decodeReversed(ctx, bytes){
  const decoded=await ctx.decodeAudioData(bytes);
  for(let c=0;c<decoded.numberOfChannels;c++){ decoded.getChannelData(c).reverse(); }
  return decoded;
}

/* EKSPERYMENT („od tyłu krótko", „składanka"): operacje na zdekodowanym AudioBuffer — bez elementu <audio>.
 * Dlaczego WebAudio, a nie trwały <audio> (F2a #9)? Składanka to 4 RÓŻNE pliki: na jednym elemencie każda
 * zmiana .src = nowe ładowanie + seek (na iOS dopiero po `loadedmetadata`), więc przerwy między wycinkami
 * byłyby losowe (0,3–2 s), a buforowania „przed startem" nie da się zagwarantować. AudioContext odblokowany
 * w geście („Zacznij mecz"/„Następny" — unlockCtx, jak „od tyłu") gra jeden sklejony bufor z dokładnością
 * do próbki — także na iOS (ten sam tor co istniejące „od tyłu"). */
export async function decodeAudio(ctx, url, cfg){
  return await ctx.decodeAudioData(await fetchAudioBytes(url, cfg));
}
const FADE_S = 0.008;   // krótkie wejście/wyjście głośności na krawędziach wycinka (bez trzasków)
function fadeEdges(data, sr){
  const n=Math.min(Math.floor(FADE_S*sr), Math.floor(data.length/2));
  for(let i=0;i<n;i++){ const g=i/n; data[i]*=g; data[data.length-1-i]*=g; }
}
// wytnij okno [start, start+secs] (s) jako NOWY bufor; reverse → próbki odwrócone (od tyłu)
export function sliceBuffer(ctx, buf, start, secs, { reverse=false, fade=true }={}){
  const sr=buf.sampleRate;
  const from=Math.max(0, Math.min(buf.length-1, Math.floor((Number(start)||0)*sr)));
  const len=Math.max(1, Math.min(buf.length-from, Math.floor((Number(secs)||0)*sr)));
  const out=ctx.createBuffer(buf.numberOfChannels, len, sr);
  for(let c=0;c<buf.numberOfChannels;c++){
    const dst=out.getChannelData(c);
    dst.set(buf.getChannelData(c).subarray(from, from+len));
    if(reverse) dst.reverse();
    if(fade) fadeEdges(dst, sr);
  }
  return out;
}
// sklej wycinki w jeden bufor: [klip] przerwa(tik) [klip] … — mono → na wszystkie kanały
export function buildMedleyBuffer(ctx, clips, { gap=0.25, tick=true }={}){
  const list=(clips||[]).filter(Boolean);
  if(!list.length) return null;
  const sr=list[0].sampleRate, ch=Math.min(2, Math.max(...list.map(b=>b.numberOfChannels)));
  const gapN=Math.round(gap*sr);
  const total=list.reduce((n,b)=>n+b.length,0) + gapN*(list.length-1);
  const out=ctx.createBuffer(ch, Math.max(1,total), sr);
  // cichy „tik" na środku przerwy: 25 ms sinusa 1,8 kHz z obwiednią (amplituda 0,12)
  const tickN=Math.min(gapN, Math.round(0.025*sr)), tickBuf=new Float32Array(tickN);
  for(let i=0;i<tickN;i++) tickBuf[i]=0.12*Math.sin(2*Math.PI*1800*i/sr)*Math.sin(Math.PI*i/tickN);
  for(let c=0;c<ch;c++){
    const dst=out.getChannelData(c); let pos=0;
    list.forEach((b,i)=>{
      dst.set(b.getChannelData(Math.min(c, b.numberOfChannels-1)), pos); pos+=b.length;
      if(i<list.length-1){ if(tick && tickN) dst.set(tickBuf, pos+Math.floor((gapN-tickN)/2)); pos+=gapN; }
    });
  }
  return out;
}
// odtwórz gotowy bufor → uchwyt {ok:true, source, rate, stop(), position()} (postęp onProgress(0..1), koniec onEnded)
// EKSPERYMENT („zwolnione/przyspieszone obroty"): `rate` = AudioBufferSourceNode.playbackRate — resampling, więc zmienia
// tempo I wysokość jak płyta na złych obrotach (deterministycznie, także na iOS — ten sam tor co „od tyłu"); `offset` (s)
// = start w buforze (wznowienie po pauzie / „szybciej" od tego samego miejsca). position() = bieżące miejsce w buforze (s).
export function playBuffer(ctx, buf, { onProgress, onEnded, rate=1, offset=0 }={}){
  const src=ctx.createBufferSource(); src.buffer=buf;
  const r=Number(rate)>0 ? Number(rate) : 1;
  if(r!==1){ if(src.playbackRate && typeof src.playbackRate==='object') src.playbackRate.value=r; else src.playbackRate={ value:r }; }
  const gain=ctx.createGain(); gain.gain.value=1;                     // pewny tor sygnału
  src.connect(gain); gain.connect(ctx.destination);
  const t0=ctx.currentTime, dur=buf.duration || (buf.length/buf.sampleRate);
  const off=Math.max(0, Math.min(dur, Number(offset)||0));
  const position=()=>Math.min(dur, off + Math.max(0, ctx.currentTime-t0)*r);
  let timer=null;
  const clear=()=>{ if(timer){ clearInterval(timer); timer=null; } };
  src.onended=()=>{ clear(); if(onEnded) onEnded(); };
  if(off>0) src.start(0, off); else src.start();
  if(onProgress) timer=setInterval(()=>{ if(onProgress) onProgress(Math.min(1, position()/dur)); }, 100);
  return { ok:true, source:src, rate:r, position, stop(){ try{ src.onended=null; src.stop(); }catch(e){} clear(); } };
}
/* EKSPERYMENT: tempo na elemencie <audio> (zapas, gdy WebAudio/CORS/dekodowanie padnie; MP nie używa — patrz app/mp.js).
 * preservesPitch=false (+ mozPreservesPitch/webkitPreservesPitch) → zmienia się też wysokość. Uwaga: przy ładowaniu
 * nowego .src przeglądarka przywraca playbackRate := defaultPlaybackRate, więc ustawiamy OBA. Gdy przeglądarka
 * zignoruje preservesPitch (część wersji iOS), zajawka i tak gra wolniej/szybciej — tylko bez zmiany wysokości. */
export function setElementRate(el, rate){
  if(!el) return;
  const r=Number(rate)>0 ? Number(rate) : 1, keep = r===1;
  try{ el.defaultPlaybackRate=r; el.playbackRate=r; }catch(_e){}
  for(const k of ['preservesPitch','mozPreservesPitch','webkitPreservesPitch']){ try{ el[k]=keep; }catch(_e){} }
}

// Odtwórz zajawkę „od tyłu". Zwraca uchwyt:
//   {ok:true, stop()}            — gra; stop() zatrzymuje i sprząta timer postępu
//   {ok:false, aborted:false}    — fetch/dekodowanie padło → caller robi fallback (gra normalnie)
//   {ok:false, aborted:true}     — runda zmieniła się w trakcie → cisza, bez fallbacku
// opts: {cfg, onProgress(frac), onEnded(), shouldPlay()->bool,
//        window:{start, secs} — EKSPERYMENT „od tyłu krótko": odwracane TYLKO to okno (uchwyt niesie `decoded`),
//        decoded — już zdekodowany bufor (ponowne odtworzenie / „dłużej" bez pobierania)}
export async function playReverse(ctx, url, opts={}){
  const { cfg, onProgress, onEnded, shouldPlay, window:win } = opts;
  let decoded=opts.decoded || null, buf;
  try{
    if(!decoded) decoded = win ? await decodeAudio(ctx, url, cfg) : await decodeReversed(ctx, await fetchAudioBytes(url, cfg));
    buf = win ? sliceBuffer(ctx, decoded, win.start, win.secs, { reverse:true }) : decoded;
  }catch(e){ return { ok:false, aborted:false }; }
  if(shouldPlay && !shouldPlay()) return { ok:false, aborted:true };   // runda się zmieniła
  const h=playBuffer(ctx, buf, { onProgress, onEnded });
  if(win) h.decoded=decoded;
  return h;
}
