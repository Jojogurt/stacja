/* adapters-web/itunesRepository.js — webowa warstwa SIECI dla wyboru utworu.
 * Sieć: proxy Workera (omija blokady) → bezpośredni fetch → JSONP. Czystą selekcję
 * (filtr coverów, anty-powtórki, normalizacja) trzyma `core/trackSelect.js`, wspólna
 * z serwerem; tu tylko wstrzykujemy webowy `itunes(term)`. */
import { resolveTrack as coreResolveTrack, pickTrack, BAD } from '../core/trackSelect.js';

/* ---- sieć (iTunes) ---- */
function itunesFetch(term){
  const q=new URLSearchParams({term,media:'music',entity:'song',attribute:'artistTerm',limit:'60',country:'PL'});
  const ctrl=new AbortController();
  const to=setTimeout(()=>ctrl.abort(),10000);
  return fetch('https://itunes.apple.com/search?'+q.toString(),{signal:ctrl.signal,referrerPolicy:'no-referrer'})
    .then(r=>{ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
    .then(d=>(d.results||[]))
    .finally(()=>clearTimeout(to));
}
function itunesJsonp(term){
  return new Promise((resolve,reject)=>{
    const cb='it_'+Math.random().toString(36).slice(2);
    const s=document.createElement('script');
    const to=setTimeout(()=>{cleanup();reject(new Error('timeout'));},10000);
    function cleanup(){delete window[cb];s.remove();clearTimeout(to);}
    window[cb]=d=>{cleanup();resolve(d.results||[]);};
    s.onerror=()=>{cleanup();reject(new Error('network'));};
    const q=new URLSearchParams({term,media:'music',entity:'song',attribute:'artistTerm',
      limit:'60',country:'PL',callback:cb});
    s.src='https://itunes.apple.com/search?'+q.toString();
    document.body.appendChild(s);
  });
}
// proxy przez Worker (iTunes -> fallback Deezer); klient gada tylko z Workerem,
// co omija blokady itunes.apple.com. Gdy padnie — bezpośredni fetch/JSONP.
function itunesProxy(term, cfg={}){
  if(!cfg.roomsBase) return Promise.reject(new Error('no-proxy'));
  const ctrl=new AbortController();
  const to=setTimeout(()=>ctrl.abort(),12000);
  const u=cfg.roomsBase+'/tracks?artist='+encodeURIComponent(term);
  return fetch(u,{signal:ctrl.signal})
    .then(r=>{ if(!r.ok) throw new Error('fn '+r.status); return r.json(); })
    .then(d=>(d.results||[]))
    .finally(()=>clearTimeout(to));
}
// jedyne publiczne wejście do sieci — używane też bezpośrednio przez lektor/import
export function itunes(term, cfg){
  return itunesProxy(term, cfg)
    .then(res=>res.length?res:itunesFetch(term))   // proxy puste? spróbuj bezpośrednio
    .catch(()=>itunesFetch(term).catch(()=>itunesJsonp(term)));
}

// re-eksport czystej selekcji (zgodność dla ewentualnych importerów)
export { pickTrack, BAD };

// jedno wejście: rozwiąż grywalny utwór dla kategorii (web — sieć wstrzyknięta jako itunes(term)).
export function resolveTrack({cat, seen, recent, cfg}){
  return coreResolveTrack({ cat, seen, recent, itunes:(term)=>itunes(term, cfg) });
}
