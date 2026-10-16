/* adapters-web/itunesRepository.js — webowa warstwa SIECI dla wyboru utworu.
 * Sieć: proxy Workera (omija blokady) → bezpośredni fetch → JSONP. Czystą selekcję
 * (filtr coverów, anty-powtórki, normalizacja) trzyma `core/trackSelect.js`, wspólna
 * z serwerem; tu tylko wstrzykujemy webowy `itunes(term)`. */
import { resolveTrack as coreResolveTrack, pickTrack, BAD, cachedFetcher, gatherDistractors, resolveMedley as coreResolveMedley,
  resolveCover as coreResolveCover, resolvePiano as coreResolvePiano } from '../core/trackSelect.js';

/* ---- sieć (iTunes) ----
 * opts.song=true (F5 #5) → wyszukiwanie „artysta tytuł" BEZ attribute=artistTerm (utwór spoza
 * top-60 wykonawcy też się znajdzie); domyślnie — po wykonawcy (artistTerm, limit 60). */
function searchParams(term, opts){
  // EKSPERYMENT (okładka): albumy wykonawcy — entity=album (top wyniki ≈ popularność)
  if(opts && opts.album) return {term,media:'music',entity:'album',attribute:'artistTerm',limit:'25',country:'PL'};
  return opts && opts.song
    ? {term,media:'music',entity:'song',limit:'25',country:'PL'}
    : {term,media:'music',entity:'song',attribute:'artistTerm',limit:'60',country:'PL'};
}
function itunesFetch(term, opts){
  const q=new URLSearchParams(searchParams(term, opts));
  const ctrl=new AbortController();
  const to=setTimeout(()=>ctrl.abort(),10000);
  return fetch('https://itunes.apple.com/search?'+q.toString(),{signal:ctrl.signal,referrerPolicy:'no-referrer'})
    .then(r=>{ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
    .then(d=>(d.results||[]))
    .finally(()=>clearTimeout(to));
}
function itunesJsonp(term, opts){
  return new Promise((resolve,reject)=>{
    const cb='it_'+Math.random().toString(36).slice(2);
    const s=document.createElement('script');
    const to=setTimeout(()=>{cleanup();reject(new Error('timeout'));},10000);
    function cleanup(){delete window[cb];s.remove();clearTimeout(to);}
    window[cb]=d=>{cleanup();resolve(d.results||[]);};
    s.onerror=()=>{cleanup();reject(new Error('network'));};
    const q=new URLSearchParams({...searchParams(term, opts), callback:cb});
    s.src='https://itunes.apple.com/search?'+q.toString();
    document.body.appendChild(s);
  });
}
// proxy przez Worker (iTunes -> fallback Deezer); klient gada tylko z Workerem,
// co omija blokady itunes.apple.com. Gdy padnie — bezpośredni fetch/JSONP.
// F5 #5: wyszukiwanie utworu idzie jako `/tracks?q=` (starszy Worker bez obsługi `q` zwróci puste
// → spadamy na bezpośredni fetch, więc niezdeployowany serwer niczego nie psuje).
function itunesProxy(term, cfg={}, opts){
  if(!cfg || !cfg.roomsBase) return Promise.reject(new Error('no-proxy'));
  const ctrl=new AbortController();
  const to=setTimeout(()=>ctrl.abort(),12000);
  const u=cfg.roomsBase+'/tracks?'+(opts && opts.song ? 'q=' : 'artist=')+encodeURIComponent(term);
  return fetch(u,{signal:ctrl.signal})
    .then(r=>{ if(!r.ok) throw new Error('fn '+r.status); return r.json(); })
    .then(d=>(d.results||[]))
    .finally(()=>clearTimeout(to));
}
// jedyne publiczne wejście do sieci — używane też bezpośrednio przez lektor/import
export function itunes(term, cfg, opts){
  // EKSPERYMENT: proxy Workera nie zna wyszukiwania albumów (zwróciłby UTWORY) → albumy tylko wprost/JSONP;
  // gdy oba padną, core/resolveCover bierze albumy z wyników utworów (te idą przez proxy)
  if(opts && opts.album) return itunesFetch(term, opts).catch(()=>itunesJsonp(term, opts));
  return itunesProxy(term, cfg, opts)
    .then(res=>res.length?res:itunesFetch(term, opts))   // proxy puste? spróbuj bezpośrednio
    .catch(()=>itunesFetch(term, opts).catch(()=>itunesJsonp(term, opts)));
}
// F5 #6: wyniki per wykonawca/utwór cache'owane w obrębie sesji (mniej zapytań, szybszy start rundy).
// Klucz = zapytanie (cfg praktycznie stałe w sesji — bierzemy aktualne z wywołania).
let lastCfg;
const cachedItunes = cachedFetcher((term, opts)=>itunes(term, lastCfg, opts));
export function clearTrackCache(){ cachedItunes.cache.clear(); }   // testy / ręczne odświeżenie

// ——— wyszukiwarka utworów dla EDYTORA kategorii (ogólny term: tytuł LUB wykonawca) ———
// Zwraca znormalizowane wiersze z previewUrl (utwór bez zajawki = bezużyteczny → odfiltrowany).
function itunesSearchJsonp(params){
  return new Promise((resolve,reject)=>{
    const cb='its_'+Math.random().toString(36).slice(2);
    const s=document.createElement('script');
    const to=setTimeout(()=>{cleanup();reject(new Error('timeout'));},10000);
    function cleanup(){ delete window[cb]; s.remove(); clearTimeout(to); }
    window[cb]=d=>{ cleanup(); resolve(d.results||[]); };
    s.onerror=()=>{ cleanup(); reject(new Error('network')); };
    s.src='https://itunes.apple.com/search?'+new URLSearchParams({...params, callback:cb}).toString();
    document.body.appendChild(s);
  });
}
export function searchTracks(term, cfg={}){
  const t=String(term||'').trim(); if(!t) return Promise.resolve([]);
  const params={ term:t, media:'music', entity:'song', limit:'40', country:'PL' };   // BEZ artistTerm → tytuł lub wykonawca
  const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),10000);
  const direct=fetch('https://itunes.apple.com/search?'+new URLSearchParams(params).toString(),
    {signal:ctrl.signal, referrerPolicy:'no-referrer'})
    .then(r=>{ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
    .then(d=>(d.results||[])).finally(()=>clearTimeout(to));
  return direct.catch(()=>itunesSearchJsonp(params)).then(rows=>rows
    .filter(t=>t.previewUrl && !BAD.test(t.artistName||'') && !BAD.test(t.trackName||''))
    .map(t=>({ trackId:t.trackId, title:t.trackName||'', artist:t.artistName||'',
      preview:t.previewUrl, year:(t.releaseDate||'').slice(0,4),
      art:(t.artworkUrl100||'').replace('100x100','200x200') })));
}

// re-eksport czystej selekcji (zgodność dla ewentualnych importerów)
export { pickTrack, BAD };

// jedno wejście: rozwiąż grywalny utwór dla kategorii (web — sieć wstrzyknięta jako itunes(term)).
// F8b: `rnd` (opcjonalny) — seedowany PRNG Stacji dnia (ten sam seed + te same wyniki iTunes ⇒ ten sam utwór)
export function resolveTrack({cat, seen, recent, cfg, rnd}){
  lastCfg=cfg;
  return coreResolveTrack({ cat, seen, recent, itunes:cachedItunes, rnd });
}

// F8a (tryb „abcd"): dystraktory z kategorii — wyniki iTunes innych wykonawców z puli (ten sam cache co resolveTrack)
export function resolveDistractors({cat, correct, cfg, rnd}){
  if(cfg) lastCfg=cfg;
  return gatherDistractors({ cat, correct, itunes:cachedItunes, rnd });
}

// EKSPERYMENT „składanka": 4 utwory jednego wykonawcy z puli kategorii (ten sam cache wyników co resolveTrack)
export function resolveMedley({cat, seen, recent, cfg, rnd}){
  if(cfg) lastCfg=cfg;
  return coreResolveMedley({ cat, seen, recent, itunes:cachedItunes, rnd });
}
// EKSPERYMENT „okładka": popularny album wykonawcy z puli (albumy iTunes → zapas: albumy z wyników utworów)
export function resolveCover({cat, seen, recent, cfg, rnd}){
  if(cfg) lastCfg=cfg;
  return coreResolveCover({ cat, seen, recent, itunes:cachedItunes, rnd });
}
// EKSPERYMENT „fortepian": oryginał jak w „muzyce" + jego cover fortepianowy (wyszukiwanie utworu `opts.song` —
// proxy Workera `/tracks?q=` → iTunes, a gdy pusto/zablokowane — Deezer (też ma piano covery); stary Worker bez `q`
// zwraca pusto → bezpośredni iTunes/JSONP). Ten sam cache wyników co resolveTrack.
export function resolvePiano({cat, seen, recent, cfg, rnd}){
  if(cfg) lastCfg=cfg;
  return coreResolvePiano({ cat, seen, recent, itunes:cachedItunes, rnd });
}
