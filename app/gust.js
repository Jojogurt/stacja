/* app/gust.js — ekran „🎧 Twój gust" (etap 1): sesja „Oceń 20 utworów" (karta z okładką, zajawka ~12 s, 👎 / 👍 / ❤️,
 * pomiń, gesty przesunięcia, buforowanie następnego utworu) + „Moja półka" (❤️: odsłuch, linki Spotify / Apple Music,
 * usuń, sortowanie) + licznik ocen i stan synchronizacji. Self-wiring przy imporcie (kafelek #goGust w menu).
 * Dobór utworów: core/taste.pickTasteSession (dekady × gatunki, tam gdzie profil ma najmniej ocen); rozwiązanie
 * utworu: istniejące resolveTrack (iTunes). Odtwarzanie: trwały element audio z app/listen.js (snippetPlay). */
import { escapeHtml } from '../core/util.js';
import { tasteCandidates, pickTasteSession, planCat, seenForArtist, shelfItems, trackKey, ratingOf, SESSION_N,
  SHELF_SORTS } from '../core/taste.js';
import { tasteStore, tasteStats, tasteRate, tasteUnrate, tastePull, syncLabel, onTaste, tasteSyncState } from './taste.js';
import { snippetPlay, listenStop, unlockListen } from './listen.js';
import { resolveTrack } from '../adapters-web/itunesRepository.js';
import { coverArtUrl } from '../core/trackSelect.js';
import { ERAS, STYLES, READY } from './catalog.js';
import { showScreen } from './social.js';
import { lsGet, lsSet } from './dom.js';

export const SNIP_SECS = 12;          // zajawka w sesji (~10–15 s)
export const SHELF_SNIP_SECS = 15;
const SWIPE_PX = 90;                  // próg gestu (px)
const FLY_MS = 260;                   // animacja wylotu karty
const SORT_KEY = 'stacjaShelfSort';
const $ = id => document.getElementById(id);
const body = () => $('gustBody');
const reduceMotion = () => { try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_e){ return false; } };

let view = 'home';           // 'home' | 'session' | 'summary'
let sess = null;             // bieżąca sesja oceniania
let sortBy = SHELF_SORTS.includes(lsGet(SORT_KEY)) ? lsGet(SORT_KEY) : 'recent';
let shelfPlaying = '';       // klucz utworu półki, który gra
let shelfState = '';         // 'load' | 'play' | 'brak'

const CATS = () => ({ ...ERAS, ...STYLES, ...READY });
const metaLine = t => [t.year, t.genre].filter(Boolean).join(' · ');
const safeArt = u => (typeof u==='string' && /^https:\/\//.test(u)) ? u : '';
const q = t => encodeURIComponent((String(t.artist||'')+' '+String(t.title||t.track||'')).trim());
export const spotifyUrl = t => 'https://open.spotify.com/search/'+q(t);
export const appleUrl = t => 'https://music.apple.com/pl/search?term='+q(t);

/* ================= render ================= */
function render(){
  const el=body(); if(!el) return;
  if(view==='session') el.innerHTML=sessionHTML();
  else if(view==='summary') el.innerHTML=summaryHTML();
  else el.innerHTML=homeHTML();
  if(view==='session') bindCard();
}
function statsHTML(){
  const s=tasteStats();
  return `<div class="pf-stats gu-stats">
      <div class="pf-st b"><b data-gu-total>${s.total}</b><small>OCENIONE</small></div>
      <div class="pf-st r"><b data-gu-hearts>${s.hearts}</b><small>NA PÓŁCE</small></div>
    </div>
    <div class="gu-sync" data-taste-sync data-state="${escapeHtml(tasteSyncState())}">${escapeHtml(syncLabel())}</div>`;
}
const startBtn = (label='Oceń 20 utworów', sub='~12 s zajawki · 👎 👍 ❤️') =>
  `<button class="mh-card gust" data-gu-start><span class="ic" aria-hidden="true">🎧</span><span class="tx"><b>${escapeHtml(label)}</b><small>${escapeHtml(sub)}</small></span><span class="ar" aria-hidden="true">›</span></button>`;
function homeHTML(){
  const items=shelfItems(tasteStore(), sortBy);
  const sortSeg=`<div class="seg gu-sort" role="group" aria-label="Sortowanie półki">${[['recent','ostatnio'],['artist','wykonawca'],['year','rok']].map(([k,l])=>
    `<button type="button" data-gu-sort="${k}" class="${sortBy===k?'on':''}" aria-pressed="${sortBy===k?'true':'false'}">${l}</button>`).join('')}</div>`;
  const shelf = items.length
    ? `<div class="gu-shelf">${items.map(shelfCardHTML).join('')}</div>`
    : `<div class="gu-empty"><div class="gu-empty-ic" aria-hidden="true">❤️</div><b>Półka jest pusta</b>
        <span>Dawaj ❤️ utworom, które chcesz zapamiętać — w sesji oceniania albo w odsłonie pytania w grze.</span>
        <button type="button" class="dz-go gu-empty-cta" data-gu-start>Oceń 20 utworów</button></div>`;
  return `${statsHTML()}
    ${startBtn()}
    <div class="gu-shelf-head"><span class="pf-lbl">Moja półka <span class="gu-n">${items.length}</span></span>${items.length>1?sortSeg:''}</div>
    ${shelf}`;
}
function shelfCardHTML(t){
  const art=safeArt(t.art), k=t.trackKey;
  const st = shelfPlaying===k ? shelfState : '';
  const playIc = st==='play' ? '■' : (st==='load' ? '…' : (st==='brak' ? '✕' : '▶'));
  const playLab = st==='play' ? 'Zatrzymaj' : (st==='brak' ? 'Brak zajawki' : 'Posłuchaj zajawki');
  const genre = t.genre || '';
  return `<div class="gu-item" data-gu-key="${escapeHtml(k)}">
    ${art ? `<img class="gu-art" src="${escapeHtml(art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="gu-art ph" aria-hidden="true">♪</div>`}
    <div class="gu-meta"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(t.artist)}</span>${(t.year||genre)?`<small>${escapeHtml([t.year, genre].filter(Boolean).join(' · '))}</small>`:''}</div>
    <div class="gu-acts">
      <button type="button" class="gu-play${st==='play'?' on':''}" data-gu-play="${escapeHtml(k)}" aria-pressed="${st==='play'?'true':'false'}" aria-label="${escapeHtml(playLab+': '+t.title+' — '+t.artist)}">${playIc}</button>
      <a class="gu-link sp" href="${escapeHtml(spotifyUrl(t))}" target="_blank" rel="noopener noreferrer">Spotify</a>
      <a class="gu-link am" href="${escapeHtml(appleUrl(t))}" target="_blank" rel="noopener noreferrer">Apple Music</a>
      <button type="button" class="gu-del" data-gu-del="${escapeHtml(k)}" aria-label="${escapeHtml('Usuń z półki: '+t.title+' — '+t.artist)}">✕</button>
    </div>
  </div>`;
}

/* ---- sesja ---- */
function progressHTML(){
  const n=sess ? sess.n : SESSION_N, i=sess ? Math.min(sess.seen, n) : 0;
  return `<div class="gu-top">
      <div class="gu-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${i}" aria-label="Postęp sesji"><i style="width:${Math.round(i/n*100)}%"></i></div>
      <span class="gu-pn" data-gu-pn>${i}/${n}</span>
      <button type="button" class="gu-x" data-gu-end aria-label="Zakończ sesję">✕</button>
    </div>`;
}
function sessionHTML(){
  const s=sess;
  let card;
  if(!s || s.loading) card=`<div class="gu-card loading" aria-live="polite"><div class="bb-loader"><i></i><i></i><i></i></div><span>Szukam utworu…</span></div>`;
  else if(s.error) card=`<div class="gu-card loading" role="alert"><span>📡 Brak połączenia z katalogiem utworów.</span><button type="button" class="dz-go" data-gu-retry>Spróbuj ponownie</button></div>`;
  else {
    const t=s.cur, art=safeArt(t.big || t.art), meta=metaLine(t);
    const st=s.playState;
    card=`<div class="gu-card" id="guCard" tabindex="0" aria-label="${escapeHtml(t.title+' — '+t.artist)}">
      <div class="gu-cover">${art ? `<img src="${escapeHtml(art)}" alt="" referrerpolicy="no-referrer" draggable="false">` : `<div class="gu-cover-ph" aria-hidden="true">♪</div>`}
        <span class="gu-stamp down" aria-hidden="true">👎</span><span class="gu-stamp up" aria-hidden="true">👍</span><span class="gu-stamp heart" aria-hidden="true">❤️</span>
        <button type="button" class="gu-replay${st==='play'?' on':''}" data-gu-replay aria-label="${st==='play'?'Zatrzymaj zajawkę':'Odtwórz zajawkę'}">${st==='play'?'■':(st==='load'?'…':'▶')}</button>
      </div>
      <div class="gu-ct"><b>${escapeHtml(t.title)}</b><span>${escapeHtml(t.artist)}</span>${meta?`<small>${escapeHtml(meta)}</small>`:''}</div>
    </div>`;
  }
  const dis = (!s || s.loading || s.error) ? ' disabled' : '';
  return `<div class="gu-sess">
    ${progressHTML()}
    <div class="gu-stage">${card}</div>
    <div class="gu-btns">
      <button type="button" class="gu-b down" data-gu-rate="-1" aria-label="Nie lubię (👎)"${dis}>👎</button>
      <button type="button" class="gu-b heart" data-gu-rate="2" aria-label="Uwielbiam — na półkę (❤️)"${dis}>❤️</button>
      <button type="button" class="gu-b up" data-gu-rate="1" aria-label="Lubię (👍)"${dis}>👍</button>
    </div>
    <button type="button" class="gu-skip" data-gu-skip${dis}>pomiń ›</button>
    <div class="gu-hint">przesuń kartę: w lewo 👎 · w prawo 👍 · w górę ❤️</div>
  </div>`;
}
function summaryHTML(){
  const s=sess||{ rated:0, hearts:0 };
  const tot=tasteStats();
  return `<div class="gu-sum">
    <div class="gu-sum-ic" aria-hidden="true">🎧</div>
    <div class="gu-sum-big">Sesja zakończona</div>
    <div class="pf-stats gu-stats">
      <div class="pf-st b"><b>${s.rated}</b><small>OCENIONE</small></div>
      <div class="pf-st r"><b>${tot.hearts}</b><small>NA PÓŁCE</small></div>
    </div>
    <div class="gu-sum-sub">${s.hearts ? `+${s.hearts} ❤️ w tej sesji · ` : ''}razem ocen: ${tot.total}</div>
    <div class="gu-sync" data-taste-sync data-state="${escapeHtml(tasteSyncState())}">${escapeHtml(syncLabel())}</div>
    ${startBtn('Oceń kolejne 20', 'dobierzemy to, czego jeszcze nie znamy')}
    <button type="button" class="dz-go blue gu-wide" data-gu-home>Moja półka</button>
  </div>`;
}

/* ================= sesja: dobór, buforowanie, ocena ================= */
async function nextTrack(s){
  while(s.pi < s.plan.length){
    if(s!==sess) return null;
    const c=s.plan[s.pi++];
    let t=null;
    try{ t=await resolveTrack({ cat:planCat(c, CATS()), seen:seenForArtist(tasteStore(), c.artist), recent:null, cfg:window.STACJA_CONFIG }); }
    catch(_e){ t={ error:true, reason:'offline' }; }
    if(!t || t.error){
      if(t && t.reason==='offline' && ++s.offline>=3) return { error:'offline' };
      continue;
    }
    s.offline=0;
    const key=trackKey(t.artist, t.track);
    if(!key || s.used.has(key) || ratingOf(tasteStore(), key)) continue;   // już oceniony / powtórka w sesji
    s.used.add(key);
    return { title:t.track, artist:t.artist, year:String(t.year||t.itYear||''), art:t.art||'', big:coverArtUrl(t.art||'', 600), genre:t.genre||'', preview:t.preview||'', cat:c.cat, key };
  }
  return null;
}
// bufor: rozwiąż następny utwór w tle + rozgrzej okładkę i zajawkę (bez czekania przy kolejnej karcie)
function prefetch(s){
  if(s.nextP || s.seen+1>=s.n) return;
  s.nextP=nextTrack(s).then(t=>{
    if(t && !t.error){
      try{ if(t.big || t.art){ const im=new Image(); im.src=t.big || t.art; } }catch(_e){}
      try{ if(t.preview){ const a=new Audio(); a.preload='auto'; a.src=t.preview; s.preAudio=a; } }catch(_e){}
    }
    return t;
  });
}
async function showNext(){
  const s=sess; if(!s) return;
  if(s.seen>=s.n){ return finish(); }
  s.loading=true; s.error=false; s.cur=null; render();
  const p=s.nextP || nextTrack(s);
  s.nextP=null;
  const t=await p;
  if(s!==sess || view!=='session') return;
  if(t && t.error){ s.loading=false; s.error=true; render(); return; }
  if(!t){ return finish(); }   // plan się wyczerpał (brak zajawek) — kończymy krócej
  s.cur=t; s.loading=false; s.playState='load';
  render();
  playCur();
  prefetch(s);
}
function playCur(){
  const s=sess; if(!s || !s.cur) return;
  const cur=s.cur;
  snippetPlay(cur, { secs:SNIP_SECS, onState:(st)=>{
    if(sess!==s || s.cur!==cur) return;
    s.playState=st;
    const b=document.querySelector('[data-gu-replay]');
    if(b){ b.textContent = st==='play' ? '■' : (st==='load' ? '…' : '▶'); b.classList.toggle('on', st==='play');
      b.setAttribute('aria-label', st==='play' ? 'Zatrzymaj zajawkę' : 'Odtwórz zajawkę'); }
  }});
}
export function startTasteSession(){
  unlockListen();   // gest → odblokuj trwały element audio (iOS)
  shelfPlaying=''; listenStop();
  const plan=pickTasteSession(tasteCandidates(CATS()), tasteStore(), Math.random);
  sess={ plan, pi:0, n:SESSION_N, seen:0, rated:0, hearts:0, used:new Set(), offline:0, nextP:null, cur:null, loading:true, error:false, playState:'' };
  view='session';
  showNext();
}
// ocena bieżącej karty: -1 / 1 / 2, 0 = pomiń. Animacja wylotu (gest/przycisk), potem następna karta.
function act(r, dir){
  const s=sess; if(!s || !s.cur || s.loading || s.busy) return;
  s.busy=true;
  const cur=s.cur;
  if(r){ const it=tasteRate(cur, r, { source:'swipe' }); if(it){ s.rated++; if(r===2) s.hearts++; } }
  s.seen++;
  listenStop();
  const card=$('guCard');
  const done=()=>{ s.busy=false; if(sess===s) showNext(); };
  if(card && !reduceMotion()){
    card.classList.add('fly', 'fly-'+(dir || (r===2 ? 'u' : (r===1 ? 'r' : (r===-1 ? 'l' : 'd')))));
    card.style.transform='';
    setTimeout(done, FLY_MS);
  } else done();
}
function finish(){
  listenStop();
  view='summary';
  render();
}
function endSession(){
  listenStop();
  if(sess && sess.seen>0){ finish(); return; }
  sess=null; view='home'; render();
}

/* ---- gesty: pointer events na karcie (przesunięcie w lewo/prawo/górę) ---- */
function bindCard(){
  const card=$('guCard'); if(!card) return;
  let x0=0, y0=0, dx=0, dy=0, id=null;
  const setDir=()=>{
    const dir = (dy<-SWIPE_PX*0.5 && Math.abs(dy)>Math.abs(dx)) ? 'u' : (dx>SWIPE_PX*0.5 ? 'r' : (dx<-SWIPE_PX*0.5 ? 'l' : ''));
    card.dataset.dir=dir;
  };
  card.addEventListener('pointerdown', (e)=>{
    if(e.target.closest && e.target.closest('button')) return;
    if(sess && sess.busy) return;
    id=e.pointerId; x0=e.clientX; y0=e.clientY; dx=0; dy=0;
    try{ card.setPointerCapture(id); }catch(_e){}
    card.classList.add('drag');
  });
  card.addEventListener('pointermove', (e)=>{
    if(id===null || e.pointerId!==id) return;
    dx=e.clientX-x0; dy=e.clientY-y0;
    card.style.transform=`translate(${dx}px, ${Math.min(dy, 40)}px) rotate(${dx/18}deg)`;
    setDir();
  });
  const end=(e)=>{
    if(id===null || (e && e.pointerId!==id)) return;
    id=null; card.classList.remove('drag');
    const up = dy<-SWIPE_PX && Math.abs(dy)>Math.abs(dx);
    if(up) return act(2, 'u');
    if(dx>SWIPE_PX) return act(1, 'r');
    if(dx<-SWIPE_PX) return act(-1, 'l');
    card.style.transform=''; card.dataset.dir='';
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', (e)=>{ if(id!==null && e.pointerId===id){ id=null; card.classList.remove('drag'); card.style.transform=''; card.dataset.dir=''; } });
}

/* ---- półka: odsłuch ---- */
function shelfPlay(key){
  const t=tasteStore()[key]; if(!t || !t.rating) return;
  unlockListen();
  if(shelfPlaying===key && shelfState==='play'){ listenStop(); return; }
  shelfPlaying=key; shelfState='load'; syncShelfBtns();
  snippetPlay({ title:t.title, artist:t.artist }, { secs:SHELF_SNIP_SECS, onState:(st)=>{
    if(shelfPlaying!==key) return;
    shelfState = st==='stop' ? '' : st;
    if(st==='stop') shelfPlaying='';
    syncShelfBtns(key);
  }});
}
function syncShelfBtns(key){
  if(view!=='home') return;
  document.querySelectorAll('[data-gu-play]').forEach(b=>{
    const k=b.dataset.guPlay, on=k===shelfPlaying, st=on ? shelfState : (k===key && shelfState==='brak' ? 'brak' : '');
    b.textContent = st==='play' ? '■' : (st==='load' ? '…' : (st==='brak' ? '✕' : '▶'));
    b.classList.toggle('on', st==='play');
    b.setAttribute('aria-pressed', st==='play' ? 'true' : 'false');
  });
}

/* ================= wejście na ekran / delegacja ================= */
export function openGust(){
  showScreen('gust');
  if(view!=='session'){ view='home'; sess=null; }   // trwająca sesja zostaje (powrót z menu), podsumowanie → półka
  render();
  tastePull({ create:true }).then(()=>{ if(view==='home' && document.body.classList.contains('gust')) render(); });
}
(function wire(){
  const go=$('goGust'); if(go) go.onclick=openGust;
  document.addEventListener('click', (e)=>{
    const t=e.target && e.target.closest ? e.target : null; if(!t || !t.closest('#gust')) return;
    let b;
    if((b=t.closest('[data-gu-start]'))){ startTasteSession(); return; }
    if((b=t.closest('[data-gu-rate]'))){ act(+b.dataset.guRate); return; }
    if((b=t.closest('[data-gu-skip]'))){ act(0, 'd'); return; }
    if((b=t.closest('[data-gu-replay]'))){ unlockListen(); if(sess && sess.playState==='play') listenStop(); else playCur(); return; }
    if((b=t.closest('[data-gu-end]'))){ endSession(); return; }
    if((b=t.closest('[data-gu-retry]'))){ if(sess){ sess.offline=0; sess.error=false; showNext(); } return; }
    if((b=t.closest('[data-gu-home]'))){ sess=null; view='home'; render(); return; }
    if((b=t.closest('[data-gu-sort]'))){ sortBy=SHELF_SORTS.includes(b.dataset.guSort) ? b.dataset.guSort : 'recent'; lsSet(SORT_KEY, sortBy); render(); return; }
    if((b=t.closest('[data-gu-play]'))){ shelfPlay(b.dataset.guPlay); return; }
    if((b=t.closest('[data-gu-del]'))){ const k=b.dataset.guDel; if(shelfPlaying===k) listenStop(); tasteUnrate(k); render(); return; }
  });
  // klawiatura (desktop): ← 👎 · → 👍 · ↑ ❤️ · ↓ pomiń
  document.addEventListener('keydown', (e)=>{
    if(view!=='session' || !document.body.classList.contains('gust') || e.repeat || e.defaultPrevented) return;
    if(e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
    const m={ ArrowLeft:[-1,'l'], ArrowRight:[1,'r'], ArrowUp:[2,'u'], ArrowDown:[0,'d'] }[e.key];
    if(!m) return;
    e.preventDefault(); act(m[0], m[1]);
  });
  // wyjście z ekranu → cisza (sesja zostaje — powrót z menu wraca do niej)
  window.addEventListener('stacja:screen', (e)=>{ if(e.detail!=='gust'){ listenStop(); shelfPlaying=''; } });
  // zmiana magazynu (np. merge z serwera, ❤️ w odsłonie) → odśwież liczniki na ekranie domowym
  onTaste(()=>{
    if(view!=='home' || !document.body.classList.contains('gust')) return;
    const s=tasteStats(), a=document.querySelector('[data-gu-total]'), h=document.querySelector('[data-gu-hearts]');
    if(a) a.textContent=s.total; if(h) h.textContent=s.hearts;
  });
})();

export const _gustDebug = () => ({ view, sess, sortBy, shelfPlaying, shelfState });
