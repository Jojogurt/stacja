/* core/taste.js — „Twój gust" (etap 1): czysty model ocen utworów + dobór sesji „Oceń 20 utworów".
 * Zero DOM / sieci / localStorage — magazyn ocen to zwykły obiekt { [trackKey]: ocena }, zapis/sieć robi app/taste.js.
 * Współdzielone klient↔serwer: trackKey + sanitizeRating (server/lib/api.js — /api/taste) — jedno źródło reguł.
 *
 * Ocena: { trackKey, title, artist, year, genre, art, cat, rating: -1 | 1 | 2, source: 'swipe'|'reveal', ts }
 *   ❤️ = 2 (trafia na „Moją półkę"), 👍 = 1, 👎 = -1.
 * Usunięcie (zdjęcie z półki / cofnięcie oceny) = NAGROBEK { trackKey, rating:0, ts } — żeby synchronizacja
 * last-write-wins nie „wskrzesiła" oceny z serwera; nagrobek znika, gdy serwer już nie ma klucza.
 * Flaga `syn` = wpis potwierdzony przez serwer (brak na serwerze + syn → usunięty na innym urządzeniu). */
import { norm } from './scoring.js';
import { displayTitle, titleKey, parseRange } from './trackSelect.js';
import { shuffle } from './util.js';

export const RATING = { DOWN:-1, UP:1, HEART:2 };
export const RATING_VALUES = [-1, 1, 2];
export const TASTE_MAX = 2000;          // limit ocen na profil (klient i serwer)
export const TASTE_BATCH = 50;          // max ocen w jednym POST /api/taste
export const SESSION_N = 20;            // długość sesji „Oceń 20 utworów"
export const SESSION_SPARE = 12;        // zapas planu (utwór bez zajawki / już oceniony → następny kandydat)
export const KEY_MAX = 200;

const clip = (v, n) => (typeof v==='string' ? v : (typeof v==='number' ? String(v) : '')).replace(/\s+/g,' ').trim().slice(0, n);

/* klucz utworu: norm(wykonawca) | norm(tytuł bez ozdobników wydania) — „Song (2011 Remaster)" ≡ „Song" */
export function trackKey(artist, title){
  const a=norm(clip(artist, 200)), t=norm(displayTitle(clip(title, 200)));
  return a && t ? (a+'|'+t).slice(0, KEY_MAX) : '';
}
export const isTrackKey = k => typeof k==='string' && k.length>0 && k.length<=KEY_MAX && /^[a-z0-9 ]+\|[a-z0-9 ]+$/.test(k);

/* sanityzacja oceny z sieci / localStorage / UI → ocena albo null. Klucz LICZONY z artysta+tytuł (nie ufamy
 * przysłanemu), rok 4 cyfry, okładka tylko https, kategoria [a-z0-9:_-], ts w ms (przyszłość > doba → teraz). */
export function sanitizeRating(r, now=Date.now()){
  if(!r || typeof r!=='object') return null;
  const title=clip(r.title, 200), artist=clip(r.artist, 200);
  const key=trackKey(artist, title); if(!key) return null;
  const rating=Number(r.rating); if(!RATING_VALUES.includes(rating)) return null;
  const y=clip(r.year, 10).slice(0, 4), year=/^(1[89]|20)\d{2}$/.test(y) ? y : '';
  const art0=clip(r.art, 500), art=/^https:\/\/[^\s"'<>\\]+$/.test(art0) ? art0 : '';
  const cat0=clip(r.cat, 64), cat=/^[a-z0-9:_-]+$/i.test(cat0) ? cat0 : '';
  let ts=Math.floor(Number(r.ts)); if(!Number.isFinite(ts) || ts<=0 || ts>now+86400000) ts=now;
  return { trackKey:key, title, artist, year, genre:clip(r.genre, 60), art, cat, rating, source: r.source==='reveal' ? 'reveal' : 'swipe', ts };
}
const tomb = (key, ts) => ({ trackKey:key, rating:0, ts });
const isTomb = it => !!it && it.rating===0;

/* magazyn z JSON (localStorage) → bezpieczny obiekt; zachowuje nagrobki i flagę syn */
export function parseStore(raw, now=Date.now()){
  let o=raw; if(typeof raw==='string'){ try{ o=JSON.parse(raw); }catch(_e){ o=null; } }
  const out={};
  if(!o || typeof o!=='object' || Array.isArray(o)) return out;
  for(const k of Object.keys(o)){
    const it=o[k]; if(!it || typeof it!=='object') continue;
    if(it.rating===0){ if(isTrackKey(k)) out[k]={ ...tomb(k, Math.floor(Number(it.ts))||now), ...(it.syn?{syn:true}:{}) }; continue; }
    const s=sanitizeRating(it, now); if(!s) continue;
    out[s.trackKey]= it.syn ? { ...s, syn:true } : s;
  }
  return capStore(out);
}

export const activeRatings = store => Object.values(store||{}).filter(it=>it && !isTomb(it));
export const ratingOf = (store, key) => { const it=store && store[key]; return it && !isTomb(it) ? it.rating : 0; };

/* ocena utworu (UI: sesja / ❤️ w odsłonie) → { store, item } (nowy obiekt; wejście nietknięte) */
export function rate(store, track, rating, { source='swipe', now=Date.now() }={}){
  const item=sanitizeRating({ ...track, title:track && (track.title!=null ? track.title : track.track), rating, source, ts:now }, now);
  if(!item) return { store, item:null };
  const next={ ...store }; delete next[item.trackKey];
  next[item.trackKey]=item;
  return { store:capStore(next), item };
}
// cofnij ocenę / zdejmij z półki → nagrobek
export function unrate(store, key, { now=Date.now() }={}){
  if(!store || !store[key] || isTomb(store[key])) return { store, changed:false };
  const next={ ...store }; next[key]=tomb(key, now);
  return { store:next, changed:true };
}
// ❤️ toggle: jest na półce → zdejmij (nagrobek); nie ma → ocena 2
export function toggleHeart(store, track, { source='reveal', now=Date.now() }={}){
  const key=trackKey(track && track.artist, track && (track.title!=null ? track.title : track.track));
  if(!key) return { store, on:false, key:'' };
  if(ratingOf(store, key)===2) return { store:unrate(store, key, { now }).store, on:false, key };
  const r=rate(store, track, 2, { source, now });
  return { store:r.store, on:!!r.item, key };
}

/* limit: ponad `max` aktywnych ocen → najpierw najstarsze 👍/👎, potem najstarsze ❤️ (półka chroniona najdłużej) */
export function capStore(store, max=TASTE_MAX){
  const act=activeRatings(store);
  if(act.length<=max) return store;
  const drop=act.slice().sort((a,b)=> ((a.rating===2)-(b.rating===2)) || (a.ts-b.ts)).slice(0, act.length-max);
  const next={ ...store }; drop.forEach(it=>{ delete next[it.trackKey]; });
  return next;
}

export function tasteCounts(store){
  const act=activeRatings(store);
  return { total:act.length, hearts:act.filter(x=>x.rating===2).length, up:act.filter(x=>x.rating===1).length, down:act.filter(x=>x.rating===-1).length };
}
/* półka (❤️) posortowana: 'recent' (najnowsze), 'artist' (A→Z, potem tytuł), 'year' (najstarsze; bez roku na końcu) */
export const SHELF_SORTS = ['recent', 'artist', 'year'];
export function shelfItems(store, sort='recent'){
  const items=activeRatings(store).filter(x=>x.rating===2);
  const cmp=(a,b)=>String(a).localeCompare(String(b), 'pl', { sensitivity:'base' });
  if(sort==='artist') return items.sort((a,b)=> cmp(a.artist,b.artist) || cmp(a.title,b.title));
  if(sort==='year') return items.sort((a,b)=> ((+a.year||9999)-(+b.year||9999)) || cmp(a.artist,b.artist));
  return items.sort((a,b)=> b.ts-a.ts);
}

/* ---------- synchronizacja z serwerem (last-write-wins po ts) ----------
 * local = magazyn, server = lista ocen z GET /api/taste. Zwraca nowy magazyn + co wysłać (push: oceny) i co
 * skasować (del: klucze). Reguły: nowszy ts wygrywa; lokalny wpis bez `syn` i bez odpowiednika na serwerze =
 * jeszcze nie wysłany → push; z `syn` = skasowany na innym urządzeniu → usuń; nagrobek bez wpisu na serwerze → usuń. */
export function mergeTaste(local, server, now=Date.now()){
  const store={ ...(local||{}) }, push=[], del=[];
  const seen=new Set();
  for(const raw of (Array.isArray(server) ? server : [])){
    const s=sanitizeRating(raw, now); if(!s || seen.has(s.trackKey)) continue;
    seen.add(s.trackKey);
    const l=store[s.trackKey];
    if(!l || s.ts>l.ts){ store[s.trackKey]={ ...s, syn:true }; continue; }
    if(l.ts>s.ts){ if(isTomb(l)) del.push(s.trackKey); else push.push(stripSyn(l)); continue; }
    if(isTomb(l)) del.push(s.trackKey); else store[s.trackKey]={ ...l, syn:true };   // remis ts
  }
  for(const k of Object.keys(store)){
    if(seen.has(k)) continue;
    const l=store[k];
    if(isTomb(l) || l.syn){ delete store[k]; continue; }
    push.push(stripSyn(l));
  }
  return { store:capStore(store), push, del };
}
const stripSyn = it => { const { syn, ...rest }=it; return rest; };
// po udanym POST: oznacz wysłane (o ile od tamtej pory nie zmienione — ten sam ts)
export function markSynced(store, items){
  const next={ ...store };
  (items||[]).forEach(it=>{ const l=next[it.trackKey]; if(l && !isTomb(l) && l.ts===it.ts) next[it.trackKey]={ ...l, syn:true }; });
  return next;
}
// po udanym DELETE: nagrobek (o ile nadal nagrobek) znika
export function dropTombs(store, keys){
  const next={ ...store };
  (keys||[]).forEach(k=>{ if(isTomb(next[k])) delete next[k]; });
  return next;
}
export function batches(list, n=TASTE_BATCH){ const out=[]; for(let i=0;i<(list||[]).length;i+=n) out.push(list.slice(i, i+n)); return out; }

/* ---------- gatunki: grupy (iTunes primaryGenreName / kategoria) ---------- */
export const GENRE_GROUPS = ['pop', 'rock', 'metal', 'hiphop', 'dance', 'inne'];
export const GENRE_LABEL = { pop:'pop', rock:'rock', metal:'metal', hiphop:'rap / R&B', dance:'dance / disco', inne:'inne' };
export function genreGroup(genre){
  const g=String(genre||'').toLowerCase();
  if(!g) return '';
  if(/metal/.test(g)) return 'metal';
  if(/hip.?hop|rap|r&b|soul|funk/.test(g)) return 'hiphop';
  if(/dance|electro|house|techno|trance|disco|edm/.test(g)) return 'dance';
  if(/rock|alternat|punk|grunge|indie/.test(g)) return 'rock';
  if(/pop/.test(g)) return 'pop';
  return 'inne';
}
// grupa z klucza/etykiety kategorii (categories.js / playlists.js); dekady → ''
export function catGroup(key, label){
  const s=(String(key||'')+' '+String(label||'')).toLowerCase();
  if(/metal/.test(s)) return 'metal';
  if(/rap|hip/.test(s)) return 'hiphop';
  if(/dance|disco|euro/.test(s)) return 'dance';
  if(/rock|unplugged|akustycz/.test(s)) return 'rock';
  if(/pop|hity|hits|evergreen|top/.test(s)) return 'pop';
  if(/film|gry|soundtrack/.test(s)) return 'inne';
  return '';
}
// dekada z roku → 1960, 1980… ('' gdy brak / sprzed 1950)
export function decadeOf(year){
  const y=parseInt(String(year||'').slice(0,4), 10);
  return Number.isFinite(y) && y>=1950 && y<=2099 ? String(Math.floor(y/10)*10) : '';
}
function catDecade(cat){
  const r=parseRange(cat && cat.range);
  return r && (r.to-r.from<=10 || r.to===9999) ? decadeOf(r.from) : '';   // „2020–" (otwarta) → 2020
}

/* ---------- kandydaci do sesji z kategorii (categories.js / playlists.js) ----------
 * cats: { klucz: kategoria } (dekady / style / playlisty; quiz/lyrics pomijane). Kandydat = wykonawca z kategorii
 * (dekada z zakresu kategorii; grupa z kategorii-stylu, w której też występuje) albo utwór playlisty (dekada z roku).
 * Wyjście: [{ cat, artist, title?, year?, decade, group }] bez duplikatów wykonawca/utwór. */
export function tasteCandidates(cats){
  const entries=Object.entries(cats||{}).filter(([k,c])=>c && typeof c==='object' && c.kind!=='quiz' && c.kind!=='lyrics');
  const akey=a=>norm(a);
  const groupOf=new Map(), decadesOf=new Map();
  for(const [k,c] of entries){
    const g=catGroup(k, c.label), d=catDecade(c);
    for(const a of (Array.isArray(c.artists) ? c.artists : [])){
      if(typeof a!=='string' || !a.trim()) continue;
      if(g && !groupOf.has(akey(a))) groupOf.set(akey(a), g);
      if(d){ const s=decadesOf.get(akey(a))||new Set(); s.add(d); decadesOf.set(akey(a), s); }
    }
  }
  const out=[], dedup=new Set();
  for(const [k,c] of entries){
    const g=catGroup(k, c.label), d=catDecade(c);
    for(const a of (Array.isArray(c.artists) ? c.artists : [])){
      if(typeof a!=='string' || !a.trim()) continue;
      const id=akey(a); if(!id || dedup.has(id)) continue; dedup.add(id);
      const ds=decadesOf.get(id);
      out.push({ cat:k, artist:a.trim(), decade: d || (ds && ds.size===1 ? [...ds][0] : ''), group: g || groupOf.get(id) || '' });
    }
    for(const s of (Array.isArray(c.songs) ? c.songs : [])){
      if(!s || typeof s.title!=='string' || typeof s.artist!=='string' || s.match) continue;   // `match` (wersje akustyczne) — nie do gustu
      const tk=trackKey(s.artist, s.title); if(!tk || dedup.has(tk)) continue; dedup.add(tk);
      out.push({ cat:k, artist:s.artist, title:s.title, year:String(s.year||''), decade: decadeOf(s.year) || d, group: g || groupOf.get(akey(s.artist)) || '' });
    }
  }
  return out;
}

// tytuły już ocenione u danego wykonawcy → `seen` dla resolveTrack (nie proponuj ocenionego utworu)
export function seenForArtist(store, artist){
  const a=norm(artist), seen=new Set();
  activeRatings(store).forEach(it=>{ if(norm(it.artist)===a){ seen.add(norm(it.title)); seen.add(titleKey(it.title)); } });
  return seen;
}

/* ---------- dobór sesji „Oceń 20 utworów" ----------
 * Zachłannie, kandydat po kandydacie: kara za komórkę dekada×grupa już obecną W SESJI (różnorodność: najpierw
 * pokrycie dekad i gatunków), plus kara proporcjonalna do UDZIAŁU tej dekady/grupy w dotychczasowych ocenach
 * (adaptacja: preferuj to, czego profil ma najmniej), plus kara za powtórkę wykonawcy (sesja ≫ profil).
 * Utwory playlist już ocenione są pomijane; wykonawców filtruje dodatkowo `seen` przy rozwiązaniu (resolveTrack).
 * rnd — wstrzykiwany PRNG (testy deterministyczne). Wyjście: plan [kandydat…] długości ≤ n+spare (kolejność = priorytet). */
export function pickTasteSession(pool, ratings, rnd=Math.random, { n=SESSION_N, spare=SESSION_SPARE }={}){
  const act=Array.isArray(ratings) ? ratings.filter(x=>x && x.rating) : activeRatings(ratings);
  const rated=new Set(act.map(x=>x.trackKey));
  const profD={}, profG={}, profA={};
  act.forEach(x=>{
    const d=decadeOf(x.year), g=genreGroup(x.genre) || catGroup(x.cat, '');
    if(d) profD[d]=(profD[d]||0)+1;
    if(g) profG[g]=(profG[g]||0)+1;
    const a=norm(x.artist); profA[a]=(profA[a]||0)+1;
  });
  const total=Math.max(1, act.length);
  let cands=shuffle((pool||[]).filter(c=>c && c.artist && !(c.title && rated.has(trackKey(c.artist, c.title)))), rnd);
  const dKeys=new Set(cands.map(c=>c.decade).filter(Boolean)), gKeys=new Set(cands.map(c=>c.group).filter(Boolean));
  const avgD=act.length ? 1/Math.max(1, dKeys.size) : 0, avgG=act.length ? 1/Math.max(1, gKeys.size) : 0;
  const shareD=d=> d ? (profD[d]||0)/total : avgD, shareG=g=> g ? (profG[g]||0)/total : avgG;
  const sessD={}, sessG={}, sessA={}, sessCell={};
  const plan=[];
  const want=Math.max(0, n+spare);
  while(plan.length<want && cands.length){
    let best=-1, bestS=Infinity;
    for(let i=0;i<cands.length;i++){
      const c=cands[i], a=norm(c.artist), d=c.decade||'?', g=c.group||'?';
      const s = 4*(sessD[d]||0)*(c.decade?1:0.6) + 4*(sessG[g]||0)*(c.group?1:0.6) + 3*(sessCell[d+'|'+g]||0)
        + 12*(shareD(c.decade)+shareG(c.group))
        + 25*(sessA[a]||0) + 0.4*Math.min(5, profA[a]||0)
        + (c.decade?0:1.5) + (c.group?0:1.5)          // kandydat z pełnym opisem (dekada + grupa) lepiej pokrywa siatkę
        + rnd()*1.2;
      if(s<bestS){ bestS=s; best=i; }
    }
    const c=cands.splice(best, 1)[0], a=norm(c.artist), d=c.decade||'?', g=c.group||'?';
    sessD[d]=(sessD[d]||0)+1; sessG[g]=(sessG[g]||0)+1; sessA[a]=(sessA[a]||0)+1; sessCell[d+'|'+g]=(sessCell[d+'|'+g]||0)+1;
    plan.push({ ...c });
  }
  return plan;
}
// kandydat z planu → kategoria do resolveTrack (utwór playlisty → songs[], wykonawca → artists[] + zakres dekady)
export function planCat(c, cats){
  if(c && c.title) return { songs:[{ title:c.title, artist:c.artist, year:c.year||'' }] };
  const src=cats && c && cats[c.cat];
  return { artists:[c.artist], ...(src && src.range ? { range:src.range } : {}) };
}
