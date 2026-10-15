/* core/trackSelect.js — czysty wybór grywalnego utworu (zero DOM/sieci/CORS).
 * Współdzielone web↔serwer: ta sama logika selekcji (filtr coverów/karaoke, wersji
 * live/remix, dekady, popularności, anty-powtórki, dopasowanie artysty) działa w przeglądarce
 * (adapters-web/itunesRepository.js — fetch/JSONP/proxy) i na Workerze/DO
 * (server/lib/resolve.js — bezpośredni fetch bez CORS). Sieć wstrzykiwana jako
 * `itunes(term, opts) → Promise<results[]>` (opts.song=true → wyszukiwanie „artysta tytuł"
 * BEZ attribute=artistTerm), więc moduł nie zna `window` ani `fetch`. */
import { shuffle } from './util.js';
import { norm, textMatch } from './scoring.js';

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
  for(let level=0; level<4; level++) if(buckets[level].length) return { level, list:buckets[level] };
  return { level:-1, list:[] };
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
    art:(t.artworkUrl100||'').replace('100x100','300x300') };
}

/* ---------- F5 #6: cache wyników per zapytanie w obrębie sesji ----------
 * Czysty memoizer wstrzykiwanego fetchera (zero sieci): trzyma OBIETNICĘ (współbieżne zapytania
 * o tego samego artystę = 1 żądanie), nie cache'uje błędów ani pustych wyników (bywają chwilowe),
 * TTL + limit wpisów (LRU przez kolejność Map). */
export function cachedFetcher(fn, { ttlMs=30*60*1000, max=200, pendingMs=30000, now=()=>Date.now() }={}){
  const cache=new Map();
  const wrapped=(term, opts)=>{
    const key=(opts && opts.song ? 's:' : 'a:')+String(term||'').toLowerCase().trim();
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
export function matchSong(results, s){
  const hits=(results||[]).map((r,idx)=>({r,idx})).filter(({r})=>r && r.previewUrl &&
    textMatch(r.trackName, s.title) && (sameArtist(r.artistName, s.artist) || textMatch(r.artistName, s.artist)));
  if(!hits.length) return null;
  hits.sort((a,b)=> (versionTier(a.r)-versionTier(b.r)) || (a.idx-b.idx));   // studyjna > remaster > live; potem popularność
  return hits[0].r;
}
async function resolveFromSongs(cat, seen, itunes, capMs=RESOLVE_CAP_MS, rnd=Math.random){
  let pool=(cat.songs||[]).filter(s=>!seen.has(norm(s.title)));
  if(!pool.length){ (cat.songs||[]).forEach(s=>seen.delete(norm(s.title))); pool=(cat.songs||[]).slice(); }
  const deadline=Date.now()+capMs;
  let anyResponse=false;
  for(const s of shuffle(pool, rnd)){
    let preview=s.preview||'', art='';
    if(!preview){
      for(const [term, opts] of [[songQuery(s), {song:true}], [s.artist, undefined]]){
        const remaining=deadline-Date.now(); if(remaining<=0) break;
        try{
          const res=await withTimeout(Promise.resolve(itunes(term, opts)), remaining); anyResponse=true;
          const t=matchSong(res, s);
          if(t){ preview=t.previewUrl; art=(t.artworkUrl100||'').replace('100x100','300x300'); break; }
        }catch(e){ /* błąd/timeout — następny wariant */ }
      }
    }
    if(preview){ seen.add(norm(s.title));
      const t={ track:s.title, artist:s.artist, year:s.year||'', album:s.album||'', preview, art };
      if(s.year) t.yearSrc='data';   // F8a: rok z danych playlisty (kuratorowany), nie z iTunes
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

/* ---------- F8a: tryb „abcd" — dystraktory (szybkie ABCD dla muzyki) ----------
 * Tytuł do kafla: bez „ozdobników" wersji (remaster/feat./radio edit/„from …") — wszystkie kafle wyglądają
 * jednakowo (poprawna odpowiedź nie wyróżnia się „(2011 Remaster)"). */
export function displayTitle(title){
  const t=String(title||'').trim();
  const cleaned=t.replace(/\s*[(\[]([^)\]]*)[)\]]/g,(m,inner)=> (BENIGN.test(inner.trim()) || REMASTER.test(inner)) ? '' : m)
    .replace(/\s[-–]\s(.+)$/,(m,suf)=> (BENIGN.test(suf.trim()) || REMASTER.test(suf)) ? '' : m)
    .replace(/\s+/g,' ').trim();
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
