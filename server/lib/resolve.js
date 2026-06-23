/* server/lib/resolve.js — rozwiązywanie utworu PO STRONIE WORKERA/DO (bez CORS).
 * Reużywa czystej selekcji z `core/trackSelect.js`; wstrzykuje serwerowy `itunes(term)`
 * (bezpośredni fetch iTunes → fallback Deezer — ta sama logika co proxy `/tracks`,
 * ale bez nagłówków CORS, bo to wywołanie serwer→serwer). */
import { resolveTrack } from '../../core/trackSelect.js';

async function fromItunes(term){
  const q=new URLSearchParams({term,media:'music',entity:'song',attribute:'artistTerm',limit:'60',country:'PL'});
  const r=await fetch('https://itunes.apple.com/search?'+q.toString());
  if(!r.ok) throw new Error('itunes '+r.status);
  const d=await r.json();
  return (d.results||[]).map(t=>({
    trackName:t.trackName, artistName:t.artistName, collectionName:t.collectionName||'',
    releaseDate:t.releaseDate||'', previewUrl:t.previewUrl||'', artworkUrl100:t.artworkUrl100||'',
  }));
}
async function fromDeezer(term){
  const q='artist:"'+term.replace(/"/g,'')+'"';
  const r=await fetch('https://api.deezer.com/search?limit=60&q='+encodeURIComponent(q));
  if(!r.ok) throw new Error('deezer '+r.status);
  const d=await r.json();
  return (d.data||[]).map(t=>({
    trackName:t.title, artistName:(t.artist&&t.artist.name)||'',
    collectionName:(t.album&&t.album.title)||'', releaseDate:'',
    previewUrl:t.preview||'', artworkUrl100:(t.album&&(t.album.cover_medium||t.album.cover))||'',
  }));
}
// serwerowy fetcher: iTunes (często blokuje IP Workera) → fallback Deezer; nigdy nie rzuca
async function itunes(term){
  try{ const r=await fromItunes(term); if(r.length) return r; }catch(e){ /* fallback */ }
  try{ return await fromDeezer(term); }catch(e){ return []; }
}

// rozwiąż grywalny utwór dla kategorii (cat = obiekt puli wgrany przez hosta przy starcie)
export function resolveTrackServer({cat, seen, recent}){
  return resolveTrack({ cat, seen, recent, itunes });
}
