/* core/tasteProfile.js — „Twój gust" (etap 2): profil gustu z ocen — czysta logika (zero DOM / sieci / localStorage).
 * Wejście: magazyn ocen z core/taste.js (albo lista ocen) + opcjonalnie kategorie (categories.js — PL i dekady/gatunki
 * kategorii) i statystyki trafień z gry (`byCat` z /api/profile: { klucz: { n, ok } }).
 *
 * Wektory „co lubisz": dekady (60.…20.) i 9 grup gatunków, ważone ocenami ❤️=2, 👍=1, 👎=-1. Udział w wektorze =
 * dodatnia część sumy wag kubełka / suma dodatnich części (👎 obniża kubełek, ale udział nie spada poniżej 0).
 * „Co znasz" (trafienia z gry) liczone OSOBNO i pokazywane obok — nie miesza się z „co lubisz".
 * Archetyp: pierwsza pasująca reguła z listy ARCHETYPES (deterministycznie, kolejność = priorytet). */
import { norm } from './scoring.js';
import { APP_NAME } from './util.js';
import { activeRatings, decadeOf } from './taste.js';
import { parseRange } from './trackSelect.js';

export const WEIGHT = { '2':2, '1':1, '-1':-1 };
export const DECADES = ['1960', '1970', '1980', '1990', '2000', '2010', '2020'];
export const DECADE_LABEL = { '1960':'60.', '1970':'70.', '1980':'80.', '1990':'90.', '2000':'2000', '2010':'2010', '2020':'2020' };
export const DECADE_LONG = { '1960':'lata 60.', '1970':'lata 70.', '1980':'lata 80.', '1990':'lata 90.', '2000':'lata 2000', '2010':'lata 2010', '2020':'lata 2020' };
export const PROFILE_GENRES = ['pop', 'rock', 'hiphop', 'dance', 'rnb', 'alt', 'metal', 'plscena', 'inne'];
export const GENRE_SHORT = { pop:'pop', rock:'rock', hiphop:'hip-hop/rap', dance:'elektronika', rnb:'R&B/soul', alt:'alt/indie', metal:'metal', plscena:'polska scena', inne:'inne' };
export const GENRE_LONG = { pop:'pop', rock:'rock', hiphop:'hip-hop / rap', dance:'elektronika / dance', rnb:'R&B / soul', alt:'alternatywa / indie',
  metal:'metal', plscena:'polska scena (disco polo, biesiada, poezja śpiewana)', inne:'inne' };
export const CONF_MID = 10, CONF_HIGH = 41;   // <10 ocen = niska, 10–40 = średnia, >40 = wysoka
export const KNOWN_MIN = 5;                   // min. pytań w dekadzie/gatunku, żeby pokazać „co znasz"

/* ---------- gatunek: iTunes primaryGenreName (EN lub PL) → grupa profilu ---------- */
export function profileGenre(genre){
  const g=String(genre||'').toLowerCase().trim();
  if(!g) return '';
  if(/disco.?polo|biesiad|poezj|szant|ludow|kabaret/.test(g)) return 'plscena';
  if(/metal/.test(g)) return 'metal';
  if(/hip.?hop|rap\b|^rap|trap|grime/.test(g)) return 'hiphop';
  if(/r&b|r ?n ?b|rnb|soul|funk|gospel|motown/.test(g)) return 'rnb';
  if(/alternat|indie|punk|grunge|new wave|emo\b/.test(g)) return 'alt';
  if(/dance|electr|elektron|house|techno|trance|disco|edm|dubstep|drum|club|tane/.test(g)) return 'dance';
  if(/rock|blues/.test(g)) return 'rock';
  if(/pop|schlager|singer|songwriter|wokal|vocal|easy listening|chanson|piosenk/.test(g)) return 'pop';
  return 'inne';
}
// grupa z klucza/etykiety kategorii (gdy utwór nie ma gatunku iTunes); dekady → ''
export function catProfileGenre(key, label){
  const s=(String(key||'')+' '+String(label||'')).toLowerCase();
  if(/disco.?polo|biesiad/.test(s)) return 'plscena';
  if(/metal/.test(s)) return 'metal';
  if(/rap|hip/.test(s)) return 'hiphop';
  if(/r&b|rnb|soul|funk/.test(s)) return 'rnb';
  if(/\bindie\b|alternat/.test(s)) return 'alt';
  if(/dance|disco|euro|club/.test(s)) return 'dance';
  if(/rock|unplugged|akustycz/.test(s)) return 'rock';
  if(/pop|hity|hits|evergreen/.test(s)) return 'pop';
  return '';
}
// dekada kategorii (zakres ≤ 10 lat albo otwarty „2020–"); szersze zakresy → ''
export function catDecadeOf(cat){
  const r=parseRange(cat && cat.range);
  return r && (r.to-r.from<=10 || r.to===9999) ? clampDecade(decadeOf(r.from)) : '';
}
// 50. i wcześniej → kubełek 60. (wykres zaczyna się od 60.)
const clampDecade = d => !d ? '' : (+d<1960 ? '1960' : (+d>2020 ? '2020' : d));
export const itemDecade = (it, cats={}) => clampDecade(decadeOf(it && it.year)) || catDecadeOf(cats && it && cats[it.cat]);
export const itemGenre = (it, cats={}) => profileGenre(it && it.genre) || catProfileGenre(it && it.cat, cats && it && cats[it.cat] && cats[it.cat].label);

/* ---------- polska scena vs świat (heurystyka) ----------
 * Polski = kategoria polska (klucz „-pl" / „disco-polo", etykieta „PL"/„polsk") ALBO polskie znaki w wykonawcy (bez „ó",
 * które ma też hiszpański) ALBO wykonawca z polskich kategorii categories.js ALBO gatunek „polska scena". */
const PL_CHARS = /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/;
export const isPlCat = (key, cat) => /(^|-)pl$|^pl-|disco-?polo/i.test(String(key||'')) || /\bPL\b|polsk|disco polo/.test(String(cat && cat.label || ''));
export function plArtists(cats){
  const s=new Set();
  for(const [k,c] of Object.entries(cats||{})){
    if(!c || typeof c!=='object' || !isPlCat(k, c)) continue;
    (Array.isArray(c.artists) ? c.artists : []).forEach(a=>{ if(typeof a==='string' && a.trim()) s.add(norm(a)); });
    (Array.isArray(c.songs) ? c.songs : []).forEach(x=>{ if(x && typeof x.artist==='string') s.add(norm(x.artist)); });
  }
  return s;
}
export function isPolish(it, { cats={}, plSet=null }={}){
  if(!it) return false;
  const a=String(it.artist||'');
  if(PL_CHARS.test(a)) return true;
  if(it.cat && isPlCat(it.cat, cats && cats[it.cat])) return true;
  if(profileGenre(it.genre)==='plscena') return true;
  return !!(plSet && plSet.has(norm(a)));
}

/* ---------- procenty sumujące się do 100 (metoda największych reszt) ---------- */
export function pctRound(shares){
  const raw=shares.map(s=>Math.max(0, s)*100), fl=raw.map(Math.floor);
  const sum=raw.reduce((a,b)=>a+b, 0);
  if(sum<=0) return fl.map(()=>0);
  let left=Math.round(sum)-fl.reduce((a,b)=>a+b, 0);
  const order=raw.map((v,i)=>[v-fl[i], i]).sort((x,y)=> (y[0]-x[0]) || (x[1]-y[1]));
  for(let j=0; j<order.length && left>0; j++, left--) fl[order[j][1]]++;
  return fl;
}
function vector(keys, score, count){
  const pos=keys.map(k=>Math.max(0, score[k]||0)), sum=pos.reduce((a,b)=>a+b, 0);
  const shares=pos.map(p=> sum ? p/sum : 0), pcts=pctRound(shares);
  return keys.map((k,i)=>({ key:k, share:shares[i], pct:pcts[i], score:score[k]||0, n:count[k]||0 }));
}
const top = v => v.reduce((b,x)=> x.share>0 && (!b || x.share>b.share) ? x : b, null);
const shareOf = (v, k) => { const x=v.find(e=>e.key===k); return x ? x.share : 0; };

export function confidenceOf(total){ return total>=CONF_HIGH ? 'high' : (total>=CONF_MID ? 'mid' : 'low'); }
export const CONF_LABEL = { low:'niska', mid:'średnia', high:'wysoka' };

/* top wykonawcy z półki (❤️): liczba ❤️, remis → nowsze; nazwa z najnowszej oceny */
export function topArtists(ratings, n=5){
  const m=new Map();
  for(const it of ratings){
    if(!it || it.rating!==2) continue;
    const k=norm(it.artist); if(!k) continue;
    const e=m.get(k)||{ artist:it.artist, n:0, ts:0 };
    e.n++; if((it.ts||0)>=e.ts){ e.ts=it.ts||0; e.artist=it.artist; }
    m.set(k, e);
  }
  return [...m.values()].sort((a,b)=> (b.n-a.n) || (b.ts-a.ts) || String(a.artist).localeCompare(String(b.artist), 'pl')).slice(0, n)
    .map(({ artist, n:c })=>({ artist, n:c }));
}

/* ---------- archetypy (kolejność = priorytet; pierwsza pasująca reguła wygrywa) ----------
 * test(p) dostaje profil (udziały 0..1); why(p) → krótkie uzasadnienie z liczbami. */
const D = (p, ...ks) => ks.reduce((a,k)=>a+shareOf(p.decades, k), 0);
const G = (p, k) => shareOf(p.genres, k);
const P = x => Math.round(x*100)+'%';
const broad = (v, min=0.1, skip='') => v.filter(x=>x.key!==skip && x.share>=min).length;
export const LOW_ARCHETYPE = { id:'poznajemy', emoji:'🔍', name:'Jeszcze cię poznajemy',
  desc:'Oceń jeszcze kilka utworów, a powiemy Ci, jakim słuchaczem jesteś.', when:`< ${CONF_MID} ocen albo brak polubień` };
export const ARCHETYPES = [
  { id:'polska-szkola', emoji:'🇵🇱', name:'Polska szkoła', when:'PL ≥ 70% polubień',
    desc:'Swoje znasz i swoje kochasz — polskie refreny śpiewasz od pierwszego taktu.',
    test:p=>p.pl.share>=0.7, why:p=>`${P(p.pl.share)} polubień to polscy wykonawcy` },
  { id:'biesiada', emoji:'🎉', name:'Dusza biesiady', when:'polska scena ≥ 30%',
    desc:'Disco polo i biesiadne refreny — przy Tobie żadna impreza nie jest nudna.',
    test:p=>G(p,'plscena')>=0.3, why:p=>`${P(G(p,'plscena'))} polubień: polska scena` },
  { id:'metal', emoji:'🤘', name:'Metalowe serce', when:'metal ≥ 30%',
    desc:'Im głośniej, tym lepiej — ciężkie riffy to Twój język ojczysty.',
    test:p=>G(p,'metal')>=0.3, why:p=>`${P(G(p,'metal'))} polubień: metal` },
  { id:'hiphop', emoji:'🎤', name:'Hiphopowy purysta', when:'hip-hop/rap ≥ 40%',
    desc:'Liczy się flow, bit i dobra puenta — reszta to tło.',
    test:p=>G(p,'hiphop')>=0.4, why:p=>`${P(G(p,'hiphop'))} polubień: hip-hop / rap` },
  { id:'parkiet', emoji:'💃', name:'Parkietowy wymiatacz', when:'elektronika/dance ≥ 30%',
    desc:'Jeśli da się do tego tańczyć, to już Ci się podoba.',
    test:p=>G(p,'dance')>=0.3, why:p=>`${P(G(p,'dance'))} polubień: elektronika / dance` },
  { id:'groove', emoji:'🎷', name:'Aksamitny groove', when:'R&B/soul ≥ 30%',
    desc:'Soul, R&B i funk — wybierasz głos z duszą i rytm, który kołysze.',
    test:p=>G(p,'rnb')>=0.3, why:p=>`${P(G(p,'rnb'))} polubień: R&B / soul` },
  { id:'indie', emoji:'🎧', name:'Indie odkrywca', when:'alternatywa/indie ≥ 30%',
    desc:'Lubisz brzmienia spoza głównego nurtu i zespoły, o których inni usłyszą za rok.',
    test:p=>G(p,'alt')>=0.3, why:p=>`${P(G(p,'alt'))} polubień: alternatywa / indie` },
  { id:'rock', emoji:'🎸', name:'Rockowy weteran', when:'rock ≥ 40%',
    desc:'Gitara, perkusja i wzmacniacz na full — klasyka nigdy Ci się nie znudzi.',
    test:p=>G(p,'rock')>=0.4, why:p=>`${P(G(p,'rock'))} polubień: rock` },
  { id:'wszystkozerca', emoji:'🌈', name:'Wszystkożerca', when:'≥ 4 dekady i ≥ 4 gatunki po ≥ 10%',
    desc:'Każda dekada, każdy gatunek — liczy się dobra piosenka, nie etykieta.',
    test:p=>broad(p.decades)>=4 && broad(p.genres, 0.1, 'inne')>=4, why:p=>`lubisz ${broad(p.decades)} dekad i ${broad(p.genres, 0.1, 'inne')} gatunków` },
  { id:'sentymentalny', emoji:'📻', name:'Sentymentalny romantyk', when:'lata 60.+70. ≥ 45%',
    desc:'Najpiękniejsze piosenki powstały, zanim ktokolwiek słyszał o płycie CD.',
    test:p=>D(p,'1960','1970')>=0.45, why:p=>`${P(D(p,'1960','1970'))} polubień: lata 60. i 70.` },
  { id:'ejtis', emoji:'📼', name:'Neonowe lata 80.', when:'lata 80. ≥ 40%',
    desc:'Syntezatory, wielkie refreny i walkman w sercu — ejtisy nigdy nie minęły.',
    test:p=>D(p,'1980')>=0.4, why:p=>`${P(D(p,'1980'))} polubień: lata 80.` },
  { id:'dziecko90', emoji:'💿', name:'Dziecko lat 90.', when:'lata 90. ≥ 40%',
    desc:'Kasety, teledyski i listy przebojów — to była Twoja epoka.',
    test:p=>D(p,'1990')>=0.4, why:p=>`${P(D(p,'1990'))} polubień: lata 90.` },
  { id:'mp3', emoji:'📱', name:'Pokolenie MP3', when:'lata 2000 ≥ 40%',
    desc:'Empetrójki, pierwsze komórki i hity z lat 2000 — Twój złoty okres.',
    test:p=>D(p,'2000')>=0.4, why:p=>`${P(D(p,'2000'))} polubień: lata 2000` },
  { id:'lowca', emoji:'🚀', name:'Łowca nowości', when:'lata 2010+2020 ≥ 55%',
    desc:'Nowe premiery znasz, zanim trafią do radia.',
    test:p=>D(p,'2010','2020')>=0.55, why:p=>`${P(D(p,'2010','2020'))} polubień: ostatnie 15 lat` },
  { id:'pop', emoji:'✨', name:'Popowy optymista', when:'pop ≥ 35%',
    desc:'Chwytliwy refren i dobry nastrój — tego szukasz w muzyce.',
    test:p=>G(p,'pop')>=0.35, why:p=>`${P(G(p,'pop'))} polubień: pop` },
  { id:'zloty-srodek', emoji:'⚖️', name:'Złoty środek', when:'żadna reguła wyżej (fallback)',
    desc:'Gust bez skrajności — trochę tego, trochę tamtego, zawsze z wyczuciem.',
    test:()=>true, why:p=>[p.topGenre && GENRE_SHORT[p.topGenre.key], p.topDecade && DECADE_LONG[p.topDecade.key]].filter(Boolean).join(' · ') || 'różne brzmienia' },
];
export function pickArchetype(p){
  if(!p || p.confidence==='low' || !p.liked){
    const need=Math.max(0, CONF_MID-(p ? p.total : 0));
    return { ...LOW_ARCHETYPE, why: need ? `brakuje jeszcze ${need} ${need===1?'oceny':'ocen'}` : 'potrzebujemy kilku polubień' };
  }
  const a=ARCHETYPES.find(x=>x.test(p));
  return { id:a.id, emoji:a.emoji, name:a.name, desc:a.desc, when:a.when, why:a.why(p) };
}

/* ---------- „co znasz": trafienia z gry per dekada / gatunek kategorii ----------
 * byCat: { kluczKategorii: { n, ok } } (z /api/profile). Kategoria-dekada → dekada; kategoria-styl → grupa gatunku. */
export function knownProfile(byCat, cats={}){
  const dec={}, gen={}; let total=0;
  for(const [k,v] of Object.entries(byCat && typeof byCat==='object' ? byCat : {})){
    const n=Math.max(0, Math.floor(Number(v && v.n)||0)), okN=Math.min(n, Math.max(0, Math.floor(Number(v && v.ok)||0)));
    if(!n) continue;
    const c=cats && cats[k];
    const d=catDecadeOf(c), g=c ? catProfileGenre(k, c.label) : '';
    if(d){ dec[d]=dec[d]||{ n:0, ok:0 }; dec[d].n+=n; dec[d].ok+=okN; }
    if(g){ gen[g]=gen[g]||{ n:0, ok:0 }; gen[g].n+=n; gen[g].ok+=okN; }
    if(d || g) total+=n;
  }
  const rows=(keys, m)=>keys.filter(k=>m[k]).map(k=>({ key:k, n:m[k].n, ok:m[k].ok, pct:Math.round(m[k].ok/m[k].n*100) }));
  return { total, decades:rows(DECADES, dec), genres:rows(PROFILE_GENRES, gen) };
}
/* zestawienie „co lubisz" vs „co znasz" — tylko kubełki z ≥ minN pytaniami; null, gdy nie ma czego pokazać */
export function compareKnownLiked(profile, known, minN=KNOWN_MIN){
  if(!profile || !known) return null;
  const pick=(kv, lv, label)=> kv.filter(x=>x.n>=minN).map(x=>{ const l=lv.find(e=>e.key===x.key); return { key:x.key, label:label[x.key], known:x.pct, n:x.n, liked:l ? l.pct : 0 }; });
  const decades=pick(known.decades, profile.decades, DECADE_LONG), genres=pick(known.genres, profile.genres, GENRE_SHORT);
  if(!decades.length && !genres.length) return null;
  const all=[...decades, ...genres];
  const best=all.reduce((b,x)=> !b || x.known>b.known ? x : b, null);
  return { decades, genres, best };
}

/* ---------- profil ---------- */
export function buildTasteProfile(src, { cats={}, byCat=null }={}){
  const act=(Array.isArray(src) ? src : activeRatings(src)).filter(x=>x && WEIGHT[x.rating]!=null);
  const plSet=plArtists(cats);
  const dS={}, dN={}, gS={}, gN={};
  let up=0, down=0, hearts=0, posW=0, plW=0, liked=0;
  for(const it of act){
    const w=WEIGHT[it.rating];
    if(it.rating===2) hearts++; else if(it.rating===1) up++; else down++;
    const d=itemDecade(it, cats), g=itemGenre(it, cats);
    if(d){ dS[d]=(dS[d]||0)+w; dN[d]=(dN[d]||0)+1; }
    if(g){ gS[g]=(gS[g]||0)+w; gN[g]=(gN[g]||0)+1; }
    if(w>0){ liked++; posW+=w; if(isPolish(it, { cats, plSet })) plW+=w; }
  }
  const decades=vector(DECADES, dS, dN), genres=vector(PROFILE_GENRES, gS, gN);
  const plShare=posW ? plW/posW : 0, [plPct, worldPct]=posW ? pctRound([plShare, 1-plShare]) : [0, 0];
  const total=act.length;
  const p={ total, hearts, up, down, liked, confidence:confidenceOf(total),
    decades, genres, pl:{ share:plShare, pct:plPct, worldPct },
    topDecade:top(decades), topGenre:top(genres), topArtists:topArtists(act, 5) };
  p.archetype=pickArchetype(p);
  const known=byCat ? knownProfile(byCat, cats) : null;
  p.known=known && known.total ? known : null;
  p.compare=compareKnownLiked(p, p.known);
  return p;
}

/* ---------- tekst do udostępnienia (bez danych osobowych; ksywa tylko na życzenie) ---------- */
export { APP_NAME } from './util.js';   // re-eksport (dawni importerzy)
export function topList(v, n=3, label=DECADE_LONG){ return v.filter(x=>x.share>0).sort((a,b)=>b.share-a.share).slice(0, n).map(x=>`${label[x.key]} ${x.pct}%`); }
export function shareText(p, { handle='', url='' }={}){
  const a=p.archetype, lines=[];
  lines.push(`🎧 ${handle ? `Gust muzyczny: ${handle}` : 'Mój gust muzyczny'} — ${a.emoji} ${a.name}`);
  lines.push(a.desc);
  if(a.id!=='poznajemy'){
    const d=topList(p.decades, 3, DECADE_LONG), g=topList(p.genres, 3, GENRE_SHORT);
    if(d.length) lines.push('Dekady: '+d.join(' · '));
    if(g.length) lines.push('Gatunki: '+g.join(' · '));
    if(p.liked) lines.push(`Polska ${p.pl.pct}% · świat ${p.pl.worldPct}%`);
  }
  const ar=p.topArtists.slice(0, 3).map(x=>x.artist);
  if(ar.length) lines.push('Na mojej półce: '+ar.join(', '));
  lines.push(url ? `Sprawdź swój gust w ${APP_NAME}: ${url}` : `Sprawdź swój gust w ${APP_NAME}!`);
  return lines.join('\n');
}
