/* app/catalog.js — katalog kategorii: dane (window.CATEGORIES) + wrappery modelu meczu
 * związane z ALL_CATS + playlisty (localStorage). Wspólny dla solo i MP — importowany wprost
 * (nie wstrzykiwany), więc jedno źródło prawdy o kategoriach. Rdzeń (core/) ich nie zna.
 *
 * ALL_CATS/ALL_KEYS są MUTOWANE przez plMerge/plRemove (dodanie/usunięcie playlisty) —
 * to ten sam obiekt/tablica we wszystkich importach (żywe wiązania ES), więc zmiana widoczna wszędzie. */
import { modesFor as _modesFor, catLabel as _catLabel, buildMatch as _buildMatch,
  randomPools as _randomPools, matchHeader as _matchHeader } from '../core/match.js';

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

/* ---- model meczu (rdzeń w core/match.js) — lokalne wrappery wiążą ALL_CATS ---- */
export const modesFor    = (catKey)             => _modesFor(catKey, ALL_CATS);
export const catLabel    = (catKey)             => _catLabel(catKey, ALL_CATS);
export const buildMatch  = (catPool,modePool,r) => _buildMatch(catPool, modePool, r, ALL_CATS);
export const randomPools = ()                   => _randomPools(ALL_KEYS, ALL_CATS);
export const matchHeader = (m)                  => _matchHeader(m, ALL_CATS);

/* ---- playlisty ze Spotify (localStorage) — dane; UI jest w app/solo.js ---- */
const PL_PREFIX='pl:';
export function plLoad(){ try{ return JSON.parse(localStorage.getItem('stacjaPlaylists')||'{}'); }catch(e){ return {}; } }
export function plSave(o){ localStorage.setItem('stacjaPlaylists', JSON.stringify(o)); }
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
