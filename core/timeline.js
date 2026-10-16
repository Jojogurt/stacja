/* core/timeline.js — EKSPERYMENT: tryb „oś czasu" (w stylu gry Hitster). Czysty rdzeń (zero DOM / Web API).
 *
 * Gracz buduje oś czasu z kart-utworów: na starcie 1 karta-kotwica (odkryty utwór z rokiem), potem każde pytanie
 * = zajawka utworu o WIARYGODNYM roku (dekada kategorii / rok z danych playlisty — trackSelect.yearReliable).
 * Gracz wybiera „szczelinę" na osi (przed pierwszą, między kartami, po ostatniej). Poprawnie, gdy rok utworu mieści
 * się między sąsiadami (równy rok sąsiada = poprawnie po OBU stronach). Trafienie → karta zostaje na osi,
 * pudło → odpada. Punkty: core/scoring.scoreRound({placeOk, okTitle, okArtist}) (100 + żetony 20/20).
 *
 * Model: `cards` = tablica kart {track, artist, year:number, art} POSORTOWANA rosnąco po roku (stabilnie).
 * Szczelina `gap` ∈ [0..cards.length]: 0 = przed pierwszą, cards.length = po ostatniej, k = między k−1 a k. */
import { parseYear } from './scoring.js';
import { yearReliable, parseRange } from './trackSelect.js';

export const TIMELINE_TRIES = 5;           // ile utworów próbujemy, by znaleźć wiarygodny rok (i nie 3. ten sam rok z rzędu)
export const TIMELINE_SAME_YEAR_RUN = 2;   // max kolejnych utworów z tego samego roku (trzeci z rzędu — unikamy)

// karta osi z utworu (null, gdy brak roku)
export function timelineCard(t){
  const y=parseYear(t && t.year);
  if(y==null) return null;
  return { track:String((t && t.track)||''), artist:String((t && t.artist)||''), year:y, art:String((t && t.art)||'') };
}
// utwór nadaje się na kartę: ma rok i ten rok jest wiarygodny (dekada kategorii / rok z danych playlisty)
export function timelineEligible(t, cat){
  if(!t || t.error) return false;
  if(parseYear(t.year)==null) return false;
  return yearReliable(t.year, cat && cat.range, t.yearSrc);
}
/* kategoria z wiarygodnym rokiem: dekada (pula wykonawców + zakres lat) albo playlista z rokiem w danych
 * (≥4 utwory i ≥ połowa z rokiem). Style bez zakresu (rok z iTunes bywa remasterem) — bez osi czasu. */
export function timelineCapable(c){
  if(!c || c.kind==='quiz' || c.kind==='lyrics') return false;
  if(Array.isArray(c.artists) && c.artists.length) return !!parseRange(c.range);
  const songs=Array.isArray(c.songs) ? c.songs : [];
  const withYear=songs.filter(s=>s && parseYear(s.year)!=null).length;
  return withYear>=4 && withYear*2>=songs.length;
}

// posortuj karty po roku (stabilnie — karty z tym samym rokiem zostają w kolejności dołożenia)
export function sortCards(cards){
  return (Array.isArray(cards) ? cards : []).map((c,i)=>({ c, i })).sort((a,b)=>(a.c.year-b.c.year) || (a.i-b.i)).map(x=>x.c);
}
export function gapCount(cards){ return (Array.isArray(cards) ? cards.length : 0) + 1; }
// czy `gap` to poprawny indeks szczeliny (liczba całkowita w [0..n])
export function validGap(cards, gap){
  const n=Array.isArray(cards) ? cards.length : 0;
  return Number.isInteger(gap) && gap>=0 && gap<=n;
}
// rok sąsiadów szczeliny: {lo, hi} (null = brak sąsiada z tej strony)
export function gapBounds(cards, gap){
  if(!validGap(cards, gap)) return null;
  return { lo: gap>0 ? cards[gap-1].year : null, hi: gap<cards.length ? cards[gap].year : null };
}
// ocena szczeliny: rok w [lo..hi] (równy rok sąsiada = poprawnie po obu stronach)
export function gapOk(cards, gap, year){
  const b=gapBounds(cards, gap), y=parseYear(year);
  if(!b || y==null) return false;
  return (b.lo==null || b.lo<=y) && (b.hi==null || y<=b.hi);
}
// wszystkie poprawne szczeliny dla roku (odsłona: „gdzie powinna była trafić")
export function correctGaps(cards, year){
  const out=[];
  for(let g=0; g<gapCount(cards); g++) if(gapOk(cards, g, year)) out.push(g);
  return out;
}
/* wstaw kartę: w wybraną szczelinę, gdy poprawna (karta ląduje tam, gdzie położył ją gracz — ważne przy równych latach);
 * inaczej w naturalne miejsce (po kartach z rokiem ≤). Zwraca { cards: NOWA tablica, index }. */
export function insertCard(cards, card, gap){
  const list=Array.isArray(cards) ? cards.slice() : [];
  let index;
  if(validGap(list, gap) && gapOk(list, gap, card.year)) index=gap;
  else { index=0; while(index<list.length && list[index].year<=card.year) index++; }
  list.splice(index, 0, card);
  return { cards:list, index };
}
// opis szczeliny słowami („przed 1980" / „między 1980 a 1985" / „po 1990" / „pierwsza karta")
export function gapLabel(cards, gap){
  const b=gapBounds(cards, gap);
  if(!b) return '—';
  if(b.lo==null && b.hi==null) return 'pierwsza karta';
  if(b.lo==null) return 'przed '+b.hi;
  if(b.hi==null) return 'po '+b.lo;
  return b.lo===b.hi ? 'obok '+b.lo : 'między '+b.lo+' a '+b.hi;
}

// czy rok nie byłby TRZECIM z rzędu tym samym (recent = lata kolejnych kart/pytań, najnowszy na końcu)
export function yearRunOk(recent, year, max=TIMELINE_SAME_YEAR_RUN){
  const r=Array.isArray(recent) ? recent : [];
  if(r.length<max) return true;
  return !r.slice(-max).every(y=>y===year);
}
/* wybór utworu na kartę (kotwica albo pytanie): do `tries` wywołań `resolve()` (wstrzyknięte — web/serwer/test).
 * Pierwszy utwór z wiarygodnym rokiem, który nie byłby trzecim tym samym rokiem z rzędu, wygrywa. Zapas: utwór
 * z wiarygodnym rokiem łamiący tylko regułę serii (`relaxed`). Brak sieci (`offline`) przerywa od razu.
 * Zwraca { track, card [, relaxed] } | { aborted:true } (runda porzucona) | { error:true, reason, track }
 * — `track` = ostatni grywalny utwór BEZ wiarygodnego roku (wołający może zagrać go jak „muzykę") albo null. */
export async function pickTimelineTrack({ resolve, cat, recentYears=[], tries=TIMELINE_TRIES, alive=()=>true }){
  let spare=null, playable=null, lastErr=null;
  for(let i=0; i<tries; i++){
    let t;
    try{ t=await resolve(); }catch(_e){ t={ error:true, reason:'offline' }; }
    if(!alive()) return { aborted:true };
    if(!t || t.error){ lastErr=(t && t.reason) || 'offline'; if(lastErr==='offline') break; continue; }
    if(!timelineEligible(t, cat)){ playable=playable || t; continue; }
    const card=timelineCard(t);
    if(yearRunOk(recentYears, card.year)) return { track:t, card };
    if(!spare) spare={ track:t, card, relaxed:true };
  }
  if(spare) return spare;
  return { error:true, reason: playable ? 'noyear' : (lastErr || 'empty'), track: playable };
}

// polska odmiana „karta"
export function cardsWord(n){
  const k=Math.abs(Math.floor(Number(n))||0), d=k%10, dd=k%100;
  if(k===1) return 'karta';
  return (d>=2 && d<=4 && !(dd>=12 && dd<=14)) ? 'karty' : 'kart';
}
// podsumowanie osi („5 kart · 1979–1994")
export function timelineSummary(cards){
  const list=Array.isArray(cards) ? cards : [];
  if(!list.length) return '0 kart';
  const s=sortCards(list), lo=s[0].year, hi=s[s.length-1].year;
  return `${list.length} ${cardsWord(list.length)} · ${lo===hi ? lo : lo+'–'+hi}`;
}
