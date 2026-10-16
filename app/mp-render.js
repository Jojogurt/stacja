/* app/mp-render.js — warstwa WIDOKU multiplayera: dyspozytor mpRender + buildery HTML (lobby,
 * gra „słuchaj/kombinuj", odsłona, wynik) + render-driving (scaffold, okno słuchania, animacje).
 * Czyta współdzielony stan S (app/mp-state.js). Logika sterująca (transport/audio/host) zostaje
 * w app/mp.js i jest wstrzykiwana przez initMpRender — bez statycznego cyklu render↔logika. */
import { S, mpMe } from './mp-state.js';
import { escapeHtml, safeColor, isSlotKey, num } from '../core/util.js';
import { norm, YEAR_MIN, YEAR_MAX } from '../core/scoring.js';   // F8a: + zakres pola roku; mpSlotsHTML: porównanie głosów (mój głos == kandydat)
import { QPC, matchProgress } from '../core/match.js';
import { displayTitle } from '../core/trackSelect.js';   // tytuł z iTunes bez „(2012 Remaster)" itp. (tylko wyświetlanie)
import { MP } from '../core/phases.js';
import { listenSecs as _listenSecs, secsLeft, MP_REVEAL_AUTO_MS, MP_INTRO_MS, isTempoMode, mpTempoRate } from '../core/timing.js';   // mpListenSecs: czas fazy „słuchaj"; F2b #6: auto-„dalej"; F6b: intro
import { slotsFor, candidatesForSlot, teamAnswer, myVoteForSlot, rosterState, answerCredits, playsAudioLocally, audioHostOnly } from '../core/mpReducer.js';
import { REACTIONS } from '../core/chatFeed.js';   // F6b: whitelist emotek wspólna z serwerem (🖕 → 🍺)
import { ALL_CATS } from './catalog.js';
import { confetti, animIn, promptBodyHTML } from './dom.js';
import { listenStart, listenHTML } from './listen.js';
import { mpVinylHTML, mpVinyl } from './vinyl.js';   // płyta winylowa w fazie „słuchaj"   // Łamigłówki: „▶ posłuchaj" utworu-rozwiązania w odsłonie
import { playClap, playSfx } from './sfx.js';
import { ic } from './icons.js';
import { mpPickerHTML } from './mp-picker.js';

const $m = id => document.getElementById(id);

/* wstrzykiwane z mp.js (logika sterująca, której potrzebuje render) */
let mpMembers, mpPlayers, myTeamId, myTeamMembers, mpRevealPending, mpSkin, mpIngestFeed, mpFeedReset, mpClearTyping, mpTickTimer, mpGoKombinuj, mpNameOf;
export function initMpRender(deps){
  ({ mpMembers, mpPlayers, myTeamId, myTeamMembers, mpRevealPending, mpSkin, mpIngestFeed, mpFeedReset, mpClearTyping, mpTickTimer, mpGoKombinuj, mpNameOf } = deps);
}
// czy TEN klient jest ekranem salonowym (host w trybie salon). Fallback S.salon = nim serwer
// odeśle game.salon (działa bez deployu DO). Wymaga aktywnej gry (przed grą: lobby/picker normalnie).
const mpIsSalonHost = ()=> !!(S.host && S.game && S.game.phase!=null && (S.game.salon || S.salon));
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
const myBucket = ()=>{ const g=S.game, tid=myTeamId&&myTeamId(); return (g && g.byTeam && tid && g.byTeam[tid]) || {}; };

function mpLobbyWaitHTML(){
  const ms=mpMembers();
  const hostId = S.game ? S.game.hostId : (S.host ? mpMe.id : null);
  const cards = ms.map(m=>{
    const isHost = m.id===hostId, you = m.id===mpMe.id;
    const av = escapeHtml((m.name||'?').slice(0,1).toUpperCase());
    return `<div class="pcz-m">
      <span class="pcz-av" style="background:${mpAvatarColor(m.name)}">${av}</span>
      <div class="pcz-mn"><b>${escapeHtml(m.name||'gracz')}${isHost?' '+ic('crown'):''}${you?' (Ty)':''}</b><small>${isHost?'host':'w pokoju'}</small></div>
      <span class="pcz-badge">W POKOJU</span>
    </div>`;
  }).join('') || `<div class="pcz-waitmsg">czekamy na graczy…</div>`;
  const n=ms.length, word = n===1?'osoba' : ([2,3,4].includes(n%10) && ![12,13,14].includes(n%100)) ? 'osoby' : 'osób';
  const foot = S.host
    ? `<button class="pcz-start" onclick="mpLobbyStart()">ZACZNIJ →</button>`
    : `<div class="pcz-waitmsg">⏳ czekamy, aż host ułoży mecz…</div>`;
  return `<div class="pcz">
    <div class="pcz-hd">
      <div class="pcz-hd-r1"><button type="button" class="pcz-exit" onclick="mpConfirmLeave('lobby')">${ic('back')} wyjdź</button><span class="pcz-lbl">KOD POKOJU</span></div>
      <div class="pcz-hd-r2"><span class="pcz-code">${escapeHtml(S.code||'····')}</span><button class="pcz-share" onclick="mpShare(this)">${ic('share')} Udostępnij</button></div>
    </div>
    <div class="pcz-team"><span>Drużyna</span><span class="pcz-count">${n} ${word}</span></div>
    <div class="pcz-list">${cards}</div>
    <div class="pcz-foot">${foot}</div>
  </div>`;
}
// klucz sceny — jedno „gdzie jestem": picker | wait | play:nonce:sub | reveal:nonce | ph:faza.
function mpSceneKey(g){
  if(!g || g.phase==null) return (S.host && S.roomStage==='build') ? 'picker' : 'wait';
  if(mpRevealPending()) return 'reveal:'+S.revealNonce;
  if(g.phase===MP.PLAY) return 'play:'+g.playNonce+':'+mpEffSub(g);
  return 'ph:'+g.phase;
}
// EFEKTY WEJŚCIA W SCENĘ (onEnter) — odpowiednik godotowego _enter_state(), w JEDNYM miejscu.
// MP jest rozproszony: ten sam stan przychodzi wielokrotnie (sync) → triggery są nonce/klucz-strzeżone
// (idempotentne). Efekty TRANSPORTU/AUDIO (buforowanie/odtwarzanie) zostają po stronie wejścia w stan
// w mpAfterSync (app/mp.js) — render-side onEnter trzyma efekty renderu: migawka, confetti, oklaski, animIn.
function mpOnEnter(g, head, st){
  // wejście w ODSŁONĘ (nowy playNonce): migawka wyniku (każdy zostaje we własnym tempie) + confetti + oklaski
  if(g && g.phase===MP.REVEAL && g.reveal && S.revealNonce!==g.playNonce){
    S.revealNonce=g.playNonce;
    const rvm=mpRevealMine(g.reveal), tid=myTeamId&&myTeamId();
    // F6b (R8): „złożona z głosów" — nowy serwer/host liczy credits w ocenie (core/mpReducer.answerCredits);
    // stary serwer ich nie ma → policz z bucketu drużyny, który w stanie REVEAL jeszcze jest (czyszczony w nowej rundzie)
    const credits = Array.isArray(rvm.credits) ? rvm.credits : (tid && !mpIsCompTV() ? answerCredits(g, tid, rvm.locked||{}) : []);
    S.revealSnap={ reveal:g.reveal, head, isLast:(g.si>=g.slots.length-1 && g.qi>=QPC-1), credits };
    // Łamigłówki: ~10 s zajawki rozwiązania — LOKALNIE u gracza; „🔈 dźwięk tylko u hosta" → gra tylko host/TV
    listenStart(g.reveal.listen, { auto:true, allowed:mpPlaysHere(g) });
    S.advCount=0; S.advTotal=mpPlayers().length;   // salon: świeży licznik „dalej" graczy na nową odsłonę
    // F2b #6: auto-„dalej" po bezczynności. TV w salonie nie — przechodzi po „dalej" telefonów.
    // F6b (F9): odsłona BEZ intra (intro tylko przed „słuchaj") → licznik od razu.
    S.revealAutoAt = mpIsSalonHost() ? 0 : Date.now() + mpRevealAutoMs();
    // F6b (U4): trafienie → confetti + oklaski; częściowe → „ding"; pudło → „bzzt". TV (Solo/Drużyny): sam „ding".
    if(mpIsCompTV()) playSfx('ding');
    else if(rvm.teamOk || rvm.pewniakWin){ confetti(); playClap(); }
    else if(Number(rvm.gained)>0) playSfx('ding');
    else playSfx('buzz');
  }
  // wejście sceny na ZMIANĘ klucza (nie przy re-renderze): INTRO fazy (duża ikona) tam gdzie jest meta.
  // INTRO gra ZAWSZE (też przy reduced-motion — wtedy CSS robi je STATYCZNE, bez ruchu), bo wspólny LEAD
  // = RÓWNY START audio u wszystkich (mpAfterSync wstrzymuje audio do S.introUntil = odbiór fazy + LEAD).
  // Inaczej reduced-motion grałby od razu i miał przewagę. Sceny bez meta (kombinuj/odsłona/wynik/picker) → animIn.
  const scene=mpSceneKey(g);
  if(scene!==S.lastView){ S.lastView=scene;
    if(g && g.phase===MP.DONE && scene==='ph:'+MP.DONE) playSfx('fanfare');   // F6b (U4): fanfara końca meczu (raz)
    const meta=mpPhaseIntroMeta(g);
    if(meta){ mpPlayPhaseIntro(st, meta); }
    else { mpCancelIntro(st); S.introUntil=0; if(!(g && g.phase===MP.DONE)) animIn(st); }
  }
}
function mpRender(){
  const st=$m('mpStage'); if(!st) return;
  const salonHost=mpIsSalonHost();
  st.classList.toggle('salon', salonHost);            // duży ekran-monitor TV (CSS w index.html)
  document.body.classList.toggle('salon', salonHost); // wyłom z mobilnej powłoki 520px (szeroki TV)
  if(!S.game || S.game.phase==null){
    mpOnEnter(S.game, null, st);   // przejście picker/poczekalnia → animIn
    // przed grą: poczekalnia (06, własny navbar) → host „ZACZNIJ" → picker „ułóż mecz" (własny navbar)
    const building = S.host && S.roomStage==='build';
    st.innerHTML = building ? mpPickerHTML() : mpLobbyWaitHTML();
    return;
  }
  const g=S.game;
  const head=mpHeaderHTML(g);   // kompaktowy nagłówek 2-wierszowy (zawiera #mpCountdown)
  mpOnEnter(g, head, st);        // wszystkie efekty wejścia w scenę: migawka odsłony + confetti + oklaski + animIn
  // dopóki TEN klient nie kliknął „dalej" — pokazuj wynik, nawet gdy host już ruszył dalej
  if(mpRevealPending()){ st.innerHTML=mpRenderRevealCard(S.revealSnap); return; }
  switch(g.phase){
    case MP.LOADING: st.innerHTML=mpRenderLoading(head); return;
    case MP.ARMING:  st.innerHTML=mpRenderArming(g, head); return;
    case MP.NETERR:  st.innerHTML=mpRenderNetErr(g, head); return;
    case MP.NOLYRIC: st.innerHTML=mpRenderNoLyric(head); return;
    case MP.PLAY:    mpRenderPlay(g, head, st); return;   // salon: te same fazy, tylko większe (CSS) + ukryte kontrolki gracza
    case MP.REVEAL:  st.innerHTML=mpRenderWaitNext(head); return;   // już kliknąłem „dalej" — czekam na resztę
    case MP.DONE:    st.innerHTML=mpRenderDone(g, head); mpJuiceScore(g); return;
  }
}
// pasek emotek + krótka wiadomość — wspólny dla gry, wyniku i czekania.
// SALON (TV): host nie wysyła (latające emotki nadal widzi) → cały pasek znika.
function mpReactsBarHTML(){
  if(mpIsSalonHost()) return '';
  return `<div class="mp-reacts">${REACTIONS.map(e=>`<button onclick="mpReact('${e}')">${e}</button>`).join('')}</div>
    <div class="mp-saybar"><input id="mpSayIn" maxlength="32" placeholder="napisz coś krótkiego…" onkeydown="if(event.key==='Enter')mpSay()"><button onclick="mpSay()">Wyślij</button></div>`;
}

// loader „Uszy & Muzk" (3 kropki) — lokalny string (NIE współdzielony import: kruchy przy stale-cache).
const bbLoader = `<div class="bb-loader"><i></i><i></i><i></i></div>`;
const mpRenderLoading = (head)=> `${head}<div class="mp-deck">${bbLoader}<div class="mp-state">host losuje utwór…</div></div>`;
const mpRosterStrip = (g)=> `<div class="mp-roster">${mpRosterHTML(g||S.game||{})}</div>`;
// F2b #6: teksty liczników (wspólne z tickiem w mp.js)
const mpArmLeftText = (s)=> `start najpóźniej za ${num(s)} s`;
const mpRevealAutoText = (s)=> `auto-„dalej" za ${num(s)} s`;
// czas bezczynności do auto-„dalej" (seam testowy jak intro: window.__MP_REVEAL_AUTO_MS__)
const mpRevealAutoMs = ()=> (typeof window!=='undefined' && window.__MP_REVEAL_AUTO_MS__!=null) ? window.__MP_REVEAL_AUTO_MS__ : MP_REVEAL_AUTO_MS;
const mpRenderArming = (g, head)=>{
  const rc=num(g.readyCount||0), rt=num(g.readyTotal||mpMembers().length);
  // F2b #6: nowy serwer (armMs) ma twardy limit + komendę go — licznik i „pomiń czekających" dla hosta.
  // Stary serwer (bez armMs) go nie zna → bez przycisku, który nic by nie zrobił.
  const hasLimit = g.armMs>0;
  const note = hasLimit
    ? `<div class="mp-state" id="mpArmLeft" style="opacity:.7">${mpArmLeftText(secsLeft(S.armDeadlineLocal, Date.now()))}</div>`
    : `<div class="mp-state" style="opacity:.7">pytanie ruszy równo u wszystkich</div>`;
  const skip = (S.host && hasLimit) ? `<button class="mp-btn ghost" onclick="mpHostSkipWait()">pomiń czekających ›</button>` : '';
  return `${head}${mpRosterStrip(g)}<div class="mp-deck">${bbLoader}<div class="mp-state">czekamy aż wszyscy będą gotowi… <b>${rc}/${rt}</b></div>${note}${skip}</div>${mpReactsBarHTML()}`;
};
// klient już kliknął „dalej" i czeka, aż reszta też przejdzie do następnego pytania
const mpRenderWaitNext = (head)=>{
  // 1.8: NIE pokazuj readyCount/readyTotal z ARMING (nieaktualne w REVEAL — brak licznika „dalej" z serwera).
  // 1.2: host promowany w REVEAL po swoim „dalej" ma ack===revealNonce → bez przycisku nikt nie wyśle
  // `next` i mecz zamarza. Daj hostowi jawny przycisk „następne pytanie" (mpHostNextReveal → next).
  const hostBtn = S.host ? `<button class="mp-next" onclick="mpHostNextReveal()">NASTĘPNE PYTANIE ›</button>` : '';
  return `${head}${mpRosterStrip()}<div class="mp-deck"><div class="mp-state">✓ idziesz dalej…</div><div class="mp-state" style="opacity:.7">następne pytanie ruszy, gdy wszyscy przejdą dalej</div></div>${hostBtn}${mpReactsBarHTML()}`;
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
function mpRosterHTML(g){
  if(mpIsCompTV()) return '';   // F6b: TV (Solo/Drużyny) — status graczy jest w kartach drużyn (mpTvTeamsHTML)
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
    const nTyp=(b.proposals||[]).length || (b.counts&&b.counts.proposals) || 0;
    const ppl=(t.members||[]).map(id=>{
      const st=rosterState(g,t.id,id,S.typingSet), me=ROSTER_META[st]||ROSTER_META.idle, nm=mpNameOf(id)||'gracz';
      return `<span class="mp-rchip${me.dim?' dim':''}"><b style="background:${me.bg};color:${me.fg}">${escapeHtml(nm.slice(0,1).toUpperCase())}</b><span style="color:${me.lc}">${escapeHtml(nm)} · ${me.lab}</span></span>`;
    }).join('');
    return `<div class="mp-tvteam" style="border-color:${col}"><div class="mp-tvteam-h"><i style="background:${col}"></i><b>${escapeHtml(t.name||'drużyna')}</b><small>${num(nTyp)} ${nTyp===1?'typ':'typy'}</small></div><div class="mp-tvteam-ppl">${ppl}</div></div>`;
  }).join('')}</div>`;
}
function mpSlotsHTML(g){
  if(mpIsCompTV()) return mpTvTeamsHTML(g);
  const slots=renderSlots(g);
  const tid=myTeamId();   // kolumny TYLKO mojej drużyny
  const ro=mpIsSalonHost();   // TV-sędzia: może KLIKNĄĆ propozycję (nadpisuje górkę głosów), ale nie dorzuca własnych typów
  return `<div class="mp-slots">${slots.map(s=>{
    const cands=candidatesForSlot(g, tid, s.key);
    const myVal=myVoteForSlot(g, tid, s.key, mpMe.id);
    const rows = cands.map((c,i)=>{
      const isTop=i===0 && c.votes.length>0;
      const voted = myVal && norm(myVal)===norm(c.value);   // salon: podświetla wybór hosta (nadpisanie)
      const dots = c.votes.slice(0,5).map((v,j)=>`<b class="mp-vdot" style="background:${VOTE_COLORS[j%VOTE_COLORS.length]}"></b>`).join('');
      return `<button type="button" class="mp-cand${isTop?' is-top':''}${voted?' voted':''}" data-k="${escapeHtml(s.key)}" data-v="${escapeHtml(c.value)}" onclick="mpVote(this.dataset.k, this.dataset.v)">
        <span class="cv">${escapeHtml(c.value)}</span>
        <span class="crow"><span class="up">▲ ${c.votes.length}</span><span class="dots">${dots}</span>${isTop?'<span class="topb">TOP</span>':''}</span>
      </button>`;
    }).join('') || (ro?`<div class="mp-cand empty"><span class="cv" style="opacity:.5">— czekamy na typy z telefonów —</span></div>`:'');
    // „+ dorzuć typ…" usunięte — wpisywanie jest w sekcji pól (mpFormHTML) pod kolumnami
    return `<div class="mp-slotcol"><div class="mp-slot-h">${escapeHtml(s.label)}</div>${rows}</div>`;
  }).join('')}</div>`;
}
// „odpowiedź drużyny" (design): ciemna karta (kolumny) / zielona przypięta (czat) + ×2 gdy pewniak
function mpTeamHTML(g){
  // F6b (F8): host zatwierdza PEŁNYM przyciskiem (dawniej ✓ 36 px); reszta widzi, na kogo czeka
  const comp=(g.format||'coop')!=='coop';
  const lockBtn = S.host
    ? `<button type="button" class="mp-lockbtn" onclick="mpLock()" aria-label="${comp?'Zakończ pytanie i zatwierdź odpowiedzi wszystkich drużyn':'Zatwierdź odpowiedź drużyny'}">✓ ${comp?'ZATWIERDŹ WSZYSTKICH':'ZATWIERDŹ ODPOWIEDŹ'}</button>`
    : `<div class="mp-lockwait">${g.timer>0?'host zatwierdza — albo koniec czasu':'czekamy, aż host zatwierdzi odpowiedź'}</div>`;
  if(mpIsCompTV()) return lockBtn;   // TV (Solo/Drużyny): bez odpowiedzi drużyny, tylko „zatwierdź wszystkich"
  const tid=myTeamId();
  const ta=teamAnswer(g, tid), slots=renderSlots(g);
  const any=slots.some(s=>ta[s.key]);
  const val = any ? slots.map(s=> ta[s.key]?escapeHtml(ta[s.key]):'—').join(' — ') : '— wrzućcie i przegłosujcie —';
  const sure = (myBucket().sure||[]).length>0;
  const badge = sure ? '<span class="mp-x2">🟡 ×2</span>' : '';
  const cls = curSkin()==='czat' ? 'mp-teamc' : 'mp-teamd';
  return `<div class="${cls}"><span class="ic">${ic('target')}</span><span class="tx"><span class="l">ODPOWIEDŹ DRUŻYNY</span><span class="v">${val}</span></span>${badge}</div>${lockBtn}`;
}
// „pewniak" + „pas" — dwa NIEZALEŻNE od typowania toggle (jeden wiersz). Działają dla każdego
// uczestnika (też kto tylko głosował), bo stan żyje w buckecie drużyny (sure/passed, nie w propozycji).
// Stan podświetlony z gry (on), więc po wysłaniu odpowiedzi klik nadal działa i widać efekt.
// Kto pewniakuje / spasował widać też na pasku osób (roster), więc tu bez list imion.
function mpConfHTML(withPass=true){
  const bkt=myBucket();
  const iSure   = (bkt.sure||[]).some(p=>p.id===mpMe.id);
  const iPassed = (bkt.passed||[]).some(p=>p.id===mpMe.id);
  const sure = `<button class="mp-seg s${iSure?' on':''}" style="flex:1.6" onclick="mpSend({type:'sure'})">🟡 PEWNIAK ×2</button>`;
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
const mpKnobHTML = ()=> mpVinylHTML();
// F6b (tryb #6): gałka „pilota" — dźwięk gra u hosta; bez #mpKnobIcon (stany odtwarzacza jej nie zmieniają)
const mpRemoteKnobHTML = ()=> `<button class="mp-knob remote" id="mpKnob" onclick="mpKnobTap()" aria-label="Dźwięk gra u hosta — słuchaj z jego głośnika"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/><path d="M14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg></button>`;
const MP_REMOTE_STATUS = '🔈 słuchaj z głośnika hosta';
const mpLyricHTML = (g)=> g.mode==='lektor'&&g.lyric ? `<div class="lyric-box"><span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>${escapeHtml(g.lyric)}</div>` : '';
// wiedza ogólna: treść pytania w tym samym pudełku co tekst lektora
// F8a: „abcd" (muzyka) — kafle „Tytuł — Wykonawca" w tym samym pudełku; odpowiedź = litera (jak ABCD quizu)
// Łamigłówki: g.promptStyle==='rebus' → emoji duże i wyśrodkowane (stary serwer bez pola → zwykły tekst)
const mpPromptHTML = (g)=> (g.mode==='quiz'||g.mode==='abcd')&&g.prompt ? `<div class="lyric-box quiz${g.promptStyle==='rebus'?' rebus':''}"><span class="lyric-cap">${g.mode==='abcd'?'który utwór? — wpisz literę A–D':'pytanie'}</span>${promptBodyHTML(g.prompt, g.mode==='quiz'?g.promptStyle:'')}</div>` : '';
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
        return `<span class="mp-typline"><span class="mp-typchip">@${escapeHtml((ch.slot||'').toUpperCase())}</span><span${valAttrs}>${escapeHtml(ch.val||'')}</span></span>`;
      }).join('');
      return `<div class="mp-cmsg${c.mine?' me':''}">${avb}<div class="mp-cmb typ${c.mine?' me':''}"${dataVals}${bubbleClick}><span class="nm">${escapeHtml(c.byName||'')} · typ${S.host?' <span class="mp-host-tip">kliknij tytuł/wykonawcę = wybierz</span>':''}</span>${chips}</div></div>`;
    }
    return `<div class="mp-cmsg${c.mine?' me':''}">${avb}<div class="mp-cmb${c.mine?' me':''}"><span class="nm">${escapeHtml(c.byName||'')}</span><div class="tx">${escapeHtml(c.text||'')}</div></div></div>`;
  }).join('');
  return rows + mpTypingFeedHTML();
}
function mpTypingFeedHTML(){
  const ids=[...(S.typingSet||[])].filter(id=>id && id!==mpMe.id);
  if(!ids.length) return '';
  const names=ids.map(mpNameOf), first=names[0]||'?';
  return `<div class="mp-cmsg mp-ctyping"><b class="mp-cmav" style="background:${mpAvatarColor(first)}">${escapeHtml(first.slice(0,1).toUpperCase())}</b>`+
    `<span class="mp-typing"><span></span><span></span><span></span></span><span class="mp-typname">${escapeHtml(names.join(', '))} pisze…</span></div>`;
}
// dawny duży pasek faz (rail) w treści — usunięty; zostaje no-op, by nie ruszać miejsc wywołania.
// F6b (U8c): zamiast niego KOMPAKTOWY wskaźnik faz w nagłówku (mpPhaseRailHTML: 🎧 · 🧠 · 👁).
function mpRailHTML(_active){ return ''; }
const MP_PHASES=[['sluchaj','🎧','słuchaj'],['kombinuj','🧠','kombinujcie'],['odslona','👁','odsłona']];
// bieżąca faza do wskaźnika: odsłona (także moja zaległa) / słuchaj / kombinuj; inne sceny (gotowość, wynik) → null
function mpPhaseNow(g){
  if(!g) return null;
  if(mpRevealPending() || g.phase===MP.REVEAL) return 'odslona';
  if(g.phase===MP.PLAY) return mpEffSub(g)==='sluchaj' ? 'sluchaj' : 'kombinuj';
  return null;
}
function mpPhaseRailHTML(g){
  const cur=mpPhaseNow(g); if(!cur) return '';
  const lab=(MP_PHASES.find(p=>p[0]===cur)||[])[2]||'';
  return `<div class="mp-ph" role="img" aria-label="faza: ${lab}">${MP_PHASES.map(([k,e])=>`<i class="${k===cur?'on':''}">${e}</i>`).join('<b aria-hidden="true">·</b>')}</div>`;
}
// efektywna pod-faza: na NOWE pytanie (zmiana playNonce) mpRenderPlay ustawi S.sub='sluchaj' dopiero
// PO mpOnEnter — więc klucz sceny i intro liczą sub z wyprzedzeniem (inaczej zły label / podwójne intro).
function mpEffSub(g){ return (g && S.playRound!==g.playNonce) ? 'sluchaj' : S.sub; }
// ikona + etykieta dla intra danej fazy (albo null = bez intra: picker/poczekalnia/ładowanie/wynik)
// F6b (F9/R-F9): intro TYLKO przed „słuchaj" (nowe pytanie) — „kombinujcie" i odsłona bez ikony (wskaźnik faz w nagłówku)
function mpPhaseIntroMeta(g){
  if(!g || g.phase==null || mpRevealPending()) return null;
  if(g.phase===MP.PLAY && mpEffSub(g)==='sluchaj'){
    if(g.mode==='quiz')   return { icon:ic('question'),   label:'Pytanie' };
    if(g.mode==='lektor') return { icon:ic('book'),       label:'Czytaj' };
    return { icon:ic('headphones'), label:'Słuchaj' };
  }
  return null;
}
// INTRO fazy: duża ikona na środku (pop → zmniejsza się i fade do 0), w tym czasie treść ukryta
// (nie zakryta białym ekranem — opacity 0), potem elementy wchodzą ze staggerem („oddech").
// czas intra (ms) do ODSŁONIĘCIA treści: ikona wchodzi → krótka pauza → wychodzi (CSS ~1.2 s). CAŁA faza
// (audio + timer w mpAfterSync) startuje dopiero wtedy (S.introUntil) — nic nie rusza pod intrem.
// F6b (F9): 2300 → MP_INTRO_MS (core/timing.js, 900 ms) — wspólny LEAD u wszystkich klientów (równy start audio).
// Seam testowy: window.__MP_INTRO_MS__ skraca/zeruje czas w jsdom (siatka nie czeka realnych 2 s).
const mpIntroRevealMs = ()=> (typeof window!=='undefined' && window.__MP_INTRO_MS__!=null) ? window.__MP_INTRO_MS__ : MP_INTRO_MS;
let mpIntroTimers=[], mpIntroGen=0;
// F6b: scena bez intra (np. „kombinujemy" stuknięte jeszcze pod ikoną „Słuchaj") — zgaś intro od razu,
// żeby treść nie została ukryta do końca starych timerów (i spóźniony rAF nie dołożył nakładki)
function mpCancelIntro(st){
  mpIntroGen++; mpIntroTimers.forEach(clearTimeout); mpIntroTimers=[];
  if(!st) return;
  st.classList.remove('mp-introing','mp-introdone');
  const o=st.querySelector('.mp-intro'); if(o) o.remove();
}
function mpPlayPhaseIntro(st, meta){
  mpIntroTimers.forEach(clearTimeout); mpIntroTimers=[];
  const gen=++mpIntroGen;
  const reveal=mpIntroRevealMs();
  S.introUntil = Date.now() + reveal;   // synchronicznie — mpAfterSync wstrzyma start fazy do tego czasu
  // SYNCHRONICZNIE ukryj treść JESZCZE PRZED innerHTML (mpOnEnter biegnie przed renderem fazy), żeby
  // elementy nie mignęły przed intrem. Klasa siedzi na #mpStage → przeżywa ustawienie innerHTML dzieci.
  st.classList.remove('mp-introdone'); st.classList.add('mp-introing');
  requestAnimationFrame(()=>{   // overlay z ikoną DOKŁADAMY po innerHTML (inaczej render fazy by go zmiótł)
    if(gen!==mpIntroGen) return;   // F6b: intro anulowane/zastąpione, zanim przyszła klatka
    const old=st.querySelector('.mp-intro'); if(old) old.remove();
    const ov=document.createElement('div'); ov.className='mp-intro';
    ov.innerHTML=`<div class="mp-intro-ic">${meta.icon}</div><div class="mp-intro-lb">${escapeHtml(meta.label)}</div>`;
    st.appendChild(ov);
    const T=(ms,fn)=>mpIntroTimers.push(setTimeout(fn,ms));
    T(reveal,()=>{ st.classList.remove('mp-introing'); st.classList.add('mp-introdone'); });   // pauza minęła → treść wchodzi
    T(reveal+460,()=>{ const o=st.querySelector('.mp-intro'); if(o) o.remove(); });
    T(reveal+680,()=>{ st.classList.remove('mp-introdone'); });
  });
}
// legenda stanów rostera (skórka czat — nad kreską)
function mpLegendHTML(){
  return `<div class="mp-legend"><span>🟡 pewniak</span><span>✓ typ</span><span>··· pisze</span><span>🤚 pas</span><span>· myśli</span></div>`;
}
// formularz typowania per slot (wspólny dla fazy/kombinuj)
function mpFormHTML(g){
  const slots=renderSlots(g);
  const inputs=slots.map(s=>`<input id="mpProp_${s.key}"${slotInputAttrs(s)} placeholder="${escapeHtml(s.label)}" oninput="mpTypingPing()">`).join('');
  const cols=slots.map(()=>'1fr').join(' ')+' auto';
  return `<div class="mp-form" style="grid-template-columns:${cols}">${inputs}<button onclick="mpPropose()">Wrzuć</button></div>`;
}
// composer „@odp" (czat): po wpisaniu „@" pole morfuje w pola slotów (tytuł/wykonawca) z szarymi
// placeholderami — klikalne osobno. Pola flex:1 (bez stałych 42%) → brak przerwy na iOS Safari.
function mpComposerHTML(g){
  const slots=renderSlots(g);
  const chips=slots.map((s,i)=>`${i?'<span class="mp-sep">,</span>':''}<input id="mpTyp_${s.key}"${slotInputAttrs(s)} class="mp-slotchip" placeholder="${escapeHtml(s.label)}" oninput="mpTypingPing()" onkeydown="if(event.key==='Enter')mpComposerSend()">`).join('');
  return `<div class="mp-composer">
      <button class="mp-cf mp-typtoggle" id="mpTypToggle" onclick="mpComposerToggle()" title="przełącz czat/typ" aria-label="przełącz czat/typ">✍️</button>
      <div class="mp-compfield">
        <div class="mp-cwrap" id="mpCompChat"><input id="mpChatIn" maxlength="80" autocomplete="off" placeholder="napisz… (@ = typ odpowiedzi)" oninput="mpChatInput()" onkeydown="if(event.key==='Enter')mpComposerSend()"></div>
        <div class="mp-cwrap mp-cwrap-typ" id="mpCompTyp" style="display:none"><span class="mp-at">@</span>${chips}</div>
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
function mpHeaderHTML(g){
  const MODE={music:ic('music')+' muzyka',lektor:ic('mic')+' lektor',reverse:ic('reverse')+' od tyłu',snippet:ic('scissors')+' fragment',quiz:ic('brain')+' wiedza',
    abcd:ic('music')+' ABCD', year:ic('music')+' rok', revsnip:ic('reverse')+' od tyłu krótko',
    slowmo:'🐢 zwolnione 0,6×', fastmo:'🐿 przyspieszone 1,5×'};   // EKSPERYMENT: tempo lokalne (stałe w MP)   // F8a; EKSPERYMENT
  // F6b (F6): strzałka = „opuścić pokój?" (potwierdzenie), nie natychmiastowe wyjście
  return `<div class="mp-hd">
    <div class="mp-hd-r1">
      <button type="button" class="mp-hd-back" onclick="mpConfirmLeave('game')" aria-label="Opuść pokój">${ic('back')}</button>
      <span class="mp-hd-title">${mpQLabel(g)} <small>· 🍺 ${escapeHtml(S.code||'')}</small></span>
      <span class="mp-hd-timer" id="mpCountdown" role="status" aria-live="polite"></span>
    </div>
    <div class="mp-hd-chips">
      <span>${escapeHtml(g.catLabel||g.catKey||'—')}</span>
      <span>${MODE[g.mode]||escapeHtml(g.mode)}</span>
      ${(Number(g.rounds)||1)>1?`<span>Runda ${num(g.round||1)}/${num(g.rounds)}</span>`:''}
      ${audioHostOnly(g)?`<span title="dźwięk gra tylko u hosta">🔈 u hosta</span>`:''}
      ${mpPhaseRailHTML(g)}
    </div>
  </div>`;
}

// FAZA „słuchaj" — JEDYNE miejsce z audio + pasek odliczania czasu fazy (wspólna).
// QUIZ: bez audio/gałki — pokaż treść pytania i przejdź do odpowiadania.
function mpSluchajBodyHTML(g){
  if(g.mode==='quiz'){
    return `${mpPromptHTML(g)}
      <button class="mp-btn ghost" style="width:100%;margin-top:8px" onclick="mpGoKombinuj()">odpowiadamy →</button>
      <div class="mp-foot">${mpHr()}${mpReactsBarHTML()}</div>`;
  }
  // F6b (tryb #6): nie-host przy „Dźwięk tylko u hosta"/salonie = pilot — gałka głośnika, bez odtwarzania
  const here=mpPlaysHere(g);
  const knob = here ? mpKnobHTML() : mpRemoteKnobHTML();
  const status = here ? `${g.mode==='lektor'?'lektor czyta':'posłuchaj uważnie'} · stuknij, by powtórzyć` : MP_REMOTE_STATUS;
  return `<div class="mp-deck">${knob}
      <div class="mp-state" id="mpPlayStatus">${status}</div>
      <div class="mp-listenbar" id="mpListenBar"><i></i></div></div>
    ${mpLyricHTML(g)}${mpPromptHTML(g)}
    <button class="mp-btn ghost" style="width:100%;margin-top:8px" onclick="mpGoKombinuj()">gotowe, kombinujemy →</button>
    <div class="mp-foot">${mpHr()}${mpReactsBarHTML()}</div>`;
}
// FAZA „kombinuj" — widok KOLUMNOWY (bez audio; quiz pokazuje pytanie na górze).
// Kolejność: profile ─ odpowiedź drużyny ─ kolumny ─ [dół: input+wrzuć ─ pewność ─ emotki].
// SALON (TV): bez pól wpisywania/pewności/emotek — host nadpisuje odpowiedź klikiem w kolumny.
function mpKombinujKolumnyHTML(g){
  const foot = mpIsSalonHost()   // TV: bez pól/pewności/emotek (coop i Solo/Drużyny)
    ? ((g.mode==='quiz'||g.mode==='abcd') ? `<div class="mp-foot">${mpHr()}${mpPromptHTML(g)}</div>` : '')
    : `<div class="mp-foot">
        ${mpPromptHTML(g)}${mpFormHTML(g)}
        <div class="mp-conf" id="mpConf">${mpConfHTML()}</div>
        ${mpHr()}${mpReactsBarHTML()}</div>`;
  return `<div class="mp-roster" id="mpRoster"></div>
    ${mpHr()}
    <div class="mp-team" id="mpTeam"></div>
    ${mpHr()}
    <div class="mp-board" id="mpBoard"></div>
    ${foot}`;
}
// FAZA „kombinuj" — widok CZAT (design 08): odpowiedź drużyny przypięta na górze,
// strumień czatu, composer = rząd emotek + ✋pas → pewność → pole @odp + wyślij.
function mpKombinujCzatHTML(g){
  return `${mpPromptHTML(g)}<div class="mp-team" id="mpTeam"></div>
    <div class="mp-chatfeed" id="mpChatFeed" aria-live="polite"></div>
    <div class="mp-comp">
      ${mpComposerHTML(g)}
      <div class="mp-conf" id="mpConf">${mpConfHTML(true)}</div>
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
  mpIngestFeed(g);                                  // dopisz nowe typy/pasy do feedu
  const feed=$m('mpChatFeed'); if(feed){ feed.innerHTML=mpChatFeedHTML(); feed.scrollTop=feed.scrollHeight; }
}
// start okna fazy słuchania (licznik czasu + auto-przejście do „kombinuj") — po intro
function mpStartListenWindow(g){
  S.listenStart=Date.now(); S.listenDur=mpListenSecs(g)*1000;
  if(S.subTimer) clearTimeout(S.subTimer);
  S.subTimer=setTimeout(()=>{ if(S.sub==='sluchaj' && S.game && S.game.phase===MP.PLAY) mpGoKombinuj(); }, S.listenDur);
  mpAnimListenBar();
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
    mpClearTyping(); S.composerMode='chat'; S.sub='sluchaj'; mpFeedReset();   // świeży feed na nowe pytanie
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

// wynik MOJEJ drużyny z odsłony (per-drużyna). coop → byTeam.all; fallback na płaskie pola reveal.
function mpRevealMine(r){ const tid=myTeamId&&myTeamId(); return (r && r.byTeam && tid && r.byTeam[tid]) || r || {}; }
// ranking między drużynami (odsłona) — tylko nazwy + pkt + ✓/✗, BEZ cudzych odpowiedzi (izolacja).
// Pokazywany dopiero przy >1 drużynie; w coop (1 drużyna) zwraca '' (zachowanie jak dziś).
function mpRevealStandingsHTML(ranking){
  if(!ranking || ranking.length<2) return '';
  const tid=myTeamId&&myTeamId();
  const rows=ranking.map((t,i)=>{
    const av=escapeHtml((t.name||'?').slice(0,1).toUpperCase());
    return `<div class="rv-stand-row${t.teamId===tid?' me':''}"><span class="rk">${i+1}</span><b class="av" style="background:${safeColor(t.color, mpAvatarColor(t.name))}">${av}</b><span class="nm">${escapeHtml(t.name||'drużyna')}${t.teamId===tid?' (Ty)':''}</span><span class="mk ${t.teamOk?'ok':'no'}">${t.teamOk?'✓':'✗'}</span><span class="pts">${num(t.score)}</span></div>`;
  }).join('');
  return `<div class="rv-standings"><div class="rv-stand-h">RANKING DRUŻYN</div>${rows}</div>`;
}
// baner wyniku rundy (wspólny: muzyka + quiz) — pewniak/trafienie/pudło. r = wynik MOJEJ drużyny.
function mpRevealBanner(r){
  if(r.pewniakWin) return `<div class="rv-banner win"><span class="ic">🟡</span><span class="tx"><b>PEWNIAK trafiony!</b><small>${(r.pewniacy||[]).map(escapeHtml).join(', ')} — podwójne punkty</small></span><span class="pts">+${num(r.gained)}</span></div>`;
  if(r.pewniakLose) return `<div class="rv-banner lose"><span class="ic">🍺</span><span class="tx"><b>Pewniak przepalony</b><small>stawia: ${(r.pewniacy||[]).map(escapeHtml).join(', ')} — odbiór na żywo 😏</small></span></div>`;
  if(r.teamOk) return `<div class="rv-banner ok"><span class="ic">✓</span><span class="tx"><b>Drużyna trafiła!</b><small>${r.firstBy?'pierwszy: '+escapeHtml(r.firstBy):'+'+num(r.gained)+' pkt'}${Number(r.streak)>=3?' · 🔥 seria '+num(r.streak):''}</small></span><span class="pts">+${num(r.gained)}</span></div>`;
  // F6a: częściowe trafienie (np. sam tytuł) też punktuje
  if(Number(r.gained)>0) return `<div class="rv-banner ok"><span class="ic">≈</span><span class="tx"><b>Prawie!</b><small>częściowe trafienie · +${num(r.gained)} pkt</small></span><span class="pts">+${num(r.gained)}</span></div>`;
  return `<div class="rv-banner no"><span class="ic">✗</span><span class="tx"><b>Tym razem nie</b><small>0 pkt</small></span></div>`;
}
// F6b (R8): „Złożona z głosów: kaśka → tytuł, mati → wykonawca" (uznanie dla graczy, design 09)
function mpCreditsHTML(credits, mc){
  if(!Array.isArray(credits) || !credits.length) return '';
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
  return `<button class="mp-next" onclick="mpAdvance()">${last?'WYNIK KOŃCOWY →':'NASTĘPNE PYTANIE ›'}</button>${auto}`;
}
// odsłona rundy (design): rail + zielona karta utworu + baner pewniaka + odpowiedź drużyny
function mpRenderRevealCard(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  if(r.kind==='quiz') return mpRenderQuizReveal(snap);
  if(r.kind==='year') return mpRenderYearReveal(snap);   // F8a: tryb „rok"
  const tv=mpIsCompTV();      // F6b: TV w Solo/Drużynach — poprawna odpowiedź + ranking, bez wyniku „swojej" drużyny
  const rv=tv ? {} : mpRevealMine(r);   // ✓/✗ slotów, locked, baner — z perspektywy MOJEJ drużyny
  // 5.2: waliduj URL okładki (tylko http(s)) + escapuj — art pochodzi z zewnętrznego API (iTunes)
  const artOk = typeof r.art==='string' && /^https?:\/\//.test(r.art);
  const cover = artOk?`<img class="rv-cover" src="${escapeHtml(r.art)}" referrerpolicy="no-referrer">`:`<div class="rv-cover ph">${ic('disc')}</div>`;
  const meta=[r.album,r.year].filter(Boolean).join(' · ');
  const slot=(ok,lab,val)=>`<div class="rv-slot"><span class="k">${lab}</span><span class="v">${escapeHtml(val||'—')}</span>${tv?'':`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>`}</div>`;
  const locked=rv.locked||{};
  return `${head}${mpRailHTML('odslona')}${mpRosterStrip()}${mpHr()}
    <div class="rv-card">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(displayTitle(r.track))}</span><span class="a">${escapeHtml(r.artist)}</span>${meta?`<span class="m">${escapeHtml(meta)}</span>`:''}</div></div>
      ${slot(rv.okTitle,'TYTUŁ',displayTitle(r.track))}${slot(rv.okArtist,'WYK.',r.artist)}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':`<div class="rv-locked">odpowiedź drużyny: „${escapeHtml(locked.title||'—')} · ${escapeHtml(locked.artist||'—')}"</div>`}
    ${tv?'':mpCreditsHTML(snap.credits)}
    ${mpRevealStandingsHTML(r.ranking)}
    ${mpReactsBarHTML()}
    ${mpRevealNextHTML(last)}`;
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
  const tier = !tv && team ? `<small class="rv-team">drużyna: „${escapeHtml(team)}" · ${escapeHtml(YEAR_TIER_TX[y.tier]||'')}${y.pts?` · +${num(y.pts)}`:''}</small>` : '';
  const note = r.yearNote ? `<div class="rv-team rv-fun">ℹ️ ${escapeHtml(r.yearNote)}</div>` : '';
  return `${head}${mpRailHTML('odslona')}${mpRosterStrip()}${mpHr()}
    <div class="rv-card">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(displayTitle(r.track))}</span><span class="a">${escapeHtml(r.artist)}</span>${r.album?`<span class="m">${escapeHtml(r.album)}</span>`:''}</div></div>
      <div class="rv-slot"><span class="k">ROK</span><span class="v">${escapeHtml(String(r.year||'—'))}${tier}</span>${tv?'':`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>`}</div>
      ${note}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':mpCreditsHTML(snap.credits)}
    ${mpRevealStandingsHTML(r.ranking)}
    ${mpReactsBarHTML()}
    ${mpRevealNextHTML(last)}`;
}
// odsłona QUIZU: pytanie + per slot poprawne warianty (✓/✗) + odpowiedź drużyny (bez okładki/roku)
function mpRenderQuizReveal(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  const tv=mpIsCompTV();      // F6b: TV (Solo/Drużyny) — bez wyniku „swojej" drużyny
  const rv=tv ? {} : mpRevealMine(r);   // okBySlot/locked mojej drużyny
  const isMC=/\nA\)/.test(r.prompt||'');   // pytanie ABCD: opcje w treści, jeden slot „litera lub odpowiedź"
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
      <span class="v">${correct}${team?`<small class="rv-team">drużyna: „${escapeHtml(team)}"</small>`:''}</span>
      ${tv?'':`<span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span>`}</div>`;
  }).join('');
  const others=Array.isArray(rv.others)&&rv.others.length
    ? `<div class="rv-team rv-others">inne poprawne: ${rv.others.map(x=>escapeHtml(x)).join(', ')}</div>` : '';
  const fun=r.fun ? `<div class="rv-team rv-fun">💡 ${escapeHtml(r.fun)}</div>` : '';
  // Łamigłówki: rebus duży także w odsłonie (opcje ABCD pod nim, w linii podpowiedzi) + „▶ posłuchaj"
  const rebus = r.promptStyle==='rebus';
  const promptHtml = rebus ? promptBodyHTML(r.prompt, 'rebus') : escapeHtml(r.prompt||'');
  const listen = listenHTML(r.listen, { allowed:mpPlaysHere(S.game||{}) });
  return `${head}${mpRailHTML('odslona')}${mpRosterStrip()}${mpHr()}
    <div class="rv-card quiz">
      <div class="rv-prompt">${promptHtml}</div>
      ${rows}${others}${fun}${listen}
    </div>
    ${tv?'':mpRevealBanner(rv)}
    ${tv?'':mpCreditsHTML(snap.credits, isMC)}
    ${mpRevealStandingsHTML(r.ranking)}
    ${mpReactsBarHTML()}
    ${mpRevealNextHTML(last)}`;
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
  const stage=$m('mpStage'); const el=stage&&stage.querySelector('.dn-hero .sc'); if(!el) return;
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
// wynik meczu (design): złoty hero + MVP + kto stawia + paski wkładu
function mpRenderDone(g, head){
  const tally=(g.tallyList||[]);
  const max=Math.max(1,...tally.map(t=>t.correct));
  const rows=tally.map((t,i)=>{
    const col=mpAvatarColor(t.name), pct=Math.round(t.correct/max*100), av=escapeHtml((t.name||'?').slice(0,1).toUpperCase());
    return `<div class="wk-row"><span class="rk">${i+1}</span><b class="av" style="background:${col}">${av}</b><span class="nm">${escapeHtml(t.name)}</span><span class="bar"><i style="width:${num(pct)}%;background:${i===0?'var(--green)':(t.correct?'var(--blue)':'var(--red)')}"></i></span><span class="pts">${num(t.correct)}</span></div>`;
  }).join('')||'<div class="mp-state">brak trafnych typów</div>';
  const mvp = g.mvp?`<div class="dn-mvp"><span class="av" style="background:${mpAvatarColor(g.mvp.name)}">${escapeHtml((g.mvp.name||'?').slice(0,1).toUpperCase())}</span><span class="tx"><span class="l">⭐ MVP STOŁU</span><b>${escapeHtml(g.mvp.name)}</b><small>${num(g.mvp.correct)} trafnych typów</small></span></div>`:'';
  const beer=Object.entries(g.beerTally||{}).sort((a,b)=>b[1]-a[1]);
  const stawia = beer.length?`<div class="dn-stawia"><span class="ic">🍺</span><span class="tx"><span class="l">STAWIA KOLEJKĘ</span><b>${beer.map(([n,c])=>escapeHtml(n)+(c>1?` (${num(c)}×)`:'')).join(', ')}</b><small>przepalone pewniaki 🟡💥</small></span></div>`:'';
  // KONKURENCJA (solo/drużyny): hero = zwycięzca, główna lista = ranking drużyn (pkt).
  // WSPÓLNA (coop): hero = wynik jedynej drużyny, lista = wkład graczy (jak dotąd).
  const isComp=(g.format||'coop')!=='coop';
  const tr=mpTeamRanking(g), winner=tr[0];
  const heroT = isComp && winner ? escapeHtml(winner.name)+' wygrywa!' : 'Mecz zakończony!';
  const heroS = isComp ? 'zwycięska drużyna · punkty' : 'punkty drużyny';   // F6a: wynik w punktach (core/scoring.scoreRound)
  let body;
  if(isComp){
    const tmax=Math.max(1,...tr.map(t=>t.score));
    const trows=tr.map((t,i)=>{ const av=escapeHtml((t.name||'?').slice(0,1).toUpperCase()), pct=Math.round(t.score/tmax*100);
      return `<div class="wk-row"><span class="rk">${i+1}</span><b class="av" style="background:${t.color}">${av}</b><span class="nm">${escapeHtml(t.name)}</span><span class="bar"><i style="width:${num(pct)}%;background:${i===0?'var(--green)':(t.score?'var(--blue)':'var(--red)')}"></i></span><span class="pts">${num(t.score)}</span></div>`;
    }).join('');
    body=`<div class="dn-lbl">Ranking drużyn</div><div class="dn-wk">${trows}</div>`;
  } else {
    body=`<div class="dn-lbl">Wkład drużyny</div><div class="dn-wk">${rows}</div>`;
  }
  return `<div class="dn-hero"><div class="ic">🏆</div><div class="t">${heroT}</div><div class="s">${heroS}</div><div class="sc">${num(mpWinnerScore(g))}</div></div>
    ${mvp}${stawia}
    ${body}
    <div class="dn-btns"><button class="dn-menu" onclick="mpExitMenu()">${ic('back')} menu</button>${S.host?'<button class="dn-again" onclick="mpNewGame()">REWANŻ 🔁</button>':'<div class="dn-wait">host zaczyna rewanż</div>'}</div>`;
}

export { mpRender, mpRosterHTML, mpChatFeedHTML, mpConfHTML, mpStartListenWindow, mpAvatarColor, REACTIONS, mpRevealAutoMs, mpRevealAutoText, mpArmLeftText };
