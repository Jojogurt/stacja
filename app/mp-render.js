/* app/mp-render.js — warstwa WIDOKU multiplayera: dyspozytor mpRender + buildery HTML (lobby,
 * gra „słuchaj/kombinuj", odsłona, wynik) + render-driving (scaffold, okno słuchania, animacje).
 * Czyta współdzielony stan S (app/mp-state.js). Logika sterująca (transport/audio/host) zostaje
 * w app/mp.js i jest wstrzykiwana przez initMpRender — bez statycznego cyklu render↔logika. */
import { S, mpMe } from './mp-state.js';
import { escapeHtml } from '../core/util.js';
import { norm } from '../core/scoring.js';   // mpSlotsHTML: porównanie głosów (mój głos == kandydat)
import { QPC } from '../core/match.js';
import { MP } from '../core/phases.js';
import { listenSecs as _listenSecs } from '../core/timing.js';   // mpListenSecs: czas fazy „słuchaj"
import { slotsFor, candidatesForSlot, teamAnswer, myVoteForSlot, rosterState } from '../core/mpReducer.js';
import { ALL_CATS } from './catalog.js';
import { confetti, animIn } from './dom.js';
import { playClap } from './sfx.js';
import { ic } from './icons.js';
import { mpPickerHTML } from './mp-picker.js';

const $m = id => document.getElementById(id);
const REACTIONS = ['😂','🔥','🎉','🤔','😱','🖕'];

/* wstrzykiwane z mp.js (logika sterująca, której potrzebuje render) */
let mpMembers, mpPlayers, mpRevealPending, mpSkin, mpIngestFeed, mpFeedReset, mpClearTyping, mpTickTimer, mpGoKombinuj, mpNameOf;
export function initMpRender(deps){
  ({ mpMembers, mpPlayers, mpRevealPending, mpSkin, mpIngestFeed, mpFeedReset, mpClearTyping, mpTickTimer, mpGoKombinuj, mpNameOf } = deps);
}
// czy TEN klient jest ekranem salonowym (host w trybie salon). Fallback S.salon = nim serwer
// odeśle game.salon (działa bez deployu DO). Wymaga aktywnej gry (przed grą: lobby/picker normalnie).
const mpIsSalonHost = ()=> !!(S.host && S.game && S.game.phase!=null && (S.game.salon || S.salon));
// salon wymusza skórkę KOLUMNY (host nadpisuje przez klik w board; czat nie pokazuje kolumn)
const curSkin = ()=> mpIsSalonHost() ? 'kolumny' : mpSkin();

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
      <div class="pcz-hd-r1"><span class="pcz-exit" onclick="mpRoomBack()">${ic('back')} wyjdź</span><span class="pcz-lbl">KOD POKOJU</span></div>
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
    S.revealSnap={ reveal:g.reveal, head, isLast:(g.si>=g.slots.length-1 && g.qi>=QPC-1) };
    S.advCount=0; S.advTotal=mpPlayers().length;   // salon: świeży licznik „dalej" graczy na nową odsłonę
    if(g.reveal.teamOk || g.reveal.pewniakWin){ confetti(); playClap(); }   // drużyna trafiła → confetti + oklaski
  }
  // wejście sceny na ZMIANĘ klucza (nie przy re-renderze): INTRO fazy (duża ikona) tam gdzie jest meta,
  // inaczej zwykłe płynne animIn. Wynik (DONE) ma własny „juice" — bez intra.
  const scene=mpSceneKey(g);
  if(scene!==S.lastView){ S.lastView=scene;
    let reduce=false; try{ reduce=matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_e){}
    const meta=mpPhaseIntroMeta(g);
    if(meta && !reduce){ mpPlayPhaseIntro(st, meta); }
    else { S.introUntil=0; if(!(g && g.phase===MP.DONE)) animIn(st); }   // bez intra → faza startuje od razu
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

// loader „Beat & Beka" (3 kropki) — lokalny string (NIE współdzielony import: kruchy przy stale-cache).
const bbLoader = `<div class="bb-loader"><i></i><i></i><i></i></div>`;
const mpRenderLoading = (head)=> `${head}<div class="mp-deck">${bbLoader}<div class="mp-state">host losuje utwór…</div></div>`;
const mpRosterStrip = (g)=> `<div class="mp-roster">${mpRosterHTML(g||S.game||{})}</div>`;
const mpRenderArming = (g, head)=>{
  const rc=g.readyCount||0, rt=g.readyTotal||mpMembers().length;
  return `${head}${mpRosterStrip(g)}<div class="mp-deck">${bbLoader}<div class="mp-state">czekamy aż wszyscy będą gotowi… <b>${rc}/${rt}</b></div><div class="mp-state" style="opacity:.7">pytanie ruszy równo u wszystkich</div></div>${mpReactsBarHTML()}`;
};
// klient już kliknął „dalej" i czeka, aż reszta też przejdzie do następnego pytania
const mpRenderWaitNext = (head)=>{
  const rc=(S.game&&S.game.readyCount)||0, rt=(S.game&&S.game.readyTotal)||mpMembers().length;
  return `${head}${mpRosterStrip()}<div class="mp-deck"><div class="mp-state">✓ idziesz dalej… <b>${rc}/${rt}</b> gotowych</div><div class="mp-state" style="opacity:.7">następne pytanie ruszy, gdy wszyscy przejdą dalej</div></div>${mpReactsBarHTML()}`;
};
const mpRenderNetErr = (g, head)=>{
  const msg = g.netReason==='empty' ? 'Brak zajawek dla tej kategorii — spróbuj ponownie albo zmień kategorię.' : 'Brak połączenia z iTunes (limit zapytań albo blokada sieci). Odczekaj minutę i spróbuj ponownie.';
  return `${head}<div class="mp-deck"><div class="mp-state" style="color:var(--red)">${msg} ${S.host?'<br><button class="mp-btn ghost" onclick="mpHostNewRound()">spróbuj ponownie</button>':''}</div></div>`;
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
  if(curSkin()==='czat'){   // design 08: kompaktowe pigułki „stół: [awatar status]"
    return `<span class="mp-stol">stół:</span>`+mpPlayers().map(m=>{
      const st=rosterState(g,m.id,S.typingSet), me=ROSTER_META[st]||ROSTER_META.idle;
      const av=escapeHtml((m.name||'?').slice(0,1).toUpperCase());
      return `<span class="mp-rchip${me.dim?' dim':''}${m.id===mpMe.id?' you':''}"><b style="background:${me.bg};color:${me.fg}">${av}</b><span style="color:${me.lc}">${me.lab}</span></span>`;
    }).join('');
  }
  return mpPlayers().map(m=>{
    const st=rosterState(g,m.id,S.typingSet), me=ROSTER_META[st]||ROSTER_META.idle;
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
  const ro=mpIsSalonHost();   // TV-sędzia: może KLIKNĄĆ propozycję (nadpisuje górkę głosów), ale nie dorzuca własnych typów
  return `<div class="mp-slots">${slots.map(s=>{
    const cands=candidatesForSlot(g, s.key);
    const myVal=myVoteForSlot(g, s.key, mpMe.id);
    const rows = cands.map((c,i)=>{
      const isTop=i===0 && c.votes.length>0;
      const voted = myVal && norm(myVal)===norm(c.value);   // salon: podświetla wybór hosta (nadpisanie)
      const dots = c.votes.slice(0,5).map((v,j)=>`<b class="mp-vdot" style="background:${VOTE_COLORS[j%VOTE_COLORS.length]}"></b>`).join('');
      const tag = c.tag==='sure'?' <span class="mp-ctag s">🟡</span>':(c.tag==='unsure'?' <span class="mp-ctag u">🟣</span>':'');
      return `<div class="mp-cand${isTop?' is-top':''}${voted?' voted':''}" data-v="${escapeHtml(c.value)}" onclick="mpVote('${s.key}', this.dataset.v)">
        <span class="cv">${escapeHtml(c.value)}${tag}</span>
        <span class="crow"><span class="up">▲ ${c.votes.length}</span><span class="dots">${dots}</span>${isTop?'<span class="topb">TOP</span>':''}</span>
      </div>`;
    }).join('') || (ro?`<div class="mp-cand empty"><span class="cv" style="opacity:.5">— czekamy na typy z telefonów —</span></div>`:'');
    const addTyp = ro?'':`<div class="mp-addtyp" onclick="mpFocusTyp('${s.key}')">+ dorzuć typ…</div>`;
    return `<div class="mp-slotcol"><div class="mp-slot-h">${escapeHtml(s.label)}</div>${rows}${addTyp}</div>`;
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
  const lock = S.host ? `<button class="mp-lockmini" onclick="mpLock()" title="Zatwierdź odpowiedź drużyny" aria-label="Zatwierdź odpowiedź drużyny">✓</button>` : '';
  const cls = curSkin()==='czat' ? 'mp-teamc' : 'mp-teamd';
  return `<div class="${cls}"><span class="ic">${ic('target')}</span><span class="tx"><span class="l">ODPOWIEDŹ DRUŻYNY</span><span class="v">${val}</span></span>${badge}${lock}</div>`;
}
// wybór pewności typu (zwykła/niepewny/pewniak) + „pas" — jeden wiersz, bez dubli na dole.
// pewniak = typ z conf=sure (×2), niepewny = fiolet, pas = toggle „nic już nie dodam".
// Stan kto pewniakuje / spasował widać na pasku osób (roster), więc tu bez list imion.
function mpConfHTML(withPass=true){
  const seg=(v,label,cls,flex)=>`<button class="mp-seg ${cls}${S.conf===v?' on':''}" style="flex:${flex}" onclick="mpSetConf('${v}')">${label}</button>`;
  const iPassed = S.game && (S.game.passed||[]).some(p=>p.id===mpMe.id);
  const pass = withPass ? `<button class="mp-seg p${iPassed?' on':''}" style="flex:.9" onclick="mpSend({type:'pass'})">✋ pas</button>` : '';
  return `${seg('normal','zwykła','',1)}${seg('unsure','🟣 niepewny','u',1.2)}${seg('sure','🟡 PEWNIAK ×2','s',1.5)}${pass}`;
}
// przełącznik skórki (A/B): per-klient, czysty render nad tym samym stanem
const mpHr = ()=> `<div class="mp-hr"></div>`;
// czas fazy „słuchaj" — z kategorii (cat.listenSecs) albo domyślnie wg trybu (core/timing.js)
function mpListenSecs(g){
  const cat=ALL_CATS[g.catKey];
  return _listenSecs(g.mode, cat && cat.listenSecs);
}
const mpKnobHTML = (id='mpKnob', cls='mp-knob')=> `<button class="${cls}" id="${id}" onclick="mpKnobTap()" aria-label="Odtwórz / pauza"><svg id="mpKnobIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>`;
const mpLockBtnHTML = (ghost)=> S.host ? `<button class="mp-btn${ghost?' ghost':''}" style="width:100%;margin-top:6px" onclick="mpLock()">Zatwierdź odpowiedź drużyny ✓</button>` : '';
const mpLyricHTML = (g)=> g.mode==='lektor'&&g.lyric ? `<div class="lyric-box"><span class="lyric-cap">tekst — zgadnij tytuł i wykonawcę</span>${escapeHtml(g.lyric)}</div>` : '';
// wiedza ogólna: treść pytania w tym samym pudełku co tekst lektora
const mpPromptHTML = (g)=> g.mode==='quiz'&&g.prompt ? `<div class="lyric-box quiz"><span class="lyric-cap">pytanie</span>${escapeHtml(g.prompt)}</div>` : '';
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
// pasek faz (rail, design): duże węzły, done=✓ zielony, aktywny=poświata, segmenty
// pasek faz USUNIĘTY z widoków (zaśmiecał) — zastąpiony animowanym INTRO fazy (mpPlayPhaseIntro).
// Zwraca '' żeby nie ruszać miejsc wywołania (play/odsłona).
function mpRailHTML(_active){ return ''; }
// efektywna pod-faza: na NOWE pytanie (zmiana playNonce) mpRenderPlay ustawi S.sub='sluchaj' dopiero
// PO mpOnEnter — więc klucz sceny i intro liczą sub z wyprzedzeniem (inaczej zły label / podwójne intro).
function mpEffSub(g){ return (g && S.playRound!==g.playNonce) ? 'sluchaj' : S.sub; }
// ikona + etykieta dla intra danej fazy (albo null = bez intra: picker/poczekalnia/ładowanie/wynik)
function mpPhaseIntroMeta(g){
  if(!g || g.phase==null) return null;
  if(mpRevealPending()) return { icon:ic('eye'), label:'Odsłona' };
  if(g.phase===MP.PLAY){
    if(mpEffSub(g)==='sluchaj'){
      if(g.mode==='quiz')   return { icon:ic('question'),   label:'Pytanie' };
      if(g.mode==='lektor') return { icon:ic('book'),       label:'Czytaj' };
      return { icon:ic('headphones'), label:'Słuchaj' };
    }
    return { icon:ic('brain'), label:'Kombinujcie' };
  }
  return null;
}
// INTRO fazy: duża ikona na środku (pop → zmniejsza się i fade do 0), w tym czasie treść ukryta
// (nie zakryta białym ekranem — opacity 0), potem elementy wchodzą ze staggerem („oddech").
// czas intra (ms) do ODSŁONIĘCIA treści: ikona wchodzi → ~2 s PAUZY → wychodzi (CSS 2.74s). CAŁA faza
// (audio + timer w mpAfterSync) startuje dopiero wtedy (S.introUntil) — nic nie rusza pod intrem.
// Seam testowy: window.__MP_INTRO_MS__ skraca/zeruje czas w jsdom (siatka nie czeka realnych 2 s).
const mpIntroRevealMs = ()=> (typeof window!=='undefined' && window.__MP_INTRO_MS__!=null) ? window.__MP_INTRO_MS__ : 2300;
let mpIntroTimers=[];
function mpPlayPhaseIntro(st, meta){
  mpIntroTimers.forEach(clearTimeout); mpIntroTimers=[];
  const reveal=mpIntroRevealMs();
  S.introUntil = Date.now() + reveal;   // synchronicznie — mpAfterSync wstrzyma start fazy do tego czasu
  requestAnimationFrame(()=>{
    st.classList.remove('mp-introdone'); st.classList.add('mp-introing');
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
    <div class="mp-team" id="mpTeam"></div>`;
}
// composer „@odp" (czat): po wpisaniu „@" pole morfuje w pola slotów (tytuł/wykonawca) z szarymi
// placeholderami — klikalne osobno. Pola flex:1 (bez stałych 42%) → brak przerwy na iOS Safari.
function mpComposerHTML(g){
  const slots=g.answerSlots||slotsFor();
  const chips=slots.map((s,i)=>`${i?'<span class="mp-sep">,</span>':''}<input id="mpTyp_${s.key}" class="mp-slotchip" placeholder="${escapeHtml(s.label)}" oninput="mpTypingPing()" onkeydown="if(event.key==='Enter')mpComposerSend()">`).join('');
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
function mpHeaderHTML(g){
  const MODE={music:ic('music')+' muzyka',lektor:ic('mic')+' lektor',reverse:ic('reverse')+' od tyłu',snippet:ic('scissors')+' fragment'};
  return `<div class="mp-hd">
    <div class="mp-hd-r1">
      <span class="mp-hd-back" onclick="mpRoomBack()">${ic('back')}</span>
      <span class="mp-hd-title">Runda ${g.round||1} · 🍺 ${escapeHtml(S.code||'')}</span>
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

// FAZA „słuchaj" — JEDYNE miejsce z audio + pasek odliczania czasu fazy (wspólna).
// QUIZ: bez audio/gałki — pokaż treść pytania i przejdź do odpowiadania.
function mpSluchajBodyHTML(g){
  if(g.mode==='quiz'){
    return `${mpPromptHTML(g)}
      <button class="mp-btn ghost" style="width:100%;margin-top:8px" onclick="mpGoKombinuj()">odpowiadamy →</button>
      <div class="mp-foot">${mpHr()}${mpReactsBarHTML()}</div>`;
  }
  return `<div class="mp-deck">${mpKnobHTML()}
      <div class="mp-state" id="mpPlayStatus">${g.mode==='lektor'?'lektor czyta':'posłuchaj uważnie'} · stuknij, by powtórzyć</div>
      <div class="mp-listenbar" id="mpListenBar"><i></i></div></div>
    ${mpLyricHTML(g)}
    <button class="mp-btn ghost" style="width:100%;margin-top:8px" onclick="mpGoKombinuj()">gotowe, kombinujemy →</button>
    <div class="mp-foot">${mpHr()}${mpReactsBarHTML()}</div>`;
}
// FAZA „kombinuj" — widok KOLUMNOWY (bez audio; quiz pokazuje pytanie na górze).
// Kolejność: profile ─ odpowiedź drużyny ─ kolumny ─ [dół: input+wrzuć ─ pewność ─ emotki].
// SALON (TV): bez pól wpisywania/pewności/emotek — host nadpisuje odpowiedź klikiem w kolumny.
function mpKombinujKolumnyHTML(g){
  const foot = mpIsSalonHost()
    ? (g.mode==='quiz' ? `<div class="mp-foot">${mpHr()}${mpPromptHTML(g)}</div>` : '')
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
    <div class="mp-chatfeed" id="mpChatFeed"></div>
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
  // skórka KOLUMNOWA, faza „kombinuj": własna kolejność (odpowiedź drużyny → profile → kolumny → input);
  // roster jest WEWNĄTRZ ciała, nie w „top" — dlatego osobna gałąź.
  if(S.sub!=='sluchaj' && skin!=='czat') return `<div class="mp-play">${head}${rail}${mpKombinujKolumnyHTML(g)}</div>`;
  const top=`${head}${rail}<div class="mp-roster${skin==='czat'?' mp-roster-nb':''}" id="mpRoster"></div>`;
  const body=S.sub==='sluchaj' ? mpSluchajBodyHTML(g) : mpKombinujCzatHTML(g);
  return `<div class="mp-play">${top}${body}</div>`;
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
  }
  mpRefreshDynamic(g);
  mpTickTimer();
}

// baner wyniku rundy (wspólny: muzyka + quiz) — pewniak/trafienie/pudło
function mpRevealBanner(r){
  if(r.pewniakWin) return `<div class="rv-banner win"><span class="ic">🟡</span><span class="tx"><b>PEWNIAK trafiony!</b><small>${(r.pewniacy||[]).map(escapeHtml).join(', ')} — podwójne punkty</small></span><span class="pts">+${r.gained}</span></div>`;
  if(r.pewniakLose) return `<div class="rv-banner lose"><span class="ic">🍺</span><span class="tx"><b>Pewniak przepalony</b><small>stawia: ${(r.pewniacy||[]).map(escapeHtml).join(', ')} — odbiór na żywo 😏</small></span></div>`;
  if(r.teamOk) return `<div class="rv-banner ok"><span class="ic">✓</span><span class="tx"><b>Drużyna trafiła!</b><small>${r.firstBy?'pierwszy: '+escapeHtml(r.firstBy):'+'+r.gained+' pkt'}</small></span><span class="pts">+${r.gained}</span></div>`;
  return `<div class="rv-banner no"><span class="ic">✗</span><span class="tx"><b>Tym razem nie</b><small>0 pkt</small></span></div>`;
}
// przycisk „dalej" na odsłonie. SALON-host (TV): nie gra → pokaż ile GRACZY kliknęło „dalej"
// (TV przejdzie samo, gdy wszyscy) + przycisk = ręczny „pomiń czekanie".
function mpRevealNextHTML(last){
  if(mpIsSalonHost()){
    const c=S.advCount||0, t=S.advTotal||mpPlayers().length||0;
    return `<div class="mp-state" style="text-align:center;margin-top:6px">✓ ${c}/${t} graczy kliknęło „dalej"</div>
      <button class="mp-next ghost" onclick="mpAdvance()">${last?'WYNIK KOŃCOWY →':'pomiń czekanie ›'}</button>`;
  }
  return `<button class="mp-next" onclick="mpAdvance()">${last?'WYNIK KOŃCOWY →':'NASTĘPNE PYTANIE ›'}</button>`;
}
// odsłona rundy (design): rail + zielona karta utworu + baner pewniaka + odpowiedź drużyny
function mpRenderRevealCard(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  if(r.kind==='quiz') return mpRenderQuizReveal(snap);
  const cover = r.art?`<img class="rv-cover" src="${r.art}" referrerpolicy="no-referrer">`:`<div class="rv-cover ph">${ic('disc')}</div>`;
  const meta=[r.album,r.year].filter(Boolean).join(' · ');
  const slot=(ok,lab,val)=>`<div class="rv-slot"><span class="k">${lab}</span><span class="v">${escapeHtml(val||'—')}</span><span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span></div>`;
  return `${head}${mpRailHTML('odslona')}${mpRosterStrip()}${mpHr()}
    <div class="rv-card">
      <div class="rv-track">${cover}<div class="rv-info"><span class="t">${escapeHtml(r.track)}</span><span class="a">${escapeHtml(r.artist)}</span>${meta?`<span class="m">${escapeHtml(meta)}</span>`:''}</div></div>
      ${slot(r.okTitle,'TYTUŁ',r.track)}${slot(r.okArtist,'WYK.',r.artist)}
    </div>
    ${mpRevealBanner(r)}
    <div class="rv-locked">odpowiedź drużyny: „${escapeHtml(r.locked.title||'—')} · ${escapeHtml(r.locked.artist||'—')}"</div>
    ${mpReactsBarHTML()}
    ${mpRevealNextHTML(last)}`;
}
// odsłona QUIZU: pytanie + per slot poprawne warianty (✓/✗) + odpowiedź drużyny (bez okładki/roku)
function mpRenderQuizReveal(snap){
  const r=snap.reveal, head=snap.head, last=snap.isLast;
  const isMC=/\nA\)/.test(r.prompt||'');   // pytanie ABCD: opcje w treści, jeden slot „litera lub odpowiedź"
  const rows=(r.slots||[]).map(s=>{
    const ok=!!(r.okBySlot&&r.okBySlot[s.key]);
    const variants=(r.answers&&r.answers[s.key])||[];
    // ABCD: pokaż poprawną opcję zwięźle „A) Tekst" (zamiast wszystkich wariantów); bez zbędnego labelu po lewej
    const correct = isMC ? escapeHtml((variants[0]||'')+(variants[1]?') '+variants[1]:'')) : (variants.map(escapeHtml).join(' / ')||'—');
    const team=(r.locked&&r.locked[s.key])||'';
    const kLabel = isMC ? '' : `<span class="k">${escapeHtml((s.label||s.key).toUpperCase())}</span>`;
    return `<div class="rv-slot${isMC?' mc':''}">${kLabel}
      <span class="v">${correct}${team?`<small class="rv-team">drużyna: „${escapeHtml(team)}"</small>`:''}</span>
      <span class="mk ${ok?'ok':'no'}">${ok?'✓':'✗'}</span></div>`;
  }).join('');
  return `${head}${mpRailHTML('odslona')}${mpRosterStrip()}${mpHr()}
    <div class="rv-card quiz">
      <div class="rv-prompt">${escapeHtml(r.prompt||'')}</div>
      ${rows}
    </div>
    ${mpRevealBanner(r)}
    ${mpReactsBarHTML()}
    ${mpRevealNextHTML(last)}`;
}

// JUICE: licznik punktów bije od 0 do wyniku (ease-out). Jednorazowo per wynik — dataset na #mpStage
// przeżywa re-render (innerHTML się zmienia, element nie), więc nie restartuje przy każdym mpRender.
function mpJuiceScore(g){
  const stage=$m('mpStage'); const el=stage&&stage.querySelector('.dn-hero .sc'); if(!el) return;
  const target=String(g.score||0);
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
    return `<div class="wk-row"><span class="rk">${i+1}</span><b class="av" style="background:${col}">${av}</b><span class="nm">${escapeHtml(t.name)}</span><span class="bar"><i style="width:${pct}%;background:${i===0?'var(--green)':(t.correct?'var(--blue)':'var(--red)')}"></i></span><span class="pts">${t.correct}</span></div>`;
  }).join('')||'<div class="mp-state">brak trafnych typów</div>';
  const mvp = g.mvp?`<div class="dn-mvp"><span class="av" style="background:${mpAvatarColor(g.mvp.name)}">${escapeHtml((g.mvp.name||'?').slice(0,1).toUpperCase())}</span><span class="tx"><span class="l">⭐ MVP STOŁU</span><b>${escapeHtml(g.mvp.name)}</b><small>${g.mvp.correct} trafnych typów</small></span></div>`:'';
  const beer=Object.entries(g.beerTally||{}).sort((a,b)=>b[1]-a[1]);
  const stawia = beer.length?`<div class="dn-stawia"><span class="ic">🍺</span><span class="tx"><span class="l">STAWIA KOLEJKĘ</span><b>${beer.map(([n,c])=>escapeHtml(n)+(c>1?` (${c}×)`:'')).join(', ')}</b><small>przepalone pewniaki 🟡💥</small></span></div>`:'';
  return `<div class="dn-hero"><div class="ic">🏆</div><div class="t">Mecz zakończony!</div><div class="s">wynik drużyny</div><div class="sc">${g.score}</div></div>
    ${mvp}${stawia}
    <div class="dn-lbl">Wkład drużyny</div>
    <div class="dn-wk">${rows}</div>
    <div class="dn-btns"><button class="dn-menu" onclick="mpExitMenu()">${ic('back')} menu</button>${S.host?'<button class="dn-again" onclick="mpNewGame()">REWANŻ 🔁</button>':'<div class="dn-wait">host zaczyna rewanż</div>'}</div>`;
}

// most do HTML: mpFocusTyp żyje w onclick="" generowanym tutaj → musi być na window
Object.assign(window, { mpFocusTyp });

export { mpRender, mpRosterHTML, mpChatFeedHTML, mpConfHTML, mpStartListenWindow, mpAvatarColor };
