/* app/mp.js — cała warstwa MULTIPLAYER (pokój online, gra jako jedna drużyna).
 * Host-authority: logika gry jest w core/mpReducer (przetestowana); tu zostaje DOM + transport.
 * Dane kategorii i wrappery związane z ALL_CATS wstrzykiwane przez initMp (app/ nie zależy od app.js).
 * Powiązania zwrotne MP↔social: initMp woła initSocial; mp importuje showScreen/render* z social. */
import { shuffle, escapeHtml } from '../core/util.js';
import { norm, quizKey, parseYear, quizListen } from '../core/scoring.js';
import { listenStop, unlockListen } from './listen.js';   // Łamigłówki: „▶ posłuchaj" w odsłonie (start w mp-render: mpOnEnter)
import { QPC, CPR, ALL_MODES, MODE_LABEL, matchSlot, matchAdvance, clampRounds, clampQuestions, roundsForQuestions, mpAvailableModes, AUTHORITY_ONLY_MODES } from '../core/match.js';
import { MP, assertMp } from '../core/phases.js';
import { reduceAction, countReady, evaluateAnswer, applyEvaluation, slotsFor, teamOf, playsAudioLocally, tvIdOf, allSettled, needsSureConfirm, mcOptions } from '../core/mpReducer.js';
import { buildTeams, emptyByTeam, reconcileTeams, COOP_TEAM } from '../core/teams.js';
import { buildMpRecord, noteAnswerers } from '../core/matchRecord.js';
import { clampTimer, mpSnipOffset, revsnipWindow, listenSecs as _listenSecs, shouldPing, secsLeft, SNIP_SECS, MP_SNIP_WINDOW_S, MP_BUFFER_TIMEOUT_MS, EMOJI_TTL_MS, SAY_TTL_MS, lastRoomCode, tickSecond, isTempoMode, mpTempoRate,
  MP_INTRO_MS, MP_ALL_DONE_GRACE_MS, phaseDeadlines, addClockSample, clockOffset, phaseClock, fmtClock, hostEndVisible, introEndLocal, introStageSecs, medleyLabel, MEDLEY_CLIP_S, MEDLEY_GAP_S, MEDLEY_LEAD_S } from '../core/timing.js';
import { createFeed, resetFeed, pushChat as _pushChat, ingestFeed as _ingestFeed } from '../core/chatFeed.js';
import { plPick, togglePick as _togglePick, syncQuizMode as _syncQuizMode, grpActive as _grpActive, pickSummary } from '../core/picker.js';
import { animIn, confetti, val, lsGet, lsSet } from './dom.js';
import { ensureCtxResumed, unlockCtx } from './audioCtx.js';
import { playReverse, unlockAudioElement, playBuffer, decodeAudio, setElementRate } from '../adapters-web/webAudio.js';
import { cfChannel } from '../adapters-web/cfChannel.js';
import { authorityChannel } from '../adapters-web/roomTransport.js';
import { ensureSession, setHandle, recordMatch } from '../adapters-web/cf.js';
import { resolveTrack, resolveDistractors } from '../adapters-web/itunesRepository.js';
import { buildTrackMC, yearReliable } from '../core/trackSelect.js';
import { stopAudio, loadMedley } from './audio.js';   // MP składanka: to samo sklejanie wycinków co solo
import { stopSpeech, lektorStop, lektorPlay, isSpeaking } from './lektor.js';
import { lektorLang, catLektorLang } from '../core/lektorVoice.js';
import { initSocial, showScreen, renderDruzyna, renderProfil, ensureHandle, saveHandle, knownHandle } from './social.js';
import { pickHandle } from '../core/handles.js';   // P2-12: propozycja ksywy przy pierwszym wejściu z linku
import { playSfx, registerMusicProbe, sfxDuck } from './sfx.js';
import { mpVinyl } from './vinyl.js';   // płyta winylowa = kontrolka odtwarzania w fazie „słuchaj"
import { ALL_CATS, ALL_KEYS, ERA_KEYS, STYLE_KEYS, READY_KEYS, LYRICS_KEYS, QUIZ_KEYS,
  catLabel, buildMatch, randomPools, plLoad, plFetch, quizFreshPool, quizTake } from './catalog.js';
import { initMpPicker, mpPickerHTML, mpBuildPools, mpPickCats, mpPickModes, mpPickQuestions, mpPickTimer, mpPickSalon, mpPickFormat, mpTeamsFromAssign, mpPickAudioHostOnly, mpAvailModes, mpDraft, mpPickResetRoom, mpPickReady } from './mp-picker.js';
import { sanitizeDraft } from '../core/matchSetup.js';   // szkic configu MP dla gości (ta sama sanityzacja co serwer)
import { S, mpMe } from './mp-state.js';   // współdzielony stan MP (obiekt S) + tożsamość gracza mpMe
import { tvSetMode } from './mp-tv.js';   // P1-16: scena TV (html.tv + motyw)
import { initMpRender, mpRender, mpRosterHTML, mpChatFeedHTML, mpConfHTML, mpStartListenWindow, mpAvatarColor, REACTIONS, mpRevealAutoMs, mpRevealAutoText, mpArmLeftText, mpIsSalonHost, mpIntroLeadMs, mpTvLobbyOn, mpPhaseSfx } from './mp-render.js';
import { tableShelfPayload } from '../core/tasteCompare.js';   // gust etap 3: „🎧 Gust stołu"
import { tasteStore, tasteVisibility, onTaste } from './taste.js';

initMpPicker(mpRender, ()=>mpPlayers(), ()=>mpAvailableModes(S.ch && S.ch.serverModes, SERVER_AUTH), ()=>mpDraftChanged(), ()=>mpTableInfo(), (n)=>mpAvatarColor(n));   // F8a: + tryby znane serwerowi; szkic dla gości; gust etap 3: „Gust stołu" (capability + licznik półek)   // picker re-renderuje widok pokoju + czyta listę graczy (przypisanie do drużyn)
// initMpRender(...) — wstrzyknięcie back-calls do renderu — na KOŃCU pliku (mpSkin to const, nie hoisted)

// wstrzyknij powiązania MP → social (mpMe to współdzielony obiekt). Wołane z app.js po zbudowaniu wirelistu.
export function initMp(){
  initSocial({ mpMe, mpEnterRoom, mpRandCode, mpUnlockAudio, mpAvatarColor, catLabel });
}
// deep-link ?room= — wołane przez app.js PO initMp (showScreen sięga mpMe wstrzykniętego do social)
// F6b (F5/R-F5): przy ZNANEJ ksywie (gracz już grał na tym urządzeniu) link od razu wchodzi do pokoju —
// bez ręcznego „DOŁĄCZ". Nowy gracz (bez ksywy) dostaje wypełniony kod i jeden przycisk, jak dotąd.
export function mpBootDeepLink(){
  const r=new URLSearchParams(location.search).get('room');
  if(!r) return;
  showScreen('mp'); mpSetCode(r);
  const code=mpReadCode();
  const h=knownHandle();
  if(code.length===4 && h){ mpMe.name=h; mpEnterRoom(code, false); mpArmGestureUnlock(); }
  else if(code.length===4) mpDeepAsk(code);   // P2-12: pierwsze wejście — tylko ksywa, potem od razu pokój (bez „DOŁĄCZ")
}
/* P2-12: pierwsze wejście z linku ?room= (brak zapamiętanej ksywy) — arkusz „Jak Cię wołać?" z wylosowaną ksywą do zmiany;
 * „Wchodzę" = gest (odblokowuje audio) → zapis ksywy → od razu do pokoju. Esc / „Nie teraz" → ekran wejścia z wpisanym kodem. */
function mpDeepAsk(code){
  let el=$m('mpDeepDlg');
  if(!el){ el=document.createElement('div'); el.id='mpDeepDlg'; el.className='mp-dlg mp-deep'; document.body.appendChild(el); }
  const sug=pickHandle({ spicy:false });
  el.dataset.code=code;
  el.innerHTML=`<form class="mp-dlg-card" role="dialog" aria-modal="true" aria-labelledby="mpDeepT" onsubmit="event.preventDefault();mpDeepJoin()">
      <b id="mpDeepT">Dołączasz do pokoju ${escapeHtml(code)}</b>
      <small>Jak mają Cię wołać przy stole? Ksywę zmienisz potem w profilu.</small>
      <label class="mp-deep-in"><span class="sr-only">Twoja ksywa</span><input id="mpDeepName" maxlength="32" autocomplete="nickname" enterkeyhint="go" value="${escapeHtml(sug)}" aria-label="Twoja ksywa"></label>
      <div class="mp-dlg-btns"><button type="button" class="mp-dlg-stay" onclick="document.getElementById('mpDeepDlg').classList.remove('show')">Nie teraz</button><button type="submit" class="mp-dlg-go mp-deep-go">Wchodzę →</button></div>
    </form>`;
  el.classList.add('show');
  const inp=$m('mpDeepName'); if(inp) try{ inp.focus(); inp.select(); }catch(_e){}
}
async function mpDeepJoin(){
  const el=$m('mpDeepDlg'); if(!el) return;
  const code=el.dataset.code||mpReadCode();
  const v=(($m('mpDeepName')||{}).value||'').trim().slice(0, 32);
  mpUnlockAudio();   // gest — audio gotowe na fazę słuchania
  el.classList.remove('show');
  if(!code || code.length!==4) return;
  if(v){ mpMe.name=v; saveHandle(v).catch(()=>{}); }   // zapis ksywy (profil) w tle — wejście do pokoju nie czeka na sieć
  else { const n=await ensureHandle(); mpMe.name=n; setHandle(n); }
  mpEnterRoom(code, false);
}
// wejście bez gestu (deep-link, „wróć do pokoju" po przeładowaniu) — odblokuj audio przy PIERWSZYM dotknięciu
function mpArmGestureUnlock(){
  const once=()=>{ document.removeEventListener('pointerdown', once, true); mpUnlockAudio(); };
  document.addEventListener('pointerdown', once, true);
}

/* ================= MULTIPLAYER (Worker Durable Object — relay) ================= */
// Cały współdzielony stan MP (S) + tożsamość gracza (mpMe) → app/mp-state.js.
// TASK 6 — flaga serwer-autorytetu. Default z config.serverAuthority. Override (rollback/test):
// ?authority=1|0 w URL albo localStorage 'stacjaAuthority'='1'|'0' (0 = wymuś relay mimo defaultu true).
const SERVER_AUTH = (()=>{ try{
  const q=new URLSearchParams(location.search).get('authority');
  if(q==='1') return true; if(q==='0') return false;
  const ls=lsGet('stacjaAuthority');   // F2a #11: zablokowany storage nie wymusza relay
  if(ls==='1') return true; if(ls==='0') return false;
  return !!(window.STACJA_CONFIG && window.STACJA_CONFIG.serverAuthority);
}catch(e){ return false; } })();
const $m=id=>document.getElementById(id);
/* nazwane stałe czasowe: core/timing.js (MP_BUFFER_TIMEOUT_MS, MP_SNIP_WINDOW_S, EMOJI_TTL_MS, SAY_TTL_MS) */
// iOS: zajawka MP PRZEJMUJE dźwięk ('playback'); po stopie 'ambient' (UI/klik miksuje, nie pauzuje muzyki w tle)
const audioSession = t => { try{ if(navigator.audioSession) navigator.audioSession.type = t; }catch(e){} };

function mpRandCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++)s+=c[Math.floor(Math.random()*c.length)]; return s; }
function mpErr(t){ $m('mpErr').textContent=t||''; }
/* F6b (F6/R-F6): „Wróć do pokoju ABCD" — rekord {code, at} w sessionStorage (karta przeglądarki), ważny 30 min.
 * Zapis przy wejściu i wyjściu z pokoju; baner w menu i na ekranie „Ze znajomymi" (jeden tap = ponowne dołączenie). */
const LAST_ROOM_KEY='stacjaLastRoom';
function lastRoomSave(code){ try{ if(code) window.sessionStorage.setItem(LAST_ROOM_KEY, JSON.stringify({code, at:Date.now()})); }catch(_e){} }
function lastRoomGet(){ try{ return lastRoomCode(JSON.parse(window.sessionStorage.getItem(LAST_ROOM_KEY)||'null'), Date.now()); }catch(_e){ return null; } }
function mpSyncRoomBack(){
  const code = S.code ? null : lastRoomGet();   // w pokoju — bez banera
  document.querySelectorAll('[data-room-back]').forEach(b=>{
    b.hidden=!code;
    const t=b.querySelector('[data-room-code]'); if(t) t.textContent=code||'';
  });
}
async function mpRejoinLast(){
  const code=lastRoomGet(); if(!code){ mpSyncRoomBack(); return; }
  mpUnlockAudio();   // gest — odblokuj audio przed fazą gotowości
  stopAudio(); stopSpeech();
  showScreen('mp');
  const n=await ensureHandle(); mpMe.name=n; setHandle(n);
  mpEnterRoom(code, false);   // autorytet: rola hosta wróci z presence (hostId), jeśli pokój na nas czekał
}
/* potwierdzenie wyjścia (strzałka w nagłówku gry, „wyjdź" w lobby, ☰ w pickerze) — przypadkowy tap kciukiem
 * w pubie nie wyrzuca z meczu. Własny arkusz (nie window.confirm: blokujący, brzydki na iOS, brak w jsdom). */
function mpConfirmLeave(kind){
  if(!S.code){ mpLeave(); return; }
  let el=$m('mpLeaveDlg');
  if(!el){ el=document.createElement('div'); el.id='mpLeaveDlg'; el.className='mp-dlg'; document.body.appendChild(el); }
  const host = S.host && S.game && S.game.phase!=null && S.game.phase!==MP.DONE;
  el.innerHTML=`<div class="mp-dlg-card" role="dialog" aria-modal="true" aria-labelledby="mpLeaveTitle">
      <b id="mpLeaveTitle">Opuścić pokój ${escapeHtml(S.code)}?</b>
      <small>${host?'Jesteś hostem — gra przejdzie na innego gracza (albo stanie, jeśli zostaniesz sam). ':''}Przez 30 min wrócisz jednym tapnięciem z menu.</small>
      <div class="mp-dlg-btns"><button type="button" class="mp-dlg-stay" onclick="mpLeaveCancel()">Zostań</button><button type="button" class="mp-dlg-go" onclick="mpLeaveConfirmed('${kind==='menu'?'menu':'room'}')">Wyjdź</button></div>
    </div>`;
  el.classList.add('show');
  const stay=el.querySelector('.mp-dlg-stay'); if(stay) try{ stay.focus(); }catch(_e){}
}
function mpLeaveCancel(){ const el=$m('mpLeaveDlg'); if(el) el.classList.remove('show'); }
async function mpLeaveConfirmed(where){
  mpLeaveCancel();
  if(where==='menu'){ mpExitMenu(); return; }
  await mpLeave();
}
// 5.6: pasek „łączę ponownie…" nad ekranem MP (transport emituje status po zerwaniu/powrocie)
function mpNetStatus(s){
  let el=$m('mpNet');
  if(!el){ el=document.createElement('div'); el.id='mpNet'; el.className='mp-net'; document.body.appendChild(el); }
  if(s==='reconnecting'){ el.textContent='łączę ponownie…'; el.classList.add('show'); }
  else { el.classList.remove('show'); }   // 'ok' → schowaj
}
// P1-11: krótki toast nad ekranem MP (zmiana roli hosta itp.) — role="status", znika sam po ~3,2 s
let mpToastTimer=null;
function mpToast(text){
  let el=$m('mpToast');
  if(!el){ el=document.createElement('div'); el.id='mpToast'; el.className='mp-toast'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); document.body.appendChild(el); }
  el.textContent=text; el.classList.add('show');
  if(mpToastTimer) clearTimeout(mpToastTimer);
  mpToastTimer=setTimeout(()=>{ el.classList.remove('show'); mpToastTimer=null; }, 3200);
}
// P1-11: presence z nowym hostId → komunikat roli („Jesteś teraz hostem" / „X znów prowadzi"). Pierwsza presence — bez toastu.
function mpNoteHost(hid){
  if(!hid) return;
  const prev=S.lastHostId;
  S.lastHostId=hid;
  if(prev===undefined || prev===hid){ S.pastHosts.add(hid); return; }
  const again=S.pastHosts.has(hid); S.pastHosts.add(hid);
  if(hid===mpMe.id) mpToast(again ? '👑 Znów prowadzisz' : '👑 Jesteś teraz hostem');
  else mpToast(`👑 ${mpNameOf(hid)||'gracz'} ${again?'znów prowadzi':'prowadzi teraz'}`);
}
// 5.8: podpowiedź linku pokoju z REALNEGO origin (nie hardcode „stacja.app")
try{ const _h=$m('mpLinkHint'); if(_h) _h.textContent=(location.origin+location.pathname).replace(/\/$/,'')+'/?room='; }catch(_e){}

// Sesja LENIWA — tworzona przy geście, który jej potrzebuje (wejście do pokoju MP,
// koniec meczu, ekran profilu/drużyny). ensureSession() woła Worker i cache'uje token.

/* ---- wejście / wyjście z trybu (router ekranów + social) → app/social.js ---- */
// wstrzyknij powiązania z warstwą MP + etykiety kategorii (mpMe to współdzielony obiekt)
$m('goSolo').onclick=()=>{ showScreen('solo'); };
// przełącznik układu gry MP (kolumny/czat) — przeniesiony na ekran główny (ustawienie)
(function wireSkinSeg(){
  const seg=document.getElementById('skinSeg'); if(!seg) return;
  const sync=()=>{ const cur=lsGet('stacjaUI')==='czat'?'czat':'kolumny'; seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.skin===cur)); };
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
// F6b (F6): banery „Wróć do pokoju" (menu + ekran wejścia MP) — odśwież przy każdej zmianie ekranu
document.querySelectorAll('[data-room-back]').forEach(b=> b.onclick=()=>mpRejoinLast());
window.addEventListener('stacja:screen', ()=>mpSyncRoomBack());
mpSyncRoomBack();

async function mpLeave(){
  if(S.code) lastRoomSave(S.code);   // F6b (F6): „Wróć do pokoju ABCD" przez 30 min
  if(S.ch){ try{ await S.ch.unsubscribe(); }catch(e){} S.ch=null; }
  if(S.audio){ try{S.audio.pause();}catch(e){} }   // element trwały — pauza, nie zeruj
  audioSession('ambient');                          // wyjście z pokoju → oddaj dźwięk muzyce w tle
  stopSpeech(); mpStopRev(); listenStop();
  if(S.armTimer){ clearTimeout(S.armTimer); S.armTimer=null; }
  mpNetStatus('ok');   // 5.6: schowaj pasek reconnectu przy wyjściu
  if(S.timerInt){ clearInterval(S.timerInt); S.timerInt=null; }   // 1.8: bez tego tick zostaje po wyjściu (re-enter nie tworzy nowego)
  if(S.startTimer){ clearTimeout(S.startTimer); S.startTimer=null; }
  // F2b #13: wyczyść CAŁY stan faz/liczników poprzedniego pokoju — nowy mecz też zaczyna od playNonce=1,
  // a stary S.playRound=1 + S.sub='kombinuj' dawały 1. pytanie bez fazy „słuchaj" (zajawka bez gałki).
  if(S.subTimer){ clearTimeout(S.subTimer); S.subTimer=null; }
  if(S.audio){ mpClearSnip(S.audio); mpClearArmWait(S.audio); }
  S.playRound=S.playSkin=S.playSub=null; S.sub='sluchaj'; S.composerMode='typ'; S.introUntil=0;
  S.listenStart=0; S.listenDur=0; S.listenNonce=null; S.revealAutoAt=0; S.skipArm=false;
  S.armPending=S.armReported=S.armSeen=null; S.armDeadlineLocal=0;
  S.seenActs.clear(); S.hostSeen.clear(); S.autoLocked=false;
  mpFeedReset(); mpClearTyping();
  S.ready=new Set(); S.lastArmNonce=null;
  advancedSet=new Set(); advancedNonce=null; S.advCount=S.advTotal=0;   // salon: licznik „dalej" graczy
  S.ack=S.revealNonce=S.revealSnap=null;
  S.audioHostOnly=false; S.tickSec=null;
  S.clockSamples=[]; S.clockOff=0; S.netErr=null; S.sawMatch=false; S.lastHostId=undefined; S.pastHosts=new Set(); S.sureArmUntil=0;   // etap A
  if(S.countTimer){ clearTimeout(S.countTimer); S.countTimer=null; } if(S.checkTimer){ clearTimeout(S.checkTimer); S.checkTimer=null; }   // etap B
  S.introNonce=null; S.checkUntil=0; S.revealFx=null; S.cardHead=S.cardInner=null; S.hdPh=S.phFrom=null; S.countSaid=null; S.lyricFold=null;
  S.matchHist=[]; S.donePl=null; S.plPlaying=null; mpGameMenuClose();   // P2-11 / P2-13
  if(S.connTimer){ clearTimeout(S.connTimer); S.connTimer=null; }
  if(S.allDoneTimer){ clearTimeout(S.allDoneTimer); S.allDoneTimer=null; }
  S.code=null; S.host=false; S.salon=false; S.tvOrder=null; S.tvRankBase=null; S.roomStage='wait'; S.draft=null; S.lastView=null; S.game=null; S.hostCurrent=null; S.tally={}; S.lastNonce=null; S.groupId=null;
  $m('mpRoom').style.display='none'; $m('mpLobby').style.display='';
  tvSetMode(false); document.body.classList.remove('salon');   // P1-16: koniec sceny TV — przywróć motyw i mobilną powłokę
  mpLeaveCancel(); mpSyncRoomBack();
}

// F2b #6: każda interakcja na odsłonie odsuwa auto-„dalej" (liczy się BEZCZYNNOŚĆ, nie czas od odsłony)
(function wireRevealActivity(){
  const st=$m('mpStage'); if(!st) return;
  const bump=()=>{ if(S.revealAutoAt && mpRevealPending()) S.revealAutoAt=Date.now()+mpRevealAutoMs(); };
  ['pointerdown','keydown','input'].forEach(ev=>st.addEventListener(ev, bump, true));
})();

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
function mpLobbyStart(){ S.roomStage='build'; mpRender(); mpSendDraft(); }   // host: poczekalnia → „Nowy mecz" (+ szkic dla gości)
function mpLobbyBack(){ S.roomStage='wait'; mpRender(); mpSendDraft(); }     // picker → poczekalnia (wstecz); P1-16: lobby na TV rozsyła szkic
function mpRoomBack(){ mpLeave(); }                           // wyjdź z pokoju → ekran wejścia
function mpExitMenu(){ mpLeave(); stopAudio(); stopSpeech(); showScreen('menu'); }   // ☰ → menu

/* ---- szkic konfiguracji dla gości („Mecz, który ustawia host" — na żywo) ----
 * Host (w pickerze, przed meczem) rozsyła ulotny event `draft` po każdej zmianie (debounce) i gdy ktoś dochodzi
 * do pokoju. Serwer przepuszcza go tylko od hosta, sanityzuje i limituje; stary serwer go odrzuca → goście widzą
 * dotychczasowe „czekamy, aż host ułoży mecz". */
let draftTimer=null;
const mpInLobby=()=> !S.game || S.game.phase==null;
function mpDraftChanged(){ if(!S.host || !S.ch) return; if(draftTimer) clearTimeout(draftTimer); draftTimer=setTimeout(mpSendDraft, 350); }
function mpSendDraft(){
  if(draftTimer){ clearTimeout(draftTimer); draftTimer=null; }
  if(!S.host || !S.ch || !(S.roomStage==='build' || mpTvLobbyOn()) || !mpInLobby()) return;   // P1-16: lobby na TV też rozsyła szkic
  const d=sanitizeDraft(mpDraft()); if(d) S.ch.send({type:'broadcast', event:'draft', payload:d});
}
function mpOnDraft(payload, from){
  if(S.host) return;                                         // własny szkic (relay: self:true) — host ma picker
  const hid=(S.ch && S.ch.hostId) || (S.game && S.game.hostId) || null;
  if(hid && from && from!==hid) return;                      // tylko od hosta (serwer i tak to wymusza)
  const d=sanitizeDraft(payload); if(!d) return;
  // P0-10/P1-17: po meczu (DONE) host układa rewanż → goście widzą szkic na żywo (dawniej tylko w lobby przed meczem)
  S.draft=d; if(mpInLobby() || (S.game && S.game.phase===MP.DONE)) mpRender();
}

async function mpEnterRoom(code, asHost, groupId){
  mpErr('');
  if(!(window.STACJA_CONFIG&&window.STACJA_CONFIG.roomsBase)){ mpErr('Brak połączenia z serwerem (config.js).'); return; }
  const uid=await ensureSession(); if(uid) mpMe.id=uid;   // tożsamość = profile id PRZED presence
  if(S.code!==code) mpPickResetRoom();   // P0-9: salon/format/podział z poprzedniego pokoju nie przechodzą do nowego
  S.code=code; S.host=asHost; S.roomStage='wait'; S.groupId=groupId||null; S.shelfSent=null;   // MVP-3: tag drużyny (host)
  S.enterArgs={ code, asHost:!!asHost, groupId:groupId||null }; S.netErr=null;
  lastRoomSave(code); mpSyncRoomBack();   // F6b (F6): przeładowanie karty w meczu → „Wróć do pokoju" w menu
  $m('mpLobby').style.display='none'; $m('mpRoom').style.display='';
  // P0-8: bez sesji (np. 500 z /api/session) serwer-autorytet odrzuci połączenie (brak tokenu) — dawniej lobby
  // „0 osób · czekamy na graczy…" bez końca. Teraz karta błędu z „spróbuj ponownie".
  S.sessionFail = SERVER_AUTH && !uid;   // bez tokenu DO odrzuci połączenie (4001 → CHANNEL_ERROR) — tekst błędu „brak sesji"
  if(S.connTimer) clearTimeout(S.connTimer);
  S.connTimer=setTimeout(()=>{ S.connTimer=null; if(S.code===code && !S.subscribed){ S.netErr='timeout'; mpRender(); } }, 9000);
  S.subscribed=false;
  // SERVER_AUTH → transport na autorytatywny DO (ta sama powierzchnia); else relay cfChannel.
  // P1-11: ksywa od pierwszego połączenia (serwer zapisuje ją w drużynie/names zanim przyjdzie `track`)
  S.ch=(SERVER_AUTH?authorityChannel:cfChannel)(code, {config:{broadcast:{self:true}, presence:{key:mpMe.id}}, name:mpMe.name});
  // pod autorytetem KAŻDY (też host) bierze stan z DO; w relay tylko nie-host (host jest źródłem).
  // AUTORYTET: 'sync' przychodzi WYŁĄCZNIE z {t:'state'} (roomTransport nie mapuje eventów na stan — F1 #1).
  // RELAY: stan tylko od hosta — gdy serwer podaje nadawcę (`from`), sync od kogoś innego niż host gry odrzucony.
  S.ch.on('broadcast',{event:'sync'},({payload, from, serverNow, recvAt})=>{
    // P1-2: offset zegara serwera (anty-skew) — z każdej ramki stanu; stary serwer bez serverNow → offset 0
    if(serverNow){ S.clockSamples=addClockSample(S.clockSamples, serverNow, recvAt||Date.now()); S.clockOff=clockOffset(S.clockSamples); }
    if(!(SERVER_AUTH || !S.host) || !payload || typeof payload!=='object') return;
    if(!SERVER_AUTH && from && S.game && S.game.hostId && from!==S.game.hostId) return;   // F1: relay — tylko host
    S.game=payload; mpAfterSync();
  });
  S.ch.on('broadcast',{event:'act'},({payload})=>{ if(S.host && !SERVER_AUTH && payload) mpHandleAct(payload); });   // relay-only (serwer wymusza payload.by)
  // F1 (#4): nadawca = `from` wstawione przez serwer z tokenu (stary serwer → fallback na `by`)
  S.ch.on('broadcast',{event:'react'},({payload})=>{ const by=mpSender(payload); if(by && by!==mpMe.id) mpFloatEmoji(payload.emoji, payload.byName); });
  S.ch.on('broadcast',{event:'say'},({payload})=>{ const by=mpSender(payload); if(by && by!==mpMe.id){ mpClearTypingFor(by); mpPushChat(payload.byName, payload.text, false); mpFloatSay(payload.text, payload.byName); } });
  S.ch.on('broadcast',{event:'typing'},({payload})=>{ const by=mpSender(payload); if(by && by!==mpMe.id) mpMarkTyping(by); });
  S.ch.on('broadcast',{event:'draft'},({payload, from})=>mpOnDraft(payload, from || mpSender(payload)));   // szkic meczu od hosta (goście)
  S.ch.on('broadcast',{event:'advanced'},({payload})=>{ const by=mpSender(payload); if(by) mpOnPlayerAdvanced({ ...payload, by }); });   // gracz kliknął „dalej" (P1-4: „Czekamy na"; salon: auto-przejście TV)
  S.ch.on('status',{},(s)=>mpNetStatus(s));   // 5.6: wskaźnik reconnectu
  S.ch.on('presence',{event:'sync'},()=>{
    mpMaybeShareShelf();   // gust etap 3: serwer zna „Gust stołu" → dosyłam swoją półkę (raz na pokój; transport ponawia po reconnect)
    const prevHost=S.host;                                          // 1.5: wykryj zmianę roli hosta (promote)
    // host = autorytatywny hostId z DO. F2b #3: także gdy hostId=null (stary serwer po wyjściu hosta
    // z duplikatem socketu) — dawniej klient zostawał przy S.host=true z przyciskami, które DO odrzucał.
    if(SERVER_AUTH) S.host=(!!S.ch.hostId && S.ch.hostId===mpMe.id);
    if(SERVER_AUTH) mpNoteHost(S.ch.hostId);                         // P1-11: toast przy zmianie roli hosta
    mpRenderMembers();
    // 1.5: zmiana S.host → ZAWSZE re-render (inaczej awansowany host nie zobaczy przycisków hosta;
    //      domyka 1.2 — przycisk „następne" po promocie w REVEAL). Dotąd re-render tylko w lobby.
    if(S.host!==prevHost || !S.game || S.game.phase==null) mpRender();
    if(S.host && (S.roomStage==='build' || mpTvLobbyOn())) mpDraftChanged();   // ktoś doszedł → dośli mu szkic meczu (P1-16: także z lobby na TV)
    if(S.host && !SERVER_AUTH){ mpBroadcast(); mpMaybeGo(); }        // relay: host pcha stan i liczy gotowość (DO robi to sam)
    if(S.host && S.game && S.game.salon && S.game.phase===MP.REVEAL) mpRecountAdvance();   // 1.8: rozłączenie w REVEAL → przelicz „dalej"
    // 1.8: relay nie ma promote — gdy host znika w trakcie meczu, chociaż powiedz to graczom
    if(!SERVER_AUTH && !S.host && S.game && S.game.phase!=null && S.game.hostId && !mpMembers().some(m=>m.id===S.game.hostId)){
      mpErr('Host się rozłączył — poczekajcie na powrót albo wyjdźcie i stwórzcie nowy pokój.');
    }
  });
  S.ch.subscribe(async(status)=>{
    if(status==='SUBSCRIBED'){ S.subscribed=true; S.netErr=null; if(S.connTimer){ clearTimeout(S.connTimer); S.connTimer=null; }
      await S.ch.track({name:mpMe.name}); mpRenderMembers(); mpRender(); }
    else if(status==='CHANNEL_ERROR'){ mpErr('Błąd kanału — spróbuj ponownie.'); S.netErr=S.sessionFail?'session':'channel'; mpRender(); }   // P0-8: widoczne w pokoju
  });
  if(!S.timerInt) S.timerInt=setInterval(mpTickTimer, 500);
}

// P0-8: „spróbuj ponownie" z karty błędu połączenia — wyjdź czysto i wejdź do tego samego pokoju z tą samą rolą
async function mpRetryRoom(){
  const a=S.enterArgs; if(!a) return;
  mpUnlockAudio();
  await mpLeave();
  showScreen('mp');
  mpEnterRoom(a.code, a.asHost, a.groupId);
}
/* gust etap 3: „🎧 Gust stołu" — półka gracza (top 20 ❤️: tytuł/wykonawca/rok) do serwera-autorytetu.
 * Tylko gdy serwer ogłasza capability 'tableTaste' (stary serwer / relay → nic nie wysyłamy), gracz ma ≥ 5 ❤️
 * i NIE ukrył gustu (tableShelfPayload → null). Serwer trzyma półki w stanie pokoju (nie D1). */
/* Dług gustu: ukrycie gustu (albo zmiana półki) W TRAKCIE pobytu w pokoju → aktualizacja: pusta półka {t:'shelf', items:[]}
 * WYCOFUJE wysłaną (serwer kasuje wpis). S.shelfSent = ostatnio wysłana zawartość (JSON) — wysyłamy tylko zmianę. */
function mpMaybeShareShelf(){
  if(!SERVER_AUTH || !S.ch || !S.ch.shareShelf || !S.code) return;
  if(!(S.ch.serverCaps||[]).includes('tableTaste')) return;
  const items=tableShelfPayload(tasteStore(), { visibility:tasteVisibility() }) || [];
  const key=JSON.stringify(items);
  if(S.shelfSent===key) return;
  if(S.shelfSent==null && !items.length){ S.shelfSent=key; return; }   // nic nie wysłano i nie ma czego — bez wiadomości
  S.shelfSent=key;
  S.ch.shareShelf(items);
}
let shelfT=null;   // debounce: seria ❤️ = jedna wiadomość (serwer limituje meta 1/s)
onTaste(()=>{ if(shelfT) clearTimeout(shelfT); shelfT=setTimeout(()=>{ shelfT=null; try{ mpMaybeShareShelf(); }catch(_e){} }, MP_SHELF_DEBOUNCE_MS); });   // ❤️ / ukrycie gustu w trakcie pobytu w pokoju
export const MP_SHELF_DEBOUNCE_MS = 600;
// licznik dla pickera hosta: „półki od 3/4 graczy" (n = utwory przed usunięciem duplikatów — serwer i tak liczy sam)
function mpTableInfo(){
  const cap=!!(SERVER_AUTH && S.ch && (S.ch.serverCaps||[]).includes('tableTaste'));
  const ids=new Set(mpMembers().map(m=>m.id));
  const sh=(cap && Array.isArray(S.ch.shelves) ? S.ch.shelves : []).filter(x=>ids.has(x.id));
  return { cap, relay:!SERVER_AUTH, players:ids.size, withShelf:sh.length, songs:sh.reduce((a,x)=>a+(x.n|0), 0) };
}
/* „Gotowy ✓" w lobby / przy rewanżu — toggle gracza (serwer-autorytet z capability 'lobbyReady'; relay: brak przycisku).
 * Informacja dla hosta („gotowi 3/4") — start NIE jest blokowany. Stan w presence (reset przy starcie i wyjściu). */
const mpLobbyReadyCap = ()=> !!(SERVER_AUTH && S.ch && (S.ch.serverCaps||[]).includes('lobbyReady'));
function mpLobbyReadyToggle(){
  if(!mpLobbyReadyCap() || !S.ch.lobbyReady) return;
  const me=mpMembers().find(m=>m.id===mpMe.id);
  S.ch.lobbyReady(!(me && me.ready));
}
// F1 (#4): nadawca ulotnego eventu — `from` (serwer, z tokenu) ma pierwszeństwo przed `by` (klient)
function mpSender(p){ return (p && typeof p==='object' && (p.from || p.by)) || null; }
function mpMembers(){
  if(!S.ch) return [];
  const st=S.ch.presenceState(); const out=[];
  const names=(S.game && S.game.names) || {};   // P1-11: ksywa ze stanu gry, gdy presence jeszcze bez niej
  const ready=new Set(Array.isArray(S.ch.readyIds) ? S.ch.readyIds : []);   // „Gotowy ✓" (presence.ready; relay/stary serwer → brak)
  Object.keys(st).forEach(k=>{ const meta=st[k][0]||{}; out.push({id:k, name:meta.name||names[k]||'?', adv:meta.adv===true, ready:ready.has(k)}); });
  return out;
}
// GRACZE = członkowie pokoju; w trybie salonowym TV (host) jest tylko prowadzącym, więc poza listą.
// Filtr działa od startu meczu (flaga salon żyje w stanie gry); przed meczem nie znamy roli.
function mpPlayers(){
  const ms=mpMembers(), g=S.game;
  const active=!!(g && g.phase!=null && g.phase!==MP.DONE);
  if(active){
    // P0-1: TV = game.tvId (po wyjściu TV awansowany gracz DALEJ gra); stan bez tvId → host (stary serwer)
    const salon=g.salon||S.salon;                    // S.salon = host-lokalny fallback (przed game.salon z serwera)
    const tv=salon ? (g.tvId || g.hostId) : null;
    return tv ? ms.filter(m=>m.id!==tv) : ms;
  }
  // P0-9: przed meczem / rewanż — salon wg wyboru w pickerze (TV = ten host) → TV poza przydziałem do drużyn
  return (S.host && mpPickSalon) ? ms.filter(m=>m.id!==mpMe.id) : ms;
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
  if(S.game && S.game.salon){ const tv=tvIdOf(S.game); const ps=ids.filter(id=>id!==tv); return ps.length?ps:ids; }
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
/* MP oś czasu: typ gracza = szczelina (tap na osi) + opcjonalne żetony tytuł/wykonawca. Jedna propozycja na gracza
 * (nowa zastępuje starą) → do każdej dołączamy ostatnio wybraną szczelinę i wpisane wcześniej żetony (to pytanie). */
function mpTlMerge(act){
  const g=S.game; if(!g || g.mode!=='timeline' || !act || act.type!=='propose') return;
  const nonce=g.playNonce, v=act.values=act.values||{};
  const mine=(S.tlMine && S.tlMine.nonce===nonce) ? S.tlMine.values : {};
  ['title','artist'].forEach(k=>{ if(!v[k] && mine[k]) v[k]=mine[k]; });
  if(v.gap==null && S.tlPick && S.tlPick.nonce===nonce) v.gap=String(S.tlPick.gap);
  S.tlMine={ nonce, values:{ ...v } };
}
// tap w szczelinę osi (data-gap) — gracz: typ z tą szczeliną; TV-sędzia (coop): nadpisanie głosem drużyny
function mpTlPick(gap){
  const g=S.game; if(!g || g.mode!=='timeline' || g.phase!==MP.PLAY) return;
  const k=Number(gap); if(!Number.isInteger(k) || k<0 || k>99) return;
  if(mpIsSalonHost()){ if((g.format||'coop')==='coop') mpSend({type:'vote', slot:'gap', value:String(k), set:true}); return; }
  S.tlPick={ nonce:g.playNonce, gap:k };
  mpSend({type:'propose', values:{ gap:String(k) }});
}
function mpSend(act){
  mpTlMerge(act);
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
  // F6b (tryb #6): to samo dla „Dźwięk tylko u hosta" — stary serwer wycina flagę z configu; host wie lokalnie.
  // (Nie-host przy starym serwerze flagi nie dostanie → gra jak dotąd; salon działa, bo game.salon serwer odsyła.)
  if(S.host && S.audioHostOnly && S.game && S.game.phase!=null && !S.game.audioHostOnly) S.game.audioHostOnly=true;
  const g=S.game;
  // P0-10: ten klient WIDZIAŁ mecz (dołączający dopiero w DONE dostaje lobby + szkic rewanżu, nie cudzy wynik);
  // szkic sprzed meczu nieaktualny — przy DONE pokazujemy tylko szkic REWANŻU (host wysyła go po „Zmień ustawienia")
  if(g && [MP.LOADING, MP.ARMING, MP.PLAY, MP.REVEAL].includes(g.phase)){ S.sawMatch=true; S.draft=null; }
  // F6b: audio tylko w fazie słuchania — wejście w ODSŁONĘ ucisza zajawkę/lektora (i nie dusi „ding"/oklasków)
  if(g && g.phase===MP.REVEAL && g.reveal && S.revealNonce!==g.playNonce) mpStopAudio();
  // F2b #6: lokalny termin twardego limitu ARMING (serwer wysyła armMs; stary serwer — brak → bez licznika)
  if(g && g.phase===MP.ARMING && g.armMs>0 && S.armSeen!==g.armNonce){ S.armSeen=g.armNonce; S.armDeadlineLocal=Date.now()+g.armMs; }
  // faza gotowości: zbuforuj utwór i zgłoś „ready" — ale TYLKO gdy nie ma odsłony do
  // zamknięcia. Z zaległą odsłoną klient zbroi się dopiero po kliknięciu „dalej".
  if(g && g.phase===MP.ARMING && !mpRevealPending()){
    if(g.armNonce!==S.lastArmNonce) mpArm();          // nowe pytanie → pełne zbrojenie (load zajawki)
    // 1.1: serwer NIE widzi nas na liście gotowych (readyIds) mimo tego samego armNonce — nasze `ready`
    // zginęło (send przy zamkniętym sockecie zwraca false po cichu) → DOSYŁKA samego ready.
    // F2b #12: BEZ ponownego load() (każdy ARMING innego gracza przerywał buforowanie u wolnych);
    // w trakcie buforowania (armPending) nic — ready pójdzie samo po canplay/bezpieczniku.
    // Addytywne: stary serwer bez readyIds → Array.isArray false → bez dosyłki.
    else if(Array.isArray(g.readyIds) && !g.readyIds.includes(mpMe.id) && S.armReported===g.armNonce){
      mpSend({type:'ready', armNonce:g.armNonce});
    }
  }
  // start: zagraj lokalnie gdy zmienił się nonce (audio już zbuforowane → równy start).
  // Render NAJPIERW, żeby gałka/status już istniały, gdy mpPlayLocal ustawia „ładowanie…".
  // F2b #6: z NIEZAMKNIĘTĄ odsłoną start czeka na „dalej" (serwer mógł ruszyć bez nas po limicie ARMING) —
  // wtedy mpAdvance → mpAfterSync odpala fazę z audio „na dogonienie" (dawniej zajawka grała pod odsłoną).
  const startPlay = g && g.phase===MP.PLAY && g.playNonce!==S.lastNonce && !mpRevealPending();
  if(startPlay){
    S.lastNonce=g.playNonce; S.skipArm=false;
    /* P1-1: odliczanie 3-2-1 na karcie pytania w LEAD — termin z playAt SERWERA (core/timing.introEndLocal: playAt − offset
     * zegara + LEAD, przycięty do [teraz, teraz+LEAD]); powrót w trakcie pytania → bez karty. Seam testowy __MP_INTRO_MS__. */
    const now=Date.now(), lead=mpIntroLeadMs();
    const seam = typeof window!=='undefined' && window.__MP_INTRO_MS__!=null;
    const end = seam ? now+lead : introEndLocal({ playAt:g.playAt, clockOff:S.clockOff, serverClock:S.clockSamples.length>0, now, leadMs:lead });
    S.introNonce=g.playNonce; S.introUntil = end-now>20 ? end : 0;
    if(S.countTimer){ clearTimeout(S.countTimer); S.countTimer=null; }
  }
  mpRender();   // w LEAD: karta pytania z odliczaniem (scena „card"); po nim — scaffold fazy „słuchaj"
  // CAŁA faza (okno czasu + audio) startuje DOPIERO po odliczaniu — nic nie gra/tyka pod kartą pytania.
  if(startPlay){
    // P0-7: okno słuchania wg terminu serwera — powrót w trakcie pytania nie daje pełnych 15 s; < 5 s → od razu „kombinuj" (bez audio)
    const begin=()=>{ if(S.game && S.game.phase===MP.PLAY && S.game.playNonce===S.lastNonce){
      S.introUntil=0; mpRender();   // P1-1 krok 2: karta „zwija się" do paska fazy, pod nią winyl + zegar fazy
      if(mpStartListenWindow(S.game)>0){ mpPhaseSfx('sting'); mpPlayLocal(); } } };   // P2-14: sting startu (duck pod zajawkę: sfxDuck na 'playing')
    const wait=(S.introUntil||0)-Date.now();
    if(S.startTimer){ clearTimeout(S.startTimer); S.startTimer=null; }
    if(wait>20) S.startTimer=setTimeout(begin, wait); else begin();
  }
  mpIntroSync();   // MP intro: odsłuch bieżącego etapu od wspólnego stageAt (nowy etap = nowy stan)
}
// czy ten klient ma jeszcze nie zamkniętą („dalej") odsłonę
function mpRevealPending(){ return !!S.revealSnap && S.ack!==S.revealNonce; }
// host: sprawdź, czy można już wystartować pytanie (wszyscy obecni gotowi)
function mpMaybeGo(){
  if(!S.host || !S.game || S.game.phase!==MP.ARMING) return;
  const r=countReady(mpExpectedReady(), S.ready);
  S.game.readyCount=r.count; S.game.readyTotal=r.total; S.game.readyIds=[...S.ready];   // 1.1
  if(r.all){ mpGo(); } else { mpBroadcast(); mpRender(); }
}
// host: zamknij odsłonę u siebie i przejdź do następnego pytania (DO advance / lokalnie)
function mpHostNextReveal(){
  if(!S.host || !S.game || S.game.phase!==MP.REVEAL) return;
  S.ack=S.revealNonce;
  if(SERVER_AUTH){ if(S.ch&&S.ch.next) S.ch.next(); mpRender(); } else mpNext();
}
// 1.3: host ponawia rundę zablokowaną w NETERR/NOLYRIC. Autorytet → komenda retry do DO
// (relay-owe mpHostNewRound serwer i tak ignoruje). Relay → lokalne mpHostNewRound (jak dziś).
function mpHostRetry(){
  if(!S.host || !S.game) return;
  if(SERVER_AUTH){ if(S.ch&&S.ch.retry) S.ch.retry(); }
  else mpHostNewRound();
}
// SALON: host (TV) zlicza, którzy GRACZE kliknęli „dalej" na bieżącej odsłonie, i przechodzi SAM,
// gdy wszyscy gotowi — host nie gra, więc nie wymaga kliku na TV (klik na TV = ręczny „pomiń czekanie").
let advancedSet=new Set(), advancedNonce=null;
// P1-4: KAŻDY klient zbiera, kto kliknął „dalej" na bieżącej odsłonie („Czekamy na: Ola, Kuba" po moim „dalej")
function mpOnPlayerAdvanced(payload){
  if(!S.game || S.game.phase!==MP.REVEAL) return;
  if(!payload || payload.nonce!==S.game.playNonce) return;
  if(advancedNonce!==S.game.playNonce){ advancedSet=new Set(); advancedNonce=S.game.playNonce; }
  if(advancedSet.has(payload.by)) return;
  advancedSet.add(payload.by);
  if(S.host && S.game.salon){ mpRecountAdvance(); return; }
  if(!mpRevealPending()) mpRender();   // odśwież ekran czekania (nie przerysowuj cudzej, wciąż otwartej odsłony)
}
const mpAdvancedIds = (nonce)=> (advancedNonce!=null && advancedNonce===nonce) ? [...advancedSet] : [];
// 1.8: przelicz komplet „dalej" (woła: mpOnPlayerAdvanced ORAZ presence-sync przy rozłączeniu gracza w REVEAL,
// inaczej odejście ostatniego niegotowego gracza zawieszało salon — nikt już nie przyśle „advanced").
function mpRecountAdvance(){
  if(!S.host || !S.game || !S.game.salon || S.game.phase!==MP.REVEAL) return;
  if(advancedNonce!==S.game.playNonce){ advancedSet=new Set(); advancedNonce=S.game.playNonce; }
  const players=mpPlayers().map(m=>m.id);                 // gracze = obecni bez TV
  S.advCount=players.filter(id=>advancedSet.has(id)).length; S.advTotal=players.length;
  mpRender();                                             // odśwież „X/Y gotowych" na TV
  if(players.length>0 && players.every(id=>advancedSet.has(id))) mpHostNextReveal();
}
// „dalej" na ekranie wyniku — KAŻDY klika sam, we własnym tempie
function mpAdvance(){
  if(!S.game) return;
  listenStop();   // Łamigłówki: zamknięcie odsłony ucisza odsłuch utworu-rozwiązania
  S.ack=S.revealNonce; S.revealAutoAt=0;                // zamknij u siebie odsłonę (+ wyłącz auto-„dalej")
  if(S.host && S.game.phase===MP.REVEAL){
    // F2b #6: SALON — klik na TV = „pomiń czekanie" → pomiń też fazę gotowości następnego pytania
    // (TV wyśle {t:go} zaraz po zbuforowaniu własnego audio; telefony dogonią). Auto-przejście
    // po „dalej" wszystkich graczy (mpRecountAdvance) idzie prosto do mpHostNextReveal — bez pomijania.
    if(mpIsSalonHost()) S.skipArm=true;   // P0-1: tylko TV (nie awansowany gracz)
    mpHostNextReveal(); return;                         // host → następne pytanie
  }
  // „kliknąłem dalej" do stołu: SALON — TV przejdzie samo, gdy wszyscy klikną; P1-4 — reszta widzi, na kogo czeka.
  // (stary serwer/relay przepuszcza `advanced` — event istniał dla salonu; stary klient ignoruje go poza salonem)
  if(!S.host && S.game.phase===MP.REVEAL && S.ch){
    S.ch.send({type:'broadcast',event:'advanced',payload:{by:mpMe.id, nonce:S.game.playNonce}});
  }
  // ARMING → zbrój się i zgłoś gotowość; PLAY ruszył bez nas (limit ARMING) → faza z audio na dogonienie
  mpAfterSync();
}
// F2b #6: host „pomiń czekających" w ARMING — autorytet: {t:go} do DO; relay: lokalny start
function mpHostSkipWait(){
  if(!S.host || !S.game || S.game.phase!==MP.ARMING) return;
  if(SERVER_AUTH){ if(S.ch && S.ch.go) S.ch.go(); }
  else mpGo();
}
// F2b #6: salon „pomiń czekanie" — po zgłoszeniu własnej gotowości TV od razu startuje pytanie (jednorazowo)
function mpMaybeSkipArm(armNonce){
  if(!S.skipArm) return;
  const now = S.host && S.game && S.game.phase===MP.ARMING && S.game.armNonce===armNonce;
  S.skipArm=false;
  if(now) mpHostSkipWait();
}
// stany kontrolki (płyta winylowa, app/vinyl.js): 'pause' (gra), 'wait' (ładowanie), 'play' (idle/pauza),
// 'replay' (fragment dograł — ↻), 'error' (brak zajawki). Ikona środka w #mpKnobIcon.
function mpSetKnob(state){
  if(state===true) state='pause'; if(state===false) state='play';
  mpVinyl.fromKnob(state);
  // P2-7: lektor ma ikonę mikrofonu (nie płytę) — „czyta" = klasa .on + aria-pressed
  const k=$m('mpKnob'); if(k && k.classList.contains('mp-lektor')){ k.classList.toggle('on', state==='pause'); k.setAttribute('aria-pressed', state==='pause'?'true':'false'); }
}
function mpSetPlayStatus(t){ const e=$m('mpPlayStatus'); if(e) e.textContent=t; }
// JEDEN trwały element audio dla MP — odblokowany gestem (mobilna autoplay-policy),
// reużywany co rundę przez podmianę .src. Zdarzenia gałki wpinane raz — gałka i status
// JADĄ ZA REALNYMI zdarzeniami odtwarzacza (koniec rozjazdu ikona vs dźwięk).
function mpEnsureAudio(){
  if(!S.audio){
    S.audio=new Audio(); S.audio.preload='auto';
    S.audio.addEventListener('playing',()=>{ sfxDuck(); mpSetKnob('pause'); mpSetPlayStatus(S.game&&S.game.mode==='snippet'?'gra fragment…':'gra…'); });   // P2-14: ogon stingu ściszony pod zajawkę
    S.audio.addEventListener('waiting',()=>{ mpSetKnob('wait'); mpSetPlayStatus('ładowanie…'); });
    S.audio.addEventListener('stalled',()=>{ mpSetKnob('wait'); mpSetPlayStatus('ładowanie…'); });
    S.audio.addEventListener('pause',  ()=>{ if(S.audio.ended) return;
      if(S.audio._snipEnd){ mpSetKnob('replay'); mpSetPlayStatus('fragment '+SNIP_SECS+'s · ↻ jeszcze raz'); }   // fragment dograł → replay
      else { mpSetKnob('play'); mpSetPlayStatus('pauza · ▶ stuknij'); } });
    S.audio.addEventListener('ended',  ()=>{ mpSetKnob('play'); mpSetPlayStatus('koniec · ↻ stuknij'); });
    S.audio.addEventListener('timeupdate',()=>{ const a=S.audio; mpVinyl.setProgress(a.duration ? a.currentTime/a.duration : 0); });   // postęp na obwodzie płyty
    S.audio.addEventListener('error',  ()=>{ mpSetKnob('error'); mpSetPlayStatus('brak zajawki — kombinujcie bez niej'); });   // 1.8: 404/stall zajawki nie zawiesza rundy
  }
  return S.audio;
}
// odblokuj audio w geście (tworzenie/dołączanie/start/stuknięcie gałki) — bez tego
// host nie usłyszy muzyki, bo play() leci poza gestem (po fazie gotowości)
function mpUnlockAudio(){ unlockCtx(); unlockAudioElement(mpEnsureAudio()); unlockListen(); }
// usuń ewentualny watchdog fragmentu z poprzedniej rundy (element jest trwały)
function mpClearSnip(a){ if(a._snipStop){ a.removeEventListener('timeupdate', a._snipStop); a._snipStop=null; } }

// faza gotowości — preload zajawki na trwałym elemencie, potem zgłoś hostowi „ready" (#4).
// Wołane RAZ na armNonce (F2b #12: dosyłka ready z mpAfterSync nie przeładowuje zajawki).
const ARM_EVENTS=['canplaythrough','canplay','error'];   // error też → zgłoś (host nie utknie)
function mpClearArmWait(a){
  const w=a && a._armWait; if(!w) return;
  ARM_EVENTS.forEach(ev=>a.removeEventListener(ev, w.fn)); clearTimeout(w.t); a._armWait=null;
}
function mpArm(){
  mpSetKnob(false);
  listenStop();   // nowe pytanie — odsłuch poprzedniej odsłony (np. host poszedł dalej) milknie
  const armNonce=S.game.armNonce;
  S.lastArmNonce=armNonce;   // ta runda już zbrojona przez tego klienta (anty-dublowanie)
  const report=()=>{ S.armPending=null; S.armReported=armNonce; mpSend({type:'ready', armNonce}); mpMaybeSkipArm(armNonce); };
  // lektor / brak zajawki — nic do buforowania, gotów od razu.
  // F6b (tryb #6): pilot (dźwięk tylko u hosta) nie buforuje zajawki — gotów od razu (oszczędza transfer)
  if(S.game.mode==='lektor' || !S.game.preview || !playsAudioLocally(S.game, mpMe.id)){ report(); return; }
  // MP składanka: gotowość dopiero, gdy WSZYSTKIE wycinki pobrane i sklejone (loadMedley — ten sam kod co solo)
  if(S.game.mode==='medley' && Array.isArray(S.game.medley) && S.game.medley.length){
    S.armPending=armNonce;
    let done=false; const fin=()=>{ if(done) return; done=true; clearTimeout(t); if(S.lastArmNonce===armNonce) report(); };
    const t=setTimeout(fin, MP_MEDLEY_BUFFER_MS);   // bezpiecznik (serwer i tak rusza po twardym limicie ARMING)
    mpMedleyLoad(S.game, armNonce).then(fin, fin);
    return;
  }
  const a=mpEnsureAudio(); mpClearSnip(a); mpClearArmWait(a);   // listenery poprzedniej rundy precz (bez kumulacji)
  setElementRate(a, 1);   // EKSPERYMENT: trwały element — tempo z poprzedniej rundy (zapas „obrotów") wraca do 1.0×
  if(a.src!==S.game.preview) a.src=S.game.preview;
  S.armPending=armNonce;
  let done=false;
  const ready=()=>{ if(done) return; done=true; mpClearArmWait(a); if(S.lastArmNonce===armNonce) report(); };
  a._armWait={ fn:ready, t:setTimeout(ready, MP_BUFFER_TIMEOUT_MS) };   // bezpiecznik
  ARM_EVENTS.forEach(ev=>a.addEventListener(ev, ready));
  a.load();
}
function mpStopRev(){ if(S.revSrc){ S.revSrc.stop(); S.revSrc=null; } }   // uchwyt z playReverse
// 1.8: rozróżnij autoplay-block (poproś o gest) od realnego braku zajawki (graj bez niej, bez pętli).
function mpPlayBlocked(err){
  mpSetKnob('play');
  if(err && err.name==='NotAllowedError') mpSetPlayStatus('stuknij ▶, by odtworzyć');   // gest wymagany
  else { mpSetKnob('error'); mpSetPlayStatus('brak zajawki — kombinujcie bez niej'); }  // 404/CORS/uszkodzona
}
/* MP składanka: 4 zajawki (game.medley: URL + start wycinka od serwera) → app/audio.loadMedley skleja 4 × 1,5 s z przerwą
 * i „tikiem" (ten sam bufor co solo) — raz na pytanie (klucz armNonce); spóźniony klient ładuje w PLAY. */
const MP_MEDLEY_BUFFER_MS = 11000;
function mpMedleyLoad(g, nonce){
  if(S.medleyCur && S.medleyCur.nonce===nonce) return S.medleyCur.p;
  const cur={ nonce, clips:(g.medley||[]).map(c=>({ preview:c.preview, start:Number(c.start) })) };
  cur.p=loadMedley(cur, { alive:()=>!!S.game && S.game.armNonce===nonce }).catch(()=>0);
  S.medleyCur=cur;
  return cur.p;
}
async function mpPlayMedley(){
  const g=S.game; if(!g) return;
  mpStopRev(); if(S.audio){ try{ S.audio.pause(); }catch(e){} }
  mpSetKnob('wait'); mpSetPlayStatus('ładuję składankę…');
  await mpMedleyLoad(g, g.armNonce);
  const cur=S.medleyCur;
  if(!S.game || S.game.armNonce!==cur.nonce || S.game.phase!==MP.PLAY) return;   // runda zmieniła się w trakcie ładowania
  if(!cur.medleyBuf){ mpPlayMedleyEl(cur); return; }   // WebAudio/CORS padło → zapas na trwałym elemencie (jak solo)
  const ctx=await ensureCtxResumed();
  if(!S.game || S.game.armNonce!==cur.nonce) return;
  const n=(cur.clips||[]).filter(c=>c.ok).length || cur.clips.length, buf=cur.medleyBuf;
  let last='';
  mpStopRev();
  S.revSrc=playBuffer(ctx, buf, {
    onProgress:f=>{ mpVinyl.setProgress(f); const tx=medleyLabel(f*(buf.duration||0), n); if(tx!==last && !/^koniec/.test(tx)){ last=tx; mpSetPlayStatus(tx); } },
    onEnded:()=>{ S.revSrc=null; mpSetKnob('play'); mpSetPlayStatus('koniec składanki · ↻ stuknij'); },
  });
  sfxDuck(); mpSetKnob('pause'); mpSetPlayStatus(medleyLabel(0, n));
}
/* ZAPAS składanki (jak solo app/audio startMedleyEl): kolejne wycinki na TRWAŁYM elemencie — seek do startu od serwera,
 * 1,5 s gry, przerwa 3 s — mniej precyzyjnie niż sklejony bufor, ale gra. Token rundy: nowa składanka/stop przerywa. */
function mpPlayMedleyEl(cur){
  const clips=(cur.clips||[]).filter(c=>c && c.preview); if(!clips.length){ mpSetKnob('error'); mpSetPlayStatus('składanka niedostępna — kombinujcie bez niej'); return; }
  const a=mpEnsureAudio(); mpClearSnip(a); setElementRate(a, 1);
  const tok=S.medleyElTok={}; const alive=()=>S.medleyElTok===tok && S.game && S.game.armNonce===cur.nonce && S.game.phase===MP.PLAY;
  const wait=ms=>new Promise(r=>setTimeout(r, ms));
  audioSession('playback'); sfxDuck(); mpSetKnob('pause');
  (async()=>{
    await wait(MEDLEY_LEAD_S*1000);
    for(let i=0;i<clips.length && alive();i++){
      const c=clips[i];
      if(a.src!==c.preview) a.src=c.preview;
      const seek=()=>{ try{ a.currentTime=Number(c.start)||10; }catch(_e){} };
      if(a.readyState>=1) seek(); else a.addEventListener('loadedmetadata', seek, {once:true});
      try{ await a.play(); }catch(_e){ mpPlayBlocked(_e); return; }
      setTimeout(()=>{ if(alive()) mpSetPlayStatus(`fragment ${i+1}/${clips.length}…`); }, 0);   // po statusie „gra…" elementu
      await wait(MEDLEY_CLIP_S*1000); try{ a.pause(); }catch(_e){}
      if(i<clips.length-1){ if(!alive()) return; mpSetPlayStatus(`przerwa · zaraz fragment ${i+2}/${clips.length}`); await wait(MEDLEY_GAP_S*1000); }
    }
    if(alive()){ mpSetKnob('play'); mpSetPlayStatus('koniec składanki · ↻ stuknij'); }
  })();
}
// gałka = TOGGLE: gra → pauza; pauza → wznów; koniec/świeże → od nowa (#bug2: dotąd zawsze restart)
function mpKnobTap(){
  if(!S.game) return mpPlayLocal();
  if(!playsAudioLocally(S.game, mpMe.id)){ mpSetPlayStatus('🔈 dźwięk gra u hosta — słuchaj z jego głośnika'); return; }   // F6b: pilot
  const mode=S.game.mode;
  if(mode==='lektor'){
    const speaking=isSpeaking();
    if(speaking){ lektorStop(); mpSetKnob('play'); mpSetPlayStatus('pauza · ▶ stuknij'); return; }
    return mpPlayLocal();
  }
  if(mode==='reverse' || mode==='revsnip' || isTempoMode(mode) || mode==='medley'){   // EKSPERYMENT: + „od tyłu krótko", + obroty, + składanka (bufor WebAudio)
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
  // F6b (tryb #6 „Jeden głośnik"): nie-host nie odtwarza zajawki ani lektora — słucha z głośnika hosta/TV
  if(S.game && !playsAudioLocally(S.game, mpMe.id)){
    mpSetKnob('play');
    // P1-16: w SALONIE zostaw „Patrz na TV" (render) — „głośnik hosta" tylko w trybie „Dźwięk tylko u hosta" bez TV
    if(!S.game.salon) mpSetPlayStatus('🔈 słuchaj z głośnika hosta');
    return;
  }
  audioSession('playback');   // zajawka przejmuje dźwięk
  lektorStop(); mpStopRev();
  // język opisu z kategorii (host/serwer → S.game.lyricLang; stary serwer/host bez pola → 'pl')
  if(S.game.mode==='lektor'){ sfxDuck(); mpSetKnob('pause'); mpSetPlayStatus('lektor czyta…'); if(S.game.lyric) lektorPlay(S.game.lyric, S.game.ttsUrl, ()=>{}, { lang:lektorLang(S.game.lyricLang) }); return; }
  if(!S.game.preview){ mpSetPlayStatus('brak zajawki'); return; }
  if(S.game.mode==='reverse' || S.game.mode==='revsnip'){ return mpPlayReverse(); }   // EKSPERYMENT: + od tyłu krótko
  if(S.game.mode==='medley' && Array.isArray(S.game.medley)){ return mpPlayMedley(); }   // MP składanka: 4 × 1,5 s sklejone lokalnie
  if(isTempoMode(S.game.mode) && S.game.phase!==MP.REVEAL){ return mpPlayTempo(); }   // EKSPERYMENT: zwolnione / przyspieszone obroty
  // music / snippet — trwały, odblokowany element; src ustawiony już w fazie gotowości
  const a=mpEnsureAudio(); mpClearSnip(a);
  setElementRate(a, 1);   // EKSPERYMENT: zawsze oryginalne tempo (zapas obrotów mógł zostawić inne)
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
  // EKSPERYMENT „od tyłu krótko": odwracane tylko okno 3 s kończące się w S.game.snipStart (losuje autorytet, F2b)
  const win = S.game.mode==='revsnip' ? revsnipWindow(S.game.snipStart||8, 0) : null;
  const r=await playReverse(ctx, url, {
    cfg: window.STACJA_CONFIG, window: win || undefined,
    shouldPlay: ()=>S.game.preview===url,    // runda mogła się zmienić w trakcie dekodowania
    onProgress: f=>mpVinyl.setProgress(f),
    onEnded: ()=>{ mpSetKnob('play'); mpSetPlayStatus('koniec · ↻ stuknij'); },
  });
  if(r.ok){ sfxDuck(); S.revSrc=r; mpSetKnob('pause'); mpSetPlayStatus('gra od tyłu…'); return; }
  if(r.aborted) return;                       // cisza — runda już inna
  // CORS/dekodowanie padło → zagraj normalnie (ten sam trwały element z eventami)
  const a=mpEnsureAudio(); a.src=url; a.play().catch(mpPlayBlocked);
}
/* EKSPERYMENT: „zwolnione obroty" / „przyspieszone" w MP — tempo LOKALNE u każdego klienta, bez etapów (core/timing.mpTempoRate:
 * stałe 0.6× / 1.5×); serwer/host niesie tylko game.mode (pytanie jak „muzyka", mnożnik w core/mpReducer). Tor jak „od tyłu":
 * WebAudio AudioBufferSourceNode.playbackRate (tempo + wysokość; deterministycznie także na iOS), zajawka zdekodowana raz
 * (S.tempoCache — ↻ bez ponownego pobierania). Zapas (CORS/dekodowanie): trwały element z playbackRate + preservesPitch=false. */
async function mpPlayTempo(){
  if(S.audio){ try{ S.audio.pause(); }catch(e){} }
  const url=S.game.preview, rate=mpTempoRate(S.game.mode), tx=String(rate).replace('.',',')+'×';
  mpSetKnob('wait'); mpSetPlayStatus('kładę płytę…');
  try{
    const ctx=await ensureCtxResumed();
    let dec = S.tempoCache && S.tempoCache.url===url ? S.tempoCache.decoded : null;
    if(!dec){ dec=await decodeAudio(ctx, url, window.STACJA_CONFIG); S.tempoCache={ url, decoded:dec }; }
    if(!S.game || S.game.preview!==url) return;            // runda zmieniła się w trakcie dekodowania → cisza
    mpStopRev();
    S.revSrc=playBuffer(ctx, dec, { rate, onProgress:f=>mpVinyl.setProgress(f), onEnded:()=>{ S.revSrc=null; mpSetKnob('play'); mpSetPlayStatus('koniec · ↻ stuknij'); } });
    mpSetKnob('pause'); mpSetPlayStatus(rate<1 ? `🐢 gra wolniej (${tx})…` : `🐿 gra szybciej (${tx})…`);
  }catch(_e){
    if(!S.game || S.game.preview!==url) return;
    const a=mpEnsureAudio(); mpClearSnip(a);
    if(a.src!==url) a.src=url;
    setElementRate(a, rate);
    try{ a.currentTime=0; }catch(e){}
    a.play().catch(mpPlayBlocked);
  }
}
/* ---- MP intro (serwer-autorytet): etap k gra [0, game.stageSecs] zajawki od WSPÓLNEGO startu game.stageAt ----
 * Termin z zegara serwera (− offset S.clockOff) — bez lokalnych timerów odsłony: każdy nowy etap przychodzi w stanie.
 * Spóźniony klient (reconnect/odbiór po starcie) wchodzi w trakcie okna; po jego końcu — cisza do następnego etapu.
 * Salon / „Jeden głośnik": gra tylko TV/host (playsAudioLocally). Zajawka zbuforowana w ARMING (pełny plik, mpArm). */
function mpIntroClear(){ const t=S.introAud; if(t){ clearTimeout(t.start); clearTimeout(t.stop); } S.introAud=null; }
function mpIntroSync(){
  const g=S.game;
  if(!g || g.mode!=='intro' || g.phase!==MP.PLAY || mpRevealPending() || !Number.isFinite(g.stageAt)){ if(S.introAud) mpIntroClear(); return; }
  const key=`${g.playNonce}:${g.stage}:${g.stageAt}`;
  if(S.introAud && S.introAud.key===key) return;
  mpIntroClear();
  const aud={ key }; S.introAud=aud;
  if(!g.preview || !playsAudioLocally(g, mpMe.id)) return;
  const secs=Number(g.stageSecs)>0 ? Number(g.stageSecs) : introStageSecs(g.stage);
  const startLocal=g.stageAt-(S.clockOff||0);
  const fire=()=>{ if(S.introAud===aud) mpIntroPlay(secs, Math.max(0, Date.now()-startLocal)); };
  const wait=startLocal-Date.now();
  if(wait>20) aud.start=setTimeout(fire, wait); else fire();
}
// zagraj [from, secs] s od początku zajawki (trwały element — odblokowany gestem, zbuforowany w ARMING)
function mpIntroPlay(secs, fromMs=0){
  const g=S.game; if(!g || !g.preview) return;
  const from=Math.max(0, fromMs/1000); if(from>=secs) return;   // spóźnienie dłuższe niż etap — cisza do następnego
  const a=mpEnsureAudio(); mpClearSnip(a); setElementRate(a, 1);
  if(a.src!==g.preview) a.src=g.preview;
  audioSession('playback'); sfxDuck();
  const seek=()=>{ try{ a.currentTime=from; }catch(e){} };
  if(a.readyState>=1) seek(); else a.addEventListener('loadedmetadata', seek, {once:true});
  const stop=()=>{ if(a.currentTime>=secs){ a.pause(); mpClearSnip(a); } };   // zapas: timeupdate (≈4 Hz) za timerem
  a._snipStop=stop; a.addEventListener('timeupdate', stop);
  const aud=S.introAud || (S.introAud={ key:'replay' });
  clearTimeout(aud.stop); aud.stop=setTimeout(()=>{ try{ a.pause(); }catch(e){} mpClearSnip(a); }, (secs-from)*1000);
  a.play().catch(()=>{ const el=$m('mpStgSt'); if(el) el.textContent='🔇 stuknij „↻ odsłuchaj", by słyszeć'; });
}
// „↻ odsłuchaj" — bieżący etap od początku, tylko u mnie (gest odblokowuje audio na iOS)
function mpIntroReplay(){
  const g=S.game; if(!g || g.mode!=='intro' || g.phase!==MP.PLAY || !playsAudioLocally(g, mpMe.id)) return;
  mpUnlockAudio();
  mpIntroPlay(Number(g.stageSecs)>0 ? Number(g.stageSecs) : introStageSecs(g.stage), 0);
}
// „+ więcej" (intro) / „wyraźniej" (okładka) — dowolny gracz prosi serwer o następny etap wcześniej (nonce + etap)
function mpMoreStage(){
  const g=S.game;
  if(!SERVER_AUTH || !g || g.phase!==MP.PLAY || !Array.isArray(g.stageStarts) || !(g.stage+1<g.stageStarts.length)) return;
  const key=`${g.playNonce}:${g.stage}`; if(S.moreSent===key) return;
  if(g.mode==='intro') mpUnlockAudio();   // gest → następny etap zagra też na iOS
  S.moreSent=key;
  if(S.ch && S.ch.more) S.ch.more(g.playNonce, g.stage);
  mpRender();
}
// host: wszyscy gotowi (lub timeout) → równoczesny start u wszystkich
function mpGo(){
  if(!S.host || !S.game || S.game.phase!==MP.ARMING) return;
  if(S.armTimer){ clearTimeout(S.armTimer); S.armTimer=null; }
  S.game.phase=assertMp(S.game.phase, MP.PLAY, console.warn); S.game.playNonce=(S.game.playNonce||0)+1;
  S.game.playAt=Date.now();   // F6a: start PLAY → bonus za szybkość (do zatwierdzenia)
  // P1-2: relay-host = autorytet — ta sama semantyka co serwer (czas na odpowiedź PO słuchaniu)
  const cat=ALL_CATS[S.game.catKey];
  const dl=phaseDeadlines({ playAt:S.game.playAt, leadMs:MP_INTRO_MS, listenMs:_listenSecs(S.game.mode, cat && cat.listenSecs)*1000, timerS:S.game.timer });
  S.game.listenEndsAt=dl.listenEndsAt; S.game.endsAt=dl.endsAt; S.game.allDoneAt=null;
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
    S.game.readyCount=r.count; S.game.readyTotal=r.total; S.game.readyIds=[...S.ready];   // 1.1
    if(r.all){ mpGo(); return; }                   // wszyscy gotowi → start
    mpBroadcast(); mpRender();
    return;
  }
  // pozostałe akcje gry: czysty reducer (propose/unpropose/vote/sure)
  if(reduceAction(S.game, a)){ mpBroadcast(); mpRender(); mpRelayAllDone(); }
}
// P1-3 (relay-host = autorytet): wszyscy obecni gracze mają typ/pas → zamknij po karencji (jak serwer)
function mpRelayAllDone(){
  if(SERVER_AUTH || !S.host || !S.game || S.game.phase!==MP.PLAY) return;
  const done=allSettled(S.game, mpPlayers().map(m=>m.id));
  if(done && !S.game.allDoneAt){
    S.game.allDoneAt=Date.now()+MP_ALL_DONE_GRACE_MS; const nonce=S.game.playNonce;
    if(S.allDoneTimer) clearTimeout(S.allDoneTimer);
    S.allDoneTimer=setTimeout(()=>{ S.allDoneTimer=null; if(S.game && S.game.phase===MP.PLAY && S.game.playNonce===nonce && S.game.allDoneAt) mpLock(); }, MP_ALL_DONE_GRACE_MS);
    mpBroadcast(); mpRender();
  } else if(!done && S.game.allDoneAt){
    S.game.allDoneAt=null; if(S.allDoneTimer){ clearTimeout(S.allDoneTimer); S.allDoneTimer=null; }
    mpBroadcast(); mpRender();
  }
}

/* ---- host: start gry / runda ---- */
/* ---- host: ekran układania meczu (multi-select, jak solo) ---- */
function mpStart(){
  mpAvailModes();   // F8a: wytnij tryby, których pokój nie obsłuży (stary serwer)
  const r=buildMatch([...mpPickCats],[...mpPickModes],{questions:mpPickQuestions});   // F6a: długość w pytaniach
  if(r.error||!r.slots){ mpRender(); return; }
  mpUnlockAudio();   // gest hosta — odblokuj audio, zanim muzyka ruszy po fazie gotowości
  S.salon=!!mpPickSalon;   // host-lokalny fallback — działa nim serwer odeśle game.salon (i bez deployu DO)
  S.audioHostOnly=mpPickAudioHostOnly();   // F6b (tryb #6): j.w. dla „Dźwięk tylko u hosta" (salon ⇒ zawsze)
  if(SERVER_AUTH){
    // AUTORYTET: wgraj pule wybranych kategorii i oddaj sterowanie DO (on zbuduje mecz i przyśle stan).
    S.host=true; S.tally={}; S.ack=S.revealNonce=S.revealSnap=null;
    const pools=mpBuildPools([...mpPickCats], [...mpPickModes]);
    // format + przypisania MUSZĄ iść w configu — inaczej DO buduje zawsze coop (Solo/Drużyny „nie działają")
    const assignments = mpPickFormat==='teams' ? mpTeamsFromAssign(mpPlayers()) : undefined;
    if(S.ch && S.ch.startMatch) S.ch.startMatch({ questions:clampQuestions(mpPickQuestions), rounds:clampRounds(roundsForQuestions(mpPickQuestions)), timer:clampTimer(mpPickTimer), modes:[...mpPickModes], pools, salon:mpPickSalon, audioHostOnly:S.audioHostOnly, format:mpPickFormat, assignments, groupId:S.groupId });
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
    reveal:null, results:[], preview:'', lyric:'', playNonce:0, salon:mpPickSalon, audioHostOnly:S.audioHostOnly,
    timer:mpPickTimer||0, endsAt:null, beerTally:{}, streaks:{}, playAt:null, groupId:S.groupId,   // MVP-3: tag drużyny (relay)
    tvId: mpPickSalon ? mpMe.id : null, listenEndsAt:null, allDoneAt:null};   // P0-1 / P1-2 / P1-3
  if(r.qpc) S.game.qpc=r.qpc;   // P1-7: krótki mecz — 1 pytanie na slot
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
  S.game.reveal=null; S.game.locked=null; S.game.endsAt=null; S.game.playAt=null; S.autoLocked=false; S.game.promptStyle='';
  S.game.listenEndsAt=null; S.game.allDoneAt=null; if(S.allDoneTimer){ clearTimeout(S.allDoneTimer); S.allDoneTimer=null; }
  mpBroadcast(); mpRender();
  const catKey = S.game.catKey==='rnd' ? ALL_KEYS[Math.floor(Math.random()*ALL_KEYS.length)] : S.game.catKey;
  // MP okładka tylko pod serwerem-autorytetem (core/match.AUTHORITY_ONLY_MODES) — relay-host gra takie pytanie jak muzykę
  if(AUTHORITY_ONLY_MODES.includes(S.game.mode)){ S.game.mode='music'; S.game.answerSlots=null; }
  if(S.game.mode==='quiz'){
    // F3 #5: host (relay) losuje po stronie klienta → ten sam trwały seen-set co solo (+ hostSeen w obrębie meczu)
    const all=((ALL_CATS[catKey]&&ALL_CATS[catKey].questions)||[]).filter(q=>q.prompt&&!S.hostSeen.has(quizKey(q)));
    if(!all.length){ S.game.phase=MP.NOLYRIC; S.game.netReason='noquiz'; mpBroadcast(); mpRender(); return; }
    const qs=quizFreshPool(catKey, all);
    const q=qs[Math.floor(Math.random()*qs.length)];
    // F3 #3: tasowanie ABCD po stronie AUTORYTATYWNEJ (host) — wszyscy widzą ten sam prompt; litera/answers
    // zostają w S.hostCurrent (sekret hosta) i trafiają do stanu dopiero w reveal
    const sq=quizTake(catKey, q);
    // Łamigłówki: listen (utwór-rozwiązanie) = sekret hosta jak answers — do stanu dopiero w reveal (evaluateAnswer)
    S.hostCurrent={prompt:sq.prompt, slots:sq.slots, answers:sq.answers, pool:sq.pool, fun:sq.fun||'', mc:sq.mc||null,
      partial:sq.partial===true, display:sq.display==='rebus'?'rebus':'', listen:quizListen(sq), track:'', artist:'', year:'', album:'', art:'', preview:'', lyric:''};
    S.hostSeen.add(quizKey(q));
    S.game.answerSlots=sq.slots; S.game.prompt=sq.prompt; S.game.preview=''; S.game.lyric=''; S.game.ttsUrl='';
    S.game.promptStyle = sq.display==='rebus' ? 'rebus' : '';
  } else if(S.game.mode==='lektor'){
    const songs=((ALL_CATS[catKey]&&ALL_CATS[catKey].songs)||[]).filter(s=>s.lyric&&!S.hostSeen.has(norm(s.title)));
    if(!songs.length){ S.game.phase=MP.NOLYRIC; mpBroadcast(); mpRender(); return; }
    const s=songs[Math.floor(Math.random()*songs.length)];
    S.hostCurrent={track:s.title, artist:s.artist, year:s.year||'', album:s.album||'', art:'', preview:'', lyric:s.lyric};
    S.hostSeen.add(norm(s.title));
    S.game.lyric=s.lyric; S.game.preview=''; S.game.ttsUrl=s.tts||''; S.game.prompt=''; S.game.answerSlots=null;
    S.game.lyricLang=catLektorLang(ALL_CATS[catKey]);   // głos lektora u wszystkich w języku opisu kategorii
  } else {
    // audio (muzyka/od tyłu/fragment) — playlistę i pulę wykonawców rozwiązuje repozytorium
    const t=await resolveTrack({cat:ALL_CATS[catKey], seen:S.hostSeen, cfg:window.STACJA_CONFIG});
    if(t.error){ S.game.phase=MP.NETERR; S.game.netReason=t.reason; mpBroadcast(); mpRender(); return; }
    S.hostCurrent={...t, lyric:''};
    S.game.preview=t.preview; S.game.lyric=''; S.game.ttsUrl=''; S.game.prompt=''; S.game.answerSlots=null;
    const cat=ALL_CATS[catKey]||{};
    if(S.game.mode==='year'){
      // F8a „rok" (relay-host = autorytet): jeden slot liczbowy; brak roku → pytanie jak muzyka
      if(parseYear(t.year)==null) S.game.mode='music';
      else { S.game.answerSlots=slotsFor('year'); if(!yearReliable(t.year, cat.range, t.yearSrc)) S.hostCurrent.yearNote='rok wg wydania w iTunes'; }
    } else if(S.game.mode==='abcd'){
      // F8a „abcd": host generuje kafle; poprawna litera zostaje w S.hostCurrent (sekret) do odsłony
      let ds=[]; try{ ds=await resolveDistractors({ cat, correct:t, cfg:window.STACJA_CONFIG }); }catch(_e){ ds=[]; }
      if(!S.game || S.game.phase!==MP.LOADING) return;   // pokój/mecz zmienił się w trakcie pobierania
      const q=buildTrackMC(t, ds);
      if(q){ Object.assign(S.hostCurrent, { prompt:q.prompt, slots:q.slots, answers:q.answers, mc:q.mc }); S.game.answerSlots=q.slots; S.game.prompt=q.prompt; }
      else S.game.mode='music';
    }
  }
  // RESET slotów dla muzyki/lektora → DEFAULT (tytuł+wykonawca). Bez tego runda audio po quizie
  // dziedziczy sloty quizu (np. a/b/c/d) → złe pola wpisywania + zła ocena/odsłona (rozjazd answerSlots).
  // dla fragmentu: jedno wspólne okno 2 s u wszystkich (host losuje, broadcast)
  S.game.snipStart = mpSnipOffset(S.game.mode);   // fragment: start okna 2 s; EKSP. od tyłu krótko: koniec okna 3 s
  // —— FAZA GOTOWOŚCI (#4): roześlij utwór, poczekaj aż wszyscy zbuforują, dopiero start ——
  S.game.phase=MP.ARMING; S.game.armNonce=(S.game.armNonce||0)+1;
  S.game.endsAt=null; S.game.readyCount=0; S.game.readyTotal=mpExpectedReady().length;
  S.ready=new Set(); S.game.readyIds=[];   // 1.1
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
  mpStopAudio();   // F6b: relay-host — odsłona ucisza zajawkę (autorytet robi to w mpAfterSync)
  const c=S.hostCurrent;
  noteAnswerers(S.game);                // F2b #8: historia udziału (liga) przed czyszczeniem bucketów
  const ev=evaluateAnswer(S.game, c, undefined, Date.now());   // czysta ocena (core) — KAŻDA drużyna; F6a: punkty + szybkość
  applyEvaluation(S.game, ev, S.tally);   // F6a: punkty/serie/tally/pewniaki/wynik/reveal — wspólne z serwerem-autorytetem
  S.game.phase=assertMp(S.game.phase, MP.REVEAL, console.warn); S.game.endsAt=null;
  S.game.listenEndsAt=null; S.game.allDoneAt=null; if(S.allDoneTimer){ clearTimeout(S.allDoneTimer); S.allDoneTimer=null; }
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
// P1-17: „Jeszcze raz — te same ustawienia" (1 tap). Picker hosta trzyma wybór poprzedniego meczu; gdy się nie da
// (host awansowany bez wyboru, za mało graczy do Drużyn/salonu…) → ekran ustawień jak „Zmień ustawienia".
function mpRematch(){
  if(!S.host) return;
  S.ack=S.revealNonce=S.revealSnap=null;
  if(!mpPickReady()){ mpNewGame(); return; }
  mpStart();
}
function mpNewGame(){
  S.ack=S.revealNonce=S.revealSnap=null;
  if(SERVER_AUTH){ S.game=null; S.roomStage='build'; mpRender(); mpSendDraft(); return; }   // host → picker; DO start (DONE→nowy) przy „Start meczu"
  S.game={hostId:mpMe.id, phase:null}; mpBroadcast(); mpRender();
}

/* ---- render sceny ---- */
// skórka = preferencja klienta (czysty render); obie mają fazy, różnią się fazą „kombinuj"
const mpSkin = ()=> lsGet('stacjaUI')==='czat' ? 'czat' : 'kolumny';   // migracja: „fazy"→„kolumny"
/* P2-13: zmiana skórki W GRZE (⋯ → „Układ") nie cofa fazy — dawniej S.playRound=null udawało NOWE pytanie, więc
 * „kombinuj" wracało do „słuchaj" (i do audio). Teraz tylko przebudowa scaffoldu (S.playSkin=null) w bieżącej pod-fazie;
 * wpisane, niewysłane odpowiedzi przechodzą do pól drugiej skórki. */
function mpSetSkin(v){
  const skin = v==='czat' ? 'czat' : 'kolumny';
  const typed={};
  document.querySelectorAll('#mpStage [id^="mpProp_"], #mpStage [id^="mpTyp_"]').forEach(el=>{ const k=el.id.replace(/^mp(Prop|Typ)_/, ''); if(el.value && !typed[k]) typed[k]=el.value; });
  lsSet('stacjaUI', skin); S.playSkin=null; mpRender();
  Object.entries(typed).forEach(([k,val])=>{ const el=$m('mpProp_'+k) || $m('mpTyp_'+k); if(el && !el.value) el.value=val; });
  document.querySelectorAll('#skinSeg button').forEach(b=>b.classList.toggle('on', b.dataset.skin===skin));   // menu główne w zgodzie
}
/* P2-13: menu ⋯ w nagłówku gry (telefon) — układ kolumny/czat, dźwięki wł/wył, wyjście z potwierdzeniem.
 * Własny arkusz (wzorzec mpLeaveDlg); TV ma osobne menu (app/mp-tv.js). */
function mpGameMenu(){
  let el=$m('mpGameMenu');
  if(!el){ el=document.createElement('div'); el.id='mpGameMenu'; el.className='mp-dlg mp-gmenu'; document.body.appendChild(el);
    el.addEventListener('click', (e)=>{ if(e.target===el) mpGameMenuClose(); }); }
  const skin=mpSkin(); let sfxOn=true; try{ sfxOn=localStorage.getItem('bbSfx')!=='off'; }catch(_e){}
  const seg=(items, cur, fn)=>items.map(([v,l])=>`<button type="button" class="${v===cur?'on':''}" aria-pressed="${v===cur}" onclick="${fn}('${v}')">${l}</button>`).join('');
  el.innerHTML=`<div class="mp-dlg-card" role="dialog" aria-modal="true" aria-labelledby="mpGmT">
      <b id="mpGmT">Menu gry</b>
      <div class="mp-gm-row"><span>Układ<small>jak wpisujecie odpowiedzi — tylko na tym telefonie</small></span><div class="seg" role="group" aria-label="Układ gry">${seg([['kolumny','kolumny'],['czat','czat']], skin, 'mpGameSkin')}</div></div>
      <div class="mp-gm-row"><span>Dźwięki<small>efekty i tik zegara — nie muzyka</small></span><div class="seg" role="group" aria-label="Dźwięki">${seg([['on','wł'],['off','wył']], sfxOn?'on':'off', 'mpGameSfx')}</div></div>
      <div class="mp-dlg-btns"><button type="button" class="mp-dlg-stay" onclick="mpGameMenuClose()">Zamknij</button><button type="button" class="mp-dlg-go" onclick="mpGameMenuClose();mpConfirmLeave('game')">Opuść pokój…</button></div>
    </div>`;
  el.classList.add('show');
  const first=el.querySelector('.seg button.on'); if(first) try{ first.focus(); }catch(_e){}
}
function mpGameMenuClose(){ const el=$m('mpGameMenu'); if(el) el.classList.remove('show'); }
function mpGameSkin(v){ mpSetSkin(v); if($m('mpGameMenu') && $m('mpGameMenu').classList.contains('show')) mpGameMenu(); }
function mpGameSfx(v){
  try{ localStorage.setItem('bbSfx', v==='off'?'off':'on'); }catch(_e){}
  document.querySelectorAll('#sfxSeg button').forEach(b=>b.classList.toggle('on', b.dataset.sfx===(v==='off'?'off':'on')));   // menu główne w zgodzie
  mpGameMenu();
}
// Esc zamyka menu gry (telefon z klawiaturą / desktop)
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ const el=$m('mpGameMenu'); if(el && el.classList.contains('show')){ e.preventDefault(); mpGameMenuClose(); } } });
// audio gra TYLKO w fazie słuchania — wyjście do „kombinuj" zatrzymuje dźwięk
function mpStopAudio(){ lektorStop(); mpStopRev(); S.medleyElTok=null; if(S.audio){ try{S.audio.pause();}catch(e){} } audioSession('ambient'); }
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
/* P1-8: kafel ABCD — tap = propozycja + głos (`propose` {slot: litera}: jedna odpowiedź na gracza, auto-głos) →
 * odpowiedź drużyny = najczęstsza litera. Działa ze STARYM serwerem (zwykły propose). TV-sędzia (coop) — nadpisanie głosem. */
function mpMcPick(letter){
  const g=S.game; const mc=mcOptions(g); if(!mc || !/^[A-D]$/.test(String(letter||''))) return;
  if(!mc.options.some(o=>o.letter===letter)) return;
  if(mpIsSalonHost()){ if((g.format||'coop')==='coop') mpSend({type:'vote', slot:mc.key, value:letter, set:true}); return; }
  mpSend({type:'propose', values:{ [mc.key]:letter }});
}
// P1-12: rozwinięcie opisu lektora w „kombinuj" — pamiętane per pytanie
function mpLyricToggle(open){ S.lyricFold={ nonce:S.game && S.game.playNonce, open:!!open }; }
// czat skórki „czat" przy ABCD (composer tylko do wiadomości — odpowiedź to kafel)
function mpChatSend(){ const el=$m('mpChatIn'); if(!el) return; mpDoSay(el.value); el.value=''; }
// P0-3: pewniak ×2 przy PUSTEJ odpowiedzi drużyny = pewna przegrana → pierwszy tap pyta „×2 — na pewno?" (3 s), drugi stawia
function mpSureTap(){
  if(!S.game) return;
  const now=Date.now();
  if(needsSureConfirm(S.game, myTeamId(), mpMe.id) && !(S.sureArmUntil>now)){
    S.sureArmUntil=now+3000; mpRefreshConf();
    setTimeout(()=>{ if(S.sureArmUntil && Date.now()>=S.sureArmUntil){ S.sureArmUntil=0; mpRefreshConf(); } }, 3100);
    return;
  }
  S.sureArmUntil=0;
  mpSend({type:'sure'});
}
function mpRefreshConf(){ const el=$m('mpConf'); if(el) el.innerHTML=mpConfHTML(); }
// P0-4: Enter w polach kolumn — wcześniejsze pole: dalej do następnego (gdy puste), inaczej „Wrzuć"; ostatnie pole = „Wrzuć"
function mpPropKey(ev, key){
  if(!ev || ev.key!=='Enter' || ev.isComposing) return;
  ev.preventDefault();
  const slots=((S.game&&S.game.answerSlots)||slotsFor()).map(s=>s.key);
  const i=slots.indexOf(key), next=i>=0 && i<slots.length-1 ? $m('mpProp_'+slots[i+1]) : null;
  if(next && !next.value.trim()){ next.focus(); return; }
  mpPropose();
  const first=$m('mpProp_'+slots[0]); if(first) try{ first.focus(); }catch(_e){}
}
// host „wybiera odpowiedź": jawny WYBÓR slotu (set=true → zawsze ustaw, nie przełączaj)
function mpPick(slot, value){ mpSend({type:'vote', slot, value, set:true}); }
function mpVoteFromBubble(el){
  if(!S.host) return;
  try{ const v=JSON.parse(el.dataset.values||'{}'); Object.entries(v).forEach(([k,val])=>mpPick(k,val)); }catch(e){}
}

function mpTickTimer(){
  // F2b #6: auto-„dalej" na odsłonie po bezczynności (licznik na karcie) — AFK nie blokuje stołu
  if(S.revealAutoAt && mpRevealPending()){
    const now=Date.now();
    const ae=$m('mpRevealAuto'); if(ae) ae.textContent=mpRevealAutoText(secsLeft(S.revealAutoAt, now));
    if(now>=S.revealAutoAt){ S.revealAutoAt=0; mpAdvance(); return; }
  }
  // F2b #6: licznik twardego limitu fazy gotowości
  if(S.game && S.game.phase===MP.ARMING && S.armDeadlineLocal){
    const le=$m('mpArmLeft'); if(le) le.textContent=mpArmLeftText(secsLeft(S.armDeadlineLocal, Date.now()));
  }
  const el=$m('mpCountdown');
  if(!S.game || S.game.phase!==MP.PLAY){ if(el){ el.textContent=''; el.classList.remove('low'); } return; }
  // P1-2: JEDEN zegar bieżącej fazy: 🎧 do końca okna słuchania (lokalnego, zakotwiczonego w terminie serwera),
  // potem 🧠 do końca pytania (endsAt serwera − offset zegara). Czerwień tylko w ostatnich 5 s.
  const now=Date.now(), off=S.clockOff||0;
  const endsLocal = S.game.endsAt ? S.game.endsAt - off : null;
  // okno słuchania TEGO pytania (po intrze) → lokalne; przed jego startem (intro) → termin serwera (listenEndsAt)
  const listenEnd = (S.listenNonce===S.game.playNonce && S.listenStart) ? S.listenStart + S.listenDur
    : (Number.isFinite(S.game.listenEndsAt) ? S.game.listenEndsAt - off : 0);
  const sub = (S.playRound===S.game.playNonce) ? S.sub : 'sluchaj';
  const c=phaseClock({ sub, listenEnd, endsAt:endsLocal, now });
  if(el){
    const ico = c ? (c.phase==='sluchaj' && S.game.mode==='quiz' ? '📖' : c.icon) : '';   // etap B: quiz „czytaj” — 📖, nie 🎧
    // P1-16: duży zegar TV — ikona w osobnym <i> (mniejsza od cyfr); tekst ten sam („🎧 0:12")
    if(el.classList.contains('tv-clock')) el.innerHTML = c ? `<i aria-hidden="true">${ico}</i> ${fmtClock(c.ms)}` : '';
    else el.textContent = c ? `${ico} ${fmtClock(c.ms)}` : '';
    el.classList.toggle('low', !!(c && c.low && c.ms>0));
    el.dataset.phase = c ? c.phase : '';
    el.setAttribute('aria-label', c ? (c.phase==='sluchaj' ? 'czas słuchania' : 'czas na odpowiedź') : '');
  }
  // P1-10: „Zakończ pytanie" hosta (Solo/Drużyny) dopiero po połowie czasu pytania
  const eq=$m('mpEndQ');
  if(eq) eq.hidden = !hostEndVisible({ playAt: Number.isFinite(S.game.playAt) ? S.game.playAt - off : null, endsAt:endsLocal, now });
  if(!S.game.endsAt) return;
  const rem=Math.max(0, endsLocal - now);
  // F6b (U4): tik ostatnich 5 s (raz na sekundę; duck pod zajawką w app/sfx.js); nie na zaległej odsłonie
  const ts=tickSecond(rem, S.tickSec);
  if(ts!=null){ S.tickSec=ts; if(!mpRevealPending()) playSfx('tick'); }
  // 1.4: pod autorytetem serwer ma własny scheduleAutoLock i jest jedynym zegarem prawdy —
  // klientowy auto-lock po skew zegara ucinałby pytania. Tu tylko relay (?authority=0) auto-lockuje.
  if(rem<=0 && S.host && !S.autoLocked && S.game.phase===MP.PLAY && !SERVER_AUTH){ mpLock(); }
}
function mpReact(e){ mpFloatEmoji(e, mpMe.name); if(S.ch) S.ch.send({type:'broadcast',event:'react',payload:{emoji:e, byName:mpMe.name, by:mpMe.id}}); }
function mpFloatEmoji(emoji, byName){      // #9: pokaż KTO wysłał emotkę
  if(!REACTIONS.includes(emoji)) return;   // #0.1: whitelist — emotki spoza listy nie trafiają do innerHTML (XSS)
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
// P1-11: ksywa z presence, a gdy gracza już nie ma (wyszedł) — ze stanu gry (game.names); nieznany → null
function mpNameOf(id){
  const m=mpMembers().find(x=>x.id===id); if(m && m.name && m.name!=='?') return m.name;
  const n=S.game && S.game.names && S.game.names[id]; return n ? String(n) : null;
}
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
  S.composerMode = m==='chat' ? 'chat' : 'typ';
  const chat=$m('mpCompChat'), typ=$m('mpCompTyp'), tog=$m('mpTypToggle');
  if(chat) chat.style.display = S.composerMode==='typ'?'none':'flex';
  if(typ)  typ.style.display  = S.composerMode==='typ'?'flex':'none';
  if(tog){ tog.textContent = S.composerMode==='typ'?'💬':'✍️';
    tog.setAttribute('aria-label', S.composerMode==='typ'?'przełącz na czat':'przełącz na odpowiedź'); }
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
    // FIX „host nie widział moich odpowiedzi": composer ZOSTAJE w trybie odpowiedzi (dawniej wracał do czatu,
    // więc poprawka typu wpisana „jak w czacie" szła jako wiadomość `say`, nie propozycja)
    mpSetComposerMode('typ');
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
// F6b (U4): duck UI-dźwięków pod zajawką/lektorem MP (trwały element, „od tyłu", synteza)
registerMusicProbe(()=> !!(S.audio && !S.audio.paused && !S.audio.ended) || !!S.revSrc || (!!S.game && S.game.mode==='lektor' && isSpeaking()));
Object.assign(window, {
  mpHostNewRound, mpLock, mpNewGame, mpNext, mpPlayLocal, mpPropose, mpVote, mpPick, mpVoteFromBubble,
  mpReact, mpSay, mpSend, mpSetSkin, mpComposerSend, mpTypingPing, mpKnobTap,
  mpGoKombinuj, mpComposerToggle, mpChatInput,
  mpStart, mpAdvance, mpHostRetry, mpHostNextReveal, mpTickTimer, mpHostSkipWait,
  mpLobbyStart, mpLobbyBack, mpRoomBack, mpExitMenu, mpShare,
  mpConfirmLeave, mpLeaveCancel, mpLeaveConfirmed, mpRejoinLast,   // F6b (F6)
  mpRetryRoom, mpRematch, mpSureTap, mpPropKey,                     // przegląd MP 2026-10 (etap A)
  mpMcPick, mpLyricToggle, mpChatSend,                               // etap B (P1-8, P1-12, ABCD w czacie)
  mpGameMenu, mpGameMenuClose, mpGameSkin, mpGameSfx, mpDeepJoin,    // P2-13 (menu gry), P2-12 (pierwsze wejście z linku)
  mpMoreStage, mpIntroReplay, mpTlPick, mpLobbyReadyToggle,                              // MP okładka/intro: „wyraźniej"/„+ więcej", ↻ etapu; oś czasu: szczelina
});
// initMpRender na końcu — wszystkie back-calls (w tym const mpSkin) już zdefiniowane
initMpRender({ mpLobbyReadyCap, mpMembers, mpPlayers, myTeamId, myTeamMembers, mpRevealPending, mpSkin, mpIngestFeed, mpFeedReset, mpClearTyping, mpTickTimer, mpGoKombinuj, mpNameOf, mpAdvancedIds, mpServerAuth:()=>SERVER_AUTH });

export { mpMe, mpDeepAsk };   // mpDeepAsk — seam testowy P2-12 (pierwsze wejście z linku bez ksywy)
