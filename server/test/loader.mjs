/* server/test/loader.mjs — ESM loader hook do testów DO poza Workerem.
 * `partyserver` importuje `cloudflare:workers` (nierozwiązywalne w node), więc
 * podmieniamy cały moduł na minimalny stub `Server` (klasa bazowa). Reszta importów
 * (core/*, lib/*) to czysty node. */
export async function resolve(specifier, context, next){
  if(specifier==='partyserver') return { url:'stub:partyserver', shortCircuit:true };
  return next(specifier, context);
}
export async function load(url, context, next){
  if(url==='stub:partyserver'){
    return { format:'module', shortCircuit:true,
      source:'export class Server{ constructor(ctx,env){ this.ctx=ctx; this.env=env; } }' };
  }
  return next(url, context);
}
