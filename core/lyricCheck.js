/* core/lyricCheck.js — czysta logika „tekstu do lektora" we własnych kategoriach:
 * limit długości + ostrzeżenie o wycieku odpowiedzi (tytuł/wykonawca w przekładzie).
 * Bez DOM/Web API. Serwer przyjmuje do 12000 znaków na utwór; trzymamy krótki fragment. */
import { norm } from './scoring.js';
import { clipText } from './util.js';

export const LYRIC_MAX = 500;      // znaków przekładu na utwór (krótki fragment, mieści się w limicie serwera)
const MIN_LEAK_LEN = 3;            // krótsze nazwy (np. „U2") dałyby fałszywe alarmy

/* przytnij przekład do limitu (trim + slice) */
export function clipLyric(v){ return clipText(v, LYRIC_MAX); }

/* czy fraza (po normalizacji) występuje w tekście jako całe słowa */
function hasPhrase(hay, needle){
  const n=norm(needle); if(n.length<MIN_LEAK_LEN) return false;
  return (' '+norm(hay)+' ').includes(' '+n+' ');
}

/* które odpowiedzi wyciekają w tekście → [] | ['title'] | ['artist'] | ['title','artist'] */
export function lyricLeaks(lyric, title, artist){
  const out=[];
  if(!lyric) return out;
  if(hasPhrase(lyric, title)) out.push('title');
  if(hasPhrase(lyric, artist)) out.push('artist');
  return out;
}
