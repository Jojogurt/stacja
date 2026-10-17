/* core/guitarCovers.js — EKSPERYMENT „gitara": ZAOSTRZONA akceptacja coveru gitarowego (czysta, bez DOM/fetch).
 *
 * Problem z produkcji: „covery" okazywały się zwykłymi piosenkami z wyraźną gitarą (WOKAL) — samo słowo „guitar"
 * w tytule/wykonawcy/albumie nie wystarczało (np. „Acoustic Guitar Revival — Smells Like Teen Spirit (Acoustic
 * Version)", zespoły „Cover Sessions", remiksy „Guitar Version Sped Up"). Teraz wynik iTunes przechodzi TYLKO gdy:
 *   (a) TYTUŁ ma znacznik instrumentalny („Guitar Version", „Instrumental", „Fingerstyle", „Acoustic Guitar Version",
 *       „Guitar Cover", „Arr. for Guitar"), ALBO
 *   (b) wykonawca jest na kuratorowanej liście GUITAR_COVER_ARTISTS (wydają WYŁĄCZNIE instrumentalne covery na gitarze), ALBO
 *   (c) album ma w nazwie „Guitar Covers" / „Fingerstyle" / „Instrumental" I nazwa wykonawcy zawiera „guitar".
 * Zawsze odrzucane: „vocal", „feat."/„ft."/„featuring", „with lyrics", „karaoke" (w tytule, wykonawcy lub albumie)
 * oraz wytwórnie karaoke/podkładów z GUITAR_COVER_DENY (ich „Acoustic Guitar Instrumental" to podkłady do śpiewania).
 * Pozostałe reguły (słowo gitary, tytuł = oryginał, inny wykonawca, odrzuty instrumentów) — core/trackSelect.pickInstrumentalCover.
 */
import { norm } from './scoring.js';

/* Lista zbudowana z pomiaru iTunes (PL, 2026-10): wyszukiwania albumów „guitar covers", „fingerstyle covers",
 * „acoustic guitar covers", „instrumental guitar hits" itd. + wyniki zapytań „<hit> guitar" dla ~20 światowych hitów.
 * Kryterium wpisu: katalog wykonawcy to w przeważającej części instrumentalne covery/aranżacje na gitarę
 * (albumy typu „Guitar Covers, Vol. N", „Acoustic Guitar Renditions of …", „Fingerstyle Covers", „Spanish Guitar Hits")
 * albo znany gitarzysta fingerstyle grający covery. NIE wpisujemy: wykonawców z wokalnymi coverami („Covers Unplugged"
 * — „Jolene [feat. Lydia]"), mieszanych katalogów („Acoustic Guitar Collective", „Acoustic Guitar Revival" — też ukulele
 * i „Acoustic Version" bez pewności, że bez wokalu), wytwórni karaoke. Dopisując — sprawdź katalog w iTunes. */
export const GUITAR_COVER_ARTISTS = [
  // seria „Guitar Covers (Vol. N)" — instrumentalne covery pop na gitarze akustycznej
  'Andy Angel', 'Johan Kvarnström', 'Bourbon Pine', 'Johanna & Ebba Högberg', 'Simon Martin Perkins', 'Joni Laakkonen',
  'Nylon & Frets', 'LucasGitanoFamily', 'Beyond The Guitar', 'Sandor Enyedi', 'Tito Tadini',
  // „Acoustic Guitar Covers" — „(Arr. for Guitar)"
  'Django Wallace', 'Zack Rupert', 'Aleko Nunez', 'Robyn Goodall', 'Dario Solaire',
  // tribute/renditions na gitarze (całe katalogi instrumentalne)
  'Guitar Tribute Players', 'Acoustic Heartstrings', 'Guitar Dreamers', 'United Guitar Players',
  'Acoustic Guitar Guy', 'Nick Worraf',
  // gitara hiszpańska / klasyczna — covery hitów
  'Manuel Granada', 'Paco Nula', 'Sergi Vicente', 'Søren Bødker Madsen', 'Spanish Guitar Project',
  // gitarzyści fingerstyle (covery)
  'Sungha Jung', 'Kent Nishimura', 'Alexandr Misko', 'Gabriella Quevedo', 'Eddie van der Meer', 'Leon Alex',
  'Mattias Krantz', 'Daria Semikina', 'Renan Rusch', 'Evan Handyside', 'Mark D. Caribé', 'Fingerstyle Guitar Covers',
  // Deezer (pomiar 2026-10, top utworów sprawdzone): serie 'Guitar Pop Covers, Vol. N' / 'Instrumental Guitar Covers of Pop Hits'
  'Edy Hafler', 'Steve Petrunak',
];
// wytwórnie karaoke / podkładów / przeróbek TikTok — nawet ze znacznikiem „Instrumental" w tytule to nie „cover gitarowy"
export const GUITAR_COVER_DENY = ['singahit', 'Sing2Guitar', 'Pop Music Workshop', 'Backing Tracks For Guitarists', 'Play Along', 'Guitar Girl', 'Kris Farrow',
  // wokalista-akustyk: jego „X (Acoustic Guitar Version)" to własna wersja Z WOKALEM (pomiar 2026-10: ten sam wykonawca ma „Zombie" na płycie „Covered In Snow")
  'Mount Hayes'];

// (a) znacznik instrumentalny w TYTULE utworu
export const GUITAR_TITLE_MARK = /\bguitar\s+(?:version|cover|instrumental)\b|\binstrumental\b|\bfinger-?style\b|\barr(?:\.|anged)?\s+for\s+(?:solo\s+)?guitar\b/i;
// (c) album coverów/instrumentalny + wykonawca ze słowem „guitar"
export const GUITAR_ALBUM_MARK = /\bguitar\s+covers?\b|\bfinger-?style\b|\binstrumentals?\b/i;
export const GUITAR_ARTIST_WORD = /\bguitars?\b/i;
// twarde odrzuty (wokal / gość / tekst / karaoke)
export const GUITAR_HARD_REJECT = /\bvocals?\b|\bfeat\b\.?|\bft\.|\bfeaturing\b|with lyrics|\blyrics?\b|karaoke/i;

const key = s => norm(String(s||'').replace(/&/g, ' and '));
const ALLOW = new Set(GUITAR_COVER_ARTISTS.map(key));
const DENY = new Set(GUITAR_COVER_DENY.map(key));
export function isGuitarCoverArtist(name){ return ALLOW.has(key(name)); }

/* czy wynik iTunes `r` ({trackName, artistName, collectionName}) przechodzi zaostrzone reguły gitary.
 * → { ok, why } — why: 'title' | 'artist' | 'album' (powód akceptacji) albo powód odrzutu ('reject' | 'deny' | 'none'). */
export function guitarCoverVerdict(r){
  const t = String((r && r.trackName) || ''), a = String((r && r.artistName) || ''), c = String((r && r.collectionName) || '');
  if(GUITAR_HARD_REJECT.test(t+' \u0001 '+a+' \u0001 '+c)) return { ok:false, why:'reject' };
  if(DENY.has(key(a))) return { ok:false, why:'deny' };
  if(GUITAR_TITLE_MARK.test(t)) return { ok:true, why:'title' };
  if(isGuitarCoverArtist(a)) return { ok:true, why:'artist' };
  if(GUITAR_ALBUM_MARK.test(c) && GUITAR_ARTIST_WORD.test(a)) return { ok:true, why:'album' };
  return { ok:false, why:'none' };
}
export const guitarCoverOk = r => guitarCoverVerdict(r).ok;
