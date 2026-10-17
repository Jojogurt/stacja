/* server/test/sources.test.js — źródła utworów (iTunes + Deezer) z podmienionym globalThis.fetch.
 * Uruchom: node --no-warnings test/sources.test.js (w server/). */
import { fetchTracks, fetchAlbums, pickDeezerArtist } from '../lib/sources.js';
import { handleProxy } from '../lib/proxies.js';

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.error('  ✗ '+m);} };
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b), `${m} — oczekiwano ${JSON.stringify(b)}, było ${JSON.stringify(a)}`);
async function group(name, fn){ console.log('• '+name); try{ await fn(); }catch(e){ fail++; console.error('  ✗ WYJĄTEK: '+(e&&e.stack||e)); } }

const realFetch = globalThis.fetch;
const res = (body, status=200) => ({ ok: status>=200 && status<300, status, json: async()=>body });
// fake: itunes = 'ok' | 429; zwraca też listę wywołanych URL-i
function fake({ itunes='429', calls=[] }={}){
  globalThis.fetch = async (url) => {
    url = String(url); calls.push(url);
    if(url.startsWith('https://itunes.apple.com/search')){
      if(itunes==='429') return res({}, 429);
      return res({ results:[
        { trackName:'Under Pressure', artistName:'Queen', collectionName:'Hot Space', releaseDate:'1982-05-03T07:00:00Z', previewUrl:'https://a.mzstatic.com/u.m4a', artworkUrl100:'u/100x100bb.jpg', primaryGenreName:'Rock' },
        { trackName:'Bez zajawki', artistName:'Queen', previewUrl:'' },
      ] });
    }
    if(url.includes('/search/artist')) return res({ data:[
      { id:1, name:'Queen(Ares)', nb_fan:188 }, { id:412, name:'Queen', nb_fan:12836422 }, { id:2, name:'Queenie', nb_fan:99999999 } ] });
    if(url.includes('/artist/412/top')) return res({ data:[
      { title:'Bohemian Rhapsody', preview:'https://cdn/b.mp3', album:{ id:7, title:'A Night At The Opera', cover_medium:'c.jpg' }, artist:{ name:'Queen' } },
      { title:'Under Pressure', preview:'https://cdn/u.mp3', album:{ id:8, title:'Hot Space', cover_medium:'h.jpg' }, artist:{ name:'Queen' } } ] });
    if(url.includes('/artist/412/albums')) return res({ data:[ { id:7, release_date:'1975-11-21', genre_id:152 }, { id:8, release_date:'1982-05-03', genre_id:132 } ] });
    if(url.includes('api.deezer.com/search?')) return res({ data:[ { title:'Radio Ga Ga', preview:'https://cdn/r.mp3', album:{ id:3, title:'The Works' }, artist:{ name:'Queen' } } ] });
    return res({}, 404);
  };
}

await group('fetchTracks: iTunes 429 → Deezer po wykonawcy z rokiem i gatunkiem', async()=>{
  const calls=[]; fake({ itunes:'429', calls });
  const r=await fetchTracks('Queen');
  eq(r.source, 'deezer', 'source=deezer');
  eq(r.results.map(x=>x.trackName), ['Bohemian Rhapsody','Under Pressure'], 'wykonawca 412 (nie imiennik)');
  eq([r.results[0].releaseDate, r.results[0].primaryGenreName, r.results[1].primaryGenreName], ['1975-11-21','Rock','Pop'], 'rok i gatunek z albumu');
  ok(calls.some(u=>u.includes('/artist/412/top')) && calls.some(u=>u.includes('/artist/412/albums')), 'top + albums');
});
await group('fetchTracks: oba OK → scalone bez duplikatów, iTunes pierwszy', async()=>{
  fake({ itunes:'ok' });
  const r=await fetchTracks('Queen');
  eq(r.source, 'itunes+deezer', 'source=itunes+deezer');
  eq(r.results.map(x=>x.trackName), ['Under Pressure','Bohemian Rhapsody'], 'kolejność i dedup');
  eq(r.results[0].previewUrl, 'https://a.mzstatic.com/u.m4a', 'dane iTunes wygrywają');
});
await group('fetchTracks: po utworze (song) i oba padają', async()=>{
  fake({ itunes:'429' });
  const r=await fetchTracks('Queen Radio Ga Ga', true);
  eq(r.results.map(x=>x.trackName), ['Radio Ga Ga'], 'Deezer /search?q=');
  globalThis.fetch = async()=>{ throw new Error('net'); };
  eq(await fetchTracks('x'), { source:'', results:[] }, 'oba źródła padły → pusto, bez wyjątku');
  eq(await fetchAlbums('x'), [], 'albumy: pusto bez wyjątku');
});
await group('pickDeezerArtist: pasująca nazwa + największa liczba fanów', async()=>{
  const l=[{id:1,name:'Boggling Queen',nb_fan:5},{id:2,name:'Queen',nb_fan:10},{id:3,name:'Queen',nb_fan:50}];
  eq(pickDeezerArtist('queen', l).id, 3, 'najpopularniejszy o tej nazwie');
  eq(pickDeezerArtist('zupełnie inny', l).id, 1, 'brak dopasowania → pierwszy');
  eq(pickDeezerArtist('x', []), null, 'pusta lista');
});
await group('/tracks (proxy): kształt odpowiedzi', async()=>{
  fake({ itunes:'429' });
  const r=await handleProxy({ headers:new Headers() }, new URL('https://w/tracks?artist=Queen'));
  const j=await r.json();
  eq([j.source, j.results.length], ['deezer', 2], '/tracks?artist');
});

globalThis.fetch = realFetch;
console.log(`\n${fail?'❌':'✅'} sources: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
