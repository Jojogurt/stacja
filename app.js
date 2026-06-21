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
import { teamCreate, teamJoin, teamLeave, myTeams, teamMembers, friendAdd, friendRespond, friendsList, pendingFriends, meInfo, authInfo, linkOAuth, linkEmail } from './adapters-web/supabase.js';
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
/* wspólny rdzeń importu — fetch z edge function „spotify", zapis do localStorage, merge do ALL_CATS.
   Zwraca {key,name,count} albo rzuca błędem. Używany przez solo (plImport) i MP (mpPlImport). */
async function plFetch(url){
  const cfg=window.STACJA_CONFIG||{};
  if(!cfg.supabaseUrl){ throw new Error('Brak połączenia z serwerem.'); }
  const r=await fetch(cfg.supabaseUrl+'/functions/v1/spotify?url='+encodeURIComponent(url), {headers:cfg.supabaseKey?{apikey:cfg.supabaseKey}:{}});
  const d=await r.json();
  if(!r.ok || d.error){ throw new Error(d.error||('http '+r.status)); }
  const songs=(d.tracks||[]).filter(t=>t.title&&t.artist);
  if(!songs.length){ throw new Error('Pusta lub niepubliczna playlista.'); }
  const key=PL_PREFIX+Math.random().toString(36).slice(2,8);
  const pls=plLoad(); pls[key]={label:d.name||'Playlista', songs, kind:'playlist'}; plSave(pls);
  plMerge();
  return { key, name:d.name||'', count:songs.length };
}
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
  const rh=document.getElementById('revealHead');   // design: zielony/czerwony nagłówek wyniku
  if(rh){
    const both=okTitle&&okArtist, cls=both?'win':((okTitle||okArtist)?'part':'fail');
    const ic=both?'✓':((okTitle||okArtist)?'≈':'✗');
    const tt=both?'Dobrze!':((okTitle||okArtist)?'Prawie!':'Pudło');
    const sub=both?'Tytuł i wykonawca trafione':(okTitle?'Tytuł OK — wykonawca nie':(okArtist?'Wykonawca OK — tytuł nie':'Następnym razem'));
    rh.className='rv-shead '+cls;
    rh.innerHTML=`<span class="ic">${ic}</span><span class="tx"><b>${tt}</b><small>${sub}</small></span>${streak>1?`<span class="strk">🔥 ${streak}</span>`:''}`;
  }
  document.getElementById('reveal').classList.add('show');
  if(okTitle && okArtist) confetti();   // pełne trafienie → confetti
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
// confetti przy trafieniu (lekkie, czysty DOM/CSS; pomijane przy reduce-motion)
function confetti(n=90){
  try{ if(matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
  let fx=document.getElementById('confettiFx');
  if(!fx){ fx=document.createElement('div'); fx.id='confettiFx'; document.body.appendChild(fx); }
  const colors=['#58CC02','#1CB0F6','#FFC800','#FF4B4B','#CE82FF'];
  for(let i=0;i<n;i++){
    const p=document.createElement('i'); p.className='cf';
    p.style.left=Math.random()*100+'%';
    p.style.background=colors[i%colors.length];
    p.style.setProperty('--x',(Math.random()*220-110)+'px');
    p.style.setProperty('--r',(Math.random()*720-360)+'deg');
    p.style.animationDelay=(Math.random()*0.2).toFixed(2)+'s';
    p.style.animationDuration=(1.6+Math.random()*1.2).toFixed(2)+'s';
    if(i%3===0) p.style.borderRadius='50%';
    fx.appendChild(p); setTimeout(()=>p.remove(), 3200);
  }
}
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
let mpRoomStage='wait';     // przed grą: 'wait' = poczekalnia (06), 'build' = picker „ułóż mecz" (host)
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
const SCR_HEAD={ solo:'Ułóż mecz', liga:'Drużyna i znajomi', profil:'Profil' };
function showScreen(s){
  document.body.classList.remove('menu','solo','mp','liga','profil'); document.body.classList.add(s);
  if(s==='mp') mpPrefillName();
  const tt=$m('scrTitle'); if(tt) tt.textContent=SCR_HEAD[s]||'';
}
$m('goSolo').onclick=()=>{ showScreen('solo'); };
// przełącznik układu gry MP (kolumny/czat) — przeniesiony na ekran główny (ustawienie)
(function wireSkinSeg(){
  const seg=document.getElementById('skinSeg'); if(!seg) return;
  const sync=()=>{ const cur=localStorage.getItem('stacjaUI')==='czat'?'czat':'kolumny'; seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.skin===cur)); };
  seg.querySelectorAll('button').forEach(b=> b.onclick=()=>{ mpSetSkin(b.dataset.skin); sync(); });
  sync();
})();

/* ---- Drużyna / Znajomi (zastępuje Ligę) + Profil ---- */
$m('goLiga').onclick=()=>{ showScreen('liga'); renderDruzyna(); };
$m('goProfil').onclick=()=>{ showScreen('profil'); renderProfil(); };

let dzMe=null;   // {id, handle, emoji, friend_code}
const DZ_OAUTH=false;   // Google/Apple ukryte do czasu konfiguracji kluczy w Supabase (zostaje e-mail)

/* ---- ksywa: jedna tożsamość dla profilu i lobby MP ----
   Brak ksywy → generujemy zabawną, „muzyczną" (np. „głuchy suseł”) i zapisujemy.
   Pary dobrane tak, by przymiotnik (rodzaj męski) zgadzał się ze zwierzęciem i mieścił w maxlength=16. */
let myHandle=null;
const HANDLE_ADJ=['głuchy','basowy','zgrany','niemy','dęty','funkowy','jazzowy','punkowy','technowy','discowy','rapowy','fałszywy','kręcony','bujający','skoczny','rzewny','gitarowy','winylowy','chórowy','rytmiczny'];
const HANDLE_ANIM=['suseł','borsuk','kojot','łoś','jeż','bóbr','kret','chomik','tapir','lemur','manat','żuraw','dudek','narwal','mors','ryś','karp','bażant','gawron','słowik','szpak','kos','paw'];
function funnyHandle(){
  const a=HANDLE_ADJ[Math.floor(Math.random()*HANDLE_ADJ.length)];
  const n=HANDLE_ANIM[Math.floor(Math.random()*HANDLE_ANIM.length)];
  const h=a+' '+n;
  return h.length<=16 ? h : n;   // bezpiecznik na maxlength
}
// zwróć stabilną ksywę: z profilu, a jak brak — wygeneruj i zapisz (idempotentne, cache w myHandle)
async function ensureHandle(){
  if(myHandle) return myHandle;
  await ensureSession();
  const p=await fetchProfile();
  let h=p&&p.handle;
  if(!h || h==='gracz'){ h=funnyHandle(); setHandle(h); }
  myHandle=h; return h;
}
// lobby MP: wstaw ksywę do pola, jeśli puste (nie nadpisuje tego, co gracz wpisał)
async function mpPrefillName(){
  const inp=$m('mpName'); if(!inp || inp.value.trim()) return;
  const h=await ensureHandle();
  if(h && !inp.value.trim()){ inp.value=h; mpMe.name=mpMe.name||h; }
}
async function renderDruzyna(){
  const el=$m('druzynaBody'); if(!el) return;
  el.innerHTML='<div class="liga-empty">ładowanie…</div>';
  try{
  await Promise.race([ensureSession(), new Promise(r=>setTimeout(r,5000))]);   // nie blokuj w nieskończoność (np. gdy hCaptcha się wiesza)
  const [meR, teamsR, friR, penR, auth] = await Promise.all([meInfo(), myTeams(), friendsList(), pendingFriends(), authInfo()]);
  const noAuth = (meR.error && !meR.data);   // brak sesji (anon-auth nie ruszył) — pokaż baner, ale NIE chowaj ekranu
  const notice = noAuth ? `<div class="dz-acct" style="background:#FFF1F1;border-color:var(--red);color:#E63946">⚠️ Nie udało się zalogować — drużyny i znajomi wymagają działającego logowania anonimowego (Supabase → Auth → „Allow anonymous sign-ins" + ew. hCaptcha). Akcje poniżej będą zablokowane do czasu naprawy.</div>` : '';
  dzMe = (meR.data&&meR.data[0]) || null;
  const teams = teamsR.data||[], friends = friR.data||[], pending = penR.data||[];
  const av=(n,c)=>`<span class="dz-av" style="background:${mpAvatarColor(n)}">${escapeHtml((n||'?').slice(0,1).toUpperCase())}</span>`;

  // === DRUŻYNA ===
  const teamCards = teams.map(t=>`
    <div class="dz-team">
      <div class="dz-team-top"><span class="em">${escapeHtml(t.emoji||'🍺')}</span>
        <span class="nm"><b>${escapeHtml(t.name)}</b><small>${t.members} os. · kod <b>${escapeHtml(t.code)}</b></small></span></div>
      <div class="dz-team-btns">
        <button class="dz-play" onclick="dzPlay()">🎮 Zagraj z drużyną</button>
        <button class="dz-mini" onclick="dzCopy('${escapeHtml(t.code)}')">📋 kod</button>
        <button class="dz-mini" onclick="dzLeave('${t.id}')">wyjdź</button>
      </div>
    </div>`).join('');
  const teamSection = `
    <div class="dz-lbl">Twoja drużyna</div>
    ${teamCards || '<div class="dz-empty">Nie masz jeszcze drużyny — stwórz albo dołącz po kodzie.</div>'}
    <div class="dz-row2">
      <input id="dzName" maxlength="20" placeholder="nazwa drużyny">
      <input id="dzEmoji" maxlength="2" placeholder="🍺" value="🍺" class="dz-emoji">
      <button class="dz-go" onclick="dzCreate()">Stwórz</button>
    </div>
    <div class="dz-row2">
      <input id="dzJoin" maxlength="6" placeholder="KOD DRUŻYNY" style="text-transform:uppercase">
      <button class="dz-go blue" onclick="dzJoin()">Dołącz</button>
    </div>`;

  // === ZNAJOMI ===
  const myCode = dzMe?.friend_code || '—';
  const pendRows = pending.map(p=>`
    <div class="dz-fr"><span class="who">${av(p.handle)}${escapeHtml(p.handle||'gracz')}</span>
      <span class="acts"><button class="dz-yes" onclick="dzRespond(${p.req_id},true)">✓</button><button class="dz-no" onclick="dzRespond(${p.req_id},false)">✗</button></span></div>`).join('');
  const friendRows = friends.map(f=>`<div class="dz-fr"><span class="who">${av(f.handle)}${escapeHtml(f.handle||'gracz')}</span><span class="code">${escapeHtml(f.friend_code||'')}</span></div>`).join('')
    || '<div class="dz-empty">Brak znajomych — dodaj kogoś po kodzie.</div>';
  const friendSection = `
    <div class="dz-lbl">Twój kod znajomego</div>
    <div class="dz-mycode"><b>${escapeHtml(myCode)}</b><button class="dz-mini" onclick="dzCopy('${escapeHtml(myCode)}')">📋 kopiuj</button></div>
    <div class="dz-row2"><input id="dzFriend" maxlength="6" placeholder="KOD ZNAJOMEGO" style="text-transform:uppercase"><button class="dz-go" onclick="dzAddFriend()">Dodaj</button></div>
    ${pending.length?`<div class="dz-lbl">Zaproszenia (${pending.length})</div>${pendRows}`:''}
    <div class="dz-lbl">Znajomi</div>
    ${friendRows}`;

  // === KONTO (opcjonalne logowanie) ===
  const oauthRow = DZ_OAUTH ? `<div class="dz-oauth"><button class="dz-prov g" onclick="dzLogin('google')">Google</button><button class="dz-prov a" onclick="dzLogin('apple')">Apple</button></div>` : '';
  const loginSection = (auth && auth.isAnon) ? `
    <div class="dz-lbl">Konto</div>
    <div class="dz-acct">Grasz jako gość — podaj e-mail, żeby drużyny i znajomi działały też na innych urządzeniach.</div>
    <div class="dz-row2"><input id="dzEmail" type="email" placeholder="twój e-mail"><button class="dz-go" onclick="dzLoginEmail()">Wyślij link</button></div>
    ${oauthRow}
    <div class="dz-hint" id="dzMsg">${DZ_OAUTH?'':'Logowanie przez Google / Apple — wkrótce'}</div>`
    : (auth && auth.email ? `<div class="dz-acct ok">✓ Zalogowano: ${escapeHtml(auth.email)}</div>` : '');

  el.innerHTML = notice + teamSection + friendSection + loginSection;
  }catch(e){ el.innerHTML='<div class="liga-empty">Coś poszło nie tak: '+escapeHtml(String(e&&e.message||e))+'<br><small>(prześlij mi ten komunikat)</small></div>'; }
}
function dzMsg(t,err){ const m=$m('dzMsg'); if(m){ m.textContent=t; m.className='dz-hint'+(err?' err':''); } }
async function dzCreate(){ const n=$m('dzName')?.value, e=$m('dzEmoji')?.value; const r=await teamCreate(n,e); if(r.error){ dzMsg('Nie udało się: '+r.error,true); } else renderDruzyna(); }
async function dzJoin(){ const c=$m('dzJoin')?.value; if(!c) return; const r=await teamJoin(c); if(r.error){ dzMsg(r.error==='group_not_found'?'Nie ma takiej drużyny.':r.error,true); } else renderDruzyna(); }
async function dzLeave(id){ await teamLeave(id); renderDruzyna(); }
async function dzAddFriend(){ const c=$m('dzFriend')?.value; if(!c) return; const r=await friendAdd(c); if(r.error){ dzMsg(r.error==='profile_not_found'?'Nie ma takiego kodu.':(r.error==='self'?'To Twój kod 🙂':r.error),true); } else renderDruzyna(); }
async function dzRespond(id,ok){ await friendRespond(id,ok); renderDruzyna(); }
function dzCopy(t){ try{ navigator.clipboard.writeText(t); }catch(e){} }
function dzPlay(){ showScreen('mp'); }
async function dzLogin(prov){ const r=await linkOAuth(prov); if(r.error) dzMsg('Logowanie '+prov+': '+r.error,true); }
async function dzLoginEmail(){ const em=$m('dzEmail')?.value?.trim(); if(!em) return; const r=await linkEmail(em); dzMsg(r.error?('Błąd: '+r.error):'Sprawdź skrzynkę — wysłaliśmy link.',!!r.error); }
Object.assign(window,{ dzCreate, dzJoin, dzLeave, dzAddFriend, dzRespond, dzCopy, dzPlay, dzLogin, dzLoginEmail });

async function renderProfil(){
  const el=$m('profilStats'); el.innerHTML='<div class="profil-empty">ładowanie…</div>';
  await ensureSession();   // gest „Profil" → utwórz sesję/profil, by dało się ustawić ksywkę
  const p=await fetchProfile();
  if(!p){ $m('profilHandle').value=''; el.innerHTML='<div class="profil-empty">Profil niedostępny.<br>Włącz logowanie anonimowe w projekcie Supabase, żeby zapisywać postępy.</div>'; return; }
  if(!p.handle || p.handle==='gracz'){ p.handle=funnyHandle(); setHandle(p.handle); }   // pierwsza wizyta → zabawna ksywa
  myHandle=p.handle;
  $m('profilHandle').value=p.handle;
  const s=p.standing;
  const acc = s.correct&&s.matches ? Math.round(s.correct/(s.matches||1)) : null;
  // nagłówek: awatar + ksywa (design)
  const hd=$m('profilHead');
  if(hd){
    const av=escapeHtml((p.handle||'?').slice(0,1).toUpperCase());
    hd.innerHTML=`<span class="pf-av" style="background:${mpAvatarColor(p.handle)}">${av}</span>
      <div class="pf-name">${escapeHtml(p.handle||'gracz')}</div>`;
  }
  const cats=Object.entries(p.byCat).sort((a,b)=>b[1].n-a[1].n);
  const CATCOL=['var(--green)','var(--blue)','var(--purple)','var(--gold)'];
  const catRows=cats.length? cats.map(([k,v],i)=>{
    const pct=Math.round(v.ok/v.n*100), col=CATCOL[i%CATCOL.length];
    return `<div class="pf-cat"><span class="lbl">${escapeHtml(catLabel(k))}</span>
      <span class="bar"><i style="width:${pct}%;background:${col}"></i></span><span class="pct" style="color:${col}">${pct}%</span></div>`;
  }).join('') : '<div class="profil-empty" style="padding:14px">Brak rozegranych pytań solo.</div>';
  // odznaki: kilka pochodnych ze statystyk + reszta zablokowana (placeholdery — pełny system później)
  const badge=(on,emoji,lab)=>`<div class="pf-badge${on?'':' lock'}"><span>${on?emoji:'🔒'}</span><small>${on?lab:'—'}</small></div>`;
  const badges=[ badge(s.matches>0,'🎵','Pierwszy mecz'), badge(s.matches>=10,'🔥','10 meczów'),
    badge(s.points>=100,'💯','100 pkt'), badge(false,'','') ].join('');
  el.innerHTML=`<div class="pf-stats">
      <div class="pf-st g"><b>${s.matches}</b><small>MECZE</small></div>
      <div class="pf-st b"><b>${s.correct}</b><small>TRAFNE</small></div>
      <div class="pf-st y"><b>${s.points}</b><small>PUNKTY</small></div>
    </div>
    <div class="pf-lbl">Najlepsze kategorie</div>
    ${catRows}
    <div class="pf-lbl">Odznaki</div>
    <div class="pf-badges">${badges}</div>`;
}
$m('profilSave').onclick=async()=>{
  const v=$m('profilHandle').value.trim(); if(!v) return;
  const btn=$m('profilSave'); btn.textContent='…';
  await setHandle(v); myHandle=v; mpMe.name=mpMe.name||v;
  btn.textContent='✓'; setTimeout(()=>btn.textContent='Zapisz',1200);
};
$m('goMp').onclick=()=>{
  stopAudio(); stopSpeech();
  showScreen('mp');
  const pre=new URLSearchParams(location.search).get('room');
  if(pre){ mpSetCode(pre); }
};
$m('toMenu').onclick=()=>{
  if(document.body.classList.contains('mp')){ mpLeave(); }
  stopAudio(); stopSpeech();
  showScreen('menu');
};
$m('mpExit').onclick=()=>{ showScreen('menu'); };

async function mpLeave(){
  if(mpCh){ try{ await mpCh.unsubscribe(); }catch(e){} mpCh=null; }
  if(mpAudio){ try{mpAudio.pause();}catch(e){} }   // element trwały — pauza, nie zeruj
  stopSpeech(); mpStopRev();
  if(mpArmTimer){ clearTimeout(mpArmTimer); mpArmTimer=null; }
  mpReady=new Set(); mpLastArmNonce=null;
  mpAck=mpRevealNonce=mpRevealSnap=null;
  mpCode=null; mpHost=false; mpRoomStage='wait'; mpGame=null; mpHostCurrent=null; mpTally={}; mpLastNonce=null;
  $m('mpRoom').style.display='none'; $m('mpLobby').style.display='';
}

/* ---- tworzenie / dołączanie (ksywa z profilu — bez pola w UI) ---- */
$m('mpCreate').onclick=async()=>{ mpUnlockAudio(); const n=await ensureHandle(); mpMe.name=n; setHandle(n); mpEnterRoom(mpRandCode(), true); };
$m('mpJoin').onclick=()=>mpJoinFromCode();

// 4-boksowy kod (design 05): odczyt/zapis + auto-przeskok + wklejanie linku
function mpReadCode(){ return Array.from(document.querySelectorAll('#mpCodeBoxes .lb-cell')).map(c=>c.value).join('').toUpperCase().slice(0,4); }
function mpSetCode(str){
  const v=(String(str||'').match(/[?&]room=([A-Za-z0-9]{1,4})/)?.[1] ?? str ?? '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
  const cells=document.querySelectorAll('#mpCodeBoxes .lb-cell');
  cells.forEach((c,i)=> c.value=v[i]||'');
  const next=Math.min(v.length, cells.length-1); if(cells[next]) cells[next].focus();
}
async function mpJoinFromCode(){
  mpUnlockAudio();
  const c=mpReadCode();
  if(c.length<4){ mpErr('Wpisz 4-znakowy kod.'); return; }
  const n=await ensureHandle(); mpMe.name=n; setHandle(n);
  mpEnterRoom(c, false);
}
(function mpWireCode(){
  const cells=Array.from(document.querySelectorAll('#mpCodeBoxes .lb-cell'));
  cells.forEach((c,i)=>{
    c.addEventListener('input',()=>{ c.value=c.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,1); if(c.value && cells[i+1]) cells[i+1].focus(); });
    c.addEventListener('keydown',(e)=>{ if(e.key==='Backspace' && !c.value && cells[i-1]){ cells[i-1].focus(); } else if(e.key==='Enter'){ mpJoinFromCode(); } });
    c.addEventListener('paste',(e)=>{ e.preventDefault(); const t=(e.clipboardData||window.clipboardData).getData('text')||''; mpSetCode(t); });
  });
})();
// udostępnij pokój (natywne share na mobile, fallback: kopiuj link)
function mpShare(btn){
  const url=location.origin+location.pathname+'?room='+(mpCode||'');
  if(navigator.share){ navigator.share({title:'STACJA — dołącz do pokoju', text:'Kod pokoju: '+(mpCode||''), url}).catch(()=>{}); return; }
  navigator.clipboard?.writeText(url);
  if(btn){ const t=btn.textContent; btn.textContent='✓ skopiowano'; setTimeout(()=>btn.textContent=t,1500); }
}
function mpLobbyStart(){ mpRoomStage='build'; mpRender(); }   // host: poczekalnia → „ułóż mecz"
function mpLobbyBack(){ mpRoomStage='wait'; mpRender(); }     // picker → poczekalnia (wstecz)
function mpRoomBack(){ mpLeave(); }                           // wyjdź z pokoju → ekran wejścia
function mpExitMenu(){ mpLeave(); stopAudio(); stopSpeech(); showScreen('menu'); }   // ☰ → menu

async function mpEnterRoom(code, asHost){
  mpErr('');
  const client=mpConnect();
  if(!client){ mpErr('Brak połączenia z serwerem (config.js / supabase-js).'); return; }
  const uid=await ensureSession(); if(uid) mpMe.id=uid;   // tożsamość = auth.uid PRZED presence
  mpCode=code; mpHost=asHost; mpRoomStage='wait';
  $m('mpLobby').style.display='none'; $m('mpRoom').style.display='';
  mpCh=client.channel('stacja-'+code, {config:{broadcast:{self:true}, presence:{key:mpMe.id}}});
  mpCh.on('broadcast',{event:'sync'},({payload})=>{ if(!mpHost){ mpGame=payload; mpAfterSync(); } });
  mpCh.on('broadcast',{event:'act'},({payload})=>{ if(mpHost) mpHandleAct(payload); });
  mpCh.on('broadcast',{event:'react'},({payload})=>{ if(payload.by!==mpMe.id) mpFloatEmoji(payload.emoji, payload.byName); });
  mpCh.on('broadcast',{event:'say'},({payload})=>{ if(payload.by!==mpMe.id){ mpPushChat(payload.byName, payload.text); mpFloatSay(payload.text, payload.byName); } });
  mpCh.on('broadcast',{event:'typing'},({payload})=>{ if(payload.by!==mpMe.id) mpMarkTyping(payload.by); });
  mpCh.on('presence',{event:'sync'},()=>{ mpRenderMembers(); if(!mpGame || mpGame.phase==null) mpRender(); if(mpHost){ mpBroadcast(); mpMaybeGo(); } });
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
  const el=$m('mpMembers'); if(!el) return;   // pasek członków usunięty — lista jest w poczekalni
  const ms=mpMembers();
  el.innerHTML=ms.map(m=>{
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
let mpPlOpen=false, mpPlStatus='', mpPlStatusCls='';   // panel importu Spotify w pickerze MP
function mpPlToggle(){ mpPlOpen=!mpPlOpen; mpRender(); }
async function mpPlImport(){
  const inp=document.getElementById('mpPlUrl'); const url=(inp&&inp.value||'').trim();
  const st=document.getElementById('mpPlStatus');
  const setSt=(cls,txt)=>{ mpPlStatusCls=cls; mpPlStatus=txt; if(st){ st.className='pl-status '+cls; st.textContent=txt; } };
  if(!url){ setSt('err','Wklej link do playlisty Spotify.'); return; }
  setSt('','importuję…');
  try{
    const res=await plFetch(url);
    mpPickCats.add(res.key);
    mpPlStatusCls='ok'; mpPlStatus='✓ '+res.name+' — '+res.count+' utw. Dodana.'; mpPlOpen=true;
    mpRender();
  }catch(e){ setSt('err','Nie udało się: '+(e.message||e)); }
}
function mpToggleCat(k){ if(mpPickCats.has(k)) mpPickCats.delete(k); else mpPickCats.add(k); mpRender(); }
function mpToggleMode(m){ if(mpPickModes.has(m)) mpPickModes.delete(m); else mpPickModes.add(m); mpRender(); }
function mpSetRounds(r){ mpPickRounds=r; mpRender(); }
function mpSetTimer(t){ mpPickTimer=t; mpRender(); }
function mpPickerHTML(){
  const band=(title,keys,cls)=> keys.length? `<div class="band-label">${title}</div><div class="ticks">`+
    keys.map(k=>`<button class="tick ${cls} ${mpPickCats.has(k)?'on':''}" onclick="mpToggleCat('${k}')">${escapeHtml(ALL_CATS[k].label)}<small>${escapeHtml(ALL_CATS[k].range||ALL_CATS[k].desc||'')}</small></button>`).join('')+`</div>` : '';
  const cats=band('dekady',ERA_KEYS,'')+band('style i gatunki',STYLE_KEYS,'gen')+band('gotowe playlisty',READY_KEYS,'pl')+band('teksty — tłumaczenia 🌐',LYRICS_KEYS,'gen');
  // twoje playlisty ze Spotify — host rozwiązuje utwory sam, więc wystarczy mieć je w ALL_CATS (plMerge)
  const PL_KEYS=Object.keys(plLoad());
  const plBand=`<div class="band-label">twoje playlisty <button class="pl-add" onclick="mpPlToggle()">+ ze Spotify</button></div>`+
    (PL_KEYS.length? `<div class="ticks">`+PL_KEYS.map(k=>`<button class="tick pl ${mpPickCats.has(k)?'on':''}" onclick="mpToggleCat('${k}')">${escapeHtml(ALL_CATS[k].label)}<small>${(ALL_CATS[k].songs||[]).length} utw.</small></button>`).join('')+`</div>`
      : `<div class="ticks"><span style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:6px 2px">brak — kliknij „+ ze Spotify"</span></div>`)+
    `<div class="pl-panel${mpPlOpen?' show':''}"><input id="mpPlUrl" autocomplete="off" placeholder="wklej link do publicznej playlisty Spotify" onkeydown="if(event.key==='Enter')mpPlImport()"><button onclick="mpPlImport()">Importuj</button><div class="pl-status ${mpPlStatusCls}" id="mpPlStatus">${escapeHtml(mpPlStatus)}</div></div>`;
  const modes=`<div class="band-label">tryby (można kilka)</div><div class="ticks">`+
    ALL_MODES.map(m=>`<button class="tick gen ${mpPickModes.has(m)?'on':''}" onclick="mpToggleMode('${m}')">${MODE_LABEL[m]}<small>${MODE_SUB[m]}</small></button>`).join('')+`</div>`;
  const rounds=`<div class="band-label">rundy (× 3 kategorie × 5 pytań)</div><div class="lenpick">`+
    [1,2,3,4].map(r=>`<button class="${mpPickRounds===r?'on':''}" onclick="mpSetRounds(${r})">${r}</button>`).join('')+`</div>`;
  const timer=`<div class="band-label">timer pytania</div><div class="lenpick">`+
    [[0,'bez'],[30,'30s'],[60,'60s'],[90,'90s']].map(([v,l])=>`<button class="${mpPickTimer===v?'on':''}" onclick="mpSetTimer(${v})">${l}</button>`).join('')+`</div>`;
  const r=buildMatch([...mpPickCats],[...mpPickModes],mpPickRounds);
  const bad=(!mpPickCats.size||!mpPickModes.size||r.error);
  const info=(!mpPickCats.size||!mpPickModes.size)?'zaznacz kategorie i tryby':(r.error||`${mpPickRounds} × 3 × 5 = ${mpPickRounds*15} pytań`);
  return `<div class="mpnav">
      <button class="nav-back" onclick="mpLobbyBack()" aria-label="wstecz">←</button>
      <span class="nav-title">Ułóż mecz</span>
      <button class="nav-menu" onclick="mpExitMenu()" aria-label="menu">☰</button>
    </div>
    <div class="mp-deck">${cats}${plBand}${modes}${rounds}${timer}
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
    answerSlots:slotsFor(r.slots[0].mode, r.slots[0].cat), proposals:[], votes:{}, passed:[],
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
  mpGame.phase=MP.LOADING; mpGame.proposals=[]; mpGame.votes={}; mpGame.passed=[]; mpGame.reveal=null; mpGame.locked=null; mpGame.endsAt=null; mpAutoLocked=false;
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
let mpPlaySkin=null;            // dla której skórki zbudowany scaffold gry (kolumny/czat)
let mpPlaySub=null;             // dla którego pod-stanu fazy zbudowany scaffold (sluchaj/kombinuj)
let mpSub='sluchaj';            // klient-lokalny pod-stan fazy PLAY (obie skórki mają fazy)
let mpSubTimer=null;            // auto-przejście słuchaj → kombinuj po czasie fazy słuchania
let mpComposerMode='chat';      // tryb composera @odp w skórce czat (chat/typ)
let mpListenStart=0, mpListenDur=0;   // okno fazy „słuchaj" (pasek czasu)
// skórka = preferencja klienta (czysty render); obie mają fazy, różnią się fazą „kombinuj"
const mpSkin = ()=> localStorage.getItem('stacjaUI')==='czat' ? 'czat' : 'kolumny';   // migracja: „fazy"→„kolumny"
function mpSetSkin(v){ localStorage.setItem('stacjaUI', v); mpPlaySkin=null; mpPlayRound=null; mpRender(); }
// audio gra TYLKO w fazie słuchania — wyjście do „kombinuj" zatrzymuje dźwięk
function mpStopAudio(){ lektorStop(); mpStopRev(); if(mpAudio){ try{mpAudio.pause();}catch(e){} } }
function mpGoKombinuj(){ if(mpSubTimer){ clearTimeout(mpSubTimer); mpSubTimer=null; } mpStopAudio(); mpSub='kombinuj'; mpRender(); }

/* mpRender = dyspozytor po fazie FSM; każdą fazę renderuje osobny helper */
// 06 Lobby — poczekalnia (host: kod + udostępnij + gracze + „ZACZNIJ"; gość: czeka na hosta)
function mpLobbyWaitHTML(){
  const ms=mpMembers();
  const hostId = mpGame ? mpGame.hostId : (mpHost ? mpMe.id : null);
  const cards = ms.map(m=>{
    const isHost = m.id===hostId, you = m.id===mpMe.id;
    const av = escapeHtml((m.name||'?').slice(0,1).toUpperCase());
    return `<div class="pcz-m">
      <span class="pcz-av" style="background:${mpAvatarColor(m.name)}">${av}</span>
      <div class="pcz-mn"><b>${escapeHtml(m.name||'gracz')}${isHost?' 👑':''}${you?' (Ty)':''}</b><small>${isHost?'host':'w pokoju'}</small></div>
      <span class="pcz-badge">W POKOJU</span>
    </div>`;
  }).join('') || `<div class="pcz-waitmsg">czekamy na graczy…</div>`;
  const n=ms.length, word = n===1?'osoba' : ([2,3,4].includes(n%10) && ![12,13,14].includes(n%100)) ? 'osoby' : 'osób';
  const foot = mpHost
    ? `<button class="pcz-start" onclick="mpLobbyStart()">ZACZNIJ →</button>`
    : `<div class="pcz-waitmsg">⏳ czekamy, aż host ułoży mecz…</div>`;
  return `<div class="pcz">
    <div class="pcz-hd">
      <div class="pcz-hd-r1"><span class="pcz-exit" onclick="mpRoomBack()">← wyjdź</span><span class="pcz-lbl">KOD POKOJU</span></div>
      <div class="pcz-hd-r2"><span class="pcz-code">${escapeHtml(mpCode||'····')}</span><button class="pcz-share" onclick="mpShare(this)">🔗 Udostępnij</button></div>
    </div>
    <div class="pcz-team"><span>Drużyna</span><span class="pcz-count">${n} ${word}</span></div>
    <div class="pcz-list">${cards}</div>
    <div class="pcz-foot">${foot}</div>
  </div>`;
}
function mpRender(){
  const st=$m('mpStage'); if(!st) return;
  if(!mpGame || mpGame.phase==null){
    // przed grą: poczekalnia (06, własny navbar) → host „ZACZNIJ" → picker „ułóż mecz" (własny navbar)
    const building = mpHost && mpRoomStage==='build';
    st.innerHTML = building ? mpPickerHTML() : mpLobbyWaitHTML();
    return;
  }
  const g=mpGame;
  const head=mpHeaderHTML(g);   // kompaktowy nagłówek 2-wierszowy (zawiera #mpCountdown)
  // zachowaj migawkę odsłony (raz na pytanie) — by każdy mógł zostać na niej we własnym tempie
  if(g.phase===MP.REVEAL && g.reveal && mpRevealNonce!==g.playNonce){
    mpRevealNonce=g.playNonce;
    mpRevealSnap={ reveal:g.reveal, head, isLast:(g.si>=g.slots.length-1 && g.qi>=QPC-1) };
    if(g.reveal.teamOk || g.reveal.pewniakWin) confetti();   // drużyna trafiła → confetti (raz)
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

const mpRenderLoading = (head)=> `${head}<div class="mp-deck"><div class="mp-state">host losuje utwór…</div></div>`;
const mpRosterStrip = (g)=> `<div class="mp-roster">${mpRosterHTML(g||mpGame||{})}</div>`;
const mpRenderArming = (g, head)=>{
  const rc=g.readyCount||0, rt=g.readyTotal||mpMembers().length;
  return `${head}${mpRosterStrip(g)}<div class="mp-deck"><div class="mp-state">⏳ czekamy na graczy… <b>${rc}/${rt}</b> gotowych</div><div class="mp-state" style="opacity:.7">pytanie ruszy równo u wszystkich</div></div>${mpReactsBarHTML()}`;
};
// klient już kliknął „dalej" i czeka, aż reszta też przejdzie do następnego pytania
const mpRenderWaitNext = (head)=>{
  const rc=(mpGame&&mpGame.readyCount)||0, rt=(mpGame&&mpGame.readyTotal)||mpMembers().length;
  return `${head}${mpRosterStrip()}<div class="mp-deck"><div class="mp-state">✓ idziesz dalej… <b>${rc}/${rt}</b> gotowych</div><div class="mp-state" style="opacity:.7">następne pytanie ruszy, gdy wszyscy przejdą dalej</div></div>${mpReactsBarHTML()}`;
};
const mpRenderNetErr = (g, head)=>{
  const msg = g.netReason==='empty' ? 'Brak zajawek dla tej kategorii — spróbuj ponownie albo zmień kategorię.' : 'Brak połączenia z iTunes (limit zapytań albo blokada sieci). Odczekaj minutę i spróbuj ponownie.';
  return `${head}<div class="mp-deck"><div class="mp-state" style="color:var(--red)">${msg} ${mpHost?'<br><button class="mp-btn ghost" onclick="mpHostNewRound()">spróbuj ponownie</button>':''}</div></div>`;
};
const mpRenderNoLyric = (head)=> `${head}<div class="mp-deck"><div class="mp-state" style="color:var(--red)">Brak tekstów do lektora w tej kategorii (songs[] w categories.js).</div></div>`;

/* --- faza gry: małe budowniki HTML + częściowa aktualizacja (nie czyść pól) --- */
// pasek osób (design): awatar w kole (kolor = stan) + etykieta stanu pod spodem
const ROSTER_META={
  idle:  {bg:'#E5E5E5',fg:'#9a958c',lab:'myśli',lc:'#9a958c'},
  type:  {bg:'#1CB0F6',fg:'#fff',lab:'pisze…',lc:'#1899D6'},
  ans:   {bg:'#58CC02',fg:'#fff',lab:'✓ typ',lc:'#46A302'},
  unsure:{bg:'#CE82FF',fg:'#fff',lab:'🟣 niepewny',lc:'#A568CC',ring:'#EBD6FF'},
  sure:  {bg:'#FFC800',fg:'#7a5a00',lab:'🟡 pewniak',lc:'#E6A800',ring:'#FFE9A8'},
  pass:  {bg:'#E5E5E5',fg:'#9a958c',lab:'✋ pas',lc:'#9a958c',dim:1},
};
function mpRosterHTML(g){
  return mpMembers().map(m=>{
    const st=rosterState(g,m.id,mpTypingSet), me=ROSTER_META[st]||ROSTER_META.idle;
    const av=escapeHtml((m.name||'?').slice(0,1).toUpperCase());
    const ring=me.ring?`box-shadow:0 0 0 3px ${me.ring};`:'';
    return `<div class="mp-rz${me.dim?' dim':''}${m.id===mpMe.id?' you':''}">
      <span class="mp-rz-av" style="background:${me.bg};color:${me.fg};${ring}">${av}</span>
      <span class="mp-rz-lab" style="color:${me.lc}">${me.lab}</span>
    </div>`;
  }).join('');
}
// tablica kolumnami (design): karta kandydata = wartość + ▲głosy + awatary + TOP; klik = głos
const VOTE_COLORS=['#58CC02','#CE82FF','#FFC800','#FF4B4B','#1CB0F6','#1899D6'];
function mpSlotsHTML(g){
  const slots=g.answerSlots||slotsFor();
  return `<div class="mp-slots">${slots.map(s=>{
    const cands=candidatesForSlot(g, s.key);
    const myVal=myVoteForSlot(g, s.key, mpMe.id);
    const rows = cands.map((c,i)=>{
      const isTop=i===0 && c.votes.length>0;
      const voted = myVal && norm(myVal)===norm(c.value);
      const dots = c.votes.slice(0,5).map((v,j)=>`<b class="mp-vdot" style="background:${VOTE_COLORS[j%VOTE_COLORS.length]}"></b>`).join('');
      const tag = c.tag==='sure'?' <span class="mp-ctag s">🟡</span>':(c.tag==='unsure'?' <span class="mp-ctag u">🟣</span>':'');
      return `<div class="mp-cand${isTop?' top':''}${voted?' voted':''}" data-v="${escapeHtml(c.value)}" onclick="mpVote('${s.key}', this.dataset.v)">
        <span class="cv">${escapeHtml(c.value)}${tag}</span>
        <span class="crow"><span class="up">▲ ${c.votes.length}</span><span class="dots">${dots}</span>${isTop?'<span class="topb">TOP</span>':''}</span>
      </div>`;
    }).join('');
    return `<div class="mp-slotcol"><div class="mp-slot-h">${escapeHtml(s.label)}</div>${rows}<div class="mp-addtyp" onclick="mpFocusTyp('${s.key}')">+ dorzuć typ…</div></div>`;
  }).join('')}</div>`;
}
function mpFocusTyp(key){ const el=$m('mpProp_'+key)||$m('mpChatIn'); if(el) el.focus(); }
// „odpowiedź drużyny" (design): ciemna karta (kolumny) / zielona przypięta (czat) + ×2 gdy pewniak
function mpTeamHTML(g){
  const ta=teamAnswer(g), slots=g.answerSlots||slotsFor();
  const any=slots.some(s=>ta[s.key]);
  const val = any ? slots.map(s=> ta[s.key]?escapeHtml(ta[s.key]):'—').join(' — ') : '— wrzućcie i przegłosujcie —';
  const sure = (g.proposals||[]).some(p=>p.conf==='sure');
  const badge = sure ? '<span class="mp-x2">🟡 ×2</span>' : '';
  const cls = mpSkin()==='czat' ? 'mp-teamc' : 'mp-teamd';
  return `<div class="${cls}"><span class="ic">🎯</span><span class="tx"><span class="l">ODPOWIEDŹ DRUŻYNY</span><span class="v">${val}</span></span>${badge}</div>`;
}
// wybór pewności typu (zwykła/niepewny/pewniak) + „pas" — jeden wiersz, bez dubli na dole.
// pewniak = typ z conf=sure (×2), niepewny = fiolet, pas = toggle „nic już nie dodam".
// Stan kto pewniakuje / spasował widać na pasku osób (roster), więc tu bez list imion.
function mpConfHTML(){
  const seg=(v,label,cls,flex)=>`<button class="mp-seg ${cls}${mpConf===v?' on':''}" style="flex:${flex}" onclick="mpSetConf('${v}')">${label}</button>`;
  const iPassed = mpGame && (mpGame.passed||[]).some(p=>p.id===mpMe.id);
  return `${seg('normal','zwykła','',1)}${seg('unsure','🟣 niepewny','u',1.2)}${seg('sure','🟡 PEWNIAK ×2','s',1.5)}<button class="mp-seg p${iPassed?' on':''}" style="flex:.9" onclick="mpSend({type:'pass'})">✋ pas</button>`;
}
// przełącznik skórki (A/B): per-klient, czysty render nad tym samym stanem
const mpHr = ()=> `<div class="mp-hr"></div>`;
// czas fazy „słuchaj" — z kategorii (cat.listenSecs) albo domyślnie wg trybu
const LISTEN_SECS = { lektor:22, music:15, reverse:15, snippet:12 };
function mpListenSecs(g){
  const cat=ALL_CATS[g.catKey], c=cat&&cat.listenSecs;
  return (c>0 ? c : (LISTEN_SECS[g.mode]||15));
}
const mpKnobHTML = (id='mpKnob', cls='mp-knob')=> `<button class="${cls}" id="${id}" onclick="mpPlayLocal()" aria-label="Odtwórz"><svg id="mpKnobIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>`;
const mpLockBtnHTML = (ghost)=> mpHost ? `<button class="mp-btn${ghost?' ghost':''}" style="width:100%;margin-top:6px" onclick="mpLock()">Zatwierdź odpowiedź drużyny ✓</button>` : '';
const mpLyricHTML = (g)=> g.mode==='lektor'&&g.lyric ? `<div class="lyric-box"><span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>${escapeHtml(g.lyric)}</div>` : '';
function mpAvatarColor(name){ let h=0; for(const ch of (name||'?')) h=(h*31+ch.charCodeAt(0))>>>0; return VOTE_COLORS[h%VOTE_COLORS.length]; }
function mpChatFeedHTML(){
  return mpChatLog.map(c=>{
    const av=escapeHtml((c.byName||'?').slice(0,1).toUpperCase());
    return `<div class="mp-cmsg"><b class="mp-cmav" style="background:${mpAvatarColor(c.byName)}">${av}</b><div class="mp-cmb"><span class="nm">${escapeHtml(c.byName||'')}</span><div class="tx">${escapeHtml(c.text)}</div></div></div>`;
  }).join('');
}
// pasek faz (rail, design): duże węzły, done=✓ zielony, aktywny=poświata, segmenty
function mpRailHTML(active){
  const order=['sluchaj','kombinuj','odslona'];
  const meta={ sluchaj:['🎧','słuchaj'], kombinuj:['🧠','kombinujcie'], odslona:['👁','odsłona'] };
  const ai=order.indexOf(active);
  let out='<div class="mp-rail">';
  order.forEach((k,i)=>{
    const cls = i<ai?'done':(i===ai?'on':'');
    const dot = cls==='done' ? '✓' : meta[k][0];
    out += `<div class="mp-rnode ${cls}"><span class="mp-rdot">${dot}</span><span class="mp-rlab">${meta[k][1]}</span></div>`;
    if(i<order.length-1) out += `<span class="mp-rseg${i<ai?' done':''}"></span>`;
  });
  return out+'</div>';
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
// kolumny + odpowiedź drużyny + zatwierdź (host) — wspólny blok odpowiedzi
function mpAnswerBlockHTML(g, ghostLock){
  return `<div class="mp-board" id="mpBoard"></div>
    <div class="mp-team" id="mpTeam"></div>
    ${mpLockBtnHTML(ghostLock)}`;
}
// composer „@odp" (czat): [✍️ typ] po LEWEJ + pole czatu ⇄ chipy slotów + [wyślij]
function mpComposerHTML(g){
  const slots=g.answerSlots||slotsFor();
  const chips=slots.map((s,i)=>`${i?'<span class="mp-sep">,</span>':''}<input id="mpTyp_${s.key}" class="mp-slotchip" placeholder="${escapeHtml(s.label)}" oninput="mpTypingPing()" onkeydown="if(event.key==='Enter')mpComposerSend()">`).join('');
  return `<div class="mp-composer">
      <button class="mp-cf mp-typtoggle" id="mpTypToggle" onclick="mpComposerToggle()" title="przełącz czat/typ" aria-label="przełącz czat/typ">✍️</button>
      <div class="mp-compfield">
        <div class="mp-cwrap" id="mpCompChat"><span class="mp-odp">@odp</span><input id="mpChatIn" maxlength="64" autocomplete="off" placeholder="@ → typ · tekst → czat" oninput="mpChatInput()" onkeydown="if(event.key==='Enter')mpComposerSend()"></div>
        <div class="mp-cwrap" id="mpCompTyp" style="display:none"><span class="mp-at">@</span>${chips}</div>
      </div>
      <button id="mpCompBtn" class="mp-send" onclick="mpComposerSend()">➤</button>
    </div>`;
}
// nagłówek gry (design): kolorowy pas — wiersz 1 runda·pokój·timer; wiersz 2 chipy kat/tryb/pyt
function mpHeaderHTML(g){
  const MODE={music:'♪ muzyka',lektor:'🗣 lektor',reverse:'🔄 od tyłu',snippet:'✂️ fragment'};
  return `<div class="mp-hd">
    <div class="mp-hd-r1">
      <span class="mp-hd-back" onclick="mpRoomBack()">←</span>
      <span class="mp-hd-title">Runda ${g.round||1} · 🍺 ${escapeHtml(mpCode||'')}</span>
      <span class="mp-hd-timer" id="mpCountdown"></span>
    </div>
    <div class="mp-hd-chips">
      <span>${escapeHtml(g.catLabel||g.catKey||'—')}</span>
      <span>${MODE[g.mode]||g.mode||''}</span>
      <span>Pyt. ${(g.qi||0)+1}/${QPC}</span>
    </div>
  </div>`;
}
const mpReactsOnlyHTML = ()=> `<div class="mp-reacts">${REACTIONS.map(e=>`<button onclick="mpReact('${e}')">${e}</button>`).join('')}</div>`;

// FAZA „słuchaj" — JEDYNE miejsce z audio + pasek odliczania czasu fazy (wspólna)
function mpSluchajBodyHTML(g){
  return `<div class="mp-deck">${mpKnobHTML()}
      <div class="mp-state" id="mpPlayStatus">${g.mode==='lektor'?'lektor czyta':'posłuchaj uważnie'} · stuknij, by powtórzyć</div>
      <div class="mp-listenbar" id="mpListenBar"><i></i></div></div>
    ${mpLyricHTML(g)}
    <button class="mp-btn ghost" style="width:100%;margin-top:8px" onclick="mpGoKombinuj()">gotowe, kombinujemy →</button>
    ${mpHr()}${mpReactsBarHTML()}`;
}
// FAZA „kombinuj" — widok KOLUMNOWY (bez audio)
function mpKombinujKolumnyHTML(g){
  return `${mpLyricHTML(g)}
    ${mpFormHTML(g)}
    <div class="mp-conf" id="mpConf">${mpConfHTML()}</div>
    ${mpAnswerBlockHTML(g, false)}
    ${mpHr()}${mpReactsBarHTML()}`;
}
// FAZA „kombinuj" — widok CZAT: czat w środku, kolumny/team/zatwierdź na dole nad emotkami (item 5)
function mpKombinujCzatHTML(g){
  return `${mpLyricHTML(g)}
    <div class="mp-chatfeed" id="mpChatFeed"></div>
    ${mpComposerHTML(g)}
    <div class="mp-conf" id="mpConf">${mpConfHTML()}</div>
    <div class="mp-chint">z <b>@</b> wrzucasz typ · bez @ piszesz na czat</div>
    ${mpHr()}
    ${mpAnswerBlockHTML(g, true)}
    ${mpHr()}${mpReactsOnlyHTML()}`;
}
// scaffold fazy PLAY (obie skórki): nagłówek + rail + roster + ciało wg fazy/skórki
function mpScaffoldPlay(g, head){
  const skin=mpSkin();
  const top=`${head}
    ${mpRailHTML(mpSub==='sluchaj'?'sluchaj':'kombinuj')}
    <div class="mp-roster${skin==='czat'?' mp-roster-nb':''}" id="mpRoster"></div>
    ${skin==='czat'?mpLegendHTML():''}`;
  if(mpSub==='sluchaj') return top+mpSluchajBodyHTML(g);
  return top+(skin==='czat'?mpKombinujCzatHTML(g):mpKombinujKolumnyHTML(g));
}
// odśwież dynamiczne części (wspólne) — bez ruszania pól wpisywanych
function mpRefreshDynamic(g){
  const set=(id,html)=>{ const el=$m(id); if(el) el.innerHTML=html; };
  set('mpRoster', mpRosterHTML(g));
  set('mpBoard', mpSlotsHTML(g));
  set('mpTeam', mpTeamHTML(g));
  set('mpConf', mpConfHTML());            // odśwież stan „pas" (pewność czyta trwały mpConf)
  const feed=$m('mpChatFeed'); if(feed){ feed.innerHTML=mpChatFeedHTML(); feed.scrollTop=feed.scrollHeight; }
}
// animuj pasek czasu fazy słuchania (CSS-transition od pozostałego % do 0)
function mpAnimListenBar(){
  const bar=$m('mpListenBar'); if(!bar) return; const i=bar.querySelector('i'); if(!i) return;
  const remMs=Math.max(0, mpListenDur-(Date.now()-mpListenStart));
  i.style.transition='none'; i.style.width=(mpListenDur?remMs/mpListenDur*100:0)+'%';
  requestAnimationFrame(()=>{ i.style.transition=`width ${remMs}ms linear`; i.style.width='0%'; });
}
function mpRenderPlay(g, head, st){
  const skin=mpSkin();
  const newRound = mpPlayRound!==g.playNonce;
  if(newRound){                                  // nowe pytanie → faza „słuchaj", licznik czasu fazy
    mpClearTyping(); mpComposerMode='chat'; mpSub='sluchaj';
    mpListenStart=Date.now(); mpListenDur=mpListenSecs(g)*1000;
    if(mpSubTimer) clearTimeout(mpSubTimer);
    mpSubTimer=setTimeout(()=>{ if(mpSub==='sluchaj' && mpGame && mpGame.phase===MP.PLAY) mpGoKombinuj(); }, mpListenDur);
  }
  if(newRound || mpPlaySkin!==skin || mpPlaySub!==mpSub || !$m('mpRoster')){
    mpPlayRound=g.playNonce; mpPlaySkin=skin; mpPlaySub=mpSub;
    st.innerHTML = mpScaffoldPlay(g, head);
    if(mpSub==='sluchaj') mpAnimListenBar();
  }
  mpRefreshDynamic(g);
  mpTickTimer();
}

// odsłona rundy (design): rail + zielona karta utworu + baner pewniaka + odpowiedź drużyny
function mpRenderRevealCard(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  const cover = r.art?`<img class="rv-cover" src="${r.art}" referrerpolicy="no-referrer">`:`<div class="rv-cover ph">💿</div>`;
  const meta=[r.album,r.year].filter(Boolean).join(' · ');
  const slot=(ok,lab,val)=>`<div class="rv-slot"><span class="k">${lab}</span><span class="v">${escapeHtml(val||'—')}</span><span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span></div>`;
  let banner;
  if(r.pewniakWin) banner=`<div class="rv-banner win"><span class="ic">🟡</span><span class="tx"><b>PEWNIAK trafiony!</b><small>${(r.pewniacy||[]).map(escapeHtml).join(', ')} — podwójne punkty</small></span><span class="pts">+${r.gained}</span></div>`;
  else if(r.pewniakLose) banner=`<div class="rv-banner lose"><span class="ic">🍺</span><span class="tx"><b>Pewniak przepalony</b><small>stawia: ${(r.pewniacy||[]).map(escapeHtml).join(', ')} — odbiór na żywo 😏</small></span></div>`;
  else if(r.teamOk) banner=`<div class="rv-banner ok"><span class="ic">✓</span><span class="tx"><b>Drużyna trafiła!</b><small>${r.firstBy?'pierwszy: '+escapeHtml(r.firstBy):'+'+r.gained+' pkt'}</small></span><span class="pts">+${r.gained}</span></div>`;
  else banner=`<div class="rv-banner no"><span class="ic">✗</span><span class="tx"><b>Tym razem nie</b><small>0 pkt</small></span></div>`;
  return `${head}${mpRailHTML('odslona')}${mpRosterStrip()}
    <div class="rv-card">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(r.track)}</span><span class="a">${escapeHtml(r.artist)}</span>${meta?`<span class="m">${escapeHtml(meta)}</span>`:''}</div></div>
      ${slot(r.okTitle,'TYTUŁ',r.track)}${slot(r.okArtist,'WYK.',r.artist)}
    </div>
    ${banner}
    <div class="rv-locked">odpowiedź drużyny: „${escapeHtml(r.locked.title||'—')} · ${escapeHtml(r.locked.artist||'—')}"</div>
    ${mpReactsBarHTML()}
    <button class="mp-next" onclick="mpAdvance()">${last?'WYNIK KOŃCOWY →':'NASTĘPNE PYTANIE ›'}</button>`;
}

// wynik meczu (design): złoty hero + MVP + kto stawia + paski wkładu
function mpRenderDone(g, head){
  const tally=(g.tallyList||[]);
  const max=Math.max(1,...tally.map(t=>t.correct));
  const rows=tally.map((t,i)=>{
    const col=mpAvatarColor(t.name), pct=Math.round(t.correct/max*100), av=escapeHtml((t.name||'?').slice(0,1).toUpperCase());
    return `<div class="wk-row"><span class="rk">${i+1}</span><b class="av" style="background:${col}">${av}</b><span class="nm">${escapeHtml(t.name)}</span><span class="bar"><i style="width:${pct}%;background:${i===0?'var(--green)':(t.correct?'var(--blue)':'var(--red)')}"></i></span><span class="pts">${t.correct}</span></div>`;
  }).join('')||'<div class="mp-state">brak trafnych typów</div>';
  const mvp = g.mvp?`<div class="dn-mvp"><span class="av" style="background:${mpAvatarColor(g.mvp.name)}">${escapeHtml((g.mvp.name||'?').slice(0,1).toUpperCase())}</span><span class="tx"><span class="l">⭐ MVP STOŁU</span><b>${escapeHtml(g.mvp.name)}</b><small>${g.mvp.correct} trafnych typów</small></span></div>`:'';
  const beer=Object.entries(g.beerTally||{}).sort((a,b)=>b[1]-a[1]);
  const stawia = beer.length?`<div class="dn-stawia"><span class="ic">🍺</span><span class="tx"><span class="l">STAWIA KOLEJKĘ</span><b>${beer.map(([n,c])=>escapeHtml(n)+(c>1?` (${c}×)`:'')).join(', ')}</b><small>przepalone pewniaki 🟡💥</small></span></div>`:'';
  return `<div class="dn-hero"><div class="ic">🏆</div><div class="t">Mecz zakończony!</div><div class="s">wynik drużyny</div><div class="sc">${g.score}</div></div>
    ${mvp}${stawia}
    <div class="dn-lbl">Wkład drużyny</div>
    <div class="dn-wk">${rows}</div>
    <div class="dn-btns"><button class="dn-menu" onclick="mpExitMenu()">← menu</button>${mpHost?'<button class="dn-again" onclick="mpNewGame()">REWANŻ 🔁</button>':'<div class="dn-wait">host zaczyna rewanż</div>'}</div>`;
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
  if(el){ const m=Math.floor(s/60); el.textContent='⏱ '+(m?m+':'+String(s%60).padStart(2,'0'):s+' s'); el.classList.toggle('low', rem>0 && rem<=5000); }
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
  if(tog)  tog.textContent    = m==='typ'?'💬':'✍️';
  if(btn)  btn.textContent    = '➤';
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
if(new URLSearchParams(location.search).get('room')){ showScreen('mp'); mpSetCode(new URLSearchParams(location.search).get('room')); }

/* ============ most do HTML: app.js to moduł ES (własny scope), więc handlery
   wstrzykiwane w stringach onclick="" muszą żyć na window. ============ */
Object.assign(window, {
  mpHostNewRound, mpLock, mpNewGame, mpNext, mpPlayLocal, mpPropose, mpVote, mpSetConf,
  mpRandomPick, mpReact, mpSay, mpSend, mpSetRounds, mpSetTimer, mpSetSkin, mpComposerSend, mpTypingPing,
  mpGoKombinuj, mpComposerToggle, mpChatInput, mpFocusTyp,
  mpStart, mpToggleCat, mpToggleMode, mpAdvance, mpPlToggle, mpPlImport,
  mpLobbyStart, mpLobbyBack, mpRoomBack, mpExitMenu, mpShare,
});
