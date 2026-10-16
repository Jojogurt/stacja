/* app/solo.js — tryb SOLO: tuner kategorii, picker „ułóż mecz", losowanie rund (iTunes/lektor/quiz),
 * mecz solo (rundy × kategorie × pytania), sprawdzanie odpowiedzi. Self-wiring przy imporcie
 * (jak app/mp.js): wiąże DOM i wstrzykuje stan do app/audio.js przez initAudio. Zero zależności od app.js. */
import { escapeHtml } from '../core/util.js';
import { norm, textMatch, artistMatch, evaluateGuess, evaluateQuiz, quizKey, scoreRound, SPEED_CAP_MS, yearScore, parseYear, introMult, YEAR_MIN, YEAR_MAX, YEAR_OK_PTS, scoreLegend, revsnipMult, coverMult } from '../core/scoring.js';
import { introStageSecs, introNextStage, revsnipStageSecs, revsnipNextStage, coverNextStage, coverStageBlocks } from '../core/timing.js';
import { buildTrackMC, yearReliable, parseRange } from '../core/trackSelect.js';
import { QPC, CPR, ALL_MODES, MODE_LABEL, MODE_SHORT, matchSlot, matchAdvance, matchProgress, matchQLabel, matchTotal, DEFAULT_QUESTIONS, QUICK_QUESTIONS } from '../core/match.js';
import { dailySeed, dailyPlan, dailyPool, dailyQuestionRnd, dailyRecord, dailyShareText, matchShareText, resultGrid, DAILY_QUESTIONS } from '../core/daily.js';
import { dailyInfo, saveDailyRecord, shareText, shareUrl } from './daily.js';
import { buildSoloRecord } from '../core/matchRecord.js';
import { plPick, togglePick as _togglePick, toggleAllPick as _toggleAll, allSelected as _allSelected,
  syncQuizMode as _syncQuizMode, grpActive as _grpActive, pickSummary, pickSummaryText, quickPool, restorePick } from '../core/picker.js';
import { resolveTrack, resolveDistractors, resolveMedley, resolveCover, resolvePiano } from '../adapters-web/itunesRepository.js';
import { coverShow, coverStage, coverStop, coverHide } from './cover.js';   // EKSPERYMENT: tryb „okładka"
import { recordMatch, ensureSession } from '../adapters-web/cf.js';
import { setIcon, setRing, setState, flash, animIn, confetti, val, resetForm, hideReveal, showLyric, hideLyric, lsGet, lsSet } from './dom.js';
import { showScreen } from './social.js';   // F6a: „Graj teraz" / „Kontynuuj mecz" z menu
import { lektorPlay } from './lektor.js';
import { catLektorLang } from '../core/lektorVoice.js';
import { playClap, playSfx } from './sfx.js';
import { initCatEditor, openEditor } from './catEditor.js';
import { unlockCtx } from './audioCtx.js';
import { startAudio, stopAudio, toggleAudio, replay, initAudio, unlockSoloAudio, loadMedley } from './audio.js';
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
  stopAudio(); coverHide(); hideReveal(); hideSummary(); resetForm(); hideLyric(); renderSoloForm(); hideOfflineOffer();
  if(session) updateSessUI();
  setIcon('wait'); setState('strojenie…');
  disableRoundControls();

  const eraKey = selectedEra==='rnd' ? ALL_KEYS[Math.floor(Math.random()*ALL_KEYS.length)] : selectedEra;
  const cat = ALL_CATS[eraKey];
  // F8b: Stacja dnia — osobny seedowany strumień rnd per pytanie (ten sam wykonawca/utwór u wszystkich)
  const rnd = session && session.daily ? dailyQuestionRnd(session.daily.trackSeed, matchProgress(session.match).n-1) : undefined;
  // EKSPERYMENT: składanka / okładka — pytanie o WYKONAWCĘ (4 utwory albo album z puli wykonawców kategorii).
  // Brak (za mało utworów/albumów u kilku wykonawców, sieć) → pytanie jak zwykła „muzyka" (cur.fallback).
  if(mode==='medley' || mode==='cover'){
    const args={cat, seen:seenTracks, recent:recentArtists, cfg:window.STACJA_CONFIG, rnd};
    let r=null; try{ r = mode==='medley' ? await resolveMedley(args) : await resolveCover(args); }catch(_e){ r=null; }
    if(gen!==soloGen) return;
    if(r && !r.error) return startArtistQuestion(r, eraKey, gen);
  }
  // EKSPERYMENT „fortepian": oryginał + jego cover fortepianowy; brak coveru (np. same polskie utwory) → zwykła „muzyka"
  let t=null;
  if(mode==='piano'){
    setState('szukam coveru fortepianowego…');
    let p=null; try{ p=await resolvePiano({cat, seen:seenTracks, recent:recentArtists, cfg:window.STACJA_CONFIG, rnd}); }catch(_e){ p=null; }
    if(gen!==soloGen) return;
    if(p && (!p.error || p.reason==='offline')) t=p;   // offline → od razu komunikat (bez drugiej kaskady)
  }
  if(!t) t = await resolveTrack({cat, seen:seenTracks, recent:recentArtists, cfg:window.STACJA_CONFIG, rnd});
  // 2.1: rundę porzucono w trakcie losowania (Zakończ / zmiana trybu / nowa runda) — nie startuj audio nad podsumowaniem.
  // F2a #3: `busy` należy wtedy już do nowszego stanu (abandonRound je zwolnił, nowa runda mogła je zająć) — nie ruszaj.
  if(gen!==soloGen) return;
  if(t.error){
    busy=false;
    // 2.2: NIE zostawiaj poprzedniego utworu — inaczej „sprawdź" oceniłoby stare pytanie (duplikat w wynikach)
    current=null; setIcon('play');
    document.getElementById('skip').disabled=false;   // pozwól pominąć; ▶ (gałka) z current=null ponawia newRound
    // F6a (R-F10/F11): komunikat dla gracza + ścieżka offline (lektor/wiedza działają bez iTunes)
    if(t.reason==='offline'){ flash('Brak internetu albo serwis z muzyką nie odpowiada. Stuknij ▶, by spróbować ponownie — albo zagraj offline.'); showOfflineOffer(); }
    else if(cat.songs && cat.songs.length && (!cat.artists||!cat.artists.length)) flash('Brak grających zajawek w tej playliście — wybierz inną kategorię.');
    else flash('Brak zajawek dla tej kategorii — stuknij ▶, by spróbować ponownie, albo pomiń pytanie.');
    return;
  }
  const cur={...t, era:eraKey, lyric:''};
  // F8a: przygotowanie pytania wg trybu (intro: etap 0; rok: wiarygodność; ABCD: kafle z dystraktorów).
  // Brak roku / za mało dystraktorów → pytanie jak zwykła „muzyka" (cur.fallback).
  if(mode==='intro') cur.introStage=0;
  if(mode==='revsnip') cur.revStage=0;                       // EKSPERYMENT: okno 3 s (koniec okna losowany po dekodowaniu)
  if(mode==='medley' || mode==='cover') cur.fallback=true;   // EKSPERYMENT: nie znaleziono wykonawcy/albumu → muzyka
  if(mode==='piano' && !t.coverArtist) cur.fallback=true;    // EKSPERYMENT: brak coveru fortepianowego → muzyka
  if(mode==='year'){
    if(parseYear(t.year)==null) cur.fallback=true;
    else if(!yearReliable(t.year, cat.range, t.yearSrc)) cur.yearNote='rok wg wydania w iTunes';
  }
  if(mode==='abcd'){
    setState('układam odpowiedzi…');
    let ds=[]; try{ ds=await resolveDistractors({cat, correct:t, cfg:window.STACJA_CONFIG}); }catch(_e){ ds=[]; }
    if(gen!==soloGen) return;   // runda porzucona w trakcie pobierania dystraktorów
    const q=buildTrackMC(t, ds);
    if(q){ cur.mc=q.mc; cur.slots=q.slots; cur.answers=q.answers; cur.prompt=q.prompt; } else cur.fallback=true;
  }
  busy=false;
  current=cur;
  renderSoloForm(); syncIntroBtn();
  dailyTouch();          // F8b: pierwsze grywalne pytanie Stacji dnia = próba dnia wykorzystana
  qStartAt=Date.now();   // F6a: od teraz liczy się czas odpowiedzi
  startAudio();
}
/* EKSPERYMENT: start pytania „tylko wykonawca" (składanka / okładka) po rozwiązaniu r (core/trackSelect.resolveMedley/Cover).
 * Składanka: wszystkie zajawki pobierane i dekodowane PRZED startem (pasek „ładuję składankę k/n"). */
async function startArtistQuestion(r, eraKey, gen){
  let cur;
  if(mode==='medley'){
    const clips=r.clips.map(c=>({ ...c }));
    cur={ track:clips.map(c=>c.track).join(' · '), artist:r.artist, artistAlt:r.artistAlt, clips, year:'', album:'',
      preview:clips[0].preview, art:clips[0].art, era:eraKey, lyric:'' };
    setState('ładuję składankę 0/'+clips.length); setRing(0);
    await loadMedley(cur, { alive:()=>gen===soloGen, onProgress:(k,n)=>{ if(gen!==soloGen) return; setState('ładuję składankę '+k+'/'+n); setRing(k/n); } });
    if(gen!==soloGen) return;
  } else {
    cur={ track:r.album, album:r.album, artist:r.artist, artistAlt:r.artistAlt, year:r.year||'', art:r.art, preview:'',
      era:eraKey, lyric:'', coverStage:0 };
  }
  busy=false;
  current=cur;
  renderSoloForm(); syncIntroBtn();
  dailyTouch();
  qStartAt=Date.now();
  if(mode==='cover'){
    document.getElementById('check').disabled=false; document.getElementById('skip').disabled=false;
    setIcon('play'); setState('kto to? okładka odsłania się co kilka sekund');
    coverShow(cur, { onStage:(st)=>{ if(current!==cur || roundDone) return false; cur.coverStage=st; syncIntroBtn(); return true; } });
    const f=document.getElementById('qf_artist'); if(f) f.focus({preventScroll:true});
    return;
  }
  startAudio();
}
/* F8a: tryb efektywny bieżącego pytania — ABCD bez kafli / rok bez roku grają jak „muzyka" (EKSP.: też składanka/okładka bez wyniku) */
function qMode(){ return (current && current.fallback) ? 'music' : mode; }
/* F8a: „+ więcej" (intro) — następny etap odsłony, gra od początku do nowej długości.
 * EKSPERYMENT: ten sam przycisk = „+ dłużej" („od tyłu krótko": 3 → 5 s) i „wyraźniej" (okładka: następny etap). */
function syncIntroBtn(){
  const b=document.getElementById('introMore'); if(!b) return;
  const qm=qMode(), live=!!current && !roundDone;
  let nx=null, label='+ więcej';
  if(qm==='revsnip'){ nx=current ? revsnipNextStage(current.revStage||0) : null; label = nx!=null ? '+ dłużej ('+revsnipStageSecs(nx)+' s)' : 'dłużej ✓'; }
  else if(qm==='cover'){ nx=current ? coverNextStage(current.coverStage||0) : null; label = nx!=null ? 'wyraźniej' : 'pełna okładka'; }
  else { nx = current && mode==='intro' ? introNextStage(current.introStage) : null; label = nx!=null ? '+ więcej ('+introStageSecs(nx)+' s)' : '+ więcej'; }
  b.disabled = !(live && nx!=null && (qm==='intro' || qm==='revsnip' || qm==='cover'));
  b.textContent = label;
}
function introMore(){
  if(!current || roundDone || busy) return;
  const qm=qMode();
  if(qm==='revsnip'){   // EKSPERYMENT: dłuższe okno (mniejszy mnożnik), gra od nowa
    const nx=revsnipNextStage(current.revStage||0); if(nx==null) return;
    unlockSoloAudio({ctx:true});   // gest → AudioContext (iOS)
    current.revStage=nx; syncIntroBtn(); startAudio(); return;
  }
  if(qm==='cover'){     // EKSPERYMENT: następny etap odsłony okładki (mniejszy mnożnik)
    const nx=coverNextStage(current.coverStage||0); if(nx==null) return;
    current.coverStage=nx; coverStage(nx); syncIntroBtn(); return;
  }
  if(mode!=='intro') return;
  const nx=introNextStage(current.introStage); if(nx==null) return;
  unlockSoloAudio({ctx:false});   // gest → element odblokowany (iOS)
  current.introStage=nx; syncIntroBtn();
  startAudio();
}
(function wireIntroMore(){ const b=document.getElementById('introMore'); if(b) b.onclick=introMore; })();

/* ============ audio (solo) → app/audio.js + app/audioCtx.js ============ */
// stan gry (current/mode) i wznowienie rundy wstrzykiwane; uchwyty odtwarzacza żyją w module
// EKSPERYMENT: tryb AUDIO = tryb efektywny (składanka/okładka bez wyniku grają jak „muzyka")
initAudio({ current: ()=>current, mode: ()=>qMode(), newRound, gen: ()=>soloGen, busy: ()=>busy });
document.getElementById('knob').onclick=toggleAudio;
document.getElementById('replay').onclick=replay;

function disableRoundControls(){
  const im=document.getElementById('introMore'); if(im) im.disabled=true;   // F8a
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=true;
  document.getElementById('skip').disabled=true;
}
/* F2a #3: porzucenie rundy (Zakończ / koniec meczu / zmiana trybu) — unieważnij async ORAZ zwolnij `busy`
   i bieżące pytanie. Bez tego „Zakończ" w trakcie strojenia zostawiał busy=true i nowy mecz utykał
   na `if(busy) return` (a gałka grała utwór z poprzedniego meczu). */
function abandonRound(){
  soloGen++; busy=false; current=null; roundDone=true;
  coverStop(false);   // EKSPERYMENT: timer odsłony okładki
  disableRoundControls();
}
// klasy trybu na body: quiz-mode (bez gałki) i lektor-mode („lepszy głos" tylko dla lektora)
function syncModeClasses(){
  document.body.classList.toggle('quiz-mode', mode==='quiz');
  document.body.classList.toggle('lektor-mode', mode==='lektor');
  document.body.classList.toggle('intro-mode', mode==='intro');   // F8a: „+ więcej"
  // EKSPERYMENT: „+ dłużej" (od tyłu krótko), okładka = bez gałki/audio (jak quiz) + przycisk „wyraźniej"
  const qm=qMode();
  document.body.classList.toggle('revsnip-mode', qm==='revsnip');
  document.body.classList.toggle('cover-mode', qm==='cover');
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
    const lang=catLektorLang(ALL_CATS[k]);   // język opisów kategorii (lyrics.js `lang`) → głos lektora
    songs.forEach(s=>{ if(s.lyric) out.push({ ...s, lang }); });
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
    year:s.year||'', album:s.album||'', preview:'', art:'', lyric:s.lyric, tts:s.tts||'', lang:s.lang||'pl'};
  seenTracks.add(norm(s.title));
  busy=false; qStartAt=Date.now();
  document.getElementById('check').disabled=false;
  document.getElementById('replay').disabled=false;
  document.getElementById('skip').disabled=false;
  document.getElementById('knob').classList.add('live');
  renderSoloForm();
  showLyric(s.lyric);
  lektorPlay(s.lyric, s.tts, setState, { lang:current.lang });
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
  const qm = qMode();
  const isMC = (isQuiz || qm==='abcd') && !!(current && current.mc);   // F8a: ABCD muzyki = te same kafle .mc-opt
  const isYear = qm==='year' && !!current;                             // F8a: pole roku zamiast tytułu/wykonawcy
  const isArtist = (qm==='medley' || qm==='cover') && !!current;       // EKSPERYMENT: tylko wykonawca (+ album przy okładce)
  form.classList.toggle('quiz', isQuiz || isMC || isYear || isArtist);
  syncModeClasses();   // quiz-mode: ukryj gałkę/audio w decku; lektor-mode: pokaż „lepszy głos"
  syncLegend();        // F8b: stopka-legenda punktacji wg trybu bieżącego pytania
  const qf=document.getElementById('quizForm'); if(!qf) return;
  if(isYear){ renderYearForm(qf); return; }
  if(isArtist){
    qf.innerHTML=`<div class="field"><label for="qf_artist">Wykonawca</label><input id="qf_artist" autocomplete="off" autocapitalize="off" placeholder="${qm==='medley'?'czyje to utwory?':'czyja to okładka?'}"></div>`+
      (qm==='cover' ? `<div class="field"><label for="qf_album">Album <small>(bonus +20)</small></label><input id="qf_album" autocomplete="off" autocapitalize="off" placeholder="opcjonalnie"></div>` : '');
    return;
  }
  if(isMC){
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
/* F8a: tryb „rok" — pole liczbowe (1950–2026) z przyciskami ±1 i suwakiem; suwak startuje w środku dekady kategorii */
function yearMid(){
  const rng=parseRange(current && ALL_CATS[current.era] && ALL_CATS[current.era].range);
  if(rng && rng.to<9999) return Math.round((rng.from+rng.to)/2);
  if(rng) return Math.min(YEAR_MAX, rng.from+3);
  return 1990;
}
const clampYear = y => Math.max(YEAR_MIN, Math.min(YEAR_MAX, y));
function renderYearForm(qf){
  const mid=yearMid();
  qf.innerHTML=`<div class="field yr"><label for="qf_year">Rok wydania</label>
    <div class="yr-row"><button type="button" class="yr-step" data-d="-1" aria-label="rok −1">−1</button>
    <input id="qf_year" type="number" inputmode="numeric" min="${YEAR_MIN}" max="${YEAR_MAX}" autocomplete="off" placeholder="np. ${mid}">
    <button type="button" class="yr-step" data-d="1" aria-label="rok +1">+1</button></div>
    <input id="qf_yearRange" class="yr-range" type="range" min="${YEAR_MIN}" max="${YEAR_MAX}" step="1" value="${mid}" aria-label="rok wydania — suwak"></div>`;
  const inp=document.getElementById('qf_year'), rng=document.getElementById('qf_yearRange');
  rng.oninput=()=>{ inp.value=rng.value; };
  inp.oninput=()=>{ const y=parseYear(inp.value); if(y!=null) rng.value=String(clampYear(y)); };
  qf.querySelectorAll('.yr-step').forEach(b=>{ b.onclick=()=>{
    const y=clampYear((parseYear(inp.value) ?? +rng.value) + (+b.dataset.d));
    inp.value=String(y); rng.value=String(y);
  }; });
}
function showPrompt(text){ const b=document.getElementById('lyricBox'); if(!b) return;
  b.innerHTML='<span class="lyric-cap">pytanie</span>'+escapeHtml(text||''); b.classList.add('quiz'); b.hidden=false; }
document.getElementById('skip').onclick=()=>{
  if(roundDone) return;   // F2a #4: pytanie już ocenione („Sprawdź") — drugi wpis tego samego pytania zablokowany
  roundDone=true; document.getElementById('check').disabled=true; document.getElementById('skip').disabled=true; syncIntroBtn(); coverStop(false);
  unlockSoloAudio({ctx:session?session.hasReverse:false});   // F2a #9: gest → kolejna zajawka zagra bez dodatkowego stuknięcia (iOS)
  // F8b: Stacja dnia — pytanie niewczytane (błąd sieci) i pominięte też ma kratkę (⬛), siatka = 10 pytań
  if(session && (current || session.daily)){ const s=matchSlot(session.match); pushResult({track:current?current.track:'(nie wczytano)', artist:current?current.artist:'', okTitle:false, okArtist:false, skipped:true, points:0, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); }
  streak=0; updateScore();
  advance();
};

/* ============ MECZ solo: rundy × kategorie × pytania ============ */
document.getElementById('sessEnd').onclick=()=>{ if(session && session.results.length) finishMatch(); else endMatch(); };
document.getElementById('sumAgain').onclick=()=>{ hideSummary(); document.body.classList.remove('playing','match-over','daily'); soloHead('Ułóż mecz'); };

function startMatch(){
  if(!soloCats.size){ updateMatchInfo(); return; }
  if(!soloModes.size){ updateMatchInfo(); return; }
  if(startSoloMatch([...soloCats],[...soloModes],soloQuestions)) saveSoloPick();   // F6a: zapamiętaj pulę
}
// F6a: wspólny start meczu solo — picker, „Graj teraz" (R-F1) i „Zagraj offline" (R-F10). true = wystartował.
// F8b: `opts.plan` — gotowy plan (Stacja dnia: core/daily.dailyPlan, qpc 1), `opts.daily` — {key, n, trackSeed}
function startSoloMatch(cats, modes, questions, opts={}){
  const r=opts.plan || buildMatch(cats, modes, {questions});
  if(r.error){ const el=document.getElementById('matchInfo'); el.className='um-summary err'; el.textContent=r.error; return false; }
  if(session || busy) abandonRound();   // poprzedni mecz / losowanie w locie → porzuć (busy zwolnione, async unieważniony)
  hideOfflineOffer();
  const hasReverse=r.slots.some(x=>['reverse','revsnip','medley'].includes(x.mode));   // AudioContext (WebAudio): od tyłu, EKSP.: od tyłu krótko, składanka
  const match={slots:r.slots, rounds:r.rounds, si:0, qi:0};
  if(r.qpc) match.qpc=r.qpc;
  session={match, results:[], hasReverse, cats:[...cats], modes:[...modes], questions:r.questions, daily:opts.daily||null};
  document.body.classList.toggle('daily', !!session.daily);
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
function playHead(){ const s=session && matchSlot(session.match);
  if(s && session.daily) return 'Stacja dnia #'+session.daily.n+' · '+catLabel(s.cat);   // F8b
  return s ? 'Runda '+s.round+'/'+session.match.rounds+' · '+catLabel(s.cat) : 'Mecz'; }
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
    if(scr==='menu'){ syncContinue(); syncDailyCard(); }
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
  document.body.classList.remove('playing','quiz-mode','lektor-mode','intro-mode','revsnip-mode','cover-mode','match-over','daily');
  hideSummary(); stopAudio(); setIcon('play'); hideOfflineOffer();
  soloHead('Ułóż mecz');   // 5.7: powrót do tytułu pickera
}
function updateSessUI(){
  if(!session) return;
  // F6b (A1/A2): pasek 2-wierszowy — „Pyt. 7/10" (cały mecz) + kontekst (runda/kategoria/tryb/blok) osobno
  const q=matchQLabel(session.match);
  document.getElementById('sessProg').textContent=q ? q.charAt(0).toUpperCase()+q.slice(1) : '';
  const ctx=document.getElementById('sessCtx'); if(ctx) ctx.textContent=matchHeader(session.match);
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
  const tot=matchTotal(session.match);   // F8b: qpc meczu (Stacja dnia: 10 slotów × 1)
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
  document.body.classList.remove('quiz-mode','lektor-mode','intro-mode','revsnip-mode','cover-mode'); document.body.classList.add('match-over'); coverHide();
  setState('mecz zakończony');
  const cut = played < tot;
  document.getElementById('sumBig').textContent=hits+' / '+(cut?played:tot);
  const sp=document.getElementById('sumPts'); if(sp) sp.textContent=points+' pkt';   // F6a: wynik w punktach obok X/Y trafień
  document.getElementById('sumSub').textContent= cut
    ? `trafione z ${played} ${plPick(played,'rozegranego','rozegranych','rozegranych')} · mecz przerwany (${played} z ${tot})`
    : 'koniec meczu';
  // F8b: siatka emoji + „Udostępnij" (Stacja dnia: wynik dnia zapisany, seria 🔥)
  const daily=session.daily;
  if(daily){
    saveDailyRecord(dailyRecord({ key:daily.key, results:res, points, total:tot, done:true }));
    const info=dailyInfo(daily.key);
    document.getElementById('sumSub').textContent=`Stacja dnia #${daily.n}`+(cut?` · przerwana (${played} z ${tot})`:'')+(info.streak?` · 🔥 seria ${info.streak} ${plPick(info.streak,'dzień','dni','dni')}`:'');
    setShare(dailyShareText({ n:daily.n, hits, total:tot, streak:info.streak, grid:resultGrid(res, tot), url:shareUrl() }), resultGrid(res, tot), 'Udostępnij');
  } else {
    setShare(matchShareText({ points, hits, total:cut?played:tot, grid:resultGrid(res, cut?played:tot), url:shareUrl() }), resultGrid(res, cut?played:tot), 'Udostępnij wynik');
  }
  const list=document.getElementById('sumList'); list.innerHTML='';
  const byRound={};
  res.forEach(r=>{ (byRound[r.round]=byRound[r.round]||[]).push(r); });
  Object.keys(byRound).sort((a,b)=>a-b).forEach(rd=>{
    const grp=byRound[rd], rh=grp.filter(x=>x.okTitle&&x.okArtist).length;
    const hdr=document.createElement('div'); hdr.className='band-label'; hdr.style.margin='12px 0 4px';
    const rp=grp.reduce((a,x)=>a+(x.points||0),0);
    hdr.textContent=(daily?'Stacja dnia':'Runda '+rd)+' — '+rh+'/'+grp.length+' · '+rp+' pkt';
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
  soloHead(daily ? 'Stacja dnia #'+daily.n : 'Wynik meczu');   // 5.7
  document.getElementById('session').classList.remove('live');  // body.playing zostaje → summary widoczne
  document.getElementById('summary').classList.add('show');
  if(played) playSfx('fanfare');   // F6b (U4): fanfara końca meczu (po stopAudio — duck nie blokuje)
  document.getElementById('summary').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function hideSummary(){ document.getElementById('summary').classList.remove('show'); }

/* ============ F8b: wyniki meczu — wspólny zapis + udostępnianie ============ */
function pushResult(r){
  session.results.push(r);
  if(session.daily) saveDailyRecord(dailyRecord({ key:session.daily.key, results:session.results, points, total:matchTotal(session.match), done:false }));
}
let shareTx='';
function setShare(text, grid, label){
  shareTx=text||'';
  const g=document.getElementById('sumGrid'); if(g){ g.textContent=grid||''; g.hidden=!grid; }
  const b=document.getElementById('sumShare'); if(b){ b.hidden=!shareTx; b.textContent=label||'Udostępnij wynik'; }
}
(function wireShare(){
  const b=document.getElementById('sumShare'); if(!b) return;
  b.onclick=async()=>{
    if(!shareTx) return;
    const r=await shareText(shareTx);
    const st=document.getElementById('sumShareSt');
    if(st) st.textContent = r==='copied' ? 'Skopiowano do schowka ✓' : (r==='shared' ? 'Udostępniono ✓' : (r==='cancelled' ? '' : 'Nie udało się — skopiuj ręcznie: '+shareTx));
  };
})();

/* ============ F8b: Stacja dnia — karta w menu, start (jedna próba), wynik z zapisu ============ */
function dailyTouch(){
  if(!session || !session.daily) return;
  const info=dailyInfo(session.daily.key);
  if(!info.record) saveDailyRecord(dailyRecord({ key:session.daily.key, results:session.results, points, total:matchTotal(session.match), done:false }));
}
function syncDailyCard(){
  const b=document.getElementById('goDaily'); if(!b) return;
  const info=dailyInfo();
  const tx=document.getElementById('goDailyTx'); if(tx) tx.textContent='Stacja dnia #'+info.n;
  const sub=document.getElementById('goDailySub');
  const fire=info.streak ? ` · 🔥 seria ${info.streak} ${plPick(info.streak,'dzień','dni','dni')}` : '';
  const rec=info.record;
  const live=session && session.daily && session.daily.key===info.key;
  if(sub) sub.textContent = live ? `w trakcie — wróć do gry${fire}`
    : rec ? `zagrane: ${rec.hits}/${rec.total}${rec.done?'':' (przerwane)'}${fire}`
    : `zagraj · ${DAILY_QUESTIONS} hitów · jedna próba${fire}`;
  b.classList.toggle('done', !!rec && !live);
}
// wynik dnia z zapisu (karta po zagraniu) — podsumowanie + „Udostępnij"
function showDailyResult(info){
  const rec=info.record;
  if(session || busy) abandonRound();
  session=null; document.getElementById('session').classList.remove('live');
  stopAudio(); setIcon('play'); hideReveal(); resetForm(); hideLyric(); hideOfflineOffer();
  const qf=document.getElementById('quizForm'); if(qf) qf.innerHTML='';
  document.body.classList.remove('quiz-mode','lektor-mode','intro-mode','revsnip-mode','cover-mode'); coverHide();
  document.body.classList.add('playing','match-over','daily');
  document.getElementById('sumBig').textContent=rec.hits+' / '+rec.total;
  const sp=document.getElementById('sumPts'); if(sp) sp.textContent=(rec.points||0)+' pkt';
  document.getElementById('sumSub').textContent=`Stacja dnia #${info.n} · `+(rec.done?'zagrane dziś':`przerwana (${rec.played} z ${rec.total})`)+
    (info.streak?` · 🔥 seria ${info.streak} ${plPick(info.streak,'dzień','dni','dni')}`:'')+' · kolejna jutro';
  setShare(dailyShareText({ n:info.n, hits:rec.hits, total:rec.total, streak:info.streak, grid:rec.grid, url:shareUrl() }), rec.grid, 'Udostępnij');
  const list=document.getElementById('sumList'); list.innerHTML='';
  (rec.results||[]).forEach(r=>{
    const d=document.createElement('div'); d.className='sum-row';
    d.innerHTML='<span class="badge">'+escapeHtml(r.c||'')+'</span><span class="song"><b>'+escapeHtml(r.track)+'</b> <span>· '+escapeHtml(r.artist)+'</span></span>'+
      '<span class="n" style="opacity:.7;font-size:var(--fs-xs)">'+(r.points?'+'+(r.points|0):'')+'</span>';
    list.appendChild(d);
  });
  soloHead('Stacja dnia #'+info.n);
  document.getElementById('summary').classList.add('show');
}
function startDaily(){
  unlockCtx();
  showScreen('solo');
  const info=dailyInfo();
  if(session && session.daily && session.daily.key===info.key){ soloHead(playHead()); return; }   // trwa — wróć do gry
  if(info.record){ showDailyResult(info); return; }                                              // jedna próba dziennie
  const pool=dailyPool(ALL_CATS);
  const plan=dailyPlan(dailySeed(info.key), pool);
  if(plan.error || !pool.length){ flash('Nie udało się wczytać kategorii z muzyką. Sprawdź internet i odśwież stronę.'); return; }
  startSoloMatch(pool, ['music'], plan.questions, { plan, daily:{ key:info.key, n:info.n, trackSeed:plan.trackSeed } });
}
(function wireDaily(){
  const b=document.getElementById('goDaily'); if(!b) return;
  b.onclick=startDaily;
  syncDailyCard();
})();

/* ============ F8b: stopka-legenda punktacji wg trybu bieżącego pytania ============ */
function syncLegend(){
  const el=document.getElementById('footLegend'); if(!el) return;
  el.textContent=scoreLegend(session || current ? qMode() : 'music');
}

/* ============ sprawdzanie ============ */
function check(){
  if(!current || roundDone) return;   // F2a #4/#10: brak pytania / już ocenione / pominięte
  roundDone=true;
  document.getElementById('skip').disabled=true;   // F2a #4: po ocenie „pomiń" nieaktywne (tylko „Następny →")
  syncIntroBtn();
  if(mode==='quiz'){ return checkQuiz(); }
  const qm=qMode();
  if(qm==='abcd' && current.mc){ return checkQuiz(); }   // F8a: ABCD muzyki — ocena po wybranym kaflu
  if(qm==='year'){ return checkYear(); }                 // F8a: rok wydania
  if(qm==='medley' || qm==='cover'){ return checkArtistQ(); }   // EKSPERYMENT: składanka / okładka
  stopAudio(); setIcon('play');
  const g={title:val('fTitle'),artist:val('fArtist'),year:val('fYear'),album:val('fAlbum')};
  const { okTitle, okArtist, okYear, okAlbum, roundOk } = evaluateGuess(g, current);
  total++; if(roundOk){score++;streak++;} else streak=0;
  // F8a: intro — mnożnik etapu ZAMIAST bonusu za szybkość; brak zajawki → bez mnożnika (jak muzyka)
  const intro = mode==='intro' && !current.introBroken;
  const iStage = intro ? (current.introStage||0) : null;
  // F6a (R2/R-U3): punkty — częściowe trafienie, rok/album +20, szybkość, seria
  // EKSPERYMENT: „od tyłu krótko" — etap „dłużej" (5 s) ×0,8 (szybkość/seria jak w muzyce)
  const rStage = qm==='revsnip' ? (current.revStage||0) : null;
  const sc=scoreRound({ okTitle, okArtist, okYear, okAlbum, roundOk, elapsedMs: intro ? null : (qStartAt ? Date.now()-qStartAt : null), limitMs:SPEED_CAP_MS, streak,
    mult: intro ? introMult(iStage) : (rStage!=null ? revsnipMult(rStage) : 1) });
  points+=sc.points;
  if(mode==='intro') current.introFull=true;   // F8a: po ocenie ↻ od nowa gra całą zajawkę (dosłuchanie)
  updateScore();
  if(session){ const s=matchSlot(session.match); pushResult({track:current.track, artist:current.artist, okTitle, okArtist, points:sc.points, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }

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
  if(intro) r.appendChild(noteLine('intro', `${roundOk?'zgadłeś':'odpowiedź'} na etapie ${introStageSecs(iStage)} s · mnożnik ×${String(sc.mult).replace('.',',')}`));
  if(qm==='piano' && current.coverArtist) r.appendChild(noteLine('cover', '🎹 '+current.coverArtist));   // EKSPERYMENT: kto grał cover
  if(rStage!=null) r.appendChild(noteLine('od tyłu', `okno ${revsnipStageSecs(rStage)} s`+(sc.mult<1 ? ` · „dłużej" ×${String(sc.mult).replace('.',',')}` : '')));
  if(sc.points && (sc.speed>1 || sc.streakMult>1 || sc.mult!==1)) r.appendChild(noteLine('punkty', ptsBreakdown(sc)));
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
  else playSfx(okTitle||okArtist ? 'ding' : 'buzz');   // F6b (U4): częściowe → „ding", pudło → „bzzt"
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=false; // można dosłuchać
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
// ocena quizu (solo): core/scoring.evaluateQuiz; trafienie = wszystkie sloty
function checkQuiz(){
  const abcd = mode!=='quiz';   // F8a: ABCD muzyki (zajawka + kafle „Tytuł — Wykonawca")
  if(abcd) stopAudio();
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
  if(session){ const s=matchSlot(session.match); pushResult({track:abcd?current.track:current.prompt, artist:abcd?current.artist:'', okTitle:roundOk, okArtist:roundOk, points:sc.points, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }
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
  if(abcd){ const meta=[current.album, current.year].filter(Boolean).join(' · '); if(meta) r.appendChild(noteLine('album', meta)); }
  const img=document.getElementById('art');
  if(img){ if(abcd && current.art){ img.src=current.art; img.style.display=''; } else img.style.display='none'; }
  const rh=document.getElementById('revealHead');
  if(rh){ const cls=roundOk?'win':'fail'; const ic=roundOk?'✓':'✗';
    rh.className='rv-shead '+cls;
    rh.innerHTML=`<span class="ic">${ic}</span><span class="tx"><b>${roundOk?'Dobrze!':'Pudło'}</b><small>${roundOk?(mc?'dobra odpowiedź':'wszystkie pola trafione'):'sprawdź poprawne odpowiedzi'}</small></span><span class="rv-pts">+${sc.points}</span>${streak>1?`<span class="strk">🔥 ${streak}</span>`:''}`;
  }
  document.getElementById('reveal').classList.add('show');
  if(roundOk){ confetti(); playClap(); } else playSfx('buzz');   // F6b (U4): pudło → „bzzt"
  document.getElementById('check').disabled=true;
  if(abcd) document.getElementById('replay').disabled=false;   // można dosłuchać
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
/* EKSPERYMENT: składanka / okładka — ocena WYKONAWCY (artistMatch: też człon duetu; forma z puli albo zapis iTunes),
 * okładka: + album (bonus 20, textMatch bez „(Deluxe…)") i mnożnik etapu odsłony ZAMIAST bonusu za szybkość (jak intro). */
function checkArtistQ(){
  const cover = qMode()==='cover';
  stopAudio(); setIcon('play');
  const stage = cover ? (current.coverStage||0) : null;
  if(cover) coverStop(true);   // odsłona: pełna okładka
  const ga=val('qf_artist'), gal=cover ? val('qf_album') : '';
  const okArtist = !!ga && (artistMatch(ga, current.artist) || (!!current.artistAlt && artistMatch(ga, current.artistAlt)));
  const okAlbum = cover && !!gal && !!current.album && textMatch(gal, current.album);
  total++; if(okArtist){score++;streak++;} else streak=0;
  const sc=scoreRound({ okArtist, okAlbum, artistOnly:true, elapsedMs: cover ? null : (qStartAt ? Date.now()-qStartAt : null), limitMs:SPEED_CAP_MS, streak,
    mult: cover ? coverMult(stage) : 1 });
  points+=sc.points;
  updateScore();
  if(session){ const s=matchSlot(session.match); pushResult({track:current.track, artist:current.artist, okTitle:okArtist, okArtist, points:sc.points, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }
  document.querySelectorAll('#quizForm input').forEach(x=>{ x.disabled=true; });
  const r=document.getElementById('rmeta'); r.innerHTML='';
  const tagA = okArtist && norm(ga)!==norm(current.artist) ? (textMatch(ga, current.artist) || textMatch(ga, current.artistAlt||'') ? 'literówka OK' : 'jeden z wykonawców OK') : '';
  r.appendChild(guessLine(okArtist, 'Wykonawca', current.artist, ga, tagA, sc.parts.artist));
  if(cover){
    r.appendChild(guessLine(okAlbum, 'Album', current.album, gal, okAlbum && norm(gal)!==norm(current.album) ? 'literówka OK' : '', sc.parts.album));
    if(current.year) r.appendChild(noteLine('rok', String(current.year)));
    const bl=coverStageBlocks(stage);
    r.appendChild(noteLine('okładka', (bl ? `odpowiedź przy ${bl}×${bl} pikselach` : 'odpowiedź przy pełnej okładce')+` · mnożnik ×${String(sc.mult).replace('.',',')}`));
  } else {
    const played=(current.playedClips || current.clips.filter(c=>c.ok)).length ? (current.playedClips || current.clips.filter(c=>c.ok)) : current.clips;
    r.appendChild(noteLine('zagrały', played.map((c,i)=>(i+1)+'. '+c.track).join(' · ')));
  }
  if(sc.points && (sc.speed>1 || sc.streakMult>1 || sc.mult!==1)) r.appendChild(noteLine('punkty', ptsBreakdown(sc)));
  const img=document.getElementById('art');
  if(img){ if(current.art){ img.src=current.art; img.style.display=''; } else img.style.display='none'; }
  const rh=document.getElementById('revealHead');
  if(rh){
    const cls = okArtist ? 'win' : (okAlbum ? 'part' : 'fail'), ic = okArtist ? '✓' : (okAlbum ? '≈' : '✗');
    const sub = okArtist ? (cover ? (okAlbum ? 'wykonawca i album trafione' : 'wykonawca trafiony') : 'wykonawca trafiony') : (okAlbum ? 'album OK — wykonawca nie' : 'następnym razem');
    rh.className='rv-shead '+cls;
    rh.innerHTML=`<span class="ic">${ic}</span><span class="tx"><b>${okArtist?'Dobrze!':(okAlbum?'Prawie!':'Pudło')}</b><small>${escapeHtml(sub)}</small></span><span class="rv-pts">+${sc.points}</span>${streak>1?`<span class="strk">🔥 ${streak}</span>`:''}`;
  }
  document.getElementById('reveal').classList.add('show');
  if(okArtist){ confetti(); playClap(); } else playSfx(okAlbum ? 'ding' : 'buzz');
  document.getElementById('check').disabled=true;
  if(!cover) document.getElementById('replay').disabled=false;   // składanka: można posłuchać jeszcze raz
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
/* F8a: tryb „rok" — ocena yearScore (100 / ±1 70 / ±2 50 / dekada 20), punkty przez scoreRound({yearPts}) */
const YEAR_TIER = { exact:'Dokładnie!', off1:'±1 rok', off2:'±2 lata', decade:'Właściwa dekada', miss:'Pudło' };
function checkYear(){
  stopAudio(); setIcon('play');
  const gy=val('qf_year');
  const ys=yearScore(gy, current.year);
  const ok=ys.points>=YEAR_OK_PTS;
  total++; if(ok){score++;streak++;} else streak=0;
  const sc=scoreRound({ yearPts:ys.points, elapsedMs: qStartAt ? Date.now()-qStartAt : null, limitMs:SPEED_CAP_MS, streak });
  points+=sc.points;
  updateScore();
  if(session){ const s=matchSlot(session.match); pushResult({track:current.track, artist:current.artist, okTitle:ok, okArtist:ok, points:sc.points, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }
  document.querySelectorAll('#quizForm input, #quizForm button').forEach(x=>{ x.disabled=true; });
  const r=document.getElementById('rmeta'); r.innerHTML='';
  const tag = ys.tier==='miss' ? '' : (ys.tier==='exact' ? 'dokładnie' : YEAR_TIER[ys.tier].toLowerCase());
  r.appendChild(guessLine(ys.points>0, 'Rok', String(parseYear(current.year)||current.year), parseYear(gy)!=null?String(parseYear(gy)):'', tag, sc.parts.year));
  r.appendChild(noteLine('utwór', current.track+' — '+current.artist));
  if(current.yearNote) r.appendChild(noteLine('uwaga', current.yearNote));
  if(sc.points && (sc.speed>1 || sc.streakMult>1)) r.appendChild(noteLine('punkty', ptsBreakdown(sc)));
  const img=document.getElementById('art');
  if(img){ if(current.art){ img.src=current.art; img.style.display=''; } else img.style.display='none'; }
  const rh=document.getElementById('revealHead');
  if(rh){
    const cls = ok ? 'win' : (ys.points>0 ? 'part' : 'fail'), ic = ok ? '✓' : (ys.points>0 ? '≈' : '✗');
    const sub = ys.diff==null ? 'nie podano roku' : (ys.diff===0 ? 'rok wydania trafiony' : `różnica: ${ys.diff} ${plPick(ys.diff,'rok','lata','lat')}`);
    rh.className='rv-shead '+cls;
    rh.innerHTML=`<span class="ic">${ic}</span><span class="tx"><b>${YEAR_TIER[ys.tier]}</b><small>${escapeHtml(sub)}</small></span><span class="rv-pts">+${sc.points}</span>${streak>1?`<span class="strk">🔥 ${streak}</span>`:''}`;
  }
  document.getElementById('reveal').classList.add('show');
  if(ok){ confetti(); playClap(); } else playSfx(ys.points>0 ? 'ding' : 'buzz');
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=false;
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
document.getElementById('check').onclick=check;
document.getElementById('next').onclick=()=>{ unlockSoloAudio({ctx:session?session.hasReverse:false}); advance(); };   // F2a #9: gest → odblokuj
document.getElementById('form').addEventListener('keydown',e=>{
  // ABCD: klawisze A–D zaznaczają opcję (wygodne na desktopie)
  if((mode==='quiz' || qMode()==='abcd') && current && current.mc && /^[a-dA-D]$/.test(e.key)){
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
  if(sc.mult!==1) parts.push('etap ×'+String(sc.mult).replace('.',','));   // F8a: intro; EKSP.: okładka / „dłużej"
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
