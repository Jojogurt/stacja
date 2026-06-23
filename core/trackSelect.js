/* core/trackSelect.js — czysty wybór grywalnego utworu (zero DOM/sieci/CORS).
 * Współdzielone web↔serwer: ta sama logika selekcji (filtr coverów/karaoke,
 * anty-powtórki, dopasowanie artysty, normalizacja) działa w przeglądarce
 * (adapters-web/itunesRepository.js — fetch/JSONP/proxy) i na Workerze/DO
 * (server/lib/resolve.js — bezpośredni fetch bez CORS). Sieć wstrzykiwana jako
 * `itunes(term) → Promise<results[]>`, więc moduł nie zna `window` ani `fetch`. */
import { shuffle } from './util.js';
import { norm, textMatch } from './scoring.js';

/* filtr coverów/karaoke/tributów */
export const BAD = /karaoke|tribute|made famous|cover version|instrumental|backing track|originally performed/i;

/* wybór utworu z wyników (ten sam artysta, bez coverów, bez powtórki) */
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

/* playlista konkretnych piosenek (np. zaimportowana ze Spotify) */
async function resolveFromSongs(cat, seen, itunes){
  let pool=(cat.songs||[]).filter(s=>!seen.has(norm(s.title)));
  if(!pool.length){ (cat.songs||[]).forEach(s=>seen.delete(norm(s.title))); pool=(cat.songs||[]).slice(); }
  for(const s of shuffle(pool)){
    let preview=s.preview||'', art='';
    if(!preview){
      try{ const res=await itunes(s.artist); const t=res.find(r=>textMatch(r.trackName,s.title))||res[0]; if(t){ preview=t.previewUrl; art=(t.artworkUrl100||'').replace('100x100','300x300'); } }catch(e){}
    }
    if(preview){ seen.add(norm(s.title)); return { track:s.title, artist:s.artist, year:s.year||'', album:s.album||'', preview, art }; }
    seen.add(norm(s.title));
  }
  return { error:true, reason:'empty' };
}

/* pula wykonawców → szukaj grywalnej zajawki */
async function resolveFromArtists(cat, seen, recent, itunes){
  const pool = recent ? cat.artists.filter(a=>!recent.includes(a)) : cat.artists.slice();
  const tryOrder = shuffle(pool.length?pool:cat.artists);
  let anyResponse=false;
  for(const artist of tryOrder){
    let res=null;
    for(let attempt=0; attempt<2 && !res; attempt++){
      try{ res=await itunes(artist); anyResponse=true; }catch(e){ /* próbujemy dalej */ }
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

/* jedno wejście: rozwiąż grywalny utwór dla kategorii (playlista vs pula wykonawców).
 * `itunes(term) → Promise<results[]>` wstrzyknięty przez warstwę sieci (web/serwer). */
export function resolveTrack({cat, seen, recent, itunes}){
  if((!cat.artists || !cat.artists.length) && cat.songs && cat.songs.length){
    return resolveFromSongs(cat, seen, itunes);
  }
  return resolveFromArtists(cat, seen, recent, itunes);
}
