/* core/lektorVoice.js — język lektora i wybór głosu (czyste, zero DOM / Web Speech).
 * Lektor czyta opis w JĘZYKU KATEGORII (lyrics.js: `lang` na poziomie kategorii, domyślnie 'pl'; „polskie po
 * angielsku" = 'en'). Bez tego angielski tekst szedł polskim głosem (polska fonetyka).
 * Współdzielone: app/lektor.js (wybór głosu systemowego i Pipera), app/solo.js / app/mp.js (język z kategorii),
 * server/authorityRoom.js (sanityzacja `lang` z puli hosta). */

export const LEKTOR_LANGS = ['pl', 'en'];
// cokolwiek z sieci/danych → 'pl' | 'en' (nieznane/brak → 'pl': stary serwer/host nie przekazuje języka)
export function lektorLang(x){
  const s = String(x == null ? '' : x).trim().toLowerCase();
  return s === 'en' || /^en[-_]/.test(s) ? 'en' : 'pl';
}
// język kategorii (lyrics.js) → 'pl' | 'en'
export function catLektorLang(cat){ return lektorLang(cat && cat.lang); }

// znacznik BCP-47 dla SpeechSynthesisUtterance.lang, gdy nie znaleziono głosu
export const LEKTOR_BCP47 = { pl: 'pl-PL', en: 'en-US' };
/* Głosy Pipera (@diffusionstudio/vits-web@1.0.3 — oba identyfikatory są na liście voices pakietu;
 * sprawdzone w dist/vits-web.js). */
export const PIPER_VOICES = { pl: 'pl_PL-gosia-medium', en: 'en_US-hfc_female-medium' };
export function piperVoiceFor(lang){ return PIPER_VOICES[lektorLang(lang)]; }

// głosy wyższej jakości (Edge „Natural", Azure „Neural", macOS/iOS „Enhanced"/„Premium")
const QUALITY = /\b(?:natural|neural|enhanced|premium)\b/i;
// preferowane regiony: en → US, potem GB, potem reszta angielskich; pl → pl-PL
const REGION_PREF = { en: ['en-us', 'en-gb'], pl: ['pl-pl'] };
const langTag = v => String((v && v.lang) || '').replace('_', '-').toLowerCase();
function matchesLang(v, lang){
  const t = langTag(v);
  if(t === lang || t.startsWith(lang + '-')) return true;
  // stare WebKity podają puste/dziwne `lang` — awaryjnie po nazwie głosu
  if(!t) return lang === 'pl' ? /pol(?:ish|ski)/i.test(v.name || '') : /english/i.test(v.name || '');
  return false;
}
/* Wybierz głos syntezatora systemowego dla języka: tylko głosy tego języka; ranking: jakość (Natural/Neural/
 * Enhanced/Premium) > region preferowany (en-US > en-GB > inne en) > lokalny (localService) > głos domyślny >
 * kolejność listy. Brak głosu w języku → null (wołający ustawia samo u.lang). */
export function pickVoice(voices, lang){
  const L = lektorLang(lang);
  const list = Array.isArray(voices) ? voices : [];
  const prefs = REGION_PREF[L] || [];
  let best = null, bestScore = -Infinity;
  list.forEach((v, i) => {
    if(!v || !matchesLang(v, L)) return;
    const ri = prefs.indexOf(langTag(v));
    const score = (QUALITY.test(v.name || '') ? 1000 : 0)
      + (ri >= 0 ? (prefs.length - ri) * 100 : 0)
      + (v.localService ? 10 : 0)
      + (v.default ? 5 : 0)
      - i / 10000;                        // stabilnie: przy remisie wcześniejszy na liście
    if(score > bestScore){ best = v; bestScore = score; }
  });
  return best;
}
