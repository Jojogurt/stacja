/* adapters-web/itunesRepository.js — webowa implementacja TrackRepository.
 * Sieć: proxy Workera (omija blokady) → bezpośredni fetch → JSONP.
 * Centralizuje to, co solo (newRound/newSongRound) i host MP (mpHostNewRound)
 * dotąd duplikowały: zapytania, filtr „śmieci", anty-powtórki, retry. */
import { shuffle } from '../core/util.js';
import { norm, textMatch } from '../core/scoring.js';

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

/* ---- wybór utworu (filtr coverów/karaoke + anty-powtórki) ---- */
export const BAD=/karaoke|tribute|made famous|cover version|instrumental|backing track|originally performed/i;
export function pickTrack(results, artist, seen){
  const na=norm(artist);
  const good=results.filter(r=>{
    if(!r.previewUrl) return false;
    if(BAD.test(r.artistName||'')||BAD.test(r.collectionName||'')||BAD.test(r.trackName||'')) return false;
    const ra=norm(r.artistName||'');
    if(!(ra.includes(na)||na.includes(ra))) return false;       // ten sam artysta
    if(seen.has(norm(r.trackName))) return false;               // nie powtarzaj
    return true;
  });
  if(!good.length) return null;
  return good[Math.floor(Math.random()*good.length)];
}

function normalize(t){
  return { track:t.trackName, artist:t.artistName, year:(t.releaseDate||'').slice(0,4),
    album:t.collectionName||'', preview:t.previewUrl,
    art:(t.artworkUrl100||'').replace('100x100','300x300') };
}

/* ---- playlista konkretnych piosenek (zaimportowana ze Spotify) ---- */
async function resolveFromSongs(cat, seen, cfg){
  let pool=(cat.songs||[]).filter(s=>!seen.has(norm(s.title)));
  if(!pool.length){ (cat.songs||[]).forEach(s=>seen.delete(norm(s.title))); pool=(cat.songs||[]).slice(); }
  for(const s of shuffle(pool)){
    let preview=s.preview||'', art='';
    if(!preview){
      try{ const res=await itunes(s.artist, cfg); const t=res.find(r=>textMatch(r.trackName,s.title))||res[0]; if(t){ preview=t.previewUrl; art=(t.artworkUrl100||'').replace('100x100','300x300'); } }catch(e){}
    }
    if(preview){ seen.add(norm(s.title)); return { track:s.title, artist:s.artist, year:s.year||'', album:s.album||'', preview, art }; }
    seen.add(norm(s.title));
  }
  return { error:true, reason:'empty' };
}

/* ---- pula wykonawców → szukaj grywalnej zajawki ---- */
async function resolveFromArtists(cat, seen, recent, cfg){
  const pool = recent ? cat.artists.filter(a=>!recent.includes(a)) : cat.artists.slice();
  const tryOrder = shuffle(pool.length?pool:cat.artists);
  let anyResponse=false;
  for(const artist of tryOrder){
    let res=null;
    for(let attempt=0; attempt<2 && !res; attempt++){
      try{ res=await itunes(artist, cfg); anyResponse=true; }catch(e){ /* próbujemy dalej */ }
    }
    if(!res) continue;
    const t=pickTrack(res, artist, seen);
    if(t){
      seen.add(norm(t.trackName));
      if(recent){ recent.push(artist); if(recent.length>6) recent.shift(); }
      return normalize(t);
    }
  }
  return { error:true, reason: anyResponse?'empty':'offline' };
}

// jedno wejście: rozwiąż grywalny utwór dla kategorii (playlista vs pula wykonawców)
export function resolveTrack({cat, seen, recent, cfg}){
  if((!cat.artists || !cat.artists.length) && cat.songs && cat.songs.length){
    return resolveFromSongs(cat, seen, cfg);
  }
  return resolveFromArtists(cat, seen, recent, cfg);
}
