/* app/mp.js — cała warstwa MULTIPLAYER (pokój online, gra jako jedna drużyna).
 * Host-authority: logika gry jest w core/mpReducer (przetestowana); tu zostaje DOM + transport.
 * Dane kategorii i wrappery związane z ALL_CATS wstrzykiwane przez initMp (app/ nie zależy od app.js).
 * Powiązania zwrotne MP↔social: initMp woła initSocial; mp importuje showScreen/render* z social. */
import { shuffle, escapeHtml } from '../core/util.js';
import { norm } from '../core/scoring.js';
import { QPC, CPR, ALL_MODES, MODE_LABEL, matchSlot, matchAdvance } from '../core/match.js';
import { MP, assertMp } from '../core/phases.js';
import { reduceAction, countReady, evaluateAnswer, slotsFor, teamOf } from '../core/mpReducer.js';
import { buildTeams, emptyByTeam, reconcileTeams, COOP_TEAM } from '../core/teams.js';
import { buildMpRecord } from '../core/matchRecord.js';
import { mpSnipStart, listenSecs as _listenSecs, shouldPing, SNIP_SECS, MP_SNIP_WINDOW_S, MP_BUFFER_TIMEOUT_MS, EMOJI_TTL_MS, SAY_TTL_MS } from '../core/timing.js';
import { createFeed, resetFeed, pushChat as _pushChat, ingestFeed as _ingestFeed } from '../core/chatFeed.js';
import { plPick, togglePick as _togglePick, syncQuizMode as _syncQuizMode, grpActive as _grpActive, pickSummary } from '../core/picker.js';
import { animIn, confetti, val } from './dom.js';
import { ensureCtxResumed, unlockCtx } from './audioCtx.js';
import { playReverse, unlockAudioElement } from '../adapters-web/webAudio.js';
import { cfChannel } from '../adapters-web/cfChannel.js';
import { authorityChannel } from '../adapters-web/roomTransport.js';
import { ensureSession, setHandle, recordMatch } from '../adapters-web/cf.js';
import { stopAudio } from './audio.js';
import { stopSpeech, lektorStop, lektorPlay } from './lektor.js';
import { initSocial, showScreen, renderDruzyna, renderProfil, ensureHandle, saveHandle } from './social.js';
import { ALL_CATS, ALL_KEYS, ERA_KEYS, STYLE_KEYS, READY_KEYS, LYRICS_KEYS, QUIZ_KEYS,
  catLabel, buildMatch, randomPools, plLoad, plFetch } from './catalog.js';
import { initMpPicker, mpPickerHTML, mpBuildPools, mpPickCats, mpPickModes, mpPickRounds, mpPickTimer, mpPickSalon, mpPickFormat, mpTeamsFromAssign } from './mp-picker.js';
import { S, mpMe } from './mp-state.js';   // współdzielony stan MP (obiekt S) + tożsamość gracza mpMe
import { initMpRender, mpRender, mpRosterHTML, mpChatFeedHTML, mpStartListenWindow, mpAvatarColor } from './mp-render.js';
import { ic } from './icons.js';

initMpPicker(mpRender, ()=>mpPlayers());   // picker re-renderuje widok pokoju + czyta listę graczy (przypisanie do drużyn)
// initMpRender(...) — wstrzyknięcie back-calls do renderu — na KOŃCU pliku (mpSkin to const, nie hoisted)

// wstrzyknij powiązania MP → social (mpMe to współdzielony obiekt). Wołane z app.js po zbudowaniu wirelistu.
export function initMp(){
  initSocial({ mpMe, mpEnterRoom, mpRandCode, mpUnlockAudio, mpAvatarColor, catLabel });
}
// deep-link ?room= — wołane przez app.js PO initMp (showScreen sięga mpMe wstrzykniętego do social)
export function mpBootDeepLink(){
  const r=new URLSearchParams(location.search).get('room');
  if(r){ showScreen('mp'); mpSetCode(r); }
}

/* ================= MULTIPLAYER (Worker Durable Object — relay) ================= */
// Cały współdzielony stan MP (S) + tożsamość gracza (mpMe) → app/mp-state.js.
// TASK 6 — flaga serwer-autorytetu. Default z config.serverAuthority. Override (rollback/test):
// ?authority=1|0 w URL albo localStorage 'stacjaAuthority'='1'|'0' (0 = wymuś relay mimo defaultu true).
const SERVER_AUTH = (()=>{ try{
  const q=new URLSearchParams(location.search).get('authority');
  if(q==='1') return true; if(q==='0') return false;
  const ls=localStorage.getItem('stacjaAuthority');
  if(ls==='1') return true; if(ls==='0') return false;
  return !!(window.STACJA_CONFIG && window.STACJA_CONFIG.serverAuthority);
}catch(e){ return false; } })();
const $m=id=>document.getElementById(id);
/* nazwane stałe czasowe: core/timing.js (MP_BUFFER_TIMEOUT_MS, MP_SNIP_WINDOW_S, EMOJI_TTL_MS, SAY_TTL_MS) */
// iOS: zajawka MP PRZEJMUJE dźwięk ('playback'); po stopie 'ambient' (UI/klik miksuje, nie pauzuje muzyki w tle)
const audioSession = t => { try{ if(navigator.audioSession) navigator.audioSession.type = t; }catch(e){} };

function mpRandCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++)s+=c[Math.floor(Math.random()*c.length)]; return s; }
function mpErr(t){ $m('mpErr').textContent=t||''; }

// Sesja LENIWA — tworzona przy geście, który jej potrzebuje (wejście do pokoju MP,
// koniec meczu, ekran profilu/drużyny). ensureSession() woła Worker i cache'uje token.

/* ---- wejście / wyjście z trybu (router ekranów + social) → app/social.js ---- */
// wstrzyknij powiązania z warstwą MP + etykiety kategorii (mpMe to współdzielony obiekt)
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

$m('profilSave').onclick=async()=>{
  const v=$m('profilHandle').value.trim(); if(!v) return;
  const btn=$m('profilSave'); btn.textContent='…';
  await saveHandle(v);
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
  if(S.ch){ try{ await S.ch.unsubscribe(); }catch(e){} S.ch=null; }
  if(S.audio){ try{S.audio.pause();}catch(e){} }   // element trwały — pauza, nie zeruj
  audioSession('ambient');                          // wyjście z pokoju → oddaj dźwięk muzyce w tle
  stopSpeech(); mpStopRev();
  if(S.armTimer){ clearTimeout(S.armTimer); S.armTimer=null; }
  S.ready=new Set(); S.lastArmNonce=null;
  advancedSet=new Set(); advancedNonce=null; S.advCount=S.advTotal=0;   // salon: licznik „dalej" graczy
  S.ack=S.revealNonce=S.revealSnap=null;
  S.code=null; S.host=false; S.salon=false; S.roomStage='wait'; S.lastView=null; S.game=null; S.hostCurrent=null; S.tally={}; S.lastNonce=null;
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
  const url=location.origin+location.pathname+'?room='+(S.code||'');
  if(navigator.share){ navigator.share({title:'STACJA — dołącz do pokoju', text:'Kod pokoju: '+(S.code||''), url}).catch(()=>{}); return; }
  navigator.clipboard?.writeText(url);
  if(btn){ const t=btn.textContent; btn.textContent='✓ skopiowano'; setTimeout(()=>btn.textContent=t,1500); }
}
function mpLobbyStart(){ S.roomStage='build'; mpRender(); }   // host: poczekalnia → „ułóż mecz"
function mpLobbyBack(){ S.roomStage='wait'; mpRender(); }     // picker → poczekalnia (wstecz)
function mpRoomBack(){ mpLeave(); }                           // wyjdź z pokoju → ekran wejścia
function mpExitMenu(){ mpLeave(); stopAudio(); stopSpeech(); showScreen('menu'); }   // ☰ → menu

async function mpEnterRoom(code, asHost){
  mpErr('');
  if(!(window.STACJA_CONFIG&&window.STACJA_CONFIG.roomsBase)){ mpErr('Brak połączenia z serwerem (config.js).'); return; }
  const uid=await ensureSession(); if(uid) mpMe.id=uid;   // tożsamość = profile id PRZED presence
  S.code=code; S.host=asHost; S.roomStage='wait';
  $m('mpLobby').style.display='none'; $m('mpRoom').style.display='';
  // SERVER_AUTH → transport na autorytatywny DO (ta sama powierzchnia); else relay cfChannel.
  S.ch=(SERVER_AUTH?authorityChannel:cfChannel)(code, {config:{broadcast:{self:true}, presence:{key:mpMe.id}}});
  // pod autorytetem KAŻDY (też host) bierze stan z DO; w relay tylko nie-host (host jest źródłem).
  S.ch.on('broadcast',{event:'sync'},({payload})=>{ if(SERVER_AUTH || !S.host){ S.game=payload; mpAfterSync(); } });
  S.ch.on('broadcast',{event:'act'},({payload})=>{ if(S.host && !SERVER_AUTH) mpHandleAct(payload); });   // relay-only
  S.ch.on('broadcast',{event:'react'},({payload})=>{ if(payload.by!==mpMe.id) mpFloatEmoji(payload.emoji, payload.byName); });
  S.ch.on('broadcast',{event:'say'},({payload})=>{ if(payload.by!==mpMe.id){ mpClearTypingFor(payload.by); mpPushChat(payload.byName, payload.text, false); mpFloatSay(payload.text, payload.byName); } });
  S.ch.on('broadcast',{event:'typing'},({payload})=>{ if(payload.by!==mpMe.id) mpMarkTyping(payload.by); });
  S.ch.on('broadcast',{event:'advanced'},({payload})=>{ mpOnPlayerAdvanced(payload); });   // SALON: gracz kliknął „dalej" na odsłonie
  S.ch.on('presence',{event:'sync'},()=>{
    if(SERVER_AUTH && S.ch.hostId) S.host=(S.ch.hostId===mpMe.id);   // host = autorytatywny hostId z DO
    mpRenderMembers(); if(!S.game || S.game.phase==null) mpRender();
    if(S.host && !SERVER_AUTH){ mpBroadcast(); mpMaybeGo(); }        // relay: host pcha stan i liczy gotowość (DO robi to sam)
  });
  S.ch.subscribe(async(status)=>{
    if(status==='SUBSCRIBED'){ await S.ch.track({name:mpMe.name}); mpRenderMembers(); mpRender(); }
    else if(status==='CHANNEL_ERROR'){ mpErr('Błąd kanału — spróbuj ponownie.'); }
  });
  if(!S.timerInt) S.timerInt=setInterval(mpTickTimer, 500);
}

function mpMembers(){
  if(!S.ch) return [];
  const st=S.ch.presenceState(); const out=[];
  Object.keys(st).forEach(k=>{ const meta=st[k][0]||{}; out.push({id:k, name:meta.name||'?'}); });
  return out;
}
// GRACZE = członkowie pokoju; w trybie salonowym TV (host) jest tylko prowadzącym, więc poza listą.
// Filtr działa od startu meczu (flaga salon żyje w stanie gry); przed meczem nie znamy roli.
function mpPlayers(){
  const ms=mpMembers(), g=S.game;
  const salon=(g&&g.salon)||S.salon;                 // S.salon = host-lokalny fallback (przed game.salon z serwera)
  const hostId=g?g.hostId:(S.host?mpMe.id:null);
  return (salon && hostId) ? ms.filter(m=>m.id!==hostId) : ms;
}
// drużyna TEGO klienta (izolacja widoku). coop → 'all'; salon-host → drużyna, którą sędziuje.
function myTeamId(){ return teamOf(S.game, mpMe.id) || COOP_TEAM; }
// członkowie MOJEJ drużyny (do rostera) — NIE mylić z mpPlayers (wszyscy w pokoju, dla gotowości/salonu)
function myTeamMembers(){
  const g=S.game, tid=myTeamId();
  const t=(g&&g.teams||[]).find(x=>x.id===tid);
  if(!t) return mpPlayers();
  const ids=new Set(t.members||[]);
  return mpPlayers().filter(m=>ids.has(m.id));
}
// id-ki, na które czeka faza gotowości. SALON: tylko gracze (TV nie gra; buforuje audio sam).
// Brak graczy → fallback na wszystkich (anty-deadlock, gdy host sam w pokoju).
function mpExpectedReady(){
  const ids=mpMembers().map(m=>m.id);
  if(S.game && S.game.salon){ const ps=ids.filter(id=>id!==S.game.hostId); return ps.length?ps:ids; }
  return ids;
}
function mpRenderMembers(){
  const el=$m('mpMembers'); if(!el) return;   // pasek członków usunięty — lista jest w poczekalni
  const ms=mpPlayers();   // w salonie TV (host) nie jest graczem → poza listą
  el.innerHTML=ms.map(m=>{
    const host = S.game? (m.id===S.game.hostId) : (m.id===mpMe.id && S.host);
    return `<span class="mp-chip${host?' host':''}${m.id===mpMe.id?' you':''}">${escapeHtml(m.name)}</span>`;
  }).join('');
}

/* ---- broadcast / sync ---- */
function mpBroadcast(){ if(S.host&&S.ch&&S.game){ S.ch.send({type:'broadcast',event:'sync',payload:S.game}); } }
function mpSend(act){
  act.by=mpMe.id; act.byName=mpMe.name; act.aid=mpMe.id+'-'+Math.random().toString(36).slice(2);
  // RELAY: host stosuje OD RAZU (bez round-tripu → brak laga); 'act' obsługuje tylko host.
  // AUTORYTET: każdy (też host) wysyła akcję do DO — DO jest źródłem prawdy.
  if(S.host && !SERVER_AUTH){ mpHandleAct(act); return; }
  // KLIENT/AUTORYTET: zastosuj lokalnie OD RAZU (optymistycznie) — natychmiastowe podświetlenie
  // (głos/propozycja/pewniak), a właściwy sync (od hosta / od DO) zaraz skoryguje stan.
  if(S.game && reduceAction(S.game, act)) mpRender();
  if(S.ch){ S.ch.send({type:'broadcast',event:'act',payload:act}); }
}
function mpAfterSync(){
  // host-lokalny fallback salonu: serwer (jeszcze) nie odsyła game.salon → wstrzyknij, by
  // teamAnswer (nadpisanie) i widok-monitor działały u hosta bez deployu DO.
  if(S.salon && S.game && !S.game.salon) S.game.salon=true;
  // faza gotowości: zbuforuj utwór i zgłoś „ready" — ale TYLKO gdy nie ma odsłony do
  // zamknięcia. Z zaległą odsłoną klient zbroi się dopiero po kliknięciu „dalej".
  if(S.game && S.game.phase===MP.ARMING && S.game.armNonce!==S.lastArmNonce && !mpRevealPending()){
    mpArm();
  }
  // start: zagraj lokalnie gdy zmienił się nonce (audio już zbuforowane → równy start).
  // Render NAJPIERW, żeby gałka/status już istniały, gdy mpPlayLocal ustawia „ładowanie…".
  const startPlay = S.game && S.game.phase===MP.PLAY && S.game.playNonce!==S.lastNonce;
  if(startPlay) S.lastNonce=S.game.playNonce;
  mpRender();   // może odpalić INTRO fazy i ustawić S.introUntil (start fazy wstrzymany do końca animacji)
  // CAŁA faza (okno czasu + audio) startuje DOPIERO po intrze — nic nie gra/tyka pod dużą ikoną fazy.
  if(startPlay){
    const begin=()=>{ if(S.game && S.game.phase===MP.PLAY && S.game.playNonce===S.lastNonce){ mpStartListenWindow(S.game); mpPlayLocal(); } };
    const wait=(S.introUntil||0)-Date.now();
    if(S.startTimer){ clearTimeout(S.startTimer); S.startTimer=null; }
    if(wait>20) S.startTimer=setTimeout(begin, wait); else begin();
  }
}
// czy ten klient ma jeszcze nie zamkniętą („dalej") odsłonę
function mpRevealPending(){ return !!S.revealSnap && S.ack!==S.revealNonce; }
// host: sprawdź, czy można już wystartować pytanie (wszyscy obecni gotowi)
function mpMaybeGo(){
  if(!S.host || !S.game || S.game.phase!==MP.ARMING) return;
  const r=countReady(mpExpectedReady(), S.ready);
  S.game.readyCount=r.count; S.game.readyTotal=r.total;
  if(r.all){ mpGo(); } else { mpBroadcast(); mpRender(); }
}
// host: zamknij odsłonę u siebie i przejdź do następnego pytania (DO advance / lokalnie)
function mpHostNextReveal(){
  if(!S.host || !S.game || S.game.phase!==MP.REVEAL) return;
  S.ack=S.revealNonce;
  if(SERVER_AUTH){ if(S.ch&&S.ch.next) S.ch.next(); mpRender(); } else mpNext();
}
// SALON: host (TV) zlicza, którzy GRACZE kliknęli „dalej" na bieżącej odsłonie, i przechodzi SAM,
// gdy wszyscy gotowi — host nie gra, więc nie wymaga kliku na TV (klik na TV = ręczny „pomiń czekanie").
let advancedSet=new Set(), advancedNonce=null;
function mpOnPlayerAdvanced(payload){
  if(!S.host || !S.game || !S.game.salon || S.game.phase!==MP.REVEAL) return;
  if(!payload || payload.nonce!==S.game.playNonce) return;
  if(advancedNonce!==S.game.playNonce){ advancedSet=new Set(); advancedNonce=S.game.playNonce; }
  advancedSet.add(payload.by);
  const players=mpPlayers().map(m=>m.id);                 // gracze = obecni bez TV
  S.advCount=players.filter(id=>advancedSet.has(id)).length; S.advTotal=players.length;
  mpRender();                                             // odśwież „X/Y gotowych" na TV
  if(players.length>0 && players.every(id=>advancedSet.has(id))) mpHostNextReveal();
}
// „dalej" na ekranie wyniku — KAŻDY klika sam, we własnym tempie
function mpAdvance(){
  if(!S.game) return;
  S.ack=S.revealNonce;                                  // zamknij u siebie odsłonę
  if(S.host){
    if(S.game.phase===MP.REVEAL){ mpHostNextReveal(); }  // host (też salon „pomiń") → następne pytanie
    else { mpRender(); }
  } else {
    // SALON: zgłoś hostowi „kliknąłem dalej" — TV przejdzie samo, gdy wszyscy klikną (host nie gra)
    if(S.game.salon && S.game.phase===MP.REVEAL && S.ch){
      S.ch.send({type:'broadcast',event:'advanced',payload:{by:mpMe.id, nonce:S.game.playNonce}});
    }
    if(S.game.phase===MP.ARMING && S.game.armNonce!==S.lastArmNonce){ mpArm(); }  // host już zbroi → zgłoś gotowość
    mpRender();
  }
}
// stany gałki: 'pause' (∥ gra), 'wait' (⏳ ładowanie), 'play' (▶ idle/pauza)
function mpSetKnob(state){
  if(state===true) state='pause'; if(state===false) state='play';
  const i=$m('mpKnobIcon');
  if(i) i.innerHTML = state==='pause' ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
    : state==='wait' ? '<path d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="currentColor" stroke-width="2.4"/>'
    : state==='replay' ? '<path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 16.24 7.76L13 11h7V4z"/>'   // ↻ fragment od nowa
    : '<path d="M8 5v14l11-7z"/>';
  const k=$m('mpKnob'); if(k) k.classList.toggle('loading', state==='wait');
}
function mpSetPlayStatus(t){ const e=$m('mpPlayStatus'); if(e) e.textContent=t; }
// JEDEN trwały element audio dla MP — odblokowany gestem (mobilna autoplay-policy),
// reużywany co rundę przez podmianę .src. Zdarzenia gałki wpinane raz — gałka i status
// JADĄ ZA REALNYMI zdarzeniami odtwarzacza (koniec rozjazdu ikona vs dźwięk).
function mpEnsureAudio(){
  if(!S.audio){
    S.audio=new Audio(); S.audio.preload='auto';
    S.audio.addEventListener('playing',()=>{ mpSetKnob('pause'); mpSetPlayStatus(S.game&&S.game.mode==='snippet'?'gra fragment…':'gra…'); });
    S.audio.addEventListener('waiting',()=>{ mpSetKnob('wait'); mpSetPlayStatus('ładowanie…'); });
    S.audio.addEventListener('stalled',()=>{ mpSetKnob('wait'); mpSetPlayStatus('ładowanie…'); });
    S.audio.addEventListener('pause',  ()=>{ if(S.audio.ended) return;
      if(S.audio._snipEnd){ mpSetKnob('replay'); mpSetPlayStatus('fragment '+SNIP_SECS+'s · ↻ jeszcze raz'); }   // fragment dograł → replay
      else { mpSetKnob('play'); mpSetPlayStatus('pauza · ▶ stuknij'); } });
    S.audio.addEventListener('ended',  ()=>{ mpSetKnob('play'); mpSetPlayStatus('koniec · ↻ stuknij'); });
  }
  return S.audio;
}
// odblokuj audio w geście (tworzenie/dołączanie/start/stuknięcie gałki) — bez tego
// host nie usłyszy muzyki, bo play() leci poza gestem (po fazie gotowości)
function mpUnlockAudio(){ unlockCtx(); unlockAudioElement(mpEnsureAudio()); }
// usuń ewentualny watchdog fragmentu z poprzedniej rundy (element jest trwały)
function mpClearSnip(a){ if(a._snipStop){ a.removeEventListener('timeupdate', a._snipStop); a._snipStop=null; } }

// faza gotowości — preload zajawki na trwałym elemencie, potem zgłoś hostowi „ready" (#4)
function mpArm(){
  mpSetKnob(false);
  const armNonce=S.game.armNonce;
  S.lastArmNonce=armNonce;   // ta runda już zbrojona przez tego klienta (anty-dublowanie)
  // lektor / brak zajawki — nic do buforowania, gotów od razu
  if(S.game.mode==='lektor' || !S.game.preview){ mpSend({type:'ready', armNonce}); return; }
  const a=mpEnsureAudio(); mpClearSnip(a);
  if(a.src!==S.game.preview) a.src=S.game.preview;
  let done=false;
  const ready=()=>{ if(done) return; done=true; mpSend({type:'ready', armNonce}); };
  a.addEventListener('canplaythrough', ready, {once:true});
  a.addEventListener('canplay',        ready, {once:true});
  a.addEventListener('error',          ready, {once:true}); // i tak zgłoś — host nie utknie
  setTimeout(ready, MP_BUFFER_TIMEOUT_MS);                  // bezpiecznik
  a.load();
}
function mpStopRev(){ if(S.revSrc){ S.revSrc.stop(); S.revSrc=null; } }   // uchwyt z playReverse
// play() zablokowane przez przeglądarkę (autoplay poza gestem) → poproś o stuknięcie
function mpPlayBlocked(){ mpSetKnob('play'); mpSetPlayStatus('stuknij ▶, by odtworzyć'); }
// gałka = TOGGLE: gra → pauza; pauza → wznów; koniec/świeże → od nowa (#bug2: dotąd zawsze restart)
function mpKnobTap(){
  if(!S.game) return mpPlayLocal();
  const mode=S.game.mode;
  if(mode==='lektor'){
    const speaking=isSpeaking();
    if(speaking){ lektorStop(); mpSetKnob('play'); mpSetPlayStatus('pauza · ▶ stuknij'); return; }
    return mpPlayLocal();
  }
  if(mode==='reverse'){
    if(S.revSrc){ mpStopRev(); mpSetKnob('play'); mpSetPlayStatus('pauza · ▶ stuknij'); return; }   // od tyłu: stop (replay od nowa)
    return mpPlayLocal();
  }
  const a=S.audio;                                   // music / snippet — trwały element
  // fragment dograł cały (nie piosenka) → klik ODTWARZA FRAGMENT OD NOWA, nie wznawia reszty utworu
  const snipDone = mode==='snippet' && a && S.game.snipStart!=null && (a.currentTime-(S.game.snipStart||0))>=SNIP_SECS;
  if(a && !a.paused && !a.ended){ a.pause(); return; }                                   // gra → pauza
  if(a && a.src && !a.ended && a.currentTime>0 && !snipDone){ a.play().catch(mpPlayBlocked); return; } // pauza → wznów (nie od nowa)
  return mpPlayLocal();                                                                   // koniec/świeże/fragment-dograł → od nowa
}
function mpPlayLocal(){
  audioSession('playback');   // zajawka przejmuje dźwięk
  lektorStop(); mpStopRev();
  if(S.game.mode==='lektor'){ mpSetKnob('pause'); mpSetPlayStatus('lektor czyta…'); if(S.game.lyric) lektorPlay(S.game.lyric, S.game.ttsUrl, ()=>{}); return; }
  if(!S.game.preview){ mpSetPlayStatus('brak zajawki'); return; }
  if(S.game.mode==='reverse'){ return mpPlayReverse(); }
  // music / snippet — trwały, odblokowany element; src ustawiony już w fazie gotowości
  const a=mpEnsureAudio(); mpClearSnip(a);
  if(a.src!==S.game.preview) a.src=S.game.preview;
  mpSetKnob('wait'); mpSetPlayStatus('ładowanie…');   // od razu pokaż, że się wczytuje
  if(S.game.mode==='snippet'){
    const start=S.game.snipStart||0.5;
    a._snipEnd=false;                              // świeży start fragmentu (replay-status czyta to w 'pause')
    const seek=()=>{ try{ a.currentTime=start; }catch(e){} };
    if(a.readyState>=1) seek(); else a.addEventListener('loadedmetadata', seek, {once:true});
    // fragment dograł cały → STOP (nie cała piosenka); flaga → gałka pokaże ↻ „fragment od nowa"
    const stop=()=>{ if((a.currentTime-start)>=SNIP_SECS){ a._snipEnd=true; a.pause(); mpClearSnip(a); } };
    a._snipStop=stop; a.addEventListener('timeupdate', stop);
    a.play().catch(mpPlayBlocked); return;
  }
  try{ a.currentTime=0; }catch(e){}
  a.play().catch(mpPlayBlocked);
}
// „od tyłu" w MP — każdy klient dekoduje+odwraca lokalnie (wspólny AudioPort.playReverse)
async function mpPlayReverse(){
  if(S.audio){ try{S.audio.pause();}catch(e){} }
  mpSetKnob('wait'); mpSetPlayStatus('odwracam…');
  const ctx=await ensureCtxResumed();          // wspólny AudioContext (app/audioCtx.js)
  const url=S.game.preview;
  const r=await playReverse(ctx, url, {
    cfg: window.STACJA_CONFIG,
    shouldPlay: ()=>S.game.preview===url,    // runda mogła się zmienić w trakcie dekodowania
    onEnded: ()=>{ mpSetKnob('play'); mpSetPlayStatus('koniec · ↻ stuknij'); },
  });
  if(r.ok){ S.revSrc=r; mpSetKnob('pause'); mpSetPlayStatus('gra od tyłu…'); return; }
  if(r.aborted) return;                       // cisza — runda już inna
  // CORS/dekodowanie padło → zagraj normalnie (ten sam trwały element z eventami)
  const a=mpEnsureAudio(); a.src=url; a.play().catch(mpPlayBlocked);
}
// host: wszyscy gotowi (lub timeout) → równoczesny start u wszystkich
function mpGo(){
  if(!S.host || !S.game || S.game.phase!==MP.ARMING) return;
  if(S.armTimer){ clearTimeout(S.armTimer); S.armTimer=null; }
  S.game.phase=assertMp(S.game.phase, MP.PLAY, console.warn); S.game.playNonce=(S.game.playNonce||0)+1;
  if(S.game.timer>0) S.game.endsAt=Date.now()+S.game.timer*1000;
  mpBroadcast(); mpAfterSync();   // host gra lokalnie
}

/* ---- host: akcje od graczy ---- */
function mpHandleAct(a){
  if(!S.game) return;
  if(a.aid){ if(S.seenActs.has(a.aid)) return; S.seenActs.add(a.aid); }   // pomiń echo własnej akcji
  // faza gotowości — host orkiestruje (presence + bezpiecznik), zliczanie w core
  if(a.type==='ready' && S.game.phase===MP.ARMING){
    if(a.armNonce!==S.game.armNonce) return;       // ready ze starej rundy — ignoruj
    S.ready.add(a.by);
    const r=countReady(mpExpectedReady(), S.ready);
    S.game.readyCount=r.count; S.game.readyTotal=r.total;
    if(r.all){ mpGo(); return; }                   // wszyscy gotowi → start
    mpBroadcast(); mpRender();
    return;
  }
  // pozostałe akcje gry: czysty reducer (propose/unpropose/vote/sure)
  if(reduceAction(S.game, a)){ mpBroadcast(); mpRender(); }
}

/* ---- host: start gry / runda ---- */
/* ---- host: ekran układania meczu (multi-select, jak solo) ---- */
function mpStart(){
  const r=buildMatch([...mpPickCats],[...mpPickModes],mpPickRounds);
  if(r.error||!r.slots){ mpRender(); return; }
  mpUnlockAudio();   // gest hosta — odblokuj audio, zanim muzyka ruszy po fazie gotowości
  S.salon=!!mpPickSalon;   // host-lokalny fallback — działa nim serwer odeśle game.salon (i bez deployu DO)
  if(SERVER_AUTH){
    // AUTORYTET: wgraj pule wybranych kategorii i oddaj sterowanie DO (on zbuduje mecz i przyśle stan).
    S.host=true; S.tally={}; S.ack=S.revealNonce=S.revealSnap=null;
    const pools=mpBuildPools([...mpPickCats], [...mpPickModes]);
    // format + przypisania MUSZĄ iść w configu — inaczej DO buduje zawsze coop (Solo/Drużyny „nie działają")
    const assignments = mpPickFormat==='teams' ? mpTeamsFromAssign(mpPlayers()) : undefined;
    if(S.ch && S.ch.startMatch) S.ch.startMatch({ rounds:mpPickRounds, timer:mpPickTimer||0, modes:[...mpPickModes], pools, salon:mpPickSalon, format:mpPickFormat, assignments });
    S.game={hostId:mpMe.id, phase:MP.LOADING}; mpRender();   // optymistyczne „ładowanie" do czasu stanu z DO
    return;
  }
  // RELAY: host buduje stan lokalnie. Drużyny wg formatu (coop=1, solo=N×1, teams=podział hosta).
  const teams = mpPickFormat==='teams' ? mpTeamsFromAssign(mpPlayers()) : buildTeams(mpPickFormat, mpPlayers());
  const scores={}; teams.forEach(t=>{ scores[t.id]=0; });
  S.game={hostId:mpMe.id, phase:'play', slots:r.slots, rounds:r.rounds, si:0, qi:0,
    catKey:r.slots[0].cat, mode:r.slots[0].mode, round:r.slots[0].round, catLabel:catLabel(r.slots[0].cat),
    answerSlots:slotsFor(r.slots[0].mode, r.slots[0].cat),
    format:mpPickFormat, teams, byTeam:emptyByTeam(teams), scores,
    reveal:null, results:[], preview:'', lyric:'', playNonce:0, salon:mpPickSalon,
    timer:mpPickTimer||0, endsAt:null, beerTally:{}};
  S.tally={};
  S.hostSeen.clear();
  S.ack=S.revealNonce=S.revealSnap=null;   // świeży mecz → brak zaległej odsłony
  mpHostNextQuestion();
}
// ustaw kategorię/tryb/rundę z bieżącego slotu i rozwiąż pytanie
function mpHostNextQuestion(){
  const s=S.game.slots[S.game.si]; if(!s){ mpFinish(); return; }
  S.game.catKey=s.cat; S.game.mode=s.mode; S.game.round=s.round; S.game.catLabel=catLabel(s.cat);
  S.game.answerSlots=slotsFor(s.mode, s.cat);
  mpHostNewRound();
}
async function mpHostNewRound(){
  S.seenActs.clear();   // nowa runda → świeży zbiór zastosowanych akcji (nie rośnie w nieskończoność)
  reconcileTeams(S.game, mpPlayers());   // dołączenia/wyjścia między pytaniami (solo: nowi → nowe drużyny)
  S.game.phase=MP.LOADING; S.game.byTeam=emptyByTeam(S.game.teams);   // czyste buckety; scores KUMULUJĄ się przez mecz
  S.game.reveal=null; S.game.locked=null; S.game.endsAt=null; S.autoLocked=false;
  mpBroadcast(); mpRender();
  const catKey = S.game.catKey==='rnd' ? ALL_KEYS[Math.floor(Math.random()*ALL_KEYS.length)] : S.game.catKey;
  if(S.game.mode==='quiz'){
    const qs=((ALL_CATS[catKey]&&ALL_CATS[catKey].questions)||[]).filter(q=>q.prompt&&!S.hostSeen.has(norm(q.prompt)));
    if(!qs.length){ S.game.phase=MP.NOLYRIC; S.game.netReason='noquiz'; mpBroadcast(); mpRender(); return; }
    const q=qs[Math.floor(Math.random()*qs.length)];
    S.hostCurrent={prompt:q.prompt, slots:q.slots, answers:q.answers, track:'', artist:'', year:'', album:'', art:'', preview:'', lyric:''};
    S.hostSeen.add(norm(q.prompt));
    S.game.answerSlots=q.slots; S.game.prompt=q.prompt; S.game.preview=''; S.game.lyric=''; S.game.ttsUrl='';
  } else if(S.game.mode==='lektor'){
    const songs=((ALL_CATS[catKey]&&ALL_CATS[catKey].songs)||[]).filter(s=>s.lyric&&!S.hostSeen.has(norm(s.title)));
    if(!songs.length){ S.game.phase=MP.NOLYRIC; mpBroadcast(); mpRender(); return; }
    const s=songs[Math.floor(Math.random()*songs.length)];
    S.hostCurrent={track:s.title, artist:s.artist, year:s.year||'', album:s.album||'', art:'', preview:'', lyric:s.lyric};
    S.hostSeen.add(norm(s.title));
    S.game.lyric=s.lyric; S.game.preview=''; S.game.ttsUrl=s.tts||''; S.game.prompt=''; S.game.answerSlots=null;
  } else {
    // audio (muzyka/od tyłu/fragment) — playlistę i pulę wykonawców rozwiązuje repozytorium
    const t=await resolveTrack({cat:ALL_CATS[catKey], seen:S.hostSeen, cfg:window.STACJA_CONFIG});
    if(t.error){ S.game.phase=MP.NETERR; S.game.netReason=t.reason; mpBroadcast(); mpRender(); return; }
    S.hostCurrent={...t, lyric:''};
    S.game.preview=t.preview; S.game.lyric=''; S.game.ttsUrl=''; S.game.prompt=''; S.game.answerSlots=null;
  }
  // RESET slotów dla muzyki/lektora → DEFAULT (tytuł+wykonawca). Bez tego runda audio po quizie
  // dziedziczy sloty quizu (np. a/b/c/d) → złe pola wpisywania + zła ocena/odsłona (rozjazd answerSlots).
  // dla fragmentu: jedno wspólne okno 2 s u wszystkich (host losuje, broadcast)
  S.game.snipStart = S.game.mode==='snippet' ? mpSnipStart() : 0;
  // —— FAZA GOTOWOŚCI (#4): roześlij utwór, poczekaj aż wszyscy zbuforują, dopiero start ——
  S.game.phase=MP.ARMING; S.game.armNonce=(S.game.armNonce||0)+1;
  S.game.endsAt=null; S.game.readyCount=0; S.game.readyTotal=mpExpectedReady().length;
  S.ready=new Set();
  mpBroadcast(); mpRender();
  mpArm();                                   // host też buforuje i zgłasza swoją gotowość
  // brak twardego timeoutu: pytanie rusza dopiero, gdy WSZYSCY klikną „dalej" (gotowość).
  // Jeśli ktoś wyjdzie, presence-sync przeliczy gotowość (mpMaybeGo) i odblokuje start.
  if(S.armTimer){ clearTimeout(S.armTimer); S.armTimer=null; }
}
/* ---- host: zatwierdzenie odpowiedzi (pisarz) ---- */
function mpLock(){
  if(!S.host || !S.game || S.game.phase!==MP.PLAY) return;
  if(SERVER_AUTH){ if(S.ch&&S.ch.lock) S.ch.lock(); return; }   // AUTORYTET: DO ocenia i robi reveal
  S.autoLocked=true;
  const c=S.hostCurrent;
  const ev=evaluateAnswer(S.game, c);   // czysta ocena (core) — ocenia KAŻDĄ drużynę (ev.perTeam)
  // nałóż wyliczenia per-drużyna: punkty drużyny + wkład gracza (tally, globalny) + przegrane pewniaki
  S.game.beerTally=S.game.beerTally||{};
  for(const t of S.game.teams){
    const r=ev.perTeam[t.id]; if(!r) continue;
    S.game.scores[t.id]=(S.game.scores[t.id]||0)+r.gained;
    if(r.firstById){ S.tally[r.firstById]=S.tally[r.firstById]||{name:r.firstBy,correct:0}; S.tally[r.firstById].correct++; }
    if(!r.teamOk && r.anySure){ r.pewniacy.forEach(n=>{ S.game.beerTally[n]=(S.game.beerTally[n]||0)+1; }); }
  }
  S.game.results.push(ev.result);
  S.game.reveal=ev.reveal;
  S.game.phase=assertMp(S.game.phase, MP.REVEAL, console.warn); S.game.endsAt=null;
  mpBroadcast(); mpRender();
}
function mpNext(){
  const more=matchAdvance(S.game);   // qi++ / si++ po 5 pytaniach
  if(!more){ mpFinish(); return; }
  mpHostNextQuestion();
}
function mpFinish(){
  const arr=Object.values(S.tally).sort((a,b)=>b.correct-a.correct);
  S.game.mvp = arr.length&&arr[0].correct>0 ? arr[0] : null;
  S.game.tallyList = arr;
  // host zapisuje cały mecz (drużyna + tally per gracz) — best-effort, gated na auth.uid
  const snap={ game:S.game, tally:{...S.tally}, members:mpMembers(), hostId:mpMe.id, roomCode:S.code };
  (async()=>{ const uid=await ensureSession(); if(uid) recordMatch(buildMpRecord(snap)); })();
  S.game.phase=MP.DONE; mpBroadcast(); mpRender();
}
function mpNewGame(){
  S.ack=S.revealNonce=S.revealSnap=null;
  if(SERVER_AUTH){ S.game=null; S.roomStage='build'; mpRender(); return; }   // host → picker; DO start (DONE→nowy) przy „Start meczu"
  S.game={hostId:mpMe.id, phase:null}; mpBroadcast(); mpRender();
}

/* ---- render sceny ---- */
// skórka = preferencja klienta (czysty render); obie mają fazy, różnią się fazą „kombinuj"
const mpSkin = ()=> localStorage.getItem('stacjaUI')==='czat' ? 'czat' : 'kolumny';   // migracja: „fazy"→„kolumny"
function mpSetSkin(v){ localStorage.setItem('stacjaUI', v); S.playSkin=null; S.playRound=null; mpRender(); }
// audio gra TYLKO w fazie słuchania — wyjście do „kombinuj" zatrzymuje dźwięk
function mpStopAudio(){ lektorStop(); mpStopRev(); if(S.audio){ try{S.audio.pause();}catch(e){} } audioSession('ambient'); }
function mpGoKombinuj(){ if(S.subTimer){ clearTimeout(S.subTimer); S.subTimer=null; } mpStopAudio(); S.sub='kombinuj'; mpRender(); }

/* mpRender = dyspozytor po fazie FSM; każdą fazę renderuje osobny helper */
// 06 Lobby — poczekalnia (host: kod + udostępnij + gracze + „ZACZNIJ"; gość: czeka na hosta)
function mpPropose(){
  const slots=(S.game&&S.game.answerSlots)||slotsFor();
  const values={}; let any=false;
  slots.forEach(s=>{ const el=$m('mpProp_'+s.key); const v=el?el.value.trim():''; if(v){ values[s.key]=v; any=true; } });
  if(!any) return;
  mpSend({type:'propose', values});
  slots.forEach(s=>{ const el=$m('mpProp_'+s.key); if(el) el.value=''; });
}
function mpVote(slot, value){ mpSend({type:'vote', slot, value}); }
// host „wybiera odpowiedź": jawny WYBÓR slotu (set=true → zawsze ustaw, nie przełączaj)
function mpPick(slot, value){ mpSend({type:'vote', slot, value, set:true}); }
function mpVoteFromBubble(el){
  if(!S.host) return;
  try{ const v=JSON.parse(el.dataset.values||'{}'); Object.entries(v).forEach(([k,val])=>mpPick(k,val)); }catch(e){}
}

function mpTickTimer(){
  const el=$m('mpCountdown');
  if(!S.game || S.game.phase!==MP.PLAY || !S.game.endsAt){ if(el) el.textContent=''; return; }
  const rem=Math.max(0, S.game.endsAt - Date.now());
  const s=Math.ceil(rem/1000);
  if(el){ const m=Math.floor(s/60); el.innerHTML=ic('timer')+' '+(m?m+':'+String(s%60).padStart(2,'0'):s+' s'); el.classList.toggle('low', rem>0 && rem<=5000); }
  if(rem<=0 && S.host && !S.autoLocked && S.game.phase===MP.PLAY){ mpLock(); }
}
function mpReact(e){ mpFloatEmoji(e, mpMe.name); if(S.ch) S.ch.send({type:'broadcast',event:'react',payload:{emoji:e, byName:mpMe.name, by:mpMe.id}}); }
function mpFloatEmoji(emoji, byName){      // #9: pokaż KTO wysłał emotkę
  let fx=$m('mpFx');
  if(!fx){ fx=document.createElement('div'); fx.id='mpFx'; document.body.appendChild(fx); }
  const s=document.createElement('div'); s.className='mp-float';
  s.innerHTML=`<span class="e">${emoji}</span>${byName?`<span class="nm">${escapeHtml(byName)}</span>`:''}`;
  s.style.left=(8+Math.random()*78)+'%';
  fx.appendChild(s); setTimeout(()=>s.remove(), EMOJI_TTL_MS);
}
// #10: krótka wiadomość — dymek lecący przez ekran + wpis w feed czatu (skórka „czat")
function mpPushChat(byName, text, mine){
  _pushChat(S.feed, byName, text, mine);   // core/chatFeed.js (stan + ring-buffer)
  const feed=$m('mpChatFeed'); if(feed){ feed.innerHTML=mpChatFeedHTML(); feed.scrollTop=feed.scrollHeight; }
}
function mpNameOf(id){ const m=mpMembers().find(x=>x.id===id); return m?m.name:'gracz'; }
function mpFeedReset(){ resetFeed(S.feed); }
// zaksięguj NOWE typy/pasy do feedu (core/chatFeed.js) i zdejmij „pisze" dla autorów typów
function mpIngestFeed(g){
  const { clearTyping } = _ingestFeed(S.feed, g, mpMe.id, myTeamId());   // tylko typy/pasy MOJEJ drużyny
  clearTyping.forEach(mpClearTypingFor);
}
function mpDoSay(text){
  const t=(text||'').trim().slice(0,64); if(!t) return;
  mpPushChat(mpMe.name, t, true);   // moja wiadomość → po prawej
  mpFloatSay(t, mpMe.name);   // pokaż od razu u siebie (bez round-tripu)
  if(S.ch) S.ch.send({type:'broadcast',event:'say',payload:{text:t, byName:mpMe.name, by:mpMe.id}});
}
function mpSay(){ const el=$m('mpSayIn'); if(!el) return; mpDoSay(el.value); el.value=''; }
// composer „@odp" (skórka czat): „@" → pola slotów (tytuł/wykonawca), inaczej → czat
function mpSetComposerMode(m){
  S.composerMode=m;
  const chat=$m('mpCompChat'), typ=$m('mpCompTyp'), tog=$m('mpTypToggle');
  if(chat) chat.style.display = m==='typ'?'none':'flex';
  if(typ)  typ.style.display  = m==='typ'?'flex':'none';
  if(tog)  tog.textContent    = m==='typ'?'💬':'✍️';
}
function mpComposerToggle(){
  mpSetComposerMode(S.composerMode==='typ'?'chat':'typ');
  const slots=(S.game&&S.game.answerSlots)||slotsFor();
  const focusEl = S.composerMode==='typ' ? $m('mpTyp_'+slots[0].key) : $m('mpChatIn');
  if(focusEl) focusEl.focus();
}
// wpisanie „@" w polu czatu morfuje w pola slotów (treść po @ rozbita po przecinku trafia do pól)
function mpChatInput(){
  mpTypingPing();
  const el=$m('mpChatIn'); if(!el || el.value[0]!=='@') return;
  const slots=(S.game&&S.game.answerSlots)||slotsFor();
  const parts=el.value.slice(1).split(',');
  mpSetComposerMode('typ');
  slots.forEach((s,i)=>{ const c=$m('mpTyp_'+s.key); if(c) c.value=(parts[i]||'').trim(); });
  el.value='';
  const first=$m('mpTyp_'+slots[0].key); if(first) first.focus();
}
function mpComposerSend(){
  const slots=(S.game&&S.game.answerSlots)||slotsFor();
  if(S.composerMode==='typ'){              // pola slotów → typ
    const values={}; let any=false;
    slots.forEach(s=>{ const c=$m('mpTyp_'+s.key); const v=c?c.value.trim():''; if(v){ values[s.key]=v; any=true; } });
    if(any){ mpSend({type:'propose', values}); }
    slots.forEach(s=>{ const c=$m('mpTyp_'+s.key); if(c) c.value=''; });
    mpSetComposerMode('chat');
    return;
  }
  const el=$m('mpChatIn'); if(!el) return;
  const raw=el.value.trim(); if(!raw){ return; }
  if(raw[0]==='@' || raw[0]==='/'){      // fallback (wklejone) — „@tytuł, wykonawca" → typ
    const parts=raw.slice(1).split(',').map(x=>x.trim());
    const values={}; let any=false;
    slots.forEach((s,i)=>{ if(parts[i]){ values[s.key]=parts[i]; any=true; } });
    if(any){ mpSend({type:'propose', values}); }
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
  if(!shouldPing(S.lastTyping, now)) return;   // throttle: max raz na 1.5 s (core/timing.js)
  S.lastTyping=now;
  if(S.ch && S.game && S.game.phase===MP.PLAY) S.ch.send({type:'broadcast',event:'typing',payload:{by:mpMe.id, byName:mpMe.name}});
}
function mpMarkTyping(id){
  S.typingSet.add(id);
  if(S.typingTimers[id]) clearTimeout(S.typingTimers[id]);
  S.typingTimers[id]=setTimeout(()=>{ S.typingSet.delete(id); delete S.typingTimers[id]; mpRefreshTyping(); }, 3000);
  mpRefreshTyping();
}
// natychmiast zdejmij „pisze" dla gracza (gdy jego wiadomość/typ dotrze — nie wisi 3 s)
function mpClearTypingFor(id){
  if(!id || !S.typingSet.has(id)) return;
  S.typingSet.delete(id); if(S.typingTimers[id]){ clearTimeout(S.typingTimers[id]); delete S.typingTimers[id]; }
  mpRefreshTyping();
}
function mpRefreshRoster(){ if(S.game && S.game.phase===MP.PLAY){ const el=$m('mpRoster'); if(el) el.innerHTML=mpRosterHTML(S.game); } }
// odśwież OBA miejsca z „pisze": roster (pip) ORAZ feed czatu (linia „X pisze…") — feed nie znikał (#bug)
function mpRefreshTyping(){ mpRefreshRoster(); const feed=$m('mpChatFeed'); if(feed){ feed.innerHTML=mpChatFeedHTML(); feed.scrollTop=feed.scrollHeight; } }
function mpClearTyping(){ S.typingSet.clear(); Object.values(S.typingTimers).forEach(clearTimeout); S.typingTimers={}; }

/* autostart lobby gdy w URL jest ?room= */

/* ============ most do HTML: app.js to moduł ES (własny scope), więc handlery
   wstrzykiwane w stringach onclick="" muszą żyć na window. ============ */
// picker (mpToggleCat/Mode/Grp/RandomPick/PlToggle/PlImport/SetRounds/SetTimer) → window w app/mp-picker.js
Object.assign(window, {
  mpHostNewRound, mpLock, mpNewGame, mpNext, mpPlayLocal, mpPropose, mpVote, mpPick, mpVoteFromBubble,
  mpReact, mpSay, mpSend, mpSetSkin, mpComposerSend, mpTypingPing, mpKnobTap,
  mpGoKombinuj, mpComposerToggle, mpChatInput,
  mpStart, mpAdvance,
  mpLobbyStart, mpLobbyBack, mpRoomBack, mpExitMenu, mpShare,
});
// initMpRender na końcu — wszystkie back-calls (w tym const mpSkin) już zdefiniowane
initMpRender({ mpMembers, mpPlayers, myTeamId, myTeamMembers, mpRevealPending, mpSkin, mpIngestFeed, mpFeedReset, mpClearTyping, mpTickTimer, mpGoKombinuj, mpNameOf });

export { mpMe };
