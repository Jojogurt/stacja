/* app/mp-render.js — warstwa WIDOKU multiplayera: dyspozytor mpRender + buildery HTML (lobby,
 * gra „słuchaj/kombinuj", odsłona, wynik) + render-driving (scaffold, okno słuchania, animacje).
 * Czyta współdzielony stan S (app/mp-state.js). Logika sterująca (transport/audio/host) zostaje
 * w app/mp.js i jest wstrzykiwana przez initMpRender — bez statycznego cyklu render↔logika. */
import { S, mpMe } from './mp-state.js';
import { escapeHtml, safeColor, isSlotKey, num } from '../core/util.js';
import { norm, YEAR_MIN, YEAR_MAX, coverMult, introMult, scoreLegend } from '../core/scoring.js';   // MP okładka: mnożnik etapu + legenda punktów   // F8a: + zakres pola roku; mpSlotsHTML: porównanie głosów (mój głos == kandydat)
import { QPC, matchProgress, matchQpc, MODE_LABEL, modeTask } from '../core/match.js';   // P1-1/P1-13: polecenie zadania
import { displayTitle, INSTRUMENT_EMOJI } from '../core/trackSelect.js';
import { gapLabel, timelineSummary } from '../core/timeline.js';   // MP oś czasu: opis szczeliny, podsumowanie osi   // tytuł z iTunes bez „(2012 Remaster)" itp. (tylko wyświetlanie)
import { MP } from '../core/phases.js';
import { coverStageBlocks, COVER_STAGES, INTRO_STAGES, introStageSecs } from '../core/timing.js';   // MP okładka/intro: etapy (podpis, pasek)
import { coverPaintBoxes } from './cover.js';           // MP okładka: wspólne rysowanie pikselowe z solo
import { listenSecs as _listenSecs, secsLeft, MP_REVEAL_AUTO_MS, MP_INTRO_MS, isTempoMode, mpTempoRate, listenWindowMs, hostEndVisible, introDigit } from '../core/timing.js';   // mpListenSecs: czas fazy „słuchaj"; F2b #6: auto-„dalej"; F6b: intro
import { slotsFor, candidatesForSlot, teamAnswer, myVoteForSlot, rosterState, answerCredits, playsAudioLocally, audioHostOnly,
  pendingIds, unsettledIds, mcOptions, mcLetterOf, mcTally, teamScoreLine, teamTimeline } from '../core/mpReducer.js';   // etap B: P1-4/P1-5/P1-8
import { standings, rankingTop } from '../core/teams.js';   // P0-5: ranking z remisami; P1-6: top-3
import { REACTIONS } from '../core/chatFeed.js';   // F6b: whitelist emotek wspólna z serwerem (🖕 → 🍺)
import { ALL_CATS } from './catalog.js';
import { confetti, animIn, promptBodyHTML } from './dom.js';
import { tasteHeartHTML, tasteHeartButtons } from './taste.js';   // „Twój gust": ❤️ „na półkę" w odsłonie (lokalnie u gracza, bez protokołu)
import { listenStart, listenHTML, listenStop, snippetPlay } from './listen.js';   // + P2-11: ▶ zajawka z listy na wyniku meczu   // Łamigłówki: „▶ posłuchaj" utworu-rozwiązania w odsłonie
import { mpVinylHTML, mpVinyl } from './vinyl.js';   // płyta winylowa w fazie „słuchaj"
import { playClap, playSfx } from './sfx.js';
import { ic } from './icons.js';
import { mpPickerHTML, mpPickSalon, mpPickGate, mpDraft, mpPickFormat, mpTeamsFromAssign } from './mp-picker.js';   // P1-16: lobby na TV (salon wybrany w pickerze)
import { renderPreserving } from './matchSetup.js';   // re-render pickera bez gubienia fokusu (wyszukiwarka/klawiatura)
import { FORMAT_LABEL, timerLabel, draftModesText, formatCopy, sanitizeDraft } from '../core/matchSetup.js';   // P1-9: copy per format
import { tvJoinUrl, tvJoinLabel, tvRanking, tvPlayerStatus, tvTeamSummary, tvControls } from '../core/tvStage.js';   // P1-16: TV jako scena
import { tvQrSVG, tvPatch, tvPatchFlip, tvSetMode, tvSetKeys, initTvKeys, tvMenuOpen, tvReducedMotion } from './mp-tv.js';
import { typCountText, loadingText, slotPlaceholder, matchPlaylist, matchTally, scoreScale, phaseSfxGain, sfxRole, plural, lobbyReadyCount, advanceWaitIds } from '../core/mpView.js';   // P2: copy, wynik meczu, dźwięki faz
import { shareMpResult } from './mpResultCard.js';   // P2-11: obrazek wyniku do udostępnienia
import { APP_NAME } from '../core/tasteProfile.js';   // nazwa marki na karcie wyniku (jedno źródło: core/util.APP_NAME)

const $m = id => document.getElementById(id);

/* wstrzykiwane z mp.js (logika sterująca, której potrzebuje render) */
let mpLobbyReadyCap=()=>false, mpMembers, mpPlayers, myTeamId, myTeamMembers, mpRevealPending, mpSkin, mpIngestFeed, mpFeedReset, mpClearTyping, mpTickTimer, mpGoKombinuj, mpNameOf, mpAdvancedIds;
export function initMpRender(deps){
  if(typeof deps.mpLobbyReadyCap==='function') mpLobbyReadyCap=deps.mpLobbyReadyCap;
  ({ mpMembers, mpPlayers, myTeamId, myTeamMembers, mpRevealPending, mpSkin, mpIngestFeed, mpFeedReset, mpClearTyping, mpTickTimer, mpGoKombinuj, mpNameOf, mpAdvancedIds } = deps);
  if(typeof deps.mpServerAuth==='function') mpServerAuth=deps.mpServerAuth;
}
let mpServerAuth = ()=>false;   // P2-9: copy „serwer losuje…" przy serwerze-autorytecie
// P2-14: dźwięk FAZY wg roli ekranu (TV głośniej, telefon-pilot w salonie wyciszony, reszta 1×) — core/mpView
export function mpPhaseSfx(name){
  const g=S.game;
  return playSfx(name, { gain:phaseSfxGain(name, sfxRole({ tv:mpIsSalonHost(), salon:!!(g && (g.salon || S.salon)) })), overMusic:name!=='sting' });
}
// czy TEN klient jest ekranem salonowym (host w trybie salon). Fallback S.salon = nim serwer
// odeśle game.salon (działa bez deployu DO). Wymaga aktywnej gry (przed grą: lobby/picker normalnie).
// P0-1: nowy serwer niesie game.tvId (TV = kto wystartował salon) — awansowany po wyjściu TV gracz NIE staje się TV.
// Stan bez tvId (stary serwer) → dawne zachowanie (host = TV).
const mpIsSalonHost = ()=>{
  const g=S.game; if(!g || g.phase==null) return false;
  if(typeof g.tvId==='string' && g.tvId) return g.tvId===mpMe.id;
  return !!(S.host && (g.salon || S.salon));
};
// F6b (#6): TV w salonie przy formacie Solo/Drużyny — nie sędziuje drużyny; pokazuje status drużyn (bez ich
// odpowiedzi — TV widzą wszyscy) i ranking. W coop zachowanie bez zmian (TV-sędzia jedynej drużyny).
const mpIsCompTV = ()=> mpIsSalonHost() && ((S.game && S.game.format) || 'coop')!=='coop';
// F6b (tryb #6 „Jeden głośnik"): czy TEN klient gra zajawkę/lektora (host zawsze; nie-host gdy flaga wył.).
// Host-lokalny fallback S.audioHostOnly (stary serwer nie odsyła flagi) dotyczy tylko hosta — gra i tak.
const mpPlaysHere = (g)=> playsAudioLocally(g, mpMe.id);
// salon wymusza skórkę KOLUMNY (host nadpisuje przez klik w board; czat nie pokazuje kolumn)
const curSkin = ()=> mpIsSalonHost() ? 'kolumny' : mpSkin();
// bucket stanu odpowiedzi MOJEJ drużyny (proposals/votes/sure/passed) — izolacja widoku
// F1 (#2): sloty odpowiedzi do RENDERU — tylko z bezpiecznym kluczem (klucz idzie w id="mpProp_<key>"
// i data-k). Zły klucz z sieci (np. `a" autofocus onfocus=…`) po prostu nie dostaje pola.
const renderSlots = (g)=> ((g && g.answerSlots) || slotsFor()).filter(s=>s && isSlotKey(s.key));
// liczba osób w MOJEJ drużynie wg składu gry (presence może jeszcze nie znać wszystkich) — copy P1-9, kredyty P1-6
const myTeamSize = ()=>{ const g=S.game, tid=myTeamId&&myTeamId(); const t=g && (g.teams||[]).find(x=>x.id===tid); return t ? (t.members||[]).length : myTeamMembers().length; };
const myBucket = ()=>{ const g=S.game, tid=myTeamId&&myTeamId(); return (g && g.byTeam && tid && g.byTeam[tid]) || {}; };

// gość: „Mecz, który ustawia host" — szkic na żywo (S.draft, sanityzowany w core/matchSetup.sanitizeDraft).
// Wszystkie teksty ze szkicu → escapeHtml (pochodzą z sieci).
function mpDraftHTML(d){
  if(!d) return '';
  const chips=d.cats.map(c=>`<span class="ms-chip ro">${escapeHtml(c.l)}</span>`).join('')+(d.more?`<span class="ms-chip ro more">+${num(d.more)}</span>`:'');
  const cell=(k,v)=>`<div class="mpd-cell"><small>${k}</small><b>${escapeHtml(v)}</b></div>`;
  return `<section class="mpd" aria-labelledby="mpdH">
      <div class="mpd-h"><h2 id="mpdH">Mecz, który ustawia host</h2><span class="mpd-live">na żywo</span></div>
      ${d.preset?`<div class="mpd-preset">${escapeHtml(d.preset)}</div>`:''}
      <div class="mpd-row"><span class="mpd-lbl">KATEGORIE</span>${d.cats.length?`<div class="ms-chips">${chips}</div>`:'<span class="mpd-none">host jeszcze nie wybrał</span>'}</div>
      <div class="mpd-row"><span class="mpd-lbl">TRYBY</span><div class="mpd-modes">${escapeHtml(draftModesText(d.modes))}</div></div>
      <div class="mpd-grid">${cell('długość', d.questions+' pytań')}${cell('format', FORMAT_LABEL[d.format]||FORMAT_LABEL.coop)}${cell('czas na odpowiedź', timerLabel(d.timer))}${cell('dźwięk', d.salon?'tylko na TV':d.audioHostOnly?'tylko u hosta':'u wszystkich')}</div>
    </section>`;
}
// P0-8: błąd połączenia z pokojem — zamiast „0 osób · czekamy na graczy…" bez końca
const NET_ERR_TX = { session:'Nie łączę się z serwerem (brak sesji).', channel:'Serwer pokoju odrzucił połączenie.', timeout:'Serwer pokoju nie odpowiada.' };
function mpNetErrHTML(){
  return `<div class="mp-neterr" role="alert"><b>Nie łączę się z serwerem — spróbuj ponownie</b><small>${escapeHtml(NET_ERR_TX[S.netErr]||'')} Sprawdź internet i spróbuj jeszcze raz.</small>
    <div class="mp-neterr-btns"><button type="button" class="mp-neterr-retry" onclick="mpRetryRoom()">Spróbuj ponownie</button><button type="button" class="mp-neterr-exit" onclick="mpRoomBack()">Wyjdź</button></div></div>`;
}
// „Gotowy ✓" — przycisk gracza (toggle) w lobby i przy rewanżu; host nie potrzebuje (startuje sam, start NIE blokowany)
function mpReadyBtnHTML(ms, rematch=false){
  if(S.host || !mpLobbyReadyCap()) return '';
  const me=(ms||mpMembers()).find(m=>m.id===mpMe.id), on=!!(me && me.ready);
  return `<button type="button" class="pcz-readybtn${on?' on':''}" id="mpReadyBtn" aria-pressed="${on}" onclick="mpLobbyReadyToggle()">${on?'✓ Gotowy':(rematch?'Gotowy na rewanż ✓':'Gotowy ✓')}</button>`;
}
function mpLobbyWaitHTML(){
  const ms=mpMembers();
  const hostId = S.game ? S.game.hostId : (S.host ? mpMe.id : (S.ch && S.ch.hostId) || null);
  // P2-1: bez redundantnego badge'a „W POKOJU" — pełne imię (do 2 linii), „to Ty" w podpisie zamiast ucinanego „(Ty)"
  const cards = ms.map(m=>{
    const isHost = m.id===hostId, you = m.id===mpMe.id;
    const av = escapeHtml((m.name||'?').slice(0,1).toUpperCase());
    return `<div class="pcz-m${you?' you':''}">
      <span class="pcz-av" style="background:${mpAvatarColor(m.name)}">${av}</span>
      <div class="pcz-mn"><b>${escapeHtml(m.name||'gracz')}${isHost?' '+ic('crown'):''}${m.ready?' <span class="pcz-ready" aria-label="gotowy">✓</span>':''}</b><small>${isHost?'host':'gracz'}${you?' · to Ty':''}${m.ready?' · gotowy':''}</small></div>
    </div>`;
  }).join('') || (S.netErr ? `<div class="pcz-waitmsg">czekamy na graczy…</div>` : '');
  // P2-3: lista o stałej wysokości (min. 3 wiersze — „wolne miejsce", dalej scroll) → „ZACZNIJ →" nie skacze, gdy ktoś dochodzi
  const ghosts = S.netErr ? '' : Array.from({ length:Math.max(0, 3-ms.length) }, (_,i)=>
    `<div class="pcz-m pcz-ghost" aria-hidden="true"><span class="pcz-av"></span><div class="pcz-mn"><small>${i===0 && S.host ? 'wolne miejsce — wyślij kod znajomym' : 'wolne miejsce'}</small></div></div>`).join('');
  const n=ms.length, word = plural(n, 'osoba', 'osoby', 'osób');
  const draft = !S.host ? mpDraftHTML(S.draft) : '';
  const rc = mpLobbyReadyCap() ? lobbyReadyCount({ members:ms, readyIds:ms.filter(m=>m.ready).map(m=>m.id), hostId }) : null;   // „Gotowy ✓"
  const rcTx = rc && rc.total ? ` · <span class="pcz-readyn">${escapeHtml(rc.text)}</span>` : '';
  const foot = S.netErr ? ''   // P0-8: bez połączenia nie ma czego zaczynać — akcje są w karcie błędu
    : S.host
    ? `<button class="pcz-start" onclick="mpLobbyStart()">ZACZNIJ →</button>`
    : (mpReadyBtnHTML(ms) + (S.draft ? `<div class="pcz-waitmsg" role="status">⏳ host układa mecz — zmiany widzisz na żywo; zacznie, gdy będzie gotowy</div>`
    : `<div class="pcz-waitmsg">⏳ czekamy, aż host ułoży mecz…</div>`));
  const err = S.netErr ? mpNetErrHTML() : '';
  return `<div class="pcz">${err}
    <div class="pcz-hd">
      <div class="pcz-hd-r1"><button type="button" class="pcz-exit" onclick="mpConfirmLeave('lobby')">${ic('back')} wyjdź</button><span class="pcz-lbl">KOD POKOJU</span></div>
      <div class="pcz-hd-r2"><span class="pcz-code">${escapeHtml(S.code||'····')}</span><button class="pcz-share" onclick="mpShare(this)">${ic('share')} Udostępnij</button></div>
    </div>
    <div class="pcz-team"><span>Przy stole</span><span class="pcz-count" aria-live="polite">${n} ${word}${rcTx}</span></div>
    <div class="pcz-list">${cards}${ghosts}</div>
    ${draft}
    <div class="pcz-foot">${foot}</div>
  </div>`;
}
// klucz sceny — jedno „gdzie jestem": picker | wait | card:si:qi | play:nonce:sub | reveal:nonce | ph:faza.
// P1-1 (przegląd MP 2026-10): LOADING („losuję") + ARMING (gotowość) + odliczanie 3-2-1 (PLAY w LEAD) = JEDNA scena
// „karta pytania" (card:si:qi). Karta jest ŁATANA w miejscu (nie podmieniana) — koniec migotania trzech komunikatów.
const mpQKey = (g)=> `${num((g && g.si) || 0)}:${num((g && g.qi) || 0)}`;
// odliczanie trwa: PLAY tego pytania, a lokalny koniec LEAD (S.introUntil, z playAt serwera) jeszcze przed nami
function mpInCount(g){ return !!(g && g.phase===MP.PLAY && S.introNonce===g.playNonce && S.introUntil>Date.now()); }
function mpSceneKey(g){
  if(!g || g.phase==null) return (S.host && S.roomStage==='build') ? 'picker' : 'wait';
  if(mpRevealPending()) return 'reveal:'+S.revealNonce;
  if(g.phase===MP.LOADING || g.phase===MP.ARMING || mpInCount(g)) return 'card:'+mpQKey(g);
  if(g.phase===MP.PLAY) return 'play:'+g.playNonce+':'+mpEffSub(g);
  return 'ph:'+g.phase;
}
// seam testowe (jsdom nie czeka realnych ms): window.__MP_INTRO_MS__ (LEAD odliczania), window.__MP_CHECK_MS__ („Sprawdzamy…")
const mpIntroLeadMs = ()=> (typeof window!=='undefined' && window.__MP_INTRO_MS__!=null) ? window.__MP_INTRO_MS__ : MP_INTRO_MS;
export const MP_CHECK_MS = 600;   // P1-1 krok 4: „Sprawdzamy…" między zamknięciem pytania a flipem karty utworu
const mpCheckMs = ()=> (typeof window!=='undefined' && window.__MP_CHECK_MS__!=null) ? window.__MP_CHECK_MS__ : MP_CHECK_MS;
const reducedMotion = ()=>{ try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(_e){ return false; } };
// jednorazowa klasa efektu przejścia na #mpStage (zwinięcie karty / pola wjeżdżają); reduced-motion → CSS bez ruchu
function mpStageFx(st, cls, ms){
  if(!st) return;
  st.classList.remove('mp-fromcard','mp-tokomb'); void st.offsetWidth; st.classList.add(cls);
  clearTimeout(S.stageFxTimer); S.stageFxTimer=setTimeout(()=>st.classList.remove(cls), ms);
}
// P1-1 a11y: komunikat dla czytnika ekranu (aria-live="assertive", poza #mpStage — przeżywa re-render)
function mpAnnounce(text){
  if(typeof document==='undefined' || !text) return;
  let el=$m('mpAnnounce');
  if(!el){ el=document.createElement('div'); el.id='mpAnnounce'; el.className='sr-only'; el.setAttribute('aria-live','assertive'); el.setAttribute('role','status'); document.body.appendChild(el); }
  el.textContent=''; el.textContent=String(text);
}
// EFEKTY WEJŚCIA W SCENĘ (onEnter) — odpowiednik godotowego _enter_state(), w JEDNYM miejscu.
// MP jest rozproszony: ten sam stan przychodzi wielokrotnie (sync) → triggery są nonce/klucz-strzeżone
// (idempotentne). Efekty TRANSPORTU/AUDIO (buforowanie/odtwarzanie, termin odliczania) zostają w mpAfterSync (app/mp.js).
function mpOnEnter(g, head, st){
  // wejście w ODSŁONĘ (nowy playNonce): migawka wyniku (każdy zostaje we własnym tempie). Efekty (confetti/dźwięk/„+N")
  // P1-1 krok 4: dopiero po „Sprawdzamy…" (mpRevealFx przy pierwszym renderze karty utworu).
  if(g && g.phase===MP.REVEAL && g.reveal && S.revealNonce!==g.playNonce){
    S.revealNonce=g.playNonce;
    const rvm=mpRevealMine(g.reveal), tid=myTeamId&&myTeamId();
    // F6b (R8): „złożona z głosów" — nowy serwer/host liczy credits w ocenie (core/mpReducer.answerCredits);
    // stary serwer ich nie ma → policz z bucketu drużyny, który w stanie REVEAL jeszcze jest (czyszczony w nowej rundzie)
    const credits = Array.isArray(rvm.credits) ? rvm.credits : (tid && !mpIsCompTV() ? answerCredits(g, tid, rvm.locked||{}) : []);
    S.revealSnap={ reveal:g.reveal, head, isLast:(g.si>=g.slots.length-1 && g.qi>=matchQpc(g)-1), credits,   // P1-7: qpc meczu
      score: mpIsCompTV() ? null : teamScoreLine(g, tid, g.reveal) };   // P1-5: „+N" leci do „⭐" w nagłówku
    S.checkUntil=Date.now()+mpCheckMs(); S.revealFx=g.playNonce;
    if(mpCheckMs()>0) mpPhaseSfx('drum');   // P2-14: werbel pod „Sprawdzamy…" (zajawka już uciszona w mpAfterSync)
    mpNoteHistory(g);                        // P2-11: utwór do listy na wyniku meczu (lokalnie u gracza)
    S.advCount=0; S.advTotal=mpPlayers().length;   // salon: świeży licznik „dalej" graczy na nową odsłonę
    // F2b #6: auto-„dalej" po bezczynności (licznik od pokazania karty). TV w salonie nie — przechodzi po „dalej" telefonów.
    S.revealAutoAt = mpIsSalonHost() ? 0 : S.checkUntil + mpRevealAutoMs();
  }
  const scene=mpSceneKey(g);
  if(scene!==S.lastView){
    const prev=S.lastView||''; S.lastView=scene;
    if(g && g.phase===MP.DONE && scene==='ph:'+MP.DONE && (S.sawMatch || S.host)) playSfx('fanfare');   // F6b (U4): fanfara końca meczu (raz); P0-10: nie dla dołączającego po meczu
    // P1-1: karta wchodzi sama (slide-up przy utworzeniu); karta → „słuchaj" = zwinięcie do paska fazy;
    // „słuchaj" → „kombinuj" BEZ nakładki (kolor paska + pola od dołu); odsłona — własne wejście („Sprawdzamy…" → flip)
    if(scene.startsWith('card:')) mpPhaseSfx('whoosh');   // P2-14: karta pytania wjeżdża (raz na pytanie — klucz karty = si:qi)
    if(scene.startsWith('card:') || scene.startsWith('reveal:') || mpIsSalonHost()){ /* własne wejście (TV: lewa kolumna) */ }
    else if(prev.startsWith('card:') && scene.startsWith('play:')) mpStageFx(st, 'mp-fromcard', 560);
    else if(scene.startsWith('play:') && prev.startsWith('play:') && prev.split(':')[1]===scene.split(':')[1]) mpStageFx(st, 'mp-tokomb', 420);
    else if(!(g && g.phase===MP.DONE)) animIn(st);
  }
}
/* P2-11: historia zagranych utworów TEGO klienta (okładka, rok, zajawka, wynik MOJEJ drużyny, +N) — do listy na wyniku meczu.
 * Kompletną kolejność daje serwer (game.results w DONE); historia ją wzbogaca (core/mpView.matchPlaylist). 1. pytanie = nowy mecz. */
function mpNoteHistory(g){
  const r=(g && g.reveal) || {};
  if(!Array.isArray(S.matchHist) || matchProgress(g).n<=1) S.matchHist=[];
  const tv=mpIsCompTV(), mine=tv ? {} : mpRevealMine(r);
  const ok=!tv && !!(mine.teamOk || mine.pewniakWin), gained=tv ? 0 : (Number(mine.gained)||0);
  const preview = typeof g.preview==='string' && /^https:\/\//.test(g.preview) ? g.preview : '';
  const tracks = r.track && r.artist ? [{ track:displayTitle(r.track), artist:r.artist, year:r.year, art:r.art, preview }]
    : (Array.isArray(r.listen) ? r.listen.map(t=>t && ({ track:t.title, artist:t.artist })) : []);
  const cat=typeof g.catKey==='string' ? g.catKey : '';
  tracks.filter(Boolean).forEach(t=>{ if(S.matchHist.length<60) S.matchHist.push({ ...t, ok, gained, cat, nonce:g.playNonce }); });
}
// P1-14: kolor fazy w nagłówku — przejście (200 ms) z poprzedniego koloru (--ph-from) na bieżący
function mpNotePhase(g){
  const ph=mpPhaseNow(g)||'card';
  if(ph!==S.hdPh){ S.phFrom=S.hdPh||null; S.hdPh=ph; clearTimeout(S.phFromTimer); S.phFromTimer=setTimeout(()=>{ S.phFrom=null; }, 450); }
}
function mpRender(){
  const st=$m('mpStage'); if(!st) return;
  const salonHost=mpIsSalonHost();
  const tvLobby=mpTvLobbyOn();   // P1-16: lobby na TV (host z salonem wybranym w pickerze, przed meczem)
  st.classList.toggle('salon', salonHost);            // duży ekran-monitor TV (CSS w index.html)
  document.body.classList.toggle('salon', salonHost||tvLobby); // wyłom z mobilnej powłoki 520px (szeroki TV)
  tvSetMode(salonHost||tvLobby);                      // P1-16: html.tv — scena TV (fluid ≥1280 px, ×2, motyw domyślnie ciemny)
  if(!S.game || S.game.phase==null){
    mpOnEnter(S.game, null, st);   // przejście picker/poczekalnia → animIn
    // przed grą: poczekalnia (06, własny navbar) → host „ZACZNIJ" → picker „ułóż mecz" (własny navbar)
    const building = S.host && S.roomStage==='build';
    document.body.classList.toggle('ms-wide', !!building);   // desktop ≥900 px: picker w dwóch kolumnach (max 1200 px)
    if(building) renderPreserving(st, mpPickerHTML()); else if(tvLobby) mpRenderTvLobby(st); else st.innerHTML = mpLobbyWaitHTML();
    return;
  }
  document.body.classList.remove('ms-wide');
  const g=S.game;
  mpNotePhase(g);               // P1-14: zmiana fazy → kolor ramy przechodzi z poprzedniego (przed budową nagłówka)
  const head=mpHeaderHTML(g);   // nagłówek z ramą (nr pytania, ⭐ wynik, zegar fazy, pasek fazy) — widoczny cały czas
  mpOnEnter(g, head, st);        // wszystkie efekty wejścia w scenę: migawka odsłony + przejścia
  if(salonHost){ mpRenderTv(g, st); return; }   // P1-16: TV = osobna scena (dwie kolumny), te same fazy i efekty
  // dopóki TEN klient nie kliknął „dalej" — pokazuj wynik, nawet gdy host już ruszył dalej
  if(mpRevealPending()){
    const rem=(S.checkUntil||0)-Date.now();
    if(rem>0){   // P1-1 krok 4: „Sprawdzamy…" (~600 ms), potem flip karty utworu
      st.innerHTML=mpRenderChecking(S.revealSnap);
      if(!S.checkTimer) S.checkTimer=setTimeout(()=>{ S.checkTimer=null; mpRender(); }, rem+10);
      return;
    }
    st.innerHTML=mpRenderRevealCard(S.revealSnap); mpRevealFx(); return;
  }
  if(g.phase===MP.LOADING || g.phase===MP.ARMING || mpInCount(g)){ mpRenderCard(g, head, st); return; }
  switch(g.phase){
    case MP.NETERR:  st.innerHTML=mpRenderNetErr(g, head); return;
    case MP.NOLYRIC: st.innerHTML=mpRenderNoLyric(head); return;
    case MP.PLAY:    mpRenderPlay(g, head, st); return;   // salon: te same fazy, tylko większe (CSS) + ukryte kontrolki gracza
    case MP.REVEAL:  st.innerHTML=mpRenderWaitNext(head); return;   // już kliknąłem „dalej" — czekam na resztę
    case MP.DONE:
      // P0-10: dołączający DOPIERO po meczu nie widzi cudzego wyniku — lobby + szkic rewanżu (gdy host go układa)
      if(!S.sawMatch && !S.host){ st.innerHTML=mpLobbyWaitHTML(); return; }
      st.innerHTML=mpRenderDone(g, head); mpJuiceScore(g); return;
  }
}
// pasek emotek + krótka wiadomość — wspólny dla gry, wyniku i czekania.
// SALON (TV): host nie wysyła (latające emotki nadal widzi) → cały pasek znika.
// `listen` = faza „słuchaj" w PLAY: pole to TYLKO czat — podpowiedź kieruje odpowiedź do „kombinujemy" (wpisana tu
// szła jako wiadomość i nie trafiała do stanu gry — „host nie widział moich odpowiedzi").
function mpReactsBarHTML(listen){
  if(mpIsSalonHost()) return '';
  const ph = listen ? 'czat · odpowiedź wpiszesz po „kombinujemy →”' : 'napisz coś krótkiego…';
  return `<div class="mp-reacts">${REACTIONS.map(e=>`<button onclick="mpReact('${e}')">${e}</button>`).join('')}</div>
    <div class="mp-saybar"><input id="mpSayIn" maxlength="32" placeholder="${ph}" aria-label="wiadomość na czacie" onkeydown="if(event.key==='Enter')mpSay()"><button onclick="mpSay()">Wyślij</button></div>`;
}

// loader „Uszy & Mózg" (3 kropki) — lokalny string (NIE współdzielony import: kruchy przy stale-cache).
const bbLoader = `<div class="bb-loader"><i></i><i></i><i></i></div>`;
const mpRosterStrip = (g)=> `<div class="mp-roster">${mpRosterHTML(g||S.game||{})}</div>`;
// F2b #6: teksty liczników (wspólne z tickiem w mp.js)
const mpArmLeftText = (s)=> `start najpóźniej za ${num(s)} s`;
const mpRevealAutoText = (s)=> `auto-„dalej" za ${num(s)} s`;
// czas bezczynności do auto-„dalej" (seam testowy jak intro: window.__MP_REVEAL_AUTO_MS__)
const mpRevealAutoMs = ()=> (typeof window!=='undefined' && window.__MP_REVEAL_AUTO_MS__!=null) ? window.__MP_REVEAL_AUTO_MS__ : MP_REVEAL_AUTO_MS;

/* ===== P1-4: „Czekamy na: Ola, Kuba" — awatary i imiona maruderów (po „dalej", w ARMING, w kombinuj u hosta) ===== */
function mpWaitNamesHTML(ids, { lead='Czekamy na', hostId=null }={}){
  const xs=(ids||[]).filter(Boolean);
  if(!xs.length) return '';
  const names=xs.map(id=> id===mpMe.id ? 'Ty' : ((mpNameOf(id)||'gracz')+(hostId && id===hostId ? ' (host)' : '')));
  const shown=names.slice(0,4), more=names.length-shown.length;
  const avs=xs.slice(0,4).map((id,i)=>{ const n=id===mpMe.id ? (mpMe.name||'Ty') : (mpNameOf(id)||'?');
    return `<b class="mp-wf-av" style="background:${mpAvatarColor(n)}">${escapeHtml(n.slice(0,1).toUpperCase())}</b>`; }).join('');
  return `<div class="mp-waitfor" role="status"><span class="mp-wf-avs" aria-hidden="true">${avs}</span><span class="mp-wf-tx">${escapeHtml(lead)}: <b>${escapeHtml(shown.join(', '))}</b>${more>0?` <small>+${num(more)}</small>`:''}</span></div>`;
}
// rząd awatarów stołu: zapalony = gotowy / kliknął „dalej" (Gartic: szare awatary niegotowych)
function mpPeopleHTML(players, lit){
  if(!players.length) return '';
  return `<div class="mp-qc-ppl">${players.map(m=>{ const on=lit.has(m.id), nm=m.name||'?';
    return `<span class="mp-qc-av${on?' on':''}${m.id===mpMe.id?' you':''}" title="${escapeHtml(nm)}"${on?` style="background:${mpAvatarColor(nm)}"`:''}>${escapeHtml(nm.slice(0,1).toUpperCase())}${on?'<i aria-hidden="true">✓</i>':''}</span>`; }).join('')}</div>`;
}

/* ===== P1-1: KARTA PYTANIA — LOADING / ARMING / odliczanie 3-2-1 (projekt: raport przegladu MP, „Projekt docelowy intro faz") ===== */
function mpQNum(g){
  if(Array.isArray(g.slots) && g.slots.length){ const p=matchProgress(g); return { n:p.n, total:p.total }; }
  return { n:(Number(g.qi)||0)+1, total:0 };
}
// polecenie zadania (P1-13) — ABCD (kafle) rozpoznawane po treści pytania (jawnej od PLAY)
const mpTaskText = (g)=> modeTask(g && g.mode, { mc:!!mcOptions(g) });
const mpModeIcon = (mode)=> String(MODE_LABEL[mode]||'').split(' ')[0] || '♪';
function mpCardSpeech(g){
  const q=mpQNum(g);
  return `Pytanie ${q.n}${q.total?' z '+q.total:''}.${g.catLabel?` Kategoria ${g.catLabel}.`:''}${g.mode?' '+mpTaskText(g)+'.':''}`;
}
// P2-9: „serwer losuje utwór…" (autorytet; dawniej „host losuje" — nieprawda) / „losuję…" (host relay) / „host losuje…" (gość relay)
const mpLoadingText = (g)=> loadingText({ authority:mpServerAuth(), host:S.host, mode:g && g.mode });
function mpCardInnerHTML(g){
  const q=mpQNum(g), count=mpInCount(g);
  const stage = g.phase===MP.LOADING ? 'loading' : count ? 'count' : 'arming';
  const players=mpPlayers();
  const readyIds=Array.isArray(g.readyIds) ? g.readyIds : null;
  const lit=new Set(stage==='count' ? players.map(m=>m.id) : stage==='arming' ? (readyIds||[]) : []);
  const cat=g.catLabel||g.catKey||'';
  const chips=`${cat?`<span class="mp-qc-cat">${escapeHtml(cat)}</span>`:''}${g.mode?`<span class="mp-qc-task">${escapeHtml(mpModeIcon(g.mode))} ${escapeHtml(mpTaskText(g))}</span>`:''}`;
  let status='';
  if(stage==='loading') status=`<div class="mp-qc-st">${bbLoader}<span>${escapeHtml(mpLoadingText(g))}</span></div>`;
  else if(stage==='arming'){
    const rc=num(g.readyCount||0), rt=num(g.readyTotal||players.length);
    const pend = readyIds ? pendingIds(players.map(m=>m.id), readyIds) : [];
    // F2b #6: nowy serwer (armMs) ma twardy limit + komendę go — licznik i „pomiń czekających" dla hosta.
    const hasLimit = g.armMs>0;
    const note = hasLimit ? `<small class="mp-qc-note" id="mpArmLeft">${mpArmLeftText(secsLeft(S.armDeadlineLocal, Date.now()))}</small>` : `<small class="mp-qc-note">pytanie ruszy równo u wszystkich</small>`;
    const skip = (S.host && hasLimit) ? `<button type="button" class="mp-btn ghost mp-qc-skip" onclick="mpHostSkipWait()">pomiń czekających ›</button>` : '';
    status=`<div class="mp-qc-st"><span><b>${rc}/${rt}</b> gotowych</span></div>${mpWaitNamesHTML(pend)}${note}${skip}`;
  } else {
    const d=introDigit(S.introUntil-Date.now(), mpIntroLeadMs());
    status=`<div class="mp-qc-count" aria-hidden="true"><b class="mp-qc-d" data-d="${num(d)}">${d>0?num(d):'▶'}</b></div>`;
  }
  // quiz: treść pytania już na karcie (jak Kahoot) — jawna dopiero od PLAY (serwer ukrywa ją w ARMING)
  const mc=count ? mcOptions(g) : null;
  const prompt = count && g.mode==='quiz' && g.prompt
    ? `<div class="mp-qc-prompt">${promptBodyHTML(mc ? mc.question : g.prompt, g.promptStyle==='rebus'?'rebus':'')}</div>` : '';
  return `<div class="mp-qc-n">PYTANIE <b>${num(q.n)}</b>${q.total?`<span>/${num(q.total)}</span>`:''}</div>
    <div class="mp-qc-chips">${chips}</div>${prompt}
    ${mpPeopleHTML(stage==='loading' ? [] : players, lit)}
    ${status}`;
}
function mpRenderCard(g, head, st){
  const key=mpQKey(g), inner=mpCardInnerHTML(g), count=mpInCount(g);
  const card=st.querySelector('.mp-qcard'), f=st.firstElementChild, hd=(f && f.classList.contains('mp-hd')) ? f : null;
  if(card && card.dataset.qkey===key && hd){
    // ta sama karta — łata w miejscu (bez ponownego wjazdu, bez migotania; pole czatu pod kartą nietknięte)
    if(S.cardHead!==head){ hd.outerHTML=head; S.cardHead=head; }
    if(S.cardInner!==inner){ card.innerHTML=inner; S.cardInner=inner; }
  } else {
    st.innerHTML=`${head}<section class="mp-qcard enter" data-qkey="${escapeHtml(key)}" aria-label="karta pytania">${inner}</section>${mpReactsBarHTML()}`;
    S.cardHead=head; S.cardInner=inner;
    if(!count) mpAnnounce(mpCardSpeech(g));
  }
  if(count && S.countSaid!==g.playNonce){   // a11y: „… Start za 3…" (raz na pytanie)
    S.countSaid=g.playNonce;
    mpAnnounce((card && card.dataset.qkey===key ? '' : mpCardSpeech(g)+' ')+'Start za 3…');
  }
  mpTickTimer();
  if(count && !S.countTimer){   // następna cyfra 3 → 2 → 1 (z terminu S.introUntil = playAt serwera + LEAD)
    const rem=S.introUntil-Date.now(), step=Math.max(1, mpIntroLeadMs()/3);
    const toNext=(rem % step) || step;
    S.countTimer=setTimeout(()=>{ S.countTimer=null; if(mpInCount(S.game)) mpRender(); }, Math.max(16, Math.min(rem, toNext)+8));
  }
}
// klient już kliknął „dalej" i czeka, aż reszta też przejdzie do następnego pytania
// P1-4: „Czekamy na: Ola, Kuba" — kto jeszcze nie kliknął „dalej" (event `advanced` od każdego gracza; host = ten, kto rusza dalej)
const mpRenderWaitNext = (head)=>{
  const g=S.game||{};
  const players=mpPlayers();
  const adv=new Set([...(mpAdvancedIds(g.playNonce)||[]), mpMe.id]);
  // pokój mieszany: stary klient nie wysyła „dalej" poza salonem — czekamy tylko na klientów z flagą `adv` (nowy serwer)
  const pend=pendingIds(advanceWaitIds(players, { salon:!!g.salon }), [...adv]);
  // 1.2: host promowany w REVEAL po swoim „dalej" ma ack===revealNonce → bez przycisku nikt nie wyśle
  // `next` i mecz zamarza. Daj hostowi jawny przycisk „następne pytanie" (mpHostNextReveal → next).
  const hostBtn = S.host ? `<button class="mp-next" onclick="mpHostNextReveal()">NASTĘPNE PYTANIE ›</button>` : '';
  const wf = pend.length ? mpWaitNamesHTML(pend, { hostId:g.hostId }) : `<div class="mp-waitfor" role="status"><span class="mp-wf-tx">✓ wszyscy dalej — zaraz następne pytanie…</span></div>`;
  return `${head}<div class="mp-deck mp-waitnext"><div class="mp-state">✓ idziesz dalej…</div>${mpPeopleHTML(players, adv)}${wf}</div>${hostBtn}${mpReactsBarHTML()}`;
};
const mpRenderNetErr = (g, head)=>{
  const msg = g.netReason==='empty' ? 'Brak zajawek dla tej kategorii — spróbuj ponownie albo zmień kategorię.' : 'Brak połączenia z iTunes (limit zapytań albo blokada sieci). Odczekaj minutę i spróbuj ponownie.';
  // 1.3: host ponawia (autorytet → retry do DO, relay → mpHostNewRound); nie-host czeka na hosta.
  const action = S.host ? '<br><button class="mp-btn ghost" onclick="mpHostRetry()">spróbuj ponownie</button>'
                        : '<br><span style="opacity:.7">host próbuje ponownie…</span>';
  return `${head}<div class="mp-deck"><div class="mp-state" style="color:var(--red)">${msg} ${action}</div></div>`;
};
const mpRenderNoLyric = (head)=>{
  // 1.3: dawniej BEZ przycisku = ślepy zaułek. Host przeskakuje slot (autorytet: retry→matchAdvance).
  const action = S.host ? '<br><button class="mp-btn ghost" onclick="mpHostRetry()">pomiń — następne pytanie</button>'
                        : '<br><span style="opacity:.7">host próbuje ponownie…</span>';
  return `${head}<div class="mp-deck"><div class="mp-state" style="color:var(--red)">Brak materiału do tej rundy w tej kategorii (wyczerpana pula). ${action}</div></div>`;
};

/* --- faza gry: małe budowniki HTML + częściowa aktualizacja (nie czyść pól) --- */
// pasek osób (design): awatar w kole (kolor = stan) + etykieta stanu pod spodem
// F6b (U7): kolory stanów = zmienne CSS (--rs-*, wariant html.dark w index.html), nie hardkody w JS
const ROSTER_META={
  idle:  {bg:'var(--rs-idle-bg)',fg:'var(--rs-idle-fg)',lab:'myśli',lc:'var(--rs-idle-fg)'},
  type:  {bg:'var(--blue)',fg:'#fff',lab:'pisze…',lc:'var(--rs-type-lc)'},
  ans:   {bg:'var(--green)',fg:'#fff',lab:'✓ typ',lc:'var(--rs-ans-lc)'},
  sure:  {bg:'var(--gold)',fg:'#7a5a00',lab:'🟡 pewniak',lc:'var(--rs-sure-lc)',ring:'var(--rs-sure-ring)'},
  pass:  {bg:'var(--rs-idle-bg)',fg:'var(--rs-idle-fg)',lab:'✋ pas',lc:'var(--rs-idle-fg)',dim:1},
};
/* Solo/Drużyny: KTO z rywali już odpowiedział (bez treści — serwer i tak ją wycina w PLAY, viewFor).
 * FIX „host nie widział moich odpowiedzi": w Solo host widział tylko siebie — zero śladu typów gościa.
 * Źródło: bucket.answered (nowy serwer) → pełne proposals (relay/TV) → counts przy 1-os. drużynie (stary serwer). */
function mpTeamAnswered(g, t){
  const b=(g.byTeam&&g.byTeam[t.id])||{}, ms=t.members||[];
  if(Array.isArray(b.answered)) return ms.filter(id=>b.answered.includes(id));
  if((b.proposals||[]).length) return ms.filter(id=>b.proposals.some(p=>p.by===id));
  return (ms.length===1 && b.counts && b.counts.proposals>0) ? ms.slice() : [];
}
function mpRivalsHTML(g){
  if(!g || g.phase!==MP.PLAY || (g.format||'coop')==='coop' || mpIsCompTV()) return '';
  const tid=myTeamId();
  const rivals=(g.teams||[]).filter(t=>t.id!==tid && (t.members||[]).length);
  if(!rivals.length) return '';
  const chips=rivals.map(t=>{
    const col=safeColor(t.color, mpAvatarColor(t.name));
    const ms=t.members||[], done=mpTeamAnswered(g, t);
    const b=(g.byTeam&&g.byTeam[t.id])||{};
    const passed=ms.length && ms.every(id=>(b.passed||[]).some(p=>p.id===id));
    const typing=ms.some(id=>S.typingSet && S.typingSet.has(id));
    const solo1=ms.length===1;
    const st = passed ? '✋ pas' : done.length ? (solo1 ? '✓ odpowiedział(a)' : `✓ ${num(done.length)}/${num(ms.length)} z typem`) : typing ? 'pisze…' : 'myśli';
    const nm = solo1 ? (mpNameOf(ms[0])||t.name||'gracz') : (t.name||'drużyna');
    return `<span class="mp-rival${done.length?' ans':''}" data-rival="${escapeHtml(t.id)}"><i style="background:${col}"></i><b>${escapeHtml(nm)}</b><small>${st}</small></span>`;
  }).join('');
  return `<div class="mp-rivals" role="status" aria-label="rywale — bez treści odpowiedzi"><span class="mp-rivals-h">rywale:</span>${chips}</div>`;
}
function mpRosterHTML(g){
  if(mpIsCompTV()) return '';   // F6b: TV (Solo/Drużyny) — status graczy jest w kartach drużyn (mpTvTeamsHTML)
  return mpSalonTeamHTML(g) + mpMyRosterHTML(g) + mpRivalsHTML(g);
}
/* P1-16: telefon w SALONIE — czytelny status MOJEJ drużyny (kolor, nazwa, „2/3 z typem", punkty); szczegóły i ranking są na TV */
function mpSalonTeamHTML(g){
  if(!g || !g.salon || mpIsSalonHost() || g.phase!==MP.PLAY) return '';
  const tid=myTeamId(), t=(g.teams||[]).find(x=>x.id===tid); if(!t) return '';
  const ms=t.members||[];
  const sum=tvTeamSummary(ms.map(id=>tvPlayerStatus({ phase:'play', roster:rosterState(g, tid, id, S.typingSet) }).key), 'play');
  const solo=(g.format||'coop')==='solo' || ms.length===1;
  const col=safeColor(t.color, mpAvatarColor(t.name));
  const name = solo ? 'Ty' : (t.name||'Twoja drużyna');
  return `<div class="mp-salonteam${sum.all?' all':''}" style="--tc:${col}" role="status"><i aria-hidden="true"></i><b>${escapeHtml(name)}</b><span>${escapeHtml(solo ? (sum.all?'✓ odpowiedź wysłana':'czekamy na Twój typ') : sum.label)}</span><small>📺 ranking na TV</small></div>`;
}
function mpMyRosterHTML(g){
  const tid=myTeamId();   // roster pokazuje TYLKO moją drużynę (izolacja)
  if(curSkin()==='czat'){   // design 08: kompaktowe pigułki „stół: [awatar status]"
    return `<span class="mp-stol">stół:</span>`+myTeamMembers().map(m=>{
      const st=rosterState(g,tid,m.id,S.typingSet), me=ROSTER_META[st]||ROSTER_META.idle;
      const av=escapeHtml((m.name||'?').slice(0,1).toUpperCase());
      return `<span class="mp-rchip${me.dim?' dim':''}${m.id===mpMe.id?' you':''}"><b style="background:${me.bg};color:${me.fg}">${av}</b><span style="color:${me.lc}">${me.lab}</span></span>`;
    }).join('');
  }
  return myTeamMembers().map(m=>{
    const st=rosterState(g,tid,m.id,S.typingSet), me=ROSTER_META[st]||ROSTER_META.idle;
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
// F6b (#6): TV salonu w formacie Solo/Drużyny — karty drużyn: kto pisze / dał typ / pewniak / pas + liczba typów.
// BEZ treści odpowiedzi (TV widzi cały stół — rywale nie mogą podejrzeć typów).
function mpTvTeamsHTML(g){
  const teams=(g.teams||[]);
  if(!teams.length) return `<div class="mp-state">czekamy na drużyny…</div>`;
  return `<div class="mp-tvteams">${teams.map(t=>{
    const col=safeColor(t.color, mpAvatarColor(t.name));
    const b=(g.byTeam&&g.byTeam[t.id])||{};
    const nTyp=(b.proposals||[]).length || (b.counts&&b.counts.proposals) || (Array.isArray(b.answered)?b.answered.length:0) || 0;
    const ppl=(t.members||[]).map(id=>{
      const st=rosterState(g,t.id,id,S.typingSet), me=ROSTER_META[st]||ROSTER_META.idle, nm=mpNameOf(id)||'gracz';
      return `<span class="mp-rchip${me.dim?' dim':''}"><b style="background:${me.bg};color:${me.fg}">${escapeHtml(nm.slice(0,1).toUpperCase())}</b><span style="color:${me.lc}">${escapeHtml(nm)} · ${me.lab}</span></span>`;
    }).join('');
    return `<div class="mp-tvteam" style="border-color:${col}"><div class="mp-tvteam-h"><i style="background:${col}"></i><b>${escapeHtml(t.name||'drużyna')}</b><small>${typCountText(nTyp)}</small></div><div class="mp-tvteam-ppl">${ppl}</div></div>`;
  }).join('')}</div>`;
}
function mpSlotsHTML(g){
  if(mpIsCompTV()) return mpTvTeamsHTML(g);
  const slots=renderSlots(g);
  const tid=myTeamId();   // kolumny TYLKO mojej drużyny
  const ro=mpIsSalonHost();   // TV-sędzia: może KLIKNĄĆ propozycję (nadpisuje górkę głosów), ale nie dorzuca własnych typów
  // P2-5: pusty stan zamiast pustych kolumn (dawniej ~150 px pustki pod samymi nagłówkami)
  if(!ro && slots.every(s=>!candidatesForSlot(g, tid, s.key).length)){
    const solo=(g.format||'coop')==='solo' || myTeamSize()<2;
    return `<div class="mp-slots-empty" role="note">✍️ ${solo ? 'Wpisz pierwszy typ — pole na dole' : 'Wrzućcie pierwszy typ — pola na dole'}<small>${escapeHtml(slots.map(s=>slotPlaceholder(s.label)).join(' · '))}</small></div>`;
  }
  // P2-5: kolumny równej szerokości wg liczby slotów (rok = 1 kolumna wyśrodkowana, nie przyklejona do lewej połowy)
  return `<div class="mp-slots${slots.length===1?' one':''}" style="grid-template-columns:repeat(${Math.max(1, Math.min(4, slots.length))},minmax(0,1fr))">${slots.map(s=>{
    const cands=candidatesForSlot(g, tid, s.key);
    const myVal=myVoteForSlot(g, tid, s.key, mpMe.id);
    const rows = cands.map((c,i)=>{
      const isTop=i===0 && c.votes.length>0;
      const voted = myVal && norm(myVal)===norm(c.value);   // salon: podświetla wybór hosta (nadpisanie)
      const dots = c.votes.slice(0,5).map((v,j)=>`<b class="mp-vdot" style="background:${VOTE_COLORS[j%VOTE_COLORS.length]}"></b>`).join('');
      return `<button type="button" class="mp-cand${isTop?' is-top':''}${voted?' voted':''}" data-k="${escapeHtml(s.key)}" data-v="${escapeHtml(c.value)}" onclick="mpVote(this.dataset.k, this.dataset.v)">
        <span class="cv">${escapeHtml(mpSlotShow(g, s.key, c.value))}</span>
        <span class="crow"><span class="up">▲ ${c.votes.length}</span><span class="dots">${dots}</span>${isTop?'<span class="topb">TOP</span>':''}</span>
      </button>`;
    }).join('') || (ro?`<div class="mp-cand empty"><span class="cv" style="opacity:.5">— czekamy na typy z telefonów —</span></div>`:'');
    // „+ dorzuć typ…" usunięte — wpisywanie jest w sekcji pól (mpFormHTML) pod kolumnami
    return `<div class="mp-slotcol"><div class="mp-slot-h">${escapeHtml(slotPlaceholder(s.label))}</div>${rows}</div>`;
  }).join('')}</div>`;
}
// „odpowiedź drużyny" (design): ciemna karta (kolumny) / zielona przypięta (czat) + ×2 gdy pewniak
function mpTeamHTML(g){
  // F6b (F8): host zatwierdza PEŁNYM przyciskiem (dawniej ✓ 36 px); reszta widzi, na kogo czeka
  const comp=(g.format||'coop')!=='coop';
  // Solo/Drużyny: host widzi, ile drużyn ma już typ (bez treści) — nie zatwierdza „w ciemno" przed graczami
  const teamsAll=(g.teams||[]).filter(t=>(t.members||[]).length);
  const nAns=comp ? teamsAll.filter(t=>mpTeamAnswered(g, t).length).length : 0;
  const cnt=comp && teamsAll.length ? ` <small class="mp-lockcnt">${num(nAns)}/${num(teamsAll.length)} z typem</small>` : '';
  // P1-3: wszyscy obecni dali typ albo pas → serwer zamyka pytanie po krótkiej karencji
  const allDone = g.allDoneAt ? `<div class="mp-alldone" role="status">✓ Wszyscy gotowi! Sprawdzamy…</div>` : '';
  // P1-4: host widzi, na kogo czeka („Czekamy na: Ola, Kuba") — rywale z okrojonego bucketu (`answered`, bez treści)
  const waitFor = (S.host && !allDone) ? mpWaitNamesHTML(unsettledIds(g, mpPlayers().map(m=>m.id)), { lead:'Czekamy na' }) : '';
  // P1-10: w Solo/Drużynach host jest GRACZEM — „Zakończ pytanie" nie stoi nad jego polami (jest w stopce, od połowy czasu)
  const lockBtn = allDone ? allDone : (S.host && (!comp || mpIsCompTV()))
    ? `<button type="button" class="mp-lockbtn" onclick="mpLock()" aria-label="${comp?'Zakończ pytanie i zatwierdź odpowiedzi wszystkich drużyn':'Zatwierdź odpowiedź drużyny'}">✓ ${comp?'ZATWIERDŹ WSZYSTKICH':'ZATWIERDŹ ODPOWIEDŹ'}${cnt}</button>`
    : `<div class="mp-lockwait">${comp ? (g.timer>0?'pytanie kończy się, gdy wszyscy odpowiedzą — albo minie czas':'pytanie kończy się, gdy wszyscy odpowiedzą (albo host je zakończy)')
        : (g.timer>0?'host zatwierdza — albo koniec czasu':'czekamy, aż host zatwierdzi odpowiedź')}</div>`;
  if(mpIsCompTV()) return lockBtn+waitFor;   // TV (Solo/Drużyny): bez odpowiedzi drużyny, tylko „zatwierdź wszystkich"
  const tid=myTeamId();
  const ta=teamAnswer(g, tid), slots=renderSlots(g);
  const any=slots.some(s=>ta[s.key]);
  // P1-9: copy per format — Solo „Twoja odpowiedź", bez „przegłosujcie" przy 1-osobowej drużynie
  const fc=formatCopy(g.format, myTeamSize());
  const mc=mcOptions(g);
  const show=(k,v)=>{ if(!mc || k!==mc.key) return mpSlotShow(g, k, v); const l=mcLetterOf(v, mc.options), o=l && mc.options.find(x=>x.letter===l); return o ? `${o.letter}) ${o.text}` : v; };
  const val = any ? slots.map(s=> ta[s.key]?escapeHtml(show(s.key, ta[s.key])):'—').join(' — ') : (mc ? '— stuknij kafel —' : fc.emptyHint);
  const sure = (myBucket().sure||[]).length>0;
  const badge = sure ? '<span class="mp-x2">🟡 ×2</span>' : '';
  const cls = curSkin()==='czat' ? 'mp-teamc' : 'mp-teamd';
  return `<div class="${cls}"><span class="ic">${ic('target')}</span><span class="tx"><span class="l">${fc.answerLabel}</span><span class="v">${val}</span></span>${badge}</div>${lockBtn}${waitFor}`;
}
/* P1-10: „Zakończ pytanie" hosta w Solo/Drużynach — w stopce POD jego polami, widoczne od połowy czasu pytania
 * (widoczność odświeża też tick w mp.js). Z P1-3 (auto-zamknięcie przy komplecie) potrzebne rzadko. */
function mpEndQHTML(g){
  if(!S.host || !g || (g.format||'coop')==='coop' || mpIsSalonHost() || g.allDoneAt) return '';
  const teamsAll=(g.teams||[]).filter(t=>(t.members||[]).length);
  const nAns=teamsAll.filter(t=>mpTeamAnswered(g, t).length).length;
  const off=S.clockOff||0;
  const vis=hostEndVisible({ playAt:Number.isFinite(g.playAt)?g.playAt-off:null, endsAt:g.endsAt?g.endsAt-off:null, now:Date.now() });
  return `<button type="button" class="mp-endq" id="mpEndQ" onclick="mpLock()"${vis?'':' hidden'} aria-label="Zakończ pytanie dla wszystkich">⏹ Zakończ pytanie <small>${num(nAns)}/${num(teamsAll.length)} z typem</small></button>`;
}
// „pewniak" + „pas" — dwa NIEZALEŻNE od typowania toggle (jeden wiersz). Działają dla każdego
// uczestnika (też kto tylko głosował), bo stan żyje w buckecie drużyny (sure/passed, nie w propozycji).
// Stan podświetlony z gry (on), więc po wysłaniu odpowiedzi klik nadal działa i widać efekt.
// Kto pewniakuje / spasował widać też na pasku osób (roster), więc tu bez list imion.
function mpConfHTML(withPass=true){
  const bkt=myBucket();
  const iSure   = (bkt.sure||[]).some(p=>p.id===mpMe.id);
  const iPassed = (bkt.passed||[]).some(p=>p.id===mpMe.id);
  // P0-3: pewniak przy pustej odpowiedzi drużyny wymaga 2. tapu (mpSureTap) — etykieta pyta „na pewno?"
  const arm = !iSure && S.sureArmUntil>Date.now();
  const sure = `<button class="mp-seg s${iSure?' on':''}${arm?' confirm':''}" style="flex:1.6" onclick="mpSureTap()" aria-pressed="${iSure}">${arm?'🟡 ×2 — na pewno?':'🟡 PEWNIAK ×2'}</button>`;
  const pass = withPass ? `<button class="mp-seg p${iPassed?' on':''}" style="flex:1" onclick="mpSend({type:'pass'})">✋ pas</button>` : '';
  return `${sure}${pass}`;
}
// przełącznik skórki (A/B): per-klient, czysty render nad tym samym stanem
const mpHr = ()=> `<div class="mp-hr"></div>`;
// czas fazy „słuchaj" — z kategorii (cat.listenSecs) albo domyślnie wg trybu (core/timing.js)
function mpListenSecs(g){
  const cat=ALL_CATS[g.catKey];
  return _listenSecs(g.mode, cat && cat.listenSecs);
}
// faza „słuchaj": płyta winylowa = play/pauza (app/vinyl.js — ten sam SVG co solo; id „mpKnob", ikona #mpKnobIcon)
// P2-7: lektor (synteza mowy) — ikona mikrofonu z falami zamiast płyty winylowej (metafora płyty nie pasuje do TTS).
// Ten sam id „mpKnob" i mpKnobTap (stop/powtórz); stan „czyta" = klasa .on (mp.js mpSetKnob).
const mpLektorKnobHTML = ()=> `<button type="button" class="mp-knob mp-lektor" id="mpKnob" onclick="mpKnobTap()" aria-pressed="false" aria-label="Lektor czyta opis — stuknij, by zatrzymać albo powtórzyć"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg><i class="mp-lk-w" aria-hidden="true"></i><i class="mp-lk-w w2" aria-hidden="true"></i></button>`;
const mpKnobHTML = (g)=> g && g.mode==='lektor' ? mpLektorKnobHTML() : mpVinylHTML();
// F6b (tryb #6): gałka „pilota" — dźwięk gra u hosta; bez #mpKnobIcon (stany odtwarzacza jej nie zmieniają)
const mpRemoteKnobHTML = ()=> `<button class="mp-knob remote" id="mpKnob" onclick="mpKnobTap()" aria-label="Dźwięk gra u hosta — słuchaj z jego głośnika"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/><path d="M14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg></button>`;
const MP_REMOTE_STATUS = '🔈 słuchaj z głośnika hosta';
const mpLyricHTML = (g)=> g.mode==='lektor'&&g.lyric ? `<div class="lyric-box"><span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>${escapeHtml(g.lyric)}</div>` : '';
/* P1-12: lektor — opis do odgadnięcia widoczny też w „kombinuj" (zwijany <details>, nad polami); stan rozwinięcia
 * pamiętany per pytanie (S.lyricFold — re-render scaffoldu nie zwija go z powrotem) */
function mpLyricFoldHTML(g){
  if(g.mode!=='lektor' || !g.lyric) return '';
  const open = S.lyricFold && S.lyricFold.nonce===g.playNonce ? S.lyricFold.open : true;
  return `<details class="lyric-box lyric-fold"${open?' open':''} ontoggle="mpLyricToggle(this.open)"><summary class="lyric-cap">opis — zgadnij tytuł i wykonawcę</summary><div class="lyric-tx">${escapeHtml(g.lyric)}</div></details>`;
}
/* MP oś czasu (serwer-autorytet): oś MOJEJ drużyny (game.timeline[teamId] — karty jawne) ze szczelinami do stuknięcia.
 * Szczelina = typ gracza (mpTlPick → propose {gap}); kropki = głosy drużyny na szczelinę, TOP = odpowiedź drużyny.
 * TV coop: ta sama oś (sędzia nadpisuje stuknięciem); TV Solo/Drużyny: podsumowania osi drużyn (bez typów). */
const mpTlCards = (g, tid)=> teamTimeline(g, tid);
const mpGapText = (g, v)=> { const k=Number(v); return Number.isInteger(k) ? gapLabel(mpTlCards(g, myTeamId()), k) : String(v||''); };
const mpSlotShow = (g, key, v)=> (g && g.mode==='timeline' && key==='gap') ? mpGapText(g, v) : v;
const mpInputSlots = (g)=> renderSlots(g).filter(s=>s.key!=='gap');   // szczelina wybierana na osi, nie wpisywana
function mpTlCardHTML(c){
  return `<div class="mp-tl-card${c.anchor?' anchor':''}"><b>${num(c.year)}</b><small>${escapeHtml(displayTitle(c.track||''))}</small><small class="a">${escapeHtml(c.artist||'')}</small></div>`;
}
function mpTimelineHTML(g, tv=false){
  if(!g || g.mode!=='timeline') return '';
  if(tv && mpIsCompTV()){   // TV Solo/Drużyny: bez szczelin i typów — tylko stan osi każdej drużyny
    const rows=(g.teams||[]).filter(t=>(t.members||[]).length).map(t=>`<li><b>${escapeHtml(t.name||'drużyna')}</b> <small>${escapeHtml(timelineSummary(mpTlCards(g, t.id)))}</small></li>`).join('');
    return `<div class="mp-tl tv-tl"><div class="mp-tl-h">🕰 Osie czasu</div><ul class="mp-tl-sum">${rows}</ul></div>`;
  }
  const tid=myTeamId(), cards=mpTlCards(g, tid);
  const cands=candidatesForSlot(g, tid, 'gap'), top=teamAnswer(g, tid).gap;
  const mine=myVoteForSlot(g, tid, 'gap', mpMe.id);
  const live=g.phase===MP.PLAY && (!tv || (g.format||'coop')==='coop');
  const gapBtn=(k)=>{
    const c=cands.find(x=>norm(x.value)===String(k)), n=c ? c.votes.length : 0;
    const sel=mine!=null && String(mine)===String(k), isTop=top!=null && top!=='' && String(top)===String(k) && n>0;
    const dots=n ? `<span class="mp-tl-n" aria-label="głosy: ${num(n)}">${'●'.repeat(Math.min(n,5))}</span>` : '';
    return `<button type="button" class="mp-tl-gap${sel?' sel':''}${isTop?' lead':''}" data-gap="${num(k)}" aria-pressed="${sel}" aria-label="${escapeHtml(gapLabel(cards, k))}"${live?'':' disabled'} onclick="mpTlPick(this.dataset.gap)">▼${dots}</button>`;
  };
  const row=[gapBtn(0)];
  cards.forEach((c,i)=>{ row.push(mpTlCardHTML(c)); row.push(gapBtn(i+1)); });
  const pick = top!=null && top!=='' ? `drużyna: <b>${escapeHtml(mpGapText(g, top))}</b>` : (tv ? 'czekamy na wybór miejsca' : 'stuknij ▼ tam, gdzie pasuje ten utwór');
  return `<div class="mp-tl${tv?' tv-tl':''}" role="group" aria-label="oś czasu drużyny"><div class="mp-tl-h">🕰 ${escapeHtml(fcTl(g))} · ${escapeHtml(timelineSummary(cards))}</div>`+
    `<div class="mp-tl-row">${row.join('')}</div><div class="mp-tl-cap" aria-live="polite">${pick}</div>`+
    (tv ? '' : `<div class="mp-cover-legend">${escapeHtml(scoreLegend('timeline'))}</div>`)+`</div>`;
}
const fcTl = (g)=> (g.format||'coop')==='solo' ? 'Twoja oś' : 'Wasza oś';
function mpTlSync(g){
  const w=$m('mpTlWrap'); if(!w) return;
  const html=mpTimelineHTML(g);
  if(w._tlHtml!==html){ w.innerHTML=html; w._tlHtml=html; }
}
const mpTlWrapHTML = (g)=> g && g.mode==='timeline' ? `<div id="mpTlWrap"></div>` : '';
/* MP ETAPY ODSŁONY (serwer-autorytet): okładka i intro — klient renderuje to, co przyszło (game.stage/stageAt, okładka:
 * game.coverArt w rozdzielczości etapu), bez własnych timerów odsłony. „wyraźniej"/„+ więcej" = prośba {t:'more'} do
 * serwera (dowolny gracz; app/mp.js mpMoreStage) — serwer przesuwa harmonogram dla wszystkich. */
const fmtMult = (x)=> '×'+Number(x).toFixed(1).replace('.',',');
const mpStaged = (g)=> !!g && (g.mode==='cover' || g.mode==='intro');
const mpStageNum = (g, n)=> Math.max(0, Math.min(n-1, Math.floor(Number(g && g.stage))||0));
const mpMoreSent = (g)=> !!g && S.moreSent===`${g.playNonce}:${g.stage}`;   // już poprosiłem o ten etap — przycisk wyszarzony
const mpCanMore = (g)=> !!g && g.phase===MP.PLAY && Array.isArray(g.stageStarts) && g.stage+1<g.stageStarts.length && !mpMoreSent(g);
// odsłona: „odpowiedź przy 16×16 pikselach · mnożnik ×2,0" / „odpowiedź po 2 s · mnożnik ×1,6"
function mpStageEvalText(e){
  if(!e || typeof e!=='object') return '';
  const m=` · mnożnik ${fmtMult(Number(e.mult)||1)}`;
  if(Number(e.blocks)>0) return `odpowiedź przy ${num(e.blocks)}×${num(e.blocks)} pikselach${m}`;
  if(Number(e.secs)>0) return `odpowiedź po ${num(e.secs)} s${m}`;
  return '';
}
/* MP okładka: obraz etapu (16/32/64 — pełna okładka tylko w odsłonie); malowanie pikselowe wspólne z solo
 * (app/cover.coverPaintBoxes → coverDrawPixels). URL tylko https → data-art (escapeHtml); podpis: bloki + mnożnik;
 * legenda jak w solo (scoreLegend); telefon: „wyraźniej ›" (następny etap wcześniej). */
function mpCoverHTML(g, tv=false){
  if(!g || g.mode!=='cover') return '';
  const st=mpStageNum(g, COVER_STAGES.length), bl=coverStageBlocks(st);
  const art = typeof g.coverArt==='string' && /^https:\/\//.test(g.coverArt) ? g.coverArt : '';
  const more = !tv && Array.isArray(g.stageStarts) ? `<button type="button" class="mp-btn ghost mp-more" id="mpMore" onclick="mpMoreStage()"${mpCanMore(g)?'':' disabled'}>wyraźniej ›</button>` : '';
  return `<figure class="mp-cover-fig${tv?' tv-coverfig':''}"><div class="cover-box mp-cover" data-art="${escapeHtml(art)}" data-blocks="${num(bl)}" data-stage="${num(st)}">`+
    `<canvas width="320" height="320" role="img" aria-label="okładka albumu (rozpikselowana)"></canvas></div>`+
    `<figcaption class="mp-cover-cap" aria-live="polite">🖼 ${num(bl)}×${num(bl)} pikseli · teraz ${fmtMult(coverMult(st))}</figcaption>${more}<div class="mp-cover-legend">${escapeHtml(scoreLegend('cover'))}</div></figure>`;
}
/* MP intro: pasek etapów 1·2·4·8·16 s (minione ✓, bieżący podświetlony), mnożnik teraz, legenda; telefon: „↻ odsłuchaj"
 * (lokalnie, bieżący etap — tylko gdy dźwięk gra u mnie) i „+ więcej" (dowolny gracz). TV: duży pasek bez przycisków. */
function mpIntroStagesHTML(g, tv=false){
  if(!g || g.mode!=='intro') return '';
  const n=INTRO_STAGES.length, st=mpStageNum(g, n);
  const chips=INTRO_STAGES.map((sec,i)=>`<span class="mp-stg${i<st?' done':i===st?' on':''}"${i===st?' aria-current="step"':''}>${num(sec)} s</span>`).join('<i class="mp-stg-sep" aria-hidden="true">·</i>');
  const here=mpPlaysHere(g), last=st>=n-1;
  const btns = tv ? '' : `<div class="mp-stg-btns">${here?`<button type="button" class="mp-btn ghost" id="mpIntroReplay" onclick="mpIntroReplay()">↻ odsłuchaj</button>`:''}`+
    (Array.isArray(g.stageStarts) ? `<button type="button" class="mp-btn mp-more" id="mpMore" onclick="mpMoreStage()"${mpCanMore(g)?'':' disabled'}>${last?'pełne 16 s ✓':`+ więcej (${num(INTRO_STAGES[st+1])} s)`}</button>` : '')+`</div>`;
  const where = here ? '' : g.salon ? ' · gra na TV' : ' · gra u hosta';
  return `<div class="mp-stages${tv?' tv-stages':''}" role="group" aria-label="etapy intro"><div class="mp-stg-row">${chips}</div>`+
    `<div class="mp-stg-cap" id="mpStgSt" aria-live="polite">⏱ teraz ${num(introStageSecs(st))} s · ${fmtMult(introMult(st))}${where}</div>${btns}<div class="mp-cover-legend">${escapeHtml(scoreLegend('intro'))}</div></div>`;
}
// odśwież blok etapów w scaffoldzie telefonu (bez przebudowy pól) — tylko gdy zmienił się etap/obraz
function mpStageSync(g){
  const w=$m('mpStageWrap'); if(!w) return;
  const html=mpCoverHTML(g)+mpIntroStagesHTML(g);
  if(w._stageHtml!==html){ w.innerHTML=html; w._stageHtml=html; }
  coverPaintBoxes(w);
}
const mpStageWrapHTML = (g)=> mpStaged(g) ? `<div id="mpStageWrap"></div>` : '';
// wiedza ogólna: treść pytania w tym samym pudełku co tekst lektora
// F8a: „abcd" (muzyka) — kafle „Tytuł — Wykonawca" w tym samym pudełku; odpowiedź = litera (jak ABCD quizu)
// Łamigłówki: g.promptStyle==='rebus' → emoji duże i wyśrodkowane (stary serwer bez pola → zwykły tekst)
// P1-8: pytanie ABCD — w pudełku tylko treść (bez linii „A) …"), opcje to kafle (mpMcHTML)
function mpPromptHTML(g){
  if(!((g.mode==='quiz'||g.mode==='abcd') && g.prompt)) return '';
  const mc=mcOptions(g);
  const cap = mc ? (g.mode==='abcd' ? 'który utwór? — stuknij kafel' : 'pytanie — stuknij kafel A–D') : 'pytanie';
  const body = mc ? (mc.question || (g.mode==='abcd' ? 'Jaki to utwór?' : '')) : g.prompt;
  return `<div class="lyric-box quiz${g.promptStyle==='rebus'?' rebus':''}"><span class="lyric-cap">${cap}</span>${promptBodyHTML(body, g.mode==='quiz'?g.promptStyle:'')}</div>`;
}
/* P1-8 (przegląd MP 2026-10): ABCD w MP = KAFLE .mc-opt (jak solo) zamiast „wpisz literę". Tap = propozycja + głos
 * (`propose` {slot: litera} — jedna odpowiedź na gracza, auto-głos) → odpowiedź drużyny = najczęstsza litera.
 * Na kaflu: ile osób z MOJEJ drużyny go wybrało (kropki). TV-sędzia (coop) klika = nadpisanie (głos `set`);
 * TV Solo/Drużyny — kafle tylko do czytania (bez cudzych wyborów). */
function mpMcInnerHTML(g){
  const mc=mcOptions(g); if(!mc) return '';
  const tv=mpIsSalonHost(), compTV=mpIsCompTV(), tid=myTeamId();
  const tally=compTV ? {} : mcTally(g, tid, mc);
  const mine=myVoteForSlot(g, tid, mc.key, mpMe.id);
  const myL=mine ? mcLetterOf(mine, mc.options) : null;
  const top=compTV ? null : mcLetterOf(teamAnswer(g, tid)[mc.key], mc.options);
  const many=!compTV && myTeamSize()>1;
  return mc.options.map(o=>{
    const n=(tally[o.letter]||[]).length, sel=myL===o.letter;
    const dots = many && n ? `<span class="mc-n" aria-label="głosy: ${num(n)}">${'●'.repeat(Math.min(n,5))}${n>5?'+':''}</span>` : '';
    const topB = many && top===o.letter && n ? '<span class="mc-top">TOP</span>' : '';
    return `<button type="button" class="mc-opt${sel?' sel':''}${top===o.letter&&many?' lead':''}" data-letter="${o.letter}" aria-pressed="${sel}"${compTV?' disabled':''} onclick="mpMcPick(this.dataset.letter)"><span class="mc-let">${o.letter}</span><span class="mc-tx">${escapeHtml(o.text)}</span>${topB}${dots}</button>`;
  }).join('');
}
const mpMcHTML = (g)=> mcOptions(g) ? `<div class="mc-opts mp-mc" id="mpMc" role="group" aria-label="odpowiedzi A–D">${mpMcInnerHTML(g)}</div>` : '';
// F8a: atrybuty pola slotu — rok = liczba (klawiatura numeryczna, zakres suwaka solo)
const slotInputAttrs = (s)=> s.key==='year' ? ` type="number" inputmode="numeric" min="${YEAR_MIN}" max="${YEAR_MAX}"` : '';
function mpAvatarColor(name){ let h=0; for(const ch of (name||'?')) h=(h*31+ch.charCodeAt(0))>>>0; return VOTE_COLORS[h%VOTE_COLORS.length]; }
function mpChatFeedHTML(){
  const rows=S.feed.log.map(c=>{
    if(c.kind==='sys') return `<div class="mp-csys ${c.cls||''}">${escapeHtml(c.text)}</div>`;
    const av=escapeHtml((c.byName||'?').slice(0,1).toUpperCase());
    const avb=`<b class="mp-cmav" style="background:${mpAvatarColor(c.byName)}">${av}</b>`;
    if(c.kind==='typ'){
      const dataVals = S.host ? ` data-values="${escapeHtml(JSON.stringify(c.values||{}))}"` : '';
      const bubbleClick = S.host ? ' onclick="mpVoteFromBubble(this)" style="cursor:pointer"' : '';
      const chips=(c.chips||[]).map(ch=>{
        const valAttrs = (S.host && ch.key)
          ? ` class="val mp-val-vote" data-k="${escapeHtml(ch.key)}" data-v="${escapeHtml(ch.val||'')}" onclick="event.stopPropagation();mpPick(this.dataset.k,this.dataset.v)"`
          : ' class="val"';
        return `<span class="mp-typline"><span class="mp-typchip">@${escapeHtml((ch.slot||'').toUpperCase())}</span><span${valAttrs}>${escapeHtml(mpSlotShow(S.game, ch.key, ch.val||''))}</span></span>`;
      }).join('');
      return `<div class="mp-cmsg${c.mine?' me':''}">${avb}<div class="mp-cmb typ${c.mine?' me':''}"${dataVals}${bubbleClick}><span class="nm">${escapeHtml(c.byName||'')} · typ${S.host?' <span class="mp-host-tip">kliknij tytuł/wykonawcę = wybierz</span>':''}</span>${chips}</div></div>`;
    }
    return `<div class="mp-cmsg${c.mine?' me':''}">${avb}<div class="mp-cmb${c.mine?' me':''}"><span class="nm">${escapeHtml(c.byName||'')}</span><div class="tx">${escapeHtml(c.text||'')}</div></div></div>`;
  }).join('');
  const typing=mpTypingFeedHTML();
  // P1-15: pusty feed — podpowiedź, gdzie trafia typ (dawniej pusta dziura nad composerem)
  if(!rows && !typing){
    const g=S.game||{}, solo=(g.format||'coop')==='solo';
    const tx = mcOptions(g) ? 'Stuknij kafel wyżej — to Twoja odpowiedź; tu piszecie czat' : solo ? 'Wpisz typ — trafi do Twojej odpowiedzi, nie na czat' : 'Wpisz typ — trafi do drużyny, nie na czat';
    return `<div class="mp-chint-empty" role="note">✍️ ${tx}</div>`;
  }
  return rows + typing;
}
function mpTypingFeedHTML(){
  const ids=[...(S.typingSet||[])].filter(id=>id && id!==mpMe.id);
  if(!ids.length) return '';
  const names=ids.map(id=>mpNameOf(id)||'gracz'), first=names[0]||'?';
  return `<div class="mp-cmsg mp-ctyping"><b class="mp-cmav" style="background:${mpAvatarColor(first)}">${escapeHtml(first.slice(0,1).toUpperCase())}</b>`+
    `<span class="mp-typing"><span></span><span></span><span></span></span><span class="mp-typname">${escapeHtml(names.join(', '))} pisze…</span></div>`;
}
// dawny duży pasek faz (rail) w treści — usunięty; zostaje no-op, by nie ruszać miejsc wywołania.
function mpRailHTML(_active){ return ''; }
const MP_PHASES=[['sluchaj','🎧'],['kombinuj','🧠'],['odslona','👁']];
// bieżąca faza do wskaźnika: odsłona (także moja zaległa) / słuchaj / kombinuj; inne sceny (karta, gotowość, wynik) → null
function mpPhaseNow(g){
  if(!g) return null;
  if(mpRevealPending() || g.phase===MP.REVEAL) return 'odslona';
  if(g.phase===MP.PLAY && !mpInCount(g)) return mpEffSub(g)==='sluchaj' ? 'sluchaj' : 'kombinuj';
  return null;
}
// podpis aktywnej fazy (P1-14) — Solo mówi do gracza („Kombinuj"), reszta do drużyny
function mpPhaseLabel(g, ph){
  if(ph==='sluchaj') return g.mode==='quiz' ? 'Czytaj' : g.mode==='lektor' ? 'Słuchaj lektora' : 'Słuchaj';
  if(ph==='kombinuj') return (g.format||'coop')==='solo' ? 'Kombinuj' : 'Kombinujcie';
  return 'Odsłona';
}
/* P1-1 krok 2/3 + P1-14: PASEK FAZY pod nagłówkiem (w jego ramie) — w niego „zwija się" karta pytania. Rail 🎧·🧠·👁 20 px,
 * aktywna faza z podpisem, polecenie zadania obok; kolor fazy = tło nagłówka (data-ph na .mp-hd). */
function mpPhaseBarHTML(g){
  const cur=mpPhaseNow(g); if(!cur) return '';
  const lab=mpPhaseLabel(g, cur);
  const task = cur==='odslona' ? '' : mpTaskText(g);
  // aktywna faza = pigułka „🎧 SŁUCHAJ · Zgadnij ROK wydania" (tytuł fazy, w który zwija się karta); pozostałe — ikony
  const rail=MP_PHASES.map(([k,e])=> k===cur
    ? `<span class="mp-ph-on"><i class="on">${e}</i><b class="mp-ph-lab">${escapeHtml(lab)}</b>${task?`<span class="mp-phtask">${escapeHtml(task)}</span>`:''}</span>`
    : `<i>${e}</i>`).join('<span class="mp-ph-sep" aria-hidden="true">›</span>');
  return `<div class="mp-phbar" data-ph="${cur}"><div class="mp-ph" role="img" aria-label="faza: ${escapeHtml(lab)}${task?' — '+escapeHtml(task):''}">${rail}</div></div>`;
}
// efektywna pod-faza: na NOWE pytanie (zmiana playNonce) mpRenderPlay ustawi S.sub='sluchaj' dopiero
// PO mpOnEnter — więc klucz sceny liczy sub z wyprzedzeniem (inaczej zły kolor / podwójne przejście).
function mpEffSub(g){ return (g && S.playRound!==g.playNonce) ? 'sluchaj' : S.sub; }
// legenda stanów rostera (skórka czat — nad kreską)
function mpLegendHTML(){
  return `<div class="mp-legend"><span>🟡 pewniak</span><span>✓ typ</span><span>··· pisze</span><span>🤚 pas</span><span>· myśli</span></div>`;
}
// formularz typowania per slot (wspólny dla fazy/kombinuj)
function mpFormHTML(g){
  const slots=mpInputSlots(g);   // MP oś czasu: bez pola szczeliny (wybór na osi)
  // P0-4: Enter = „Wrzuć" (wcześniejsze pole: dalej do następnego); klawiatura telefonu „Dalej"/„Wyślij"
  const inputs=slots.map((s,i)=>`<input id="mpProp_${s.key}"${slotInputAttrs(s)} placeholder="${escapeHtml(slotPlaceholder(s.label))}" aria-label="odpowiedź: ${escapeHtml(slotPlaceholder(s.label))}" enterkeyhint="${i<slots.length-1?'next':'send'}" autocomplete="off" data-k="${escapeHtml(s.key)}" oninput="mpTypingPing()" onkeydown="mpPropKey(event, this.dataset.k)">`).join('');
  const cols=slots.map(()=>'1fr').join(' ')+' auto';
  return `<div class="mp-form" style="grid-template-columns:${cols}">${inputs}<button onclick="mpPropose()">Wrzuć</button></div>`;
}
// composer „@odp" (czat): DOMYŚLNIE pola slotów (tytuł/wykonawca) — odpowiedź to główna akcja fazy. 💬 przełącza
// na zwykłą wiadomość (tam „@" nadal morfuje w pola). FIX „host nie widział moich odpowiedzi": dawniej domyślny
// był czat, a odpowiedź wpisana bez „@" szła jako wiadomość `say` — host widział czat, w stanie gry nie było typu.
// Pola flex:1 (bez stałych 42%) → brak przerwy na iOS Safari.
function mpComposerHTML(g, chatOnly=false){
  const slots=mpInputSlots(g);
  if(chatOnly) return `<div class="mp-composer chat-only"><div class="mp-compfield"><div class="mp-cwrap" id="mpCompChat"><input id="mpChatIn" maxlength="80" autocomplete="off" placeholder="czat… (odpowiedź = kafel wyżej)" onkeydown="if(event.key==='Enter')mpChatSend()"></div></div><button id="mpCompBtn" class="mp-send" onclick="mpChatSend()" aria-label="wyślij">➤</button></div>`;
  const typ = S.composerMode!=='chat';
  const chips=slots.map((s,i)=>`${i?'<span class="mp-sep">,</span>':''}<input id="mpTyp_${s.key}"${slotInputAttrs(s)} class="mp-slotchip" enterkeyhint="send" autocomplete="off" placeholder="${escapeHtml(slotPlaceholder(s.label))}" aria-label="odpowiedź: ${escapeHtml(slotPlaceholder(s.label))}" oninput="mpTypingPing()" onkeydown="if(event.key==='Enter')mpComposerSend()">`).join('');
  return `<div class="mp-composer">
      <button class="mp-cf mp-typtoggle" id="mpTypToggle" onclick="mpComposerToggle()" title="przełącz czat/odpowiedź" aria-label="${typ?'przełącz na czat':'przełącz na odpowiedź'}">${typ?'💬':'✍️'}</button>
      <div class="mp-compfield">
        <div class="mp-cwrap" id="mpCompChat"${typ?' style="display:none"':''}><input id="mpChatIn" maxlength="80" autocomplete="off" placeholder="czat… (@ = odpowiedź)" oninput="mpChatInput()" onkeydown="if(event.key==='Enter')mpComposerSend()"></div>
        <div class="mp-cwrap mp-cwrap-typ" id="mpCompTyp"${typ?'':' style="display:none"'}><span class="mp-at" title="odpowiedź">@</span>${chips}</div>
      </div>
      <button id="mpCompBtn" class="mp-send" onclick="mpComposerSend()">➤</button>
    </div>`;
}
// nagłówek gry (design): kolorowy pas — wiersz 1 runda·pokój·timer; wiersz 2 chipy kat/tryb/pyt
// F6b (A2): numer pytania w CAŁYM meczu (core/match.matchProgress); stan bez slotów → w bloku (jak dawniej)
function mpQLabel(g){
  if(Array.isArray(g.slots) && g.slots.length){ const p=matchProgress(g); return `Pyt. ${num(p.n)}/${num(p.total)}`; }
  return `Pyt. ${num((Number(g.qi)||0)+1)}/${QPC}`;
}
/* P1-5: „⭐ 270" — punkty MOJEJ drużyny (coop: wspólne; Solo: moje) na żywo w nagłówku. TV (Solo/Drużyny) i gracz spoza
 * drużyn — bez (nie mają „swojego" wyniku). W odsłonie wartość końcowa; mpScoreFly odlicza ją od poprzedniej. */
function mpScoreHTML(g){
  if(!g || !g.scores || typeof g.scores!=='object' || mpIsCompTV()) return '';
  const tid=myTeamId(); if(!(g.teams||[]).some(t=>t.id===tid) && tid!=='all') return '';
  const v=Number(g.scores[tid])||0;
  return `<span class="mp-hd-score" id="mpScore" title="${(g.format||'coop')==='solo'?'Twoje punkty':'punkty drużyny'}" aria-label="punkty: ${num(v)}">⭐ <b>${num(v)}</b></span>`;
}
function mpHeaderHTML(g){
  const MODE={music:ic('music')+' muzyka',lektor:ic('mic')+' lektor',reverse:ic('reverse')+' od tyłu',snippet:ic('scissors')+' fragment',quiz:ic('brain')+' wiedza',
    abcd:ic('music')+' ABCD', year:ic('music')+' rok', revsnip:ic('reverse')+' od tyłu krótko',
    slowmo:'🐢 zwolnione 0,6×', fastmo:'🐿 przyspieszone 1,5×', cover:'🖼 okładka', intro:'⏱ intro', medley:'🎛 składanka', piano:'🎹 fortepian', guitar:'🎸 gitara', timeline:'🕰 oś czasu'};   // MP okładka/intro (autorytet)   // EKSPERYMENT: tempo lokalne (stałe w MP)   // F8a; EKSPERYMENT
  // P1-14: kolor fazy w tle ramy (data-ph); przejście 200 ms z poprzedniego koloru (--ph-from, mpNotePhase)
  const ph=mpPhaseNow(g)||'card';
  const from = S.phFrom && S.phFrom!==ph ? ` ph-chg" style="--ph-from:var(--ph-${S.phFrom})` : '';
  const bar=mpPhaseBarHTML(g);
  // karta pytania (P1-1) sama pokazuje kategorię i zadanie — w nagłówku zostaje rama: numer, ⭐, zegar
  const chips = ph==='card' ? '' : `<div class="mp-hd-chips">
      <span>${escapeHtml(g.catLabel||g.catKey||'—')}</span>
      <span>${MODE[g.mode]||escapeHtml(g.mode||'')}</span>
      ${(Number(g.rounds)||1)>1?`<span>Runda ${num(g.round||1)}/${num(g.rounds)}</span>`:''}
      ${g.salon?`<span title="muzyka i pytania na dużym ekranie">📺 na TV</span>`:audioHostOnly(g)?`<span title="dźwięk gra tylko u hosta">🔈 u hosta</span>`:''}
    </div>`;
  // F6b (F6): strzałka = „opuścić pokój?" (potwierdzenie), nie natychmiastowe wyjście
  return `<div class="mp-hd${from}" data-ph="${ph}">
    <div class="mp-hd-r1">
      <button type="button" class="mp-hd-back" onclick="mpConfirmLeave('game')" aria-label="Opuść pokój">${ic('back')}</button>
      <span class="mp-hd-title">${mpQLabel(g)} <small>· 🍺 ${escapeHtml(S.code||'')}</small></span>
      ${mpScoreHTML(g)}
      <span class="mp-hd-timer" id="mpCountdown" role="status" aria-live="polite"></span>
      <button type="button" class="mp-hd-more" onclick="mpGameMenu()" aria-label="Menu gry — układ, dźwięki, wyjście" aria-haspopup="dialog">⋯</button>
    </div>
    ${chips}${bar}
  </div>`;
}

// FAZA „słuchaj" — JEDYNE miejsce z audio + pasek odliczania czasu fazy (wspólna).
// QUIZ: bez audio/gałki — pokaż treść pytania i przejdź do odpowiadania.
function mpSluchajBodyHTML(g){
  if(mpStaged(g)){   // MP okładka/intro: odpowiadamy od 1. etapu (mpStartListenWindow przechodzi sam)
    return `${mpStageWrapHTML(g)}
      <button class="mp-btn ghost mp-gokomb" style="width:100%;margin-top:8px" onclick="mpGoKombinuj()">odpowiadamy →</button>
      <div class="mp-foot listen">${mpHr()}${mpReactsBarHTML(true)}</div>`;
  }
  if(g.mode==='quiz'){
    // P1-8: ABCD — kafle od razu (1 tap); pytanie otwarte — przejście do odpowiadania
    return `${mpPromptHTML(g)}${mpMcHTML(g)}
      <button class="mp-btn ghost mp-gokomb" style="width:100%;margin-top:8px" onclick="mpGoKombinuj()">${mcOptions(g)?'kombinujemy →':'odpowiadamy →'}</button>
      <div class="mp-foot listen">${mpHr()}${mpReactsBarHTML(true)}</div>`;
  }
  // F6b (tryb #6): nie-host przy „Dźwięk tylko u hosta"/salonie = pilot — gałka głośnika, bez odtwarzania
  const here=mpPlaysHere(g);
  // P1-16: telefon-pilot w SALONIE — „patrz na TV" (muzyka/lektor i pytanie grają na dużym ekranie; tu bez audio)
  const lookTV = !here && !!g.salon;
  const knob = here ? mpKnobHTML(g) : lookTV ? `<div class="mp-looktv" id="mpKnob" role="img" aria-label="Patrz na TV"><span aria-hidden="true">📺</span></div>` : mpRemoteKnobHTML();
  const status = here ? `${g.mode==='lektor'?'lektor czyta':'posłuchaj uważnie'} · stuknij, by powtórzyć` : lookTV ? '<b>Patrz na TV</b> — muzyka gra na dużym ekranie' : MP_REMOTE_STATUS;
  // P1-13: polecenie zadania pod winylem („Zgadnij ROK wydania" / „Tytuł + wykonawca" / „Wybierz A–D")
  return `<div class="mp-deck">${knob}
      <div class="mp-task" id="mpTask">${escapeHtml(mpTaskText(g))}</div>
      <div class="mp-state${lookTV?' mp-looktv-st':''}" id="mpPlayStatus" role="status">${status}</div>
      <div class="mp-listenbar" id="mpListenBar"><i></i></div></div>
    ${mpLyricHTML(g)}${mpPromptHTML(g)}${mpMcHTML(g)}${mpTlWrapHTML(g)}
    <button class="mp-btn ghost mp-gokomb" style="width:100%;margin-top:8px" onclick="mpGoKombinuj()">gotowe, kombinujemy →</button>
    <div class="mp-foot listen">${mpHr()}${mpReactsBarHTML(true)}</div>`;
}
// FAZA „kombinuj" — widok KOLUMNOWY (bez audio; quiz pokazuje pytanie na górze).
// Kolejność: profile ─ odpowiedź drużyny ─ kolumny ─ [dół: input+wrzuć ─ pewność ─ emotki].
// SALON (TV): bez pól wpisywania/pewności/emotek — host nadpisuje odpowiedź klikiem w kolumny.
/* P0-2 (przegląd MP 2026-10): treść pytania (quiz/ABCD) NAD kolumnami, nie w sticky stopce — na 320×568 stopka
 * (pytanie + pola + pewność + emotki + czat) zasłaniała cały ekran. Stopka = .mp-foot-pin (pola + WRZUĆ + pewność)
 * + .mp-foot-x (emotki/czat); na niskich ekranach (max-height 700 px) przyklejony jest TYLKO pin (CSS). */
function mpKombinujKolumnyHTML(g){
  const prompt = mpPromptHTML(g) + mpLyricFoldHTML(g) + mpStageWrapHTML(g) + mpTlWrapHTML(g);   // P1-12: opis lektora nad polami (zwijany); MP okładka/intro
  const mc = !!mcOptions(g);   // P1-8: ABCD — kafle zamiast kolumn i pola „wpisz literę"
  const foot = mpIsSalonHost()   // TV: bez pól/pewności/emotek (coop i Solo/Drużyny)
    ? ''
    : `<div class="mp-foot">
        <div class="mp-foot-pin">${mc?'':mpFormHTML(g)}
        <div class="mp-conf" id="mpConf">${mpConfHTML()}</div></div>
        <div class="mp-foot-x"><div id="mpEndWrap">${mpEndQHTML(g)}</div>${mpHr()}${mpReactsBarHTML()}</div></div>`;
  // ABCD: kafle (główna akcja) zaraz pod pytaniem — nie chowają się pod przyklejoną stopką
  return `${prompt}${mc ? mpMcHTML(g) : ''}<div class="mp-roster" id="mpRoster"></div>
    ${mpHr()}
    <div class="mp-team" id="mpTeam"></div>
    ${mc ? '' : mpHr()+'<div class="mp-board" id="mpBoard"></div>'}
    ${foot}`;
}
// FAZA „kombinuj" — widok CZAT (design 08): odpowiedź drużyny przypięta na górze,
// strumień czatu, composer = rząd emotek + ✋pas → pewność → pole @odp + wyślij.
/* P0-3: bez skoków układu — feed ma STAŁĄ wysokość (flex, własny scroll), composer + pewność + emotki przyklejone
 * do dołu (.mp-comp sticky). Dawniej każda wiadomość wydłużała feed i spychała composer: tap w emotkę trafiał w „PEWNIAK ×2".
 * Pewniak oddzielony od emotek (odstęp + kreska) i przy pustej odpowiedzi drużyny wymaga potwierdzenia (mpSureTap). */
function mpKombinujCzatHTML(g){
  const mc=!!mcOptions(g);   // P1-8: ABCD — kafle nad feedem; composer tylko do czatu
  return `${mpPromptHTML(g)}${mpLyricFoldHTML(g)}${mpStageWrapHTML(g)}${mpTlWrapHTML(g)}<div class="mp-team" id="mpTeam"></div>${mc?mpMcHTML(g):''}
    <div class="mp-chatfeed fixed" id="mpChatFeed" aria-live="polite"></div>
    <div class="mp-comp">
      ${mpComposerHTML(g, mc)}
      <div class="mp-conf" id="mpConf">${mpConfHTML(true)}</div>
      <div id="mpEndWrap">${mpEndQHTML(g)}</div>
      <div class="mp-comp-react">${REACTIONS.map(e=>`<button class="mp-rbtn" onclick="mpReact('${e}')">${e}</button>`).join('')}</div>
    </div>`;
}
// scaffold fazy PLAY (obie skórki): nagłówek + rail + roster + ciało wg fazy/skórki
function mpScaffoldPlay(g, head){
  const skin=curSkin();
  const rail=mpRailHTML(S.sub==='sluchaj'?'sluchaj':'kombinuj');
  // 1.7: późny dołączający (jeszcze poza drużynami) — reducer i tak odrzuca jego akcje;
  // pokaż baner i wyszarz/zablokuj input (klasa .latejoin), by nie „pisał w próżnię".
  const lateJoin = !mpIsSalonHost() && (g.teams||[]).length>0 && !(g.teams||[]).some(t=>(t.members||[]).includes(mpMe.id));
  const cls = 'mp-play'+(lateJoin?' latejoin':'');
  const banner = lateJoin ? `<div class="mp-latejoin" role="status">⏳ Dołączysz od następnego pytania — teraz oglądasz</div>` : '';
  // skórka KOLUMNOWA, faza „kombinuj": własna kolejność (odpowiedź drużyny → profile → kolumny → input);
  // roster jest WEWNĄTRZ ciała, nie w „top" — dlatego osobna gałąź.
  if(S.sub!=='sluchaj' && skin!=='czat') return `<div class="${cls}">${banner}${head}${rail}${mpKombinujKolumnyHTML(g)}</div>`;
  const top=`${head}${rail}<div class="mp-roster${skin==='czat'?' mp-roster-nb':''}" id="mpRoster"></div>`;
  const body=S.sub==='sluchaj' ? mpSluchajBodyHTML(g) : mpKombinujCzatHTML(g);
  return `<div class="${cls}">${banner}${top}${body}</div>`;
}
// odśwież dynamiczne części (wspólne) — bez ruszania pól wpisywanych
function mpRefreshDynamic(g){
  const set=(id,html)=>{ const el=$m(id); if(el) el.innerHTML=html; };
  set('mpRoster', mpRosterHTML(g));
  set('mpBoard', mpSlotsHTML(g));
  set('mpTeam', mpTeamHTML(g));
  set('mpConf', mpConfHTML());   // zwykła/niepewny/pewniak/pas w jednej linii (obie skórki)
  set('mpEndWrap', mpEndQHTML(g));   // P1-10: „Zakończ pytanie" (licznik z typem)
  set('mpMc', mpMcInnerHTML(g));     // P1-8: kafle ABCD (mój wybór + głosy drużyny)
  mpStageSync(g);                    // MP okładka/intro: etap od serwera (obraz / pasek etapów)
  mpTlSync(g);                       // MP oś czasu: oś drużyny + głosy na szczeliny
  mpIngestFeed(g);                                  // dopisz nowe typy/pasy do feedu
  const feed=$m('mpChatFeed'); if(feed){ feed.innerHTML=mpChatFeedHTML(); feed.scrollTop=feed.scrollHeight; }
}
// start okna fazy słuchania (licznik czasu + auto-przejście do „kombinuj") — po intro
// P0-7: okno liczone od terminu SERWERA (game.listenEndsAt; stary serwer: min(słuchanie, endsAt−teraz)) — powrót
// w trakcie pytania nie daje pełnych 15 s. Zostało < 5 s → od razu „kombinuj" (zwraca 0 — caller nie włącza audio).
function mpStartListenWindow(g){
  // MP okładka: brak audio i fazy „słuchaj" — odpowiadamy od 1. etapu (im wcześniej, tym większy mnożnik)
  // (bez mpGoKombinuj — ten ucisza audio, a intro gra etap 0 od wspólnego stageAt: app/mp.js mpIntroSync)
  if(mpStaged(g)){ if(S.subTimer){ clearTimeout(S.subTimer); S.subTimer=null; } S.listenNonce=g.playNonce; S.listenStart=Date.now(); S.listenDur=0; if(S.sub==='sluchaj'){ S.sub='kombinuj'; mpRender(); } return 0; }
  const full=mpListenSecs(g)*1000;
  const rem=listenWindowMs({ listenMs:full, listenEndsAt:g.listenEndsAt, endsAt:g.endsAt, now:Date.now()+(S.clockOff||0) });
  if(S.subTimer){ clearTimeout(S.subTimer); S.subTimer=null; }
  S.listenNonce=g.playNonce;   // zegar w nagłówku liczy od tego okna (przed nim — od terminu serwera)
  if(rem<=0){ S.listenStart=Date.now(); S.listenDur=0; if(S.sub==='sluchaj') mpGoKombinuj(); return 0; }
  S.listenDur=full; S.listenStart=Date.now()-(full-rem);   // pasek startuje od pozostałej części okna
  S.subTimer=setTimeout(()=>{ if(S.sub==='sluchaj' && S.game && S.game.phase===MP.PLAY) mpGoKombinuj(); }, rem);
  mpAnimListenBar();
  mpTickTimer();   // P1-16: zegar fazy od razu 🎧 (dawniej do 1 s pokazywał 🧠 — tick przed startem okna słuchania)
  return rem;
}
// animuj pasek czasu fazy słuchania (CSS-transition od pozostałego % do 0)
function mpAnimListenBar(){
  const bar=$m('mpListenBar'); if(!bar) return; const i=bar.querySelector('i'); if(!i) return;
  const remMs=Math.max(0, S.listenDur-(Date.now()-S.listenStart));
  i.style.transition='none'; i.style.width=(S.listenDur?remMs/S.listenDur*100:0)+'%';
  requestAnimationFrame(()=>{ i.style.transition=`width ${remMs}ms linear`; i.style.width='0%'; });
}
function mpRenderPlay(g, head, st){
  const skin=curSkin();
  const newRound = S.playRound!==g.playNonce;
  if(newRound){                                  // nowe pytanie → faza „słuchaj", licznik czasu fazy
    mpClearTyping(); S.composerMode='typ'; S.sub='sluchaj'; mpFeedReset();   // świeży feed na nowe pytanie
    // intro fazy + okno słuchania + start audio uruchamia mpAfterSync DOPIERO po animacji intro
  }
  if(newRound || S.playSkin!==skin || S.playSub!==S.sub || !$m('mpRoster')){
    S.playRound=g.playNonce; S.playSkin=skin; S.playSub=S.sub;
    st.innerHTML = mpScaffoldPlay(g, head);
    if(S.sub==='sluchaj') mpAnimListenBar();
    // płyta: nowe pytanie → naklejka „?" i tempo trybu; przebudowa (skórka) → odtwórz bieżący stan na nowym elemencie
    if(newRound) mpVinyl.prepare(isTempoMode(g.mode) ? mpTempoRate(g.mode) : 1); else mpVinyl.refresh();
  }
  mpRefreshDynamic(g);
  mpTickTimer();
}

// „Twój gust": ❤️ przy utworze(ach) odsłony — dane z sieci tylko jako tekst (tasteHeartHTML escapuje, art tylko https)
function mpTasteHTML(tracks){
  return tasteHeartHTML(tracks.map(t=>t && ({ title:displayTitle(t.title!=null ? t.title : t.track), artist:t.artist, year:t.year, art:t.art, genre:t.genre })),
    { cat:(S.game && typeof S.game.catKey==='string') ? S.game.catKey : '' });
}
// wynik MOJEJ drużyny z odsłony (per-drużyna). coop → byTeam.all; fallback na płaskie pola reveal.
function mpRevealMine(r){ const tid=myTeamId&&myTeamId(); return (r && r.byTeam && tid && r.byTeam[tid]) || r || {}; }
// ranking między drużynami (odsłona) — tylko nazwy + pkt + ✓/✗, BEZ cudzych odpowiedzi (izolacja).
// Pokazywany dopiero przy >1 drużynie; w coop (1 drużyna) zwraca '' (zachowanie jak dziś).
// Odpowiedź drużyny w odsłonie (reveal.byTeam[tid].locked — jawne po zatwierdzeniu): FIX „host nie widział moich
// odpowiedzi" — w Solo/Drużynach odsłona pokazywała tylko ✓/✗ rywali, bez tego, CO wpisali.
function mpTeamLockedText(r, teamId){
  const t=r && r.byTeam && r.byTeam[teamId]; const lk=t && t.locked; if(!lk || typeof lk!=='object') return '';
  const slots=(Array.isArray(r.slots) && r.slots.length ? r.slots : Object.keys(lk).map(key=>({key})));
  const vals=slots.map(s=>String(lk[s.key]||'').trim());
  return vals.some(Boolean) ? vals.map(v=>v||'—').join(' · ') : '';
}
/* P1-5/P1-6: mini-tabela (Solo/Drużyny) — top-3 (+ moja pozycja, gdy niżej) z „+N" za to pytanie; reszta pod
 * „pokaż wszystkich" (<details>) — odsłona mieści się na ekranie, CTA „DALEJ" nie ucieka pod fold. */
function mpRevealStandingsHTML(ranking, r){
  if(!ranking || ranking.length<2) return '';
  const tid=myTeamId&&myTeamId();
  const fc=formatCopy((S.game && S.game.format) || (ranking.length>1 ? 'teams' : 'coop'));
  // P0-5: równe punkty = wspólne miejsce (1, 1, 3)
  const places=standings(ranking.map(t=>({ id:t.teamId, name:t.name })), Object.fromEntries(ranking.map(t=>[t.teamId, t.score]))).rows;
  const placeOf=(id)=>{ const p=places.find(x=>x.id===id); return p ? p.place : 0; };
  const byId=Object.fromEntries(ranking.map(t=>[t.teamId, t]));
  const row=(t,i)=>{
    const av=escapeHtml((t.name||'?').slice(0,1).toUpperCase());
    const ans=mpTeamLockedText(r, t.teamId);
    const ansHtml=`<small class="ans">${ans?'„'+escapeHtml(ans)+'"':'bez odpowiedzi'}</small>`;
    const gain=Number(t.gained)>0 ? `<small class="gain">+${num(t.gained)}</small>` : '';
    return `<div class="rv-stand-row${t.teamId===tid?' me':''}"><span class="rk">${num(placeOf(t.teamId)||i+1)}</span><b class="av" style="background:${safeColor(t.color, mpAvatarColor(t.name))}">${av}</b><span class="nm">${escapeHtml(t.name||'drużyna')}${t.teamId===tid?' (Ty)':''}${r?ansHtml:''}</span><span class="mk ${t.teamOk?'ok':'no'}">${t.teamOk?'✓':'✗'}</span><span class="pts">${num(t.score)}${gain}</span></div>`;
  };
  const rows=places.map(p=>({ id:p.id, place:p.place }));
  const cut=rankingTop(rows, tid, 3);
  const topHtml=cut.top.map((p,i)=>row(byId[p.id], i)).join('') + (cut.me ? `<div class="rv-stand-gap" aria-hidden="true">⋯</div>${row(byId[cut.me.id], 0)}` : '');
  const shownIds=new Set([...cut.top.map(p=>p.id), ...(cut.me?[cut.me.id]:[])]);
  const rest=rows.filter(p=>!shownIds.has(p.id));
  const more = rest.length ? `<details class="rv-more"><summary>pokaż wszystkich (${num(rows.length)})</summary>${rest.map((p,i)=>row(byId[p.id], i)).join('')}</details>` : '';
  return `<div class="rv-standings"><div class="rv-stand-h">${fc.rankingTitle}</div>${topHtml}${more}</div>`;
}
// baner wyniku rundy (wspólny: muzyka + quiz) — pewniak/trafienie/pudło. r = wynik MOJEJ drużyny.
function mpRevealBanner(r){
  if(r.pewniakWin) return `<div class="rv-banner win"><span class="ic">🟡</span><span class="tx"><b>PEWNIAK trafiony!</b><small>${(r.pewniacy||[]).map(escapeHtml).join(', ')} — podwójne punkty</small></span><span class="pts">+${num(r.gained)}</span></div>`;
  if(r.pewniakLose) return `<div class="rv-banner lose"><span class="ic">🍺</span><span class="tx"><b>Pewniak przepalony</b><small>stawia: ${(r.pewniacy||[]).map(escapeHtml).join(', ')} — odbiór na żywo 😏</small></span></div>`;
  if(r.teamOk) return `<div class="rv-banner ok"><span class="ic">✓</span><span class="tx"><b>${formatCopy(S.game && S.game.format).hitTitle}</b><small>${r.firstBy?'pierwszy: '+escapeHtml(r.firstBy):'+'+num(r.gained)+' pkt'}${Number(r.streak)>=3?' · 🔥 seria '+num(r.streak):''}</small></span><span class="pts">+${num(r.gained)}</span></div>`;
  // F6a: częściowe trafienie (np. sam tytuł) też punktuje
  if(Number(r.gained)>0) return `<div class="rv-banner ok"><span class="ic">≈</span><span class="tx"><b>Prawie!</b><small>częściowe trafienie · +${num(r.gained)} pkt</small></span><span class="pts">+${num(r.gained)}</span></div>`;
  return `<div class="rv-banner no"><span class="ic">✗</span><span class="tx"><b>Tym razem nie</b><small>0 pkt</small></span></div>`;
}
// F6b (R8): „Złożona z głosów: kaśka → tytuł, mati → wykonawca" (uznanie dla graczy, design 09)
// P1-6: tylko Wspólna drużyna z ≥ 2 osobami (w Solo i 1-osobowej drużynie to redundancja „X → tytuł, X → wykonawca")
function mpCreditsHTML(credits, mc){
  if(!Array.isArray(credits) || !credits.length) return '';
  if(((S.game && S.game.format) || 'coop')!=='coop' || myTeamSize()<2) return '';
  const parts=credits.filter(c=>c && c.name).map(c=>`<b>${escapeHtml(c.name)}</b> → ${escapeHtml(mc?'odpowiedź':(c.label||c.key||''))}`);
  return parts.length ? `<div class="rv-credits">Złożona z głosów: ${parts.join(', ')}</div>` : '';
}
// przycisk „dalej" na odsłonie. SALON-host (TV): nie gra → pokaż ile GRACZY kliknęło „dalej"
// (TV przejdzie samo, gdy wszyscy) + przycisk = ręczny „pomiń czekanie".
function mpRevealNextHTML(last){
  if(mpIsSalonHost()){
    const c=S.advCount||0, t=S.advTotal||mpPlayers().length||0;
    return `<div class="mp-state" style="text-align:center;margin-top:6px">✓ ${c}/${t} graczy kliknęło „dalej"</div>
      <button class="mp-next ghost" onclick="mpAdvance()">${last?'WYNIK KOŃCOWY →':'pomiń czekanie ›'}</button>`;
  }
  // F2b #6: widoczny licznik auto-„dalej" (bezczynność) — odświeża go tick w mp.js
  const auto = S.revealAutoAt ? `<div class="mp-state mp-autonext" id="mpRevealAuto" style="text-align:center;opacity:.6">${mpRevealAutoText(secsLeft(S.revealAutoAt, Date.now()))}</div>` : '';
  return `<button class="mp-next" onclick="mpAdvance()">${last?'WYNIK KOŃCOWY →':'DALEJ ›'}</button>${auto}`;
}
// P1-6: CTA odsłony przyklejone do dołu ekranu (sticky) — nie ucieka pod fold przy długim rankingu
const mpRevealCtaHTML = (last)=> `<div class="rv-cta">${mpRevealNextHTML(last)}</div>`;
// P1-9: „odpowiedź drużyny: …" / Solo „Twoja odpowiedź: …"
function mpRevealLockedHTML(locked){
  const fc=formatCopy(S.game && S.game.format);
  const t=String(locked.title||'').trim(), a=String(locked.artist||'').trim();
  return `<div class="rv-locked">${fc.lockedLabel}: ${t||a ? `„${escapeHtml(t||'—')} · ${escapeHtml(a||'—')}"` : 'bez odpowiedzi'}</div>`;
}
/* P1-1 krok 4: „Sprawdzamy…" (~600 ms) między zamknięciem pytania a flipem karty utworu — rama (nagłówek) zostaje */
function mpRenderChecking(snap){
  // przed flipem nagłówek pokazuje POPRZEDNI wynik (⭐ nie zdradza, czy trafiliśmy)
  const sc=snap.score, head = sc ? String(snap.head||'').replace(/⭐ <b>\d+<\/b>/, `⭐ <b>${num(sc.prev)}</b>`).replace(/aria-label="punkty: \d+"/, `aria-label="punkty: ${num(sc.prev)}"`) : snap.head;
  return `${head}<div class="mp-checking" role="status" aria-live="assertive"><div class="mp-chk-ic" aria-hidden="true">🥁</div><b>Sprawdzamy…</b>${bbLoader}</div>`;
}
// nagłówek odsłony bez jednorazowej klasy przejścia koloru (re-render karty nie powtarza animacji)
const mpStillHead = (h)=> String(h||'').replace(/ ph-chg" style="--ph-from:var\(--ph-[a-z]+\)/, '');
/* efekty odsłony — RAZ na pytanie, przy pierwszym renderze karty utworu (po „Sprawdzamy…"):
 * odsłuch rozwiązania (Łamigłówki), confetti/oklaski/„ding"/„bzzt" (F6b U4), „+N" leci do „⭐" w nagłówku (P1-5). */
function mpRevealFx(){
  if(S.revealFx==null || S.revealFx!==S.revealNonce || !S.revealSnap) return;
  S.revealFx=null;
  const snap=S.revealSnap, g=S.game||{};
  // Łamigłówki: ~10 s zajawki rozwiązania — LOKALNIE u gracza; „🔈 dźwięk tylko u hosta" → gra tylko host/TV
  listenStart(snap.reveal.listen, { auto:true, allowed:mpPlaysHere(g) });
  const rvm=mpRevealMine(snap.reveal);
  // F6b (U4): trafienie → confetti + oklaski; częściowe → „ding"; pudło → „bzzt". TV (Solo/Drużyny): sam „ding".
  if(mpIsCompTV()) playSfx('ding');
  else if(rvm.teamOk || rvm.pewniakWin){ confetti(); playClap(); }
  else if(Number(rvm.gained)>0) playSfx('ding');
  else playSfx('buzz');
  mpScoreFly(snap.score);
}
/* P1-5: „+N" z banera leci do „⭐" w nagłówku, potem licznik count-up (500 ms). reduced-motion / brak przyrostu → od razu wynik. */
function mpScoreFly(line){
  const q=()=>{ const st=$m('mpStage'); return st && st.querySelector('#mpScore'); };
  const nonce0=S.revealNonce;
  const el=q(); if(!el || !line) return;
  const setV=(v)=>{ const e=q(); if(!e) return; const b=e.querySelector('b'); if(b) b.textContent=num(v); e.setAttribute('aria-label', 'punkty: '+num(line.score)); };
  if(!line.gained || reducedMotion() || typeof requestAnimationFrame!=='function'){ setV(line.score); return; }
  setV(line.prev);
  setTimeout(()=>{ if(S.revealNonce===nonce0 && mpRevealPending()) setV(line.score); }, 1200);   // bezpiecznik (rAF dławiony w tle)
  const src=document.querySelector('#mpStage .rv-banner .pts');
  try{
    const a=src && src.getBoundingClientRect(), z=el.getBoundingClientRect();
    if(a && a.width && z.width){
      const f=document.createElement('div'); f.className='mp-ptsfly'; f.textContent='+'+num(line.gained);
      f.style.left=a.left+'px'; f.style.top=a.top+'px'; document.body.appendChild(f);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ f.style.transform=`translate(${Math.round(z.left-a.left)}px,${Math.round(z.top-a.top)}px) scale(.55)`; f.style.opacity='.15'; }));
      setTimeout(()=>f.remove(), 820);
    }
  }catch(_e){}
  const from=line.prev, to=line.score, t0=Date.now()+420, dur=500, nonce=S.revealNonce;
  const tick=()=>{
    if(S.revealNonce!==nonce || !mpRevealPending()) return;   // odsłona zamknięta — nie pisz do nagłówka innej sceny
    const k=Math.min(1, Math.max(0, (Date.now()-t0)/dur)), e=1-Math.pow(1-k,3);
    setV(Math.round(from+(to-from)*e));
    if(k<1) requestAnimationFrame(tick);
    else { const s2=q(); if(s2){ s2.classList.add('bump'); setTimeout(()=>s2.classList.remove('bump'), 420); } } };
  requestAnimationFrame(tick);
}
// P2-6: ramka karty odsłony wg wyniku MOJEJ drużyny — trafienie zielona (jak dotąd), częściowe złota, pudło szara/czerwona
// (dawniej przy pudle też zielona). TV (Solo/Drużyny) — neutralna (brak „swojej" drużyny).
const mpRvCls = (rv, tv)=> tv ? ' neutral' : (rv.teamOk || rv.pewniakWin) ? '' : Number(rv.gained)>0 ? ' part' : ' miss';
// odsłona rundy (design): rail + zielona karta utworu + baner pewniaka + odpowiedź drużyny
function mpRenderRevealCard(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  if(r.kind==='quiz') return mpRenderQuizReveal(snap);
  if(r.kind==='year') return mpRenderYearReveal(snap);   // F8a: tryb „rok"
  if(r.kind==='cover') return mpRenderCoverReveal(snap); // MP okładka
  if(r.kind==='medley') return mpRenderMedleyReveal(snap); // MP składanka
  if(r.kind==='timeline') return mpRenderTimelineReveal(snap); // MP oś czasu
  const tv=mpIsCompTV();      // F6b: TV w Solo/Drużynach — poprawna odpowiedź + ranking, bez wyniku „swojej" drużyny
  const rv=tv ? {} : mpRevealMine(r);   // ✓/✗ slotów, locked, baner — z perspektywy MOJEJ drużyny
  // 5.2: waliduj URL okładki (tylko http(s)) + escapuj — art pochodzi z zewnętrznego API (iTunes)
  const artOk = typeof r.art==='string' && /^https?:\/\//.test(r.art);
  const cover = artOk?`<img class="rv-cover" src="${escapeHtml(r.art)}" referrerpolicy="no-referrer">`:`<div class="rv-cover ph">${ic('disc')}</div>`;
  const meta=[r.album,r.year].filter(Boolean).join(' · ');
  const slot=(ok,lab,val)=>`<div class="rv-slot"><span class="k">${lab}</span><span class="v">${escapeHtml(val||'—')}</span>${tv?'':`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>`}</div>`;
  const locked=rv.locked||{};
  return `${mpStillHead(head)}${mpRosterStrip()}${mpHr()}
    <div class="rv-card${mpRvCls(rv, tv)}">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(displayTitle(r.track))}</span><span class="a">${escapeHtml(r.artist)}</span>${meta?`<span class="m">${escapeHtml(meta)}</span>`:''}</div></div>
      ${slot(rv.okTitle,'TYTUŁ',displayTitle(r.track))}${slot(rv.okArtist,'WYK.',r.artist)}
      ${!tv && rv.stageEval ? `<div class="rv-team rv-fun" data-rv-stage>⏱ ${escapeHtml(mpStageEvalText(rv.stageEval))}</div>` : ''}
      ${mpCoverArtistHTML(r)}
      ${mpFromHTML(r)}
      ${tv?'':mpTasteHTML([r])}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':mpRevealLockedHTML(locked)}
    ${tv?'':mpCreditsHTML(snap.credits)}
    ${mpRevealStandingsHTML(r.ranking, r)}
    ${mpReactsBarHTML()}
    ${mpRevealCtaHTML(last)}`;
}
// gust etap 3: „🎧 Gust stołu" — czyja półka (tekst z serwera → escapeHtml)
function mpFromHTML(r){ return r && typeof r.from==='string' && r.from ? `<div class="rv-team rv-from" data-rv-from>🎧 z półki: <b>${escapeHtml(r.from.slice(0, 80))}</b></div>` : ''; }
// MP fortepian/gitara: „🎹 cover: <kto grał>" (dopiero w odsłonie; tekst z serwera → escapeHtml)
function mpCoverArtistHTML(r){
  if(!r || typeof r.coverArtist!=='string' || !r.coverArtist) return '';
  const em=INSTRUMENT_EMOJI[r.instrument] || '🎹';
  return `<div class="rv-team rv-fun" data-rv-coverby>${em} cover: <b>${escapeHtml(r.coverArtist.slice(0, 80))}</b></div>`;
}
/* MP składanka: odsłona — wykonawca ✓/✗ (jak solo checkArtistQ) + zagrane utwory (❤️ na półkę per utwór) */
function mpRenderMedleyReveal(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  const tv=mpIsCompTV();
  const rv=tv ? {} : mpRevealMine(r);
  const clips=Array.isArray(r.clips) ? r.clips.filter(c=>c && c.track) : [];
  const art=clips.find(c=>typeof c.art==='string' && /^https?:\/\//.test(c.art));
  const cover=art ? `<img class="rv-cover" src="${escapeHtml(art.art)}" alt="" referrerpolicy="no-referrer">` : `<div class="rv-cover ph">${ic('disc')}</div>`;
  const ok=rv.okBySlot||{}, lk=rv.locked||{};
  const fc=formatCopy(S.game && S.game.format);
  const list=clips.map((c,i)=>`${num(i+1)}. ${escapeHtml(displayTitle(c.track))}`).join(' · ');
  return `${mpStillHead(head)}${mpRosterStrip()}${mpHr()}
    <div class="rv-card${mpRvCls(rv, tv)}">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(r.artist||'')}</span><span class="a">składanka · ${num(clips.length)} utwory</span></div></div>
      <div class="rv-slot"><span class="k">WYK.</span><span class="v">${escapeHtml(r.artist||'—')}</span>${tv?'':`<span class="mk ${ok.artist?'ok':'no'}">${ok.artist?'✓':'✗'}</span>`}</div>
      ${list?`<div class="rv-team rv-fun" data-rv-clips>🎛 zagrały: ${list}</div>`:''}
      ${tv?'':mpTasteHTML(clips)}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':`<div class="rv-locked">${fc.lockedLabel}: ${lk.artist ? `„${escapeHtml(lk.artist)}"` : 'bez odpowiedzi'}</div>`}
    ${tv?'':mpCreditsHTML(snap.credits)}
    ${mpRevealStandingsHTML(r.ranking, r)}
    ${mpReactsBarHTML()}
    ${mpRevealCtaHTML(last)}`;
}
/* MP oś czasu: odsłona — karta (rok), czy szczelina drużyny była dobra, żetony tytuł/wykonawca, oś PO wstawieniu */
function mpRenderTimelineReveal(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  const tv=mpIsCompTV();
  const rv=tv ? {} : mpRevealMine(r);
  const te=rv.timelineEval||{}, card=te.card||{ track:r.track, artist:r.artist, year:r.year };
  const artOk = typeof r.art==='string' && /^https?:\/\//.test(r.art);
  const cover = artOk?`<img class="rv-cover" src="${escapeHtml(r.art)}" alt="" referrerpolicy="no-referrer">`:`<div class="rv-cover ph">${ic('disc')}</div>`;
  const before=Array.isArray(te.before) ? te.before : [], ok=rv.okBySlot||{};
  const slot=(o,lab,val)=>`<div class="rv-slot"><span class="k">${lab}</span><span class="v">${escapeHtml(val||'—')}</span>${tv?'':`<span class="mk ${o?'ok':'no'}">${o?'✓':'✗'}</span>`}</div>`;
  const where = te.gap!=null ? gapLabel(before, te.gap) : 'bez wyboru';
  const good = Array.isArray(te.good) && te.good.length ? te.good.map(k=>gapLabel(before, k)).join(' / ') : '';
  const after = tv ? [] : teamTimeline(S.game, myTeamId());
  return `${mpStillHead(head)}${mpRosterStrip()}${mpHr()}
    <div class="rv-card${mpRvCls(rv, tv)}">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(displayTitle(r.track||''))}</span><span class="a">${escapeHtml(r.artist||'')}</span><span class="m">🕰 ${escapeHtml(String(card.year||r.year||'—'))}</span></div></div>
      ${tv?'':slot(te.placeOk, 'MIEJSCE', where)}${slot(ok.title,'TYTUŁ',displayTitle(r.track||''))}${slot(ok.artist,'WYK.',r.artist)}
      ${!tv && !te.placeOk && good ? `<div class="rv-team rv-fun" data-rv-good>pasowało: ${escapeHtml(good)}</div>` : ''}
      ${!tv && after.length ? `<div class="rv-team" data-rv-axis>${te.placeOk?'✓ karta zostaje na osi':'✗ karta odpada'} · ${escapeHtml(timelineSummary(after))}</div>` : ''}
      ${tv?'':mpTasteHTML([r])}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':mpCreditsHTML(snap.credits)}
    ${mpRevealStandingsHTML(r.ranking, r)}
    ${mpReactsBarHTML()}
    ${mpRevealCtaHTML(last)}`;
}
/* MP okładka: odsłona — PEŁNA okładka (reveal.art), wykonawca ✓/✗, album (bonus) ✓/✗, rok; etap, na którym padła
 * odpowiedź MOJEJ drużyny, i jego mnożnik (rv.stageEval — liczone serwerowo z czasu propozycji). */
function mpRenderCoverReveal(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  const tv=mpIsCompTV();
  const rv=tv ? {} : mpRevealMine(r);
  const artOk = typeof r.art==='string' && /^https:\/\//.test(r.art);
  const cover = artOk?`<img class="rv-cover" src="${escapeHtml(r.art)}" alt="okładka albumu" referrerpolicy="no-referrer">`:`<div class="rv-cover ph">${ic('disc')}</div>`;
  const ok=rv.okBySlot||{}, lk=rv.locked||{};
  const slot=(o,lab,val)=>`<div class="rv-slot"><span class="k">${lab}</span><span class="v">${escapeHtml(val||'—')}</span>${tv?'':`<span class="mk ${o?'ok':'no'}">${o?'✓':'✗'}</span>`}</div>`;
  const stageTx = mpStageEvalText(rv.stageEval);
  const fc=formatCopy(S.game && S.game.format);
  const a=String(lk.artist||'').trim(), al=String(lk.album||'').trim();
  return `${mpStillHead(head)}${mpRosterStrip()}${mpHr()}
    <div class="rv-card${mpRvCls(rv, tv)}">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(r.artist||'')}</span><span class="a">${escapeHtml(r.album||'')}</span>${r.year?`<span class="m">${escapeHtml(String(r.year))}</span>`:''}</div></div>
      ${slot(ok.artist,'WYK.',r.artist)}${slot(ok.album,'ALBUM',r.album)}
      ${stageTx && !tv ? `<div class="rv-team rv-fun" data-rv-cover>🖼 ${escapeHtml(stageTx)}</div>` : ''}
      ${!tv && r.rep ? mpTasteHTML([r.rep]) : ''}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':`<div class="rv-locked">${fc.lockedLabel}: ${a||al ? `„${escapeHtml(a||'—')} · ${escapeHtml(al||'—')}"` : 'bez odpowiedzi'}</div>`}
    ${tv?'':mpCreditsHTML(snap.credits)}
    ${mpRevealStandingsHTML(r.ranking, r)}
    ${mpReactsBarHTML()}
    ${mpRevealCtaHTML(last)}`;
}
// F8a: odsłona trybu „rok" — karta utworu + rok wydania vs typ drużyny (dokładnie / ±1 / ±2 / dekada)
const YEAR_TIER_TX = { exact:'dokładnie!', off1:'±1 rok', off2:'±2 lata', decade:'właściwa dekada', miss:'pudło' };
function mpRenderYearReveal(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  const tv=mpIsCompTV();
  const rv=tv ? {} : mpRevealMine(r);
  const artOk = typeof r.art==='string' && /^https?:\/\//.test(r.art);
  const cover = artOk?`<img class="rv-cover" src="${escapeHtml(r.art)}" referrerpolicy="no-referrer">`:`<div class="rv-cover ph">${ic('disc')}</div>`;
  const y=rv.yearEval||{}, ok=!!(rv.okBySlot&&rv.okBySlot.year);
  const team=(rv.locked&&rv.locked.year)||'';
  // P0-6: jedna liczba punktów (w banerze) — tu tylko typ i trafność; <small> w osobnym wierszu (nie ucinany)
  const tier = !tv && team ? `<small class="rv-team">${formatCopy(S.game && S.game.format).typLabel}: „${escapeHtml(team)}" · ${escapeHtml(YEAR_TIER_TX[y.tier]||'')}</small>` : '';
  const note = r.yearNote ? `<div class="rv-team rv-fun">ℹ️ ${escapeHtml(r.yearNote)}</div>` : '';
  return `${mpStillHead(head)}${mpRosterStrip()}${mpHr()}
    <div class="rv-card${mpRvCls(rv, tv)}">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(displayTitle(r.track))}</span><span class="a">${escapeHtml(r.artist)}</span>${r.album?`<span class="m">${escapeHtml(r.album)}</span>`:''}</div></div>
      <div class="rv-slot year"><span class="k">ROK</span><span class="v">${escapeHtml(String(r.year||'—'))}${tier}</span>${tv?'':`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>`}</div>
      ${note}
      ${mpFromHTML(r)}
      ${tv?'':mpTasteHTML([r])}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':mpCreditsHTML(snap.credits)}
    ${mpRevealStandingsHTML(r.ranking, r)}
    ${mpReactsBarHTML()}
    ${mpRevealCtaHTML(last)}`;
}
// odsłona QUIZU: pytanie + per slot poprawne warianty (✓/✗) + odpowiedź drużyny (bez okładki/roku)
function mpRenderQuizReveal(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  const tv=mpIsCompTV();      // F6b: TV (Solo/Drużyny) — bez wyniku „swojej" drużyny
  const rv=tv ? {} : mpRevealMine(r);   // okBySlot/locked mojej drużyny
  const isMC=/\nA\)/.test(r.prompt||'');   // pytanie ABCD: opcje w treści, jeden slot „litera lub odpowiedź"
  const typLab=formatCopy(S.game && S.game.format).typLabel;   // P1-9
  // F3 #4: tylko forma KANONICZNA — rv.display (silnik: ABCD „X) tekst", pula = trafione pozycje/kolejne),
  // fallback dla starego hosta/serwera bez display: answers[k][0] (ABCD: „litera) tekst")
  const disp=(rv.display&&typeof rv.display==='object')?rv.display:null;
  const rows=(r.slots||[]).map(s=>{
    const ok=!!(rv.okBySlot&&rv.okBySlot[s.key]);
    const variants=(r.answers&&r.answers[s.key])||[];
    const canon = disp && disp[s.key]!=null ? String(disp[s.key])
      : (isMC ? (variants[0]||'')+(variants[1]?') '+variants[1]:'') : String(variants[0]||''));
    const correct = escapeHtml(canon)||'—';
    const team=(rv.locked&&rv.locked[s.key])||'';
    const kLabel = isMC ? '' : `<span class="k">${escapeHtml((s.label||s.key).toUpperCase())}</span>`;
    return `<div class="rv-slot${isMC?' mc':''}">${kLabel}
      <span class="v">${correct}${team?`<small class="rv-team">${typLab}: „${escapeHtml(team)}"</small>`:''}</span>
      ${tv?'':`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>`}</div>`;
  }).join('');
  const others=Array.isArray(rv.others)&&rv.others.length
    ? `<div class="rv-team rv-others">inne poprawne: ${rv.others.map(x=>escapeHtml(x)).join(', ')}</div>` : '';
  const fun=r.fun ? `<div class="rv-team rv-fun">💡 ${escapeHtml(r.fun)}</div>` : '';
  // Łamigłówki: rebus duży także w odsłonie (opcje ABCD pod nim, w linii podpowiedzi) + „▶ posłuchaj"
  const rebus = r.promptStyle==='rebus';
  const promptHtml = rebus ? promptBodyHTML(r.prompt, 'rebus') : escapeHtml(r.prompt||'');
  const listen = listenHTML(r.listen, { allowed:mpPlaysHere(S.game||{}) });
  return `${mpStillHead(head)}${mpRosterStrip()}${mpHr()}
    <div class="rv-card quiz${mpRvCls(rv, tv)}">
      <div class="rv-prompt">${promptHtml}</div>
      ${rows}${others}${fun}${listen}
      ${tv?'':mpTasteHTML([...(r.track && r.artist ? [r] : []), ...(Array.isArray(r.listen) ? r.listen : [])])}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':mpCreditsHTML(snap.credits, isMC)}
    ${mpRevealStandingsHTML(r.ranking, r)}
    ${mpReactsBarHTML()}
    ${mpRevealCtaHTML(last)}`;
}

// JUICE: licznik punktów bije od 0 do wyniku (ease-out). Jednorazowo per wynik — dataset na #mpStage
// przeżywa re-render (innerHTML się zmienia, element nie), więc nie restartuje przy każdym mpRender.
// ranking drużyn na koniec meczu (z game.scores) — zwycięzca na górze
function mpTeamRanking(g){
  // F1 (#2): kolor drużyny z sieci tylko jako hex (inaczej `red" onmouseover=…` w style=)
  return (g.teams||[]).map(t=>({ id:t.id, name:t.name, color:safeColor(t.color, mpAvatarColor(t.name)), score:Number((g.scores&&g.scores[t.id])||0)||0 }))
    .sort((a,b)=>b.score-a.score);
}
const mpWinnerScore = (g)=>{ const tr=mpTeamRanking(g); return tr.length?tr[0].score:0; };
function mpJuiceScore(g){
  const stage=$m('mpStage'); const el=stage&&(stage.querySelector('.dn-hero .sc .scn')||stage.querySelector('.dn-hero .sc')); if(!el) return;
  const target=String(mpWinnerScore(g));
  if(stage.dataset.jscore===target){ el.textContent=target; return; }
  stage.dataset.jscore=target;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce || typeof requestAnimationFrame!=='function'){ el.textContent=target; return; }
  const n=Number(target)||0, dur=700, t0=Date.now();
  el.textContent='0';
  const tick=()=>{ const k=Math.min(1,(Date.now()-t0)/dur), e=1-Math.pow(1-k,3);
    el.textContent=Math.round(n*e); if(k<1) requestAnimationFrame(tick); else el.textContent=target; };
  requestAnimationFrame(tick);
}
// P1-17: gość na wyniku widzi szkic rewanżu na żywo (host po „Zmień ustawienia" rozsyła draft)
function mpRematchDraftHTML(){
  if(!S.draft) return '';
  return mpDraftHTML(S.draft).replace('Mecz, który ustawia host', 'Rewanż — host ustawia');
}
// wynik meczu (design): złoty hero + MVP + kto stawia + paski wkładu
/* P1-16: części wyniku meczu wspólne dla telefonu i sceny TV (hero, MVP, „stawia kolejkę") */
function mpDoneParts(g){
  const mvp = g.mvp?`<div class="dn-mvp"><span class="av" style="background:${mpAvatarColor(g.mvp.name)}">${escapeHtml((g.mvp.name||'?').slice(0,1).toUpperCase())}</span><span class="tx"><span class="l">⭐ MVP STOŁU</span><b>${escapeHtml(g.mvp.name)}</b><small>${num(g.mvp.correct)} ${plural(g.mvp.correct, 'trafny typ', 'trafne typy', 'trafnych typów')}</small></span></div>`:'';
  const beer=Object.entries(g.beerTally||{}).sort((a,b)=>b[1]-a[1]);
  const stawia = beer.length?`<div class="dn-stawia"><span class="ic">🍺</span><span class="tx"><span class="l">STAWIA KOLEJKĘ</span><b>${beer.map(([n,c])=>escapeHtml(n)+(c>1?` (${num(c)}×)`:'')).join(', ')}</b><small>przepalone pewniaki 🟡💥</small></span></div>`:'';
  // KONKURENCJA (solo/drużyny): hero = zwycięzca, główna lista = ranking drużyn (pkt).
  // WSPÓLNA (coop): hero = wynik jedynej drużyny, lista = wkład graczy (jak dotąd).
  const isComp=(g.format||'coop')!=='coop';
  const tr=mpTeamRanking(g);
  // P0-5: remis (także 0:0) to „Remis!", nie „<pierwszy po sortowaniu> wygrywa!"; wspólne miejsca w rankingu
  const st=standings((g.teams||[]).map(t=>({ id:t.id, name:t.name })), Object.fromEntries(tr.map(t=>[t.id, t.score])));
  const placeOf=(id)=>{ const p=st.rows.find(x=>x.id===id); return p ? p.place : 0; };
  const tied=st.rows.filter(x=>x.place===1);
  const heroT = isComp && st.tie ? 'Remis!' : isComp && st.winner ? escapeHtml(st.winner.name)+' wygrywa!' : 'Mecz zakończony!';
  const fc=formatCopy(g.format);   // P1-9: Solo — „zwycięzca", „Ranking graczy"
  const heroS = isComp && st.tie ? escapeHtml(tied.map(x=>x.name).join(' · '))+' · ex aequo' : fc.winnerSub;   // F6a: wynik w punktach (core/scoring.scoreRound)
  // P2-11: skala wyniku „320 / 500" — bazowe maksimum za rozegrane pytania (100/pytanie, bez premii za szybkość/serię)
  const tal=matchTally({ results:g.results, history:mpIsSalonHost() ? [] : S.matchHist }), scale=scoreScale(tal.played), score=mpWinnerScore(g);
  const scl = scale ? `<small class="scl" aria-hidden="true">/ ${num(scale)}</small>` : '';
  const hero=`<div class="dn-hero"><div class="ic">🏆</div><div class="t">${heroT}</div><div class="s">${heroS}</div><div class="sc" aria-label="${num(score)} pkt${scale?' z '+num(scale)+' możliwych bez premii':''}"><b class="scn">${num(score)}</b>${scl}</div>${scale?`<div class="scx">${num(tal.hits)}/${num(tal.played)} trafionych · skala bez premii za szybkość i serię</div>`:''}</div>`;
  return { mvp, stawia, isComp, tr, placeOf, fc, hero, st, tal, scale, score };
}
// host po meczu: „gotowi na rewanż 2/3" (informacja — „Jeszcze raz" działa zawsze)
function mpRematchReadyHTML(){
  if(!S.host || !mpLobbyReadyCap()) return '';
  const ms=mpMembers(), rc=lobbyReadyCount({ members:ms, readyIds:ms.filter(m=>m.ready).map(m=>m.id), hostId:mpMe.id });
  return rc.total ? `<div class="dn-ready" role="status">✓ ${escapeHtml(rc.text)} na rewanż</div>` : '';
}
function mpRenderDone(g, head){
  const tally=(g.tallyList||[]);
  const max=Math.max(1,...tally.map(t=>t.correct));
  const rows=tally.map((t,i)=>{
    const col=mpAvatarColor(t.name), pct=Math.round(t.correct/max*100), av=escapeHtml((t.name||'?').slice(0,1).toUpperCase());
    return `<div class="wk-row"><span class="rk">${i+1}</span><b class="av" style="background:${col}">${av}</b><span class="nm">${escapeHtml(t.name)}</span><span class="bar"><i style="width:${num(pct)}%;background:${i===0?'var(--green)':(t.correct?'var(--blue)':'var(--red)')}"></i></span><span class="pts">${num(t.correct)}</span></div>`;
  }).join('')||'<div class="mp-state">brak trafnych typów</div>';
  const { mvp, stawia, isComp, tr, placeOf, fc, hero } = mpDoneParts(g);
  let body;
  if(isComp){
    const tmax=Math.max(1,...tr.map(t=>t.score));
    const trows=tr.map((t,i)=>{ const av=escapeHtml((t.name||'?').slice(0,1).toUpperCase()), pct=Math.round(t.score/tmax*100);
      return `<div class="wk-row"><span class="rk">${num(placeOf(t.id)||i+1)}</span><b class="av" style="background:${t.color}">${av}</b><span class="nm">${escapeHtml(t.name)}</span><span class="bar"><i style="width:${num(pct)}%;background:${i===0?'var(--green)':(t.score?'var(--blue)':'var(--red)')}"></i></span><span class="pts">${num(t.score)}</span></div>`;
    }).join('');
    body=`<div class="dn-lbl">${fc.doneRanking}</div><div class="dn-wk">${trows}</div>`;
  } else {
    body=`<div class="dn-lbl">Wkład drużyny</div><div class="dn-wk">${rows}</div>`;
  }
  return `${hero}
    ${mvp}${stawia}
    ${body}
    ${mpPlaylistHTML(g)}
    <button type="button" class="dn-share" onclick="mpShareResult(this)">📤 Udostępnij wynik <small>obrazek z punktami i utworami</small></button>
    ${S.host ? '' : mpRematchDraftHTML()}
    <div class="dn-btns"><button class="dn-menu" onclick="mpExitMenu()">${ic('back')} menu</button>${S.host
      ? '<button class="dn-again" onclick="mpRematch()" aria-label="Jeszcze raz — te same ustawienia">Jeszcze raz 🔁<small>te same ustawienia</small></button><button class="dn-change" onclick="mpNewGame()">Zmień ustawienia</button>'
      : `${mpReadyBtnHTML(null, true)}<div class="dn-wait">${S.draft?'host ustawia rewanż…':'host zaczyna rewanż'}</div>`}</div>${mpRematchReadyHTML()}`;
}

/* P2-11: lista zagranych utworów na wyniku meczu — ✓/✗ (moja drużyna), ▶ zajawka (lokalnie, ~10 s), ❤️ „na półkę" (app/taste.js).
 * Kolejność/komplet z game.results (serwer), okładka/rok/zajawka z historii tego klienta (core/mpView.matchPlaylist). */
function mpPlaylistHTML(g){
  const list=matchPlaylist({ results:g.results, history:S.matchHist });
  S.donePl=list;
  if(!list.length) return '';
  const hearts=tasteHeartButtons(list, { cat:typeof g.catKey==='string' ? g.catKey : '' });
  const tal=matchTally({ results:g.results, history:S.matchHist });
  const rows=list.map((t,i)=>{
    const art=t.art ? `<img class="dn-pl-art" src="${escapeHtml(t.art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="dn-pl-art ph" aria-hidden="true">♪</span>`;
    const meta=[t.artist, t.year].filter(Boolean).join(' · ');
    return `<li class="dn-pl-row${t.ok?' ok':' no'}"><span class="dn-pl-mk" aria-label="${t.ok?'trafione':'pudło'}">${t.ok?'✓':'✗'}</span>${art}
      <span class="dn-pl-tx"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(meta)}${t.gained>0?` · <i>+${num(t.gained)}</i>`:''}</small></span>
      <button type="button" class="dn-pl-play${S.plPlaying===i?' on':''}" data-pl-play="${i}" aria-pressed="${S.plPlaying===i}" aria-label="Posłuchaj: ${escapeHtml(t.title)} — ${escapeHtml(t.artist)}">${S.plPlaying===i?'■':'▶'}</button>${hearts[i]||''}</li>`;   // re-render (presence) nie gubi stanu ▶
  }).join('');
  return `<section class="dn-pl" aria-labelledby="dnPlH"><div class="dn-lbl" id="dnPlH">Zagrane utwory <small>${num(tal.hits)}/${num(tal.played)} trafionych · ❤️ = na półkę</small></div><ol class="dn-pl-list">${rows}</ol></section>`;
}
// ▶ na liście: jeden odsłuch naraz (snippetPlay przerywa poprzedni); stan przycisku z onState
function mpPlTap(i){
  const t=(S.donePl||[])[i]; if(!t) return;
  const btns=()=>document.querySelectorAll('#mpStage [data-pl-play]');
  const set=(idx, st)=>btns().forEach(b=>{ const on=+b.dataset.plPlay===idx;
    if(!on) return; b.textContent = st==='play' ? '■' : st==='load' ? '…' : st==='brak' ? '✕' : '▶'; b.classList.toggle('on', st==='play'); b.setAttribute('aria-pressed', st==='play'?'true':'false'); });
  if(S.plPlaying===i){ S.plPlaying=null; listenStop(); set(i, 'stop'); return; }
  if(S.plPlaying!=null) set(S.plPlaying, 'stop');
  S.plPlaying=i;
  snippetPlay({ preview:t.preview, title:t.title, artist:t.artist }, { onState:(st)=>{ if(st==='stop' || st==='brak'){ if(S.plPlaying===i) S.plPlaying=null; } set(i, st); } });
}
if(typeof document!=='undefined') document.addEventListener('click', (e)=>{
  const b=e.target && e.target.closest ? e.target.closest('#mpStage [data-pl-play]') : null;
  if(b){ e.preventDefault(); mpPlTap(+b.dataset.plPlay); }
});
// 📤 „Udostępnij wynik" — obrazek PNG (app/mpResultCard.js) + tekst (core/mpView.resultShareText)
async function mpShareResult(btn){
  const g=S.game; if(!g || g.phase!==MP.DONE) return;
  const p=mpDoneParts(g), list=S.donePl || matchPlaylist({ results:g.results, history:S.matchHist });
  let url=''; try{ url=location.origin+location.pathname; }catch(_e){}
  const d={ appName:APP_NAME, subtitle:'mecz ze znajomymi · '+(FORMAT_LABEL[g.format]||FORMAT_LABEL.coop), score:p.score, scale:p.scale, hits:p.tal.hits, played:p.tal.played,
    comp:p.isComp, winner:p.st.winner ? p.st.winner.name : '', tie:!!p.st.tie,
    ranking:p.tr.slice(0, 3).map(t=>({ name:t.name, score:t.score, place:p.placeOf(t.id) })), mvp:g.mvp || null,
    tracks:list.map(t=>({ title:t.title, artist:t.artist, ok:t.ok })), url };
  const lab=btn && btn.innerHTML;
  if(btn){ btn.disabled=true; btn.textContent='przygotowuję obrazek…'; }
  let r=null; try{ r=await shareMpResult(d); }catch(_e){ r=null; }
  if(!btn) return r;
  btn.disabled=false;
  if(r && r.how==='cancelled'){ btn.innerHTML=lab; return r; }   // anulowany arkusz — bez komunikatu
  btn.textContent = !r || r.how==='failed' ? 'nie udało się — spróbuj ponownie' : r.how==='shared' ? '✓ udostępniono'
    : r.png ? '✓ obrazek zapisany' + (r.copied ? ' · tekst skopiowany' : '') : '✓ tekst skopiowany';
  setTimeout(()=>{ if(btn.isConnected) btn.innerHTML=lab; }, 2600);
  return r;
}

/* ===================== P1-16: TV JAKO SCENA (tryb salonowy: host = TV, gracze = telefony-piloty) =====================
 * Osobny układ (≥1280 px, fluid do 1920×1080 i większych; typografia w rem skalowanym z szerokością — ×2 względem telefonu):
 *  góra   — marka, format, rail faz 🎧›🧠›👁, kod QR + kod pokoju w rogu (dla spóźnialskich), menu ⋯;
 *  lewa   — karta pytania: „PYTANIE n/N", kategoria, zadanie; słuchanie: winyl + DUŻY zegar fazy; kombinuj: zegar + „Czekamy na"
 *           (coop: tablica typów drużyny — TV jest jej sędzią); odsłona: okładka/utwór/poprawna odpowiedź;
 *  prawa  — drużyny/gracze: awatary, status (myśli / ✓ typ / ✓ dalej / pas), punkty, ranking z animacją zmiany miejsc i „+N";
 *  dół    — duże „Dalej"/„Pomiń" (Spacja/Enter, S; Esc = wyjście z potwierdzeniem; podpowiedź dyskretna).
 * Bez elementów pilota: pól odpowiedzi, „ODPOWIADAMY", „🔈 u hosta", strzałki wyjścia, paska emotek (latające emotki graczy — tak).
 * Logika (ranking, statusy, przyciski, klawisze) w core/tvStage.js; narzędzia DOM (QR, łatanie, FLIP, motyw, menu) w app/mp-tv.js. */
function mpTvLobbyOn(){ return !!(S.host && S.code && (!S.game || S.game.phase==null) && S.roomStage!=='build' && mpPickSalon); }
const tvJoin = ()=> tvJoinUrl(typeof location!=='undefined' ? location : {}, S.code||'');
const tvInitial = (nm)=> escapeHtml(String(nm||'?').slice(0,1).toUpperCase());
const tvPlural = (n, one, few, many)=> n===1 ? one : ([2,3,4].includes(n%10) && ![12,13,14].includes(n%100)) ? few : many;
function tvSkeleton(st){
  let root=st.firstElementChild;
  if(!(root && root.classList.contains('tv-scene') && st.children.length===1)){
    st.innerHTML=`<div class="tv-scene"><header class="tv-top" id="tvTop"></header><main class="tv-main"><section class="tv-left" id="tvLeft" aria-label="pytanie"></section><aside class="tv-right" id="tvRight" aria-label="gracze i ranking"></aside></main><footer class="tv-ctl" id="tvCtl"></footer></div>`;
    root=st.firstElementChild;
  }
  return { root, top:root.querySelector('#tvTop'), left:root.querySelector('#tvLeft'), right:root.querySelector('#tvRight'), ctl:root.querySelector('#tvCtl') };
}
function tvCornerHTML(){
  if(!S.code) return '';
  return `<div class="tv-corner"><div class="tv-corner-qr">${tvQrSVG(tvJoin())}</div><div class="tv-corner-tx"><small>dołącz</small><b>${escapeHtml(S.code)}</b></div></div>`;
}
const tvMenuBtnHTML = ()=> `<button type="button" class="tv-menubtn" onclick="mpTvMenu()" aria-label="Menu TV — motyw, pełny ekran, wyjście (Esc)">⋯</button>`;
function tvCtlHTML(ctl, noteHtml){
  const b=(x, cls, key)=> x ? `<button type="button" class="tv-btn ${cls}${x.act==='lock'?' mp-lockbtn':''}" data-tvact="${x.act}" onclick="mpTvAct(this.dataset.tvact)">${escapeHtml(x.label)} <kbd>${key}</kbd></button>` : '';
  const keys=[ctl.next?'Spacja / Enter — dalej':'', ctl.skip?'S — pomiń':'', 'Esc — wyjście'].filter(Boolean).join(' · ');
  return `<div class="tv-ctl-note" role="status">${noteHtml||''}</div><div class="tv-ctl-btns">${b(ctl.skip,'tv-skip','S')}${b(ctl.next,'tv-next','Spacja')}</div><div class="tv-keys" aria-hidden="true">${keys}</div>`;
}
// akcje przycisków/klawiszy TV → mosty z window (mp.js) — bez statycznego cyklu render↔logika
function mpTvAct(act){
  const w=(typeof window!=='undefined') ? window : {};
  const run={ start:()=>{ if(mpPickGate().ok) w.mpStart(); else w.mpLobbyStart(); }, setup:()=>w.mpLobbyStart(), skipArm:()=>w.mpHostSkipWait(),
    goComb:()=>w.mpGoKombinuj(), lock:()=>w.mpLock(), advance:()=>w.mpAdvance(), nextQ:()=>w.mpHostNextReveal(),
    rematch:()=>w.mpRematch(), newGame:()=>w.mpNewGame(), retry:()=>w.mpHostRetry() }[act];
  if(run) run();
}

/* ---------- LOBBY NA TV: duży kod + QR + link, gracze na żywo, ustawienia meczu, START ---------- */
// TV lobby: „· gotowi 3/4" (gracze bez TV — ps to już gracze); tylko gdy serwer zna „Gotowy ✓"
const tvReadyTx = (ps)=>{ if(!mpLobbyReadyCap() || !ps.length) return ''; const rc=lobbyReadyCount({ members:ps, readyIds:ps.filter(m=>m.ready).map(m=>m.id) }); return ' · '+escapeHtml(rc.text); };
function mpRenderTvLobby(st){
  const sk=tvSkeleton(st), url=tvJoin(), ps=mpPlayers(), gate=mpPickGate();
  const ctl=tvControls({ scene:'lobby', canStart:gate.ok });
  let d=null; try{ d=sanitizeDraft(mpDraft()); }catch(_e){}
  const draft = d ? mpDraftHTML(d).replace('Mecz, który ustawia host','Ustawienia meczu').replace('<span class="mpd-live">na żywo</span>','') : '';
  const lp=(m, col)=>`<li class="tv-lp" data-tvrow="${escapeHtml(m.id)}"${col?` style="border-left-color:${col}"`:''}><b class="tv-av" style="background:${mpAvatarColor(m.name)}">${tvInitial(m.name)}</b><span class="tv-lp-nm">${escapeHtml(m.name||'gracz')}</span><i>${m.ready?'✓ gotowy':'jest'}</i></li>`;
  // Drużyny: gracze pogrupowani wg przydziału z pickera (kolor + nazwa drużyny) — stół widzi skład przed startem
  let players;
  if(!ps.length) players=`<li class="tv-lp-empty">czekamy na graczy — zeskanujcie kod telefonem</li>`;
  else if(mpPickFormat==='teams'){
    const byId=Object.fromEntries(ps.map(m=>[m.id, m]));
    players=mpTeamsFromAssign(ps).map(t=>{ const col=safeColor(t.color, '#888');
      return `<li class="tv-lteam" style="--tc:${col}"><b><i></i>${escapeHtml(t.name||'drużyna')}</b><ul class="tv-lplist">${t.members.map(id=>byId[id] ? lp(byId[id], col) : '').join('')}</ul></li>`; }).join('');
  } else players=ps.map(m=>lp(m)).join('');
  sk.top.dataset.ph='card';
  tvPatch(sk.top, `<div class="tv-brand">Uszy &amp; Mózg <small>salon · lobby</small></div><div class="tv-top-mid"><span class="tv-pill">📺 Telefony to piloty — muzyka i pytania na tym ekranie</span></div>${tvMenuBtnHTML()}`);
  tvPatch(sk.left, `<div class="tv-join"><h1 class="tv-h1">Dołączcie telefonem</h1>
      <div class="tv-join-row"><div class="tv-join-qr">${tvQrSVG(url)}</div>
        <div class="tv-join-info"><div class="tv-join-code"><small>KOD POKOJU</small><b>${escapeHtml(S.code||'····')}</b></div>
          <div class="tv-join-link">dołącz: <b>${escapeHtml(tvJoinLabel(url))}</b></div>
          <p class="tv-join-how">Zeskanuj kod aparatem telefonu albo wpisz kod w Uszy &amp; Mózg → Multiplayer → Dołącz.</p></div></div></div>`);
  tvPatchFlip(sk.right, `<h2 class="tv-side-h">Przy stole <span aria-live="polite">${num(ps.length)} ${tvPlural(ps.length,'gracz','graczy','graczy')}${tvReadyTx(ps)}</span></h2><ul class="${mpPickFormat==='teams' && ps.length ? 'tv-lteams' : 'tv-lplist'}">${players}</ul>${draft}`);
  tvPatch(sk.ctl, tvCtlHTML(ctl, gate.ok ? '' : escapeHtml(gate.text)));
  tvSetKeys({ controls:ctl, leaveKind:'lobby', run:mpTvAct });
}

/* ---------- MECZ NA TV ---------- */
function tvSceneOf(g){
  if(mpRevealPending()) return (S.checkUntil||0)>Date.now() ? 'checking' : 'reveal';
  if(g.phase===MP.LOADING) return 'loading';
  if(g.phase===MP.ARMING) return 'arming';
  if(mpInCount(g)) return 'count';
  if(g.phase===MP.PLAY) return mpEffSub(g)==='sluchaj' ? 'listen' : 'answer';
  if(g.phase===MP.REVEAL) return 'waitnext';
  if(g.phase===MP.DONE) return 'done';
  if(g.phase===MP.NETERR || g.phase===MP.NOLYRIC) return 'error';
  return 'loading';
}
function tvQHeadHTML(g){
  const q=mpQNum(g), cat=g.catLabel||g.catKey||'';
  return `<div class="tv-qhead"><div class="tv-qn">PYTANIE <b>${num(q.n)}</b>${q.total?`<span>/${num(q.total)}</span>`:''}</div>
    <div class="tv-qchips">${cat?`<span class="tv-cat">${escapeHtml(cat)}</span>`:''}${g.mode?`<span class="tv-task">${escapeHtml(mpModeIcon(g.mode))} ${escapeHtml(mpTaskText(g))}</span>`:''}</div></div>`;
}
// treść pytania na TV — tryb „abcd" (muzyka) ma ogólne „Jaki to utwór?" (zadanie jest w chipie) → same kafle, bez pudełka
const tvPromptHTML = (g)=> g.mode==='abcd' ? '' : mpPromptHTML(g);
const tvClockHTML = ()=> `<div class="tv-clock" id="mpCountdown" role="timer" aria-label="czas fazy"></div>`;
/* TV: dwie kolumny (pytanie | odpowiedzi), żeby treść mieściła się na ekranie 16:9 bez przewijania (przegląd v70: wiersze jeden
 * pod drugim nie mieściły się na TV). Pusta prawa → sama lewa na całą szerokość. Pion (orientation:portrait) → CSS składa w jedną. */
const tvCols = (q, a, cls='')=> String(a||'').trim() ? `<div class="tv-cols${cls?' '+cls:''}"><div class="tv-col tv-col-q">${q}</div><div class="tv-col tv-col-a">${a}</div></div>` : q;
function tvTopHTML(g){
  const ph=mpPhaseNow(g);
  const rail=MP_PHASES.map(([k,e])=>`<span class="tv-rail-i${k===ph?' on':''}"><i aria-hidden="true">${e}</i>${k===ph?`<b>${escapeHtml(mpPhaseLabel(g,k))}</b>`:''}</span>`).join('<span class="tv-rail-sep" aria-hidden="true">›</span>');
  const rounds=(Number(g.rounds)||1)>1 ? `<span class="tv-round">Runda ${num(g.round||1)}/${num(g.rounds)}</span>` : '';
  return `<div class="tv-brand">Uszy &amp; Mózg <small>salon · ${escapeHtml(FORMAT_LABEL[g.format]||FORMAT_LABEL.coop)}</small></div>
    <div class="tv-top-mid"><div class="tv-rail" role="img" aria-label="faza: ${escapeHtml(ph?mpPhaseLabel(g,ph):'karta pytania')}">${rail}</div>${rounds}</div>${tvCornerHTML()}${tvMenuBtnHTML()}`;
}
// coop: odpowiedź drużyny (TV-sędzia widzi i nadpisuje klikiem w tablicę) — w Solo/Drużynach NIGDY (TV widzą wszyscy)
function tvTeamAnswerHTML(g){
  const tid=myTeamId(), ta=teamAnswer(g, tid), slots=renderSlots(g);
  const any=slots.some(s=>ta[s.key]);
  const sure=(myBucket().sure||[]).length>0;
  return `<div class="mp-teamd tv-teamans"><span class="ic">${ic('target')}</span><span class="tx"><span class="l">ODPOWIEDŹ DRUŻYNY</span><span class="v">${any ? slots.map(s=>ta[s.key]?escapeHtml(mpSlotShow(g, s.key, ta[s.key])):'—').join(' — ') : 'czekamy na typy z telefonów'}</span></span>${sure?'<span class="mp-x2">🟡 ×2</span>':''}</div>`;
}
function tvRevealHTML(g, snap){
  const r=(snap && snap.reveal) || {}, comp=mpIsCompTV();
  const rv=comp ? {} : mpRevealMine(r);
  const artOk = typeof r.art==='string' && /^https?:\/\//.test(r.art);
  const cover = artOk ? `<img class="tv-cover" src="${escapeHtml(r.art)}" alt="" referrerpolicy="no-referrer">` : `<div class="tv-cover ph">${ic('disc')}</div>`;
  let body;
  if(r.kind==='quiz'){
    const isMC=/\nA\)/.test(r.prompt||''), disp=(rv.display&&typeof rv.display==='object') ? rv.display : null;
    const rows=(r.slots||[]).map(s=>{
      const variants=(r.answers&&r.answers[s.key])||[];
      const canon = disp && disp[s.key]!=null ? String(disp[s.key]) : (isMC ? (variants[0]||'')+(variants[1]?') '+variants[1]:'') : String(variants[0]||''));
      return `<div class="tv-ans">${isMC?'':`<small>${escapeHtml((s.label||s.key).toUpperCase())}</small>`}<b>${escapeHtml(canon)||'—'}</b></div>`;
    }).join('');
    const prompt = r.promptStyle==='rebus' ? promptBodyHTML(r.prompt, 'rebus') : escapeHtml(String(r.prompt||'').split('\nA)')[0]);
    body=`<div class="tv-rv-prompt">${prompt}</div><div class="tv-ans-h">Poprawna odpowiedź</div>${rows}${r.fun?`<div class="tv-fun">💡 ${escapeHtml(r.fun)}</div>`:''}${listenHTML(r.listen, { allowed:true })}`;
  } else if(r.kind==='medley'){   // MP składanka: wykonawca + zagrane utwory
    const list=(Array.isArray(r.clips) ? r.clips : []).filter(c=>c && c.track).map((c,i)=>`${num(i+1)}. ${escapeHtml(displayTitle(c.track))}`).join(' · ');
    body=`<div class="tv-track"><div class="tv-cover ph">🎛</div><div class="tv-track-i"><small class="tv-ans-h">Poprawna odpowiedź</small><b class="tv-track-t">${escapeHtml(r.artist||'')}</b>${list?`<span class="tv-track-m">zagrały: ${list}</span>`:''}</div></div>`;
  } else if(r.kind==='timeline'){   // MP oś czasu: utwór + ROK (duży) + wynik szczeliny drużyny (coop)
    const te=rv.timelineEval||{};
    const res = !comp && te.gap!=null ? `<div class="tv-fun">${te.placeOk?'✓ dobre miejsce na osi':'✗ złe miejsce — karta odpada'} (${escapeHtml(gapLabel(te.before||[], te.gap))})</div>` : '';
    body=`<div class="tv-track">${cover}<div class="tv-track-i"><small class="tv-ans-h">Utwór</small><b class="tv-track-t">${escapeHtml(displayTitle(r.track||''))}</b><span class="tv-track-a">${escapeHtml(r.artist||'')}</span></div></div><div class="tv-year"><small>ROK</small><b>${escapeHtml(String(r.year||'—'))}</b></div>${res}`;
  } else if(r.kind==='cover'){   // MP okładka: duża pełna okładka + wykonawca, album, rok
    body=`<div class="tv-track">${cover}<div class="tv-track-i"><small class="tv-ans-h">Poprawna odpowiedź</small><b class="tv-track-t">${escapeHtml(r.artist||'')}</b><span class="tv-track-a">${escapeHtml(r.album||'')}</span>${r.year?`<span class="tv-track-m">${escapeHtml(String(r.year))}</span>`:''}</div></div>`;
  } else {
    const meta=(r.kind==='year' ? [r.album] : [r.album, r.year]).filter(Boolean).join(' · ');
    const year = r.kind==='year' ? `<div class="tv-year"><small>ROK WYDANIA</small><b>${escapeHtml(String(r.year||'—'))}</b></div>${r.yearNote?`<div class="tv-fun">ℹ️ ${escapeHtml(r.yearNote)}</div>`:''}` : '';
    body=`<div class="tv-track">${cover}<div class="tv-track-i"><small class="tv-ans-h">${r.kind==='year'?'Utwór':'Poprawna odpowiedź'}</small><b class="tv-track-t">${escapeHtml(displayTitle(r.track))}</b><span class="tv-track-a">${escapeHtml(r.artist||'')}</span>${meta?`<span class="tv-track-m">${escapeHtml(meta)}</span>`:''}${mpFromHTML(r)}${mpCoverArtistHTML(r)}</div></div>${year}`;
  }
  const stg = !comp && rv.stageEval ? `<div class="tv-fun" data-rv-stage>${r.kind==='cover'?'🖼':'⏱'} ${escapeHtml(mpStageEvalText(rv.stageEval))}</div>` : '';   // MP okładka/intro: etap i mnożnik drużyny
  return tvQHeadHTML(g) + tvCols(`<div class="tv-reveal">${body}</div>`, `${stg}${comp ? '' : mpRevealBanner(rv)}`);
}
function tvLeftHTML(g, sc){
  switch(sc){
    case 'loading': return `${tvQHeadHTML(g)}<div class="tv-status">${bbLoader}<span>${escapeHtml(mpLoadingText(g))}</span></div>`;
    case 'arming': {
      const players=mpPlayers(), ids=Array.isArray(g.readyIds) ? g.readyIds : [];
      const pend=pendingIds(players.map(m=>m.id), ids);
      return `${tvQHeadHTML(g)}${mpPeopleHTML(players, new Set(ids))}<div class="tv-status"><b>${num(g.readyCount||0)}/${num(g.readyTotal||players.length)}</b> telefonów gotowych</div>${mpWaitNamesHTML(pend)}`;
    }
    case 'count': {
      const d=introDigit(S.introUntil-Date.now(), mpIntroLeadMs()), mc=mcOptions(g);
      const prompt = g.mode==='quiz' && g.prompt ? `<div class="tv-qprompt">${promptBodyHTML(mc ? mc.question : g.prompt, g.promptStyle==='rebus'?'rebus':'')}</div>` : '';
      return `${tvQHeadHTML(g)}<div class="tv-count" aria-hidden="true"><b data-d="${num(d)}">${d>0?num(d):'▶'}</b></div>${prompt}`;
    }
    case 'listen':
      if(mpStaged(g)) return tvQHeadHTML(g)+tvCols(`${mpCoverHTML(g, true)}${mpIntroStagesHTML(g, true)}`, `<div class="tv-clockrow">${tvClockHTML()}</div>`);   // MP okładka/intro
      if(g.mode==='quiz') return tvQHeadHTML(g)+tvCols(mpPromptHTML(g), `<div class="tv-clockrow">${tvClockHTML()}</div>${mpMcHTML(g)}`, 'aw');
      return tvQHeadHTML(g)+tvCols(`<div class="tv-listen${mcOptions(g)?' mc':''}">${mpKnobHTML(g)}<div class="tv-listen-r">${tvClockHTML()}<div class="mp-listenbar tv-listenbar" id="mpListenBar"><i></i></div><div class="mp-state tv-playst" id="mpPlayStatus">${g.mode==='lektor'?'lektor czyta — słuchajcie':'słuchajcie uważnie'}</div></div></div>`,
        `${mpLyricHTML(g)}${tvPromptHTML(g)}${mpMcHTML(g)}`)+mpTimelineHTML(g, true);
    case 'answer': {
      const comp=(g.format||'coop')!=='coop', mc=!!mcOptions(g);
      const wait = g.allDoneAt ? `<div class="mp-alldone tv-alldone" role="status">✓ Wszyscy gotowi! Sprawdzamy…</div>`
        : (mpWaitNamesHTML(unsettledIds(g, mpPlayers().map(m=>m.id))) || `<div class="mp-waitfor"><span class="mp-wf-tx">odpowiadacie na telefonach</span></div>`);
      const board = comp || mc ? '' : `<div class="mp-board tv-board" id="mpBoard">${mpSlotsHTML(g)}</div>${tvTeamAnswerHTML(g)}`;
      const q=`${tvPromptHTML(g)}${mpLyricFoldHTML(g)}${mpCoverHTML(g, true)}${mpIntroStagesHTML(g, true)}`;
      const clock=`<div class="tv-clockrow">${tvClockHTML()}${wait}</div>`, ans=`${mc?mpMcHTML(g):''}${board}`;
      // treść pytania (okładka/tekst/intro) | zegar + odpowiedzi; bez treści: zegar + oczekujący | odpowiedzi (ABCD, tablica)
      return tvQHeadHTML(g) + (q.trim() ? tvCols(q, clock+ans) : tvCols(clock, ans, 'aw')) + mpTimelineHTML(g, true);
    }
    case 'checking': return `${tvQHeadHTML(g)}<div class="tv-checking" role="status"><div class="mp-chk-ic" aria-hidden="true">🥁</div><b>Sprawdzamy…</b>${bbLoader}</div>`;
    case 'reveal': return tvRevealHTML(g, S.revealSnap);
    case 'waitnext': return `${tvQHeadHTML(g)}<div class="tv-status">✓ zaraz następne pytanie…</div>`;
    case 'done': { const p=mpDoneParts(g); return `<div class="tv-done">${p.hero}${p.mvp}${p.stawia}</div>`; }
    case 'error': {
      const msg = g.phase===MP.NOLYRIC ? 'Brak materiału do tej rundy w tej kategorii (wyczerpana pula).'
        : g.netReason==='empty' ? 'Brak zajawek dla tej kategorii — spróbuj ponownie albo zmień kategorię.' : 'Brak połączenia z iTunes (limit zapytań albo blokada sieci). Odczekaj minutę i spróbuj ponownie.';
      return `<div class="tv-status tv-err" role="alert">${escapeHtml(msg)}</div>`;
    }
  }
  return '';
}
// prawa kolumna: drużyny/gracze ze statusem i punktami; Solo/Drużyny — ranking (FLIP przy zmianie miejsc), coop — skład drużyny
function tvSideHTML(g, sc){
  const comp=(g.format||'coop')!=='coop';
  const phase = sc==='arming' ? 'arming' : (sc==='listen'||sc==='answer') ? 'play' : (sc==='reveal'||sc==='checking'||sc==='waitnext') ? 'reveal' : 'other';
  const teams=(g.teams||[]).filter(t=>(t.members||[]).length);
  const snap=S.revealSnap, rr=(snap && (sc==='reveal'||sc==='checking')) ? snap.reveal : null;
  const teamRes=(id)=> rr ? ((rr.byTeam && rr.byTeam[id]) || (Array.isArray(rr.ranking) && rr.ranking.find(x=>x.teamId===id)) || (!comp ? rr : null)) : null;
  const gained={}, scores={};
  teams.forEach(t=>{ const x=teamRes(t.id); gained[t.id]=Math.max(0, Number(x && x.gained)||0); scores[t.id]=Number((g.scores||{})[t.id])||0; });
  if(sc==='checking') teams.forEach(t=>{ scores[t.id]=Math.max(0, scores[t.id]-gained[t.id]); });   // „Sprawdzamy…" nie zdradza wyniku
  const readySet=new Set(Array.isArray(g.readyIds) ? g.readyIds : []);
  const advSet=new Set(mpAdvancedIds(g.playNonce)||[]);
  const stOf=(t, id)=> tvPlayerStatus({ phase, roster: phase==='play' ? rosterState(g, t.id, id, S.typingSet) : null, ready:readySet.has(id), advanced:advSet.has(id) });
  const person=(t, id, big)=>{ const nm=mpNameOf(id)||'gracz', s=stOf(t, id);
    return `<li class="tv-p st-${s.key}${big?' big':''}"><b class="tv-av" style="background:${mpAvatarColor(nm)}">${tvInitial(nm)}</b><span class="tv-p-tx"><span class="tv-p-nm">${escapeHtml(nm)}</span><i class="tv-p-st">${escapeHtml(s.label)}</i></span></li>`; };
  if(sc==='done' && !comp){
    const tally=(g.tallyList||[]);
    return `<h2 class="tv-side-h">Wkład drużyny</h2><ol class="tv-wk">${tally.map(t=>`<li><b class="tv-av" style="background:${mpAvatarColor(t.name)}">${tvInitial(t.name)}</b><span>${escapeHtml(t.name)}</span><em>${num(t.correct)}</em></li>`).join('') || '<li>brak trafnych typów</li>'}</ol>`;
  }
  if(!comp){
    const t=teams[0]; if(!t) return `<h2 class="tv-side-h">Drużyna</h2><div class="tv-status">czekamy na graczy…</div>`;
    const sum=tvTeamSummary((t.members||[]).map(id=>stOf(t, id).key), phase);
    const gain=sc==='reveal' && gained[t.id]>0 ? `<small class="tv-gain">+${num(gained[t.id])}</small>` : '';
    return `<h2 class="tv-side-h">${escapeHtml(t.name||'Drużyna')} <span class="tv-pts">⭐ <b>${num(scores[t.id])}</b>${gain}</span></h2>
      ${phase==='other'?'':`<div class="tv-sum-line">${escapeHtml(sum.label)}</div>`}<ul class="tv-coop">${(t.members||[]).map(id=>person(t, id, true)).join('')}</ul>`;
  }
  const base = sc==='reveal' ? ((S.tvRankBase && S.tvRankBase.nonce===S.revealNonce) ? S.tvRankBase.order : (S.tvRankBase={ nonce:S.revealNonce, order:(S.tvOrder||[]).slice() }).order) : null;
  const rows=tvRanking(teams, scores, base, sc==='reveal' ? gained : null);
  if(sc!=='reveal') S.tvOrder=rows.map(x=>x.id);
  const fc=formatCopy(g.format);
  const lis=rows.map(row=>{
    const t=teams.find(x=>x.id===row.id), ms=t.members||[], solo1=ms.length===1 && (g.format||'coop')==='solo';   // Drużyny: nazwa drużyny także przy 1 osobie
    const col=safeColor(t.color, mpAvatarColor(t.name));
    const keys=ms.map(id=>stOf(t, id));
    const sum=tvTeamSummary(keys.map(k=>k.key), phase);
    const res=sc==='reveal' ? teamRes(t.id) : null;
    const mk = res ? `<span class="tv-mk ${res.teamOk?'ok':'no'}" aria-label="${res.teamOk?'trafione':'pudło'}">${res.teamOk?'✓':'✗'}</span>` : '';
    const mv = row.move ? `<span class="tv-move ${row.move}" aria-label="${row.move==='up'?'awans':'spadek'} o ${num(row.delta)}">${row.move==='up'?'▲':'▼'}${num(row.delta)}</span>` : '';
    const gain = row.gained>0 ? `<small class="tv-gain">+${num(row.gained)}</small>` : '';
    const nm = solo1 ? (mpNameOf(ms[0])||t.name||'gracz') : (t.name||'drużyna');
    const st = solo1 ? keys[0] : null;
    const sumHtml = phase==='other' ? '' : `<small class="tv-sum${st?' st-'+st.key:sum.all?' st-ans':''}">${escapeHtml(st ? st.label : sum.label)}</small>`;
    // Solo (1 osoba): awatar | imię nad statusem (pełne imię czytelne z kanapy); drużyna: kropka, nazwa, ruch, podsumowanie
    const head = solo1
      ? `<div class="tv-tm-h"><b class="tv-av" style="background:${col}">${tvInitial(nm)}</b><span class="tv-tm-col"><b class="tv-tm-nm">${escapeHtml(nm)}</b>${sumHtml}</span>${mv}</div>`
      : `<div class="tv-tm-h"><i class="tv-dot"></i><b class="tv-tm-nm">${escapeHtml(nm)}</b>${mv}${sumHtml}</div>`;
    return `<li class="tv-team${solo1?' solo1':''}" data-tvrow="${escapeHtml(t.id)}" data-tvteam="${escapeHtml(t.id)}" style="--tc:${col}"><span class="tv-rk">${num(row.place)}</span>
      <div class="tv-tm">${head}${solo1||phase==='other'?'':`<ul class="tv-ppl">${ms.map(id=>person(t, id, false)).join('')}</ul>`}</div>${mk}<span class="tv-pts"><b>${num(row.score)}</b>${gain}</span></li>`;
  }).join('');
  return `<h2 class="tv-side-h">${escapeHtml(sc==='done' ? fc.doneRanking : fc.rankingTitle)}</h2><ol class="tv-rank mp-tvteams">${lis}</ol>`;
}
function tvCtlNote(g, sc){
  if(sc==='arming' && g.armMs>0) return `<span id="mpArmLeft">${mpArmLeftText(secsLeft(S.armDeadlineLocal, Date.now()))}</span>`;
  if(sc==='answer' && (g.format||'coop')!=='coop'){
    const ts=(g.teams||[]).filter(t=>(t.members||[]).length);
    return `${num(ts.filter(t=>mpTeamAnswered(g, t).length).length)}/${num(ts.length)} z typem`;
  }
  if(sc==='reveal'){ const c=S.advCount||0, t=S.advTotal||mpPlayers().length||0; return `✓ ${num(c)}/${num(t)} graczy kliknęło „dalej" — przejdę sam, gdy wszyscy`; }
  if(sc==='listen') return 'telefony: odpowiedź wpisujecie po wysłuchaniu';
  return '';
}
function tvSpeech(g, sc){
  switch(sc){
    case 'arming': return mpCardSpeech(g);
    case 'count': return 'Start za 3…';
    case 'listen': return mpPhaseLabel(g, 'sluchaj')+'.';
    case 'answer': return mpPhaseLabel(g, 'kombinuj')+'. Odpowiadacie na telefonach.';
    case 'checking': return 'Sprawdzamy…';
    case 'reveal': { const r=(S.revealSnap && S.revealSnap.reveal) || {}; return 'Odsłona.'+(r.track ? ` ${displayTitle(r.track)} — ${r.artist||''}.` : ''); }
    case 'done': return 'Koniec meczu.';
    case 'error': return 'Problem z pytaniem — spróbuj ponownie.';
  }
  return '';
}
function mpRenderTv(g, st){
  // nowe pytanie po odliczaniu — te same efekty co mpRenderPlay u telefonu (pod-faza „słuchaj", świeży feed i „pisze…")
  let fresh=false;
  if(g.phase===MP.PLAY && !mpInCount(g) && !mpRevealPending() && S.playRound!==g.playNonce){
    mpClearTyping(); S.composerMode='typ'; S.sub='sluchaj'; mpFeedReset(); S.playRound=g.playNonce; S.playSub=S.sub; fresh=true;
  }
  const sc=tvSceneOf(g);
  if(sc==='checking' && !S.checkTimer) S.checkTimer=setTimeout(()=>{ S.checkTimer=null; mpRender(); }, Math.max(0, (S.checkUntil||0)-Date.now())+10);
  const sk=tvSkeleton(st);
  const ctl=tvControls({ scene:sc, armLimit:g.armMs>0, comp:(g.format||'coop')!=='coop', last:!!(S.revealSnap && S.revealSnap.isLast), allDone:!!g.allDoneAt });
  sk.top.dataset.ph=mpPhaseNow(g)||'card';
  tvPatch(sk.top, tvTopHTML(g));
  const key=sc+':'+num(g.playNonce||0)+':'+mpQKey(g), enter=sk.left.dataset.scene!==key;
  sk.left.dataset.scene=key;
  const leftNew=tvPatch(sk.left, tvLeftHTML(g, sc));
  if(enter && !tvReducedMotion()){ sk.left.classList.remove('tv-in'); void sk.left.offsetWidth; sk.left.classList.add('tv-in'); }
  tvPatchFlip(sk.right, tvSideHTML(g, sc));
  tvPatch(sk.ctl, tvCtlHTML(ctl, tvCtlNote(g, sc)));
  tvSetKeys({ controls:ctl, leaveKind:'game', run:mpTvAct });
  if(sc==='listen' && leftNew && $m('mpKnob')){ if(fresh) mpVinyl.prepare(isTempoMode(g.mode) ? mpTempoRate(g.mode) : 1); else mpVinyl.refresh(); mpAnimListenBar(); }
  if(sc==='reveal') mpRevealFx();
  if(sc==='listen' || sc==='answer') coverPaintBoxes(sk.left);   // MP okładka: odmaluj (po tvPatch canvas mógł być nowy)
  if(sc==='done') mpJuiceScore(g);
  if(enter){ const say=tvSpeech(g, sc); if(say) mpAnnounce(say); }   // a11y: zmiana fazy dla czytnika (aria-live)
  if(sc==='count' && !S.countTimer){   // następna cyfra 3 → 2 → 1 (jak karta pytania u telefonu)
    const rem=S.introUntil-Date.now(), step=Math.max(1, mpIntroLeadMs()/3);
    const toNext=(rem % step) || step;
    S.countTimer=setTimeout(()=>{ S.countTimer=null; if(mpInCount(S.game)) mpRender(); }, Math.max(16, Math.min(rem, toNext)+8));
  }
  mpTickTimer();
}
initTvKeys();
if(typeof window!=='undefined') Object.assign(window, { mpTvAct, mpTvMenu: tvMenuOpen, mpShareResult });

export { mpIntroLeadMs, mpRender, mpRosterHTML, mpChatFeedHTML, mpConfHTML, mpStartListenWindow, mpAvatarColor, REACTIONS, mpRevealAutoMs, mpRevealAutoText, mpArmLeftText, mpIsSalonHost, mpTvLobbyOn };
