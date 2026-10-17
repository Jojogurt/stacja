/* core/trackSelect.js — czysty wybór grywalnego utworu (zero DOM/sieci/CORS).
 * Współdzielone web↔serwer: ta sama logika selekcji (filtr coverów/karaoke, wersji
 * live/remix, dekady, popularności, anty-powtórki, dopasowanie artysty) działa w przeglądarce
 * (adapters-web/itunesRepository.js — fetch/JSONP/proxy) i na Workerze/DO
 * (server/lib/resolve.js — bezpośredni fetch bez CORS). Sieć wstrzykiwana jako
 * `itunes(term, opts) → Promise<results[]>` (opts.song=true → wyszukiwanie „artysta tytuł"
 * BEZ attribute=artistTerm), więc moduł nie zna `window` ani `fetch`. */
import { shuffle } from './util.js';
import { norm, textMatch } from './scoring.js';
import { guitarCoverOk } from './guitarCovers.js';   // EKSPERYMENT „gitara": zaostrzona akceptacja coveru (lista wykonawców + znaczniki)

/* filtr coverów/karaoke/tributów (twardy: nigdy nie gramy) */
export const BAD = /karaoke|tribute|made famous|cover version|instrumental|backing track|originally performed/i;
/* F5: nie-piosenki w tytule (twardy filtr, tylko trackName) */
const NONSONG = /\b(commentary|interview|track by track|spoken word|skit)\b/i;

/* 2.2: globalny cap czasu na rozwiązanie utworu z puli wykonawców — bez tego kaskada
 * per-artysta × 2 próby × proxy potrafiła wisieć minutami (spinner „strojenie…"). */
export const RESOLVE_CAP_MS = 20000;
/* F5: gdy artysta nie ma utworu z dekady / wersji studyjnej, sprawdź jeszcze najwyżej tylu
 * kolejnych wykonawców, zanim zagrasz najlepszy zapasowy (latencja startu rundy). */
export const FALLBACK_EXTRA_ARTISTS = 6;
function withTimeout(promise, ms){
  return new Promise((resolve, reject)=>{
    const t=setTimeout(()=>reject(new Error('timeout')), ms);
    promise.then(v=>{ clearTimeout(t); resolve(v); }, e=>{ clearTimeout(t); reject(e); });
  });
}

/* ---------- F5 #1: dopasowanie WYKONAWCY (ścisłe, bez tolerancji literówek) ----------
 * Wynik iTunes pasuje do wykonawcy z puli, gdy:
 *   • norm(wynik) === norm(artysta) (z pominięciem przedrostka „The"), albo
 *   • któryś CZŁON kolaboracji po stronie wyniku („Queen & David Bowie", „X feat. Y", „A, B & C",
 *     „Mata x Young Leosia", „A / B", „A vs. B", „A with B") jest dokładnie tym wykonawcą, albo
 *   • człon = artysta + sam numer („Bedoes 2115" dla „Bedoes").
 * NIE pasuje: „Queen Latifah"/„Queensrÿche" dla „Queen", „Backstreet Boys" dla „Boys",
 * „Toto Cutugno" dla „Toto", wykonawca zapisany niełacińsko (norm → '').
 * Uwaga: tu (w przeciwieństwie do artistMatch dla odpowiedzi gracza) dzielimy KAŻDY „&"/przecinek —
 * nazwy zespołów z „&" i tak pasują w całości w pierwszym kroku. */
const COLLAB_SEP = /\s+(?:feat\.?|ft\.?|featuring|with|x|vs\.?|and|i)\s+|\s*(?:&|,|;)\s*|\s+[+/]\s+/i;
const noThe = s => s.replace(/^the /, '');
function artistKey(s){ return noThe(norm(s)); }
export function sameArtist(resultArtist, artist){
  const na=artistKey(artist), ra=artistKey(resultArtist);
  if(!na || !ra) return false;
  if(ra===na) return true;
  // norm() obcina „feat. …" i nawiasy — więc dzielimy SUROWY tekst wyniku
  const parts=String(resultArtist||'').split(COLLAB_SEP).map(p=>artistKey(p)).filter(Boolean);
  return parts.some(p => p===na || (p.startsWith(na+' ') && /^\d+$/.test(p.slice(na.length+1))));
}

/* ---------- F5 #2: wersje utworu ----------
 * Dekoracje = treść nawiasów (…)/[…] + sufiks po „ - ". Neutralne dekoracje (feat., radio edit,
 * single/album/original version, „from …", mono/stereo, Taylor's Version) nie obniżają rangi.
 *   tier 0 — wersja „czysta" (studyjna; nawias będący częścią tytułu też jest OK),
 *   tier 1 — remaster (dopuszczalny — zwykle to jedyna dostępna wersja klasyka),
 *   tier 2 — live / remix / mix / demo / acoustic / edit (poza radio edit) / session / version / …
 *            oraz utwory z albumów koncertowych / remiksowych (collectionName).
 * Tier 2 gramy tylko, gdy nic lepszego nie ma (u żadnego sprawdzonego wykonawcy). */
const BENIGN = /^(?:feat\.?|ft\.?|featuring|with)\b|^(?:from|z filmu|from the)\b|^(?:radio edit|single edit|single|single version|album version|original version|original mix|mono|stereo|explicit|clean|bonus track|taylor'?s version)$|^\d{4}$/i;
const REMASTER = /\bremaster(?:ed)?\b|\bremastering\b|\bre-?master\b/i;
const ALT = /\b(?:live|remix(?:ed)?|mix|demo|acoustic|unplugged|instrumental|karaoke|sessions?|rehearsal|outtake|alternate|alt\.? take|take \d+|extended|dub|edit|version|rework|reprise|orchestral|symphonic|a ?cappella|re-?recorded|sped up|slowed|mtv|en vivo|ao vivo|na żywo|na zywo|koncert|bbc|vip)\b/i;
const ALT_ALBUM = /\blive\b|\bunplugged\b|\bin concert\b|\bkoncert|\bna żywo\b|\bremix(?:es|ed)?\b|\bkaraoke\b|\bsessions?\b|\bacoustic\b/i;
function decorations(title){
  const t=String(title||'');
  const out=[...t.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)].map(m=>(m[1]||m[2]||'').trim());
  const dash=t.replace(/\(([^)]*)\)|\[([^\]]*)\]/g,'').match(/\s[-–]\s(.+)$/);
  if(dash) out.push(dash[1].trim());
  return out.filter(Boolean);
}
export function versionTier(r){
  const decs=decorations(r && r.trackName).filter(d=>!BENIGN.test(d));
  if(ALT_ALBUM.test((r && r.collectionName)||'')) return 2;
  // „2017 Remastered Version" to remaster (tier 1), nie „version" (tier 2) — remaster sprawdzamy per dekoracja
  const altPart=d=>REMASTER.test(d) ? d.replace(/\b\d{4}\b|\bremaster(?:ed)?\b|\bre-?master\b|\bremastering\b|\bversion\b|\bdigital(?:ly)?\b/gi,' ') : d;
  if(decs.some(d=>ALT.test(altPart(d)))) return 2;
  if(decs.some(d=>REMASTER.test(d))) return 1;
  return 0;
}
/* klucz utworu do dedupu wersji i anty-powtórek: tytuł bez nawiasów i sufiksu „ - …" */
export function titleKey(title){
  const t=String(title||'');
  return norm(t.replace(/\(([^)]*)\)|\[([^\]]*)\]/g,' ').replace(/\s[-–]\s.*$/,'')) || norm(t);
}

/* ---------- F5 #4: dekada ----------
 * `range` z categories.js: '1980–89', '2000–09', '2010-2019', '2020+' / '2020–' (otwarta). */
export const RANGE_TOLERANCE = 1;
export function parseRange(range){
  const s=String(range||'');
  let m=s.match(/(\d{4})\s*[–—-]\s*(\d{2,4})/);
  if(m){
    const from=+m[1]; let to=+m[2];
    if(m[2].length===2){ to=Math.floor(from/100)*100+to; if(to<from) to+=100; }
    return to>=from ? { from, to } : null;
  }
  m=s.match(/(\d{4})\s*(?:\+|[–—-]\s*$|\s*i później)/);
  if(m) return { from:+m[1], to:9999 };
  return null;
}
function yearOf(r){ const y=parseInt(String((r && r.releaseDate)||'').slice(0,4),10); return Number.isFinite(y) ? y : null; }
export function inRange(r, rng){
  if(!rng) return true;
  const y=yearOf(r);
  if(y===null) return true;    // brak daty (np. fallback Deezer) — nie karzemy za brak informacji
  return y>=rng.from-RANGE_TOLERANCE && y<=rng.to+RANGE_TOLERANCE;
}

/* ---------- F5 #3: popularność ----------
 * iTunes sortuje wyniki z grubsza wg popularności → waga wg pozycji (najlepszej wersji utworu)
 * w ORYGINALNEJ liście: 0–9 → 3, 10–24 → 2, dalej → 1. */
export function popWeight(idx){ return idx<10 ? 3 : idx<25 ? 2 : 1; }
function weightedPick(list, rng=Math.random){
  const total=list.reduce((s,c)=>s+popWeight(c.idx),0);
  let x=rng()*total;
  for(const c of list){ x-=popWeight(c.idx); if(x<0) return c; }
  return list[list.length-1];
}

/* Ranking kandydatów jednego wykonawcy → { level, list } (najlepszy niepusty poziom).
 *   level 0 — w dekadzie (lub kategoria bez dekady) i wersja studyjna/remaster,
 *   level 1 — wersja studyjna/remaster spoza dekady,
 *   level 2 — w dekadzie, ale tylko live/remix,
 *   level 3 — reszta (live/remix spoza dekady).
 * Wersje tego samego utworu zgrupowane po titleKey: z grupy bierzemy najlepszy tier
 * (bez nawiasów > remaster > live/remix), przy remisie — wyżej w wynikach iTunes. */
export function rankTracks(results, artist, seen, opts={}){
  const buckets=trackBuckets(results, artist, seen, opts);
  for(let level=0; level<4; level++) if(buckets[level].length) return { level, list:buckets[level] };
  return { level:-1, list:[] };
}
/* wszystkie poziomy rankingu naraz (rankTracks bierze pierwszy niepusty; składanka potrzebuje kilku utworów,
 * więc dobiera z kolejnych poziomów) → [[poziom 0], [1], [2], [3]] kandydatów {r, idx, key, tier, level} */
export function trackBuckets(results, artist, seen, opts={}){
  const rng=opts.range || null;
  const groups=new Map();
  (results||[]).forEach((r, idx)=>{
    if(!r || !r.previewUrl) return;
    if(BAD.test(r.artistName||'')||BAD.test(r.collectionName||'')||BAD.test(r.trackName||'')) return;
    if(NONSONG.test(r.trackName||'')) return;
    if(!sameArtist(r.artistName, artist)) return;                 // F5 #1: ten sam wykonawca (ściśle)
    const key=titleKey(r.trackName);
    if(!key) return;
    if(seen && (seen.has(key) || seen.has(norm(r.trackName)))) return;   // nie powtarzaj
    const tier=versionTier(r), ok=inRange(r, rng);
    const level = tier<=1 ? (ok?0:1) : (ok?2:3);
    const plain=decorations(r.trackName).filter(d=>!BENIGN.test(d)).length;   // ile „ozdobników"
    const c={ r, idx, tier, plain, key, level };
    const prev=groups.get(key);
    if(!prev){ groups.set(key, { best:c, idx }); return; }
    prev.idx=Math.min(prev.idx, idx);                              // popularność utworu = najlepsza pozycja
    // wersja: najniższy poziom (dekada+studyjna), potem tier, potem mniej ozdobników, potem wyżej w wynikach
    const b=prev.best;
    if(c.level<b.level || (c.level===b.level && (c.tier<b.tier || (c.tier===b.tier && c.plain<b.plain)))) prev.best=c;
  });
  const buckets=[[],[],[],[]];
  for(const g of groups.values()){
    const b=g.best;
    buckets[b.level].push({ r:b.r, idx:g.idx, key:b.key, tier:b.tier, level:b.level });
  }
  return buckets;
}

/* wybór utworu z wyników (ten sam artysta, bez coverów/live/remiksów, preferuj dekadę i popularne).
 * F8b: `opts.rnd` (alias dawnego `opts.rng`) — wstrzyknięty PRNG (Stacja dnia: ten sam seed + te same wyniki
 * iTunes ⇒ ten sam utwór); domyślnie Math.random (zachowanie bez zmian). */
export function pickTrackRanked(results, artist, seen, opts={}){
  const { level, list }=rankTracks(results, artist, seen, opts);
  if(!list.length) return null;
  const c=weightedPick(list, opts.rnd || opts.rng || Math.random);
  return { track:c.r, level, key:c.key };
}
export function pickTrack(results, artist, seen, opts={}){
  const p=pickTrackRanked(results, artist, seen, opts);
  return p ? p.track : null;
}

function normalize(t){
  return { track:t.trackName, artist:t.artistName, year:(t.releaseDate||'').slice(0,4),
    album:t.collectionName||'', preview:t.previewUrl,
    art:(t.artworkUrl100||'').replace('100x100','300x300'),
    genre:String(t.primaryGenreName||'').slice(0,60) };   // gust: gatunek iTunes (Deezer/stary proxy → '')
}

/* ---------- F5 #6: cache wyników per zapytanie w obrębie sesji ----------
 * Czysty memoizer wstrzykiwanego fetchera (zero sieci): trzyma OBIETNICĘ (współbieżne zapytania
 * o tego samego artystę = 1 żądanie), nie cache'uje błędów ani pustych wyników (bywają chwilowe),
 * TTL + limit wpisów (LRU przez kolejność Map). */
export function cachedFetcher(fn, { ttlMs=30*60*1000, max=200, pendingMs=30000, now=()=>Date.now() }={}){
  const cache=new Map();
  const wrapped=(term, opts)=>{
    const key=(opts && opts.album ? 'al:' : opts && opts.song ? 's:' : 'a:')+String(term||'').toLowerCase().trim();   // EKSPERYMENT: + albumy (okładka)
    const hit=cache.get(key);
    // trafienie: gotowy wynik w TTL albo zapytanie w locie nie starsze niż pendingMs (wiszące → ponów)
    if(hit && (hit.done ? now()-hit.at<ttlMs : now()-hit.at<pendingMs)){ cache.delete(key); cache.set(key, hit); return hit.p; }
    const p=Promise.resolve().then(()=>fn(term, opts));
    const entry={ at:now(), p, done:false };
    cache.set(key, entry);
    p.then(res=>{ entry.done=true; entry.at=now(); if(!res || !res.length) cache.get(key)===entry && cache.delete(key); },
           ()=>{ cache.get(key)===entry && cache.delete(key); });
    while(cache.size>max) cache.delete(cache.keys().next().value);
    return p;
  };
  wrapped.cache=cache;
  return wrapped;
}

/* ---------- F5 #5: playlista konkretnych piosenek (np. zaimportowana ze Spotify) ----------
 * Najpierw wyszukiwanie „<artysta> <tytuł>" (bez artistTerm — utwór spoza top-60 artysty też się
 * znajdzie), potem dawne wyszukiwanie po artyście. Zawsze MUSI pasować tytuł I wykonawca — inaczej
 * gralibyśmy zajawkę INNEGO utworu, a odpowiedź pokazywała tytuł z playlisty (rozjazd audio↔odpowiedź). */
function songQuery(s){
  const strip=x=>String(x||'').replace(/\(([^)]*)\)|\[([^\]]*)\]/g,' ').replace(/\s+(?:feat\.?|ft\.?)\s.*$/i,' ').replace(/\s+/g,' ').trim();
  return (strip(s.artist)+' '+strip(s.title)).trim();
}
/* Pole `match` utworu (opcjonalne, np. kategoria „akustycznie / unplugged"): słowo/słowa (alternatywy przez „|"),
 * z których co najmniej jedno MUSI wystąpić w trackName albo collectionName wyniku — inaczej zagrałaby wersja studyjna.
 * Dopasowanie bez wielkości liter i bez diakrytyków („akustycz" łapie „Akustycznie"). */
const foldDia = x => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');
export function matchWords(m){ return String(m||'').split('|').map(w=>foldDia(w).trim()).filter(Boolean); }
export function versionMatches(r, m){
  const words=matchWords(m); if(!words.length) return true;
  const hay=foldDia((r && r.trackName)+' \u0001 '+((r && r.collectionName)||''));
  return words.some(w=>hay.includes(w));
}
export function matchSong(results, s){
  const hits=(results||[]).map((r,idx)=>({r,idx})).filter(({r})=>r && r.previewUrl &&
    textMatch(r.trackName, s.title) && (sameArtist(r.artistName, s.artist) || textMatch(r.artistName, s.artist)) &&
    versionMatches(r, s.match));
  if(!hits.length) return null;
  hits.sort((a,b)=> (versionTier(a.r)-versionTier(b.r)) || (a.idx-b.idx));   // studyjna > remaster > live; potem popularność
  return hits[0].r;
}
/* zapytania o utwór playlisty: „artysta tytuł" (song), zapas po wykonawcy (artistTerm). Z `match` (wersja akustyczna/
 * unplugged) najpierw „artysta tytuł <słowo>" — wersja z albumu MTV/Acoustic bywa poza top 25 zwykłego wyszukiwania.
 * Wspólne z tools/verify-tracks.mjs (weryfikacja danych tą samą ścieżką co gra). */
export function songTerms(s){
  const first=matchWords(s && s.match)[0];
  return [...(first ? [[songQuery(s)+' '+first, {song:true}]] : []), [songQuery(s), {song:true}], [s.artist, undefined]];
}
async function resolveFromSongs(cat, seen, itunes, capMs=RESOLVE_CAP_MS, rnd=Math.random){
  let pool=(cat.songs||[]).filter(s=>!seen.has(norm(s.title)));
  if(!pool.length){ (cat.songs||[]).forEach(s=>seen.delete(norm(s.title))); pool=(cat.songs||[]).slice(); }
  const deadline=Date.now()+capMs;
  let anyResponse=false;
  for(const s of shuffle(pool, rnd)){
    let preview=s.preview||'', art='', genre='', itYear='';
    if(!preview){
      for(const [term, opts] of songTerms(s)){
        const remaining=deadline-Date.now(); if(remaining<=0) break;
        try{
          const res=await withTimeout(Promise.resolve(itunes(term, opts)), remaining); anyResponse=true;
          const t=matchSong(res, s);
          if(t){ preview=t.previewUrl; art=(t.artworkUrl100||'').replace('100x100','300x300'); genre=String(t.primaryGenreName||'').slice(0,60); itYear=String(t.releaseDate||'').slice(0,4); break; }
        }catch(e){ /* błąd/timeout — następny wariant */ }
      }
    }
    if(preview){ seen.add(norm(s.title));
      const t={ track:s.title, artist:s.artist, year:s.year||'', album:s.album||'', preview, art, genre };
      if(s.year) t.yearSrc='data';   // F8a: rok z danych playlisty (kuratorowany), nie z iTunes
      if(typeof s.from==='string' && s.from) t.from=s.from.slice(0, 80);   // gust etap 3: „Gust stołu" — z czyjej półki
      else if(itYear) t.itYear=itYear;   // gust: rok wydania z iTunes TYLKO informacyjnie (tryby gry dalej używają `year`)
      return t; }
    seen.add(norm(s.title));
    if(Date.now()>=deadline) break;
  }
  return { error:true, reason: (anyResponse || (cat.songs||[]).some(s=>s.preview)) ? 'empty' : 'offline' };
}

/* pula wykonawców → szukaj grywalnej zajawki.
 * F5: pierwszy wykonawca z kandydatem poziomu 0 (dekada + wersja studyjna) wygrywa; inaczej
 * zapamiętujemy najlepszy zapasowy i sprawdzamy jeszcze ≤FALLBACK_EXTRA_ARTISTS wykonawców. */
async function resolveFromArtists(cat, seen, recent, itunes, capMs=RESOLVE_CAP_MS, rnd=Math.random){
  const pool = recent ? cat.artists.filter(a=>!recent.includes(a)) : cat.artists.slice();
  const tryOrder = shuffle(pool.length?pool:cat.artists, rnd);   // F8b: seedowany rnd → ta sama kolejność wykonawców
  const deadline = Date.now()+capMs;   // 2.2: twardy cap całkowity zamiast sumy per-artysta
  const range = parseRange(cat.range);
  let anyResponse=false, fallback=null, sinceFallback=0;
  const take=(p, artist)=>{
    seen.add(p.key); seen.add(norm(p.track.trackName));
    if(recent){ recent.push(artist); if(recent.length>6) recent.shift(); }
    return normalize(p.track);
  };
  for(const artist of tryOrder){
    if(Date.now()>=deadline) break;    // przekroczony budżet czasu → zapasowy albo t.error
    if(fallback && sinceFallback>=FALLBACK_EXTRA_ARTISTS) break;
    let res=null;
    for(let attempt=0; attempt<2 && !res; attempt++){
      const remaining=deadline-Date.now(); if(remaining<=0) break;
      try{ res=await withTimeout(Promise.resolve(itunes(artist)), remaining); anyResponse=true; }catch(e){ /* timeout/błąd — próbujemy dalej */ }
    }
    if(fallback) sinceFallback++;
    if(!res) continue;
    const p=pickTrackRanked(res, artist, seen, { range, rnd });
    if(!p) continue;
    if(p.level===0) return take(p, artist);
    if(!fallback || p.level<fallback.p.level) fallback={ p, artist };
  }
  if(fallback) return take(fallback.p, fallback.artist);   // rzadki zapas: rok z releaseDate, nie udajemy dekady
  return { error:true, reason: anyResponse?'empty':'offline' };
}

/* ---------- F8a: tryb „rok" — wiarygodność roku ----------
 * Rok wydania z iTunes (releaseDate) bywa datą remasteru/kompilacji. Ufamy mu, gdy mieści się ŚCIŚLE w zakresie
 * dekady kategorii (F5 i tak preferuje takie utwory). Inaczej (style/playlisty/zapas spoza dekady) odsłona mówi
 * „rok wg wydania w iTunes". Rok z danych playlisty (yearSrc:'data') traktujemy jako kuratorowany. */
export function yearReliable(year, range, yearSrc){
  if(yearSrc==='data') return true;
  const y=parseInt(String(year||'').slice(0,4),10);
  const rng=typeof range==='string' ? parseRange(range) : range;
  return !!(rng && Number.isFinite(y) && y>=rng.from && y<=rng.to);
}

/* ---------- tytuł do WYŚWIETLENIA (odsłona, karty osi czasu, składanka, kafle ABCD, wyniki) ----------
 * Bez „ozdobników" wydania: remaster („(2012 Remaster)", „ - Remastered 2011", „(Remastered)", „ - 2009 Remaster",
 * „[2015 Remastered Version]"), „(Single Version)"/„ - Mono Version"/„(Radio Edit)", „(feat. …)", „(From …)" — wszystkie kafle
 * wyglądają jednakowo (poprawna odpowiedź nie wyróżnia się „(2011 Remaster)"). Dopiski WERSJI zostają („(Live)", „(Acoustic)",
 * „(MTV Unplugged)", „ - Live / Remastered" — to realna różnica nagrania), nawias będący częścią tytułu też
 * („(I Can't Get No) Satisfaction"). Tylko wyświetlanie: ocena odpowiedzi używa surowego tytułu (scoring i tak normalizuje). */
const DISPLAY_DROP = /^(?:(?:mono|stereo|single|album|radio|lp|original|7"|7-inch|45)\s+(?:version|edit|mix)|mono|stereo)$/i;
const REMASTER_WORDS = /\b\d{4}\b|\bremaster(?:ed)?\b|\bre-?master(?:ed)?\b|\bremastering\b|\bversion\b|\bdigital(?:ly)?\b|\b(?:mono|stereo|single|album|edition)\b|[\/;,&+]/gi;
function dropDecoration(d){
  const x=String(d||'').trim();
  if(!x) return true;
  if(BENIGN.test(x) || DISPLAY_DROP.test(x)) return true;
  return REMASTER.test(x) && !ALT.test(x.replace(REMASTER_WORDS,' '));   // sam remaster (bez „live"/„mix" obok)
}
export function displayTitle(title){
  const t=String(title||'').replace(/\s+/g,' ').trim();
  let cleaned=t.replace(/\s*[(\[]([^)\]]*)[)\]]/g,(m,inner)=> dropDecoration(inner) ? '' : m);
  // sufiksy „ - …" (też kilka: „Song - Single Version - 2009 Remaster") — od końca, dopóki są ozdobnikiem
  for(let i=0;i<3;i++){
    const m=cleaned.match(/\s[-–]\s([^-–]+)$/);
    if(!m || !dropDecoration(m[1])) break;
    cleaned=cleaned.slice(0, m.index);
  }
  cleaned=cleaned.replace(/\s+/g,' ').trim();
  return cleaned || t;
}
// kandydat → {track, artist, year, idx} (wynik iTunes {trackName,artistName,releaseDate} albo utwór playlisty {title,artist,year}).
// F8b: `idx` = pozycja w wynikach iTunes wykonawcy (popularność; gatherDistractors dopisuje `_pos`), `year` = rok wydania.
function asOption(c){
  if(!c || typeof c!=='object') return null;
  const raw=c.trackName!=null ? c : { trackName:c.title!=null?c.title:c.track, artistName:c.artist, collectionName:c.album||'' };
  const track=displayTitle(raw.trackName), artist=String(raw.artistName||'').replace(/\s+/g,' ').trim();
  if(!track || !artist) return null;
  if(BAD.test(track)||BAD.test(artist)||BAD.test(raw.collectionName||'')||NONSONG.test(track)) return null;
  if(raw.trackName!=null && c.trackName!=null && versionTier(c)===2) return null;   // live/remix — nie jako dystraktor
  const y=parseInt(String(c.releaseDate!=null ? c.releaseDate : (c.year||'')).slice(0,4),10);
  const pos=Number.isInteger(c._pos) ? c._pos : null;
  return { track, artist, key:titleKey(track), year:Number.isFinite(y) ? y : null, idx:pos };
}
/* F8b: dystraktory muszą być WIARYGODNE — z dekady kategorii (±RANGE_TOLERANCE) i popularne (pozycja < DISTRACTOR_TOP
 * w wynikach iTunes wykonawcy, jak poprawny utwór wybierany z wagą popularności). Utwór spoza okna roku to „odstający"
 * kafel (hit z 2013 w kategorii 2000–09) — odrzucany. Gdy POPRAWNY utwór sam jest spoza dekady (zapas F5),
 * okno rozszerzamy o jego rok (±1), żeby to on nie odstawał. Brak roku → nie karzemy (jak inRange). */
export const DISTRACTOR_TOP = 15;
export function distractorWindow(range, correctYear){
  const rng=typeof range==='string' ? parseRange(range) : range;
  if(!rng) return null;
  let from=rng.from-RANGE_TOLERANCE, to=rng.to>=9999 ? 9999 : rng.to+RANGE_TOLERANCE;
  const cy=parseInt(String(correctYear||'').slice(0,4),10);
  if(Number.isFinite(cy)){ from=Math.min(from, cy-RANGE_TOLERANCE); if(to<9999) to=Math.max(to, cy+RANGE_TOLERANCE); }
  return { from, to };
}
/* Czysta: wybierz `n` dystraktorów dla poprawnego utworu `correct` ({track, artist, year?}) z kandydatów.
 *  • nigdy ten sam utwór (titleKey albo textMatch tytułu — też cover/wersja u INNEGO wykonawcy),
 *  • bez duplikatów między kaflami (titleKey), bez live/remiksów/karaoke,
 *  • F8b: `opts.range` (zakres kategorii, np. '2000–09') → bez utworów spoza okna roku; w obrębie etapu najpierw
 *    popularne (idx < DISTRACTOR_TOP lub brak pozycji, np. playlista), potem ŚCIŚLE w dekadzie, potem reszta,
 *  • najpierw INNI wykonawcy (po jednym utworze na wykonawcę, kolejność losowa `rnd`),
 *    potem fallback: inne utwory TEGO SAMEGO wykonawcy, na końcu kolejne utwory innych wykonawców.
 * Zwraca [{track, artist}] (≤ n). */
export function pickDistractors(candidates, correct, rnd=Math.random, n=3, opts={}){
  const cTitle=displayTitle(correct && correct.track), cArtist=String((correct && correct.artist)||'');
  const cKey=titleKey(cTitle);
  const win=distractorWindow(opts && opts.range, correct && correct.year);
  const strict=typeof (opts && opts.range)==='string' ? parseRange(opts.range) : ((opts && opts.range) || null);
  const top=(opts && Number.isInteger(opts.top)) ? opts.top : DISTRACTOR_TOP;
  const byKey=new Map();
  (candidates||[]).forEach(c=>{
    const o=asOption(c); if(!o || !o.key) return;
    if(o.key===cKey || textMatch(o.track, cTitle)) return;
    if(win && o.year!=null && (o.year<win.from || o.year>win.to)) return;      // odstający rok
    // ten sam utwór z kilku wyników (wersje) → najlepsza (najwyższa) pozycja
    const k=o.key+'\u0000'+norm(o.artist), prev=byKey.get(k);
    if(!prev || (o.idx!=null && (prev.idx==null || o.idx<prev.idx))) byKey.set(k, o);
  });
  const opts2=[...byKey.values()];
  // tasowanie Fisher–Yates z wstrzykniętym rnd (deterministyczne w testach), potem STABILNE sortowanie wg rangi
  for(let i=opts2.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [opts2[i],opts2[j]]=[opts2[j],opts2[i]]; }
  const rank=o=> (o.idx!=null && o.idx>=top ? 2 : 0) + (strict && o.year!=null && (o.year<strict.from || o.year>strict.to) ? 1 : 0);
  opts2.sort((a,b)=>rank(a)-rank(b));
  const same=o=> sameArtist(o.artist, cArtist) || sameArtist(cArtist, o.artist);
  const picked=[], usedKeys=new Set(), usedArtists=new Set();
  const take=(o)=>{ if(picked.length>=n || usedKeys.has(o.key)) return; picked.push(o); usedKeys.add(o.key); usedArtists.add(norm(o.artist)); };
  opts2.filter(o=>!same(o)).forEach(o=>{ if(!usedArtists.has(norm(o.artist))) take(o); });   // 1) inni wykonawcy, po 1
  opts2.filter(same).forEach(take);                                                          // 2) ten sam wykonawca
  opts2.filter(o=>!same(o)).forEach(take);                                                   // 3) dalsze utwory innych
  return picked.slice(0, n).map(o=>({ track:o.track, artist:o.artist }));
}
/* Czysta: pytanie ABCD z utworu + dystraktorów — kształt jak potasowane pytanie quizu (shuffleMC), więc ocenia je
 * core/scoring.evaluateQuiz (solo i MP), a odsłona MP to odsłona quizu. Kafel = „Tytuł — Wykonawca".
 * Za mało dystraktorów (< n) → null (wołający gra pytanie jak zwykłą „muzykę"). */
const MC_LET='ABCD';
export const ABCD_SLOT={ key:'a', label:'litera (A–D)' };
export function buildTrackMC(correct, distractors, rnd=Math.random, n=3){
  const ds=(distractors||[]).filter(d=>d && d.track && d.artist).slice(0, n);
  if(!correct || !correct.track || ds.length<n) return null;
  const clean=x=>String(x).replace(/\s+/g,' ').trim();
  const label=o=>clean(displayTitle(o.track))+' — '+clean(o.artist);
  const all=[{ text:label(correct), ok:true }, ...ds.map(d=>({ text:label(d), ok:false }))];
  for(let i=all.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [all[i],all[j]]=[all[j],all[i]]; }
  const options=all.map((o,i)=>({ letter:MC_LET[i], text:o.text }));
  const ci=all.findIndex(o=>o.ok);
  const question='Jaki to utwór?';
  return {
    prompt: question+'\n'+options.map(o=>o.letter+') '+o.text).join('\n'),
    slots:[ { ...ABCD_SLOT } ],
    answers:{ a:[ options[ci].letter, options[ci].text ] },
    mc:{ question, options, correct:options[ci].letter },
  };
}
/* Dystraktory z kategorii: playlista → jej utwory (bez sieci); pula wykonawców → wyniki iTunes kilku INNYCH
 * wykonawców z puli (F8b: tylko z dekady kategorii, preferencyjnie popularne — pickDistractors({range})) (wstrzyknięty `itunes` — w web/serwerze to cache per artysta, F5 #6), równolegle, z capem
 * czasu; gdy za mało — utwory tego samego wykonawcy. Nigdy nie rzuca: [] przy braku sieci. */
export const DISTRACTOR_ARTISTS = 4;
export const DISTRACTOR_CAP_MS = 6000;
export async function gatherDistractors({ cat, correct, itunes, rnd=Math.random, capMs=DISTRACTOR_CAP_MS, n=3 }){
  if(!cat || !correct) return [];
  const cands=[];
  // F8b: `_pos` = pozycja w wynikach wykonawcy (popularność) — pickDistractors preferuje top DISTRACTOR_TOP
  const fetchFor=async(artist)=>{
    try{ const res=await withTimeout(Promise.resolve(itunes(artist)), capMs);
      (res||[]).forEach((r, idx)=>{ if(r && sameArtist(r.artistName, artist)) cands.push({ ...r, _pos:idx }); }); }catch(_e){ /* timeout/błąd — pomiń */ }
  };
  const pick=()=>pickDistractors(cands, correct, rnd, n, { range:cat.range });
  if(Array.isArray(cat.songs)) cat.songs.forEach(x=>cands.push(x));
  const artists=Array.isArray(cat.artists) ? cat.artists : [];
  if(artists.length && itunes){
    const others=artists.filter(a=>!sameArtist(correct.artist, a) && !sameArtist(a, correct.artist));
    const order=others.slice();
    for(let i=order.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
    await Promise.all(order.slice(0, DISTRACTOR_ARTISTS).map(fetchFor));
    if(pick().length<n){
      const own=artists.find(a=>sameArtist(correct.artist, a)) || correct.artist;
      await fetchFor(own);
    }
  }
  return pick();
}

/* ======================= EKSPERYMENT: „składanka" (medley) i „okładka" (cover) — pytania o WYKONAWCĘ =======================
 * Oba tryby potrzebują PULI WYKONAWCÓW: `cat.artists` albo — dla playlisty — różnych wykonawców jej utworów
 * (gdy jest ich ≥ MIN_PLAYLIST_ARTISTS; playlista 2–3 wykonawców dawałaby ciągle tych samych). */
export const MIN_PLAYLIST_ARTISTS = 4;
// wykonawca główny wpisu playlisty: bez „feat./ft./featuring/x/with …" (miękkie „&"/przecinek zostają — „Simon & Garfunkel")
const primaryArtist = a => String(a||'').split(/\s+(?:feat\.?|ft\.?|featuring|x|with)\s+/i)[0].trim();
export function artistPool(cat){
  if(!cat || typeof cat!=='object' || cat.kind==='quiz' || cat.kind==='lyrics') return [];
  if(Array.isArray(cat.artists) && cat.artists.length) return cat.artists.filter(a=>typeof a==='string' && a.trim());
  const byKey=new Map();
  (Array.isArray(cat.songs) ? cat.songs : []).forEach(x=>{
    const a=primaryArtist(x && x.artist), k=artistKey(a);
    if(a && k && !byKey.has(k)) byKey.set(k, a);
  });
  return byKey.size>=MIN_PLAYLIST_ARTISTS ? [...byKey.values()] : [];
}
// kolejność prób wykonawców: bez ostatnio użytych (recent), seedowalny rnd, najwyżej `tries`
function artistOrder(pool, recent, rnd, tries){
  const fresh = recent ? pool.filter(a=>!recent.includes(a)) : pool.slice();
  return shuffle(fresh.length ? fresh : pool, rnd).slice(0, tries);
}
function rememberArtist(recent, artist){ if(recent){ recent.push(artist); if(recent.length>6) recent.shift(); } }

/* ---------- składanka: 4 RÓŻNE utwory tego samego wykonawcy ----------
 * Kolejność grup: studyjne/remaster popularne (pozycja < MEDLEY_TOP) → studyjne mniej popularne → live/remix
 * popularne → reszta. W grupie losowanie ważone popularnością (popWeight) BEZ zwracania. Dedup tytułów
 * (titleKey) i filtr wersji/coverów robi trackBuckets (ta sama logika co wybór utworu w „muzyce"). */
export const MEDLEY_N = 4, MEDLEY_MIN = 3, MEDLEY_TOP = 15, MEDLEY_ARTIST_TRIES = 5;
export function pickMedleyTracks(results, artist, rnd=Math.random, opts={}){
  const n = Number.isInteger(opts.n) && opts.n>0 ? opts.n : MEDLEY_N;
  const top = Number.isInteger(opts.top) ? opts.top : MEDLEY_TOP;
  const b = trackBuckets(results, artist, opts.seen || null, { range: opts.range || null });
  const studio=[...b[0], ...b[1]], alt=[...b[2], ...b[3]];
  const groups=[ studio.filter(c=>c.idx<top), studio.filter(c=>c.idx>=top), alt.filter(c=>c.idx<top), alt.filter(c=>c.idx>=top) ];
  const out=[], used=new Set();
  for(const g of groups){
    let rest=g.filter(c=>!used.has(c.key));
    while(out.length<n && rest.length){
      const c=weightedPick(rest, rnd);
      out.push(c); used.add(c.key);
      rest=rest.filter(x=>x!==c && !used.has(x.key));
    }
    if(out.length>=n) break;
  }
  return out;
}
/* Rozwiąż składankę: kolejni wykonawcy z puli (≤ tries) aż któryś ma n grywalnych utworów; inaczej najlepszy z ≥ min
 * (3 wycinki). Brak → {error, reason} (wołający gra wtedy zwykłą „muzykę").
 * → { artist (z puli — forma odpowiedzi), artistAlt (zapis iTunes), clips:[{track, artist, year, album, preview, art}] } */
export async function resolveMedley({ cat, seen, recent, itunes, rnd=Math.random, capMs=RESOLVE_CAP_MS, n=MEDLEY_N, min=MEDLEY_MIN, tries=MEDLEY_ARTIST_TRIES }){
  const pool=artistPool(cat);
  if(!pool.length) return { error:true, reason:'empty' };
  const range=parseRange(cat.range), deadline=Date.now()+capMs;
  let best=null, anyResponse=false;
  for(const artist of artistOrder(pool, recent, rnd, tries)){
    const remaining=deadline-Date.now(); if(remaining<=0) break;
    let res=null;
    try{ res=await withTimeout(Promise.resolve(itunes(artist)), remaining); anyResponse=true; }catch(_e){ continue; }
    const picks=pickMedleyTracks(res, artist, rnd, { n, range, seen });
    if(picks.length>=n){ best={ artist, picks }; break; }
    if(picks.length>=min && (!best || picks.length>best.picks.length)) best={ artist, picks };
  }
  if(!best) return { error:true, reason: anyResponse ? 'empty' : 'offline' };
  rememberArtist(recent, best.artist);
  if(seen) best.picks.forEach(p=>{ seen.add(p.key); seen.add(norm(p.r.trackName)); });
  const clips=best.picks.map(p=>normalize(p.r));
  const exact=clips.find(c=>artistKey(c.artist)===artistKey(best.artist));
  return { artist:best.artist, artistAlt:(exact||clips[0]).artist, clips };
}

/* ---------- okładka: popularny album wykonawcy ----------
 * Źródło: iTunes `entity=album` (top wyniki ≈ popularność); gdy niedostępne — albumy zebrane z wyników utworów
 * (collectionName/artwork piosenek wykonawcy, albumsFromSongs). Odrzucamy single/EP i albumy innych wykonawców;
 * rangi: 0 — album „zwykły" (też „(Remastered)"), 1 — edycje (deluxe/expanded/anniversary), 2 — kompilacje
 * (greatest hits/best of/collection/…), koncertowe, soundtracki. Gramy najlepszą niepustą rangę („bez kompilacji,
 * jeśli są alternatywy"); w niej losowanie ważone popularnością z top ALBUM_TOP. */
export const ALBUM_TOP = 8, COVER_ARTIST_TRIES = 5;
const ALBUM_SINGLE = /\s[-–]\s(?:single|ep)\s*$/i;
const ALBUM_COMPILATION = /\b(?:greatest(?: hits)?|best of|the best|very best|hits|collection|kolekcja|essentials?|anthology|antologia|gold|platinum|singles|przeboje|soundtrack|motion picture|original score|live|unplugged|in concert|koncert|na żywo|na zywo|remix(?:es|ed)?|karaoke|tribute|covers)\b|\b(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\b/i;
const ALBUM_EDITION = /\b(?:deluxe|expanded|anniversary|edition|bonus|special|collector'?s)\b/i;
const ALBUM_DECOR = /remaster|deluxe|expanded|anniversary|edition|version|bonus|special|collector|mono|stereo|explicit|clean|\d{4}/i;
// tytuł albumu do odsłony/oceny: bez „(Remastered)", „(Deluxe Edition)", „ - Single/EP"
export function albumTitle(name){
  const t=String(name||'').trim();
  const c=t.replace(ALBUM_SINGLE,'').replace(/\s*[(\[]([^)\]]*)[)\]]/g,(m,inner)=> ALBUM_DECOR.test(inner) ? '' : m).replace(/\s+/g,' ').trim();
  return c || t;
}
export function albumKey(name){
  const t=String(name||'');
  return norm(t.replace(/\(([^)]*)\)|\[([^\]]*)\]/g,' ').replace(ALBUM_SINGLE,' ').replace(/\s[-–]\s.*$/,'')) || norm(t);
}
// ranga albumu (-1 = odrzucony: singiel/EP/za mało utworów)
export function albumTier(a){
  const name=String((a && a.collectionName)||'');
  if(!name || ALBUM_SINGLE.test(name)) return -1;
  const tc=Number(a.trackCount);
  if(Number.isFinite(tc) && tc>0 && tc<4) return -1;
  if(ALBUM_COMPILATION.test(name)) return 2;
  if(ALBUM_EDITION.test(name)) return 1;
  return 0;
}
// okładka iTunes w zadanym rozmiarze („…/100x100bb.jpg" → „…/600x600bb.jpg")
export function coverArtUrl(url, size=600){
  const u=String(url||''); if(!u) return '';
  const r=u.replace(/\/\d+x\d+(bb)?(\.[a-z]+)$/i, `/${size}x${size}bb$2`);
  return r!==u ? r : u.replace('100x100', `${size}x${size}`);
}
/* Czysta: wybierz album z wyników → { a (surowy wynik), key, tier, idx } albo null */
export function pickAlbum(albums, artist, seen, rnd=Math.random, opts={}){
  const top=Number.isInteger(opts.top) ? opts.top : ALBUM_TOP;
  const groups=new Map();
  (albums||[]).forEach((a, idx)=>{
    if(!a || !a.artworkUrl100 || !a.collectionName) return;
    const who=a.collectionArtistName || a.artistName || '';
    if(BAD.test(who) || BAD.test(a.collectionName)) return;
    if(!sameArtist(who, artist) && !sameArtist(a.artistName||'', artist)) return;
    const tier=albumTier(a); if(tier<0) return;
    const key=albumKey(a.collectionName); if(!key) return;
    if(seen && seen.has('album:'+key)) return;
    const prev=groups.get(key);
    if(!prev){ groups.set(key, { a, key, tier, idx }); return; }
    if(tier<prev.tier) { prev.a=a; prev.tier=tier; }       // ta sama płyta: wersja „zwykła" przed deluxe
    prev.idx=Math.min(prev.idx, idx);
  });
  const all=[...groups.values()];
  if(!all.length) return null;
  const best=Math.min(...all.map(g=>g.tier));
  const list=all.filter(g=>g.tier===best).sort((x,y)=>x.idx-y.idx).slice(0, Math.max(1, top));
  return weightedPick(list, rnd);
}
// albumy z wyników UTWORÓW (zapas, gdy wyszukiwanie albumów niedostępne): grupowanie po collectionId/nazwie
export function albumsFromSongs(results){
  const by=new Map();
  (results||[]).forEach(r=>{
    if(!r || !r.collectionName) return;
    const k=r.collectionId!=null ? 'id:'+r.collectionId : 'n:'+norm(r.collectionName);
    if(by.has(k)) return;
    by.set(k, { collectionName:r.collectionName, artistName:r.collectionArtistName || r.artistName || '', artworkUrl100:r.artworkUrl100 || '',
      releaseDate:r.releaseDate || '', trackCount:r.trackCount, collectionId:r.collectionId });
  });
  return [...by.values()];
}
/* utwór reprezentatywny albumu (❤️ w odsłonie okładki): pierwszy (≈ najpopularniejszy) utwór tego wykonawcy z tym albumem
 * (albumKey jak pickAlbum) → { title, artist, year, art, genre } albo null */
export function coverRepTrack(results, key, artist){
  for(const r of (Array.isArray(results) ? results : [])){
    if(!r || !r.trackName || !r.collectionName || albumKey(r.collectionName)!==key) continue;
    if(!sameArtist(r.artistName||'', artist) && !sameArtist(artist, r.artistName||'')) continue;
    return { title:displayTitle(r.trackName), artist:r.artistName||artist, year:String(r.releaseDate||'').slice(0,4),
      art:coverArtUrl(r.artworkUrl100||'', 300), genre:String(r.primaryGenreName||'').slice(0,60) };
  }
  return null;
}
/* Rozwiąż okładkę: kolejni wykonawcy z puli (≤ tries). `itunes(artist, {album:true})` → albumy; pusto/błąd →
 * albumy z wyników utworów (`itunes(artist)` — ten sam cache co muzyka). Brak → {error, reason}.
 * → { artist (z puli), artistAlt, album (tytuł do odsłony/oceny), albumRaw, year, art (600×600), tier } */
export async function resolveCover({ cat, seen, recent, itunes, rnd=Math.random, capMs=RESOLVE_CAP_MS, tries=COVER_ARTIST_TRIES }){
  const pool=artistPool(cat);
  if(!pool.length) return { error:true, reason:'empty' };
  const deadline=Date.now()+capMs;
  let anyResponse=false;
  for(const artist of artistOrder(pool, recent, rnd, tries)){
    let p=null, songs=null;
    for(const opts of [{ album:true }, undefined]){
      const remaining=deadline-Date.now(); if(remaining<=0) break;
      try{
        const res=await withTimeout(Promise.resolve(itunes(artist, opts)), remaining); anyResponse=true;
        if(!opts) songs=res;
        p=pickAlbum(opts ? res : albumsFromSongs(res), artist, seen, rnd);
      }catch(_e){ /* błąd/timeout — następne źródło */ }
      if(p) break;
    }
    if(!p) continue;
    rememberArtist(recent, artist);
    if(seen) seen.add('album:'+p.key);
    const a=p.a;
    // Gust (❤️ w odsłonie okładki): ocenia się UTWORY (core/taste.trackKey) — „utwór reprezentatywny" = najpopularniejszy
    // utwór wykonawcy z tego albumu (te same wyniki/cache co „muzyka"); brak → odsłona bez ❤️
    if(!songs){ const remaining=deadline-Date.now(); if(remaining>0){ try{ songs=await withTimeout(Promise.resolve(itunes(artist)), remaining); }catch(_e){ songs=null; } } }
    const rep=coverRepTrack(songs, p.key, artist);
    return { artist, artistAlt:a.artistName || artist, album:albumTitle(a.collectionName), albumRaw:a.collectionName,
      year:String(a.releaseDate||'').slice(0,4), art:coverArtUrl(a.artworkUrl100, 600), tier:p.tier, ...(rep ? { rep } : {}) };
  }
  return { error:true, reason: anyResponse ? 'empty' : 'offline' };
}

/* ======================= EKSPERYMENT: „covery instrumentalne" — fortepian (piano) i gitara (guitar) =======================
 * Gracz słyszy zajawkę coveru instrumentalnego i zgaduje TYTUŁ i ORYGINALNEGO wykonawcę (punkty jak „muzyka").
 * OSOBNA ścieżka: BAD (filtr coverów/tributów) dla zwykłych trybów zostaje nietknięty — tu covery są celem,
 * ale wybór ma własne, ostrzejsze reguły (słowo instrumentu, tytuł = oryginał, inny wykonawca, bez wokalu/kołysanek).
 * Wspólny rdzeń (resolveInstrumentalCover / pickInstrumentalCover) sparametryzowany instrumentem z COVER_INSTRUMENTS.
 * Badanie iTunes PL: światowe hity mają piano cover z zajawką ~11/12, gitarowy ~11/12; polskie ~0/8 (piano) i 0/4
 * (gitara) → modesFor nie oferuje tych trybów w kategoriach polskich (instrumentalCapable w core/match.js),
 * a resolver pomija utwory z polskimi znakami.
 * Gitara — poprawki po testach (2026-10): akceptacja ZAOSTRZONA (core/guitarCovers.js: znacznik instrumentalny w tytule
 * / kuratorowana lista wykonawców / album coverów + „guitar" w nazwie wykonawcy; bez vocal/feat./lyrics/karaoke).
 * Pomiar na żywym iTunes PL (22 światowe hity, 3 zapytania/hit): przed 13/22, po zaostrzeniu 12/22 (55%) — odpadły
 * m.in. „Acoustic Version" bez pewności braku wokalu; pytanie i tak ma do COVER_TRIES oryginałów na znalezienie coveru.
 * Pomiar 2026-10 (tools/measure-covers.mjs, 40 hitów, zapytania jak resolver; iTunes / Deezer-only jak serwer MP / scalone):
 * fortepian 80/70/90%, gitara 60/98/95% (przed: 70/70/90 i 53/85/90) — poprawki: konsensus ≥3 coverów przy braku oryginału
 * (COVER_CONSENSUS), ścisły tytuł coveru (coverSameTitle), odrzut „Live", 2 wpisy na liście gitarzystów, Mount Hayes na deny. */
export const PIANO_WORD = /\b(?:piano|pianoforte|klavier|fortepian\w*)\b/i;
// odrzuć: wokal, karaoke, kołysanki (Rockabye Baby to nie fortepian), inne instrumenty, składanki/mashupy
export const PIANO_REJECT = /\bvocals?\b|with vocals|\blive\b|karaoke|sing-?along|in the style of|backing track|lullab|rockabye|guitar|string quartet|\bstrings\b|quartet|\bviolins?\b|\bcellos?\b|orchestra|\bharp\b|ukulele|marimba|music box|8-?bit|medley|mash-?up|\bmegamix\b/i;
/* gitara: guitar/gitar…/guitarra/Gitarre/fingerstyle/fingerpicking w tytule, wykonawcy albo albumie (wynik bez tego słowa —
 * np. zespół coverowy z wokalem, „Acoustic" wokalisty — odpada). Odrzuć: wokal, karaoke, podkłady/„guitar base"/play-along,
 * lekcje/tutoriale/taby/akordy, „cover sessions" (wokalne zespoły coverowe), fortepian (inny tryb), kołysanki, inne
 * instrumenty (sax/skrzypce/wiolonczela/orkiestra/bas/perkusja/ukulele…), medleye, sped up/slowed/reverb/nightcore. */
export const GUITAR_WORD = /\b(?:guitars?|gitar\w*|guitarra\w*|gitarre\w*|fingerstyle|finger-?style|fingerpick\w*)\b/i;
export const GUITAR_REJECT = /\bvocals?\b|with vocals|\blive\b|\bsung by\b|karaoke|sing-?along|in the style of|backing tracks?|\bguitar base\b|play-?along|\blessons?\b|tutorial|how to play|\btabs?\b|tablature|\bchords\b|cover sessions|\bpiano\w*|klavier|fortepian|lullab|rockabye|\bsax\b|saxo\w*|\bviolins?\b|\bcellos?\b|string quartet|orchestra|\bharp\b|ukulele|marimba|music box|8-?bit|\bbass\b|\bdrums?\b|\bflute|medley|mash-?up|\bmegamix\b|sped up|slowed|reverb|nightcore|remix|\b8d\b|extended/i;
/* pomiar na żywo: „About a Girl" The Academy Is… (INNA piosenka, wokal) z kompilacji „Guitar Underground", remiksy „Guitar Remix - EP".
 * Gdy słowo gitary jest TYLKO w albumie, album musi też wyglądać na płytę coverów/instrumentalną („Guitar Covers, Vol. 1",
 * „Acoustic Guitar Pearls", „Peaceful Music Romantic Guitar", „Spanish Guitar Hits"). */
export const GUITAR_ALBUM_OK = /\bcovers?\b|tribute|instrumental|acoustic|\bplays?\b|arrang|fingerstyle|spanish|classical|relax\w*|chill\w*|lounge|romantic|peaceful|bossa|\bcafe\b|\bsolo\b/i;
// parametry instrumentu: słowo-wymóg, odrzuty, dopisek do zdjęcia z końca tytułu, słowa zapytań
export const COVER_INSTRUMENTS = {
  piano: { word:PIANO_WORD, reject:PIANO_REJECT,
    tail:/\b(?:piano|klavier)\s+(?:version|cover|arrangement|instrumental|solo|rendition)\b.*$/i,
    queries:(t, a)=>[t+' piano', (t+' '+a).trim()+' piano cover'] },
  // poprawki po testach: + `strict` (core/guitarCovers.guitarCoverOk) — znacznik instrumentalny w tytule ALBO wykonawca
  // z kuratorowanej listy ALBO album coverów + „guitar" w nazwie wykonawcy; zawsze bez vocal/feat./lyrics/karaoke
  guitar: { word:GUITAR_WORD, reject:GUITAR_REJECT, albumOk:GUITAR_ALBUM_OK, strict:guitarCoverOk,
    // „Wonderwall Guitar", „Song Acoustic Guitar Version" (tylko NA KOŃCU — „Guitar Man" zostaje)
    tail:/(\S)\s+(?:(?:acoustic|spanish|classical|fingerstyle|instrumental|solo)\s+)*(?:guitars?|gitar\w*)(?:\s+(?:version|cover|arrangement|instrumental|solo|rendition))?\s*$/i,
    queries:(t, a)=>[t+' guitar', t+' acoustic guitar', (t+' '+a).trim()+' guitar'] },
};
export const INSTRUMENT_EMOJI = { piano:'🎹', guitar:'🎸' };
function instrumentOf(name){ return COVER_INSTRUMENTS[name] ? name : 'piano'; }
export const PIANO_TRIES = 6;
export const COVER_TRIES = PIANO_TRIES;
// tytuł wyniku/oryginału do porównania: bez nawiasów, sufiksu „ - …" i dopisków „Piano Version/Cover" („… Guitar")
export function coverTitleKey(title, instrument='piano'){
  const inst=COVER_INSTRUMENTS[instrumentOf(instrument)];
  const t=String(title||'').replace(/\(([^)]*)\)|\[([^\]]*)\]/g,' ').replace(/\s[-–—]\s.*$/,' ').replace(/\s+$/,'')
    .replace(inst.tail, (m, keep)=> typeof keep==='string' ? keep+' ' : ' ');
  return norm(t) || titleKey(title);
}
export function pianoTitleKey(title){ return coverTitleKey(title, 'piano'); }
// polski utwór (iTunes nie ma dla nich coverów instrumentalnych) — znaki typowo polskie w tytule/wykonawcy (bez „ó": hiszp./port.)
export function looksPolish(t){ return /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/.test(String((t && t.track)||'')+' '+String((t && t.artist)||'')); }
/* Czysta: wybierz cover instrumentalny oryginału `orig` ({track, artist}) z wyników wyszukiwania. Pierwszy (najwyżej
 * w wynikach ≈ najpopularniejszy) spełniający: zajawka; tytuł = tytuł oryginału; wykonawca ≠ oryginał; słowo instrumentu
 * (piano/klavier/fortepian | guitar/gitar…/fingerstyle) w tytule/wykonawcy/albumie; bez odrzutów instrumentu. → wynik albo null
 * KOLIZJA TYTUŁÓW (pomiar na żywo: „King" T.Love → cover „King" Florence + the Machine; „Freedom" Wham! → covery
 * „Freedom" Kygo): gdy wyniki NIE zawierają oryginału albo zawierają ten sam tytuł innego wykonawcy wyżej niż oryginał
 * (lub oryginał dopiero od pozycji PIANO_OWN_TOP, a innych wykonawców ≥2 — „Enjoy the Silence" z oryginałem na 3. miejscu
 * i coverami Carli Bruni/Anberlin to NIE kolizja), cover musi mieć DOWÓD — nazwę oryginalnego wykonawcy w tytule/albumie
 * („Piano Tribute to Madonna", „(Originally Performed by …)", „Tribute to Michael Jackson in Spanish Guitar"). */
export const PIANO_OWN_TOP = 5;   // oryginał w top 5 wyników „<tytuł> piano" = tytuł zdominowany przez ten utwór
const COVER_MARK = /\bcover\b|tribute|originally|made famous|in the style|karaoke|instrumental|version|arrang|rendition|lullab|reimagined/i;
/* KONSENSUS (pomiar na żywo, Deezer-only w MP: „Africa" Toto — oryginału nie ma w wynikach „Africa guitar", bo wypełniają je covery):
 * gdy oryginału NIE ma w wynikach, ale też nie ma żadnego konkurującego NIE-coveru o tym tytule (others=0), a ≥ COVER_CONSENSUS
 * RÓŻNYCH wykonawców ma przechodzący wszystkie reguły instrumentu cover tego tytułu — tytuł jest zdominowany przez jeden
 * znany utwór (kilku niezależnych aranżerów nie gra obskurnego „King"), więc dowód z nazwy wykonawcy nie jest wymagany.
 * NIE dotyczy przypadku „oryginał jest, ale inny wykonawca wyżej / dopiero od PIANO_OWN_TOP" („Freedom" Wham!) — tam kolizja
 * to realnie inna piosenka i dowód zostaje wymagany. */
export const COVER_CONSENSUS = 3;
/* tytuł coveru = tytuł oryginału: równy albo literówka/interpunkcja (długość ±1, ≥6 znaków: "Giimme" ≈ "Gimme").
 * textMatch (dla odpowiedzi gracza) jest za luźny na covery: "Creepin'" (inna piosenka) ≈ "Creep" przez zawieranie ≥60%. */
function coverSameTitle(got, want){
  return got===want || (got.length>=6 && want.length>=6 && Math.abs(got.length-want.length)<=1 && textMatch(got, want));
}
function coverAmbiguous(results, want, who, inst, instrument){
  let own=-1; const others=new Set(); let otherFirst=-1; const coverers=new Set();
  (results||[]).forEach((r, idx)=>{
    if(!r || !r.trackName || !r.artistName) return;
    const key=coverTitleKey(r.trackName, instrument);
    if(sameArtist(r.artistName, who) || sameArtist(who, r.artistName)){ if(own<0 && coverSameTitle(key, want)) own=idx; return; }
    if(key!==want) return;
    const text=r.trackName+' \u0001 '+r.artistName+' \u0001 '+(r.collectionName||'');
    if(inst.word.test(text) || COVER_MARK.test(text)){          // inne covery/aranżacje nie świadczą o kolizji
      if(r.previewUrl && inst.word.test(text) && !inst.reject.test(text) && (!inst.strict || inst.strict(r))) coverers.add(artistKey(r.artistName));
      return;
    }
    others.add(artistKey(r.artistName)); if(otherFirst<0) otherFirst=idx;
  });
  if(own<0 && others.size===0 && coverers.size>=COVER_CONSENSUS) return false;
  return own<0 || (otherFirst>=0 && otherFirst<own) || (own>=PIANO_OWN_TOP && others.size>=2);
}
function coverEvidence(r, who){
  const k=artistKey(who); if(!k) return false;
  // norm() obcina nawiasy i „feat." — dowód bywa właśnie w nawiasie („(Originally Performed by Wham!)"), więc najpierw spacje
  const flat=String(r.trackName+' '+(r.collectionName||'')).replace(/[()\[\]]/g,' ').replace(/\s[-–—]\s/g,' ').replace(/\b(?:feat|ft|featuring)\b\.?/gi,' ');
  return (' '+norm(flat)+' ').includes(' '+k+' ');
}
export function pickInstrumentalCover(results, orig, instrument='piano'){
  const name=instrumentOf(instrument), inst=COVER_INSTRUMENTS[name];
  const want=coverTitleKey(orig && orig.track, name), who=String((orig && orig.artist)||'');
  if(!want || !who) return null;
  const ambiguous=coverAmbiguous(results, want, who, inst, name);
  for(const r of (results||[])){
    if(!r || !r.previewUrl || !r.trackName || !r.artistName) continue;
    const text=r.trackName+' \u0001 '+r.artistName+' \u0001 '+(r.collectionName||'');
    if(!inst.word.test(text) || inst.reject.test(text)) continue;
    if(inst.albumOk && !inst.word.test(r.trackName+' \u0001 '+r.artistName) && !inst.albumOk.test(r.collectionName||'')) continue;   // słowo tylko w albumie
    if(inst.strict && !inst.strict(r)) continue;   // gitara: zaostrzone reguły (bez „piosenek z gitarą" z wokalem)
    if(sameArtist(r.artistName, who) || sameArtist(who, r.artistName)) continue;   // oryginał (też „X & Y") — nie cover
    const got=coverTitleKey(r.trackName, name);
    if(!got || !coverSameTitle(got, want)) continue;
    if(ambiguous && !coverEvidence(r, who)) continue;
    return r;
  }
  return null;
}
export function pickPianoCover(results, orig){ return pickInstrumentalCover(results, orig, 'piano'); }
// zapytania o cover (tryb song: bez attribute=artistTerm). Fortepian: „<tytuł> piano", zapas „<tytuł> <wykonawca> piano cover";
// gitara: „<tytuł> guitar", „<tytuł> acoustic guitar", zapas „<tytuł> <wykonawca> guitar"
export function coverQueries(orig, instrument='piano'){
  const strip=x=>String(x||'').replace(/\(([^)]*)\)|\[([^\]]*)\]/g,' ').replace(/\s[-–—]\s.*$/,' ').replace(/\s+(?:feat\.?|ft\.?)\s.*$/i,' ').replace(/\s+/g,' ').trim();
  const t=strip(orig && orig.track), a=strip(orig && orig.artist);
  return t ? COVER_INSTRUMENTS[instrumentOf(instrument)].queries(t, a) : [];
}
export function pianoQueries(orig){ return coverQueries(orig, 'piano'); }
/* Rozwiąż pytanie „cover instrumentalny": oryginał jak w „muzyce" (resolveTrack — popularny, z dekady), potem cover
 * danego instrumentu. Brak coveru → kolejny oryginał (≤ tries; utwory z polskimi znakami pomijane bez zapytania o cover).
 * → { ...oryginał (track, artist, year, album, art), preview (zajawka COVERU), origPreview, coverArtist, coverTrack, instrument }
 * albo { error, reason } (wołający gra wtedy zwykłą „muzykę"). */
export async function resolveInstrumentalCover({ instrument='piano', cat, seen, recent, itunes, rnd=Math.random, capMs=RESOLVE_CAP_MS, tries=COVER_TRIES }){
  const name=instrumentOf(instrument);
  const deadline=Date.now()+capMs;
  let anyResponse=false, emptyTries=0;
  // tani prefiltr: wykonawcy / utwory playlisty z polskimi znakami w nazwie nie mają coverów (oszczędza zapytania)
  const pl=x=>/[ąćęłńśźżĄĆĘŁŃŚŹŻ]/.test(String(x||''));
  const arts=Array.isArray(cat.artists) ? cat.artists.filter(a=>!pl(a)) : [];
  const songs=Array.isArray(cat.songs) ? cat.songs.filter(x=>x && !looksPolish({ track:x.title, artist:x.artist })) : [];
  const pick={ ...cat };
  if(arts.length) pick.artists=arts;
  if(songs.length) pick.songs=songs;
  for(let i=0; i<tries; i++){
    let remaining=deadline-Date.now(); if(remaining<=0) break;
    let t;
    try{ t=await resolveTrack({ cat:pick, seen, recent, itunes, rnd, capMs:remaining }); }catch(_e){ t={ error:true, reason:'offline' }; }
    if(!t || t.error){ if(t && t.reason==='empty') anyResponse=true; break; }
    anyResponse=true;
    if(looksPolish(t)) continue;
    let gotRows=false;
    for(const q of coverQueries(t, name)){
      remaining=deadline-Date.now(); if(remaining<=0) break;
      let res=null;
      try{ res=await withTimeout(Promise.resolve(itunes(q, { song:true })), remaining); }catch(_e){ res=null; }
      if(res && res.length) gotRows=true;
      const c=pickInstrumentalCover(res, t, name);
      if(c) return { ...t, origPreview:t.preview, preview:c.previewUrl, coverArtist:String(c.artistName||'').trim(), coverTrack:String(c.trackName||'').trim(), instrument:name };
    }
    /* limit Deezera (HTTP 200 + {"error":{"code":4,"message":"Quota limit exceeded"}} → server/lib/sources.js widzi to jak PUSTĄ listę)
     * albo iTunes 429: gdy KOLEJNE 2 oryginały nie dały ŻADNEGO wiersza ze wszystkich zapytań o cover, to nie brak coverów,
     * tylko brak źródła — nie mnożymy zapytań (do COVER_TRIES × 3), wołający gra zwykłą „muzykę". */
    emptyTries = gotRows ? 0 : emptyTries+1;
    if(emptyTries>=2) break;
  }
  return { error:true, reason: anyResponse ? 'empty' : 'offline' };
}
export function resolvePiano(args){ return resolveInstrumentalCover({ ...args, instrument:'piano' }); }
export function resolveGuitar(args){ return resolveInstrumentalCover({ ...args, instrument:'guitar' }); }

/* jedno wejście: rozwiąż grywalny utwór dla kategorii (playlista vs pula wykonawców).
 * `itunes(term, opts) → Promise<results[]>` wstrzyknięty przez warstwę sieci (web/serwer).
 * F8b: `rnd` (opcjonalny) — seedowany PRNG: kolejność wykonawców/utworów playlisty i ważony wybór utworu.
 * Ograniczenie: determinizm tylko przy tych samych wynikach iTunes (inny kraj/proxy→Deezer/zmiana katalogu)
 * i bez przekroczenia capu czasu (wolna sieć może przerwać kaskadę wcześniej). */
export function resolveTrack({cat, seen, recent, itunes, capMs, rnd}){
  const r = typeof rnd==='function' ? rnd : Math.random;
  if((!cat.artists || !cat.artists.length) && cat.songs && cat.songs.length){
    return resolveFromSongs(cat, seen, itunes, capMs, r);
  }
  return resolveFromArtists(cat, seen, recent, itunes, capMs, r);
}
