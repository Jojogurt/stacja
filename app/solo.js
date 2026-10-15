/* app/solo.js — tryb SOLO: tuner kategorii, picker „ułóż mecz", losowanie rund (iTunes/lektor/quiz),
 * mecz solo (rundy × kategorie × pytania), sprawdzanie odpowiedzi. Self-wiring przy imporcie
 * (jak app/mp.js): wiąże DOM i wstrzykuje stan do app/audio.js przez initAudio. Zero zależności od app.js. */
import { escapeHtml } from '../core/util.js';
import { norm, textMatch, evaluateGuess, evaluateQuiz, quizKey, scoreRound, SPEED_CAP_MS } from '../core/scoring.js';
import { QPC, CPR, ALL_MODES, MODE_LABEL, MODE_SHORT, matchSlot, matchAdvance, matchProgress, DEFAULT_QUESTIONS, QUICK_QUESTIONS } from '../core/match.js';
import { buildSoloRecord } from '../core/matchRecord.js';
import { plPick, togglePick as _togglePick, toggleAllPick as _toggleAll, allSelected as _allSelected,
  syncQuizMode as _syncQuizMode, grpActive as _grpActive, pickSummary, pickSummaryText, quickPool, restorePick } from '../core/picker.js';
import { resolveTrack } from '../adapters-web/itunesRepository.js';
import { recordMatch, ensureSession } from '../adapters-web/cf.js';
import { setIcon, setRing, setState, flash, animIn, confetti, val, resetForm, hideReveal, showLyric, hideLyric, lsGet, lsSet } from './dom.js';
import { showScreen } from './social.js';   // F6a: „Graj teraz" / „Kontynuuj mecz" z menu
import { lektorPlay } from './lektor.js';
import { playClap } from './sfx.js';
import { initCatEditor, openEditor } from './catEditor.js';
import { unlockCtx } from './audioCtx.js';
import { startAudio, stopAudio, toggleAudio, replay, initAudio, unlockSoloAudio } from './audio.js';
import { mpMe } from './mp.js';   // tożsamość gracza (displayName w rekordzie solo)
import { ERAS, STYLES, READY, LYRICS, QUIZ, ERA_KEYS, STYLE_KEYS, READY_KEYS, LYRICS_KEYS, QUIZ_KEYS,
  ALL_CATS, ALL_KEYS, CATS_OK, matchHeader, catLabel, buildMatch, randomPools, modesFor,
  plLoad, plSave, plMerge, plFetch, addLateQuizCats, quizFreshPool, quizTake } from './catalog.js';

/* ============ stan ============ */
let selectedEra = null;     // klucz lub 'rnd'
let current = null;         // bieżący utwór (czytany przez app/audio.js przez getter)
let recentArtists = [];     // ostatnio użyci, by nie powtarzać
let seenTracks = new Set(); // już zagrane tytuły
let score = 0, total = 0, streak = 0;
let points = 0;             // F6a: suma PUNKTÓW meczu (core/scoring.scoreRound) — obok liczby trafień
let qStartAt = 0;           // F6a: chwila, od której pytanie da się odpowiadać (bonus za szybkość)
let busy = false;
let roundDone = false;      // F2a #4: bieżące pytanie już ocenione („Sprawdź") albo pominięte — drugi wpis zablokowany
let soloGen = 0;            // 2.1: token rundy — inkrementowany przy newRound/finishMatch/zmianie trybu;
                           // async ścieżki (resolveTrack/„od tyłu"/lektor) porzucają wynik, gdy token się zmieni
let session = null;         // {match, results:[]} podczas meczu solo
let soloCats = new Set();    // pula kategorii (multi-select)
let soloModes = new Set(['music']); // pula trybów (multi-select)
let soloQuestions = DEFAULT_QUESTIONS;   // F6a (R-F2): długość meczu w pytaniach (Krótki 5 · Standard 15 · Długi 30)
let mode = 'music';         // bieżący tryb pytania (ustawiany ze slotu meczu)

/* ============ lektor: synteza mowy (Piper / Web Speech) → app/lektor.js ============ */

/* ============ tuner: render epok ============ */
const ticksEl = document.getElementById('ticks');
ERA_KEYS.forEach(k=>{
  const b=document.createElement('button');
  b.className='tick'; b.dataset.era=k;
  b.innerHTML = ERAS[k].label.replace('lata ','') + '<small>'+ERAS[k].range+'</small>';
  b.onclick=()=>toggleCat(k);
  ticksEl.appendChild(b);
});
const rndBtn=document.createElement('button');
rndBtn.className='tick rnd'; rndBtn.dataset.era='rnd';
rndBtn.innerHTML='wszystkie<small>zaznacz/odznacz</small>';
rndBtn.onclick=()=>selectAllCats();
ticksEl.appendChild(rndBtn);

const styleTicksEl = document.getElementById('styleTicks');
STYLE_KEYS.forEach(k=>{
  const b=document.createElement('button');
  b.className='tick gen'; b.dataset.era=k;
  b.innerHTML = STYLES[k].label + '<small>'+STYLES[k].desc+'</small>';
  b.onclick=()=>toggleCat(k);
  styleTicksEl.appendChild(b);
});

const readyTicksEl = document.getElementById('readyTicks');
READY_KEYS.forEach(k=>{
  const b=document.createElement('button');
  b.className='tick pl'; b.dataset.era=k;
  b.innerHTML = escapeHtml(READY[k].label) + '<small>'+escapeHtml(READY[k].desc||(READY[k].songs.length+' utw.'))+'</small>';
  b.onclick=()=>toggleCat(k);
  readyTicksEl.appendChild(b);
});

const lyricsTicksEl = document.getElementById('lyricsTicks');
LYRICS_KEYS.forEach(k=>{
  const b=document.createElement('button');
  b.className='tick gen'; b.dataset.era=k;
  b.innerHTML = escapeHtml(LYRICS[k].label) + '<small>'+escapeHtml(LYRICS[k].desc||(LYRICS[k].songs.length+' tekstów'))+'</small>';
  b.onclick=()=>toggleCat(k);
  lyricsTicksEl.appendChild(b);
});

const quizTicksEl = document.getElementById('quizTicks');
function renderQuizTicks(keys){
  if(!QUIZ_KEYS.length) return;
  const band=document.getElementById('quizBand'); if(band) band.hidden=false;
  const gw=document.getElementById('grpWiedza'); if(gw) gw.hidden=false;
  keys.forEach(k=>{
    [...quizTicksEl.children].forEach(c=>{ if(c.dataset.era===k) c.remove(); });
    const b=document.createElement('button');
    b.className='tick gen'+(soloCats.has(k)?' on':''); b.dataset.era=k;
    b.innerHTML = escapeHtml(QUIZ[k].label) + '<small>'+(QUIZ[k].questions||[]).length+' pytań</small>';
    b.onclick=()=>toggleCat(k);
    quizTicksEl.appendChild(b);
  });
}
renderQuizTicks(QUIZ_KEYS);
// F2a #8: kategorie quizu dociągnięte w tle przez quiz-loader.js (wolna sieć) → dopnij do pickera
window.addEventListener('stacja:quiz', ()=>{
  const added=addLateQuizCats();
  // F6a: zapamiętana pula z kategoriami quizu, które doszły dopiero teraz → dołącz je do wyboru
  const late=pendingCats.filter(k=>ALL_CATS[k]);
  if(late.length){ late.forEach(k=>soloCats.add(k)); pendingCats=pendingCats.filter(k=>!ALL_CATS[k]); }
  if(!added.length && !late.length) return;
  if(late.length) syncCatTicks();
  renderQuizTicks(added); updateGrpChips(); updateMatchInfo();
});

if(!CATS_OK){ setTimeout(()=>flash('Nie udało się wczytać kategorii. Sprawdź internet i odśwież stronę.'),0); }

/* ===== playlisty ze Spotify (localStorage) ===== */
// plLoad/plSave/plMerge/plFetch (dane playlist) → app/catalog.js; tu zostaje UI
function plRenderTicks(){
  const el=document.getElementById('plTicks'); el.innerHTML='';
  const pls=plLoad(); const keys=Object.keys(pls);
  if(!keys.length){ el.innerHTML='<span style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:6px 2px">brak — kliknij „+ ze Spotify"</span>'; return; }
  keys.forEach(k=>{
    const b=document.createElement('button'); b.className='tick pl'; b.dataset.era=k;
    b.innerHTML=escapeHtml(pls[k].label)+'<small>'+pls[k].songs.length+' utw.</small><span class="ed" title="edytuj">✎</span><span class="rm" title="usuń">×</span>';
    b.querySelector('.rm').onclick=(e)=>{ e.stopPropagation(); plRemove(k); };
    b.querySelector('.ed').onclick=(e)=>{ e.stopPropagation(); openEditor(k); };
    b.onclick=()=>toggleCat(k);
    el.appendChild(b);
  });
}
function plRemove(k){
  const pls=plLoad(); delete pls[k]; plSave(pls);
  delete ALL_CATS[k]; const i=ALL_KEYS.indexOf(k); if(i>=0) ALL_KEYS.splice(i,1);
  soloCats.delete(k);   // 5.10: usuń też z puli meczu (inaczej martwy klucz w picker/buildMatch)
  if(selectedEra===k){ selectedEra=null; document.getElementById('dialNote').textContent='wybierz kategorię'; }
  updateMatchInfo();
  plRenderTicks();
}
document.getElementById('plImport').onclick=()=>document.getElementById('plPanel').classList.toggle('show');
document.getElementById('plGo').onclick=plImport;
document.getElementById('plUrl').addEventListener('keydown',e=>{ if(e.key==='Enter') plImport(); });
async function plImport(){
  const url=document.getElementById('plUrl').value.trim();
  const st=document.getElementById('plStatus');
  if(!url){ st.className='pl-status err'; st.textContent='Wklej link do playlisty Spotify.'; return; }
  st.className='pl-status'; st.textContent='importuję…';
  try{
    const res=await plFetch(url);
    plRenderTicks(); soloCats.add(res.key); syncCatTicks(); updateMatchInfo();
    st.className='pl-status ok'; st.textContent='✓ '+res.name+' — '+res.count+' utw. Dodana do puli.';
    document.getElementById('plUrl').value='';
  }catch(e){ st.className='pl-status err'; st.textContent='Nie udało się: '+(e.message||e); }
}
plMerge(); plRenderTicks();
// edytor własnych kategorii (B-MVP): po zapisie odśwież ticki i dorzuć nową do puli meczu
initCatEditor({ onSaved:(key)=>{ plRenderTicks(); soloCats.add(key); syncCatTicks(); updateMatchInfo(); } });
renderModeChips();
// F6a (R-F2): segment długości meczu (pytania)
function syncLenPick(){
  const lp=document.getElementById('lenPick'); if(!lp) return;
  lp.querySelectorAll('button').forEach(b=>b.classList.toggle('on', +b.dataset.q===soloQuestions));
  const lv=document.getElementById('lenVal'); if(lv) lv.textContent=soloQuestions+' '+plPick(soloQuestions,'pytanie','pytania','pytań');
}
(function wireLength(){
  const lp=document.getElementById('lenPick'); if(!lp) return;
  lp.querySelectorAll('button').forEach(btn=>{ btn.onclick=()=>{ soloQuestions=+btn.dataset.q; syncLenPick(); updateMatchInfo(); }; });
  syncLenPick();
})();
document.getElementById('matchStart').onclick=startMatch;
document.getElementById('matchRandom').onclick=randomPick;
updateMatchInfo();

/* ====== wybór puli kategorii/trybów do meczu (multi-select) ====== */
function toggleCat(k){ _togglePick(soloCats,k); syncCatTicks(); updateMatchInfo(); }
function selectAllCats(){ _toggleAll(ALL_KEYS, soloCats); syncCatTicks(); updateMatchInfo(); }
function syncCatTicks(){
  document.querySelectorAll('.tick').forEach(t=>{ const k=t.dataset.era; if(k&&k!=='rnd') t.classList.toggle('on', soloCats.has(k)); });
  const rb=document.querySelector('.tick.rnd'); if(rb) rb.classList.toggle('on', _allSelected(ALL_KEYS, soloCats));
  syncQuizMode(); updateGrpChips();
}
/* tryb „quiz" wymagany przez buildMatch dla kategorii kind:'quiz' — trzymany automatycznie (core/picker.js) */
function syncQuizMode(){ _syncQuizMode(soloCats, soloModes, ALL_CATS); }
/* ---- chipy-grup (Ułóż mecz, kompakt): grupa = ✓ gdy choć jedna kategoria z grupy wybrana ---- */
const GRP_KEYS={ dekady:()=>ERA_KEYS, style:()=>STYLE_KEYS, playlisty:()=>READY_KEYS,
  teksty:()=>LYRICS_KEYS, wiedza:()=>QUIZ_KEYS, twoje:()=>Object.keys(plLoad()) };
function grpActive(g){ const f=GRP_KEYS[g]; return !!f && _grpActive(f(), soloCats); }
function updateGrpChips(){
  let n=0;
  document.querySelectorAll('.grp-chip[data-grp]').forEach(ch=>{
    const on=grpActive(ch.dataset.grp); ch.classList.toggle('on',on); if(on)n++;
  });
  const cc=document.getElementById('catCount'); if(cc) cc.textContent=n+' '+plPick(n,'wybrana','wybrane','wybranych');
}
(function wireGrpChips(){
  const wrap=document.getElementById('grpChips'); if(!wrap) return;
  wrap.querySelectorAll('.grp-chip[data-grp]').forEach(ch=>{
    ch.onclick=()=>{
      const band=document.querySelector('.grp-band[data-band="'+ch.dataset.grp+'"]');
      const open=!ch.classList.contains('open');
      ch.classList.toggle('open',open);
      if(band) band.classList.toggle('open',open);
    };
  });
  const gw=document.getElementById('grpWiedza');
  if(gw) gw.hidden=!QUIZ_KEYS.length;   // F2a #8: nie usuwaj — kategorie quizu mogą dojść później
  updateGrpChips();
})();
function toggleMode(m){ _togglePick(soloModes,m); renderModeChips(); updateMatchInfo(); }
function randomPick(){ const {cats,modes}=randomPools(); soloCats=new Set(cats); soloModes=new Set(modes); syncCatTicks(); renderModeChips(); updateMatchInfo(); }
function renderModeChips(){
  const el=document.getElementById('modeTicks'); if(!el) return; el.innerHTML='';
  // tryb „quiz" nie jest osobnym chipem — włącza się automatycznie z kategorią Wiedza (patrz syncQuizMode)
  ALL_MODES.filter(m=>m!=='quiz').forEach(m=>{
    const b=document.createElement('button'); b.className='grp-chip mode'+(soloModes.has(m)?' on':''); b.dataset.mode=m;
    b.textContent=MODE_LABEL[m];
    b.onclick=()=>toggleMode(m); el.appendChild(b);
  });
}
function updateMatchInfo(){
  const el=document.getElementById('matchInfo'); if(!el) return;
  const s=pickSummary(soloCats, soloModes, {questions:soloQuestions}, ALL_CATS);
  if(s.error){ el.className= (!soloCats.size||!soloModes.size) ? 'um-summary' : 'um-summary err'; el.textContent=s.error; return; }
  el.className='um-summary';
  const t=pickSummaryText(s);   // F2a: faktyczna liczba kategorii + „pytań" przy quizie/lektorze
  el.innerHTML=`${escapeHtml(t.head)}<b>${escapeHtml(t.total)}</b>${escapeHtml(t.from)}`;
}

/* ===== F6a (R-F1): picker pamięta ostatnią pulę (kategorie/tryby/długość) — zamiast pustej =====
 * Pierwsze uruchomienie (brak zapisu) → pula „hitów" (quickPool). Kategorie, których jeszcze nie ma
 * (quiz dociągany w tle), czekają w pendingCats i dołączają przy zdarzeniu stacja:quiz. */
const PICK_KEY='stacjaSoloPick';
let pendingCats=[];
function saveSoloPick(){
  lsSet(PICK_KEY, JSON.stringify({ cats:[...soloCats], modes:[...soloModes].filter(m=>m!=='quiz'), questions:soloQuestions }));
}
(function restoreSoloPick(){
  let saved=null; try{ saved=JSON.parse(lsGet(PICK_KEY,'null')); }catch(_e){ saved=null; }
  if(saved && typeof saved==='object'){
    const r=restorePick(saved, ALL_CATS, ALL_MODES);
    pendingCats=(Array.isArray(saved.cats)?saved.cats:[]).filter(k=>typeof k==='string' && !ALL_CATS[k]).slice(0,60);
    if(r.cats.length) soloCats=new Set(r.cats);
    if(r.modes.length) soloModes=new Set(r.modes);
    if(r.questions) soloQuestions=r.questions;
  } else {
    soloCats=new Set(quickPool(ALL_CATS, undefined, ERA_KEYS));
  }
  syncCatTicks(); renderModeChips(); syncLenPick(); updateMatchInfo();
})();

/* ============ losowanie rundy (źródło utworów → TrackRepository) ============ */
async function newRound(){
  if(busy) return;
  if(!selectedEra){ flash('najpierw wybierz kategorię na skali'); return; }
  // wiedza ogólna (bez audio): w meczu decyduje tryb slotu, w wolnej grze — typ kategorii
  const catNow = (selectedEra!=='rnd' && ALL_CATS[selectedEra]) || null;
  const isQuiz = session ? (mode==='quiz') : !!(catNow && catNow.kind==='quiz');
  if(isQuiz){ mode='quiz'; return newQuizRound(); }
  if(!session && mode==='quiz') mode='music';   // wyjście z quizu w wolnej grze (kategoria nie-quizowa)
  if(mode==='lektor'){ return newLektorRound(); }
  soloGen++;   // 2.1: nowa runda — unieważnij ewentualny wcześniejszy async (rozwiązanie/„od tyłu")
  const gen=soloGen;
  busy=true; roundDone=false; current=null;   // F2a #3: gałka w trakcie strojenia nie zagra utworu poprzedniego pytania
  stopAudio(); hideReveal(); hideSummary(); resetForm(); hideLyric(); renderSoloForm(); hideOfflineOffer();
  if(session) updateSessUI();
  setIcon('wait'); setState('strojenie…');
  disableRoundControls();

  const eraKey = selectedEra==='rnd' ? ALL_KEYS[Math.floor(Math.random()*ALL_KEYS.length)] : selectedEra;
  const cat = ALL_CATS[eraKey];
  const t = await resolveTrack({cat, seen:seenTracks, recent:recentArtists, cfg:window.STACJA_CONFIG});
  // 2.1: rundę porzucono w trakcie losowania (Zakończ / zmiana trybu / nowa runda) — nie startuj audio nad podsumowaniem.
  // F2a #3: `busy` należy wtedy już do nowszego stanu (abandonRound je zwolnił, nowa runda mogła je zająć) — nie ruszaj.
  if(gen!==soloGen) return;
  busy=false;
  if(t.error){
    // 2.2: NIE zostawiaj poprzedniego utworu — inaczej „sprawdź" oceniłoby stare pytanie (duplikat w wynikach)
    current=null; setIcon('play');
    document.getElementById('skip').disabled=false;   // pozwól pominąć; ▶ (gałka) z current=null ponawia newRound
    // F6a (R-F10/F11): komunikat dla gracza + ścieżka offline (lektor/wiedza działają bez iTunes)
    if(t.reason==='offline'){ flash('Brak internetu albo serwis z muzyką nie odpowiada. Stuknij ▶, by spróbować ponownie — albo zagraj offline.'); showOfflineOffer(); }
    else if(cat.songs && cat.songs.length && (!cat.artists||!cat.artists.length)) flash('Brak grających zajawek w tej playliście — wybierz inną kategorię.');
    else flash('Brak zajawek dla tej kategorii — stuknij ▶, by spróbować ponownie, albo pomiń pytanie.');
    return;
  }
  current={...t, era:eraKey, lyric:''};
  qStartAt=Date.now();   // F6a: od teraz liczy się czas odpowiedzi
  startAudio();
}

/* ============ audio (solo) → app/audio.js + app/audioCtx.js ============ */
// stan gry (current/mode) i wznowienie rundy wstrzykiwane; uchwyty odtwarzacza żyją w module
initAudio({ current: ()=>current, mode: ()=>mode, newRound, gen: ()=>soloGen, busy: ()=>busy });
document.getElementById('knob').onclick=toggleAudio;
document.getElementById('replay').onclick=replay;

function disableRoundControls(){
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=true;
  document.getElementById('skip').disabled=true;
}
/* F2a #3: porzucenie rundy (Zakończ / koniec meczu / zmiana trybu) — unieważnij async ORAZ zwolnij `busy`
   i bieżące pytanie. Bez tego „Zakończ" w trakcie strojenia zostawiał busy=true i nowy mecz utykał
   na `if(busy) return` (a gałka grała utwór z poprzedniego meczu). */
function abandonRound(){
  soloGen++; busy=false; current=null; roundDone=true;
  disableRoundControls();
}
// klasy trybu na body: quiz-mode (bez gałki) i lektor-mode („lepszy głos" tylko dla lektora)
function syncModeClasses(){
  document.body.classList.toggle('quiz-mode', mode==='quiz');
  document.body.classList.toggle('lektor-mode', mode==='lektor');
}

/* ============ przełącznik trybu muzyka/lektor ============ */
const modePick=document.getElementById('modePick');
modePick.querySelectorAll('button').forEach(btn=>{
  btn.onclick=()=>{
    unlockCtx();
    if(mode===btn.dataset.mode) return;
    abandonRound();   // 2.1/F2a #3: zmiana trybu — porzuć async poprzedniego trybu (np. „od tyłu" dekodujące) i zwolnij busy
    mode=btn.dataset.mode; syncModeClasses();
    modePick.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===btn));
    stopAudio(); hideReveal(); resetForm(); hideLyric(); setIcon('play');
    const hint={lektor:'lektor', reverse:'od tyłu', snippet:'fragment'}[mode];
    setState((hint?hint+' · ':'')+'naciśnij, żeby wylosować');
  };
});

/* zbierz piosenki z tekstem (lyric) z wybranej kategorii lub ze wszystkich (LOS) */
function lektorPool(){
  const keys = selectedEra==='rnd' ? ALL_KEYS : [selectedEra];
  const out=[];
  keys.forEach(k=>{
    const songs=(ALL_CATS[k]&&ALL_CATS[k].songs)||[];
    songs.forEach(s=>{ if(s.lyric) out.push(s); });
  });
  return out.filter(s=>!seenTracks.has(norm(s.title)));
}

async function newLektorRound(){
  soloGen++;   // 2.1: nowa runda lektora — unieważnij wcześniejszą syntezę/rozwiązanie
  busy=true; roundDone=false; current=null; stopAudio(); hideReveal(); hideSummary(); resetForm();
  if(session) updateSessUI();
  setIcon('wait'); setState('strojenie…');
  disableRoundControls();

  let pool=lektorPool();
  if(!pool.length){   // 2.3: wyczerpane — kasuj z seenTracks TYLKO tytuły lektorskie (nie muzykę z tego meczu → koniec powtórek utworów)
    const keys = selectedEra==='rnd' ? ALL_KEYS : [selectedEra];
    keys.forEach(k=>((ALL_CATS[k]&&ALL_CATS[k].songs)||[]).forEach(s=>{ if(s.lyric) seenTracks.delete(norm(s.title)); }));
    pool=lektorPool();
  }
  if(!pool.length){
    busy=false;
    flash('W tej kategorii nie ma tekstów dla lektora — pomiń pytanie albo wybierz inną kategorię (np. „Teksty").');
    return;
  }
  const s=pool[Math.floor(Math.random()*pool.length)];
  current={track:s.title, artist:s.artist, era:selectedEra,
    year:s.year||'', album:s.album||'', preview:'', art:'', lyric:s.lyric, tts:s.tts||''};
  seenTracks.add(norm(s.title));
  busy=false; qStartAt=Date.now();
  document.getElementById('check').disabled=false;
  document.getElementById('replay').disabled=false;
  document.getElementById('skip').disabled=false;
  document.getElementById('knob').classList.add('live');
  renderSoloForm();
  showLyric(s.lyric);
  lektorPlay(s.lyric, s.tts, setState);
  document.getElementById('fTitle').focus({preventScroll:true});
}
// wiedza ogólna (solo): pytanie z puli kategorii, bez audio — wzorem newLektorRound
function newQuizRound(){
  soloGen++;   // 2.1: nowa runda quizu — unieważnij wcześniejszy async
  busy=true; roundDone=false; current=null; stopAudio(); hideReveal(); hideSummary(); resetForm();
  if(session) updateSessUI();
  disableRoundControls();
  const eraKey = selectedEra==='rnd' ? ALL_KEYS[Math.floor(Math.random()*ALL_KEYS.length)] : selectedEra;
  const cat = ALL_CATS[eraKey];
  // F3 #5: trwały seen-set per kategoria (localStorage) — pytania nie wracają między meczami, reset po wyczerpaniu
  const pool=quizFreshPool(eraKey, (cat&&cat.questions)||[]);
  if(!pool.length){ busy=false; flash('Ta kategoria nie ma pytań.'); return; }
  // #3 (opcjonalnie): tryb trenera — częściej pytania wcześniej oblane (tylko quiz solo)
  let q;
  if(quizRepeat && pool.length>1){
    const stats=loadQuizStats();
    const failed=pool.filter(x=>{ const st=quizStatOf(stats, eraKey, x); return st && st.w>(st.r||0); });
    q = (failed.length && Math.random()<0.7) ? failed[Math.floor(Math.random()*failed.length)] : pool[Math.floor(Math.random()*pool.length)];
  } else {
    q = pool[Math.floor(Math.random()*pool.length)];
  }
  // F3 #3: ABCD tasowane w runtime (litera poprawnej przemapowana); statKey liczony z treści BEZ opcji (#6 trenera)
  const sq=quizTake(eraKey, q);
  const mc=sq.mc || null;
  current={prompt:sq.prompt, slots:sq.slots, answers:sq.answers, pool:sq.pool, fun:sq.fun||'', era:eraKey, track:sq.prompt, artist:'', year:'', album:'', preview:'', art:'', lyric:'', mc, statKey:quizStatKey(eraKey,q)};
  busy=false; qStartAt=Date.now();
  renderSoloForm();
  showPrompt(mc?mc.question:q.prompt);
  setIcon('play'); setState(mc?'wybierz odpowiedź (A–D)':'odpowiedz na pytanie');
  document.getElementById('check').disabled=false;
  document.getElementById('skip').disabled=false;
  if(mc){ const fb=document.querySelector('#quizForm .mc-opt'); if(fb) fb.focus({preventScroll:true}); }
  else { const first=document.getElementById('qf_'+(q.slots[0]&&q.slots[0].key)); if(first) first.focus({preventScroll:true}); }
}
// parseMC / shuffleMC (tasowanie ABCD) → core/scoring.js; current.mc = {question, options, correct}
// zaznacz opcję ABCD (jedna na raz); ocena dopiero przy „Sprawdź"
function selectMC(btn){
  if(!btn || btn.disabled) return;
  document.querySelectorAll('#quizForm .mc-opt').forEach(b=>{ b.classList.remove('sel'); b.setAttribute('aria-pressed','false'); });
  btn.classList.add('sel'); btn.setAttribute('aria-pressed','true');   // F2a #20: stan wyboru dla czytnika ekranu
}
// przełącz formularz solo między muzyką (statyczne pola), quizem otwartym (sloty) a ABCD (przyciski)
function renderSoloForm(){
  const form=document.getElementById('form'); if(!form) return;
  const isQuiz = mode==='quiz';
  form.classList.toggle('quiz', isQuiz);
  syncModeClasses();   // quiz-mode: ukryj gałkę/audio w decku; lektor-mode: pokaż „lepszy głos"
  const qf=document.getElementById('quizForm'); if(!qf) return;
  if(isQuiz && current && current.mc){
    qf.innerHTML='<div class="mc-opts">'+current.mc.options.map(o=>
      `<button type="button" class="mc-opt" aria-pressed="false" data-letter="${o.letter}"><span class="mc-let">${o.letter}</span><span class="mc-tx">${escapeHtml(o.text)}</span></button>`).join('')+'</div>';
    qf.querySelectorAll('.mc-opt').forEach(b=>{ b.onclick=()=>selectMC(b); });
  } else if(isQuiz && current && current.slots){
    qf.innerHTML = current.slots.map(s=>
      `<div class="field"><label for="qf_${s.key}">${escapeHtml(s.label||s.key)}</label><input id="qf_${s.key}" autocomplete="off" autocapitalize="off"></div>`).join('');
  } else {
    qf.innerHTML = '';
  }
}
function showPrompt(text){ const b=document.getElementById('lyricBox'); if(!b) return;
  b.innerHTML='<span class="lyric-cap">pytanie</span>'+escapeHtml(text||''); b.classList.add('quiz'); b.hidden=false; }
document.getElementById('skip').onclick=()=>{
  if(roundDone) return;   // F2a #4: pytanie już ocenione („Sprawdź") — drugi wpis tego samego pytania zablokowany
  roundDone=true; document.getElementById('check').disabled=true; document.getElementById('skip').disabled=true;
  unlockSoloAudio({ctx:session?session.hasReverse:false});   // F2a #9: gest → kolejna zajawka zagra bez dodatkowego stuknięcia (iOS)
  if(session && current){ const s=matchSlot(session.match); session.results.push({track:current.track, artist:current.artist, okTitle:false, okArtist:false, skipped:true, points:0, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); }
  streak=0; updateScore();
  advance();
};

/* ============ MECZ solo: rundy × kategorie × pytania ============ */
document.getElementById('sessEnd').onclick=()=>{ if(session && session.results.length) finishMatch(); else endMatch(); };
document.getElementById('sumAgain').onclick=()=>{ hideSummary(); document.body.classList.remove('playing','match-over'); soloHead('Ułóż mecz'); };

function startMatch(){
  if(!soloCats.size){ updateMatchInfo(); return; }
  if(!soloModes.size){ updateMatchInfo(); return; }
  if(startSoloMatch([...soloCats],[...soloModes],soloQuestions)) saveSoloPick();   // F6a: zapamiętaj pulę
}
// F6a: wspólny start meczu solo — picker, „Graj teraz" (R-F1) i „Zagraj offline" (R-F10). true = wystartował.
function startSoloMatch(cats, modes, questions){
  const r=buildMatch(cats, modes, {questions});
  if(r.error){ const el=document.getElementById('matchInfo'); el.className='um-summary err'; el.textContent=r.error; return false; }
  if(session || busy) abandonRound();   // poprzedni mecz / losowanie w locie → porzuć (busy zwolnione, async unieważniony)
  hideOfflineOffer();
  const hasReverse=r.slots.some(x=>x.mode==='reverse');
  session={match:{slots:r.slots, rounds:r.rounds, si:0, qi:0}, results:[], hasReverse, cats:[...cats], modes:[...modes], questions:r.questions};
  // F2a #9: gest „Zacznij mecz" odblokowuje trwały element audio (iOS: per-element) i — gdy mecz ma
  // „od tyłu" — AudioContext; inaczej pierwsza zajawka po await kończyła się NotAllowedError
  unlockSoloAudio({ctx:hasReverse});
  // nowy Set (nie clear): porzucone w locie losowanie poprzedniego meczu dopisuje do STAREGO zbioru,
  // a nie „zużywa" utworów nowego meczu (F2a #3)
  seenTracks=new Set(); recentArtists=[]; score=0; total=0; streak=0; points=0; updateScore();
  hideSummary(); hideReveal(); resetForm();
  document.body.classList.remove('match-over');
  document.body.classList.add('playing');
  document.getElementById('session').classList.add('live');
  loadSlotQuestion();
  return true;
}
/* F6a (R-F1): „Graj teraz" — jedno tapnięcie z menu: 10 pytań, tryb muzyka, pula „hitów" (klucze z runtime) */
(function wireQuick(){
  const b=document.getElementById('goQuick'); if(!b) return;
  b.onclick=()=>{
    unlockCtx();
    showScreen('solo');
    const cats=quickPool(ALL_CATS, undefined, ERA_KEYS);
    if(!cats.length){ flash('Nie udało się wczytać kategorii z muzyką. Sprawdź internet i odśwież stronę.'); return; }
    startSoloMatch(cats, ['music'], QUICK_QUESTIONS);
  };
})();
/* F6a (R-F10/F11): brak sieci → „Zagraj offline: Lektor / Wiedza" (kategorie z tekstami + paczki wiedzy) */
function offlinePools(){
  const modes=['lektor','quiz'];
  const cats=ALL_KEYS.filter(k=>modesFor(k).some(m=>modes.includes(m)));
  return { cats, modes };
}
function hideOfflineOffer(){ const b=document.getElementById('offlinePlay'); if(b) b.hidden=true; }
function showOfflineOffer(){
  const b=document.getElementById('offlinePlay'); if(!b) return;
  const { cats, modes }=offlinePools();
  b.hidden = !cats.length || !!buildMatch(cats, modes, {questions:QPC}).error;
}
(function wireOffline(){
  const b=document.getElementById('offlinePlay'); if(!b) return;
  b.onclick=()=>{
    const { cats, modes }=offlinePools();
    startSoloMatch(cats, modes, session ? session.questions : DEFAULT_QUESTIONS);
  };
})();
/* F6a (F12): trwający mecz solo — „Kontynuuj mecz (pyt. X/Y)" w menu; nagłówek ekranu solo = runda, nie „Ułóż mecz" */
function playHead(){ const s=session && matchSlot(session.match); return s ? 'Runda '+s.round+'/'+session.match.rounds+' · '+catLabel(s.cat) : 'Mecz'; }
function syncContinue(){
  const b=document.getElementById('goContinue'); if(!b) return;
  if(!session){ b.hidden=true; return; }
  const p=matchProgress(session.match);
  const tx=document.getElementById('goContinueTx'); if(tx) tx.textContent=`Kontynuuj mecz (pyt. ${p.n}/${p.total})`;
  const sub=document.getElementById('goContinueSub'); if(sub) sub.textContent=`${points} pkt · ${catLabel((matchSlot(session.match)||{}).cat||'')}`;
  b.hidden=false;
}
(function wireContinue(){
  const b=document.getElementById('goContinue'); if(b) b.onclick=()=>showScreen('solo');
  window.addEventListener('stacja:screen', (e)=>{
    const scr=e && e.detail;
    if(scr==='menu') syncContinue();
    else if(scr==='solo'){
      if(session) soloHead(playHead());
      else if(document.body.classList.contains('match-over')) soloHead('Wynik meczu');
    }
  });
})();
// 5.7: nagłówek ekranu solo w grze — zamiast „Ułóż mecz" pokaż rundę + kategorię
function soloHead(text){ const tt=document.getElementById('scrTitle'); if(tt) tt.textContent=text; }
function loadSlotQuestion(){
  const s=matchSlot(session.match); if(!s){ finishMatch(); return; }
  selectedEra=s.cat; mode=s.mode; syncModeClasses();
  document.querySelectorAll('#modePick button').forEach(b=>b.classList.toggle('on', b.dataset.mode===mode));
  soloHead(playHead());   // 5.7
  updateSessUI();
  animIn(document.querySelector('.deck'));   // one-shot przejście nowego pytania
  newRound();
}
function endMatch(){
  abandonRound();   // 2.1/F2a #3: koniec meczu — porzuć async ostatniej rundy i zwolnij busy
  session=null;
  document.getElementById('session').classList.remove('live');
  document.body.classList.remove('playing','quiz-mode','lektor-mode','match-over');
  hideSummary(); stopAudio(); setIcon('play'); hideOfflineOffer();
  soloHead('Ułóż mecz');   // 5.7: powrót do tytułu pickera
}
function updateSessUI(){
  if(!session) return;
  document.getElementById('sessProg').textContent=matchHeader(session.match);
  const hits=session.results.filter(r=>r.okTitle&&r.okArtist).length;
  document.getElementById('sessMini').textContent=points+' pkt · '+hits+' trafionych';   // F6a: punkty w nagłówku
}
function advance(){
  if(!session) return;
  const more=matchAdvance(session.match);
  if(!more){ finishMatch(); return; }
  loadSlotQuestion();
}
function finishMatch(){
  abandonRound();   // 2.1/F2a #3: „Zakończ" w trakcie strojenia — porzuć rozwiązanie w locie i zwolnij busy
  const res=session.results;
  const tot=session.match.slots.length*QPC;
  const played=res.length;   // F2a #10: przerwany mecz — wynik względem ROZEGRANYCH pytań, nie całego meczu
  const hits=res.filter(r=>r.okTitle&&r.okArtist).length;
  // zapis wyniku (best-effort, nieblokujące) — tylko gdy mamy tożsamość (auth.uid)
  const slots=session.match.slots;
  const cfg={ categories:session.cats||[], modes:session.modes||[], questions:session.questions||tot };
  (async()=>{ const uid=await ensureSession(); if(uid) recordMatch(buildSoloRecord({
    results:res, slots, profileId:uid, displayName:mpMe.name||'ja', config:cfg,
  })); })();
  stopAudio(); setIcon('play'); hideReveal();
  // F2a #10: deck/formularz pod podsumowaniem wyłączone (nic do sprawdzenia/odtworzenia z zakończonego meczu)
  resetForm(); hideLyric(); const qf=document.getElementById('quizForm'); if(qf) qf.innerHTML='';
  document.body.classList.remove('quiz-mode','lektor-mode'); document.body.classList.add('match-over');
  setState('mecz zakończony');
  const cut = played < tot;
  document.getElementById('sumBig').textContent=hits+' / '+(cut?played:tot);
  const sp=document.getElementById('sumPts'); if(sp) sp.textContent=points+' pkt';   // F6a: wynik w punktach obok X/Y trafień
  document.getElementById('sumSub').textContent= cut
    ? `trafione z ${played} ${plPick(played,'rozegranego','rozegranych','rozegranych')} · mecz przerwany (${played} z ${tot})`
    : 'koniec meczu';
  const list=document.getElementById('sumList'); list.innerHTML='';
  const byRound={};
  res.forEach(r=>{ (byRound[r.round]=byRound[r.round]||[]).push(r); });
  Object.keys(byRound).sort((a,b)=>a-b).forEach(rd=>{
    const grp=byRound[rd], rh=grp.filter(x=>x.okTitle&&x.okArtist).length;
    const hdr=document.createElement('div'); hdr.className='band-label'; hdr.style.margin='12px 0 4px';
    const rp=grp.reduce((a,x)=>a+(x.points||0),0);
    hdr.textContent='Runda '+rd+' — '+rh+'/'+grp.length+' · '+rp+' pkt';
    list.appendChild(hdr);
    grp.forEach(r=>{
      const ok=r.okTitle&&r.okArtist;
      const d=document.createElement('div'); d.className='sum-row';
      const badge=r.skipped?'<span class="no">↷</span>':(ok?'<span class="ok">✓</span>':(r.okTitle||r.okArtist?'<span style="color:var(--amber)">±</span>':'<span class="no">✗</span>'));
      d.innerHTML='<span class="badge">'+badge+'</span>'+
        '<span class="song"><b>'+escapeHtml(r.track)+'</b> <span>· '+escapeHtml(r.artist)+'</span></span>'+
        '<span class="n" style="opacity:.7;font-size:var(--fs-xs);text-transform:uppercase">'+escapeHtml(MODE_SHORT[r.mode]||'')+(r.points?' · +'+r.points:'')+'</span>';
      list.appendChild(d);
    });
  });
  session=null;
  soloHead('Wynik meczu');   // 5.7
  document.getElementById('session').classList.remove('live');  // body.playing zostaje → summary widoczne
  document.getElementById('summary').classList.add('show');
  document.getElementById('summary').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function hideSummary(){ document.getElementById('summary').classList.remove('show'); }

/* ============ sprawdzanie ============ */
function check(){
  if(!current || roundDone) return;   // F2a #4/#10: brak pytania / już ocenione / pominięte
  roundDone=true;
  document.getElementById('skip').disabled=true;   // F2a #4: po ocenie „pomiń" nieaktywne (tylko „Następny →")
  if(mode==='quiz'){ return checkQuiz(); }
  stopAudio(); setIcon('play');
  const g={title:val('fTitle'),artist:val('fArtist'),year:val('fYear'),album:val('fAlbum')};
  const { okTitle, okArtist, okYear, okAlbum, roundOk } = evaluateGuess(g, current);
  total++; if(roundOk){score++;streak++;} else streak=0;
  // F6a (R2/R-U3): punkty — częściowe trafienie, rok/album +20, szybkość, seria
  const sc=scoreRound({ okTitle, okArtist, okYear, okAlbum, roundOk, elapsedMs: qStartAt ? Date.now()-qStartAt : null, limitMs:SPEED_CAP_MS, streak });
  points+=sc.points;
  updateScore();
  if(session){ const s=matchSlot(session.match); session.results.push({track:current.track, artist:current.artist, okTitle, okArtist, points:sc.points, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }

  // F6a (R-U2): odsłona edukacyjna — „Ty: …" przy polu + tag, DLACZEGO zaliczone (literówka / człon duetu / rok ±2)
  const r=document.getElementById('rmeta');
  r.innerHTML='';
  const fix=(ok, guess, actual, match)=> ok && guess && norm(guess)!==norm(actual) ? (match(guess, actual) ? 'literówka OK' : 'jeden z wykonawców OK') : '';
  r.appendChild(guessLine(okTitle,'Tytuł',current.track,g.title, fix(okTitle,g.title,current.track,textMatch), sc.parts.title));
  r.appendChild(guessLine(okArtist,'Wykonawca',current.artist,g.artist, fix(okArtist,g.artist,current.artist,textMatch), sc.parts.artist));
  if(current.year){
    const exact = okYear && Math.abs(+g.year - +current.year)===0;
    r.appendChild(guessLine(okYear,'Rok',String(current.year),g.year, okYear && !exact ? 'rok ±2 OK' : '', sc.parts.year));
  }
  if(current.album) r.appendChild(guessLine(okAlbum,'Album',current.album,g.album, okAlbum && norm(g.album)!==norm(current.album) ? 'literówka OK' : '', sc.parts.album));
  if(sc.points && (sc.speed>1 || sc.streakMult>1)) r.appendChild(noteLine('punkty', ptsBreakdown(sc)));
  if(mode==='lektor' && current.lyric){
    const d=document.createElement('div'); d.className='rline';
    d.innerHTML='<span class="mk" style="color:var(--muted)">„</span>'+
      '<span class="v" style="font-weight:400;font-style:italic;color:var(--muted)">'+
      '<span class="k">czytany fragment</span>'+escapeHtml(current.lyric)+'</span>';
    r.appendChild(d);
  }
  const img=document.getElementById('art');
  if(current.art){img.src=current.art;img.style.display='';}else{img.style.display='none';}
  const rh=document.getElementById('revealHead');   // design: zielony/czerwony nagłówek wyniku
  if(rh){
    const both=okTitle&&okArtist, cls=both?'win':((okTitle||okArtist)?'part':'fail');
    const ic=both?'✓':((okTitle||okArtist)?'≈':'✗');
    const tt=both?'Dobrze!':((okTitle||okArtist)?'Prawie!':'Pudło');
    const sub=both?'Tytuł i wykonawca trafione':(okTitle?'Tytuł OK — wykonawca nie':(okArtist?'Wykonawca OK — tytuł nie':'Następnym razem'));
    rh.className='rv-shead '+cls;
    rh.innerHTML=`<span class="ic">${ic}</span><span class="tx"><b>${tt}</b><small>${sub}</small></span><span class="rv-pts">+${sc.points}</span>${streak>1?`<span class="strk">🔥 ${streak}</span>`:''}`;
  }
  document.getElementById('reveal').classList.add('show');
  if(okTitle && okArtist){ confetti(); playClap(); }   // pełne trafienie → confetti + oklaski
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=false; // można dosłuchać
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
// ocena quizu (solo): core/scoring.evaluateQuiz; trafienie = wszystkie sloty
function checkQuiz(){
  setIcon('play');
  const mc=current.mc;
  const slots=current.slots||[];
  // F3: wspólny silnik (core/scoring.evaluateQuiz) — ABCD po WYBRANEJ opcji, `pool` = sloty wymienne z dedup
  const guesses={};
  let guessLabel='';
  if(mc){
    const sel=document.querySelector('#quizForm .mc-opt.sel');
    const k=(slots[0]&&slots[0].key)||'a';
    guesses[k]=sel?sel.dataset.letter:'';
    if(sel) guessLabel=sel.dataset.letter+') '+((sel.querySelector('.mc-tx')||{}).textContent||'');
  } else {
    slots.forEach(s=>{ guesses[s.key]=val('qf_'+s.key); });
  }
  const ev=evaluateQuiz(current, guesses);
  const okBySlot=ev.bySlot, roundOk=ev.ok;
  total++; if(roundOk){score++;streak++;} else streak=0;
  const sc=scoreRound({ quizOk:roundOk, elapsedMs: qStartAt ? Date.now()-qStartAt : null, limitMs:SPEED_CAP_MS, streak });   // F6a: 100 pkt + szybkość/seria
  points+=sc.points;
  updateScore();
  if(mode==='quiz' && current.statKey) recordQuizStat(current.statKey, roundOk);   // #3: licznik trafień/pudeł
  if(session){ const s=matchSlot(session.match); session.results.push({track:current.prompt, artist:'', okTitle:roundOk, okArtist:roundOk, points:sc.points, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }
  const r=document.getElementById('rmeta'); r.innerHTML='';
  if(mc){
    const correctLetter=mc.correct||'';
    document.querySelectorAll('#quizForm .mc-opt').forEach(b=>{   // zielona = poprawna, czerwona = błędny wybór
      const wasSel=b.classList.contains('sel'); b.disabled=true; b.classList.remove('sel');
      b.setAttribute('aria-pressed', wasSel?'true':'false');
      // F2a #20: wynik także TEKSTEM (✓/✗ + aria-label), nie tylko kolorem
      const tx=(b.querySelector('.mc-tx')||{}).textContent||'';
      let mark='', desc='';
      if(b.dataset.letter===correctLetter){ b.classList.add('ok'); mark='✓'; desc=wasSel?'poprawna odpowiedź, twój wybór':'poprawna odpowiedź'; }
      else if(wasSel){ b.classList.add('no'); mark='✗'; desc='twój błędny wybór'; }
      if(mark){ const m=document.createElement('span'); m.className='mc-mark'; m.textContent=mark; b.appendChild(m);
        b.setAttribute('aria-label', `${b.dataset.letter}) ${tx} — ${desc}`); }
    });
    const k=(slots[0]&&slots[0].key)||'a';
    r.appendChild(line(roundOk,'odpowiedź', ev.display[k] + (guessLabel?` (Ty: ${guessLabel})`:' (nie wybrano)')));
  } else {
    // F3 #4: tylko forma KANONICZNA (answers[k][0] / pozycja puli), nie lista wariantów; „Ty: …" przy każdym polu
    slots.forEach(s=>{ const guess=guesses[s.key];
      r.appendChild(line(okBySlot[s.key], s.label||s.key, (ev.display[s.key]||'—') + (guess?` (Ty: ${guess})`:' (brak odpowiedzi)')));
    });
    if(ev.others.length) r.appendChild(noteLine('inne poprawne', ev.others.join(', ')));
  }
  if(sc.points && (sc.speed>1 || sc.streakMult>1)) r.appendChild(noteLine('punkty', ptsBreakdown(sc)));
  if(current.fun) r.appendChild(noteLine('ciekawostka', '💡 '+current.fun));
  const img=document.getElementById('art'); if(img) img.style.display='none';
  const rh=document.getElementById('revealHead');
  if(rh){ const cls=roundOk?'win':'fail'; const ic=roundOk?'✓':'✗';
    rh.className='rv-shead '+cls;
    rh.innerHTML=`<span class="ic">${ic}</span><span class="tx"><b>${roundOk?'Dobrze!':'Pudło'}</b><small>${roundOk?(mc?'dobra odpowiedź':'wszystkie pola trafione'):'sprawdź poprawne odpowiedzi'}</small></span><span class="rv-pts">+${sc.points}</span>${streak>1?`<span class="strk">🔥 ${streak}</span>`:''}`;
  }
  document.getElementById('reveal').classList.add('show');
  if(roundOk){ confetti(); playClap(); }
  document.getElementById('check').disabled=true;
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
document.getElementById('check').onclick=check;
document.getElementById('next').onclick=()=>{ unlockSoloAudio({ctx:session?session.hasReverse:false}); advance(); };   // F2a #9: gest → odblokuj
document.getElementById('form').addEventListener('keydown',e=>{
  // ABCD: klawisze A–D zaznaczają opcję (wygodne na desktopie)
  if(mode==='quiz' && current && current.mc && /^[a-dA-D]$/.test(e.key)){
    const b=document.querySelector(`#quizForm .mc-opt[data-letter="${e.key.toUpperCase()}"]`);
    if(b && !b.disabled){ selectMC(b); e.preventDefault(); return; }
  }
  if(e.key==='Enter' && !document.getElementById('check').disabled){ e.preventDefault(); check(); }
});
// F2a: Enter po „Sprawdź" (odsłona widoczna) → następne pytanie. Pomija przyciski/linki (natywna aktywacja)
// i zdarzenie, które samo wywołało „Sprawdź" (preventDefault powyżej).
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter' || e.repeat || e.defaultPrevented || e.isComposing) return;
  if(!session || !roundDone || !document.body.classList.contains('solo')) return;
  if(!document.getElementById('reveal').classList.contains('show')) return;
  const t=e.target;
  if(t && t.closest && (t.closest('button, a, textarea, select, [contenteditable="true"]') || (t.matches('input') && !t.closest('#form')))) return;
  e.preventDefault();
  unlockSoloAudio({ctx:session.hasReverse});
  advance();
});

/* ===== #3: tryb trenera (solo quiz) — statystyki trafień + faworyzowanie oblanych ===== */
const QUIZ_STATS_KEY='stacjaQuizStats', QUIZ_REPEAT_KEY='stacjaQuizRepeat';
let quizRepeat = (()=>{ try{ return localStorage.getItem(QUIZ_REPEAT_KEY)==='1'; }catch(_e){ return false; } })();
// F3 #6: klucz = treść BEZ opcji ABCD (quizKey) → stabilny po tasowaniu; stary klucz (pełny prompt) czytany wstecznie
function quizStatKey(cat, q){ return cat+'::'+quizKey(q); }
function quizStatOf(stats, cat, q){ return stats[quizStatKey(cat,q)] || stats[cat+'::'+norm((q&&q.prompt)||'')]; }
function loadQuizStats(){ try{ return JSON.parse(localStorage.getItem(QUIZ_STATS_KEY)||'{}'); }catch(_e){ return {}; } }
function recordQuizStat(key, ok){
  try{ const s=loadQuizStats(); const e=s[key]||{r:0,w:0}; if(ok)e.r++; else e.w++; s[key]=e;
    localStorage.setItem(QUIZ_STATS_KEY, JSON.stringify(s)); }catch(_e){}
}
function syncRepeatBtn(){ const b=document.getElementById('quizRepeat'); if(b) b.classList.toggle('on', quizRepeat); }
(function bindRepeatToggle(){
  const b=document.getElementById('quizRepeat'); if(!b) return;
  b.onclick=()=>{ quizRepeat=!quizRepeat; try{ localStorage.setItem(QUIZ_REPEAT_KEY, quizRepeat?'1':'0'); }catch(_e){} syncRepeatBtn(); };
  syncRepeatBtn();
})();

// wiersz informacyjny odsłony (bez ✓/✗): „inne poprawne", „ciekawostka" — tekst ESCAPOWANY
function noteLine(k,v){
  const d=document.createElement('div'); d.className='rline rnote';
  d.innerHTML=`<span class="mk" style="color:var(--muted)">·</span><span class="v"><span class="k">${escapeHtml(k)}</span>${escapeHtml(v)}</span>`;
  return d;
}
// F6a: rozbicie punktów (baza × szybkość × seria) — tekst do wiersza „punkty"
function ptsBreakdown(sc){
  const parts=['baza '+sc.base];
  if(sc.speed>1) parts.push('szybkość ×'+(Math.round(sc.speed*100)/100).toString().replace('.',','));
  if(sc.streakMult>1) parts.push('seria ×'+String(sc.streakMult).replace('.',','));
  return parts.join(' · ')+' = '+sc.points+' pkt';
}
// F6a (R-U2): wiersz odsłony muzyki — poprawna wartość + tag („literówka OK") + „Ty: …" + zdobyte punkty. Tekst ESCAPOWANY.
function guessLine(ok, k, actual, guess, tag, pts){
  const d=document.createElement('div'); d.className='rline';
  d.innerHTML=`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>
    <span class="v"><span class="k">${escapeHtml(k)}</span>${escapeHtml(actual)}${tag?`<span class="tag">${escapeHtml(tag)}</span>`:''}<span class="you">Ty: ${guess?escapeHtml(guess):'—'}</span></span>${pts?`<span class="pt">+${pts}</span>`:''}`;
  return d;
}
function line(ok,k,v){
  const d=document.createElement('div'); d.className='rline';
  d.innerHTML=`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>
    <span class="v"><span class="k">${escapeHtml(k)}</span>${escapeHtml(v)}</span>`;
  return d;
}

/* matching (norm/lev/textMatch/deLatin) → core/scoring.js */

/* ============ pomocnicze UI ============ */
// prymitywy DOM/FX (setIcon/setRing/setState/flash/animIn/confetti/val/resetForm/
// hideReveal/showLyric/hideLyric) → app/dom.js (import na górze pliku)
function updateScore(){ document.getElementById('sScore').textContent=score+' / '+total;
  const sp=document.getElementById('sPoints'); if(sp) sp.textContent=points;
  document.getElementById('sStreak').textContent=streak; }
