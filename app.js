/* ============ czysty rdzeń (core/*) — bez DOM/Web API, dane wstrzykiwane ============ */
import { shuffle, escapeHtml } from './core/util.js';
import { norm, evaluateGuess } from './core/scoring.js';
import {
  QPC, CPR, ALL_MODES, MODE_LABEL, MODE_SHORT, MODE_SUB,
  matchSlot, matchAdvance,
  modesFor as _modesFor, catLabel as _catLabel, buildMatch as _buildMatch,
  randomPools as _randomPools, matchHeader as _matchHeader,
} from './core/match.js';
import { MP, assertMp } from './core/phases.js';
import { reduceAction, countReady, evaluateAnswer, myVote as _myVote, topProposal as _topProposal } from './core/mpReducer.js';
import { playReverse } from './adapters-web/webAudio.js';
import { resolveTrack } from './adapters-web/itunesRepository.js';

/* ============ kategorie: dane z categories.js (window.CATEGORIES) ============ */
const CATS = (window.CATEGORIES) || {decades:{},styles:{}};
const ERAS = CATS.decades || {};
const STYLES = CATS.styles || {};
const READY = CATS.playlists || {};           // gotowe playlisty (playlists.js)
const LYRICS = CATS.lyrics || {};              // przetłumaczone teksty (lyrics.js) — tryb lektor
const ERA_KEYS = Object.keys(ERAS);
const STYLE_KEYS = Object.keys(STYLES);
const READY_KEYS = Object.keys(READY);
const LYRICS_KEYS = Object.keys(LYRICS);

/* wszystkie kategorie w jednej mapie — logika rundy nie rozróżnia dekady/stylu */
const ALL_CATS = {...ERAS, ...STYLES, ...READY, ...LYRICS};
const ALL_KEYS = [...ERA_KEYS, ...STYLE_KEYS, ...READY_KEYS, ...LYRICS_KEYS];
const CATS_OK = (ERA_KEYS.length + STYLE_KEYS.length) > 0;

/* ============ model meczu (rdzeń w core/match.js) — lokalne wrappery wiążą ALL_CATS ============ */
const modesFor   = (catKey)               => _modesFor(catKey, ALL_CATS);
const catLabel   = (catKey)               => _catLabel(catKey, ALL_CATS);
const buildMatch = (catPool,modePool,r)   => _buildMatch(catPool, modePool, r, ALL_CATS);
const randomPools= ()                     => _randomPools(ALL_KEYS, ALL_CATS);
const matchHeader= (m)                    => _matchHeader(m, ALL_CATS);

/* ============ stan ============ */
let selectedEra = null;     // klucz lub 'rnd'
let current = null;         // bieżący utwór
let audio = null;
let recentArtists = [];     // ostatnio użyci, by nie powtarzać
let seenTracks = new Set(); // już zagrane tytuły
let score = 0, total = 0, streak = 0;
let busy = false;
let session = null;         // {match, results:[]} podczas meczu solo
let soloCats = new Set();    // pula kategorii (multi-select)
let soloModes = new Set(['music']); // pula trybów (multi-select)
let soloRounds = 4;         // liczba rund meczu
let mode = 'music';         // bieżący tryb pytania (ustawiany ze slotu meczu)
let plVoice = null;         // głos pl-PL do lektora

/* ============ lektor: synteza mowy ============ */
function loadVoice(){
  if(!('speechSynthesis' in window)) return;
  const vs=speechSynthesis.getVoices();
  plVoice = vs.find(v=>/pl(-|_)?/i.test(v.lang)) || vs.find(v=>/pol/i.test(v.name)) || null;
}
if('speechSynthesis' in window){ loadVoice(); speechSynthesis.onvoiceschanged=loadVoice; }

function speak(text){
  if(!('speechSynthesis' in window)){ flash('Ta przeglądarka nie ma syntezatora mowy (lektor niedostępny).'); return; }
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  if(plVoice){ u.voice=plVoice; u.lang=plVoice.lang; } else { u.lang='pl-PL'; }
  u.rate=0.96; u.pitch=0.9;
  u.onend=()=>{ setIcon('play'); setRing(1); setState('koniec · ↻ powtórz'); };
  setIcon('pause'); setRing(0); setState('lektor czyta…');
  document.getElementById('knob').classList.add('live');
  speechSynthesis.speak(u);
}
function stopSpeech(){ if('speechSynthesis' in window) speechSynthesis.cancel(); }

/* ===== Lektor: kolejność jakości — pre-gen audio > Piper (opcjonalny) > głos systemowy ===== */
let piperOn = localStorage.getItem('stacjaPiper')==='1';
const PIPER_VOICE = 'pl_PL-gosia-medium';
let piperMod=null, piperReady=false, lektorAudio=null;

function lektorStop(){ if(lektorAudio){ lektorAudio.pause(); lektorAudio=null; } stopSpeech(); }

async function piperEnsure(onPct){
  if(!piperMod) piperMod = await import('https://esm.sh/@diffusionstudio/vits-web@1.0.3');
  if(!piperReady){ await piperMod.download(PIPER_VOICE, p=>{ if(onPct&&p.total) onPct(Math.round(p.loaded/p.total*100)); }); piperReady=true; }
  return piperMod;
}

// odtwarza lektora; callback onStatus(tekst) do pokazania postępu w UI
async function lektorPlay(text, ttsUrl, onStatus){
  lektorStop();
  if(ttsUrl){ lektorAudio=new Audio(ttsUrl); lektorAudio.play().catch(()=>{}); return; }
  if(piperOn){
    try{
      onStatus && onStatus('przygotowuję głos…');
      const mod = await Promise.race([ piperEnsure(p=>onStatus&&onStatus('pobieram głos… '+p+'%')),
        new Promise((_,r)=>setTimeout(()=>r(new Error('load')),120000)) ]);
      onStatus && onStatus('lektor czyta…');
      const wav = await Promise.race([ mod.predict({text, voiceId:PIPER_VOICE}),
        new Promise((_,r)=>setTimeout(()=>r(new Error('synth')),25000)) ]);
      const url=URL.createObjectURL(wav);
      lektorAudio=new Audio(url); lektorAudio.onended=()=>URL.revokeObjectURL(url);
      await lektorAudio.play(); return;
    }catch(e){ /* fallback do głosu systemowego */ }
  }
  onStatus && onStatus('lektor czyta…');
  speak(text);
}
const piperToggleBtn=document.getElementById('piperToggle');
function piperLabel(){ piperToggleBtn.textContent='🎙 lepszy głos: '+(piperOn?'wł. (Piper)':'wył.'); piperToggleBtn.classList.toggle('on',piperOn); }
piperLabel();
piperToggleBtn.onclick=()=>{
  piperOn=!piperOn; localStorage.setItem('stacjaPiper', piperOn?'1':'0'); piperLabel();
  if(piperOn){ setState('lepszy głos wł. — pierwsze użycie pobierze ~60 MB (raz)'); piperEnsure(p=>setState('pobieram głos… '+p+'%')).then(()=>setState('lepszy głos gotowy ✓')).catch(()=>{}); }
  else setState('głos systemowy');
};

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

if(!CATS_OK){ setTimeout(()=>flash('Brak pliku categories.js obok index.html — kategorie się nie wczytały. Trzymaj oba pliki razem.'),0); }

/* ===== playlisty ze Spotify (localStorage) ===== */
const PL_PREFIX='pl:';
function plLoad(){ try{ return JSON.parse(localStorage.getItem('stacjaPlaylists')||'{}'); }catch(e){ return {}; } }
function plSave(o){ localStorage.setItem('stacjaPlaylists', JSON.stringify(o)); }
function plMerge(){ const pls=plLoad(); Object.keys(pls).forEach(k=>{ ALL_CATS[k]=pls[k]; if(!ALL_KEYS.includes(k)) ALL_KEYS.push(k); }); }
function plRenderTicks(){
  const el=document.getElementById('plTicks'); el.innerHTML='';
  const pls=plLoad(); const keys=Object.keys(pls);
  if(!keys.length){ el.innerHTML='<span style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:6px 2px">brak — kliknij „+ ze Spotify"</span>'; return; }
  keys.forEach(k=>{
    const b=document.createElement('button'); b.className='tick pl'; b.dataset.era=k;
    b.innerHTML=escapeHtml(pls[k].label)+'<small>'+pls[k].songs.length+' utw.</small><span class="rm" title="usuń">×</span>';
    b.querySelector('.rm').onclick=(e)=>{ e.stopPropagation(); plRemove(k); };
    b.onclick=()=>toggleCat(k);
    el.appendChild(b);
  });
}
function plRemove(k){
  const pls=plLoad(); delete pls[k]; plSave(pls);
  delete ALL_CATS[k]; const i=ALL_KEYS.indexOf(k); if(i>=0) ALL_KEYS.splice(i,1);
  if(selectedEra===k){ selectedEra=null; document.getElementById('dialNote').textContent='wybierz kategorię'; }
  plRenderTicks();
}
document.getElementById('plImport').onclick=()=>document.getElementById('plPanel').classList.toggle('show');
document.getElementById('plGo').onclick=plImport;
document.getElementById('plUrl').addEventListener('keydown',e=>{ if(e.key==='Enter') plImport(); });
async function plImport(){
  const url=document.getElementById('plUrl').value.trim();
  const st=document.getElementById('plStatus');
  if(!url){ st.className='pl-status err'; st.textContent='Wklej link do playlisty Spotify.'; return; }
  const cfg=window.STACJA_CONFIG||{};
  if(!cfg.supabaseUrl){ st.className='pl-status err'; st.textContent='Brak połączenia z serwerem.'; return; }
  st.className='pl-status'; st.textContent='importuję…';
  try{
    const r=await fetch(cfg.supabaseUrl+'/functions/v1/spotify?url='+encodeURIComponent(url), {headers:cfg.supabaseKey?{apikey:cfg.supabaseKey}:{}});
    const d=await r.json();
    if(!r.ok || d.error){ throw new Error(d.error||('http '+r.status)); }
    const songs=(d.tracks||[]).filter(t=>t.title&&t.artist);
    if(!songs.length){ throw new Error('Pusta lub niepubliczna playlista.'); }
    const key=PL_PREFIX+Math.random().toString(36).slice(2,8);
    const pls=plLoad(); pls[key]={label:d.name||'Playlista', songs, kind:'playlist'}; plSave(pls);
    plMerge(); plRenderTicks(); soloCats.add(key); syncCatTicks(); updateMatchInfo();
    st.className='pl-status ok'; st.textContent='✓ '+(d.name||'')+' — '+songs.length+' utw. Dodana do puli.';
    document.getElementById('plUrl').value='';
  }catch(e){ st.className='pl-status err'; st.textContent='Nie udało się: '+(e.message||e); }
}
plMerge(); plRenderTicks();
renderModeChips();
(function wireRounds(){
  const rp=document.getElementById('roundPick'); if(!rp) return;
  rp.querySelectorAll('button').forEach(btn=>{ btn.onclick=()=>{
    soloRounds=+btn.dataset.r; rp.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===btn)); updateMatchInfo();
  }; });
})();
document.getElementById('matchStart').onclick=startMatch;
document.getElementById('matchRandom').onclick=randomPick;
updateMatchInfo();

/* ====== wybór puli kategorii/trybów do meczu (multi-select) ====== */
function toggleCat(k){ if(soloCats.has(k)) soloCats.delete(k); else soloCats.add(k); syncCatTicks(); updateMatchInfo(); }
function selectAllCats(){
  if(ALL_KEYS.length && ALL_KEYS.every(k=>soloCats.has(k))) soloCats.clear();
  else ALL_KEYS.forEach(k=>soloCats.add(k));
  syncCatTicks(); updateMatchInfo();
}
function syncCatTicks(){
  document.querySelectorAll('.tick').forEach(t=>{ const k=t.dataset.era; if(k&&k!=='rnd') t.classList.toggle('on', soloCats.has(k)); });
  const rb=document.querySelector('.tick.rnd'); if(rb) rb.classList.toggle('on', ALL_KEYS.length>0 && ALL_KEYS.every(k=>soloCats.has(k)));
}
function toggleMode(m){ if(soloModes.has(m)) soloModes.delete(m); else soloModes.add(m); renderModeChips(); updateMatchInfo(); }
function randomPick(){ const {cats,modes}=randomPools(); soloCats=new Set(cats); soloModes=new Set(modes); syncCatTicks(); renderModeChips(); updateMatchInfo(); }
function renderModeChips(){
  const el=document.getElementById('modeTicks'); if(!el) return; el.innerHTML='';
  ALL_MODES.forEach(m=>{
    const b=document.createElement('button'); b.className='tick gen'+(soloModes.has(m)?' on':''); b.dataset.mode=m;
    b.innerHTML=MODE_LABEL[m]+'<small>'+MODE_SUB[m]+'</small>';
    b.onclick=()=>toggleMode(m); el.appendChild(b);
  });
}
function updateMatchInfo(){
  const el=document.getElementById('matchInfo'); if(!el) return;
  if(!soloCats.size || !soloModes.size){ el.className='match-info'; el.textContent='zaznacz kategorie i tryby'; return; }
  const r=buildMatch([...soloCats],[...soloModes],soloRounds);
  if(r.error){ el.className='match-info err'; el.textContent=r.error; return; }
  el.className='match-info';
  el.textContent=`${soloRounds} ${soloRounds===1?'runda':(soloRounds<5?'rundy':'rund')} × ${CPR} kategorie × ${QPC} pytań = ${soloRounds*CPR*QPC} pytań`;
}

/* ============ losowanie rundy (źródło utworów → TrackRepository) ============ */
async function newRound(){
  if(busy) return;
  if(!selectedEra){ flash('najpierw wybierz kategorię na skali'); return; }
  if(mode==='lektor'){ return newLektorRound(); }
  busy=true; stopAudio(); hideReveal(); hideSummary(); resetForm(); hideLyric();
  if(session) updateSessUI();
  setIcon('wait'); setState('strojenie…');
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=true;
  document.getElementById('skip').disabled=true;

  const eraKey = selectedEra==='rnd' ? ALL_KEYS[Math.floor(Math.random()*ALL_KEYS.length)] : selectedEra;
  const cat = ALL_CATS[eraKey];
  const t = await resolveTrack({cat, seen:seenTracks, recent:recentArtists, cfg:window.STACJA_CONFIG});
  busy=false;
  if(t.error){
    if(t.reason==='offline') flash('Brak połączenia z iTunes. Jeśli to podgląd — otwórz jojogurt.github.io/stacja na telefonie. Na żywo: iTunes ogranicza liczbę zapytań, odczekaj minutę i spróbuj ponownie.');
    else if(cat.songs && cat.songs.length && (!cat.artists||!cat.artists.length)) flash('Brak grających zajawek w tej playliście — wybierz inną kategorię.');
    else flash('Brak zajawek dla tej kategorii — spróbuj ponownie albo zmień kategorię.');
    return;
  }
  current={...t, era:eraKey, lyric:''};
  startAudio();
}

/* ============ audio ============ */
let revCtx=null, revSrc=null;   // tryb „od tyłu" (Web Audio) — revSrc to uchwyt z playReverse
const SNIP=2;                                   // długość fragmentu (s)
// iOS: AudioContext trzeba odblokować w geście (synchronicznie), zanim użyjemy go po await
function unlockCtx(){ try{ if(!revCtx) revCtx=new (window.AudioContext||window.webkitAudioContext)(); if(revCtx.state==='suspended') revCtx.resume(); }catch(e){} }

function armControls(){
  document.getElementById('knob').classList.add('live');
  document.getElementById('check').disabled=false;
  document.getElementById('replay').disabled=false;
  document.getElementById('skip').disabled=false;
  document.getElementById('fTitle').focus({preventScroll:true});
}

// ikona gałki STEROWANA REALNYM stanem odtwarzacza (nie optymistycznie) —
// inaczej ikona „pauza" pokazywała się mimo ciszy/buforowania (#1/#3)
function bindAudioUI(el){
  el.addEventListener('playing',()=>setIcon('pause'));
  el.addEventListener('play',   ()=>setIcon('pause'));
  el.addEventListener('pause',  ()=>{ if(!el.ended) setIcon('play'); });
  el.addEventListener('waiting',()=>setIcon('wait'));
}

// dyspozytor — wybiera sposób odtwarzania wg trybu
function startAudio(){
  if(mode==='reverse'){ return startReverse(); }
  if(mode==='snippet'){ return startSnippet(); }
  audio=new Audio(current.preview); audio.preload='auto';
  bindAudioUI(audio);
  setIcon('wait'); setState('ładowanie…');
  audio.addEventListener('timeupdate',()=>{
    const p=audio.duration?audio.currentTime/audio.duration:0;
    setRing(p);
  });
  // tekst stanu dopiero gdy dźwięk RZECZYWIŚCIE leci (#5: nie udawaj, że gra)
  audio.addEventListener('playing',()=>setState('słuchaj uważnie…'),{once:true});
  audio.addEventListener('ended',()=>{ audio=null; setIcon('play'); setRing(1); setState('koniec zajawki · ↻ od nowa'); });
  audio.play().then(()=>{ armControls(); })
    .catch(()=>{ setIcon('play'); setState('naciśnij ▶, by odtworzyć'); armControls(); });
}

// ✂️ fragment — krótkie okno z losowego miejsca zajawki
function startSnippet(){
  audio=new Audio(current.preview); audio.preload='auto';
  bindAudioUI(audio);
  setIcon('wait'); setState('ładowanie…');
  audio.addEventListener('loadedmetadata',()=>{
    const dur=audio.duration||25;
    if(current.snipStart==null) current.snipStart=Math.max(0.3, Math.random()*(Math.min(dur,28)-SNIP-1));
    audio.currentTime=current.snipStart;
    audio.play().then(()=>{ setState('słuchaj — krótki fragment!'); armControls(); }).catch(()=>{ setIcon('play'); setState('naciśnij ▶'); armControls(); });
  });
  audio.addEventListener('timeupdate',()=>{
    if(current.snipStart==null) return;
    const el=audio.currentTime-current.snipStart;
    setRing(Math.min(1, el/SNIP));
    if(el>=SNIP){ audio.pause(); setIcon('play'); setRing(1); setState('fragment '+SNIP+'s · ↻ jeszcze raz'); }
  });
}

// 🔄 od tyłu — dekoduje zajawkę i odtwarza odwróconą (Web Audio, przez AudioPort)
async function startReverse(){
  setIcon('wait'); setState('odwracam…');
  revCtx = revCtx || new (window.AudioContext||window.webkitAudioContext)();
  if(revCtx.state==='suspended'){ try{ await revCtx.resume(); }catch(e){} }
  const r=await playReverse(revCtx, current.preview, {
    cfg: window.STACJA_CONFIG,
    onProgress: f=>setRing(f),
    onEnded: ()=>{ setIcon('play'); setRing(1); setState('koniec · ↻ od nowa'); },
  });
  if(r.ok){ revSrc=r; setIcon('pause'); setState('słuchaj — od tyłu!'); armControls(); return; }
  // i proxy i dekodowanie padło → zagraj normalnie, żeby runda działała
  audio=new Audio(current.preview); bindAudioUI(audio);
  audio.play().then(()=>{ setState('„od tyłu" niedostępne tutaj — gram normalnie'); armControls(); }).catch(()=>{ setState('nie udało się odtworzyć'); armControls(); });
}

function stopAudio(){
  if(audio){audio.pause();audio=null;}
  if(revSrc){ revSrc.stop(); revSrc=null; }   // uchwyt z playReverse sam czyści timer
  lektorStop(); setRing(0); document.getElementById('knob').classList.remove('live');
}
function toggleAudio(){
  unlockCtx();
  if(!current){ newRound(); return; }
  if(mode==='lektor'){ lektorPlay(current.lyric, current.tts, setState); return; }
  if(mode==='reverse'||mode==='snippet'){ stopAudio(); startAudio(); return; }
  if(!audio){ startAudio(); return; }      // też po 'ended' (audio=null) → czysty restart
  if(audio.paused){ audio.play().catch(()=>{}); } // ikonę ustawi event play/playing
  else { audio.pause(); }
}
function replay(){ if(!current) return; if(mode==='lektor'){ lektorPlay(current.lyric, current.tts, setState); return; } stopAudio(); startAudio(); }

document.getElementById('knob').onclick=toggleAudio;
document.getElementById('replay').onclick=replay;

/* ============ przełącznik trybu muzyka/lektor ============ */
const modePick=document.getElementById('modePick');
modePick.querySelectorAll('button').forEach(btn=>{
  btn.onclick=()=>{
    unlockCtx();
    if(mode===btn.dataset.mode) return;
    mode=btn.dataset.mode;
    modePick.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b===btn));
    stopAudio(); hideReveal(); resetForm(); hideLyric(); current=null; setIcon('play');
    const hint={lektor:'lektor', reverse:'od tyłu', snippet:'fragment'}[mode];
    setState((hint?hint+' · ':'')+'naciśnij, żeby wylosować');
    document.getElementById('check').disabled=true;
    document.getElementById('replay').disabled=true;
    document.getElementById('skip').disabled=true;
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
  busy=true; stopAudio(); hideReveal(); hideSummary(); resetForm();
  if(session) updateSessUI();
  setIcon('wait'); setState('strojenie…');
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=true;
  document.getElementById('skip').disabled=true;

  let pool=lektorPool();
  if(!pool.length){ seenTracks.clear(); pool=lektorPool(); } // wyczerpane — zacznij od nowa
  if(!pool.length){
    busy=false;
    flash('Ta kategoria nie ma tekstów dla lektora. Dodaj songs[] z polem lyric w categories.js (np. „hity dziś").');
    return;
  }
  const s=pool[Math.floor(Math.random()*pool.length)];
  current={track:s.title, artist:s.artist, era:selectedEra,
    year:s.year||'', album:s.album||'', preview:'', art:'', lyric:s.lyric, tts:s.tts||''};
  seenTracks.add(norm(s.title));
  busy=false;
  document.getElementById('check').disabled=false;
  document.getElementById('replay').disabled=false;
  document.getElementById('skip').disabled=false;
  document.getElementById('knob').classList.add('live');
  showLyric(s.lyric);
  lektorPlay(s.lyric, s.tts, setState);
  document.getElementById('fTitle').focus({preventScroll:true});
}
document.getElementById('skip').onclick=()=>{
  if(session && current){ const s=matchSlot(session.match); session.results.push({track:current.track, artist:current.artist, okTitle:false, okArtist:false, skipped:true, round:s?s.round:0, mode:s?s.mode:mode}); }
  streak=0; updateScore();
  advance();
};

/* ============ MECZ solo: rundy × kategorie × pytania ============ */
document.getElementById('sessEnd').onclick=()=>{ if(session && session.results.length) finishMatch(); else endMatch(); };
document.getElementById('sumAgain').onclick=()=>{ hideSummary(); document.body.classList.remove('playing'); };

function startMatch(){
  if(!soloCats.size){ updateMatchInfo(); return; }
  if(!soloModes.size){ updateMatchInfo(); return; }
  const r=buildMatch([...soloCats],[...soloModes],soloRounds);
  if(r.error){ const el=document.getElementById('matchInfo'); el.className='match-info err'; el.textContent=r.error; return; }
  session={match:{slots:r.slots, rounds:r.rounds, si:0, qi:0}, results:[]};
  seenTracks.clear(); recentArtists=[]; score=0; total=0; streak=0; updateScore();
  hideSummary(); hideReveal(); resetForm();
  document.body.classList.add('playing');
  document.getElementById('session').classList.add('live');
  loadSlotQuestion();
}
function loadSlotQuestion(){
  const s=matchSlot(session.match); if(!s){ finishMatch(); return; }
  selectedEra=s.cat; mode=s.mode;
  document.querySelectorAll('#modePick button').forEach(b=>b.classList.toggle('on', b.dataset.mode===mode));
  updateSessUI();
  newRound();
}
function endMatch(){
  session=null;
  document.getElementById('session').classList.remove('live');
  document.body.classList.remove('playing');
  hideSummary(); stopAudio(); setIcon('play');
}
function updateSessUI(){
  if(!session) return;
  document.getElementById('sessProg').textContent=matchHeader(session.match);
  const hits=session.results.filter(r=>r.okTitle&&r.okArtist).length;
  document.getElementById('sessMini').textContent=hits+' trafionych';
}
function advance(){
  if(!session) return;
  const more=matchAdvance(session.match);
  if(!more){ finishMatch(); return; }
  loadSlotQuestion();
}
function finishMatch(){
  const res=session.results;
  const tot=session.match.slots.length*QPC;
  const hits=res.filter(r=>r.okTitle&&r.okArtist).length;
  stopAudio(); setIcon('play'); hideReveal();
  document.getElementById('sumBig').textContent=hits+' / '+tot;
  document.getElementById('sumSub').textContent='koniec meczu';
  const list=document.getElementById('sumList'); list.innerHTML='';
  const byRound={};
  res.forEach(r=>{ (byRound[r.round]=byRound[r.round]||[]).push(r); });
  Object.keys(byRound).sort((a,b)=>a-b).forEach(rd=>{
    const grp=byRound[rd], rh=grp.filter(x=>x.okTitle&&x.okArtist).length;
    const hdr=document.createElement('div'); hdr.className='band-label'; hdr.style.margin='12px 0 4px';
    hdr.textContent='Runda '+rd+' — '+rh+'/'+grp.length;
    list.appendChild(hdr);
    grp.forEach(r=>{
      const ok=r.okTitle&&r.okArtist;
      const d=document.createElement('div'); d.className='sum-row';
      const badge=r.skipped?'<span class="no">↷</span>':(ok?'<span class="ok">✓</span>':(r.okTitle||r.okArtist?'<span style="color:var(--amber)">±</span>':'<span class="no">✗</span>'));
      d.innerHTML='<span class="badge">'+badge+'</span>'+
        '<span class="song"><b>'+escapeHtml(r.track)+'</b> <span>· '+escapeHtml(r.artist)+'</span></span>'+
        '<span class="n" style="opacity:.55;font-size:11px;text-transform:uppercase">'+escapeHtml(MODE_SHORT[r.mode]||'')+'</span>';
      list.appendChild(d);
    });
  });
  session=null;
  document.getElementById('session').classList.remove('live');  // body.playing zostaje → summary widoczne
  document.getElementById('summary').classList.add('show');
  document.getElementById('summary').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function hideSummary(){ document.getElementById('summary').classList.remove('show'); }

/* ============ sprawdzanie ============ */
function check(){
  if(!current) return;
  stopAudio(); setIcon('play');
  const g={title:val('fTitle'),artist:val('fArtist'),year:val('fYear'),album:val('fAlbum')};
  const { okTitle, okArtist, okYear, okAlbum, roundOk } = evaluateGuess(g, current);
  total++; if(roundOk){score++;streak++;} else streak=0;
  updateScore();
  if(session){ const s=matchSlot(session.match); session.results.push({track:current.track, artist:current.artist, okTitle, okArtist, round:s?s.round:0, mode:s?s.mode:mode}); updateSessUI(); }

  const r=document.getElementById('rmeta');
  r.innerHTML='';
  r.appendChild(line(okTitle,'Tytuł',current.track));
  r.appendChild(line(okArtist,'Wykonawca',current.artist));
  if(current.year) r.appendChild(line(okYear,'Rok (bonus)',current.year + (g.year?'':'  —  nie zgadywano')));
  if(current.album) r.appendChild(line(okAlbum,'Album (bonus)',current.album));
  if(mode==='lektor' && current.lyric){
    const d=document.createElement('div'); d.className='rline';
    d.innerHTML='<span class="mk" style="color:var(--muted)">„</span>'+
      '<span class="v" style="font-weight:400;font-style:italic;color:var(--muted)">'+
      '<span class="k">czytany fragment</span>'+escapeHtml(current.lyric)+'</span>';
    r.appendChild(d);
  }
  const img=document.getElementById('art');
  if(current.art){img.src=current.art;img.style.display='';}else{img.style.display='none';}
  document.getElementById('reveal').classList.add('show');
  document.getElementById('check').disabled=true;
  document.getElementById('replay').disabled=false; // można dosłuchać
  document.getElementById('reveal').scrollIntoView({behavior:'smooth',block:'nearest'});
}
document.getElementById('check').onclick=check;
document.getElementById('next').onclick=advance;
document.getElementById('form').addEventListener('keydown',e=>{
  if(e.key==='Enter' && !document.getElementById('check').disabled) check();
});

function line(ok,k,v){
  const d=document.createElement('div'); d.className='rline';
  d.innerHTML=`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>
    <span class="v"><span class="k">${k}</span>${escapeHtml(v)}</span>`;
  return d;
}

/* matching (norm/lev/textMatch/deLatin) → core/scoring.js */

/* ============ pomocnicze UI ============ */
function setIcon(mode){
  const i=document.getElementById('knobIcon');
  if(mode==='pause') i.innerHTML='<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  else if(mode==='wait') i.innerHTML='<path d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="currentColor" stroke-width="2.4"/>';
  else i.innerHTML='<path d="M8 5v14l11-7z"/>';
}
function setRing(p){ document.getElementById('ring').style.background=
  `conic-gradient(var(--gold) ${Math.max(0,Math.min(1,p))*360}deg, var(--line) 0deg)`; }
function setState(t){ const e=document.getElementById('state'); e.classList.remove('err'); e.textContent=t; }
function flash(t){ const e=document.getElementById('state'); e.classList.add('err'); e.textContent=t; setIcon('play'); }
function updateScore(){ document.getElementById('sScore').textContent=score+' / '+total;
  document.getElementById('sStreak').textContent=streak; }
function val(id){ return document.getElementById(id).value.trim(); }
function resetForm(){ ['fTitle','fArtist','fYear','fAlbum'].forEach(id=>document.getElementById(id).value=''); }
function hideReveal(){ document.getElementById('reveal').classList.remove('show'); }
// #14: tekst piosenki na ekranie (tryb lektor) — czytany ORAZ widoczny
function showLyric(text){ const b=document.getElementById('lyricBox'); if(!b) return;
  b.innerHTML='<span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>'+escapeHtml(text||''); b.hidden=false; }
function hideLyric(){ const b=document.getElementById('lyricBox'); if(b){ b.hidden=true; b.innerHTML=''; } }

/* ================= MULTIPLAYER (Supabase Realtime) ================= */
let mpSb=null, mpCh=null;
let mpMe={id:Math.random().toString(36).slice(2,10), name:''};
let mpCode=null, mpHost=false;
let mpGame=null;            // stan współdzielony (host = źródło prawdy)
let mpHostCurrent=null;     // pełny utwór znany tylko hostowi
let mpHostSeen=new Set();   // antypowtórki po stronie hosta
let mpLastNonce=null;       // ostatnio odtworzony nonce
let mpLastArmNonce=null;    // ostatnio zbuforowana runda (faza gotowości)
let mpReady=new Set();      // host: id graczy, którzy zbuforowali audio
let mpArmTimer=null;        // host: bezpiecznik startu mimo braku gotowości
let mpArmAudio=null;        // lokalnie zbuforowana zajawka (do natychmiastowego startu)
let mpAudio=null;
let mpRevSrc=null;          // BufferSource trybu „od tyłu" w MP
let mpTally={};             // id -> {name, correct}  (do MVP)
let mpScribeTouched=false;
let mpAutoLocked=false;     // czy timer/host już zatwierdził rundę
let mpPlayRound=null;       // dla której rundy jest już zbudowany formularz (by nie czyścić pól)
let mpTimerInt=null;        // interwał odliczania
const $m=id=>document.getElementById(id);
const REACTIONS=['😂','🔥','🎉','🤔','😱','🍺'];
/* nazwane stałe (zamiast magic numbers rozsianych po kodzie) */
const MP_ARM_TIMEOUT_MS=7000;   // host: bezpiecznik — start mimo braku potwierdzeń gotowości
const MP_BUFFER_TIMEOUT_MS=6000;// klient: bezpiecznik — zgłoś „ready" mimo zawieszonego buforowania
const MP_SNIP_WINDOW_S=16;      // okno losowania startu fragmentu (s)
const EMOJI_TTL_MS=2400;        // jak długo leci emotka po ekranie
const SAY_TTL_MS=4400;          // jak długo wisi dymek wiadomości

function mpRandCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++)s+=c[Math.floor(Math.random()*c.length)]; return s; }
function mpErr(t){ $m('mpErr').textContent=t||''; }

function mpConnect(){
  if(mpSb) return mpSb;
  const cfg=window.STACJA_CONFIG;
  if(!cfg||!window.supabase){ return null; }
  mpSb=window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  return mpSb;
}

/* ---- wejście / wyjście z trybu ---- */
function showScreen(s){ document.body.classList.remove('menu','solo','mp'); document.body.classList.add(s); }
$m('goSolo').onclick=()=>{ showScreen('solo'); };
$m('goMp').onclick=()=>{
  stopAudio(); stopSpeech();
  showScreen('mp');
  const pre=new URLSearchParams(location.search).get('room');
  if(pre){ $m('mpCode').value=pre.toUpperCase(); }
};
$m('toMenu').onclick=()=>{
  if(document.body.classList.contains('mp')){ mpLeave(); }
  stopAudio(); stopSpeech();
  showScreen('menu');
};
$m('mpExit').onclick=()=>{ showScreen('menu'); };
$m('mpLeave').onclick=()=>{ mpLeave(); showScreen('menu'); };

async function mpLeave(){
  if(mpCh){ try{ await mpCh.unsubscribe(); }catch(e){} mpCh=null; }
  if(mpAudio){ mpAudio.pause(); mpAudio=null; } stopSpeech(); mpStopRev();
  if(mpArmAudio){ try{mpArmAudio.pause();}catch(e){} mpArmAudio=null; }
  if(mpArmTimer){ clearTimeout(mpArmTimer); mpArmTimer=null; }
  mpReady=new Set(); mpLastArmNonce=null;
  mpCode=null; mpHost=false; mpGame=null; mpHostCurrent=null; mpTally={}; mpLastNonce=null;
  $m('mpRoom').style.display='none'; $m('mpLobby').style.display='';
}

/* ---- tworzenie / dołączanie ---- */
$m('mpCreate').onclick=()=>{ const n=$m('mpName').value.trim(); if(!n){ mpErr('Podaj ksywę.'); return; } mpMe.name=n; mpEnterRoom(mpRandCode(), true); };
$m('mpJoin').onclick=()=>{
  const n=$m('mpName').value.trim(); const c=$m('mpCode').value.trim().toUpperCase();
  if(!n){ mpErr('Podaj ksywę.'); return; }
  if(c.length<4){ mpErr('Wpisz 4-znakowy kod.'); return; }
  mpMe.name=n; mpEnterRoom(c, false);
};
$m('mpCopy').onclick=()=>{
  const url=location.origin+location.pathname+'?room='+mpCode;
  navigator.clipboard?.writeText(url); $m('mpCopy').textContent='skopiowano!';
  setTimeout(()=>$m('mpCopy').textContent='kopiuj link',1500);
};

async function mpEnterRoom(code, asHost){
  mpErr('');
  const sb=mpConnect();
  if(!sb){ mpErr('Brak połączenia z serwerem (config.js / supabase-js).'); return; }
  mpCode=code; mpHost=asHost;
  $m('mpLobby').style.display='none'; $m('mpRoom').style.display='';
  $m('mpRoomCode').textContent=code;
  mpCh=sb.channel('stacja-'+code, {config:{broadcast:{self:true}, presence:{key:mpMe.id}}});
  mpCh.on('broadcast',{event:'sync'},({payload})=>{ if(!mpHost){ mpGame=payload; mpAfterSync(); } });
  mpCh.on('broadcast',{event:'act'},({payload})=>{ if(mpHost) mpHandleAct(payload); });
  mpCh.on('broadcast',{event:'react'},({payload})=>{ mpFloatEmoji(payload.emoji, payload.byName); });
  mpCh.on('broadcast',{event:'say'},({payload})=>{ mpFloatSay(payload.text, payload.byName); });
  mpCh.on('presence',{event:'sync'},()=>{ mpRenderMembers(); if(mpHost) mpBroadcast(); });
  mpCh.subscribe(async(status)=>{
    if(status==='SUBSCRIBED'){ await mpCh.track({name:mpMe.name}); mpRenderMembers(); mpRender(); }
    else if(status==='CHANNEL_ERROR'){ mpErr('Błąd kanału — spróbuj ponownie.'); }
  });
  if(!mpTimerInt) mpTimerInt=setInterval(mpTickTimer, 500);
}

function mpMembers(){
  if(!mpCh) return [];
  const st=mpCh.presenceState(); const out=[];
  Object.keys(st).forEach(k=>{ const meta=st[k][0]||{}; out.push({id:k, name:meta.name||'?'}); });
  return out;
}
function mpRenderMembers(){
  const ms=mpMembers();
  $m('mpMembers').innerHTML=ms.map(m=>{
    const host = mpGame? (m.id===mpGame.hostId) : (m.id===mpMe.id && mpHost);
    return `<span class="mp-chip${host?' host':''}${m.id===mpMe.id?' you':''}">${escapeHtml(m.name)}</span>`;
  }).join('');
}

/* ---- broadcast / sync ---- */
function mpBroadcast(){ if(mpHost&&mpCh&&mpGame){ mpCh.send({type:'broadcast',event:'sync',payload:mpGame}); } }
function mpSend(act){ if(mpCh){ act.by=mpMe.id; act.byName=mpMe.name; mpCh.send({type:'broadcast',event:'act',payload:act}); } }
function mpAfterSync(){
  // faza gotowości: zbuforuj utwór i zgłoś „ready" (raz na rundę)
  if(mpGame && mpGame.phase===MP.ARMING && mpGame.armNonce!==mpLastArmNonce){
    mpLastArmNonce=mpGame.armNonce; mpArm();
  }
  // start: zagraj lokalnie gdy zmienił się nonce (audio już zbuforowane → równy start)
  if(mpGame && mpGame.phase===MP.PLAY && mpGame.playNonce!==mpLastNonce){
    mpLastNonce=mpGame.playNonce; mpPlayLocal();
  }
  mpRender();
}
function mpSetKnob(playing){
  const i=$m('mpKnobIcon'); if(!i) return;
  i.innerHTML = playing ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
}
// faza gotowości — preload zajawki, potem zgłoś hostowi „ready" (#4)
function mpArm(){
  if(mpArmAudio){ try{mpArmAudio.pause();}catch(e){} mpArmAudio=null; }
  mpSetKnob(false);
  const armNonce=mpGame.armNonce;
  // lektor / brak zajawki — nic do buforowania, gotów od razu
  if(mpGame.mode==='lektor' || !mpGame.preview){ mpSend({type:'ready', armNonce}); return; }
  const a=new Audio(mpGame.preview); a.preload='auto'; mpArmAudio=a;
  let done=false;
  const ready=()=>{ if(done) return; done=true; mpSend({type:'ready', armNonce}); };
  a.addEventListener('canplaythrough', ready, {once:true});
  a.addEventListener('canplay',        ready, {once:true});
  a.addEventListener('error',          ready, {once:true}); // i tak zgłoś — host nie utknie
  setTimeout(ready, MP_BUFFER_TIMEOUT_MS);                  // bezpiecznik
  a.load();
}
function mpStopRev(){ if(mpRevSrc){ mpRevSrc.stop(); mpRevSrc=null; } }   // uchwyt z playReverse
function mpPlayLocal(){
  lektorStop(); mpStopRev();
  if(mpGame.mode==='lektor'){ if(mpGame.lyric) lektorPlay(mpGame.lyric, mpGame.ttsUrl, ()=>{}); return; }
  if(!mpGame.preview) return;
  if(mpGame.mode==='reverse'){ return mpPlayReverse(); }
  // music / snippet — element audio (zbuforowany z arming, gdy pasuje)
  let a=mpArmAudio;
  if(!a || a.src!==mpGame.preview){ a=new Audio(mpGame.preview); a.preload='auto'; }
  mpArmAudio=null;
  if(mpAudio && mpAudio!==a){ try{mpAudio.pause();}catch(e){} }
  mpAudio=a;
  mpAudio.addEventListener('playing',()=>mpSetKnob(true));
  mpAudio.addEventListener('pause',  ()=>mpSetKnob(false));
  mpAudio.addEventListener('ended',  ()=>mpSetKnob(false));
  if(mpGame.mode==='snippet'){
    const start=mpGame.snipStart||0.5;
    const seek=()=>{ try{ mpAudio.currentTime=start; }catch(e){} };
    if(mpAudio.readyState>=1) seek(); else mpAudio.addEventListener('loadedmetadata', seek, {once:true});
    const stop=()=>{ if(mpAudio && (mpAudio.currentTime-start)>=SNIP){ mpAudio.pause(); mpAudio.removeEventListener('timeupdate', stop); } };
    mpAudio.addEventListener('timeupdate', stop);
    mpAudio.play().catch(()=>{}); return;
  }
  try{ mpAudio.currentTime=0; }catch(e){}
  mpAudio.play().catch(()=>{});
}
// „od tyłu" w MP — każdy klient dekoduje+odwraca lokalnie (wspólny AudioPort.playReverse)
async function mpPlayReverse(){
  if(mpArmAudio){ try{mpArmAudio.pause();}catch(e){} mpArmAudio=null; }
  if(mpAudio){ try{mpAudio.pause();}catch(e){} }
  mpSetKnob(false);
  revCtx = revCtx || new (window.AudioContext||window.webkitAudioContext)();
  if(revCtx.state==='suspended'){ try{ revCtx.resume(); }catch(e){} }
  const url=mpGame.preview;
  const r=await playReverse(revCtx, url, {
    cfg: window.STACJA_CONFIG,
    shouldPlay: ()=>mpGame.preview===url,    // runda mogła się zmienić w trakcie dekodowania
    onEnded: ()=>mpSetKnob(false),
  });
  if(r.ok){ mpRevSrc=r; mpSetKnob(true); return; }
  if(r.aborted) return;                       // cisza — runda już inna
  // CORS/dekodowanie padło → zagraj normalnie
  mpAudio=new Audio(url); mpAudio.addEventListener('playing',()=>mpSetKnob(true)); mpAudio.play().catch(()=>{});
}
// host: wszyscy gotowi (lub timeout) → równoczesny start u wszystkich
function mpGo(){
  if(!mpHost || !mpGame || mpGame.phase!==MP.ARMING) return;
  if(mpArmTimer){ clearTimeout(mpArmTimer); mpArmTimer=null; }
  mpGame.phase=assertMp(mpGame.phase, MP.PLAY, console.warn); mpGame.playNonce=(mpGame.playNonce||0)+1;
  if(mpGame.timer>0) mpGame.endsAt=Date.now()+mpGame.timer*1000;
  mpBroadcast(); mpAfterSync();   // host gra lokalnie
}

/* ---- host: akcje od graczy ---- */
function mpHandleAct(a){
  if(!mpGame) return;
  // faza gotowości — host orkiestruje (presence + bezpiecznik), zliczanie w core
  if(a.type==='ready' && mpGame.phase===MP.ARMING){
    if(a.armNonce!==mpGame.armNonce) return;       // ready ze starej rundy — ignoruj
    mpReady.add(a.by);
    const r=countReady(mpMembers().map(m=>m.id), mpReady);
    mpGame.readyCount=r.count; mpGame.readyTotal=r.total;
    if(r.all){ mpGo(); return; }                   // wszyscy gotowi → start
    mpBroadcast(); mpRender();
    return;
  }
  // pozostałe akcje gry: czysty reducer (propose/unpropose/vote/sure)
  if(reduceAction(mpGame, a)){ mpBroadcast(); mpRender(); }
}

/* ---- host: start gry / runda ---- */
/* ---- host: ekran układania meczu (multi-select, jak solo) ---- */
let mpPickCats=new Set(), mpPickModes=new Set(['music']), mpPickRounds=4, mpPickTimer=60;
function mpToggleCat(k){ if(mpPickCats.has(k)) mpPickCats.delete(k); else mpPickCats.add(k); mpRender(); }
function mpToggleMode(m){ if(mpPickModes.has(m)) mpPickModes.delete(m); else mpPickModes.add(m); mpRender(); }
function mpSetRounds(r){ mpPickRounds=r; mpRender(); }
function mpSetTimer(t){ mpPickTimer=t; mpRender(); }
function mpPickerHTML(){
  const band=(title,keys,cls)=> keys.length? `<div class="band-label">${title}</div><div class="ticks">`+
    keys.map(k=>`<button class="tick ${cls} ${mpPickCats.has(k)?'on':''}" onclick="mpToggleCat('${k}')">${escapeHtml(ALL_CATS[k].label)}<small>${escapeHtml(ALL_CATS[k].range||ALL_CATS[k].desc||'')}</small></button>`).join('')+`</div>` : '';
  const cats=band('dekady',ERA_KEYS,'')+band('style i gatunki',STYLE_KEYS,'gen')+band('gotowe playlisty',READY_KEYS,'pl')+band('teksty — tłumaczenia 🌐',LYRICS_KEYS,'gen');
  const modes=`<div class="band-label">tryby (można kilka)</div><div class="ticks">`+
    ALL_MODES.map(m=>`<button class="tick gen ${mpPickModes.has(m)?'on':''}" onclick="mpToggleMode('${m}')">${MODE_LABEL[m]}<small>${MODE_SUB[m]}</small></button>`).join('')+`</div>`;
  const rounds=`<div class="band-label">rundy (× 3 kategorie × 5 pytań)</div><div class="lenpick">`+
    [1,2,3,4].map(r=>`<button class="${mpPickRounds===r?'on':''}" onclick="mpSetRounds(${r})">${r}</button>`).join('')+`</div>`;
  const timer=`<div class="band-label">timer pytania</div><div class="lenpick">`+
    [[0,'bez'],[30,'30s'],[60,'60s'],[90,'90s']].map(([v,l])=>`<button class="${mpPickTimer===v?'on':''}" onclick="mpSetTimer(${v})">${l}</button>`).join('')+`</div>`;
  const r=buildMatch([...mpPickCats],[...mpPickModes],mpPickRounds);
  const bad=(!mpPickCats.size||!mpPickModes.size||r.error);
  const info=(!mpPickCats.size||!mpPickModes.size)?'zaznacz kategorie i tryby':(r.error||`${mpPickRounds} × 3 × 5 = ${mpPickRounds*15} pytań`);
  return `<div class="mp-deck"><div class="mp-state">ułóż mecz</div>${cats}${modes}${rounds}${timer}
    <button class="match-rand" onclick="mpRandomPick()">🎲 Losuj kategorie i tryby</button>
    <div class="match-info ${bad?'err':''}">${escapeHtml(info)}</div>
    <button class="mp-btn" style="width:100%;margin-top:12px${bad?';opacity:.5':''}" ${bad?'disabled':''} onclick="mpStart()">Start meczu →</button></div>`;
}
function mpRandomPick(){ const {cats,modes}=randomPools(); mpPickCats=new Set(cats); mpPickModes=new Set(modes); mpRender(); }
function mpStart(){
  const r=buildMatch([...mpPickCats],[...mpPickModes],mpPickRounds);
  if(r.error||!r.slots){ mpRender(); return; }
  mpGame={hostId:mpMe.id, phase:'play', slots:r.slots, rounds:r.rounds, si:0, qi:0,
    score:0, catKey:r.slots[0].cat, mode:r.slots[0].mode, round:r.slots[0].round, catLabel:catLabel(r.slots[0].cat),
    proposals:[], sure:[], reveal:null, results:[], preview:'', lyric:'', playNonce:0,
    timer:mpPickTimer||0, endsAt:null, beerTally:{}};
  mpTally={};
  mpHostSeen.clear();
  mpHostNextQuestion();
}
// ustaw kategorię/tryb/rundę z bieżącego slotu i rozwiąż pytanie
function mpHostNextQuestion(){
  const s=mpGame.slots[mpGame.si]; if(!s){ mpFinish(); return; }
  mpGame.catKey=s.cat; mpGame.mode=s.mode; mpGame.round=s.round; mpGame.catLabel=catLabel(s.cat);
  mpHostNewRound();
}
async function mpHostNewRound(){
  mpGame.phase=MP.LOADING; mpGame.proposals=[]; mpGame.sure=[]; mpGame.reveal=null; mpGame.locked=null; mpGame.endsAt=null; mpScribeTouched=false; mpAutoLocked=false;
  mpBroadcast(); mpRender();
  const catKey = mpGame.catKey==='rnd' ? ALL_KEYS[Math.floor(Math.random()*ALL_KEYS.length)] : mpGame.catKey;
  if(mpGame.mode==='lektor'){
    const songs=((ALL_CATS[catKey]&&ALL_CATS[catKey].songs)||[]).filter(s=>s.lyric&&!mpHostSeen.has(norm(s.title)));
    if(!songs.length){ mpGame.phase=MP.NOLYRIC; mpBroadcast(); mpRender(); return; }
    const s=songs[Math.floor(Math.random()*songs.length)];
    mpHostCurrent={track:s.title, artist:s.artist, year:s.year||'', album:s.album||'', art:'', preview:'', lyric:s.lyric};
    mpHostSeen.add(norm(s.title));
    mpGame.lyric=s.lyric; mpGame.preview=''; mpGame.ttsUrl=s.tts||'';
  } else {
    // audio (muzyka/od tyłu/fragment) — playlistę i pulę wykonawców rozwiązuje repozytorium
    const t=await resolveTrack({cat:ALL_CATS[catKey], seen:mpHostSeen, cfg:window.STACJA_CONFIG});
    if(t.error){ mpGame.phase=MP.NETERR; mpGame.netReason=t.reason; mpBroadcast(); mpRender(); return; }
    mpHostCurrent={...t, lyric:''};
    mpGame.preview=t.preview; mpGame.lyric=''; mpGame.ttsUrl='';
  }
  // dla fragmentu: jedno wspólne okno 2 s u wszystkich (host losuje, broadcast)
  mpGame.snipStart = mpGame.mode==='snippet' ? Math.max(0.5, Math.random()*MP_SNIP_WINDOW_S) : 0;
  // —— FAZA GOTOWOŚCI (#4): roześlij utwór, poczekaj aż wszyscy zbuforują, dopiero start ——
  mpGame.phase=MP.ARMING; mpGame.armNonce=(mpGame.armNonce||0)+1;
  mpGame.endsAt=null; mpGame.readyCount=0; mpGame.readyTotal=mpMembers().length;
  mpReady=new Set();
  mpBroadcast(); mpRender();
  mpArm();                                   // host też buforuje i zgłosi swoją gotowość
  if(mpArmTimer) clearTimeout(mpArmTimer);
  mpArmTimer=setTimeout(()=>mpGo(), MP_ARM_TIMEOUT_MS);   // bezpiecznik: start mimo braku potwierdzeń
}
/* ---- host: zatwierdzenie odpowiedzi (pisarz) ---- */
function mpLock(){
  if(!mpHost || !mpGame || mpGame.phase!==MP.PLAY) return;
  mpAutoLocked=true;
  const title=($m('mpScTitle')?$m('mpScTitle').value:'').trim(), artist=($m('mpScArtist')?$m('mpScArtist').value:'').trim();
  const c=mpHostCurrent;
  const ev=evaluateAnswer(mpGame, c, {title, artist});   // czysta ocena (core)
  // nałóż wyliczenia na stan/tally (efekty zostają w app.js)
  mpGame.score += ev.gained;
  if(ev.firstById){ mpTally[ev.firstById]=mpTally[ev.firstById]||{name:ev.firstBy,correct:0}; mpTally[ev.firstById].correct++; }
  mpGame.results.push(ev.result);
  // #12: zlicz przegrane pewniaki per osoba (kto stawia i ile)
  if(!ev.teamOk && ev.anySure){ mpGame.beerTally=mpGame.beerTally||{}; ev.pewniacy.forEach(n=>{ mpGame.beerTally[n]=(mpGame.beerTally[n]||0)+1; }); }
  mpGame.reveal=ev.reveal;
  mpGame.phase=assertMp(mpGame.phase, MP.REVEAL, console.warn); mpGame.endsAt=null;
  mpBroadcast(); mpRender();
}
function mpNext(){
  const more=matchAdvance(mpGame);   // qi++ / si++ po 5 pytaniach
  if(!more){ mpFinish(); return; }
  mpHostNextQuestion();
}
function mpFinish(){
  const arr=Object.values(mpTally).sort((a,b)=>b.correct-a.correct);
  mpGame.mvp = arr.length&&arr[0].correct>0 ? arr[0] : null;
  mpGame.tallyList = arr;
  mpGame.phase=MP.DONE; mpBroadcast(); mpRender();
}
function mpNewGame(){ mpGame={hostId:mpMe.id, phase:null}; mpBroadcast(); mpRender(); }

/* ---- render sceny ---- */
function mpMyVote(){ return _myVote(mpGame, mpMe.id); }
function mpTopProp(){ return _topProposal(mpGame); }

/* mpRender = dyspozytor po fazie FSM; każdą fazę renderuje osobny helper */
function mpRender(){
  const st=$m('mpStage'); if(!st) return;
  if(!mpGame || mpGame.phase==null){
    st.innerHTML = mpHost ? mpPickerHTML() : `<div class="mp-deck"><div class="mp-state">host układa mecz…</div></div>`;
    return;
  }
  const g=mpGame;
  const head=`<div class="mp-round">${escapeHtml(matchHeader(g))}</div>
    <div class="mp-state">drużyna: ${g.score} pkt</div>`;
  switch(g.phase){
    case MP.LOADING: st.innerHTML=mpRenderLoading(head); return;
    case MP.ARMING:  st.innerHTML=mpRenderArming(g, head); return;
    case MP.NETERR:  st.innerHTML=mpRenderNetErr(g, head); return;
    case MP.NOLYRIC: st.innerHTML=mpRenderNoLyric(head); return;
    case MP.PLAY:    mpRenderPlay(g, head, st); return;
    case MP.REVEAL:  st.innerHTML=mpRenderReveal(g, head); return;
    case MP.DONE:    st.innerHTML=mpRenderDone(g, head); return;
  }
}

const mpRenderLoading = (head)=> `<div class="mp-deck">${head}<div class="mp-state">host losuje utwór…</div></div>`;
const mpRenderArming = (g, head)=>{
  const rc=g.readyCount||0, rt=g.readyTotal||mpMembers().length;
  return `<div class="mp-deck">${head}<div class="mp-state">⏳ czekamy na graczy… <b>${rc}/${rt}</b> gotowych</div><div class="mp-state" style="opacity:.7">muzyka ruszy równo u wszystkich</div></div>`;
};
const mpRenderNetErr = (g, head)=>{
  const msg = g.netReason==='empty' ? 'Brak zajawek dla tej kategorii — spróbuj ponownie albo zmień kategorię.' : 'Brak połączenia z iTunes (limit zapytań albo blokada sieci). Odczekaj minutę i spróbuj ponownie.';
  return `<div class="mp-deck">${head}<div class="mp-state" style="color:var(--red)">${msg} ${mpHost?'<br><button class="mp-btn ghost" onclick="mpHostNewRound()">spróbuj ponownie</button>':''}</div></div>`;
};
const mpRenderNoLyric = (head)=> `<div class="mp-deck">${head}<div class="mp-state" style="color:var(--red)">Brak tekstów do lektora w tej kategorii (songs[] w categories.js).</div></div>`;

/* --- faza gry: małe budowniki HTML + częściowa aktualizacja (nie czyść pól) --- */
function mpBoardHTML(g, top, mine){
  if(!g.proposals.length) return `<div class="mp-state">brak propozycji — wrzuć pierwszą</div>`;
  return g.proposals.map(p=>{
    const isTop = top && p.id===top.id && p.votes.length>0;
    const delBtn = p.by===mpMe.id ? `<button class="mp-del" onclick="mpSend({type:'unpropose',pid:'${p.id}'})" title="usuń moją propozycję">✕</button>` : '';
    return `<div class="mp-prop${isTop?' top':''}">
      <div class="guess"><span class="who">${escapeHtml(p.byName)}</span><b>${escapeHtml(p.title||'—')}</b> <span>· ${escapeHtml(p.artist||'—')}</span></div>
      <button class="mp-vote${mine===p.id?' voted':''}" onclick="mpSend({type:'vote',pid:'${p.id}'})">👍 ${p.votes.length}</button>${delBtn}
    </div>`; }).join('');
}
// karta „odpowiedź drużyny" = najczęściej głosowana propozycja (#8), widoczna dla wszystkich
function mpTeamHTML(top){
  return `<div class="lab">odpowiedź drużyny${top&&top.votes.length?(' · '+top.votes.length+' 👍'):''}</div>
    <div class="ans">${top?(escapeHtml(top.title||'—')+' · '+escapeHtml(top.artist||'—')):'— wrzuć i przegłosuj propozycję —'}</div>`;
}
// pewniak dotyczy ODPOWIEDZI DRUŻYNY (top), nie pojedynczej propozycji (#11)
function mpPewniakHTML(g){
  const iAmSure=(g.sure||[]).some(s=>s.id===mpMe.id);
  const sureNames=(g.sure||[]).map(s=>escapeHtml(s.name)).join(', ');
  return `<button class="mp-sure${iAmSure?' on':''}" onclick="mpSend({type:'sure'})" title="pewniak dotyczy odpowiedzi drużyny">🍺 pewniak${iAmSure?' ✓':''}</button>
    <span class="mp-state" style="margin:0">${sureNames?('pewni odpowiedzi: '+sureNames):'pewny odpowiedzi drużyny? postaw 🍺'}</span>`;
}
function mpRenderPlay(g, head, st){
  const top=mpTopProp(), mine=mpMyVote();
  const board=mpBoardHTML(g, top, mine), team=mpTeamHTML(top), pewniak=mpPewniakHTML(g);
  // pełna przebudowa TYLKO przy wejściu w rundę; potem aktualizujemy same dynamiczne części,
  // żeby NIE czyścić pól, w które ktoś właśnie wpisuje
  if(mpPlayRound!==g.playNonce || !$m('mpBoard')){
    mpPlayRound=g.playNonce;
    const scribe = mpHost ? `<div class="mp-scribe"><div class="lab">host — zatwierdź odpowiedź drużyny (podstawiona top-głosowana)</div>
        <div class="mp-form" style="grid-template-columns:1fr 1fr">
          <input id="mpScTitle" placeholder="tytuł" oninput="mpScribeTouched=true">
          <input id="mpScArtist" placeholder="wykonawca" oninput="mpScribeTouched=true">
        </div>
        <button class="mp-btn" style="width:100%" onclick="mpLock()">Zatwierdź odpowiedź ✓</button></div>` : '';
    const reacts=`<div class="mp-reacts">${REACTIONS.map(e=>`<button onclick="mpReact('${e}')">${e}</button>`).join('')}</div>
      <div class="mp-saybar"><input id="mpSayIn" maxlength="32" placeholder="napisz coś krótkiego…" onkeydown="if(event.key==='Enter')mpSay()"><button onclick="mpSay()">Wyślij</button></div>`;
    st.innerHTML=`<div class="mp-deck">${head}
      <div class="mp-state" id="mpCountdown"></div>
      <button class="mp-knob" onclick="mpPlayLocal()" aria-label="Odtwórz">
        <svg viewBox="0 0 24 24"><path id="mpKnobIcon" d="M8 5v14l11-7z"/></svg></button>
      <div class="mp-state">${g.mode==='lektor'?'lektor czyta u każdego':'gra u każdego'} · stuknij, by powtórzyć</div></div>
      ${g.mode==='lektor'&&g.lyric?`<div class="lyric-box"><span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>${escapeHtml(g.lyric)}</div>`:''}
      <div class="mp-form">
        <input id="mpPropT" placeholder="tytuł"><input id="mpPropA" placeholder="wykonawca">
        <button onclick="mpPropose()">Wrzuć</button>
      </div>
      <div class="mp-board" id="mpBoard">${board}</div>
      <div class="mp-team" id="mpTeam">${team}</div>
      <div class="mp-pewniak" id="mpPewniak">${pewniak}</div>${reacts}${scribe}`;
  } else {
    // tylko odśwież tablicę, kartę drużyny i pewniaka — pola zostają nietknięte
    $m('mpBoard').innerHTML=board;
    if($m('mpTeam')) $m('mpTeam').innerHTML=team;
    $m('mpPewniak').innerHTML=pewniak;
  }
  // podpowiedź pisarza (top głosów) — dopóki host sam nie zacznie pisać
  if(mpHost && !mpScribeTouched && top && $m('mpScTitle')){ $m('mpScTitle').value=top.title; $m('mpScArtist').value=top.artist; }
  mpTickTimer();
}

function mpRenderReveal(g, head){
  const r=g.reveal;
  const isLast = g.si>=g.slots.length-1 && g.qi>=QPC-1;
  return `<div class="mp-deck">${head}</div>
    <div class="reveal show mp-reveal" style="display:block">
      <div style="padding:16px">
        ${r.art?`<img class="mp-art" src="${r.art}" referrerpolicy="no-referrer">`:''}
        <div class="rline"><span class="mk ${r.okTitle?'ok':'no'}">${r.okTitle?'✓':'✗'}</span><span class="v"><span class="k">Tytuł</span>${escapeHtml(r.track)}</span></div>
        <div class="rline"><span class="mk ${r.okArtist?'ok':'no'}">${r.okArtist?'✓':'✗'}</span><span class="v"><span class="k">Wykonawca</span>${escapeHtml(r.artist)}</span></div>
        <div class="mp-state" style="margin-top:10px">${r.teamOk?`<span class="ok">drużyna zgarnia +${r.gained} pkt${r.pewniakWin?' (pewniak ×2!)':''}</span>`:'<span class="no">tym razem nie (0 pkt)</span>'}${r.firstBy?` · pierwszy trafny typ: <b style="color:var(--amber)">${escapeHtml(r.firstBy)}</b>`:''}</div>
        ${r.pewniakLose?`<div class="mp-beer">🍺 pewniak nietrafiony — stawia: <b>${(r.pewniacy||[]).map(escapeHtml).join(', ')}</b><br><span style="font-weight:400;opacity:.8">(odbiór na żywo 😏)</span></div>`:''}
        ${r.pewniakWin?`<div class="mp-state" style="color:var(--green)">pewni i trafili: ${(r.pewniacy||[]).map(escapeHtml).join(', ')} 🎯</div>`:''}
        <div class="mp-state" style="opacity:.7">odpowiedź drużyny: „${escapeHtml(r.locked.title||'—')} · ${escapeHtml(r.locked.artist||'—')}"</div>
      </div>
      ${mpHost?`<button class="next" onclick="mpNext()">${isLast?'Wynik końcowy →':'Następne pytanie →'}</button>`:'<div class="next" style="opacity:.6">czekaj na hosta…</div>'}
    </div>`;
}

function mpRenderDone(g, head){
  const rows=(g.tallyList||[]).map(t=>`<div class="row"><span>${escapeHtml(t.name)}</span><b>${t.correct} trafnych typów</b></div>`).join('')||'<div class="mp-state">brak trafnych propozycji</div>';
  // #12: kto stawia (przegrane pewniaki) i ile
  const beer=Object.entries(g.beerTally||{}).sort((a,b)=>b[1]-a[1]);
  const beerBlock = beer.length
    ? `<div class="mp-beer">🍺 stawiają: ${beer.map(([n,c])=>`<b>${escapeHtml(n)}</b>${c>1?` (${c}×)`:''}`).join(', ')}<br><span style="font-weight:400;opacity:.8">odbiór na żywo 😏</span></div>`
    : `<div class="mp-state" style="opacity:.7">nikt nie przepalił pewniaka — brawo 🍻</div>`;
  return `<div class="summary show" style="display:block">
    <div class="sum-head"><div class="sum-big">${g.score} pkt</div>
      <div class="sum-sub">${g.slots?g.slots.length*QPC:0} pytań · wynik drużyny${g.mvp?` · MVP: ${escapeHtml(g.mvp.name)}`:''}</div></div>
    <div class="mp-sb" style="padding:0 16px">${rows}</div>
    <div style="padding:0 16px">${beerBlock}</div>
    ${mpHost?'<button class="sum-again" onclick="mpNewGame()">Nowa gra</button>':'<div class="next" style="opacity:.6">host może zacząć nową grę</div>'}</div>`;
}
function mpPropose(){
  const t=$m('mpPropT').value.trim(), a=$m('mpPropA').value.trim();
  if(!t&&!a) return;
  mpSend({type:'propose', title:t, artist:a});
  $m('mpPropT').value=''; $m('mpPropA').value='';
}

function mpTickTimer(){
  const el=$m('mpCountdown');
  if(!mpGame || mpGame.phase!==MP.PLAY || !mpGame.endsAt){ if(el) el.textContent=''; return; }
  const rem=Math.max(0, mpGame.endsAt - Date.now());
  const s=Math.ceil(rem/1000);
  if(el){ el.textContent='⏱ '+s+' s'; el.style.color = s<=10 ? 'var(--red)' : 'var(--amber)'; }
  if(rem<=0 && mpHost && !mpAutoLocked && mpGame.phase===MP.PLAY){ mpLock(); }
}
function mpReact(e){ if(mpCh) mpCh.send({type:'broadcast',event:'react',payload:{emoji:e, byName:mpMe.name}}); }
function mpFloatEmoji(emoji, byName){      // #9: pokaż KTO wysłał emotkę
  let fx=$m('mpFx');
  if(!fx){ fx=document.createElement('div'); fx.id='mpFx'; document.body.appendChild(fx); }
  const s=document.createElement('div'); s.className='mp-float';
  s.innerHTML=`<span class="e">${emoji}</span>${byName?`<span class="nm">${escapeHtml(byName)}</span>`:''}`;
  s.style.left=(8+Math.random()*78)+'%';
  fx.appendChild(s); setTimeout(()=>s.remove(), EMOJI_TTL_MS);
}
// #10: krótka wiadomość (kilka słów) — biały dymek lecący przez ekran
function mpSay(){
  const el=$m('mpSayIn'); if(!el) return;
  const t=el.value.trim().slice(0,32); if(!t) return;
  if(mpCh) mpCh.send({type:'broadcast',event:'say',payload:{text:t, byName:mpMe.name}});
  el.value='';
}
function mpFloatSay(text, byName){
  let fx=$m('mpFx');
  if(!fx){ fx=document.createElement('div'); fx.id='mpFx'; document.body.appendChild(fx); }
  const s=document.createElement('div'); s.className='mp-say';
  s.innerHTML=`${byName?`<b>${escapeHtml(byName)}</b>`:''}${escapeHtml(text)}`;
  s.style.left=(6+Math.random()*36)+'%';
  fx.appendChild(s); setTimeout(()=>s.remove(), SAY_TTL_MS);
}

/* autostart lobby gdy w URL jest ?room= */
if(new URLSearchParams(location.search).get('room')){ showScreen('mp'); $m('mpCode').value=new URLSearchParams(location.search).get('room').toUpperCase(); }

/* ============ most do HTML: app.js to moduł ES (własny scope), więc handlery
   wstrzykiwane w stringach onclick="" muszą żyć na window. ============ */
Object.assign(window, {
  mpHostNewRound, mpLock, mpNewGame, mpNext, mpPlayLocal, mpPropose,
  mpRandomPick, mpReact, mpSay, mpSend, mpSetRounds, mpSetTimer,
  mpStart, mpToggleCat, mpToggleMode,
});
