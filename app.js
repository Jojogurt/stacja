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
import { reduceAction, countReady, evaluateAnswer, candidatesForSlot, teamAnswer, myVoteForSlot, rosterState, slotsFor } from './core/mpReducer.js';
import { playReverse, unlockAudioElement } from './adapters-web/webAudio.js';
import { resolveTrack } from './adapters-web/itunesRepository.js';
import { sb, ensureSession, setHandle, recordMatch, fetchLeague, fetchProfile, myId } from './adapters-web/supabase.js';
import { buildSoloRecord, buildMpRecord } from './core/matchRecord.js';

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
// token „pokolenia": każde nowe odtworzenie/stop unieważnia poprzednie. Bez tego
// wolna synteza Piper z poprzedniego pytania kończyła się PO zmianie rundy i czytała
// stary tekst (oraz nakładała się = brzmiało jak zapętlenie).
let lektorGen=0;

function lektorStop(){ lektorGen++; if(lektorAudio){ lektorAudio.pause(); lektorAudio=null; } stopSpeech(); }

async function piperEnsure(onPct){
  if(!piperMod) piperMod = await import('https://esm.sh/@diffusionstudio/vits-web@1.0.3');
  if(!piperReady){ await piperMod.download(PIPER_VOICE, p=>{ if(onPct&&p.total) onPct(Math.round(p.loaded/p.total*100)); }); piperReady=true; }
  return piperMod;
}

// odtwarza lektora RAZ; callback onStatus(tekst) do pokazania postępu w UI.
// Powtórka tylko ręcznie (gałka / przycisk ↻) — tu nie ma żadnej pętli.
async function lektorPlay(text, ttsUrl, onStatus){
  lektorStop();
  const gen=lektorGen;                          // to odtworzenie; jeśli zmieni się — przerwij
  if(ttsUrl){ const a=new Audio(ttsUrl); if(gen!==lektorGen) return; lektorAudio=a; a.play().catch(()=>{}); return; }
  if(piperOn){
    try{
      onStatus && onStatus('przygotowuję lepszy głos…');
      const mod = await Promise.race([ piperEnsure(p=>{ if(gen===lektorGen) onStatus&&onStatus('pobieram głos… '+p+'%'); }),
        new Promise((_,r)=>setTimeout(()=>r(new Error('load')),120000)) ]);
      if(gen!==lektorGen) return;                // runda się zmieniła w trakcie pobierania
      onStatus && onStatus('lektor czyta (Piper)…');
      const wav = await Promise.race([ mod.predict({text, voiceId:PIPER_VOICE}),
        new Promise((_,r)=>setTimeout(()=>r(new Error('synth')),60000)) ]);
      if(gen!==lektorGen) return;                // synteza skończyła się po zmianie pytania → NIE graj starego
      const url=URL.createObjectURL(wav);
      const a=new Audio(url); a.onended=()=>URL.revokeObjectURL(url);
      lektorAudio=a; await a.play(); return;
    }catch(e){ if(gen!==lektorGen) return; onStatus && onStatus('Piper niedostępny — głos systemowy'); }
  }
  if(gen!==lektorGen) return;
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
  if(session && current){ const s=matchSlot(session.match); session.results.push({track:current.track, artist:current.artist, okTitle:false, okArtist:false, skipped:true, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); }
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
  // zapis wyniku (best-effort, nieblokujące) — tylko gdy mamy tożsamość (auth.uid)
  const slots=session.match.slots;
  (async()=>{ const uid=await ensureSession(); if(uid) recordMatch(buildSoloRecord({
    results:res, slots, profileId:uid, displayName:mpMe.name||'ja',
    config:{ categories:[...soloCats], modes:[...soloModes], rounds:soloRounds },
  })); })();
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
  if(session){ const s=matchSlot(session.match); session.results.push({track:current.track, artist:current.artist, okTitle, okArtist, round:s?s.round:0, cat:s?s.cat:'', mode:s?s.mode:mode}); updateSessUI(); }

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
let mpAck=null;             // playNonce odsłony, którą TEN klient już zamknął („dalej")
let mpRevealNonce=null;     // playNonce ostatnio pokazanej odsłony
let mpRevealSnap=null;      // migawka odsłony do renderu we własnym tempie
let mpAudio=null;           // jeden trwały, odblokowany gestem element audio (MP)
let mpRevSrc=null;          // BufferSource trybu „od tyłu" w MP
let mpTally={};             // id -> {name, correct}  (do MVP)
let mpAutoLocked=false;     // czy timer/host już zatwierdził rundę
let mpPlayRound=null;       // dla której rundy jest już zbudowany formularz (by nie czyścić pól)
let mpTimerInt=null;        // interwał odliczania
const $m=id=>document.getElementById(id);
const REACTIONS=['😂','🔥','🎉','🤔','😱','🍺'];
/* nazwane stałe (zamiast magic numbers rozsianych po kodzie) */
const MP_BUFFER_TIMEOUT_MS=6000;// klient: bezpiecznik — zgłoś „ready" mimo zawieszonego buforowania
const MP_SNIP_WINDOW_S=16;      // okno losowania startu fragmentu (s)
const EMOJI_TTL_MS=2400;        // jak długo leci emotka po ekranie
const SAY_TTL_MS=4400;          // jak długo wisi dymek wiadomości

function mpRandCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++)s+=c[Math.floor(Math.random()*c.length)]; return s; }
function mpErr(t){ $m('mpErr').textContent=t||''; }

function mpConnect(){ mpSb=sb(); return mpSb; }   // jeden współdzielony klient (Realtime + Auth)

// Logowanie anonimowe LENIWE — dopiero przy geście, który tego potrzebuje
// (wejście do pokoju MP, koniec meczu). Dzięki temu CAPTCHA nie odpala się
// na każdym wejściu na stronę, tylko gdy realnie zapisujemy postęp.

/* ---- wejście / wyjście z trybu ---- */
function showScreen(s){ document.body.classList.remove('menu','solo','mp','liga','profil'); document.body.classList.add(s); }
$m('goSolo').onclick=()=>{ showScreen('solo'); };

/* ---- Liga + Profil (Etap 1 / Faza D) ---- */
$m('goLiga').onclick=()=>{ showScreen('liga'); renderLiga(); };
$m('goProfil').onclick=()=>{ showScreen('profil'); renderProfil(); };

async function renderLiga(){
  const el=$m('ligaList'); el.innerHTML='<div class="liga-empty">ładowanie…</div>';
  const [rows, me]=await Promise.all([fetchLeague(50), myId()]);
  if(!rows.length){ el.innerHTML='<div class="liga-empty">Pusto na razie.<br>Rozegraj mecz, żeby pojawić się w lidze.<br><small>(wymaga włączonego logowania w projekcie)</small></div>'; return; }
  el.innerHTML=rows.map((r,i)=>{
    const acc=r.matches?Math.round((r.correct/(r.matches||1))*10)/10:0;
    return `<div class="liga-row${r.profile_id===me?' me':''}">
      <span class="rank">${i+1}</span>
      <span class="who">${escapeHtml(r.handle||'gracz')}<small>${r.matches} mecz(e) · ${r.correct} trafnych</small></span>
      <span class="pts">${r.points}</span>
    </div>`;
  }).join('');
}

async function renderProfil(){
  const el=$m('profilStats'); el.innerHTML='<div class="profil-empty">ładowanie…</div>';
  await ensureSession();   // gest „Profil" → utwórz sesję/profil, by dało się ustawić ksywkę
  const p=await fetchProfile();
  if(!p){ $m('profilHandle').value=''; el.innerHTML='<div class="profil-empty">Profil niedostępny.<br>Włącz logowanie anonimowe w projekcie Supabase, żeby zapisywać postępy.</div>'; return; }
  $m('profilHandle').value=p.handle;
  const s=p.standing;
  const cats=Object.entries(p.byCat).sort((a,b)=>b[1].n-a[1].n);
  const catRows=cats.length? cats.map(([k,v])=>{
    const pct=Math.round(v.ok/v.n*100);
    return `<div class="stat-cat"><span class="lbl">${escapeHtml(catLabel(k))}</span>
      <span class="bar"><i style="width:${pct}%"></i></span><span class="pct">${pct}%</span></div>`;
  }).join('') : '<div class="profil-empty" style="padding:14px">Brak rozegranych pytań solo.</div>';
  el.innerHTML=`<div class="stat-big">
      <div><b>${s.matches}</b><small>mecze</small></div>
      <div><b>${s.correct}</b><small>trafne</small></div>
      <div><b>${s.points}</b><small>punkty</small></div>
    </div>
    <div class="band-label" style="margin:16px 0 4px">celność per kategoria (solo)</div>
    ${catRows}`;
}
$m('profilSave').onclick=async()=>{
  const v=$m('profilHandle').value.trim(); if(!v) return;
  const btn=$m('profilSave'); btn.textContent='…';
  await setHandle(v); mpMe.name=mpMe.name||v;
  btn.textContent='✓'; setTimeout(()=>btn.textContent='Zapisz',1200);
};
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
  if(mpAudio){ try{mpAudio.pause();}catch(e){} }   // element trwały — pauza, nie zeruj
  stopSpeech(); mpStopRev();
  if(mpArmTimer){ clearTimeout(mpArmTimer); mpArmTimer=null; }
  mpReady=new Set(); mpLastArmNonce=null;
  mpAck=mpRevealNonce=mpRevealSnap=null;
  mpCode=null; mpHost=false; mpGame=null; mpHostCurrent=null; mpTally={}; mpLastNonce=null;
  $m('mpRoom').style.display='none'; $m('mpLobby').style.display='';
}

/* ---- tworzenie / dołączanie ---- */
$m('mpCreate').onclick=()=>{ const n=$m('mpName').value.trim(); if(!n){ mpErr('Podaj ksywę.'); return; } mpUnlockAudio(); mpMe.name=n; setHandle(n); mpEnterRoom(mpRandCode(), true); };
$m('mpJoin').onclick=()=>{
  const n=$m('mpName').value.trim(); const c=$m('mpCode').value.trim().toUpperCase();
  if(!n){ mpErr('Podaj ksywę.'); return; }
  if(c.length<4){ mpErr('Wpisz 4-znakowy kod.'); return; }
  mpUnlockAudio(); mpMe.name=n; setHandle(n); mpEnterRoom(c, false);
};
$m('mpCopy').onclick=()=>{
  const url=location.origin+location.pathname+'?room='+mpCode;
  navigator.clipboard?.writeText(url); $m('mpCopy').textContent='skopiowano!';
  setTimeout(()=>$m('mpCopy').textContent='kopiuj link',1500);
};

async function mpEnterRoom(code, asHost){
  mpErr('');
  const client=mpConnect();
  if(!client){ mpErr('Brak połączenia z serwerem (config.js / supabase-js).'); return; }
  const uid=await ensureSession(); if(uid) mpMe.id=uid;   // tożsamość = auth.uid PRZED presence
  mpCode=code; mpHost=asHost;
  $m('mpLobby').style.display='none'; $m('mpRoom').style.display='';
  $m('mpRoomCode').textContent=code;
  mpCh=client.channel('stacja-'+code, {config:{broadcast:{self:true}, presence:{key:mpMe.id}}});
  mpCh.on('broadcast',{event:'sync'},({payload})=>{ if(!mpHost){ mpGame=payload; mpAfterSync(); } });
  mpCh.on('broadcast',{event:'act'},({payload})=>{ if(mpHost) mpHandleAct(payload); });
  mpCh.on('broadcast',{event:'react'},({payload})=>{ if(payload.by!==mpMe.id) mpFloatEmoji(payload.emoji, payload.byName); });
  mpCh.on('broadcast',{event:'say'},({payload})=>{ if(payload.by!==mpMe.id){ mpPushChat(payload.byName, payload.text); mpFloatSay(payload.text, payload.byName); } });
  mpCh.on('broadcast',{event:'typing'},({payload})=>{ if(payload.by!==mpMe.id) mpMarkTyping(payload.by); });
  mpCh.on('presence',{event:'sync'},()=>{ mpRenderMembers(); if(mpHost){ mpBroadcast(); mpMaybeGo(); } });
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
let mpSeenActs=new Set();   // id zastosowanych akcji — by akcja nie zadziałała dwa razy
function mpSend(act){
  act.by=mpMe.id; act.byName=mpMe.name; act.aid=mpMe.id+'-'+Math.random().toString(36).slice(2);
  // host stosuje OD RAZU (bez round-tripu → brak laga); 'act' obsługuje tylko host,
  // więc gdy hostem jestem ja, nie ma po co wysyłać — sync i tak roześle stan
  if(mpHost){ mpHandleAct(act); return; }
  // KLIENT: zastosuj lokalnie OD RAZU (optymistycznie) — natychmiastowe podświetlenie
  // (głos/propozycja/pewniak), a właściwy sync od hosta zaraz skoryguje stan.
  if(mpGame && reduceAction(mpGame, act)) mpRender();
  if(mpCh){ mpCh.send({type:'broadcast',event:'act',payload:act}); }
}
function mpAfterSync(){
  // faza gotowości: zbuforuj utwór i zgłoś „ready" — ale TYLKO gdy nie ma odsłony do
  // zamknięcia. Z zaległą odsłoną klient zbroi się dopiero po kliknięciu „dalej".
  if(mpGame && mpGame.phase===MP.ARMING && mpGame.armNonce!==mpLastArmNonce && !mpRevealPending()){
    mpArm();
  }
  // start: zagraj lokalnie gdy zmienił się nonce (audio już zbuforowane → równy start).
  // Render NAJPIERW, żeby gałka/status już istniały, gdy mpPlayLocal ustawia „ładowanie…".
  const startPlay = mpGame && mpGame.phase===MP.PLAY && mpGame.playNonce!==mpLastNonce;
  if(startPlay) mpLastNonce=mpGame.playNonce;
  mpRender();
  if(startPlay) mpPlayLocal();
}
// czy ten klient ma jeszcze nie zamkniętą („dalej") odsłonę
function mpRevealPending(){ return !!mpRevealSnap && mpAck!==mpRevealNonce; }
// host: sprawdź, czy można już wystartować pytanie (wszyscy obecni gotowi)
function mpMaybeGo(){
  if(!mpHost || !mpGame || mpGame.phase!==MP.ARMING) return;
  const r=countReady(mpMembers().map(m=>m.id), mpReady);
  mpGame.readyCount=r.count; mpGame.readyTotal=r.total;
  if(r.all){ mpGo(); } else { mpBroadcast(); mpRender(); }
}
// „dalej" na ekranie wyniku — KAŻDY klika sam, we własnym tempie
function mpAdvance(){
  if(!mpGame) return;
  mpAck=mpRevealNonce;                                  // zamknij u siebie odsłonę
  if(mpHost){
    if(mpGame.phase===MP.REVEAL){ mpNext(); }           // host rusza następne pytanie (host też się zbroi)
    else { mpRender(); }
  } else {
    if(mpGame.phase===MP.ARMING && mpGame.armNonce!==mpLastArmNonce){ mpArm(); }  // host już zbroi → zgłoś gotowość
    mpRender();
  }
}
// stany gałki: 'pause' (∥ gra), 'wait' (⏳ ładowanie), 'play' (▶ idle/pauza)
function mpSetKnob(state){
  if(state===true) state='pause'; if(state===false) state='play';
  const i=$m('mpKnobIcon');
  if(i) i.innerHTML = state==='pause' ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
    : state==='wait' ? '<path d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="currentColor" stroke-width="2.4"/>'
    : '<path d="M8 5v14l11-7z"/>';
  const k=$m('mpKnob'); if(k) k.classList.toggle('loading', state==='wait');
}
function mpSetPlayStatus(t){ const e=$m('mpPlayStatus'); if(e) e.textContent=t; }
// JEDEN trwały element audio dla MP — odblokowany gestem (mobilna autoplay-policy),
// reużywany co rundę przez podmianę .src. Zdarzenia gałki wpinane raz — gałka i status
// JADĄ ZA REALNYMI zdarzeniami odtwarzacza (koniec rozjazdu ikona vs dźwięk).
function mpEnsureAudio(){
  if(!mpAudio){
    mpAudio=new Audio(); mpAudio.preload='auto';
    mpAudio.addEventListener('playing',()=>{ mpSetKnob('pause'); mpSetPlayStatus(mpGame&&mpGame.mode==='snippet'?'gra fragment…':'gra…'); });
    mpAudio.addEventListener('waiting',()=>{ mpSetKnob('wait'); mpSetPlayStatus('ładowanie…'); });
    mpAudio.addEventListener('stalled',()=>{ mpSetKnob('wait'); mpSetPlayStatus('ładowanie…'); });
    mpAudio.addEventListener('pause',  ()=>{ if(!mpAudio.ended){ mpSetKnob('play'); mpSetPlayStatus('pauza · ▶ stuknij'); } });
    mpAudio.addEventListener('ended',  ()=>{ mpSetKnob('play'); mpSetPlayStatus('koniec · ↻ stuknij'); });
  }
  return mpAudio;
}
// odblokuj audio w geście (tworzenie/dołączanie/start/stuknięcie gałki) — bez tego
// host nie usłyszy muzyki, bo play() leci poza gestem (po fazie gotowości)
function mpUnlockAudio(){ unlockCtx(); unlockAudioElement(mpEnsureAudio()); }
// usuń ewentualny watchdog fragmentu z poprzedniej rundy (element jest trwały)
function mpClearSnip(a){ if(a._snipStop){ a.removeEventListener('timeupdate', a._snipStop); a._snipStop=null; } }

// faza gotowości — preload zajawki na trwałym elemencie, potem zgłoś hostowi „ready" (#4)
function mpArm(){
  mpSetKnob(false);
  const armNonce=mpGame.armNonce;
  mpLastArmNonce=armNonce;   // ta runda już zbrojona przez tego klienta (anty-dublowanie)
  // lektor / brak zajawki — nic do buforowania, gotów od razu
  if(mpGame.mode==='lektor' || !mpGame.preview){ mpSend({type:'ready', armNonce}); return; }
  const a=mpEnsureAudio(); mpClearSnip(a);
  if(a.src!==mpGame.preview) a.src=mpGame.preview;
  let done=false;
  const ready=()=>{ if(done) return; done=true; mpSend({type:'ready', armNonce}); };
  a.addEventListener('canplaythrough', ready, {once:true});
  a.addEventListener('canplay',        ready, {once:true});
  a.addEventListener('error',          ready, {once:true}); // i tak zgłoś — host nie utknie
  setTimeout(ready, MP_BUFFER_TIMEOUT_MS);                  // bezpiecznik
  a.load();
}
function mpStopRev(){ if(mpRevSrc){ mpRevSrc.stop(); mpRevSrc=null; } }   // uchwyt z playReverse
// play() zablokowane przez przeglądarkę (autoplay poza gestem) → poproś o stuknięcie
function mpPlayBlocked(){ mpSetKnob('play'); mpSetPlayStatus('stuknij ▶, by odtworzyć'); }
function mpPlayLocal(){
  lektorStop(); mpStopRev();
  if(mpGame.mode==='lektor'){ mpSetKnob('pause'); mpSetPlayStatus('lektor czyta…'); if(mpGame.lyric) lektorPlay(mpGame.lyric, mpGame.ttsUrl, ()=>{}); return; }
  if(!mpGame.preview){ mpSetPlayStatus('brak zajawki'); return; }
  if(mpGame.mode==='reverse'){ return mpPlayReverse(); }
  // music / snippet — trwały, odblokowany element; src ustawiony już w fazie gotowości
  const a=mpEnsureAudio(); mpClearSnip(a);
  if(a.src!==mpGame.preview) a.src=mpGame.preview;
  mpSetKnob('wait'); mpSetPlayStatus('ładowanie…');   // od razu pokaż, że się wczytuje
  if(mpGame.mode==='snippet'){
    const start=mpGame.snipStart||0.5;
    const seek=()=>{ try{ a.currentTime=start; }catch(e){} };
    if(a.readyState>=1) seek(); else a.addEventListener('loadedmetadata', seek, {once:true});
    const stop=()=>{ if((a.currentTime-start)>=SNIP){ a.pause(); mpClearSnip(a); } };
    a._snipStop=stop; a.addEventListener('timeupdate', stop);
    a.play().catch(mpPlayBlocked); return;
  }
  try{ a.currentTime=0; }catch(e){}
  a.play().catch(mpPlayBlocked);
}
// „od tyłu" w MP — każdy klient dekoduje+odwraca lokalnie (wspólny AudioPort.playReverse)
async function mpPlayReverse(){
  if(mpAudio){ try{mpAudio.pause();}catch(e){} }
  mpSetKnob('wait'); mpSetPlayStatus('odwracam…');
  revCtx = revCtx || new (window.AudioContext||window.webkitAudioContext)();
  if(revCtx.state==='suspended'){ try{ revCtx.resume(); }catch(e){} }
  const url=mpGame.preview;
  const r=await playReverse(revCtx, url, {
    cfg: window.STACJA_CONFIG,
    shouldPlay: ()=>mpGame.preview===url,    // runda mogła się zmienić w trakcie dekodowania
    onEnded: ()=>{ mpSetKnob('play'); mpSetPlayStatus('koniec · ↻ stuknij'); },
  });
  if(r.ok){ mpRevSrc=r; mpSetKnob('pause'); mpSetPlayStatus('gra od tyłu…'); return; }
  if(r.aborted) return;                       // cisza — runda już inna
  // CORS/dekodowanie padło → zagraj normalnie (ten sam trwały element z eventami)
  const a=mpEnsureAudio(); a.src=url; a.play().catch(mpPlayBlocked);
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
  if(a.aid){ if(mpSeenActs.has(a.aid)) return; mpSeenActs.add(a.aid); }   // pomiń echo własnej akcji
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
  mpUnlockAudio();   // gest hosta — odblokuj audio, zanim muzyka ruszy po fazie gotowości
  mpGame={hostId:mpMe.id, phase:'play', slots:r.slots, rounds:r.rounds, si:0, qi:0,
    score:0, catKey:r.slots[0].cat, mode:r.slots[0].mode, round:r.slots[0].round, catLabel:catLabel(r.slots[0].cat),
    answerSlots:slotsFor(r.slots[0].mode, r.slots[0].cat), proposals:[], votes:{}, sure:[], passed:[],
    reveal:null, results:[], preview:'', lyric:'', playNonce:0,
    timer:mpPickTimer||0, endsAt:null, beerTally:{}};
  mpTally={};
  mpHostSeen.clear();
  mpAck=mpRevealNonce=mpRevealSnap=null;   // świeży mecz → brak zaległej odsłony
  mpHostNextQuestion();
}
// ustaw kategorię/tryb/rundę z bieżącego slotu i rozwiąż pytanie
function mpHostNextQuestion(){
  const s=mpGame.slots[mpGame.si]; if(!s){ mpFinish(); return; }
  mpGame.catKey=s.cat; mpGame.mode=s.mode; mpGame.round=s.round; mpGame.catLabel=catLabel(s.cat);
  mpGame.answerSlots=slotsFor(s.mode, s.cat);
  mpHostNewRound();
}
async function mpHostNewRound(){
  mpSeenActs.clear();   // nowa runda → świeży zbiór zastosowanych akcji (nie rośnie w nieskończoność)
  mpGame.phase=MP.LOADING; mpGame.proposals=[]; mpGame.votes={}; mpGame.sure=[]; mpGame.passed=[]; mpGame.reveal=null; mpGame.locked=null; mpGame.endsAt=null; mpAutoLocked=false;
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
  mpArm();                                   // host też buforuje i zgłasza swoją gotowość
  // brak twardego timeoutu: pytanie rusza dopiero, gdy WSZYSCY klikną „dalej" (gotowość).
  // Jeśli ktoś wyjdzie, presence-sync przeliczy gotowość (mpMaybeGo) i odblokuje start.
  if(mpArmTimer){ clearTimeout(mpArmTimer); mpArmTimer=null; }
}
/* ---- host: zatwierdzenie odpowiedzi (pisarz) ---- */
function mpLock(){
  if(!mpHost || !mpGame || mpGame.phase!==MP.PLAY) return;
  mpAutoLocked=true;
  const c=mpHostCurrent;
  const ev=evaluateAnswer(mpGame, c);   // czysta ocena (core) — locked = odpowiedź drużyny (górka głosów per slot)
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
  // host zapisuje cały mecz (drużyna + tally per gracz) — best-effort, gated na auth.uid
  const snap={ game:mpGame, tally:{...mpTally}, members:mpMembers(), hostId:mpMe.id, roomCode:mpCode };
  (async()=>{ const uid=await ensureSession(); if(uid) recordMatch(buildMpRecord(snap)); })();
  mpGame.phase=MP.DONE; mpBroadcast(); mpRender();
}
function mpNewGame(){ mpAck=mpRevealNonce=mpRevealSnap=null; mpGame={hostId:mpMe.id, phase:null}; mpBroadcast(); mpRender(); }

/* ---- render sceny ---- */
let mpConf='normal';            // wybrana pewność przy wrzucaniu typu (etykieta: normal/unsure/sure)
let mpTypingSet=new Set();      // PR3: kto „pisze…" (zasilane ulotnym broadcastem „typing")
let mpTypingTimers={};          // id → timeout wygaszający stan „pisze" po ~3 s
let mpLastTyping=0;             // throttle wysyłki własnego „typing" (max raz / 1.5 s)
let mpChatLog=[];               // PR2: feed czatu (klient-side, z broadcastów „say") — ring buffer
let mpPlaySkin=null;            // dla której skórki zbudowany scaffold gry (fazy/czat)
let mpPlaySub=null;             // dla którego pod-stanu fazy zbudowany scaffold (sluchaj/kombinuj)
let mpSub='sluchaj';            // PR4: klient-lokalny pod-stan fazy PLAY w skórce „fazy"
let mpSubTimer=null;            // auto-przejście słuchaj → kombinuj (żeby nikt nie utknął)
let mpComposerMode='chat';      // PR4: tryb composera @odp w skórce czat (chat/typ)
// skórka = preferencja klienta (czysty render); migracja starej nazwy „kolumny" → „fazy"
const mpSkin = ()=>{ const v=localStorage.getItem('stacjaUI'); return v==='kolumny'?'fazy':(v||'fazy'); };
function mpSetSkin(v){ localStorage.setItem('stacjaUI', v); mpPlaySkin=null; mpPlayRound=null; mpRender(); }
// PR4: przejście słuchaj → kombinujcie (klient-lokalne, prezentacja)
function mpGoKombinuj(){ if(mpSubTimer){ clearTimeout(mpSubTimer); mpSubTimer=null; } mpSub='kombinuj'; mpRender(); }

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
  // zachowaj migawkę odsłony (raz na pytanie) — by każdy mógł zostać na niej we własnym tempie
  if(g.phase===MP.REVEAL && g.reveal && mpRevealNonce!==g.playNonce){
    mpRevealNonce=g.playNonce;
    mpRevealSnap={ reveal:g.reveal, head, isLast:(g.si>=g.slots.length-1 && g.qi>=QPC-1) };
  }
  // dopóki TEN klient nie kliknął „dalej" — pokazuj wynik, nawet gdy host już ruszył dalej
  if(mpRevealPending()){ st.innerHTML=mpRenderRevealCard(mpRevealSnap); return; }
  switch(g.phase){
    case MP.LOADING: st.innerHTML=mpRenderLoading(head); return;
    case MP.ARMING:  st.innerHTML=mpRenderArming(g, head); return;
    case MP.NETERR:  st.innerHTML=mpRenderNetErr(g, head); return;
    case MP.NOLYRIC: st.innerHTML=mpRenderNoLyric(head); return;
    case MP.PLAY:    mpRenderPlay(g, head, st); return;
    case MP.REVEAL:  st.innerHTML=mpRenderWaitNext(head); return;   // już kliknąłem „dalej" — czekam na resztę
    case MP.DONE:    st.innerHTML=mpRenderDone(g, head); return;
  }
}
// pasek emotek + krótka wiadomość — wspólny dla gry, wyniku i czekania
function mpReactsBarHTML(){
  return `<div class="mp-reacts">${REACTIONS.map(e=>`<button onclick="mpReact('${e}')">${e}</button>`).join('')}</div>
    <div class="mp-saybar"><input id="mpSayIn" maxlength="32" placeholder="napisz coś krótkiego…" onkeydown="if(event.key==='Enter')mpSay()"><button onclick="mpSay()">Wyślij</button></div>`;
}

const mpRenderLoading = (head)=> `<div class="mp-deck">${head}<div class="mp-state">host losuje utwór…</div></div>`;
const mpRenderArming = (g, head)=>{
  const rc=g.readyCount||0, rt=g.readyTotal||mpMembers().length;
  return `<div class="mp-deck">${head}<div class="mp-state">⏳ czekamy na graczy… <b>${rc}/${rt}</b> gotowych</div><div class="mp-state" style="opacity:.7">pytanie ruszy równo u wszystkich</div>${mpReactsBarHTML()}</div>`;
};
// klient już kliknął „dalej" i czeka, aż reszta też przejdzie do następnego pytania
const mpRenderWaitNext = (head)=>{
  const rc=(mpGame&&mpGame.readyCount)||0, rt=(mpGame&&mpGame.readyTotal)||mpMembers().length;
  return `<div class="mp-deck">${head}<div class="mp-state">✓ idziesz dalej… <b>${rc}/${rt}</b> gotowych</div><div class="mp-state" style="opacity:.7">następne pytanie ruszy, gdy wszyscy przejdą dalej</div>${mpReactsBarHTML()}</div>`;
};
const mpRenderNetErr = (g, head)=>{
  const msg = g.netReason==='empty' ? 'Brak zajawek dla tej kategorii — spróbuj ponownie albo zmień kategorię.' : 'Brak połączenia z iTunes (limit zapytań albo blokada sieci). Odczekaj minutę i spróbuj ponownie.';
  return `<div class="mp-deck">${head}<div class="mp-state" style="color:var(--red)">${msg} ${mpHost?'<br><button class="mp-btn ghost" onclick="mpHostNewRound()">spróbuj ponownie</button>':''}</div></div>`;
};
const mpRenderNoLyric = (head)=> `<div class="mp-deck">${head}<div class="mp-state" style="color:var(--red)">Brak tekstów do lektora w tej kategorii (songs[] w categories.js).</div></div>`;

/* --- faza gry: małe budowniki HTML + częściowa aktualizacja (nie czyść pól) --- */
// pasek osób: gałka + stan (myśli/pisze/wrzucił/niepewny/pewniak/pas)
const ROSTER_ICON={ idle:'·', type:'···', ans:'✓', unsure:'?', sure:'🍺', pass:'🤚' };
function mpRosterHTML(g){
  return mpMembers().map(m=>{
    const stt=rosterState(g, m.id, mpTypingSet);
    const av=escapeHtml((m.name||'?').slice(0,1).toUpperCase());
    return `<div class="mp-pl ${stt}${m.id===mpMe.id?' you':''}"><span class="av">${av}</span>${escapeHtml(m.name)}<span class="s">${ROSTER_ICON[stt]}</span></div>`;
  }).join('');
}
// tablica kolumnami: osobne głosowanie na każdy slot (tytuł / wykonawca / …)
function mpSlotsHTML(g){
  const slots=g.answerSlots||slotsFor();
  return `<div class="mp-slots">${slots.map(s=>{
    const cands=candidatesForSlot(g, s.key);
    const myVal=myVoteForSlot(g, s.key, mpMe.id);
    const rows = cands.length ? cands.map((c,i)=>{
      const isTop=i===0 && c.votes.length>0;
      const voted = myVal && norm(myVal)===norm(c.value);
      const tag = c.tag==='sure'?'<span class="mp-ct sure">🍺</span>':(c.tag==='unsure'?'<span class="mp-ct unsure">?</span>':'<span class="mp-ct"></span>');
      return `<div class="mp-cand${isTop?' top':''}"><span class="cv">${escapeHtml(c.value)}</span>${tag}<button class="mp-vt${voted?' on':''}" data-v="${escapeHtml(c.value)}" onclick="mpVote('${s.key}', this.dataset.v)">👍 ${c.votes.length}</button></div>`;
    }).join('') : `<div class="mp-state" style="opacity:.55;padding:6px 2px">— brak —</div>`;
    return `<div class="mp-slotcol"><div class="mp-slot-h">${escapeHtml(s.label)} — głosuj</div>${rows}</div>`;
  }).join('')}</div>`;
}
// „odpowiedź drużyny" = górka głosów w każdym slocie (miks najlepszych pól)
function mpTeamHTML(g){
  const ta=teamAnswer(g), slots=g.answerSlots||slotsFor();
  const any=slots.some(s=>ta[s.key]);
  const parts=slots.map(s=> ta[s.key] ? escapeHtml(ta[s.key]) : '—');
  return `<div class="lab">odpowiedź drużyny</div>
    <div class="ans">${any?parts.join(' · '):'— wrzućcie i przegłosujcie —'}</div>`;
}
// wybór pewności przy wrzucaniu typu (etykieta: roster + tag kandydata)
function mpConfHTML(){
  const opt=(v,label,cls)=>`<button class="mp-cf ${cls}${mpConf===v?' on':''}" onclick="mpSetConf('${v}')">${label}</button>`;
  return `<span class="c-lab">pewność:</span>${opt('normal','zwykła','')}${opt('unsure','niepewny','u')}${opt('sure','🍺 pewniak','s')}`;
}
// pewniak dotyczy ODPOWIEDZI DRUŻYNY (top), nie pojedynczej propozycji (#11)
function mpPewniakHTML(g){
  const iAmSure=(g.sure||[]).some(s=>s.id===mpMe.id);
  const sureNames=(g.sure||[]).map(s=>escapeHtml(s.name)).join(', ');
  return `<button class="mp-sure${iAmSure?' on':''}" onclick="mpSend({type:'sure'})" title="pewniak dotyczy odpowiedzi drużyny">🍺 pewniak${iAmSure?' ✓':''}</button>
    <span class="mp-state" style="margin:0">${sureNames?('pewni odpowiedzi: '+sureNames):'pewny odpowiedzi drużyny? postaw 🍺'}</span>`;
}
// „pas" — kto już nic nie doda (sygnał dla hosta/stołu: ten gracz skończył myśleć)
function mpPassHTML(g){
  const passed=g.passed||[]; const total=mpMembers().length;
  const iPassed=passed.some(p=>p.id===mpMe.id);
  const names=passed.map(p=>escapeHtml(p.name)).join(', ');
  return `<button class="mp-pass${iPassed?' on':''}" onclick="mpSend({type:'pass'})" title="nic już nie dodam do tej rundy">🤚 pas${iPassed?' ✓':''}</button>
    <span class="mp-state" style="margin:0">${passed.length?`spasowali (${passed.length}/${total}): ${names}`:'nie wiesz? kliknij „pas”'}</span>`;
}
// przełącznik skórki (A/B): per-klient, czysty render nad tym samym stanem
function mpSkinToggleHTML(cur){
  return `<div class="mp-skin"><span class="mp-skin-lab">układ</span>
    <button class="mp-skinbtn${cur==='fazy'?' on':''}" onclick="mpSetSkin('fazy')">fazy</button>
    <button class="mp-skinbtn${cur==='czat'?' on':''}" onclick="mpSetSkin('czat')">czat</button></div>`;
}
const mpKnobHTML = (id='mpKnob', cls='mp-knob')=> `<button class="${cls}" id="${id}" onclick="mpPlayLocal()" aria-label="Odtwórz"><svg id="mpKnobIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>`;
const mpLockBtnHTML = (ghost)=> mpHost ? `<button class="mp-btn${ghost?' ghost':''}" style="width:100%;margin-top:6px" onclick="mpLock()">Zatwierdź odpowiedź drużyny ✓</button>` : '';
const mpLyricHTML = (g)=> g.mode==='lektor'&&g.lyric ? `<div class="lyric-box"><span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>${escapeHtml(g.lyric)}</div>` : '';
function mpChatFeedHTML(){ return mpChatLog.map(c=>`<div class="mp-cm"><b>${escapeHtml(c.byName||'')}</b>${escapeHtml(c.text)}</div>`).join(''); }
// pasek faz (rail): słuchaj → kombinujcie → odsłona
function mpRailHTML(active){
  const order=['sluchaj','kombinuj','odslona'];
  const meta={ sluchaj:['🎧','słuchaj'], kombinuj:['🧠','kombinujcie'], odslona:['👁','odsłona'] };
  const ai=order.indexOf(active);
  return `<div class="mp-rail">`+order.map((k,i)=>{
    const cls = i<ai?'done':(i===ai?'on':'');
    return `<div class="mp-rnode ${cls}"><div class="mp-rdot">${meta[k][0]}</div><div class="mp-rlab">${meta[k][1]}</div></div>`;
  }).join('<div class="mp-rseg"></div>')+`</div>`;
}
// legenda stanów rostera (skórka czat — nad kreską)
function mpLegendHTML(){
  return `<div class="mp-legend"><span>🍺 pewniak</span><span>✓ zwykła</span><span style="color:#9B4DDB">? niepewny</span><span>··· pisze</span><span>🤚 pas</span><span>· myśli</span></div>`;
}
// formularz typowania per slot (wspólny dla fazy/kombinuj)
function mpFormHTML(g){
  const slots=g.answerSlots||slotsFor();
  const inputs=slots.map(s=>`<input id="mpProp_${s.key}" placeholder="${escapeHtml(s.label)}" oninput="mpTypingPing()">`).join('');
  const cols=slots.map(()=>'1fr').join(' ')+' auto';
  return `<div class="mp-form" style="grid-template-columns:${cols}">${inputs}<button onclick="mpPropose()">Wrzuć</button></div>`;
}
// blok typowania+głosowania (kolumny, team, pewniak/pas) — wspólny
function mpGuessBlockHTML(g, withForm){
  return `${withForm?mpFormHTML(g):''}
    <div class="mp-conf" id="mpConf">${mpConfHTML()}</div>
    <div class="mp-board" id="mpBoard"></div>
    <div class="mp-team" id="mpTeam"></div>
    <div class="mp-pewniak" id="mpPewniak"></div>
    <div class="mp-pewniak" id="mpPass"></div>
    ${mpLockBtnHTML(false)}`;
}
// composer „@odp" (czat): pole czatu ⇄ chipy slotów; bez @ → czat, z @/typem → propozycja
function mpComposerHTML(g){
  const slots=g.answerSlots||slotsFor();
  const chips=slots.map((s,i)=>`${i?'<span class="mp-sep">,</span>':''}<input id="mpTyp_${s.key}" class="mp-slotchip" placeholder="${escapeHtml(s.label)}" oninput="mpTypingPing()" onkeydown="if(event.key==='Enter')mpComposerSend()">`).join('');
  return `<div class="mp-composer">
      <div class="mp-compfield">
        <div class="mp-cwrap" id="mpCompChat"><input id="mpChatIn" maxlength="64" autocomplete="off" placeholder="napisz… (albo @ — wrzuć typ)" oninput="mpChatInput()" onkeydown="if(event.key==='Enter')mpComposerSend()"></div>
        <div class="mp-cwrap" id="mpCompTyp" style="display:none"><span class="mp-at">@</span>${chips}</div>
      </div>
      <button id="mpCompBtn" onclick="mpComposerSend()">wyślij</button>
    </div>
    <div class="mp-comptoggle"><button class="mp-cf" id="mpTypToggle" onclick="mpComposerToggle()">✍️ typ</button></div>`;
}

// SKÓRKA „fazy" — pasek faz + przepływ słuchaj → kombinujcie
function mpScaffoldFazy(g, head){
  const top=`${mpSkinToggleHTML('fazy')}
    <div class="mp-deck">${head}<div class="mp-state" id="mpCountdown"></div></div>
    ${mpRailHTML(mpSub==='sluchaj'?'sluchaj':'kombinuj')}
    <div class="mp-roster" id="mpRoster"></div>`;
  if(mpSub==='sluchaj'){
    return `${top}
      <div class="mp-deck">${mpKnobHTML()}
        <div class="mp-state" id="mpPlayStatus">${g.mode==='lektor'?'lektor czyta u każdego':'posłuchaj uważnie'} · stuknij, by powtórzyć</div></div>
      ${mpLyricHTML(g)}
      <button class="mp-btn" style="width:100%;margin-top:6px" onclick="mpGoKombinuj()">gotowe, kombinujemy →</button>
      ${mpReactsBarHTML()}`;
  }
  return `${top}
    <div class="mp-deck mp-deck-slim">${mpKnobHTML('mpKnob','mp-knob mp-knob-sm')}
      <div class="mp-state" id="mpPlayStatus">${g.mode==='lektor'?'lektor czyta':'gra u każdego'} · stuknij, by powtórzyć</div></div>
    ${mpLyricHTML(g)}
    ${mpGuessBlockHTML(g, true)}${mpReactsBarHTML()}`;
}
// SKÓRKA „czat" — strumień: bąbel „utwór leci" (replay) + feed + composer @odp na dole
function mpScaffoldChat(g, head){
  return `${mpSkinToggleHTML('czat')}
    <div class="mp-deck">${head}<div class="mp-state" id="mpCountdown"></div></div>
    <div class="mp-roster mp-roster-nb" id="mpRoster"></div>
    ${mpLegendHTML()}
    <button class="mp-sys" id="mpKnob" onclick="mpPlayLocal()"><svg id="mpKnobIcon" class="mp-sys-ic" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg><span id="mpPlayStatus">${g.mode==='lektor'?'lektor czyta':'utwór leci'} — stuknij, by powtórzyć</span></button>
    ${mpLyricHTML(g)}
    <div class="mp-chatfeed" id="mpChatFeed"></div>
    <div class="mp-board" id="mpBoard"></div>
    <div class="mp-team" id="mpTeam"></div>
    <div class="mp-pewniak" id="mpPewniak"></div>
    <div class="mp-pewniak" id="mpPass"></div>
    ${mpLockBtnHTML(true)}
    ${mpComposerHTML(g)}
    <div class="mp-chint">z <b>@</b> wrzucasz typ · bez @ piszesz na czat</div>
    <div class="mp-hr"></div>
    <div class="mp-reacts">${REACTIONS.map(e=>`<button onclick="mpReact('${e}')">${e}</button>`).join('')}</div>`;
}
// odśwież dynamiczne części (wspólne dla obu skórek) — bez ruszania pól wpisywanych
function mpRefreshDynamic(g){
  const set=(id,html)=>{ const el=$m(id); if(el) el.innerHTML=html; };
  set('mpRoster', mpRosterHTML(g));
  set('mpBoard', mpSlotsHTML(g));
  set('mpTeam', mpTeamHTML(g));
  set('mpPewniak', mpPewniakHTML(g));
  set('mpPass', mpPassHTML(g));
  const feed=$m('mpChatFeed'); if(feed){ feed.innerHTML=mpChatFeedHTML(); feed.scrollTop=feed.scrollHeight; }
}
function mpRenderPlay(g, head, st){
  const skin=mpSkin();
  const newRound = mpPlayRound!==g.playNonce;
  if(newRound){                                  // nowe pytanie → start od „słuchaj", zeruj „pisze"
    mpClearTyping(); mpComposerMode='chat';
    mpSub='sluchaj';
    if(mpSubTimer) clearTimeout(mpSubTimer);
    mpSubTimer=setTimeout(()=>{ if(mpSub==='sluchaj' && mpGame && mpGame.phase===MP.PLAY) mpGoKombinuj(); }, 9000);
  }
  // przebuduj scaffold przy nowej rundzie / zmianie skórki / zmianie pod-stanu fazy / braku korzenia
  if(newRound || mpPlaySkin!==skin || (skin==='fazy' && mpPlaySub!==mpSub) || !$m('mpRoster')){
    mpPlayRound=g.playNonce; mpPlaySkin=skin; mpPlaySub=mpSub;
    st.innerHTML = skin==='czat' ? mpScaffoldChat(g, head) : mpScaffoldFazy(g, head);
  }
  mpRefreshDynamic(g);
  mpTickTimer();
}

// ekran wyniku z migawki — KAŻDY klika „dalej" sam (to jego sygnał gotowości)
function mpRenderRevealCard(snap){
  const r=snap.reveal, head=snap.head;
  const rail = mpSkin()==='fazy' ? mpRailHTML('odslona') : '';
  return `<div class="mp-deck">${head}</div>${rail}
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
      ${mpReactsBarHTML()}
      <button class="next" onclick="mpAdvance()">${snap.isLast?'Wynik końcowy →':'Dalej →'}</button>
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
  const slots=(mpGame&&mpGame.answerSlots)||slotsFor();
  const values={}; let any=false;
  slots.forEach(s=>{ const el=$m('mpProp_'+s.key); const v=el?el.value.trim():''; if(v){ values[s.key]=v; any=true; } });
  if(!any) return;
  mpSend({type:'propose', conf:mpConf, values});
  slots.forEach(s=>{ const el=$m('mpProp_'+s.key); if(el) el.value=''; });
  mpConf='normal'; if($m('mpConf')) $m('mpConf').innerHTML=mpConfHTML();
}
function mpVote(slot, value){ mpSend({type:'vote', slot, value}); }
function mpSetConf(v){ mpConf=v; if($m('mpConf')) $m('mpConf').innerHTML=mpConfHTML(); }

function mpTickTimer(){
  const el=$m('mpCountdown');
  if(!mpGame || mpGame.phase!==MP.PLAY || !mpGame.endsAt){ if(el) el.textContent=''; return; }
  const rem=Math.max(0, mpGame.endsAt - Date.now());
  const s=Math.ceil(rem/1000);
  if(el){ el.textContent='⏱ '+s+' s'; el.style.color = s<=10 ? 'var(--red)' : 'var(--amber)'; }
  if(rem<=0 && mpHost && !mpAutoLocked && mpGame.phase===MP.PLAY){ mpLock(); }
}
function mpReact(e){ mpFloatEmoji(e, mpMe.name); if(mpCh) mpCh.send({type:'broadcast',event:'react',payload:{emoji:e, byName:mpMe.name, by:mpMe.id}}); }
function mpFloatEmoji(emoji, byName){      // #9: pokaż KTO wysłał emotkę
  let fx=$m('mpFx');
  if(!fx){ fx=document.createElement('div'); fx.id='mpFx'; document.body.appendChild(fx); }
  const s=document.createElement('div'); s.className='mp-float';
  s.innerHTML=`<span class="e">${emoji}</span>${byName?`<span class="nm">${escapeHtml(byName)}</span>`:''}`;
  s.style.left=(8+Math.random()*78)+'%';
  fx.appendChild(s); setTimeout(()=>s.remove(), EMOJI_TTL_MS);
}
// #10: krótka wiadomość — dymek lecący przez ekran + wpis w feed czatu (skórka „czat")
function mpPushChat(byName, text){
  mpChatLog.push({byName, text}); if(mpChatLog.length>40) mpChatLog.shift();
  const feed=$m('mpChatFeed'); if(feed){ feed.innerHTML=mpChatFeedHTML(); feed.scrollTop=feed.scrollHeight; }
}
function mpDoSay(text){
  const t=(text||'').trim().slice(0,64); if(!t) return;
  mpPushChat(mpMe.name, t);
  mpFloatSay(t, mpMe.name);   // pokaż od razu u siebie (bez round-tripu)
  if(mpCh) mpCh.send({type:'broadcast',event:'say',payload:{text:t, byName:mpMe.name, by:mpMe.id}});
}
function mpSay(){ const el=$m('mpSayIn'); if(!el) return; mpDoSay(el.value); el.value=''; }
// composer „@odp" (skórka czat): @prefix → typ (pola po przecinku), inaczej → czat
// przełącz composer czat ⇄ typ (chipy slotów)
function mpSetComposerMode(m){
  mpComposerMode=m;
  const chat=$m('mpCompChat'), typ=$m('mpCompTyp'), tog=$m('mpTypToggle'), btn=$m('mpCompBtn');
  if(chat) chat.style.display = m==='typ'?'none':'flex';
  if(typ)  typ.style.display  = m==='typ'?'flex':'none';
  if(tog)  tog.textContent    = m==='typ'?'💬 czat':'✍️ typ';
  if(btn)  btn.textContent    = m==='typ'?'wrzuć':'wyślij';
}
function mpComposerToggle(){
  mpSetComposerMode(mpComposerMode==='typ'?'chat':'typ');
  const first=$m('mpChatIn'), slots=(mpGame&&mpGame.answerSlots)||slotsFor();
  const focusEl = mpComposerMode==='typ' ? $m('mpTyp_'+slots[0].key) : first;
  if(focusEl) focusEl.focus();
}
// wpisanie „@" w polu czatu morfuje composer w chipy slotów (treść po @ rozbija po przecinku)
function mpChatInput(){
  mpTypingPing();
  const el=$m('mpChatIn'); if(!el || el.value[0]!=='@') return;
  const slots=(mpGame&&mpGame.answerSlots)||slotsFor();
  const parts=el.value.slice(1).split(',');
  mpSetComposerMode('typ');
  slots.forEach((s,i)=>{ const c=$m('mpTyp_'+s.key); if(c) c.value=(parts[i]||'').trim(); });
  el.value='';
  const first=$m('mpTyp_'+slots[0].key); if(first) first.focus();
}
function mpComposerSend(){
  const slots=(mpGame&&mpGame.answerSlots)||slotsFor();
  if(mpComposerMode==='typ'){
    const values={}; let any=false;
    slots.forEach(s=>{ const c=$m('mpTyp_'+s.key); const v=c?c.value.trim():''; if(v){ values[s.key]=v; any=true; } });
    if(any){ mpSend({type:'propose', conf:mpConf, values}); mpConf='normal'; if($m('mpConf')) $m('mpConf').innerHTML=mpConfHTML(); }
    slots.forEach(s=>{ const c=$m('mpTyp_'+s.key); if(c) c.value=''; });
    mpSetComposerMode('chat');
    return;
  }
  const el=$m('mpChatIn'); if(!el) return;
  const raw=el.value.trim(); if(!raw){ return; }
  if(raw[0]==='@' || raw[0]==='/'){      // fallback (np. wklejone) — parsuj jako typ
    const parts=raw.slice(1).split(',').map(x=>x.trim());
    const values={}; let any=false;
    slots.forEach((s,i)=>{ if(parts[i]){ values[s.key]=parts[i]; any=true; } });
    if(any){ mpSend({type:'propose', conf:mpConf, values}); mpConf='normal'; if($m('mpConf')) $m('mpConf').innerHTML=mpConfHTML(); }
  } else {
    mpDoSay(raw);
  }
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
/* PR3: sygnał „pisze…" — ulotny broadcast (poza host-authority), throttle + wygaszanie */
function mpTypingPing(){
  const now=Date.now();
  if(now-mpLastTyping < 1500) return;          // max raz na 1.5 s
  mpLastTyping=now;
  if(mpCh && mpGame && mpGame.phase===MP.PLAY) mpCh.send({type:'broadcast',event:'typing',payload:{by:mpMe.id, byName:mpMe.name}});
}
function mpMarkTyping(id){
  mpTypingSet.add(id);
  if(mpTypingTimers[id]) clearTimeout(mpTypingTimers[id]);
  mpTypingTimers[id]=setTimeout(()=>{ mpTypingSet.delete(id); delete mpTypingTimers[id]; mpRefreshRoster(); }, 3000);
  mpRefreshRoster();
}
function mpRefreshRoster(){ if(mpGame && mpGame.phase===MP.PLAY){ const el=$m('mpRoster'); if(el) el.innerHTML=mpRosterHTML(mpGame); } }
function mpClearTyping(){ mpTypingSet.clear(); Object.values(mpTypingTimers).forEach(clearTimeout); mpTypingTimers={}; }

/* autostart lobby gdy w URL jest ?room= */
if(new URLSearchParams(location.search).get('room')){ showScreen('mp'); $m('mpCode').value=new URLSearchParams(location.search).get('room').toUpperCase(); }

/* ============ most do HTML: app.js to moduł ES (własny scope), więc handlery
   wstrzykiwane w stringach onclick="" muszą żyć na window. ============ */
Object.assign(window, {
  mpHostNewRound, mpLock, mpNewGame, mpNext, mpPlayLocal, mpPropose, mpVote, mpSetConf,
  mpRandomPick, mpReact, mpSay, mpSend, mpSetRounds, mpSetTimer, mpSetSkin, mpComposerSend, mpTypingPing,
  mpGoKombinuj, mpComposerToggle, mpChatInput,
  mpStart, mpToggleCat, mpToggleMode, mpAdvance,
});
