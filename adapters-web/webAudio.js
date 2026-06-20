/* adapters-web/webAudio.js — webowa implementacja AudioPort (fetch + „od tyłu").
 * Centralizuje to, co solo (startReverse) i MP (mpPlayReverse) dotąd duplikowały. */

// pobierz bajty zajawki — najpierw wprost (iTunes daje CORS), a gdy padnie
// (np. previews Deezer *.dzcdn.net bez ACAO) — przez proxy audio na Supabase (#13)
export async function fetchAudioBytes(url, cfg={}){
  try{ return await (await fetch(url,{mode:'cors'})).arrayBuffer(); }
  catch(e){
    if(!cfg.supabaseUrl) throw e;
    const pu=cfg.supabaseUrl+'/functions/v1/audio?u='+encodeURIComponent(url);
    return await (await fetch(pu,{headers: cfg.supabaseKey?{apikey:cfg.supabaseKey}:{}})).arrayBuffer();
  }
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
