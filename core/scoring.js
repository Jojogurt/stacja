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
  return deLatin(s.toLowerCase()).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\(.*?\)|\[.*?\]/g,' ')
    .replace(/\s*-\s*(remaster.*|radio edit.*|single version.*|mono|stereo|live.*|.*\bversion\b.*)$/i,' ')
    .replace(/\bfeat\.?\b.*$/i,' ').replace(/\bft\.?\b.*$/i,' ')
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9 ]/g,' ')
    .replace(/\b(the|a|an|de|le|la)\b/g,' ')
    .replace(/\s+/g,' ').trim();
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
  if(g.length>3 && a.length>3 && (a.includes(g)||g.includes(a))) return true;
  const d=lev(g,a);
  if(d<=1 && Math.min(g.length,a.length)>=4) return true;  // jedna literówka — ale nie w krótkich (≤3 znaki)
  const ratio=1-d/Math.max(g.length,a.length);
  return ratio>=0.84;
}

// czy odpowiedź „pasuje" do prawdy (tolerancja literówek, diakrytyków i leetspeaku)
export function textMatch(guess,actual){
  const g=norm(guess),a=norm(actual);
  if(nearMatch(g,a)) return true;
  // dodatkowa ścieżka: porównaj wersje „odleetowane" (tylko gdy były cyfry-litery)
  const gl=deLeet(g),al=deLeet(a);
  if((gl!==g || al!==a) && nearMatch(gl,al)) return true;
  return false;
}

// rok trafiony, gdy odgadnięto i mieści się w ±2 latach
export function yearMatch(guessYear, actualYear){
  return !!(guessYear && actualYear && Math.abs(+guessYear - +actualYear) <= 2);
}

// jedna ocena odpowiedzi (wspólna solo + MP) — czysta, zwraca komplet flag
export function evaluateGuess(guess, track){
  const okTitle = textMatch(guess.title, track.track);
  const okArtist = textMatch(guess.artist, track.artist);
  const okYear = yearMatch(guess.year, track.year);
  const okAlbum = guess.album ? textMatch(guess.album, track.album) : false;
  return { okTitle, okArtist, okYear, okAlbum, roundOk: okTitle && okArtist };
}
