/* app/taste.js — „Twój gust" (etap 1): magazyn ocen LOCAL-FIRST (localStorage 'stacjaTaste') + synchronizacja
 * z Workerem (/api/taste) + przycisk ❤️ „na półkę" w odsłonie (solo i MP — lokalnie u gracza, bez zmian protokołu).
 * Logika ocen/merge/limitów jest czysta w core/taste.js; tu tylko stan, zapis, sieć i HTML przycisku.
 *
 * Synchronizacja: każda zmiana trafia do kolejki ('stacjaTasteQ': push = klucze do wysłania, del = do skasowania),
 * wysyłka z debounce ~2 s, ponowienia z narastającą przerwą. Przy starcie (gdy jest już token — bez tworzenia
 * profilu) i przy wejściu na ekran „Twój gust" — pobranie + merge last-write-wins. Stary Worker bez /api/taste
 * (404) albo bez tabeli (500 „no such table") → cicho tylko lokalnie do końca sesji. */
import { escapeHtml } from '../core/util.js';
import { parseStore, rate, unrate, toggleHeart, ratingOf, tasteCounts, trackKey, mergeTaste, markSynced, dropTombs,
  batches } from '../core/taste.js';
import { lsGet, lsSet } from './dom.js';
import { ensureSession, hasSession, tasteFetch, tastePush, tasteDelete } from '../adapters-web/cf.js';

const LS_STORE='stacjaTaste', LS_QUEUE='stacjaTasteQ';
export const SYNC_DEBOUNCE_MS = 2000;
const RETRY_MAX_MS = 5*60*1000;

let store = parseStore(lsGet(LS_STORE, '{}'));
let queue = loadQueue();
let syncState = 'local';      // 'local' | 'syncing' | 'synced' | 'off' (serwer bez /api/taste)
const listeners = new Set();

function loadQueue(){
  try{
    const q=JSON.parse(lsGet(LS_QUEUE, '{}')||'{}');
    const keys=v=>Array.isArray(v) ? v.filter(k=>typeof k==='string').slice(0, 4000) : [];
    return { push:keys(q && q.push), del:keys(q && q.del) };
  }catch(_e){ return { push:[], del:[] }; }
}
function save(){ lsSet(LS_STORE, JSON.stringify(store)); }
function saveQueue(){ lsSet(LS_QUEUE, JSON.stringify(queue)); }
function emit(){ listeners.forEach(f=>{ try{ f(); }catch(_e){} }); syncDom(); }
export function onTaste(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }

export const tasteStore = () => store;
export const tasteStats = () => tasteCounts(store);
export const tasteSyncState = () => syncState;
export const tastePending = () => queue.push.length + queue.del.length;
const keyOfTrack = t => trackKey(t && t.artist, t && (t.title!=null ? t.title : t.track));
export const isHearted = t => ratingOf(store, keyOfTrack(t))===2;

/* ---- zmiany (UI) ---- */
export function tasteRate(track, rating, { source='swipe' }={}){
  const r=rate(store, track, rating, { source });
  if(!r.item) return null;
  store=r.store; save(); enqueue(r.item.trackKey, 'push'); emit();
  return r.item;
}
export function tasteUnrate(key){
  const r=unrate(store, key);
  if(!r.changed) return false;
  store=r.store; save(); enqueue(key, 'del'); emit();
  return true;
}
export function tasteToggleHeart(track, { source='reveal' }={}){
  const r=toggleHeart(store, track, { source });
  if(!r.key) return false;
  store=r.store; save(); enqueue(r.key, r.on ? 'push' : 'del'); emit();
  return r.on;
}

/* ---- kolejka + wysyłka ---- */
const base = () => (window.STACJA_CONFIG && window.STACJA_CONFIG.roomsBase) || '';
let flushT=null, retryMs=0, inFlight=false;
function enqueue(key, kind, schedule=true){
  queue.push=queue.push.filter(k=>k!==key); queue.del=queue.del.filter(k=>k!==key);
  queue[kind].push(key);
  saveQueue();
  if(schedule) scheduleFlush(SYNC_DEBOUNCE_MS);
}
function scheduleFlush(ms){
  if(syncState==='off' || !base()) return;
  if(flushT) clearTimeout(flushT);
  flushT=setTimeout(()=>{ flushT=null; flush(); }, ms);
}
function setSync(s){ if(syncState!==s){ syncState=s; syncDom(); } }
// stary Worker (brak trasy / tabeli) → koniec prób w tej sesji; dane zostają lokalnie
function oldServer(e){ return e && (e.status===404 || (e.status>=500 && /no such table|taste_ratings/i.test(String(e.message||'')))); }
function failed(e){
  if(oldServer(e)){ setSync('off'); return; }
  setSync('local');
  retryMs=Math.min(RETRY_MAX_MS, retryMs ? retryMs*3 : 5000);
  scheduleFlush(retryMs);
}
export async function tasteFlush(){ return flush(); }
async function flush(){
  if(!base() || syncState==='off') return;
  if(inFlight){ scheduleFlush(1000); return; }
  if(!queue.push.length && !queue.del.length) return;
  inFlight=true;
  try{
    if(!hasSession() && !(await ensureSession())){ const e=new Error('no-session'); throw e; }
    const items=queue.push.map(k=>store[k]).filter(it=>it && it.rating).map(({ syn, ...it })=>it);
    for(const b of batches(items)){
      await tastePush(b);
      store=markSynced(store, b);
      const sent=new Map(b.map(it=>[it.trackKey, it.ts]));
      queue.push=queue.push.filter(k=>!(sent.has(k) && store[k] && store[k].ts===sent.get(k)));   // zmienione w locie → zostaje
      save(); saveQueue();
    }
    queue.push=queue.push.filter(k=>store[k] && store[k].rating);   // nagrobek/usunięty nie idzie jako push
    for(const k of queue.del.slice()){
      await tasteDelete(k);
      store=dropTombs(store, [k]);
      queue.del=queue.del.filter(x=>x!==k);
      save(); saveQueue();
    }
    retryMs=0; setSync('synced');
  }catch(e){
    if(e && e.status===400){ queue={ push:[], del:[] }; saveQueue(); setSync('local'); }   // dane odrzucone — nie zapętlaj
    else{ if(e && e.status===401){ try{ await ensureSession(); }catch(_e){} }   // wygasły token → odśwież przed ponowieniem
      failed(e); }
  }finally{ inFlight=false; }
  if(queue.push.length || queue.del.length) scheduleFlush(SYNC_DEBOUNCE_MS);
}

/* pobierz z serwera + merge LWW. create=false (start aplikacji): tylko gdy token już jest — bez zakładania profilu. */
export async function tastePull({ create=false }={}){
  if(!base() || syncState==='off') return false;
  if(!hasSession()){
    if(!create){ setSync('local'); return false; }
    if(!(await ensureSession())){ setSync('local'); return false; }
  }
  setSync('syncing');
  try{
    const items=await tasteFetch();
    const m=mergeTaste(store, items);
    store=m.store; save();
    m.push.forEach(it=>enqueue(it.trackKey, 'push', false));
    m.del.forEach(k=>enqueue(k, 'del', false));
    setSync('synced'); emit();
    if(queue.push.length || queue.del.length) scheduleFlush(300);
    return true;
  }catch(e){ failed(e); return false; }
}

/* ---- etykiety (ekran „Twój gust", odsłona) ---- */
export function syncLabel(){
  if(syncState==='synced' && !tastePending()) return '☁️ zapisane na koncie';
  if(syncState==='syncing' || (syncState==='synced' && tastePending())) return '☁️ zapisuję na koncie…';
  return '📱 tylko na tym urządzeniu';
}
export function shelfText(){ return 'na półce: '+tasteCounts(store).hearts; }
function syncDom(){
  if(typeof document==='undefined') return;
  document.querySelectorAll('[data-taste-sync]').forEach(e=>{ e.textContent=syncLabel(); e.dataset.state=syncState; });
}

/* ---- ❤️ w odsłonie (solo + MP) ----
 * tasteHeartHTML(tracks) → HTML wiersza przycisków (1 utwór: „🤍 na półkę"; kilka — składanka/drabinka: tytuły).
 * Stan z magazynu (re-render MP odtwarza go wiernie); klik obsługuje delegacja na dokumencie (data-taste-heart = indeks). */
let revealItems = [];
function revealTrack(t, cat){
  if(!t || typeof t!=='object') return null;
  const title=String(t.title!=null ? t.title : (t.track||'')).trim(), artist=String(t.artist||'').trim();
  if(!title || !artist || !keyOfTrack({ title, artist })) return null;
  return { title, artist, year:String(t.year||''), art:typeof t.art==='string' ? t.art : '', genre:String(t.genre||''), cat:String(cat||'') };
}
function heartBtn(t, i, multi){
  const on=isHearted(t);
  const lab=(on ? 'Zdejmij z półki: ' : 'Dodaj na półkę: ')+t.title+' — '+t.artist;
  const tx=multi ? t.title : (on ? 'dodano' : 'na półkę');
  return `<button type="button" class="taste-heart${on?' on':''}" data-taste-heart="${i}" aria-pressed="${on?'true':'false'}" aria-label="${escapeHtml(lab)}"><span class="th-ic" aria-hidden="true">${on?'❤️':'🤍'}</span><span class="th-tx">${escapeHtml(tx)}</span></button>`;
}
export function tasteHeartHTML(tracks, { cat='' }={}){
  const seen=new Set();
  const items=(Array.isArray(tracks) ? tracks : []).map(t=>revealTrack(t, cat)).filter(t=>{
    if(!t) return false; const k=keyOfTrack(t); if(seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, 4);
  revealItems=items;
  if(!items.length) return '';
  const multi=items.length>1;
  return `<div class="taste-row">${items.map((t,i)=>heartBtn(t, i, multi)).join('')}<span class="taste-shelfn" data-taste-shelfn>${escapeHtml(shelfText())}</span></div>`;
}
function syncHearts(){
  document.querySelectorAll('[data-taste-heart]').forEach(b=>{
    const t=revealItems[+b.dataset.tasteHeart]; if(!t) return;
    const multi=revealItems.length>1;
    const tmp=document.createElement('div'); tmp.innerHTML=heartBtn(t, +b.dataset.tasteHeart, multi);
    const nb=tmp.firstChild;
    b.className=nb.className; b.setAttribute('aria-pressed', nb.getAttribute('aria-pressed')); b.setAttribute('aria-label', nb.getAttribute('aria-label'));
    b.innerHTML=nb.innerHTML;
  });
  document.querySelectorAll('[data-taste-shelfn]').forEach(e=>{ e.textContent=shelfText(); });
}
export const _tasteDebug = () => ({ store, queue, syncState, revealItems });

if(typeof document!=='undefined'){
  document.addEventListener('click', (e)=>{
    const b=e.target && e.target.closest ? e.target.closest('[data-taste-heart]') : null;
    if(!b) return;
    const t=revealItems[+b.dataset.tasteHeart]; if(!t) return;
    e.preventDefault();
    const on=tasteToggleHeart(t, { source:'reveal' });
    syncHearts();
    if(on){ b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  });
  // start: merge z serwerem, gdy token już jest (nie zakłada profilu); poza ścieżką bootu
  setTimeout(()=>{ if(hasSession()) tastePull({ create:false }); else if(tastePending()) scheduleFlush(SYNC_DEBOUNCE_MS); }, 1500);
}
