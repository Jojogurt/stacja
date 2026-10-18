/* app/mp-picker.js — host-picker MP („Nowy mecz"): ten sam komponent co solo (app/matchSetup.js) + ustawienia
 * pokoju (timer, format Wspólna/Solo/Drużyny z przydziałem, tryb salonowy/TV, „dźwięk tylko u hosta") w sekcji
 * „Ustawienia meczu". Stan pickera zamknięty w module (czytany przez mpStart w mp.js; Sety mutowane W MIEJSCU).
 * mpRender wstrzykiwany (initMpPicker) — re-render po zmianie wyboru bez cyklu z mp.js. Każda zmiana konfiguracji
 * woła `onDraft` (mp.js rozsyła gościom szkic „Mecz, który ustawia host" — na żywo). */
import { ALL_CATS, randomPools, plFetch } from './catalog.js';
import { MP_MODES, DEFAULT_QUESTIONS } from '../core/match.js';
import { MP_TIMER_OPTIONS } from '../core/timing.js';
import { escapeHtml } from '../core/util.js';
import { settingsSummary } from '../core/matchSetup.js';
import { teamColor } from '../core/teams.js';
import { createMatchSetup } from './matchSetup.js';
import { ic } from './icons.js';
import { TABLE_KEY, TABLE_LABEL, TABLE_MIN_SONGS } from '../core/tasteCompare.js';
import { tableOptionState } from '../core/mpView.js';   // relay: „Gust stołu" ukryty z notką   // gust etap 3: „🎧 Gust stołu"
import { S } from './mp-state.js';   // P2-2: kod pokoju w pasku „Nowego meczu"
import { plural } from '../core/mpView.js';

let mpRender = () => {};                 // wstrzykiwany przez mp.js (re-render widoku pokoju)
let mpGetPlayers = () => [];             // [{id,name}] obecni gracze (z mp.js) — do przypisania do drużyn
let mpGetModes = () => MP_MODES;         // F8a: tryby dostępne w tym pokoju (relay: wszystkie MP; autorytet: znane serwerowi)
let mpOnDraft = () => {};                // zmiana konfiguracji → mp.js rozsyła szkic gościom (debounce + limit po stronie serwera)
let mpGetTable = () => ({ cap:false, players:0, withShelf:0, songs:0 });   // gust etap 3: capability + licznik półek (mp.js)
let mpAvColor = () => '#888';            // P2-2: kolor awatara (mp-render.mpAvatarColor — wstrzykiwany, bez cyklu)
export function initMpPicker(render, getPlayers, getModes, onDraft, getTable, avColor){ mpRender = render; if(getPlayers) mpGetPlayers = getPlayers; if(getModes) mpGetModes = getModes; if(onDraft) mpOnDraft = onDraft; if(getTable) mpGetTable = getTable; if(avColor) mpAvColor = avColor; }
/* gust etap 3: „🎧 Gust stołu" — kategoria-ZAŚLEPKA w ALL_CATS (walidacja wyboru/trybów po stronie hosta jak dla playlisty
 * z rokiem). Prawdziwą pulę składa serwer z półek graczy przy starcie (mpBuildPools wysyła tylko znacznik `table`).
 * Poza ALL_KEYS i grupami kategorii → nie trafia do losowania, wyszukiwarki ani solo. W komponencie „Nowy mecz" to
 * karta w zakładce „Twoje" (mpTableHTML); ukryta bez capability `tableTaste`, nieaktywna < TABLE_MIN_SONGS utworów. */
ALL_CATS[TABLE_KEY] = { label:TABLE_LABEL, kind:'playlist', table:true,
  songs:Array.from({ length:TABLE_MIN_SONGS }, (_,i)=>({ title:'?', artist:'gracz '+(i+1), year:'2000' })) };
// wytnij stół z wyboru, gdy pokój go nie obsłuży (brak capability / za mało utworów) — przed KAŻDYM renderem pickera
function mpTablePrune(){
  const t=mpGetTable()||{};
  const ok=!!t.cap && (t.songs|0)>=TABLE_MIN_SONGS;
  if(!ok) mpPickCats.delete(TABLE_KEY);
  return t;
}
function mpTableHTML(){
  const t=mpTablePrune();
  if(!t.cap){ const st=tableOptionState(t); return st.note ? `<p class="ms-gnote um-table-hint" data-mp-table-off>${escapeHtml(st.note)}</p>` : ''; }   // stary serwer → ukryta; relay → ukryta z notką
  const okN=(t.songs|0)>=TABLE_MIN_SONGS;
  const on=mpPickCats.has(TABLE_KEY);
  const sub=`półki od ${t.withShelf|0}/${t.players|0} graczy · ${t.songs|0} utw.`;
  const hint=okN ? 'pula z ❤️ graczy w pokoju — w odsłonie zobaczycie, czyja to półka'
    : `potrzeba min. ${TABLE_MIN_SONGS} utworów z półek (gracze z ≥ 5 ❤️, gust nieukryty)`;
  return `<div class="um-table"><button type="button" class="ms-cat ms-table${on?' on':''}" data-ms-cat="${TABLE_KEY}" data-mp-table${okN?'':' disabled aria-disabled="true"'} aria-pressed="${on?'true':'false'}"><b>${escapeHtml(TABLE_LABEL)}</b><small data-mp-table-n>${escapeHtml(sub)}</small></button>
    <p class="ms-gnote um-table-hint">${escapeHtml(hint)}</p></div>`;
}
// F8a: dostępne tryby + wytnij z wyboru te, których pokój nie obsłuży (np. stary serwer nie zna 'abcd'/'year')
function mpAvailModes(){ const av=mpGetModes()||MP_MODES; [...mpPickModes].forEach(m=>{ if(m!=='quiz' && !av.includes(m)) mpPickModes.delete(m); }); return av; }

const mpPick={ cats:new Set(), modes:new Set(['music']), questions:DEFAULT_QUESTIONS, preset:null };
const mpPickCats=mpPick.cats, mpPickModes=mpPick.modes;   // żywe referencje dla mp.js (mutowane w miejscu)
let mpPickQuestions=DEFAULT_QUESTIONS, mpPickTimer=60;   // F6a: długość w pytaniach (lustro mpPick.questions dla mp.js)
let mpPickSalon=false;   // tryb salonowy: TEN ekran tylko prowadzi i gra muzykę (TV), telefony = kontrolery
let mpPickFormat='coop'; // format meczu: 'coop' (jedna drużyna) | 'solo' (każdy sam) | 'teams' (podział)
// F6b (tryb #6 „Jeden głośnik"): zajawka/lektor tylko u hosta (pub: jeden telefon/głośnik na stół).
// W salonie zawsze włączone (TV gra muzykę, telefony to piloty) — przełącznik pokazuje stan, ale jest zablokowany.
let mpPickAudioHost=false;
const changedCfg=()=>{ mpOnDraft(); mpRender(); };
// F6b (#6): salon działa dla WSZYSTKICH formatów (TV w Solo/Drużynach pokazuje status drużyn bez ich odpowiedzi)
function mpSetFormat(v){ mpPickFormat=['coop','solo','teams'].includes(v)?v:'coop'; changedCfg(); }
function mpSetSalon(v){ mpPickSalon=!!v; changedCfg(); }
function mpSetAudioHost(v){ if(mpPickSalon) return; mpPickAudioHost=!!v; changedCfg(); }
// efektywna flaga do configu meczu (salon ⇒ zawsze audio tylko u hosta)
const mpPickAudioHostOnly = ()=> !!(mpPickAudioHost || mpPickSalon);

/* —— przypisanie graczy do drużyn (format 'teams') —— */
let mpPickTeamCount=2;                    // ile drużyn (2-4)
let mpPickAssign={};                      // playerId → indeks drużyny (0-based); brak = domyślnie round-robin
let mpPickTeamNames={};                   // indeks drużyny → własna nazwa (puste = „Drużyna i+1")
function mpSetTeamCount(n){ mpPickTeamCount=Math.max(2,Math.min(4,n)); mpRender(); }
function mpSetTeamName(i, name){ mpPickTeamNames[i]=name; }   // BEZ re-render — nie gubić focusa w polu
function mpBalance(){ mpPickAssign={}; mpRender(); }          // „równo": reset do round-robin (równy podział)
const mpTeamName=(i)=> ((mpPickTeamNames[i]||'').trim() || ('Drużyna '+(i+1)));
// drużyna gracza: jawne przypisanie albo domyślny round-robin po pozycji w pokoju (clamp do liczby drużyn)
function mpAssignOf(id){
  if(mpPickAssign[id]!=null) return mpPickAssign[id]%mpPickTeamCount;
  const idx=mpGetPlayers().findIndex(p=>p.id===id);
  return (idx<0?0:idx)%mpPickTeamCount;
}
function mpCycleAssign(id){ mpPickAssign[id]=(mpAssignOf(id)+1)%mpPickTeamCount; mpRender(); }
// złóż drużyny z bieżącego przypisania (puste drużyny pomijamy) — używane przez mpStart i walidację
function mpTeamsFromAssign(players){
  const ps=players||mpGetPlayers();
  const teams=Array.from({length:mpPickTeamCount},(_,i)=>({ id:'t'+i, name:mpTeamName(i), color:teamColor(i), members:[] }));
  ps.forEach(p=>{ const t=teams[mpAssignOf(p.id)]||teams[0]; t.members.push(p.id); });
  return teams.filter(t=>t.members.length);
}
let mpPlOpen=false, mpPlStatus='', mpPlStatusCls='';   // panel importu Spotify w zakładce „Twoje"
function mpPlToggle(){ mpPlOpen=!mpPlOpen; mpRender(); }
async function mpPlImport(){
  const inp=document.getElementById('mpPlUrl'); const url=(inp&&inp.value||'').trim();
  const st=document.getElementById('mpPlStatus');
  const setSt=(cls,txt)=>{ mpPlStatusCls=cls; mpPlStatus=txt; if(st){ st.className='pl-status '+cls; st.textContent=txt; } };
  if(!url){ setSt('err','Wklej link do playlisty Spotify.'); return; }
  setSt('','importuję…');
  try{
    const res=await plFetch(url);
    mpPlStatusCls='ok'; mpPlStatus='✓ '+res.name+' — '+res.count+' utw. Dodana.'; mpPlOpen=true;
    setup.setPick({ cats:[...mpPickCats, res.key] });
  }catch(e){ setSt('err','Nie udało się: '+(e.message||e)); }
}
function mpSetTimer(t){ mpPickTimer=MP_TIMER_OPTIONS.includes(+t)?+t:60; changedCfg(); }

// ustawienia pokoju w „Ustawieniach meczu" (po długości): timer, format (+ przydział drużyn), salon/TV, dźwięk
function teamsBad(){ return mpPickFormat==='teams' && mpTeamsFromAssign(mpGetPlayers()).length<2; }
// P0-9: salon — TV tylko prowadzi (mpGetPlayers już bez TV): coop/Solo ≥ 1 gracz na telefonie, Drużyny ≥ 2
function salonBad(){ return mpPickSalon && mpGetPlayers().length < (mpPickFormat==='teams' ? 2 : 1); }
/* P0-9: ustawienia POKOJU (salon, format, podział, dźwięk) nie przechodzą do NOWEGO pokoju — wołane przy wejściu do pokoju.
 * Kategorie/tryby/długość/timer zostają (to preferencje gracza, nie stołu). Rewanż w tym samym pokoju — bez resetu. */
function mpPickResetRoom(){ mpPickSalon=false; mpPickFormat='coop'; mpPickAudioHost=false; mpPickTeamCount=2; mpPickAssign={}; mpPickTeamNames={}; }
function mpSettingsHTML(){
  const timerBtns=MP_TIMER_OPTIONS.map(v=>`<button type="button" class="${mpPickTimer===v?'on':''}" aria-pressed="${mpPickTimer===v}" onclick="mpSetTimer(${v})">${v?v+' s':'bez'}</button>`).join('');
  // format meczu: jak punktujemy (jedna drużyna / każdy sam / podział na drużyny).
  const fmtBtns=[['coop','Wspólna'],['solo','Solo'],['teams','Drużyny']].map(([v,l])=>
    `<button type="button" class="${mpPickFormat===v?'on':''}" aria-pressed="${mpPickFormat===v}" onclick="mpSetFormat('${v}')">${l}</button>`).join('');
  const fmtNote = mpPickFormat==='solo' ? 'każdy gra sam (ranking)' : mpPickFormat==='teams' ? 'podział na drużyny' : 'gracie jako jedna drużyna';
  // sekcja przypisania (format 'teams'): liczba drużyn + chipy graczy (tknięcie = zmiana drużyny)
  let assignSec='';
  if(mpPickFormat==='teams'){
    const players=mpGetPlayers();
    const tcBtns=[2,3,4].map(n=>`<button type="button" class="${mpPickTeamCount===n?'on':''}" aria-pressed="${mpPickTeamCount===n}" onclick="mpSetTeamCount(${n})">${n}</button>`).join('');
    // pola nazw drużyn (oninput BEZ re-render → focus nie ucieka); kolor = kolor drużyny
    const nameInputs=Array.from({length:mpPickTeamCount},(_,i)=>
      `<input class="um-tname" style="border-color:${teamColor(i)}" maxlength="14" aria-label="Nazwa drużyny ${i+1}" value="${escapeHtml(mpPickTeamNames[i]||'')}" placeholder="Drużyna ${i+1}" oninput="mpSetTeamName(${i}, this.value)">`).join('');
    const chips = players.length ? players.map(p=>{
      const ti=mpAssignOf(p.id), col=teamColor(ti), av=escapeHtml((p.name||'?').slice(0,1).toUpperCase());
      return `<button type="button" class="um-assign-chip" style="border-color:${col}" data-pid="${escapeHtml(p.id)}" onclick="mpCycleAssign(this.dataset.pid)" aria-label="${escapeHtml(p.name||'gracz')} — drużyna ${ti+1}, zmień"><b style="background:${col}">${av}</b><span>${escapeHtml(p.name||'gracz')}</span><i style="background:${col}">D${ti+1}</i></button>`;
    }).join('') : `<div class="um-assign-empty">czekamy na graczy w pokoju…</div>`;
    assignSec=`<div class="ms-sub">Drużyny <span class="ms-sub-note">tknij gracza = zmień drużynę</span></div>
        <div class="um-teamrow"><div class="um-rounds ms-seg" role="group" aria-label="Liczba drużyn">${tcBtns}</div><button type="button" class="um-balance" onclick="mpBalance()">⚖️ równo</button></div>
        <div class="um-tnames">${nameInputs}</div>
        <div class="um-assign">${chips}</div>`;
  }
  return `<div class="ms-sub">Czas na odpowiedź</div><div class="um-rounds ms-seg" role="group" aria-label="Czas na odpowiedź">${timerBtns}</div>
      <div class="ms-sub">Format <span class="ms-sub-note">${fmtNote}</span></div><div class="um-rounds ms-seg" role="group" aria-label="Format meczu">${fmtBtns}</div>
      ${assignSec}
      <div class="um-salon"><button type="button" class="um-salon-toggle${mpPickSalon?' on':''}" onclick="mpSetSalon(${mpPickSalon?'false':'true'})" role="switch" aria-checked="${mpPickSalon}">
          <span class="um-salon-tx"><b>${ic('tv')} Tryb salonowy (TV)</b><small>${mpPickFormat==='coop'?'ten ekran tylko prowadzi i gra muzykę — gracze na telefonach':'ten ekran prowadzi, gra muzykę i pokazuje ranking — drużyny grają na telefonach'}</small></span>
          <span class="um-salon-sw"><i></i></span>
        </button>
        <button type="button" class="um-salon-toggle um-audiohost${mpPickAudioHostOnly()?' on':''}"${mpPickSalon?' disabled aria-disabled="true"':''} onclick="mpSetAudioHost(${mpPickAudioHost?'false':'true'})" role="switch" aria-checked="${mpPickAudioHostOnly()}">
          <span class="um-salon-tx"><b>🔈 Dźwięk tylko u hosta</b><small>${mpPickSalon?'w trybie salonowym muzyka gra zawsze tylko na TV':'jeden głośnik na stół — telefony graczy nie grają zajawki ani lektora'}</small></span>
          <span class="um-salon-sw"><i></i></span>
        </button>
        ${mpPickSalon?`<button type="button" class="um-tvlobby" onclick="mpLobbyBack()">📺 Pokaż lobby na TV <small>duży kod pokoju + QR, gracze na żywo, START</small></button>`:''}</div>`;
}
// zakładka „Twoje": import playlisty Spotify (własne kategorie z edytora tworzy się w solo — tu też widoczne)
function mpTwojeHTML(){
  return mpTableHTML()+`<div class="ms-twoje-btns"><button type="button" class="ms-add" onclick="mpPlToggle()" aria-expanded="${mpPlOpen}" aria-controls="mpPlPanel">+ ze Spotify</button></div>`+
    `<div class="pl-panel${mpPlOpen?' show':''}" id="mpPlPanel"><input id="mpPlUrl" autocomplete="off" aria-label="Link do publicznej playlisty Spotify" placeholder="wklej link do publicznej playlisty Spotify" onkeydown="if(event.key==='Enter')mpPlImport()"><button type="button" onclick="mpPlImport()">Importuj</button><div class="pl-status ${mpPlStatusCls}" id="mpPlStatus" role="status">${escapeHtml(mpPlStatus)}</div></div>`;
}

const setup=createMatchSetup({
  ctx:'mp', pick:mpPick,
  ids:{ start:'mpMatchStart', dice:'mpMatchRandom', info:'mpMatchInfo' },
  available:()=>mpAvailModes(),
  render:()=>mpRender(),
  onChange:()=>{ mpPickQuestions=mpPick.questions; mpOnDraft(); },
  onStart:()=>{ if(typeof window!=='undefined' && window.mpStart) window.mpStart(); },
  onDice:()=>mpRandomPick(),
  settingsSummary:()=>settingsSummary({ ctx:'mp', questions:mpPick.questions, format:mpPickFormat, timer:mpPickTimer, salon:mpPickSalon }),
  settingsHTML:mpSettingsHTML,
  twojeHTML:mpTwojeHTML,
  gate:()=> mpGate(),
});
function mpGate(){
  return teamsBad() ? { text:'Podziel graczy na min. 2 drużyny (potrzeba ≥2 graczy w pokoju'+(mpPickSalon?' poza TV).':').') }
    : salonBad() ? { text: mpPickFormat==='teams' ? 'Tryb salonowy: TV tylko prowadzi — do Drużyn potrzeba min. 2 graczy na telefonach.'
      : 'Tryb salonowy: TV tylko prowadzi — potrzeba min. 1 gracza na telefonie.' } : null;
}
/* P1-16: lobby na TV — czy mecz da się wystartować prosto z lobby (wybór kategorii/trybów + bramki salonu/drużyn) */
function mpPickGate(){
  const g=mpGate();   // bramki stołu (salon/drużyny) najpierw — podsumowanie komponentu i tak jest „nie ok", gdy bramka stoi
  if(g) return { ok:false, text:g.text };
  let ok=false; try{ ok=!!setup.summary().ok; }catch(_e){}
  return ok ? { ok:true, text:'' } : { ok:false, text:'Najpierw ustaw mecz — kategorie i tryby (⚙ ustawienia).' };
}
// delegacja kliknięć komponentu: jeden listener na #mpStage (przeżywa re-render innerHTML; klucze kategorii
// tylko w data-ms-cat — nigdy w inline JS, F2b)
(function wireDelegation(){ const st=(typeof document!=='undefined') && document.getElementById('mpStage'); if(st) setup.bind(st); })();
function mpToggleCat(k){ setup.toggleCat(k); }
function mpToggleMode(m){ setup.toggleMode(m); }
function mpToggleGrp(g){ setup.setTab(g); }   // dawne „chipy-grupy" → zakładka grupy
function mpSetQuestions(q){ setup.setQuestions(q); }
// szkic dla gości: wybór + ustawienia pokoju (sanityzowany po obu stronach: core/matchSetup.sanitizeDraft)
// P1-17: „Jeszcze raz — te same ustawienia" — czy bieżąca konfiguracja pickera da się wystartować (wybór + bramki)
function mpPickReady(){ try{ return !!setup.summary().ok; }catch(_e){ return false; } }
function mpDraft(){ return { ...setup.draft(), timer:mpPickTimer, format:mpPickFormat, salon:mpPickSalon, audioHostOnly:mpPickAudioHostOnly() }; }
/* P2-2: host w „Nowym meczu" widzi stół — kod pokoju + awatary graczy (na żywo, presence) + „Udostępnij";
 * dawniej musiał wracać do poczekalni, żeby sprawdzić, czy ktoś doszedł. */
function mpPickRoomHTML(){
  if(!S.code) return '';
  const ps=mpGetPlayers(), shown=ps.slice(0, 6), more=ps.length-shown.length;
  const avs=shown.map(p=>{ const nm=p.name||'?'; return `<b class="mp-pkr-av${p.ready?' ready':''}" style="background:${mpAvColor(nm)}" title="${escapeHtml(nm)}${p.ready?' — gotowy':''}">${escapeHtml(nm.slice(0,1).toUpperCase())}</b>`; }).join('')+(more>0?`<b class="mp-pkr-av more">+${more}</b>`:'');
  const nr=ps.filter(p=>p.ready).length;   // „Gotowy ✓" (serwer-autorytet) — informacja, start nie jest blokowany
  const who = ps.length ? `${ps.length} ${plural(ps.length, 'gracz', 'graczy', 'graczy')}${mpPickSalon?' + TV':''}${nr?` · gotowi ${nr}/${ps.length}`:''}` : 'czekamy na graczy';
  return `<div class="mp-pkroom" role="status" aria-live="polite" aria-label="Pokój ${escapeHtml(S.code)}: ${escapeHtml(who)}">
      <span class="mp-pkr-code"><small>POKÓJ</small><b>${escapeHtml(S.code)}</b></span>
      <span class="mp-pkr-avs" aria-hidden="true">${avs}</span><span class="mp-pkr-n">${escapeHtml(who)}</span>
      <button type="button" class="mp-pkr-share" onclick="mpShare(this)" aria-label="Udostępnij link do pokoju">${ic('share')}<span> Udostępnij</span></button></div>`;
}
function mpPickerHTML(){
  mpTablePrune();   // gust etap 3: stół wycięty z wyboru, zanim komponent policzy podsumowanie (każda zakładka)
  return `<div class="mpnav">
      <button class="nav-back" onclick="mpLobbyBack()" aria-label="wstecz do poczekalni">${ic('back')}</button>
      <span class="nav-title">Nowy mecz</span>
      <button class="nav-menu" onclick="mpConfirmLeave('menu')" aria-label="menu">${ic('menu')}</button>
    </div>
    ${mpPickRoomHTML()}
    <div class="mp-deck ms-host">${setup.html()}</div>`;
}
// AUTORYTET: złóż MINIMALNĄ pulę kategorii do wysłania (cap payloadu `start`).
// DO potrzebuje: artists; songs {title,artist,preview,year,album,match}; lyric/tts TYLKO dla lektora.
// Strip lyric/tts gdy lektor niewybrany (gros rozmiaru) + limit utworów/kategorię.
const MP_POOL_SONG_CAP=80;
function mpBuildPools(cats, modes){
  const wantLektor=modes.includes('lektor');
  const pools={};
  for(const k of cats){
    const c=ALL_CATS[k]; if(!c) continue;
    if(c.table){ pools[k]={ label:c.label, kind:'playlist', table:true }; continue; }   // gust etap 3: pulę składa serwer z półek graczy
    const out={ label:c.label, range:c.range, kind:c.kind };
    if(c.listenSecs) out.listenSecs=c.listenSecs;   // P1-2: własne okno „słuchaj" kategorii (serwer liczy z niego endsAt)
    if((wantLektor || modes.includes('piano') || modes.includes('guitar')) && c.lang) out.lang=c.lang;   // język opisów lektora (lyrics.js) / kategoria polska (covery: polishDominant); serwer sanityzuje do 'pl'|'en'
    if(c.desc) out.desc=c.desc;   // MP covery: polishDominant (core/match) patrzy też w opis kategorii
    if(Array.isArray(c.artists) && c.artists.length) out.artists=c.artists.slice();
    if(Array.isArray(c.noModes) && c.noModes.length) out.noModes=c.noModes.slice();   // np. „unplugged": bez okładki (serwer: core/match.modesFor)
    if(Array.isArray(c.songs) && c.songs.length){
      out.songs=c.songs.slice(0, MP_POOL_SONG_CAP).map(s=>{
        const o={ title:s.title, artist:s.artist };
        if(s.preview) o.preview=s.preview; if(s.year) o.year=s.year; if(s.album) o.album=s.album;
        if(s.match) o.match=s.match;   // wersja akustyczna/unplugged: słowo wymagane w tytule/albumie wyniku (core/trackSelect.matchSong)
        if(wantLektor && s.lyric){ o.lyric=s.lyric; if(s.tts) o.tts=s.tts; }   // lyric/tts tylko gdy lektor w grze
        return o;
      });
    }
    if(Array.isArray(c.questions) && c.questions.length){   // wiedza ogólna — pytania lecą do DO (DO re-clampuje)
      // F3: + pool (sloty wymienne), difficulty, fun (SPEC v2). Stary serwer je wytnie → ocena per slot z answers (spłaszczona pula)
      out.questions=c.questions.map(q=>{
        const o={ prompt:q.prompt, slots:q.slots, answers:q.answers };
        if(Array.isArray(q.pool)) o.pool=q.pool; if(q.difficulty) o.difficulty=q.difficulty; if(q.fun) o.fun=q.fun;
        // Łamigłówki: duży rebus / częściowe punkty / utwór-rozwiązanie (DO trzyma je w sekrecie do REVEAL; stary serwer wytnie)
        if(q.display) o.display=q.display; if(q.partial===true) o.partial=true;
        if(q.track) o.track=q.track; if(Array.isArray(q.tracks)) o.tracks=q.tracks;
        return o;
      });
    }
    pools[k]=out;
  }
  return pools;
}
function mpRandomPick(){ const {cats,modes}=randomPools(mpAvailModes()); setup.setPick({ cats, modes }); }

// most do HTML (onclick="" w generowanym pickerze) + eksport stanu/HTML dla mp.js (mpStart, mpRender)
Object.assign(window, { mpToggleCat, mpToggleMode, mpToggleGrp, mpRandomPick, mpPlToggle, mpPlImport, mpSetQuestions, mpSetTimer, mpSetSalon, mpSetAudioHost, mpSetFormat, mpSetTeamCount, mpCycleAssign, mpSetTeamName, mpBalance });
// host wchodzi na „Nowy mecz" (z lobby / po meczu) → „Dostosuj mecz" zwinięte
const mpPickResetUi = ()=> setup.resetOpen();
export { mpPickResetUi, mpPickerHTML, mpBuildPools, mpAvailModes, mpPickCats, mpPickModes, mpPickQuestions, mpPickTimer, mpPickSalon, mpPickFormat, mpTeamsFromAssign, mpPickAudioHostOnly, mpDraft, mpPickResetRoom, mpPickReady, mpPickGate };
