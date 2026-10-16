/* core/scoring.js — dopasowanie odpowiedzi (czyste, zero DOM / Web API) */

// usuń litery, których NFD nie rozkłada (ł, đ, ø, ß, æ, œ, þ)
export function deLatin(s){
  return s.replace(/ł/g,'l').replace(/Ł/g,'L')
    .replace(/đ/g,'d').replace(/ø/g,'o').replace(/ß/g,'ss')
    .replace(/æ/g,'ae').replace(/œ/g,'oe').replace(/þ/g,'th');
}

// normalizacja tytułu/wykonawcy do porównania (małe litery, bez diakrytyków,
// bez „(remaster)", „feat.", przedimków itd.)
// wspólny przedbieg norm()/numTokens(): bez diakrytyków, bez „(…)", „- remaster", „feat." (wielkość liter ZACHOWANA)
function prenorm(s){
  return deLatin(String(s)).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\(.*?\)|\[.*?\]/g,' ')
    .replace(/\s*-\s*(remaster.*|radio edit.*|single version.*|mono|stereo|live.*|.*\bversion\b.*)$/i,' ')
    .replace(/\bfeat\.?\b.*$/i,' ').replace(/\bft\.?\b.*$/i,' ');
}
export function norm(s){
  if(!s) return '';
  const base = prenorm(String(s).toLowerCase())
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  // F8a: przedimki a/an/de/le/la TYLKO na POCZĄTKU („The …", „A …", „Le …", też ciągiem: „De La …").
  // Dawniej usuwane wszędzie → „witamina A" → „witamina" (zaliczało „witamina B3"), „Grupa A" → „grupa".
  // Wyjątek uzasadniony: angielskie „the" w ŚRODKU/na końcu nadal usuwane („A Day in the Life" ≈ „Day in Life")
  // — to nigdy nie jest rozróżniający człon odpowiedzi (w przeciwieństwie do jednoliterowego „a").
  const reduced = base.replace(/^(?:(?:the|a|an|de|le|la) )+/,'').replace(/\bthe\b/g,' ').replace(/\s+/g,' ').trim();
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

/* F3 #6: LICZBY I NUMERACJA DOKŁADNIE. Tokeny liczbowe = ciągi cyfr (arabskie; minus przed liczbą
 * zachowany, gdy stoi na początku/po spacji — „-40" ≠ „40", ale „An-22" = 22, „1939 - 1945" = 1939,1945;
 * zera wiodące pomijane: 007 = 7) + liczebniki rzymskie I..XXX jako OSOBNY token (mapowane na arabskie:
 * „Ludwik XIV" ≈ „ludwik 14"). Cyfry WEWNĄTRZ słowa (litera–cyfra–litera: „PRO8L3M") to leetspeak, nie liczba.
 * Samotne małe „i" to zwykle polski spójnik („Romeo i Julia") — liczy się jako I tylko, gdy jest ostatnim
 * tokenem, stoi przed liczbą albo zapisane wielką literą („Karol I Stuart"). „20%" = „20" (znak jednostki pomijany). */
const ROMAN_RE = /^(x{0,3})(ix|iv|v?i{0,3})$/;
const ROMAN_VAL = { i:1, v:5, x:10 };
function romanToInt(t){
  if(!t || !ROMAN_RE.test(t)) return 0;
  let n=0; for(let i=0;i<t.length;i++){ const v=ROMAN_VAL[t[i]], nx=ROMAN_VAL[t[i+1]]||0; n += v<nx ? -v : v; }
  return n;
}
const stripZeros = d => d.replace(/^0+(?=\d)/,'');
function tokenize(s){
  return prenorm(s).replace(/(^\s*|[^0-9\s]\s+)[-\u2212\u2013](?=\d)/g,'$1~')
    .split(/[^A-Za-z0-9~]+/).filter(Boolean);
}
// czy token (po tokenize) to rzymski liczebnik w tym kontekście → wartość albo 0
function romanAt(toks, i){
  const t=toks[i], lo=t.toLowerCase(), v=romanToInt(lo);
  if(!v) return 0;
  if(lo==='i' && t!=='I'){
    const nx=toks[i+1];
    if(nx!=null && !/^~?\d+$/.test(nx) && !romanToInt(nx.toLowerCase())) return 0;   // „Romeo i Julia" — spójnik
  }
  return v;
}
export function numTokens(s){
  if(!s) return [];
  const toks=tokenize(s), out=[];
  toks.forEach((t,i)=>{
    if(/\d/.test(t)){
      // cyfry między literami = leet („pro8l3m"), reszta = liczby („a320", „126p", „mp3", „~40")
      const re=/~?\d+/g; let m;
      while((m=re.exec(t))){
        const before=t[m.index-1], after=t[m.index+m[0].length];
        if(before && /[a-z]/i.test(before) && after && /[a-z]/i.test(after)) continue;
        out.push(m[0][0]==='~' ? '-'+stripZeros(m[0].slice(1)) : stripZeros(m[0]));
      }
      return;
    }
    const v=romanAt(toks, i); if(v) out.push(String(v));
  });
  return out.sort();
}
// norm() z liczebnikami rzymskimi zamienionymi na arabskie (tylko do porównania, gdy liczby się zgadzają)
function normNum(s){
  const toks=tokenize(s);
  return norm(toks.map((t,i)=>{ const v=/\d/.test(t)?0:romanAt(toks,i); return v?String(v):t.replace(/^~/,'-').replace(/\d+/g,stripZeros); }).join(' '));
}
const sameList = (a,b)=> a.length===b.length && a.every((x,i)=>x===b[i]);

// F8a: jednoliterowe tokeny (litery) po normalizacji — „Grupa A", „witamina C", „Malcolm X"
const letterTokens = s => s ? s.split(' ').filter(t=>/^[a-z]$/.test(t)).sort() : [];
// czy odpowiedź „pasuje" do prawdy (tolerancja literówek, diakrytyków i leetspeaku)
export function textMatch(guess,actual){
  const g=norm(guess),a=norm(actual);
  // F8a: obie strony z jednoliterowym członem → człony muszą być IDENTYCZNE (jak liczby): „Grupa A" ≠ „Grupa B"
  // (inaczej literówka ≤1 przy ≥6 znakach zaliczała). Gdy tylko jedna strona ma taki człon — bez zmian.
  const lg=letterTokens(g), la=letterTokens(a);
  if(lg.length && la.length && !sameList(lg, la)) return false;
  // F3 #6: obie strony z liczbą/numeracją → tokeny muszą być IDENTYCZNE (literówka w liczbie = źle)
  const ng=numTokens(guess), na=numTokens(actual);
  const numeric = ng.length>0 && na.length>0;
  if(numeric && !sameList(ng, na)) return false;
  if(nearMatch(g,a)) return true;
  if(numeric && nearMatch(normNum(guess), normNum(actual))) return true;   // „Ludwik XIV" ≈ „ludwik 14"
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

/* ======================= PUNKTACJA (F6a: R2 / R-U3, propozycja #4) — wspólna solo + MP + serwer =======================
 * Czysta funkcja: punkty za JEDNO pytanie.
 *  • muzyka/lektor/od tyłu/fragment: tytuł 50 + wykonawca 50 (częściowe trafienie też punktuje), rok ±2 +20, album +20;
 *  • quiz (wiedza): 100 za trafienie (wszystkie pola), inaczej 0; łamigłówki z `partial:true` — `quizFrac` (ułamek
 *    trafionych slotów, quizPartialFrac) daje częściowe punkty (1/3 → 33), seria/pewniak tylko przy pełnym;
 *  • szybkość: do +50% bazy — liniowo od czasu odpowiedzi względem limitu (timer pytania; bez timera SPEED_CAP_MS = 30 s
 *    zajawki). elapsedMs nieznany (null) → bez bonusu;
 *  • seria (tylko przy PEŁNYM trafieniu; `streak` = seria pełnych trafień WŁĄCZNIE z tym pytaniem): ×1.5 od 3, ×2 od 5;
 *  • pewniak (MP): trafienie ×2; pewniak przy nie-pełnym trafieniu = zakład przegrany → 0 pkt (plus „stawia kolejkę").
 * Zwraca { points, base, speed (mnożnik ≥1), streakMult, sureMult, parts:{title,artist,year,album,quiz} }. */
export const PTS = { title:50, artist:50, year:20, album:20, quiz:100 };
export const SPEED_BONUS_MAX = 0.5;
export const SPEED_CAP_MS = 30000;
export const SURE_MULT = 2;
export function streakMult(streak){ const n=+streak||0; return n>=5 ? 2 : (n>=3 ? 1.5 : 1); }
export function speedFactor(elapsedMs, limitMs){
  if(elapsedMs==null || !Number.isFinite(+elapsedMs)) return 1;
  const lim = (+limitMs>0) ? Math.min(+limitMs, 10*60*1000) : SPEED_CAP_MS;
  const left = 1 - Math.max(0, +elapsedMs)/lim;
  return 1 + SPEED_BONUS_MAX*Math.max(0, Math.min(1, left));
}
/* F8a: tryb „rok" (oś czasu lite) — punkty za odległość od roku wydania: dokładnie 100, ±1 70, ±2 50,
 * właściwa dekada (ta sama dziesiątka lat, np. 1980–1989) 20, inaczej 0. Brak/śmieci → 0. */
export const YEAR_PTS = { exact:100, off1:70, off2:50, decade:20 };
export const YEAR_MIN = 1950, YEAR_MAX = 2026;           // zakres suwaka/pola (UI)
export const YEAR_OK_PTS = YEAR_PTS.off2;                 // „trafienie" (statystyki/seria) = ±2 lata (jak yearMatch)
export function parseYear(v){
  const m=String(v==null?'':v).trim().match(/^(\d{4})/);
  if(!m) return null;
  const y=+m[1]; return (y>=1000 && y<=2999) ? y : null;
}
export function yearScore(guess, actual){
  const g=parseYear(guess), a=parseYear(actual);
  if(g==null || a==null) return { points:0, diff:null, tier:'miss' };
  const diff=Math.abs(g-a);
  if(diff===0) return { points:YEAR_PTS.exact, diff, tier:'exact' };
  if(diff===1) return { points:YEAR_PTS.off1, diff, tier:'off1' };
  if(diff===2) return { points:YEAR_PTS.off2, diff, tier:'off2' };
  if(Math.floor(g/10)===Math.floor(a/10)) return { points:YEAR_PTS.decade, diff, tier:'decade' };
  return { points:0, diff, tier:'miss' };
}
/* F8a: tryb „intro" (Heardle) — mnożnik punktów wg etapu odsłony (1/2/4/8/16 s), w którym zgadnięto.
 * Etap ZASTĘPUJE bonus za szybkość (wołający podaje elapsedMs:null). Poza zakresem → ostatni (×1). */
export const INTRO_MULTS = [2.0, 1.6, 1.3, 1.1, 1.0];
export function introMult(stage){
  const i=Math.floor(Number(stage));
  return INTRO_MULTS[Number.isFinite(i) ? Math.max(0, Math.min(INTRO_MULTS.length-1, i)) : INTRO_MULTS.length-1];
}

/* EKSPERYMENT: „od tyłu krótko" — etap „dłużej" (5 s) ma MNIEJSZY mnożnik niż 3 s (szybkość/seria jak w muzyce) */
export const REVSNIP_MULTS = [1.0, 0.8];
export function revsnipMult(stage){
  const i=Math.floor(Number(stage));
  return REVSNIP_MULTS[Number.isFinite(i) ? Math.max(0, Math.min(REVSNIP_MULTS.length-1, i)) : 0];
}
/* EKSPERYMENT: „okładka" — mnożnik wg etapu odsłony okładki (8 → 16 → 32 → 64 bloki → pełna) jak intro (×2.0 → ×1.0) */
export const coverMult = stage => introMult(stage);
/* EKSPERYMENT: tryby „tylko wykonawca" (składanka, okładka): trafiony wykonawca = ARTIST_ONLY_PTS (jak ABCD/quiz),
 * okładka: + album (bonus PTS.album, niezależny od wykonawcy). Pełne trafienie (seria/statystyki) = wykonawca. */
export const ARTIST_ONLY_PTS = 100;

// Łamigłówki („Jedna litera różnicy", pytanie z `partial:true`): nie-pełne trafienie = ułamek trafionych slotów
// × PTS.quiz (np. 1/3 → 33). Pełne trafienie zawsze PTS.quiz; seria/pewniak liczą się tylko przy pełnym.
function quizPartPts(frac){
  const f=Number(frac);
  return Number.isFinite(f) && f>0 ? Math.round(PTS.quiz*Math.min(1, f)) : 0;
}
// rdzeń punktacji (bez mnożnika trybu) — z niego też limit SCORE_MAX_PER_Q
function scoreCore({ okTitle=false, okArtist=false, okYear=false, okAlbum=false, roundOk, quizOk, quizFrac, yearPts, artistOnly=false,
  elapsedMs=null, limitMs=0, streak=0, sure=false } = {}){
  const isQuiz = quizOk!==undefined && quizOk!==null;
  const isYear = !isQuiz && yearPts!==undefined && yearPts!==null;   // F8a: tryb „rok" — punkty z yearScore
  const isArtist = !isQuiz && !isYear && artistOnly===true;           // EKSPERYMENT: składanka / okładka
  const yp = isYear ? Math.max(0, Math.min(YEAR_PTS.exact, Math.round(+yearPts)||0)) : 0;
  const parts = isQuiz
    ? { title:0, artist:0, year:0, album:0, quiz: quizOk ? PTS.quiz : quizPartPts(quizFrac) }
    : isYear ? { title:0, artist:0, year:yp, album:0, quiz:0 }
    : isArtist ? { title:0, artist: okArtist?ARTIST_ONLY_PTS:0, year:0, album: okAlbum?PTS.album:0, quiz:0 }
    : { title: okTitle?PTS.title:0, artist: okArtist?PTS.artist:0, year: okYear?PTS.year:0, album: okAlbum?PTS.album:0, quiz:0 };
  const full = isQuiz ? !!quizOk : isYear ? yp>=YEAR_OK_PTS : isArtist ? !!okArtist : (roundOk!==undefined ? !!roundOk : !!(okTitle && okArtist));
  const base = parts.title + parts.artist + parts.year + parts.album + parts.quiz;
  const speed = base>0 ? speedFactor(elapsedMs, limitMs) : 1;
  const sMult = full ? streakMult(streak) : 1;
  const sureMult = sure ? (full ? SURE_MULT : 0) : 1;
  const points = Math.round(base * speed * sMult * sureMult);
  return { points, base, speed, streakMult:sMult, sureMult, parts, full };
}
// górny limit punktów za JEDNO pytanie (walidacja ligi na serwerze): pełna baza × max szybkość × max seria × pewniak
export const SCORE_MAX_PER_Q = scoreCore({ okTitle:true, okArtist:true, okYear:true, okAlbum:true, elapsedMs:0, streak:99, sure:true }).points;
/* `mult` (F8a) — mnożnik trybu (np. etap „intro": introMult). Wynik przycinany do SCORE_MAX_PER_Q, więc format
 * statystyk/ligi i walidacja serwera bez zmian (intro gra bez bonusu za szybkość: 140 × 2 × 2 = 560 < 840).
 * `yearPts` (F8a) — tryb „rok": baza = yearScore().points; „pełne trafienie" (seria/pewniak) = ±2 lata. */
export function scoreRound(args = {}){
  const sc = scoreCore(args);
  const m = Number(args.mult);
  const mult = Number.isFinite(m) && m>0 ? Math.min(m, INTRO_MULTS[0]) : 1;
  const points = Math.min(SCORE_MAX_PER_Q, Math.round(sc.points * mult));
  return { points, base:sc.base, speed:sc.speed, streakMult:sc.streakMult, sureMult:sc.sureMult, mult, parts:sc.parts };
}

/* F8b: stopka-legenda punktacji solo zależna od trybu BIEŻĄCEGO pytania (tekst z tych samych stałych co liczenie):
 *  • ABCD / quiz: „trafienie 100 · szybkość · seria"; • rok: „dokładnie 100 · ±1 70 · ±2 50 · dekada 20";
 *  • intro: „im wcześniej, tym więcej: ×2.0 → ×1.0"; • składanka/okładka/od tyłu krótko (EKSPERYMENT); • reszta (muzyka/lektor/od tyłu/fragment): tytuł/wykonawca/rok/album. */
const fmtX = x => '×' + Number(x).toFixed(1);
export function scoreLegend(mode){
  if(mode==='abcd' || mode==='quiz') return `trafienie ${PTS.quiz} · szybkość · seria`;
  if(mode==='year') return `dokładnie ${YEAR_PTS.exact} · ±1 ${YEAR_PTS.off1} · ±2 ${YEAR_PTS.off2} · dekada ${YEAR_PTS.decade}`;
  if(mode==='intro') return `im wcześniej, tym więcej: ${fmtX(INTRO_MULTS[0])} → ${fmtX(INTRO_MULTS[INTRO_MULTS.length-1])}`;
  if(mode==='medley') return `wykonawca ${ARTIST_ONLY_PTS} · szybkość · seria`;
  if(mode==='cover') return `wykonawca ${ARTIST_ONLY_PTS} · album +${PTS.album} · im mniej widać, tym więcej: ${fmtX(INTRO_MULTS[0])} → ${fmtX(INTRO_MULTS[INTRO_MULTS.length-1])}`;
  if(mode==='revsnip') return `tytuł ${PTS.title} · wykonawca ${PTS.artist} · rok/album +${PTS.year} · szybkość · „dłużej" ${fmtX(REVSNIP_MULTS[REVSNIP_MULTS.length-1])}`;
  return `tytuł ${PTS.title} · wykonawca ${PTS.artist} · rok ±2 +${PTS.year} · album +${PTS.album} · szybkość do +${Math.round(SPEED_BONUS_MAX*100)}% · seria ×1,5 / ×2`;
}

/* ======================= QUIZ (SPEC v2) — wspólne dla solo / MP-host / serwera =======================
 * Kontrakt: backlog/audyt-2026-10/SPEC-paczki-v2.md. Czyste funkcje, rng wstrzykiwany. */

const MC_LETTERS = 'ABCD';
// pytanie ABCD: rozdziel treść od opcji „A) … B) …" (2–4 opcje). null = pytanie otwarte.
export function parseMC(prompt){
  const lines=String(prompt||'').split('\n');
  const first=lines.findIndex(l=>/^[ABCD]\)/.test(l.trim()));
  if(first<0) return null;
  const options=[];
  for(let i=first;i<lines.length;i++){ const m=lines[i].trim().match(/^([ABCD])\)\s*(.+)$/); if(m) options.push({letter:m[1],text:m[2].trim()}); }
  if(options.length<2 || options.length>4) return null;
  return { question: lines.slice(0,first).join('\n').trim(), options };
}
// indeks poprawnej opcji: litera z answers[0] (dane), inaczej opcja pasująca do któregoś wariantu tekstowego
function mcCorrectIndex(options, ans){
  const a0=String((ans&&ans[0])||'').trim().toUpperCase();
  if(/^[A-D]$/.test(a0)){ const i=options.findIndex(o=>o.letter===a0); if(i>=0) return i; }
  const texts=(ans||[]).filter(v=>norm(v).length>1);
  let i=options.findIndex(o=>texts.some(v=>norm(v)===norm(o.text)));
  if(i<0) i=options.findIndex(o=>texts.some(v=>textMatch(o.text, v)));
  return i;
}
// klucz pytania (seen-set, statystyki trenera): znormalizowana TREŚĆ bez opcji ABCD → stabilny po tasowaniu
// Łamigłówki: rebus (display:'rebus') to głównie emoji, które norm() wycina — klucz zachowuje surową linię
// rebusu (inaczej wszystkie rebusy z tą samą podpowiedzią „🎵 tytuł · hit lat 80." byłyby „tym samym pytaniem").
export function quizKey(q){
  const p=(q&&q.prompt)||''; const mc=parseMC(p);
  const text = mc ? mc.question : p;
  if(q && q.display==='rebus'){
    const lines=String(text).split('\n');
    return 'rebus:'+lines[0].replace(/\s+/g,' ').trim()+'|'+norm(lines.slice(1).join(' '));
  }
  return norm(text);
}
/* F3 #3: tasowanie ABCD w runtime. Zwraca KOPIĘ pytania: prompt z opcjami w nowej kolejności (litery A..),
 * answers[slot0] = [nowa litera, tekst poprawnej opcji, ...aliasy bez jednoliterowych a–d] oraz
 * mc = {question, options:[{letter,text}], correct:'B'}. Pytanie otwarte → bez zmian (ta sama referencja).
 * Gdy poprawnej opcji nie da się ustalić — bez tasowania (mc.correct=null, ocena po wariantach). */
export function shuffleMC(q, rng=Math.random){
  const mc=parseMC(q&&q.prompt); if(!mc) return q;
  const key=(q.slots&&q.slots[0]&&q.slots[0].key)||'a';
  const ans=(q.answers&&q.answers[key])||[];
  const ci=mcCorrectIndex(mc.options, ans);
  if(ci<0) return { ...q, mc:{ ...mc, correct:null } };
  const order=mc.options.map((_,i)=>i);
  for(let i=order.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
  const options=order.map((oi,ni)=>({ letter:MC_LETTERS[ni], text:mc.options[oi].text }));
  const correct=MC_LETTERS[order.indexOf(ci)];
  const correctText=mc.options[ci].text;
  const seen=new Set([norm(correctText)]);
  const aliases=ans.filter(v=>{ const n=norm(v); if(n.length<=1 || seen.has(n)) return false; seen.add(n); return true; });
  const prompt=(mc.question ? mc.question+'\n' : '')+options.map(o=>o.letter+') '+o.text).join('\n');
  return { ...q, prompt, answers:{ ...q.answers, [key]:[correct, correctText, ...aliases] },
    mc:{ question:mc.question, options, correct } };
}
// mc z poprawną literą dla pytania (już potasowanego albo surowego z danych)
function mcOf(q){
  if(q && q.mc && Array.isArray(q.mc.options)) return q.mc;
  const mc=parseMC(q&&q.prompt); if(!mc) return null;
  const key=(q.slots&&q.slots[0]&&q.slots[0].key)||'a';
  const ci=mcCorrectIndex(mc.options, (q.answers&&q.answers[key])||[]);
  return { ...mc, correct: ci>=0 ? mc.options[ci].letter : null };
}
/* ABCD: ocena po WYBRANEJ OPCJI. guess = litera („B", „b)", „B) Beta") albo tekst opcji (MP — pole tekstowe).
 * Alias jednoliterowy nigdy nie zalicza (koliduje z literą innej opcji — F3/#13). */
function evaluateMC(mc, ans, guess, match){
  const g=String(guess||'').trim();
  if(!g) return { ok:false, chosen:null };
  const lm=g.match(/^([A-Da-d])(?:\s*[).:]\s*.*)?$/);
  let chosen=-1;
  if(lm) chosen=mc.options.findIndex(o=>o.letter===lm[1].toUpperCase());
  if(chosen<0){
    const ng=norm(g);
    chosen=mc.options.findIndex(o=>norm(o.text)===ng);
    if(chosen<0){
      let best=Infinity;
      mc.options.forEach((o,i)=>{ if(match(g,o.text)){ const d=lev(ng,norm(o.text)); if(d<best){ best=d; chosen=i; } } });
    }
  }
  if(chosen>=0){
    const o=mc.options[chosen];
    const ok = mc.correct ? o.letter===mc.correct : (ans||[]).some(v=>norm(v).length>1 && match(o.text, v));
    return { ok, chosen:o.letter };
  }
  // nie wskazano żadnej opcji → wariant tekstowy poprawnej odpowiedzi (bez jednoliterowych)
  return { ok: (ans||[]).slice(mc.correct?1:0).some(v=>norm(v).length>1 && match(g,v)), chosen:null };
}
// pula „wymień N" — lista pozycji (każda = niepusta lista aliasów-stringów); zła → null (ocena per slot)
export function poolOf(q){
  if(!q || !Array.isArray(q.pool)) return null;
  const pool=q.pool.filter(Array.isArray).map(it=>it.filter(v=>typeof v==='string' && v.trim())).filter(it=>it.length);
  return pool.length ? pool : null;
}
/* F3 #1: ocena pytania quizu (solo + MP). guesses = {slotKey: tekst}.
 * Zwraca { ok, bySlot:{key:bool}, matched:[poolIndex|null] (per slot), display:{key: forma kanoniczna},
 *          others:[kanoniczne nietrafione pozycje puli spoza display], chosen (ABCD: litera wybranej opcji) }.
 * • ABCD → ocena po wybranej opcji (evaluateMC);
 * • `pool` → sloty WYMIENNE: maksymalne skojarzenie dwudzielne pola↔pozycje (Kuhn, małe N), ta sama pozycja
 *   nie zalicza dwóch pól; display = trafiona pozycja albo kolejna nietrafiona;
 * • inaczej per slot: dowolny wariant answers[key]; display = answers[key][0]. */
export function evaluateQuiz(q, guesses, match=textMatch, slotsIn){
  const slots=slotsIn || (q && q.slots) || [];
  const gs=guesses||{};
  const bySlot={}, display={}, matched=slots.map(()=>null);
  let others=[], chosen=null;
  const mc = slots.length===1 ? mcOf(q) : null;
  const pool = poolOf(q);
  if(mc){
    const k=slots[0].key, ans=(q.answers&&q.answers[k])||[];
    const r=evaluateMC(mc, ans, gs[k], match);
    bySlot[k]=r.ok; chosen=r.chosen;
    const c=mc.options.find(o=>o.letter===mc.correct);
    display[k]= c ? c.letter+') '+c.text : String(ans[0]||'');
  } else if(pool){
    const vals=slots.map(s=>String(gs[s.key]||''));
    const adj=vals.map(g=> g.trim() ? pool.map((it,j)=> it.some(v=>match(g,v)) ? j : -1).filter(j=>j>=0) : []);
    const owner=pool.map(()=>-1);
    const aug=(i,vis)=>{ for(const j of adj[i]){ if(vis[j]) continue; vis[j]=true;
      if(owner[j]<0 || aug(owner[j],vis)){ owner[j]=i; return true; } } return false; };
    vals.forEach((_,i)=>aug(i, pool.map(()=>false)));
    owner.forEach((i,j)=>{ if(i>=0) matched[i]=j; });
    const used=new Set(matched.filter(j=>j!=null));
    const rest=pool.map((_,j)=>j).filter(j=>!used.has(j));
    slots.forEach((s,i)=>{
      bySlot[s.key]=matched[i]!=null;
      const j = matched[i]!=null ? matched[i] : rest.shift();
      display[s.key] = j!=null ? pool[j][0] : '';
    });
    others=rest.map(j=>pool[j][0]);
  } else {
    slots.forEach(s=>{
      const vs=(q&&q.answers&&q.answers[s.key])||[];
      bySlot[s.key]=vs.some(v=>match(String(gs[s.key]||''), v));
      display[s.key]=String(vs[0]||'');
    });
  }
  const ok = slots.length>0 && slots.every(s=>bySlot[s.key]);
  return { ok, bySlot, matched, display, others, chosen };
}

/* Łamigłówki: częściowe punkty (pytanie z `partial:true`) — ułamek trafionych slotów (0..1); null = zwykły quiz
 * („wszystko albo nic"). `ev` = wynik evaluateQuiz. ABCD/pula nie są częściowe (jeden wybór / wymienne sloty). */
export function quizPartialFrac(q, ev){
  if(!q || q.partial!==true || !ev || !ev.bySlot) return null;
  const keys=Object.keys(ev.bySlot);
  if(!keys.length) return null;
  return keys.filter(k=>ev.bySlot[k]).length/keys.length;
}

/* Łamigłówki: utwór-rozwiązanie do odsłuchu w ODSŁONIE (solo + MP). Pytanie niesie `track:{title,artist}`
 * albo `tracks:[{title,artist}|null, …]` (per slot, „Jedna litera"). To zdradza odpowiedź → w MP jedzie
 * wyłącznie w game.reveal (sekret do REVEAL). Sanityzacja wspólna z serwerem: stringi przycięte, ≤3 elementy. */
export const LISTEN_MAX = 3;
export const LISTEN_TEXT_MAX = 120;
function cleanListenTrack(t){
  if(!t || typeof t!=='object' || Array.isArray(t)) return null;
  const clip=v=> typeof v==='string' ? v.trim().slice(0, LISTEN_TEXT_MAX) : '';
  const title=clip(t.title), artist=clip(t.artist);
  return title && artist ? { title, artist } : null;
}
// {track?, tracks?} — tylko poprawne pola (serwer: clampQuestion); tracks z co najmniej jednym utworem
export function clampQuizTrack(q){
  const out={};
  const t=cleanListenTrack(q && q.track); if(t) out.track=t;
  if(q && Array.isArray(q.tracks)){
    const ts=q.tracks.slice(0, LISTEN_MAX).map(cleanListenTrack);
    if(ts.some(Boolean)) out.tracks=ts;
  }
  return out;
}
// płaska lista do odtworzenia: [{title, artist, label}] (label = etykieta slotu dla `tracks`), ≤ LISTEN_MAX
export function quizListen(q){
  const c=clampQuizTrack(q);
  if(c.tracks){
    const slots=(q && Array.isArray(q.slots)) ? q.slots : [];
    return c.tracks.map((t,i)=> t ? { ...t, label:String((slots[i] && (slots[i].label||slots[i].key)) || (i+1)).slice(0, 40) } : null).filter(Boolean);
  }
  return c.track ? [{ ...c.track, label:'' }] : [];
}
// lista z odsłony (MP: reveal.listen z sieci) → bezpieczna kopia (ten sam kształt co quizListen)
export function listenList(v){
  if(!Array.isArray(v)) return [];
  return v.slice(0, LISTEN_MAX).map(x=>{ const t=cleanListenTrack(x); return t ? { ...t, label:typeof x.label==='string' ? x.label.slice(0,40) : '' } : null; }).filter(Boolean);
}

/* F3 #5: trwały seen-set quizu (czyste helpery; storage robi warstwa app/). */
export const QUIZ_SEEN_LIMIT = 400;
// pula niezagranych pytań; wyczerpana → reset (bez ostatnio zagranego, gdy jest wybór)
export function freshQuestions(questions, seenKeys){
  const all=(questions||[]).filter(q=>q && q.prompt);
  const seen=new Set(seenKeys||[]);
  const pool=all.filter(q=>!seen.has(quizKey(q)));
  if(pool.length || !all.length) return { pool, reset:false };
  const last=(seenKeys||[])[(seenKeys||[]).length-1];
  const again=all.filter(q=>quizKey(q)!==last);
  return { pool: again.length ? again : all, reset:true };
}
// dopisz klucz (bez duplikatów, najnowszy na końcu), przytnij do limitu
export function rememberSeen(seenKeys, key, limit=QUIZ_SEEN_LIMIT){
  const out=(seenKeys||[]).filter(k=>k!==key); out.push(key);
  return out.slice(-limit);
}
