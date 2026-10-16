/* app/solo.js — tryb SOLO: tuner kategorii, picker „ułóż mecz", losowanie rund (iTunes/lektor/quiz),
 * mecz solo (rundy × kategorie × pytania), sprawdzanie odpowiedzi. Self-wiring przy imporcie
 * (jak app/mp.js): wiąże DOM i wstrzykuje stan do app/audio.js przez initAudio. Zero zależności od app.js. */
import { escapeHtml } from '../core/util.js';
import { norm, textMatch, artistMatch, evaluateGuess, evaluateQuiz, quizKey, quizPartialFrac, quizListen, scoreRound, SPEED_CAP_MS, yearScore, parseYear, introMult, YEAR_MIN, YEAR_MAX, YEAR_OK_PTS, scoreLegend, revsnipMult, coverMult, tempoMult } from '../core/scoring.js';
import { introStageSecs, introNextStage, revsnipStageSecs, revsnipNextStage, coverNextStage, coverStageBlocks, isTempoMode, tempoRate, tempoNextStage } from '../core/timing.js';
import { pickTimelineTrack, gapOk, correctGaps, insertCard, gapLabel, cardsWord, timelineSummary } from '../core/timeline.js';   // EKSPERYMENT: oś czasu
import { vinylPrepare, vinylRate, vinylReveal } from './vinyl.js';   // płyta winylowa = kontrolka odtwarzania (wszystkie tryby z dźwiękiem)
import { buildTrackMC, yearReliable, parseRange, displayTitle, INSTRUMENT_EMOJI } from '../core/trackSelect.js';
import { QPC, CPR, ALL_MODES, MODE_LABEL, MODE_SHORT, matchSlot, matchAdvance, matchProgress, matchQLabel, matchTotal, DEFAULT_QUESTIONS, QUICK_QUESTIONS } from '../core/match.js';
import { dailySeed, dailyPlan, dailyPool, dailyQuestionRnd, dailyRecord, dailyShareText, matchShareText, resultGrid, DAILY_QUESTIONS } from '../core/daily.js';
import { dailyInfo, saveDailyRecord, shareText, shareUrl } from './daily.js';
import { buildSoloRecord } from '../core/matchRecord.js';
import { plPick, quickPool, restorePick } from '../core/picker.js';
import { settingsSummary, SHELF_PRESET_KEY } from '../core/matchSetup.js';
import { createMatchSetup, renderPreserving } from './matchSetup.js';   // wspólny komponent „Nowy mecz" (solo + host MP)
import { resolveTrack, resolveDistractors, resolveMedley, resolveCover, resolveInstrumental } from '../adapters-web/itunesRepository.js';
import { coverShow, coverStage, coverStop, coverHide } from './cover.js';   // EKSPERYMENT: tryb „okładka"
import { recordMatch, ensureSession } from '../adapters-web/cf.js';
import { setIcon, setRing, setState, setLive, flash, animIn, confetti, val, resetForm, hideReveal, showLyric, hideLyric, lsGet, lsSet, promptBodyHTML } from './dom.js';
import { listenStart, listenHTML, unlockListen } from './listen.js';   // Łamigłówki: „▶ posłuchaj" w odsłonie
import { tasteHeartHTML, tasteStore, onTaste } from './taste.js';   // „Twój gust": ❤️ „na półkę" w odsłonie + gotowiec „Z mojej półki"
import { shelfCategory, shelfSongs, SHELF_PLAY_MIN, SHELF_QUESTIONS } from '../core/tasteCompare.js';   // etap 3: „Zagraj z półki" (+ gotowiec „Z mojej półki")
import { showScreen, knownHandle } from './social.js';   // F6a: „Graj teraz" / „Kontynuuj mecz" z menu
import { lektorPlay } from './lektor.js';
import { catLektorLang } from '../core/lektorVoice.js';
import { playClap, playSfx } from './sfx.js';
import { initCatEditor, openEditor } from './catEditor.js';
import { unlockCtx } from './audioCtx.js';
import { startAudio, stopAudio, toggleAudio, replay, initAudio, unlockSoloAudio, loadMedley, tempoPosition } from './audio.js';
import { mpMe } from './mp.js';   // tożsamość gracza (displayName w rekordzie solo)
import { ERA_KEYS,
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
/* pula meczu (multi-select) — Sety mutowane W MIEJSCU (komponent app/matchSetup.js trzyma referencje) */
const soloPick = { cats:new Set(), modes:new Set(['music']), questions:DEFAULT_QUESTIONS, preset:null };   // F6a: długość w pytaniach
const soloCats = soloPick.cats, soloModes = soloPick.modes;
/* #3: tryb trenera (solo quiz) — stan przełącznika (w „Ustawieniach meczu"); statystyki niżej */
const QUIZ_STATS_KEY='stacjaQuizStats', QUIZ_REPEAT_KEY='stacjaQuizRepeat';
let quizRepeat = (()=>{ try{ return localStorage.getItem(QUIZ_REPEAT_KEY)==='1'; }catch(_e){ return false; } })();
let mode = 'music';         // bieżący tryb pytania (ustawiany ze slotu meczu)

/* ============ lektor: synteza mowy (Piper / Web Speech) → app/lektor.js ============ */

/* ============ „Nowy mecz" — wspólny komponent ekranu ustawiania meczu (app/matchSetup.js) ============
 * Solo dostarcza: tryby (wszystkie), trenera w „Ustawieniach meczu", narzędzia zakładki „Twoje"
 * (+ nowa / + ze Spotify / edytor — STATYCZNY DOM przenoszony do slotu po każdym renderze, żeby nie gubić
 * powiązań catEditor.js i wpisanego linku), edycję/usuwanie własnych kategorii i start meczu. */
const pickRoot = document.getElementById('msSolo');
const twojeTools = document.getElementById('soloTwojeTools');
const twojeHold = document.getElementById('soloTwojeHold');
const soloSetup = createMatchSetup({
  ctx:'solo', pick:soloPick,
  ids:{ start:'matchStart', dice:'matchRandom', info:'matchInfo' },
  available:()=>ALL_MODES,
  render:renderPicker,
  onChange:()=>{},
  onStart:startMatch,
  onDice:randomPick,
  settingsSummary:()=>settingsSummary({ ctx:'solo', questions:soloPick.questions, trener:quizRepeat }),
  settingsHTML:()=>`<button type="button" class="ms-switch${quizRepeat?' on':''}" id="quizRepeat" data-ms-act="trener" aria-pressed="${quizRepeat}">
      <span class="ms-switch-tx"><b>Trener</b><small>częściej pytania, które oblałeś (wiedza)</small></span><span class="ms-switch-st">${quizRepeat?'WŁ.':'WYŁ.'}</span></button>`,
  ownActions:true,
  onEdit:(k)=>{ openEditor(k); },
  onRemove:(k)=>plRemove(k),
  onAct:(act)=>{ if(act==='trener'){ quizRepeat=!quizRepeat; try{ localStorage.setItem(QUIZ_REPEAT_KEY, quizRepeat?'1':'0'); }catch(_e){} renderPicker(); } },
  presetEnv:()=>({ shelf:shelfCount }),
});
/* „Twój gust": gotowiec „Z mojej półki" (core/matchSetup PRESETS) — kategoria TYMCZASOWA SHELF_PRESET_KEY z ❤️/👍 własnej
 * półki (ta sama co „Zagraj z półki": core/tasteCompare.shelfCategory), tylko w ALL_CATS (bez ALL_KEYS → poza losowaniem,
 * zakładkami i wyszukiwarką). Odświeżana przed każdym renderem pickera; < SHELF_PLAY_MIN utworów → usunięta (gotowiec
 * nieaktywny z podpowiedzią). W trakcie meczu z półki nie podmieniamy/nie kasujemy kategorii (slot czyta ALL_CATS). */
let shelfCount=0;
function syncShelfCat(){
  let songs=[]; try{ songs=shelfSongs(tasteStore()); }catch(_e){ songs=[]; }
  shelfCount=songs.length;
  const inUse=!!(session && (session.cats||[]).includes(SHELF_PRESET_KEY));
  if(inUse && ALL_CATS[SHELF_PRESET_KEY]) return;
  if(songs.length>=SHELF_PLAY_MIN) ALL_CATS[SHELF_PRESET_KEY]=shelfCategory(knownHandle()||'', songs, { label:'Moja półka' });
  else { delete ALL_CATS[SHELF_PRESET_KEY]; soloCats.delete(SHELF_PRESET_KEY); }
}
function renderPicker(){
  if(!pickRoot) return;
  syncShelfCat();
  if(twojeTools && twojeHold && twojeTools.parentNode!==twojeHold) twojeHold.appendChild(twojeTools);   // nie niszcz statycznych narzędzi
  renderPreserving(pickRoot, soloSetup.html());
  const slot=pickRoot.querySelector('[data-ms-slot="twoje"]'); if(slot && twojeTools) slot.appendChild(twojeTools);
}
soloSetup.bind(pickRoot);
// F2a #8: kategorie quizu dociągnięte w tle przez quiz-loader.js (wolna sieć) → dopnij do pickera
window.addEventListener('stacja:quiz', ()=>{
  const added=addLateQuizCats();
  // F6a: zapamiętana pula z kategoriami quizu, które doszły dopiero teraz → dołącz je do wyboru
  const late=pendingCats.filter(k=>ALL_CATS[k]);
  if(late.length){ late.forEach(k=>soloCats.add(k)); pendingCats=pendingCats.filter(k=>!ALL_CATS[k]); }
  if(!added.length && !late.length) return;
  renderPicker();
});

if(!CATS_OK){ setTimeout(()=>flash('Nie udało się wczytać kategorii. Sprawdź internet i odśwież stronę.'),0); }

/* ===== playlisty ze Spotify / własne kategorie (localStorage) ===== */
// plLoad/plSave/plMerge/plFetch (dane playlist) → app/catalog.js; karty „Twoje" renderuje komponent
function plRemove(k){
  const pls=plLoad(); delete pls[k]; plSave(pls);
  delete ALL_CATS[k]; const i=ALL_KEYS.indexOf(k); if(i>=0) ALL_KEYS.splice(i,1);
  soloCats.delete(k);   // 5.10: usuń też z puli meczu (inaczej martwy klucz w picker/buildMatch)
  if(selectedEra===k){ selectedEra=null; document.getElementById('dialNote').textContent='wybierz kategorię'; }
  renderPicker();
}
document.getElementById('plImport').onclick=()=>{ const p=document.getElementById('plPanel'); p.classList.toggle('show'); document.getElementById('plImport').setAttribute('aria-expanded', p.classList.contains('show')); };
document.getElementById('plGo').onclick=plImport;
document.getElementById('plUrl').addEventListener('keydown',e=>{ if(e.key==='Enter') plImport(); });
async function plImport(){
  const url=document.getElementById('plUrl').value.trim();
  const st=document.getElementById('plStatus');
  if(!url){ st.className='pl-status err'; st.textContent='Wklej link do playlisty Spotify.'; return; }
  st.className='pl-status'; st.textContent='importuję…';
  try{
    const res=await plFetch(url);
    soloSetup.setPick({ cats:[...soloCats, res.key] });
    st.className='pl-status ok'; st.textContent='✓ '+res.name+' — '+res.count+' utw. Dodana do puli.';
    document.getElementById('plUrl').value='';
  }catch(e){ st.className='pl-status err'; st.textContent='Nie udało się: '+(e.message||e); }
}
plMerge();
// edytor własnych kategorii (B-MVP): po zapisie odśwież karty i dorzuć nową do puli meczu
initCatEditor({ onSaved:(key)=>{ soloSetup.setPick({ cats:[...soloCats, key] }); } });

/* ====== wybór puli kategorii/trybów do meczu: stan w soloPick (Sety mutowane w miejscu) ====== */
function randomPick(){ const {cats,modes}=randomPools(); soloSetup.setPick({ cats, modes }); }
function updateMatchInfo(){ renderPicker(); }

/* ===== F6a (R-F1): picker pamięta ostatnią pulę (kategorie/tryby/długość + gotowiec) — zamiast pustej =====
 * Pierwsze uruchomienie (brak zapisu) → pula „hitów" (quickPool). Kategorie, których jeszcze nie ma
 * (quiz dociągany w tle), czekają w pendingCats i dołączają przy zdarzeniu stacja:quiz. */
const PICK_KEY='stacjaSoloPick';
let pendingCats=[];
function saveSoloPick(){
  lsSet(PICK_KEY, JSON.stringify({ cats:[...soloCats], modes:[...soloModes].filter(m=>m!=='quiz'), questions:soloPick.questions, preset:soloPick.preset||null }));
}
// ocena zmieniona (odsłona / ekran „Twój gust") → odśwież gotowiec „Z mojej półki" (picker poza meczem)
onTaste(()=>{ if(!document.body.classList.contains('playing')) renderPicker(); });
(function restoreSoloPick(){
  syncShelfCat();   // „Z mojej półki" w ALL_CATS PRZED odtworzeniem zapamiętanej puli
  let saved=null; try{ saved=JSON.parse(lsGet(PICK_KEY,'null')); }catch(_e){ saved=null; }
  if(saved && typeof saved==='object'){
    const r=restorePick(saved, ALL_CATS, ALL_MODES);
    pendingCats=(Array.isArray(saved.cats)?saved.cats:[]).filter(k=>typeof k==='string' && !ALL_CATS[k]).slice(0,60);
    soloSetup.setPick({ cats:r.cats.length?r.cats:null, modes:r.modes.length?r.modes:null, questions:r.questions||null,
      preset:typeof saved.preset==='string'?saved.preset:null });
  } else {
    soloSetup.setPick({ cats:quickPool(ALL_CATS, undefined, ERA_KEYS) });
  }
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
  vinylPrepare(1);   // płyta: naklejka „?" (bez okładki poprzedniej odsłony), 1.0×
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
  // EKSPERYMENT „fortepian"/„gitara": oryginał + jego cover instrumentalny; brak coveru (np. same polskie utwory) → zwykła „muzyka"
  let t=null;
  if(mode==='piano' || mode==='guitar'){
    setState(mode==='guitar' ? 'szukam coveru gitarowego…' : 'szukam coveru fortepianowego…');
    let p=null; try{ p=await resolveInstrumental({instrument:mode, cat, seen:seenTracks, recent:recentArtists, cfg:window.STACJA_CONFIG, rnd}); }catch(_e){ p=null; }
    if(gen!==soloGen) return;
    if(p && (!p.error || p.reason==='offline')) t=p;   // offline → od razu komunikat (bez drugiej kaskady)
  }
  // EKSPERYMENT „oś czasu": utwór z WIARYGODNYM rokiem (kilka prób, bez 3. tego samego roku z rzędu); pierwsze pytanie
  // meczu najpierw kładzie kartę-kotwicę. Brak wiarygodnego roku → pytanie jak zwykła „muzyka" (cur.fallback).
  let tlPick=null;
  if(!t && mode==='timeline' && session && session.timeline){
    tlPick=await resolveTimeline(cat, rnd, gen);
    if(gen!==soloGen || tlPick.aborted) return;
    t = tlPick.track || { error:true, reason: tlPick.reason==='offline' ? 'offline' : 'empty' };
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
    setIcon('error');   // płyta: stan błędu (stuknięcie = ponów)
    return;
  }
  const cur={...t, era:eraKey, lyric:''};
  // F8a: przygotowanie pytania wg trybu (intro: etap 0; rok: wiarygodność; ABCD: kafle z dystraktorów).
  // Brak roku / za mało dystraktorów → pytanie jak zwykła „muzyka" (cur.fallback).
  if(mode==='intro') cur.introStage=0;
  if(mode==='revsnip') cur.revStage=0;                       // EKSPERYMENT: okno 3 s (koniec okna losowany po dekodowaniu)
  if(mode==='medley' || mode==='cover') cur.fallback=true;   // EKSPERYMENT: nie znaleziono wykonawcy/albumu → muzyka
  if((mode==='piano' || mode==='guitar') && !t.coverArtist) cur.fallback=true;    // EKSPERYMENT: brak coveru instrumentalnego → muzyka
  if(mode==='timeline'){ if(tlPick && tlPick.card && !tlPick.noAnchor) cur.tlCard=tlPick.card; else cur.fallback=true; }   // EKSPERYMENT
  if(isTempoMode(mode)){ cur.tempoStage=0; cur.tempoPos=0; vinylRate(tempoRate(mode, 0)); }   // EKSPERYMENT: płyta „?" w tempie etapu 0
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
/* EKSPERYMENT „oś czasu": kotwica (pierwsze pytanie meczu) + utwór pytania — core/timeline.pickTimelineTrack */
async function resolveTimeline(cat, rnd, gen){
  const tl=session.timeline;
  const resolve=()=>resolveTrack({cat, seen:seenTracks, recent:recentArtists, cfg:window.STACJA_CONFIG, rnd});
  const alive=()=>gen===soloGen;
  if(!tl.cards.length){
    setState('kładę kartę startową…');
    const a=await pickTimelineTrack({ resolve, cat, recentYears:tl.years, alive });
    if(a.aborted) return a;
    if(!a.card) return { ...a, noAnchor:true };   // brak kotwicy (sieć / brak roku) → to pytanie jak „muzyka" albo błąd
    tl.cards=[{ ...a.card, anchor:true }]; tl.years.push(a.card.year); tl.last=0;
    setState('strojenie…');
  }
  return pickTimelineTrack({ resolve, cat, recentYears:tl.years, alive });
}
/* EKSPERYMENT: start pytania „tylko wykonawca" (składanka / okładka) po rozwiązaniu r (core/trackSelect.resolveMedley/Cover).
 * Składanka: wszystkie zajawki pobierane i dekodowane PRZED startem (pasek „ładuję składankę k/n"). */
async function startArtistQuestion(r, eraKey, gen){
  let cur;
  if(mode==='medley'){
    const clips=r.clips.map(c=>({ ...c }));
    cur={ track:clips.map(c=>displayTitle(c.track)).join(' · '), artist:r.artist, artistAlt:r.artistAlt, clips, year:'', album:'',
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
  else if(qm==='slowmo'){ nx=current ? tempoNextStage('slowmo', current.tempoStage||0) : null;   // EKSPERYMENT: 0.6× → 0.75×
    label = nx!=null ? 'szybciej ('+fmtRate(tempoRate('slowmo', nx))+')' : 'tempo '+fmtRate(tempoRate('slowmo', current ? current.tempoStage||0 : 0))+' ✓'; }
  else { nx = current && mode==='intro' ? introNextStage(current.introStage) : null; label = nx!=null ? '+ więcej ('+introStageSecs(nx)+' s)' : '+ więcej'; }
  b.disabled = !(live && nx!=null && (qm==='intro' || qm==='revsnip' || qm==='cover' || qm==='slowmo'));
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
  if(qm==='slowmo'){    // EKSPERYMENT: „szybciej" 0.6× → 0.75× (mniejszy mnożnik) — gra dalej od tego samego miejsca
    const nx=tempoNextStage('slowmo', current.tempoStage||0); if(nx==null) return;
    unlockSoloAudio({ctx:true});   // gest → AudioContext (iOS)
    current.tempoPos=tempoPosition(); current.tempoStage=nx; syncIntroBtn();
    vinylRate(tempoRate('slowmo', nx)); startAudio(); return;
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
/* odsłona: naklejka płyty → okładka albumu, ikona ▶ = ORYGINAŁ (od tyłu / fragment / od tyłu krótko / fortepian / gitara
 * grają po odsłonie oryginalną zajawkę — app/audio.startAudio, cur.origReveal). Tempo ma własną ścieżkę (oryginał 1.0× od razu),
 * quiz/okładka/lektor bez płyty z okładką. */
const ORIG_REVEAL_MODES=['reverse','revsnip','snippet','piano','guitar'];
function revealVinyl(){
  const qm=qMode();
  if(!current || mode==='quiz' || mode==='lektor' || qm==='cover' || isTempoMode(qm)) return;
  vinylReveal(current.art, 1);
  if(ORIG_REVEAL_MODES.includes(qm)) current.origReveal=true;
}
const fmtRate = r => String(r).replace('.', ',')+'×';
// płyta winylowa = play/pauza we wszystkich trybach z dźwiękiem (tap / Enter / spacja)
(function wireVinyl(){
  const v=document.getElementById('vinyl'); if(!v) return;
  v.onclick=()=>toggleAudio();
  v.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); toggleAudio(); } });
})();

/* ============ audio (solo) → app/audio.js + app/audioCtx.js ============ */
// stan gry (current/mode) i wznowienie rundy wstrzykiwane; uchwyty odtwarzacza żyją w module
// EKSPERYMENT: tryb AUDIO = tryb efektywny (składanka/okładka bez wyniku grają jak „muzyka")
initAudio({ current: ()=>current, mode: ()=>qMode(), newRound, gen: ()=>soloGen, busy: ()=>busy });
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
  document.body.classList.toggle('tempo-mode', isTempoMode(qm));      // EKSPERYMENT: płyta winylowa zamiast gałki
  document.body.classList.toggle('slowmo-mode', qm==='slowmo');       // „szybciej"
  document.body.classList.toggle('timeline-mode', qm==='timeline');   // oś czasu
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
  vinylPrepare(1);   // lektor: płyta jako play/pauza czytania
  seenTracks.add(norm(s.title));
  busy=false; qStartAt=Date.now();
  document.getElementById('check').disabled=false;
  document.getElementById('replay').disabled=false;
  document.getElementById('skip').disabled=false;
  setLive(true);
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
  current={prompt:sq.prompt, slots:sq.slots, answers:sq.answers, pool:sq.pool, fun:sq.fun||'', era:eraKey, track:sq.prompt, artist:'', year:'', album:'', preview:'', art:'', lyric:'', mc, statKey:quizStatKey(eraKey,q),
    partial:sq.partial===true, display:sq.display==='rebus'?'rebus':'', listen:quizListen(sq)};   // Łamigłówki: częściowe pkt / duży rebus / „▶ posłuchaj"
  busy=false; qStartAt=Date.now();
  renderSoloForm();
  showPrompt(mc?mc.question:q.prompt, current.display);
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
  const isTl = qm==='timeline' && !!(current && current.tlCard && session && session.timeline);   // EKSPERYMENT: oś czasu
  form.classList.toggle('quiz', isQuiz || isMC || isYear || isArtist || isTl);
  syncModeClasses();   // quiz-mode: ukryj gałkę/audio w decku; lektor-mode: pokaż „lepszy głos"
  syncLegend();        // F8b: stopka-legenda punktacji wg trybu bieżącego pytania
  const qf=document.getElementById('quizForm'); if(!qf) return;
  if(isYear){ renderYearForm(qf); return; }
  if(isTl){ renderTimelineForm(qf); return; }
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
function showPrompt(text, style){ const b=document.getElementById('lyricBox'); if(!b) return;
  b.innerHTML='<span class="lyric-cap">pytanie</span>'+promptBodyHTML(text, style); b.classList.add('quiz'); b.classList.toggle('rebus', style==='rebus'); b.hidden=false; }
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
document.getElementById('sumAgain').onclick=()=>{ hideSummary(); document.body.classList.remove('playing','match-over','daily'); soloHead('Nowy mecz'); renderPicker(); };

function startMatch(){
  if(!soloSetup.summary().ok){ updateMatchInfo(); return; }
  if(startSoloMatch([...soloCats],[...soloModes],soloPick.questions)) saveSoloPick();   // F6a: zapamiętaj pulę (+ gotowiec)
}
// F6a: wspólny start meczu solo — picker, „Graj teraz" (R-F1) i „Zagraj offline" (R-F10). true = wystartował.
// F8b: `opts.plan` — gotowy plan (Stacja dnia: core/daily.dailyPlan, qpc 1), `opts.daily` — {key, n, trackSeed}
function startSoloMatch(cats, modes, questions, opts={}){
  const r=opts.plan || buildMatch(cats, modes, {questions});
  if(r.error){ soloSetup.flashError(r.error); return false; }
  if(session || busy) abandonRound();   // poprzedni mecz / losowanie w locie → porzuć (busy zwolnione, async unieważniony)
  hideOfflineOffer();
  const hasReverse=r.slots.some(x=>['reverse','revsnip','medley','slowmo','fastmo'].includes(x.mode));   // AudioContext (WebAudio): od tyłu, EKSP.: od tyłu krótko, składanka, tempo
  const match={slots:r.slots, rounds:r.rounds, si:0, qi:0};
  if(r.qpc) match.qpc=r.qpc;
  session={match, results:[], hasReverse, cats:[...cats], modes:[...modes], questions:r.questions, daily:opts.daily||null};
  if(r.slots.some(x=>x.mode==='timeline')) session.timeline={ cards:[], years:[], last:null };   // EKSPERYMENT: oś czasu meczu
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
/* „Twój gust" (etap 3): „Zagraj z półki" — mecz solo (10 pytań, tryb muzyka) z puli songs[] półki (moja / znajomego).
 * Kategoria TYMCZASOWA: tylko w ALL_CATS (catLabel/rozwiązanie utworu), bez ALL_KEYS/pickera/localStorage — nie zapisuje się na stałe. */
export const SHELF_CAT_KEY = 'polka-tmp';
export function startShelfMatch(name, songs, { label='' }={}){
  const list=Array.isArray(songs) ? songs.filter(s=>s && s.title && s.artist) : [];
  if(list.length<SHELF_PLAY_MIN) return false;
  ALL_CATS[SHELF_CAT_KEY]=shelfCategory(name, list, { label });
  unlockCtx();
  showScreen('solo');
  return startSoloMatch([SHELF_CAT_KEY], ['music'], SHELF_QUESTIONS);
}
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
      else renderPicker();   // „Z mojej półki": oceny mogły się zmienić (ekran gustu / odsłona)
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
  document.body.classList.remove('playing','quiz-mode','lektor-mode','intro-mode','revsnip-mode','cover-mode','tempo-mode','slowmo-mode','timeline-mode','match-over','daily');
  hideSummary(); stopAudio(); setIcon('play'); hideOfflineOffer();
  soloHead('Nowy mecz');   // 5.7: powrót do tytułu pickera
  renderPicker();          // „Z mojej półki": ❤️ z odsłon meczu → odśwież gotowiec
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
  document.body.classList.remove('quiz-mode','lektor-mode','intro-mode','revsnip-mode','cover-mode','tempo-mode','slowmo-mode','timeline-mode'); document.body.classList.add('match-over'); coverHide();
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
        '<span class="song"><b>'+escapeHtml(r.mode==='quiz' ? r.track : displayTitle(r.track))+'</b> <span>· '+escapeHtml(r.artist)+'</span></span>'+
        '<span class="n" style="opacity:.7;font-size:var(--fs-xs);text-transform:uppercase">'+escapeHtml(MODE_SHORT[r.mode]||'')+(r.points?' · +'+r.points:'')+'</span>';
      list.appendChild(d);
    });
  });
  // EKSPERYMENT: zbudowana oś czasu (wynik trybu = liczba kart na osi + punkty)
  if(session.timeline && session.timeline.cards.length){
    const tc=session.timeline.cards;
    const box=document.createElement('div'); box.className='sum-tl';
    box.innerHTML=`<div class="band-label">🕰 Twoja oś czasu — ${escapeHtml(timelineSummary(tc))}</div>`+tc.map(c=>tlCardHTML(c)).join('');
    list.prepend(box);
    document.getElementById('sumSub').textContent+=` · oś czasu: ${tc.length} ${cardsWord(tc.length)}`;
  }
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
  document.body.classList.remove('quiz-mode','lektor-mode','intro-mode','revsnip-mode','cover-mode','tempo-mode','slowmo-mode','timeline-mode'); coverHide();
  document.body.classList.add('playing','match-over','daily');
  document.getElementById('sumBig').textContent=rec.hits+' / '+rec.total;
  const sp=document.getElementById('sumPts'); if(sp) sp.textContent=(rec.points||0)+' pkt';
  document.getElementById('sumSub').textContent=`Stacja dnia #${info.n} · `+(rec.done?'zagrane dziś':`przerwana (${rec.played} z ${rec.total})`)+
    (info.streak?` · 🔥 seria ${info.streak} ${plPick(info.streak,'dzień','dni','dni')}`:'')+' · kolejna jutro';
  setShare(dailyShareText({ n:info.n, hits:rec.hits, total:rec.total, streak:info.streak, grid:rec.grid, url:shareUrl() }), rec.grid, 'Udostępnij');
  const list=document.getElementById('sumList'); list.innerHTML='';
  (rec.results||[]).forEach(r=>{
    const d=document.createElement('div'); d.className='sum-row';
    d.innerHTML='<span class="badge">'+escapeHtml(r.c||'')+'</span><span class="song"><b>'+escapeHtml(displayTitle(r.track))+'</b> <span>· '+escapeHtml(r.artist)+'</span></span>'+
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

/* ============ F8b: legenda punktacji wg trybu bieżącego pytania ============
 * Poprawki po testach: zamiast stałego podpisu w stopce — przycisk „ℹ️ jak liczymy punkty" pod wynikiem/serią
 * otwiera dymek z legendą BIEŻĄCEGO trybu (core/scoring.scoreLegend). Zamyka: ✕, Esc (fokus wraca na przycisk), klik poza. */
function syncLegend(){
  const el=document.getElementById('footLegend'); if(!el) return;
  const qm = session || current ? qMode() : 'music';
  el.textContent=scoreLegend(qm);
  const m=document.getElementById('legendMode'); if(m) m.textContent=MODE_LABEL[qm] || '';
}
function legendOpen(on){
  const pop=document.getElementById('legendPop'), btn=document.getElementById('legendBtn'); if(!pop || !btn) return;
  if(on) syncLegend();
  pop.hidden=!on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
}
(function wireLegend(){
  const pop=document.getElementById('legendPop'), btn=document.getElementById('legendBtn'), x=document.getElementById('legendClose');
  if(!pop || !btn) return;
  btn.onclick=()=>legendOpen(pop.hidden);
  if(x) x.onclick=()=>{ legendOpen(false); btn.focus({preventScroll:true}); };
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !pop.hidden){ legendOpen(false); btn.focus({preventScroll:true}); } });
  document.addEventListener('click', e=>{ if(!pop.hidden && e.target && !(e.target.closest && e.target.closest('#legend'))) legendOpen(false); });
})();

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
  if(qm==='timeline' && current.tlCard && session && session.timeline){ return checkTimeline(); }   // EKSPERYMENT: oś czasu
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
  // EKSPERYMENT: zwolnione / przyspieszone obroty — mnożnik etapu tempa (0.6× ×1.5 → 0.75× ×1.0; 1.5× ×1.2), szybkość/seria jak w muzyce
  const tStage = isTempoMode(qm) ? (current.tempoStage||0) : null;
  const sc=scoreRound({ okTitle, okArtist, okYear, okAlbum, roundOk, elapsedMs: intro ? null : (qStartAt ? Date.now()-qStartAt : null), limitMs:SPEED_CAP_MS, streak,
    mult: intro ? introMult(iStage) : (rStage!=null ? revsnipMult(rStage) : (tStage!=null ? tempoMult(qm, tStage) : 1)) });
  points+=sc.points;
  if(mode==='intro') current.introFull=true;   // F8a: po ocenie ↻ od nowa gra całą zajawkę (dosłuchanie)
  updateScore();
  if(session){ const s=matchSlot(session.match); pushResult({track:current.track, artist:current.artist, okTitle, okArtist, points:sc.points, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }

  // F6a (R-U2): odsłona edukacyjna — „Ty: …" przy polu + tag, DLACZEGO zaliczone (literówka / człon duetu / rok ±2)
  const r=document.getElementById('rmeta');
  r.innerHTML='';
  const fix=(ok, guess, actual, match)=> ok && guess && norm(guess)!==norm(actual) ? (match(guess, actual) ? 'literówka OK' : 'jeden z wykonawców OK') : '';
  r.appendChild(guessLine(okTitle,'Tytuł',displayTitle(current.track),g.title, fix(okTitle,g.title,current.track,textMatch), sc.parts.title));
  r.appendChild(guessLine(okArtist,'Wykonawca',current.artist,g.artist, fix(okArtist,g.artist,current.artist,textMatch), sc.parts.artist));
  if(current.year){
    const exact = okYear && Math.abs(+g.year - +current.year)===0;
    r.appendChild(guessLine(okYear,'Rok',String(current.year),g.year, okYear && !exact ? 'rok ±2 OK' : '', sc.parts.year));
  }
  if(current.album) r.appendChild(guessLine(okAlbum,'Album',current.album,g.album, okAlbum && norm(g.album)!==norm(current.album) ? 'literówka OK' : '', sc.parts.album));
  if(intro) r.appendChild(noteLine('intro', `${roundOk?'zgadłeś':'odpowiedź'} na etapie ${introStageSecs(iStage)} s · mnożnik ×${String(sc.mult).replace('.',',')}`));
  if((qm==='piano' || qm==='guitar') && current.coverArtist) r.appendChild(noteLine('cover', INSTRUMENT_EMOJI[qm]+' '+current.coverArtist));   // EKSPERYMENT: kto grał cover
  if(rStage!=null) r.appendChild(noteLine('od tyłu', `okno ${revsnipStageSecs(rStage)} s`+(sc.mult<1 ? ` · „dłużej" ×${String(sc.mult).replace('.',',')}` : '')));
  if(tStage!=null) r.appendChild(noteLine('tempo', `zgadywane przy ${fmtRate(tempoRate(qm, tStage))} · mnożnik ×${String(sc.mult).replace('.',',')} · teraz oryginał 1×`));
  if(sc.points && (sc.speed>1 || sc.streakMult>1 || sc.mult!==1)) r.appendChild(noteLine('punkty', ptsBreakdown(sc)));
  revealTaste(r, [current]);   // „Twój gust": ❤️ na półkę
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
  revealVinyl(); document.getElementById('reveal').classList.add('show');
  if(okTitle && okArtist){ confetti(); playClap(); }   // pełne trafienie → confetti + oklaski
  else playSfx(okTitle||okArtist ? 'ding' : 'buzz');   // F6b (U4): częściowe → „ding", pudło → „bzzt"
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=false; // można dosłuchać
  // EKSPERYMENT: odsłona trybu tempa — naklejka → okładka, płyta rozpędza się do 1.0×, gra ORYGINAŁ (gest „Sprawdź")
  if(tStage!=null){ current.tempoReveal=true; current.tempoPos=0; vinylReveal(current.art, 1); startAudio(); }   // (revealVinyl pomija tempo — tu z odtworzeniem)
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
// ocena quizu (solo): core/scoring.evaluateQuiz; trafienie = wszystkie sloty
function checkQuiz(){
  const abcd = mode!=='quiz';   // F8a: ABCD muzyki (zajawka + kafle „Tytuł — Wykonawca")
  if(abcd) stopAudio();
  else unlockListen();          // Łamigłówki: gest „Sprawdź" odblokowuje element odsłuchu (iOS) — zajawka gra po wyszukaniu
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
  const quizFrac=quizPartialFrac(current, ev);   // Łamigłówki (`partial:true`): częściowe punkty za trafione słowa
  const partHit=!roundOk && quizFrac>0;
  total++; if(roundOk){score++;streak++;} else streak=0;
  const sc=scoreRound({ quizOk:roundOk, quizFrac, elapsedMs: qStartAt ? Date.now()-qStartAt : null, limitMs:SPEED_CAP_MS, streak });   // F6a: 100 pkt + szybkość/seria
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
  // Łamigłówki: utwór-rozwiązanie — ~10 s zajawki z iTunes od razu + przycisk „▶ posłuchaj" (powtórka/stop)
  if(!abcd && current.listen && current.listen.length){
    listenStart(current.listen, { auto:true });
    r.insertAdjacentHTML('beforeend', listenHTML(current.listen));
  }
  if(abcd){ const meta=[current.album, current.year].filter(Boolean).join(' · '); if(meta) r.appendChild(noteLine('album', meta)); }
  revealTaste(r, abcd ? [current] : (current.listen||[]));   // „Twój gust": ❤️ (ABCD muzyki — utwór; Łamigłówki — utwory-rozwiązania)
  const img=document.getElementById('art');
  if(img){ if(abcd && current.art){ img.src=current.art; img.style.display=''; } else img.style.display='none'; }
  const rh=document.getElementById('revealHead');
  if(rh){ const cls=roundOk?'win':'fail'; const ic=roundOk?'✓':'✗';
    rh.className='rv-shead '+cls;
    rh.innerHTML=`<span class="ic">${ic}</span><span class="tx"><b>${roundOk?'Dobrze!':(partHit?'Częściowo':'Pudło')}</b><small>${roundOk?(mc?'dobra odpowiedź':'wszystkie pola trafione'):(partHit?`trafione ${Object.values(okBySlot).filter(Boolean).length} z ${slots.length}`:'sprawdź poprawne odpowiedzi')}</small></span><span class="rv-pts">+${sc.points}</span>${streak>1?`<span class="strk">🔥 ${streak}</span>`:''}`;
  }
  revealVinyl(); document.getElementById('reveal').classList.add('show');
  if(roundOk){ confetti(); playClap(); } else playSfx(partHit ? 'ding' : 'buzz');   // Łamigłówki: częściowe → „ding"   // F6b (U4): pudło → „bzzt"
  document.getElementById('check').disabled=true;
  if(abcd) document.getElementById('replay').disabled=false;   // można dosłuchać
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
/* ===== EKSPERYMENT: „oś czasu" (Hitster) — pionowa oś kart ze szczelinami „tu" + opcjonalne żetony tytuł/wykonawca =====
 * Logika (szczeliny, ocena, wstawianie) w core/timeline.js. Oś czytelna na 320 px: karty kompaktowe (rok duży),
 * scroll w obrębie osi (.tl-scroll) i auto-scroll do ostatnio wstawionej / odpadłej karty. */
function tlCardHTML(c, cls='', i=null){
  return `<div class="tl-card${c.anchor?' tl-anchor':''}${cls?' '+cls:''}"${i!=null?` data-i="${i}"`:''}><b class="tl-y">${c.year|0}</b>`+
    `<span class="tl-t">${escapeHtml(displayTitle(c.track))}</span><span class="tl-a">${escapeHtml(c.artist)}</span></div>`;
}
// przewiń oś (tylko kontener osi — bez skoku strony) tak, by element był na środku
function tlScrollTo(el){
  const sc=document.getElementById('tlScroll'); if(!sc || !el) return;
  try{ sc.scrollTop=Math.max(0, el.offsetTop - sc.clientHeight/2 + el.offsetHeight/2); }catch(_e){}
}
function selectGap(btn){
  if(!btn || btn.disabled) return;
  document.querySelectorAll('#quizForm .tl-gap').forEach(b=>{ const on=b===btn; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on?'true':'false'); b.textContent=on?'✓ tu':'tu'; });
}
/* res (po „Sprawdź"): {before, placeOk, gap, good, card} — trafienie: nowa karta wsuwa się na swoje miejsce;
 * pudło: wybrana szczelina na czerwono, karta (z rokiem) pokazana tam, gdzie powinna była trafić — i odpada */
function renderTimelineForm(qf, res){
  const tl=session.timeline;
  const cards = res && !res.placeOk ? res.before : tl.cards;
  const n=tl.cards.length;
  let rows='';
  for(let g=0; g<=cards.length; g++){
    if(!res) rows+=`<button type="button" class="tl-gap" data-gap="${g}" aria-pressed="false" aria-label="Wstaw tutaj — ${escapeHtml(gapLabel(cards, g))}">tu</button>`;
    else if(!res.placeOk){
      if(g===res.gap) rows+=`<button type="button" class="tl-gap no" disabled aria-label="Twój wybór — ${escapeHtml(gapLabel(cards, g))}">✗ tu</button>`;
      if(g===res.good[0]) rows+=tlCardHTML(res.card, 'tl-miss');
    }
    if(g<cards.length) rows+=tlCardHTML(cards[g], res && res.placeOk && g===tl.last ? 'tl-new' : '', g);
  }
  const hint = res ? (res.placeOk ? 'karta zostaje ✓' : 'karta odpada') : 'gdzie pasuje ten utwór?';
  const bonus = `<div class="row2 tl-bonus"><div class="field"><label for="qf_title">Tytuł <small>(+20)</small></label><input id="qf_title" autocomplete="off" autocapitalize="off" placeholder="opcjonalnie"></div>`+
    `<div class="field"><label for="qf_artist">Wykonawca <small>(+20)</small></label><input id="qf_artist" autocomplete="off" autocapitalize="off" placeholder="opcjonalnie"></div></div>`;
  const keep = res ? { t:val('qf_title'), a:val('qf_artist') } : null;
  qf.innerHTML=`<div class="tl" role="group" aria-label="Oś czasu — wybierz miejsce dla utworu"><div class="tl-cap"><span>🕰 oś czasu · ${n} ${cardsWord(n)}</span><span>${escapeHtml(hint)}</span></div>`+
    `<div class="tl-scroll" id="tlScroll">${rows}</div></div>`+bonus;
  if(keep){ const ti=document.getElementById('qf_title'), ai=document.getElementById('qf_artist');
    ti.value=keep.t; ai.value=keep.a; ti.disabled=true; ai.disabled=true; }
  qf.querySelectorAll('.tl-gap:not([disabled])').forEach(b=>{ b.onclick=()=>selectGap(b); });
  tlScrollTo(qf.querySelector('.tl-new, .tl-miss') || (tl.last!=null ? qf.querySelector(`.tl-card[data-i="${tl.last}"]`) : null));
}
// do testów (siatka jsdom): oś czasu meczu + karta bieżącego pytania
export const _timelineDebug = () => (session && session.timeline) ? { cards:session.timeline.cards.slice(), last:session.timeline.last, card:current && current.tlCard } : null;
function checkTimeline(){
  stopAudio(); setIcon('play');
  const tl=session.timeline, before=tl.cards, card=current.tlCard;
  const sel=document.querySelector('#quizForm .tl-gap.sel');
  const gap = sel ? +sel.dataset.gap : null;
  const placeOk = gap!=null && gapOk(before, gap, card.year);
  const gt=val('qf_title'), ga=val('qf_artist');
  const okTitle = !!gt && textMatch(gt, current.track);
  const okArtist = !!ga && artistMatch(ga, current.artist);
  total++; if(placeOk){score++;streak++;} else streak=0;
  const sc=scoreRound({ placeOk, okTitle, okArtist, elapsedMs: qStartAt ? Date.now()-qStartAt : null, limitMs:SPEED_CAP_MS, streak });
  points+=sc.points;
  updateScore();
  const good=correctGaps(before, card.year);
  if(placeOk){ const ins=insertCard(before, card, gap); tl.cards=ins.cards; tl.last=ins.index; }
  tl.years.push(card.year);
  if(session){ const s=matchSlot(session.match); pushResult({track:current.track, artist:current.artist, okTitle:placeOk, okArtist:placeOk, points:sc.points, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }
  renderTimelineForm(document.getElementById('quizForm'), { before, placeOk, gap, good, card });
  const r=document.getElementById('rmeta'); r.innerHTML='';
  r.appendChild(guessLine(placeOk, 'Miejsce', gapLabel(before, good[0]), gap!=null ? gapLabel(before, gap) : '', '', sc.parts.place));
  r.appendChild(noteLine('rok', String(card.year)));
  r.appendChild(guessLine(okTitle, 'Tytuł', displayTitle(current.track), gt, okTitle && norm(gt)!==norm(current.track) ? 'literówka OK' : '', sc.parts.title));
  r.appendChild(guessLine(okArtist, 'Wykonawca', current.artist, ga, '', sc.parts.artist));
  r.appendChild(noteLine('oś czasu', timelineSummary(tl.cards)));
  revealTaste(r, [current]);
  if(sc.points && (sc.speed>1 || sc.streakMult>1)) r.appendChild(noteLine('punkty', ptsBreakdown(sc)));
  const img=document.getElementById('art');
  if(img){ if(current.art){ img.src=current.art; img.style.display=''; } else img.style.display='none'; }
  const rh=document.getElementById('revealHead');
  if(rh){
    const cls = placeOk ? 'win' : ((okTitle||okArtist) ? 'part' : 'fail'), ic = placeOk ? '✓' : ((okTitle||okArtist) ? '≈' : '✗');
    const sub = placeOk ? `karta zostaje na osi (${tl.cards.length} ${cardsWord(tl.cards.length)})` : (gap==null ? `nie wybrano miejsca · rok ${card.year}` : `rok ${card.year} — karta odpada`);
    rh.className='rv-shead '+cls;
    rh.innerHTML=`<span class="ic">${ic}</span><span class="tx"><b>${placeOk?'Dobre miejsce!':'Pudło'}</b><small>${escapeHtml(sub)}</small></span><span class="rv-pts">+${sc.points}</span>${streak>1?`<span class="strk">🔥 ${streak}</span>`:''}`;
  }
  revealVinyl(); document.getElementById('reveal').classList.add('show');
  if(placeOk){ confetti(); playClap(); } else playSfx((okTitle||okArtist) ? 'ding' : 'buzz');
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=false;
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
    r.appendChild(noteLine('zagrały', played.map((c,i)=>(i+1)+'. '+displayTitle(c.track)).join(' · ')));
    revealTaste(r, played);   // „Twój gust": ❤️ per zagrany utwór składanki (okładka = album, bez utworu → bez ❤️)
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
  revealVinyl(); document.getElementById('reveal').classList.add('show');
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
  r.appendChild(noteLine('utwór', displayTitle(current.track)+' — '+current.artist));
  if(current.yearNote) r.appendChild(noteLine('uwaga', current.yearNote));
  revealTaste(r, [current]);
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
  revealVinyl(); document.getElementById('reveal').classList.add('show');
  if(ok){ confetti(); playClap(); } else playSfx(ys.points>0 ? 'ding' : 'buzz');
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=false;
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
document.getElementById('check').onclick=check;
document.getElementById('next').onclick=()=>{ unlockSoloAudio({ctx:session?session.hasReverse:false}); advance(); };   // F2a #9: gest → odblokuj
document.getElementById('form').addEventListener('keydown',e=>{
  if(e.target && e.target.closest && e.target.closest('.tl-gap')) return;   // EKSPERYMENT: Enter/spacja na „tu" = wybór szczeliny (natywny klik)
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

/* ===== #3: tryb trenera (solo quiz) — statystyki trafień + faworyzowanie oblanych (przełącznik: „Ustawienia meczu") ===== */
// F3 #6: klucz = treść BEZ opcji ABCD (quizKey) → stabilny po tasowaniu; stary klucz (pełny prompt) czytany wstecznie
function quizStatKey(cat, q){ return cat+'::'+quizKey(q); }
function quizStatOf(stats, cat, q){ return stats[quizStatKey(cat,q)] || stats[cat+'::'+norm((q&&q.prompt)||'')]; }
function loadQuizStats(){ try{ return JSON.parse(localStorage.getItem(QUIZ_STATS_KEY)||'{}'); }catch(_e){ return {}; } }
function recordQuizStat(key, ok){
  try{ const s=loadQuizStats(); const e=s[key]||{r:0,w:0}; if(ok)e.r++; else e.w++; s[key]=e;
    localStorage.setItem(QUIZ_STATS_KEY, JSON.stringify(s)); }catch(_e){}
}

// „Twój gust": ❤️ „na półkę" w odsłonie — utwory pytania (tytuł = forma wyświetlana, kategoria ze slotu meczu)
function revealTaste(r, tracks){
  const s=session && matchSlot(session.match);
  const h=tasteHeartHTML((tracks||[]).map(t=>t && ({ ...t, title:displayTitle(t.title!=null ? t.title : t.track) })), { cat:s ? s.cat : '' });
  if(h) r.insertAdjacentHTML('beforeend', h);
}
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
