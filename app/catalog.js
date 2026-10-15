/* app/catalog.js — katalog kategorii: dane (window.CATEGORIES) + wrappery modelu meczu
 * związane z ALL_CATS + playlisty (localStorage). Wspólny dla solo i MP — importowany wprost
 * (nie wstrzykiwany), więc jedno źródło prawdy o kategoriach. Rdzeń (core/) ich nie zna.
 *
 * ALL_CATS/ALL_KEYS są MUTOWANE przez plMerge/plRemove (dodanie/usunięcie playlisty) —
 * to ten sam obiekt/tablica we wszystkich importach (żywe wiązania ES), więc zmiana widoczna wszędzie. */
import { modesFor as _modesFor, catLabel as _catLabel, buildMatch as _buildMatch,
  randomPools as _randomPools, matchHeader as _matchHeader } from '../core/match.js';
import { quizKey, freshQuestions, rememberSeen, shuffleMC } from '../core/scoring.js';
import { lsGet, lsSet } from './dom.js';

const CATS = (window.CATEGORIES) || {decades:{},styles:{}};
export const ERAS = CATS.decades || {};
export const STYLES = CATS.styles || {};
export const READY = CATS.playlists || {};        // gotowe playlisty (playlists.js)
export const LYRICS = CATS.lyrics || {};           // przetłumaczone teksty (lyrics.js) — tryb lektor
export const QUIZ = CATS.quiz || {};               // wiedza ogólna (questions.js) — tryb quiz, bez audio
export const ERA_KEYS = Object.keys(ERAS);
export const STYLE_KEYS = Object.keys(STYLES);
export const READY_KEYS = Object.keys(READY);
export const LYRICS_KEYS = Object.keys(LYRICS);
export const QUIZ_KEYS = Object.keys(QUIZ);

/* wszystkie kategorie w jednej mapie — logika rundy nie rozróżnia dekady/stylu */
export const ALL_CATS = {...ERAS, ...STYLES, ...READY, ...LYRICS, ...QUIZ};
export const ALL_KEYS = [...ERA_KEYS, ...STYLE_KEYS, ...READY_KEYS, ...LYRICS_KEYS, ...QUIZ_KEYS];
export const CATS_OK = (ERA_KEYS.length + STYLE_KEYS.length) > 0;

/* F2a #8: kategorie quizu dociągnięte przez quiz-loader.js PO starcie (wolna sieć) — dopnij je do
   żywych tablic/map (ten sam obiekt we wszystkich importach). Idempotentne; zwraca NOWE klucze. */
export function addLateQuizCats(src = (window.CATEGORIES && window.CATEGORIES.quiz) || {}){
  const added = [];
  Object.keys(src).forEach(k => {
    const data = src[k];
    if(!data || data.kind !== 'quiz' || !Array.isArray(data.questions)) return;
    if(ALL_CATS[k] === data && QUIZ_KEYS.includes(k)) return;
    QUIZ[k] = data; ALL_CATS[k] = data;
    if(!QUIZ_KEYS.includes(k)){ QUIZ_KEYS.push(k); added.push(k); }
    if(!ALL_KEYS.includes(k)) ALL_KEYS.push(k);
  });
  return added;
}

/* ---- model meczu (rdzeń w core/match.js) — lokalne wrappery wiążą ALL_CATS ---- */
export const modesFor    = (catKey)             => _modesFor(catKey, ALL_CATS);
export const catLabel    = (catKey)             => _catLabel(catKey, ALL_CATS);
export const buildMatch  = (catPool,modePool,r) => _buildMatch(catPool, modePool, r, ALL_CATS);
export const randomPools = ()                   => _randomPools(ALL_KEYS, ALL_CATS);
export const matchHeader = (m)                  => _matchHeader(m, ALL_CATS);

/* ---- playlisty ze Spotify (localStorage) — dane; UI jest w app/solo.js ---- */
const PL_PREFIX='pl:';
export function plLoad(){ try{ return JSON.parse(localStorage.getItem('stacjaPlaylists')||'{}'); }catch(e){ return {}; } }
export function plSave(o){ try{ localStorage.setItem('stacjaPlaylists', JSON.stringify(o)); }catch(_e){} }   // 5.10: quota/tryb prywatny nie może rzucać
export function plMerge(){ const pls=plLoad(); Object.keys(pls).forEach(k=>{ ALL_CATS[k]=pls[k]; if(!ALL_KEYS.includes(k)) ALL_KEYS.push(k); }); }
/* wspólny rdzeń importu — fetch z edge function „spotify", zapis do localStorage, merge do ALL_CATS.
   Zwraca {key,name,count} albo rzuca błędem. Używany przez solo (plImport) i MP (mpPlImport). */
export async function plFetch(url){
  const cfg=window.STACJA_CONFIG||{};
  if(!cfg.roomsBase){ throw new Error('Brak połączenia z serwerem.'); }
  const r=await fetch(cfg.roomsBase+'/spotify?url='+encodeURIComponent(url));
  const d=await r.json();
  if(!r.ok || d.error){ throw new Error(d.error||('http '+r.status)); }
  const songs=(d.tracks||[]).filter(t=>t.title&&t.artist);
  if(!songs.length){ throw new Error('Pusta lub niepubliczna playlista.'); }
  const key=PL_PREFIX+Math.random().toString(36).slice(2,8);
  const pls=plLoad(); pls[key]={label:d.name||'Playlista', songs, kind:'playlist'}; plSave(pls);
  plMerge();
  return { key, name:d.name||'', count:songs.length };
}

/* ===== F3 #5: trwały seen-set quizu (localStorage, per kategoria) — wspólny dla solo i hosta MP (relay) =====
 * Klucz pytania = quizKey (znormalizowana treść BEZ opcji ABCD → stabilny po tasowaniu). Ostatnie
 * QUIZ_SEEN_LIMIT na kategorię; wyczerpana pula → reset kategorii (bez ostatnio zagranego). */
const QUIZ_SEEN_KEY = 'stacjaQuizSeen';
function seenLoad(){ try{ const o=JSON.parse(lsGet(QUIZ_SEEN_KEY,'{}')||'{}'); return (o && typeof o==='object' && !Array.isArray(o)) ? o : {}; }catch(_e){ return {}; } }
export function quizSeenGet(catKey){ const v=seenLoad()[catKey]; return Array.isArray(v) ? v.filter(k=>typeof k==='string') : []; }
export function quizSeenSet(catKey, keys){ const o=seenLoad(); o[catKey]=keys; lsSet(QUIZ_SEEN_KEY, JSON.stringify(o)); }
// pula niezagranych pytań kategorii (reset trwałego zbioru, gdy wyczerpana)
export function quizFreshPool(catKey, questions){
  const r=freshQuestions(questions, quizSeenGet(catKey));
  if(r.reset) quizSeenSet(catKey, []);
  return r.pool;
}
// zapamiętaj zagrane pytanie i zwróć je POTASOWANE (ABCD w runtime; otwarte bez zmian)
export function quizTake(catKey, q){
  quizSeenSet(catKey, rememberSeen(quizSeenGet(catKey), quizKey(q)));
  return shuffleMC(q);
}
