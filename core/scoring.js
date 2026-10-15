/* core/scoring.js — dopasowanie odpowiedzi (czyste, zero DOM / Web API) */

// usuń litery, których NFD nie rozkłada (ł, đ, ø, ß, æ, œ, þ)
export function deLatin(s){
  return s.replace(/ł/g,'l').replace(/Ł/g,'L')
    .replace(/đ/g,'d').replace(/ø/g,'o').replace(/ß/g,'ss')
    .replace(/æ/g,'ae').replace(/œ/g,'oe').replace(/þ/g,'th');
}

// normalizacja tytułu/wykonawcy do porównania (małe litery, bez diakrytyków,
// bez „(remaster)", „feat.", przedimków itd.)
export function norm(s){
  if(!s) return '';
  const base = deLatin(s.toLowerCase()).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\(.*?\)|\[.*?\]/g,' ')
    .replace(/\s*-\s*(remaster.*|radio edit.*|single version.*|mono|stereo|live.*|.*\bversion\b.*)$/i,' ')
    .replace(/\bfeat\.?\b.*$/i,' ').replace(/\bft\.?\b.*$/i,' ')
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const reduced = base.replace(/\b(the|a|an|de|le|la)\b/g,' ').replace(/\s+/g,' ').trim();
  // 4.3: usuwaj przedimki TYLKO gdy zostaje sensowny rdze\u0144 \u2014 \u22656 znak\u00f3w (bez spacji) LUB \u22652 tokeny.
  // Inaczej \u201eDe La Soul" \u2192 \u201esoul" (1 kr\u00f3tki token) fa\u0142szywie zaliczy\u0142oby odpowied\u017a \u201eSoul".
  // (Uog\u00f3lnienie dawnej ochrony przed redukcj\u0105 \u201eA"\u2192'' w pytaniach ABCD.)
  const tokens = reduced ? reduced.split(' ') : [];
  const enough = reduced.replace(/ /g,'').length>=6 || tokens.length>=2;
  return enough ? reduced : base;
}

// odległość Levenshteina
export function lev(a,b){
  const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
  let prev=[...Array(n+1).keys()],cur=new Array(n+1);
  for(let i=1;i<=m;i++){cur[0]=i;
    for(let j=1;j<=n;j++){cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));}
    [prev,cur]=[cur,prev];}
  return prev[n];
}

// leetspeak: cyfry „udające" litery (np. PRO8L3M = problem). Mapujemy je na litery,
// żeby zapis fonetyczny zaliczał się tak samo jak oryginalny.
function deLeet(s){
  return s.replace(/0/g,'o').replace(/1/g,'l').replace(/3/g,'e').replace(/4/g,'a')
    .replace(/5/g,'s').replace(/7/g,'t').replace(/8/g,'b').replace(/9/g,'g');
}

// rdzeń porównania znormalizowanych napisów (tolerancja literówek)
function nearMatch(g,a){
  if(!g||!a) return false;
  if(g===a) return true;
  // zawieranie się napisów (np. „bohemian rhapsody" w „bohemian rhapsody live") —
  // ale TYLKO gdy krótszy pokrywa większość dłuższego, inaczej pojedyncze słowo
  // („flag") fałszywie zaliczałoby długi tytuł („what's left of the flag").
  if(g.length>3 && a.length>3 && (a.includes(g)||g.includes(a))){
    if(Math.min(g.length,a.length) / Math.max(g.length,a.length) >= 0.6) return true;
  }
  const d=lev(g,a);
  // 4.2: jedna literówka dozwolona dopiero od 6 znaków (dłuższego z porównywanych) — inaczej
  // „Stan"≈„Stay", „Light"≈„Night" fałszywie zaliczały. Dla 4-5 znaków wymagane dokładne dopasowanie.
  if(d<=1 && Math.max(g.length,a.length)>=6) return true;
  const ratio=1-d/Math.max(g.length,a.length);
  return ratio>=0.84;
}

// czy odpowiedź „pasuje" do prawdy (tolerancja literówek, diakrytyków i leetspeaku)
export function textMatch(guess,actual){
  const g=norm(guess),a=norm(actual);
  if(nearMatch(g,a)) return true;
  // 4.4: de-leet jako DRUGA próba — tylko gdy strona zawierająca cyfrę ma po normalizacji ≥6 znaków.
  // Krótkie kody typu „50s" nigdy nie wchodzą w de-leet (inaczej „sos"≈„50s").
  const gHasDigit=/\d/.test(g), aHasDigit=/\d/.test(a);
  const canLeet = (gHasDigit && g.replace(/ /g,'').length>=6) || (aHasDigit && a.replace(/ /g,'').length>=6);
  if(canLeet){
    const gl=deLeet(g),al=deLeet(a);
    if((gl!==g || al!==a) && nearMatch(gl,al)) return true;
  }
  return false;
}

// 4.1 + F2a #12: dopasowanie WYKONAWCY: całość LUB człon oczekiwanego DUETU/feat (odpowiedź gracza NIE jest dzielona).
// Decyzja F2a: „&", „,", „ i ", „ and " bywają CZĘŚCIĄ NAZWY zespołu („Earth, Wind & Fire", „Simon & Garfunkel",
// „Mumford & Sons", „Tyler, the Creator"), więc dzielimy po nich tylko, gdy wygląda to na zestawienie osobnych
// wykonawców:
//   • separatory TWARDE (zawsze kolaboracja): feat. / ft. / featuring / „ x " — dzielimy zawsze;
//   • separatory MIĘKKIE (&, przecinek, i, and) — dzielimy, gdy (a) całość jest na liście KNOWN_COLLABS
//     (duety jednowyrazowych ksyw z danych), albo (b) choć jeden człon ma ≥2 słowa (imię+nazwisko: „Queen &
//     David Bowie", „sanah i Vito Bambino", „Ed Sheeran & Justin Bieber") I żaden człon po separatorze nie zaczyna
//     się od przedimka („Nick Cave & the Bad Seeds", „Huey Lewis and the News" = nazwa zespołu).
//   Same jednowyrazowe człony („Simon & Garfunkel", „Sonny & Cher", „Earth, Wind & Fire") = nazwa aktu → tylko całość.
// Człon musi mieć ≥3 znaki po normalizacji.
const HARD_SEP = /\s+(?:feat\.?|ft\.?|featuring|x)\s+/i;
const SOFT_SEP = /\s*(?:&|,)\s*|\s+(?:i|and)\s+/i;
const ARTICLE = /^(?:the|a|an)\s+/i;
// kolaboracje jednowyrazowych wykonawców obecne w danych (klucz = norm całości)
const KNOWN_COLLABS = new Set(['lona and webber', 'lona i webber', 'donatan and cleo', 'bialas and lanek']);
const words = p => p.replace(ARTICLE, '').trim().split(/\s+/).filter(Boolean).length;

function artistParts(actual){
  const out = [];
  String(actual||'').split(HARD_SEP).map(p=>p.trim()).filter(Boolean).forEach(piece=>{
    out.push(piece);
    const soft = piece.split(SOFT_SEP).map(p=>p.trim()).filter(Boolean);
    if(soft.length < 2) return;
    const known = KNOWN_COLLABS.has(norm(piece));
    const personLike = soft.some(p=>words(p)>=2) && !soft.slice(1).some(p=>ARTICLE.test(p));
    if(known || personLike) out.push(...soft);
  });
  return out;
}

export function artistMatch(guess, actual){
  if(textMatch(guess, actual)) return true;                 // całość (istniejąca tolerancja)
  const parts = artistParts(actual);
  if(parts.length<2) return false;                          // brak rozbicia → nic nowego
  return parts.some(p => norm(p).length>=3 && textMatch(guess, p));
}

// rok trafiony, gdy odgadnięto i mieści się w ±2 latach
export function yearMatch(guessYear, actualYear){
  return !!(guessYear && actualYear && Math.abs(+guessYear - +actualYear) <= 2);
}

// jedna ocena odpowiedzi (wspólna solo + MP) — czysta, zwraca komplet flag
export function evaluateGuess(guess, track){
  const okTitle = textMatch(guess.title, track.track);
  const okArtist = artistMatch(guess.artist, track.artist);   // 4.1: duety/feat rozbijane po stronie oczekiwanej
  const okYear = yearMatch(guess.year, track.year);
  const okAlbum = guess.album ? textMatch(guess.album, track.album) : false;
  return { okTitle, okArtist, okYear, okAlbum, roundOk: okTitle && okArtist };
}
