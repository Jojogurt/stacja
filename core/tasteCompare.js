/* core/tasteCompare.js — „Twój gust" (etap 3): porównanie gustu ze znajomym + pule „półki" do gry (solo i MP „Gust stołu").
 * Czysta logika (zero DOM / sieci / localStorage) — wspólna klient ↔ serwer (server/lib/api.js: kształt ocen znajomego,
 * server/authorityRoom.js: sanityzacja półek graczy i pula „Gust stołu").
 *
 * ZGODNOŚĆ (0–100) = 100 × (0.6 × wektory + 0.4 × wspólne):
 *   wektory  = średnia cosinusów wektorów GATUNKÓW i DEKAD z core/tasteProfile (udziały polubień; = cosinus konkatenacji
 *              obu wektorów znormalizowanych osobno). Brak danych po jednej stronie w danym wektorze → liczy się drugi.
 *   wspólne  = Jaccard na utworach polubionych (ocena ≥ 1) obu stron, przeskalowany: J ≥ JACCARD_FULL (30% wspólnych)
 *              = pełne 100%. Wygładzenie dla małych zbiorów: w = |A∪B| / (|A∪B| + SMOOTH_K) — przy kilku polubieniach
 *              składowa ciąży ku podobieństwu wektorów (przypadkowy brak wspólnych tytułów nie zeruje wyniku),
 *              przy dużych zbiorach liczy się już faktyczny Jaccard.
 * Wymagane ≥ COMPARE_MIN ocen po OBU stronach (i ≥ 1 polubienie) — inaczej `enough:false` („za mało danych"). */
import { activeRatings, sanitizeRating, trackKey, isTrackKey, TASTE_MAX } from './taste.js';
import { buildTasteProfile, DECADES, PROFILE_GENRES, DECADE_LONG, GENRE_SHORT } from './tasteProfile.js';
import { norm } from './scoring.js';
import { clipText } from './util.js';

export const W_VECTOR = 0.6, W_COMMON = 0.4;
export const COMPARE_MIN = 10;          // min. ocen po każdej stronie
export const JACCARD_FULL = 0.3;        // Jaccard, przy którym składowa „wspólne" = 100%
export const SMOOTH_K = 12;             // wygładzenie Jaccarda (pseudo-liczność)
export const DIFF_MIN = 0.12;           // min. różnica udziałów (12 p.p.), by pokazać „różnicie się w"
export const LIST_MAX = 30;             // długość list wspólnych / rekomendacji

/* ---------- kształt ocen znajomego z API (bez ts/source — tylko to, czego potrzebuje porównanie i lista) ---------- */
export function publicRating(r){
  if(!r || typeof r!=='object') return null;
  const rating=Number(r.rating); if(![-1, 1, 2].includes(rating)) return null;
  return { title:String(r.title||''), artist:String(r.artist||''), year:String(r.year||''), genre:String(r.genre||''),
    art:String(r.art||''), cat:String(r.cat||''), rating };
}
// oceny znajomego z sieci → zsanityzowana lista (jak własne; klucz liczony z wykonawcy+tytułu; ≤ TASTE_MAX; bez duplikatów)
export function sanitizeFriendRatings(items, now=Date.now()){
  const out=[], seen=new Set();
  for(const raw of (Array.isArray(items) ? items : []).slice(0, TASTE_MAX)){
    const s=sanitizeRating({ ...(raw && typeof raw==='object' ? raw : {}), ts:1, source:'swipe' }, now);
    if(!s || seen.has(s.trackKey)) continue;
    seen.add(s.trackKey);
    const { ts, source, ...rest }=s;
    out.push(rest);
  }
  return out;
}

const list = src => (Array.isArray(src) ? src : activeRatings(src)).filter(x=>x && [-1, 1, 2].includes(x.rating) && x.trackKey);
const liked = arr => new Map(arr.filter(x=>x.rating>=1).map(x=>[x.trackKey, x]));

export function cosine(a, b){
  let dot=0, na=0, nb=0;
  for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  if(!na || !nb) return null;
  return Math.max(0, Math.min(1, dot/Math.sqrt(na*nb)));
}
const shares = v => v.map(x=>x.share);
const pct = x => x==null ? null : Math.round(x*100);

/* werdykt słowny wg przedziału (żartobliwie, bez obrażania) — od najwyższego progu */
export const VERDICTS = [
  { min:85, emoji:'💞', name:'Bratnie dusze', desc:'Moglibyście dzielić jedne słuchawki do końca świata.' },
  { min:70, emoji:'💃', name:'Wspólny parkiet', desc:'Na imprezie zgodzicie się co do playlisty bez kłótni.' },
  { min:55, emoji:'🎶', name:'Zgrany duet', desc:'Sporo wspólnych nut — a różnice tylko urozmaicają trasę.' },
  { min:40, emoji:'🤝', name:'Lubicie się mimo wszystko', desc:'Muzycznie inne światy, ale w aucie jakoś się dogadacie.' },
  { min:25, emoji:'📻', name:'Różne stacje, jedna częstotliwość', desc:'Każde słucha czego innego — tym ciekawiej wymieniać się odkryciami.' },
  { min:0,  emoji:'🧲', name:'Przeciwieństwa się przyciągają', desc:'Zupełnie inne gusta — idealna okazja, żeby pokazać sobie nowe brzmienia.' },
];
export const verdictFor = score => VERDICTS.find(v=>score>=v.min) || VERDICTS[VERDICTS.length-1];

/* składowe do wyjaśnienia: „gatunki 82% · dekady 64% · wspólne utwory 12" */
export function explainParts(parts){
  if(!parts) return '';
  const out=[];
  if(parts.genres!=null) out.push(`gatunki ${parts.genres}%`);
  if(parts.decades!=null) out.push(`dekady ${parts.decades}%`);
  out.push(`wspólne utwory ${parts.common}`);
  return out.join(' · ');
}

/* ---------- porównanie ----------
 * mine: magazyn ocen (core/taste) albo lista; theirs: lista ocen znajomego (sanitizeFriendRatings).
 * Wynik: { enough, need, counts, score, verdict, parts, shared, recs, diffs }. Listy liczone zawsze (także przy
 * „za mało danych" — rekomendacje mają sens od pierwszej oceny znajomego). */
export function compareTaste(mine, theirs, { cats={}, min=COMPARE_MIN }={}){
  const A=list(mine), B=list(theirs);
  const pa=buildTasteProfile(A, { cats }), pb=buildTasteProfile(B, { cats });
  const cosG=cosine(shares(pa.genres), shares(pb.genres)), cosD=cosine(shares(pa.decades), shares(pb.decades));
  const vs=[cosG, cosD].filter(x=>x!=null);
  const vec=vs.length ? vs.reduce((a,b)=>a+b, 0)/vs.length : 0;
  const la=liked(A), lb=liked(B);
  let inter=0; for(const k of la.keys()) if(lb.has(k)) inter++;
  const union=la.size+lb.size-inter;
  const jac=union ? inter/union : 0;
  const w=union/(union+SMOOTH_K);
  const common=w*Math.min(1, jac/JACCARD_FULL) + (1-w)*vec;
  const enough=pa.total>=min && pb.total>=min && pa.liked>0 && pb.liked>0;
  const score=enough ? Math.round(100*(W_VECTOR*vec + W_COMMON*common)) : null;
  const parts={ genres:pct(cosG), decades:pct(cosD), vector:pct(vec), common:inter, commonPct:pct(common), jaccard:pct(jac) };
  return {
    enough, need:{ me:Math.max(0, min-pa.total), them:Math.max(0, min-pb.total), likedMe:pa.liked>0, likedThem:pb.liked>0 },
    counts:{ me:pa.total, them:pb.total, likedMe:pa.liked, likedThem:pb.liked },
    score, verdict: enough ? verdictFor(score) : null, parts, explain: enough ? explainParts(parts) : '',
    shared:sharedFavorites(A, B), recs:recommendations(A, B), diffs: enough ? differences(pa, pb) : [],
  };
}
const cmpTitle = (a, b) => String(a.artist).localeCompare(String(b.artist), 'pl', { sensitivity:'base' }) || String(a.title).localeCompare(String(b.title), 'pl', { sensitivity:'base' });
const pub = it => ({ trackKey:it.trackKey, title:it.title, artist:it.artist, year:it.year||'', genre:it.genre||'', art:it.art||'', cat:it.cat||'' });

/* wspólne ulubione: oboje ❤️/👍 — najpierw podwójne ❤️ */
export function sharedFavorites(mine, theirs, n=LIST_MAX){
  const la=liked(list(mine)), out=[];
  for(const it of liked(list(theirs)).values()){
    const m=la.get(it.trackKey); if(!m) continue;
    out.push({ ...pub(it), mine:m.rating, theirs:it.rating });
  }
  return out.sort((a,b)=> ((b.mine+b.theirs)-(a.mine+a.theirs)) || cmpTitle(a, b)).slice(0, n);
}
/* „znajomy lubi, ty nie oceniłeś": wg jego oceny (❤️ przed 👍), potem wykonawcy, których już lubisz */
export function recommendations(mine, theirs, n=LIST_MAX){
  const A=list(mine), rated=new Set(A.map(x=>x.trackKey));
  const myArtists=new Set(A.filter(x=>x.rating>=1).map(x=>norm(x.artist)));
  return [...liked(list(theirs)).values()].filter(it=>!rated.has(it.trackKey))
    .map(it=>({ ...pub(it), theirs:it.rating, knownArtist:myArtists.has(norm(it.artist)) }))
    .sort((a,b)=> (b.theirs-a.theirs) || ((b.knownArtist?1:0)-(a.knownArtist?1:0)) || cmpTitle(a, b)).slice(0, n);
}
/* „różnicie się w": największe rozbieżności udziałów gatunków/dekad (≥ DIFF_MIN), max 3 */
export function differences(pa, pb, n=3){
  const rows=[];
  const add=(kind, keys, va, vb, label)=>keys.forEach((k,i)=>{
    const a=va[i].share, b=vb[i].share, d=a-b;
    if(Math.abs(d)>=DIFF_MIN) rows.push({ kind, key:k, label:label[k], me:va[i].pct, them:vb[i].pct, diff:Math.round(d*100) });
  });
  add('genre', PROFILE_GENRES, pa.genres, pb.genres, GENRE_SHORT);
  add('decade', DECADES, pa.decades, pb.decades, DECADE_LONG);
  return rows.sort((x,y)=> Math.abs(y.diff)-Math.abs(x.diff)).slice(0, n);
}

/* ---------- „Zagraj z półki" (solo) ----------
 * Pula songs[] z polubionych (❤️ najpierw, potem 👍), bez duplikatów; ≥ SHELF_PLAY_MIN utworów, inaczej gra niedostępna. */
export const SHELF_PLAY_MIN = 8, SHELF_PLAY_MAX = 60;
export const SHELF_QUESTIONS = 10;
export function shelfSongs(src, { max=SHELF_PLAY_MAX }={}){
  const seen=new Set(), out=[];
  const arr=list(src).filter(x=>x.rating>=1).sort((a,b)=> (b.rating-a.rating) || ((b.ts||0)-(a.ts||0)) || cmpTitle(a, b));
  for(const it of arr){
    if(seen.has(it.trackKey)) continue; seen.add(it.trackKey);
    const s={ title:it.title, artist:it.artist };
    if(/^\d{4}$/.test(String(it.year||''))) s.year=String(it.year);
    out.push(s);
    if(out.length>=max) break;
  }
  return out;
}
export const canPlayShelf = src => shelfSongs(src).length>=SHELF_PLAY_MIN;
// tymczasowa kategoria „Półka <ksywa>" (NIE zapisywana na stałe — żyje w ALL_CATS do końca sesji)
export function shelfCategory(name, songs, { label='' }={}){
  const who=clipText(name, 32) || 'znajomego';
  return { label:clipText(label, 48) || 'Półka '+who, kind:'playlist', temp:true, desc:songs.length+' utw. z półki', songs:songs.slice() };
}

/* ---------- MP „🎧 Gust stołu" ----------
 * Każdy klient (≥ TABLE_MIN_HEARTS ❤️ i gust nieukryty) wysyła top TABLE_SHELF_MAX ❤️ (najnowsze) jako {title, artist, year}.
 * Serwer (autorytet) sanityzuje (sanitizeTableShelf), trzyma półki obecnych graczy i przy starcie składa pulę
 * (buildTablePool): po kolei od każdego gracza (sprawiedliwie), duplikaty łączone („z półki: Ola, Kuba"). */
export const TABLE_KEY = 'gust-stolu';
export const TABLE_LABEL = '🎧 Gust stołu';
export const TABLE_SHELF_MAX = 20, TABLE_MIN_HEARTS = 5, TABLE_MIN_SONGS = 8, TABLE_POOL_MAX = 120;
const TEXT_MAX = 200, FROM_MAX = 80;
export function tableShelfPayload(src, { visibility='friends' }={}){
  if(visibility==='hidden') return null;
  const hearts=list(src).filter(x=>x.rating===2).sort((a,b)=> ((b.ts||0)-(a.ts||0)) || cmpTitle(a, b));
  if(hearts.length<TABLE_MIN_HEARTS) return null;
  return hearts.slice(0, TABLE_SHELF_MAX).map(it=>{
    const s={ title:it.title, artist:it.artist };
    if(/^\d{4}$/.test(String(it.year||''))) s.year=String(it.year);
    return s;
  });
}
// półka z sieci → ≤ TABLE_SHELF_MAX czystych pozycji (tekst z capem, rok 4 cyfry, poprawny klucz, bez duplikatów)
export function sanitizeTableShelf(items){
  const out=[], seen=new Set();
  if(!Array.isArray(items)) return out;
  for(const r of items.slice(0, TABLE_SHELF_MAX*2)){
    if(!r || typeof r!=='object') continue;
    const title=clipText(r.title, TEXT_MAX).replace(/\s+/g, ' '), artist=clipText(r.artist, TEXT_MAX).replace(/\s+/g, ' ');
    const k=trackKey(artist, title); if(!isTrackKey(k) || seen.has(k)) continue;
    seen.add(k);
    const s={ title, artist }; const y=clipText(r.year, 4);
    if(/^(1[89]|20)\d{2}$/.test(y)) s.year=y;
    out.push(s);
    if(out.length>=TABLE_SHELF_MAX) break;
  }
  return out;
}
// shelves: [{ id, name, items }] (tylko obecni gracze, kolejność = kolejność w pokoju) → songs[] z polem `from`
export function buildTablePool(shelves, { max=TABLE_POOL_MAX }={}){
  const src=(Array.isArray(shelves) ? shelves : []).filter(s=>s && Array.isArray(s.items) && s.items.length)
    .map(s=>({ name:clipText(s.name, 40) || 'gracz', items:sanitizeTableShelf(s.items) }));
  const byKey=new Map(), out=[];
  const longest=Math.max(0, ...src.map(s=>s.items.length));
  for(let i=0;i<longest;i++){
    for(const s of src){
      const it=s.items[i]; if(!it) continue;
      const k=trackKey(it.artist, it.title);
      const prev=byKey.get(k);
      if(prev){ if(!prev.names.includes(s.name) && prev.names.length<3){ prev.names.push(s.name); prev.song.from=prev.names.join(', ').slice(0, FROM_MAX); } continue; }
      if(out.length>=max) continue;
      const song={ ...it, from:s.name };
      byKey.set(k, { song, names:[s.name] });
      out.push(song);
    }
  }
  return out;
}
export function tablePoolCategory(songs){ return { label:TABLE_LABEL, kind:'playlist', table:true, songs }; }
