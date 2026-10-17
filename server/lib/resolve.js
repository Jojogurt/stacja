/* server/lib/resolve.js — rozwiązywanie utworu PO STRONIE WORKERA/DO (bez CORS).
 * Reużywa czystej selekcji z `core/trackSelect.js`; wstrzykuje serwerowy `itunes(term)`
 * (iTunes + Deezer scalone — ta sama logika co proxy `/tracks`, server/lib/sources.js,
 * ale bez nagłówków CORS, bo to wywołanie serwer→serwer). */
import { resolveTrack, cachedFetcher, gatherDistractors, resolveCover, resolveMedley, resolveInstrumentalCover } from '../../core/trackSelect.js';
import { fetchTracks, fetchAlbums } from './sources.js';

// serwerowy fetcher: iTunes + Deezer scalone (server/lib/sources.js; iTunes często blokuje IP Workera); nigdy nie rzuca
// opts.song=true (F5 #5) → „artysta tytuł" bez artistTerm (playlisty); opts.album → albumy (okładka)
async function itunesRaw(term, opts){
  try{
    if(opts && opts.album) return await fetchAlbums(term);
    return (await fetchTracks(term, !!(opts && opts.song))).results;
  }catch(e){ return []; }
}
// F5 #6: cache per zapytanie na poziomie izolatu (współdzielony przez pokoje w tym izolacie)
const itunes = cachedFetcher(itunesRaw, { max:300 });

// rozwiąż grywalny utwór dla kategorii (cat = obiekt puli wgrany przez hosta przy starcie)
export function resolveTrackServer({cat, seen, recent}){
  return resolveTrack({ cat, seen, recent, itunes });
}

// MP okładka: album z puli wykonawców kategorii (iTunes albumy → Deezer → albumy z wyników utworów; cache izolatu jak wyżej)
export function resolveCoverServer({cat, seen, recent}){
  return resolveCover({ cat, seen, recent, itunes });
}

// MP składanka: 4 utwory jednego wykonawcy z puli (po wykonawcy — Deezer /artist/{id}/top; cache izolatu jak wyżej)
export function resolveMedleyServer({cat, seen, recent}){
  return resolveMedley({ cat, seen, recent, itunes });
}

// MP fortepian/gitara: oryginał jak w „muzyce" + cover instrumentalny (zapytania po utworze: opts.song → Deezer /search?q=)
export function resolveInstrumentalServer({instrument, cat, seen, recent}){
  return resolveInstrumentalCover({ instrument, cat, seen, recent, itunes });
}

// F8a (tryb „abcd"): dystraktory dla utworu — inni wykonawcy z puli kategorii (cache izolatu jak wyżej)
export function resolveDistractorsServer({cat, correct, rnd}){
  return gatherDistractors({ cat, correct, itunes, rnd });
}
