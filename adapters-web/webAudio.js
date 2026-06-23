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
    el.muted=true; el.src=silentWav();
    const p=el.play();
    const done=()=>{ try{ el.pause(); el.currentTime=0; }catch(e){} el.muted=false; };
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

// Odtwórz zajawkę „od tyłu". Zwraca uchwyt:
//   {ok:true, stop()}            — gra; stop() zatrzymuje i sprząta timer postępu
//   {ok:false, aborted:false}    — fetch/dekodowanie padło → caller robi fallback (gra normalnie)
//   {ok:false, aborted:true}     — runda zmieniła się w trakcie → cisza, bez fallbacku
// opts: {cfg, onProgress(frac), onEnded(), shouldPlay()->bool}
export async function playReverse(ctx, url, opts={}){
  const { cfg, onProgress, onEnded, shouldPlay } = opts;
  let decoded;
  try{
    decoded = await decodeReversed(ctx, await fetchAudioBytes(url, cfg));
  }catch(e){ return { ok:false, aborted:false }; }
  if(shouldPlay && !shouldPlay()) return { ok:false, aborted:true };   // runda się zmieniła

  const src=ctx.createBufferSource(); src.buffer=decoded;
  const gain=ctx.createGain(); gain.gain.value=1;                     // pewny tor sygnału
  src.connect(gain); gain.connect(ctx.destination);
  const t0=ctx.currentTime, dur=decoded.duration;
  let timer=null;
  const clear=()=>{ if(timer){ clearInterval(timer); timer=null; } };
  src.onended=()=>{ clear(); if(onEnded) onEnded(); };
  src.start();
  if(onProgress) timer=setInterval(()=>{ if(onProgress) onProgress(Math.min(1,(ctx.currentTime-t0)/dur)); }, 100);
  return { ok:true, source:src, stop(){ try{ src.onended=null; src.stop(); }catch(e){} clear(); } };
}
