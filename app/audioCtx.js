/* app/audioCtx.js — wspólny AudioContext (tryb „od tyłu"), dzielony przez audio solo i MP.
 * iOS: kontekst trzeba odblokować w geście (synchronicznie), zanim użyjemy go po await. */
let ctx = null;

export function ensureCtx(){
  if(!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// odblokowanie w geście (tworzenie/dołączanie/start/stuknięcie) — bez await
export function unlockCtx(){
  try{ const c = ensureCtx(); if(c.state === 'suspended') c.resume(); }catch(e){}
}

// kontekst gotowy do dekodowania (czeka na resume) — używane przed playReverse
export async function ensureCtxResumed(){
  const c = ensureCtx();
  if(c.state === 'suspended'){ try{ await c.resume(); }catch(e){} }
  return c;
}
