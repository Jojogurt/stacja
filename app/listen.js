/* app/listen.js — Łamigłówki: „▶ posłuchaj" w ODSŁONIE (solo i MP). Po odpowiedzi gra ~10 s zajawki
 * utworu-rozwiązania z iTunes (wyszukiwanie „artysta tytuł" z F5 — ta sama ścieżka co playlisty:
 * core/trackSelect.matchSong wymaga zgodności tytułu I wykonawcy, inaczej nic nie gra).
 *
 * Moduł-liść (bez stanu gry): własny trwały element <audio> (odblokowywany w geście — unlockListen),
 * lista utworów bieżącej odsłony i delegacja kliknięć w [data-listen] (przyciski renderują solo i MP
 * jako HTML-string — bez inline JS z danymi). MP: o tym, czy ten klient może grać („🔈 dźwięk tylko u hosta"),
 * decyduje wołający (`allowed`). */
import { escapeHtml } from '../core/util.js';
import { listenList } from '../core/scoring.js';
import { resolveTrack } from '../adapters-web/itunesRepository.js';
import { unlockAudioElement } from '../adapters-web/webAudio.js';

export const LISTEN_SECS = 10;

let el = null;          // trwały element audio odsłuchu
let list = [];          // [{title, artist, label}] bieżącej odsłony
let allowed = true;     // czy ten klient odtwarza (MP pilot → false)
let playing = -1;       // indeks grającego utworu (-1 = cisza)
let loading = -1;       // indeks rozwiązywanego utworu
let gen = 0;            // token: każda nowa odsłona / stop unieważnia spóźnione rozwiązania
let stopT = null;
let snip = null;        // „Twój gust": zajawka spoza listy odsłony (sesja oceniania / półka) — { onState }
const cache = new Map();   // klucz „artysta|tytuł" → preview URL ('' = nie znaleziono)

function ensureEl(){
  if(el) return el;
  el = new Audio(); el.preload='auto';
  el.addEventListener('ended', ()=>{ if(playing>=0 || snip) stopPlayback(); });
  el.addEventListener('error', ()=>{ if(snip && playing<0){ if(stopT){ clearTimeout(stopT); stopT=null; } snipEnd('brak'); return; }
    if(playing>=0 || loading>=0){ const i=playing>=0?playing:loading; playing=-1; loading=-1; mark(i, 'brak'); } });
  return el;
}
// odblokowanie w GEŚCIE (solo: „Sprawdź"; MP: dołączenie/start/gałka) — iOS odblokowuje per element
export function unlockListen(){ try{ const e=ensureEl(); if(playing<0 && !snip) unlockAudioElement(e); }catch(_e){} }

function keyOf(t){ return (t.artist+'|'+t.title).toLowerCase(); }
export async function resolvePreview(t){
  const k=keyOf(t);
  if(cache.has(k)) return cache.get(k);
  let url='';
  try{
    const r=await resolveTrack({ cat:{ songs:[{ title:t.title, artist:t.artist }] }, seen:new Set(), recent:null, cfg:window.STACJA_CONFIG });
    url = (r && !r.error && r.preview) ? r.preview : '';
  }catch(_e){ url=''; }
  if(url || cache.size<200) cache.set(k, url);
  return url;
}

// stan przycisków w DOM (re-render MP odtwarza je z listenHTML — tu tylko bieżąca odsłona)
function label(i, state){
  const t=list[i]; if(!t) return '';
  const who = t.label ? t.label+': ' : '';
  if(state==='play') return '■ stop · '+who+t.title;
  if(state==='load') return '… szukam · '+who+t.title;
  if(state==='brak') return '✕ brak zajawki · '+who+t.title;
  return '▶ posłuchaj · '+who+t.title;
}
function stateOf(i){ return i===playing ? 'play' : (i===loading ? 'load' : (failed.has(i) ? 'brak' : '')); }
const failed = new Set();
function mark(i, state){
  if(state==='brak') failed.add(i);
  if(typeof document==='undefined') return;
  document.querySelectorAll('[data-listen]').forEach(b=>{
    const j=+b.dataset.listen; const st=stateOf(j);
    b.textContent=label(j, st); b.classList.toggle('on', st==='play'); b.classList.toggle('load', st==='load');
    b.setAttribute('aria-pressed', st==='play' ? 'true' : 'false');
  });
}

function snipEnd(state){ const s=snip; snip=null; if(s && s.onState){ try{ s.onState(state); }catch(_e){} } }
function stopPlayback(){
  if(stopT){ clearTimeout(stopT); stopT=null; }
  const was=playing; playing=-1;
  if(el){ try{ el.pause(); }catch(_e){} }
  if(was>=0) mark(was, '');
  if(snip) snipEnd('stop');
}
// zatrzymaj odsłuch (nowa runda / dalej / wyjście) — unieważnia też rozwiązywanie w toku
export function listenStop(){
  gen++; loading=-1;
  stopPlayback();
}

export async function listenPlay(i){
  if(!allowed || !list[i]) return;
  if(playing===i){ stopPlayback(); return; }   // toggle
  stopPlayback();
  const my=++gen;
  loading=i; mark(i, 'load');
  const url=await resolvePreview(list[i]);
  if(my!==gen) return;   // odsłona/klik się zmienił w trakcie wyszukiwania
  loading=-1;
  if(!url){ mark(i, 'brak'); return; }
  const a=ensureEl();
  a.muted=false;
  if(a.src!==url) a.src=url;
  try{ a.currentTime=0; }catch(_e){}
  playing=i; mark(i, 'play');
  try{ await a.play(); }
  catch(_e){ if(my===gen && playing===i){ playing=-1; mark(i, ''); } return; }   // autoplay zablokowany → przycisk zostaje
  if(my!==gen) return;
  stopT=setTimeout(()=>{ if(my===gen && playing===i) stopPlayback(); }, LISTEN_SECS*1000);
}

/* nowa odsłona: ustaw listę utworów i (opcjonalnie) od razu zagraj pierwszy.
 * opts.allowed=false (MP pilot przy „dźwięk tylko u hosta") → bez odtwarzania, przycisk zastąpiony notką. */
export function listenStart(tracks, { auto=true, allowed:al=true }={}){
  listenStop();
  list=listenList(tracks); allowed=!!al; failed.clear();
  if(auto && allowed && list.length) listenPlay(0);
  return list.length;
}
export function listenTracks(){ return list.slice(); }

/* „Twój gust": zajawka JEDNEGO utworu tym samym trwałym elementem (odblokowanym w geście — unlockListen).
 * t = { preview?, title, artist } — bez preview szuka jak „▶ posłuchaj" (resolvePreview, cache). Gra `secs` sekund
 * (start od `from` s — środek zajawki bywa ciekawszy niż cisza intra). onState('load'|'play'|'stop'|'brak').
 * Każde kolejne snippetPlay / listenStop / listenPlay przerywa poprzednie (onState('stop')). */
export async function snippetPlay(t, { secs=LISTEN_SECS, from=0, onState }={}){
  listenStop();
  const my=++gen;
  snip={ onState };
  try{ onState && onState('load'); }catch(_e){}
  const url = (t && typeof t.preview==='string' && /^https?:\/\//.test(t.preview)) ? t.preview : (t ? await resolvePreview(t) : '');
  if(my!==gen) return false;
  if(!url){ snipEnd('brak'); return false; }
  const a=ensureEl();
  a.muted=false;
  if(a.src!==url) a.src=url;
  try{ a.currentTime=from||0; }catch(_e){}
  try{ await a.play(); }
  catch(_e){ if(my===gen && snip){ snipEnd('stop'); } return false; }   // autoplay zablokowany → gracz klika ▶
  if(my!==gen) return false;
  try{ snip && snip.onState && snip.onState('play'); }catch(_e){}
  stopT=setTimeout(()=>{ if(my===gen) stopPlayback(); }, secs*1000);
  return true;
}
export const snippetPlaying = () => !!snip;

// HTML przycisków odsłony (MP render / solo) — tylko dane escapowane, indeks w data-listen
export function listenHTML(tracks, { allowed:al=allowed }={}){
  const ls=listenList(tracks);
  if(!ls.length) return '';
  if(!al) return '<div class="listen-row"><span class="listen-note">🔈 utwór gra u hosta</span></div>';
  const same = ls.length===list.length && ls.every((t,i)=>keyOf(t)===keyOf(list[i]));
  return '<div class="listen-row">'+ls.map((t,i)=>{
    const st = same ? stateOf(i) : '';
    const tx = same ? label(i, st) : '▶ posłuchaj · '+(t.label?t.label+': ':'')+t.title;
    return `<button type="button" class="listen-btn${st==='play'?' on':''}${st==='load'?' load':''}" data-listen="${i}" aria-pressed="${st==='play'?'true':'false'}">${escapeHtml(tx)}</button>`;
  }).join('')+'</div>';
}

// delegacja: jeden listener na dokument (przyciski powstają w innerHTML solo/MP)
if(typeof document!=='undefined'){
  document.addEventListener('click', (e)=>{
    const b=e.target && e.target.closest ? e.target.closest('[data-listen]') : null;
    if(!b) return;
    unlockListen();
    listenPlay(+b.dataset.listen);
  });
}

// do testów (siatka jsdom)
export const _listenDebug = () => ({ el, list, playing, loading, allowed });
