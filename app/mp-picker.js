/* app/mp-picker.js — host-picker MP („ułóż mecz"): wybór kategorii/trybów/rund/timera + budowa puli.
 * Stan pickera zamknięty w module (czytany przez mpStart w mp.js). mpRender wstrzykiwany (initMpPicker)
 * — re-render po zmianie wyboru bez cyklu z mp.js. */
import { ERA_KEYS, STYLE_KEYS, READY_KEYS, LYRICS_KEYS, QUIZ_KEYS, ALL_CATS, randomPools, plLoad, plFetch } from './catalog.js';
import { ALL_MODES, MODE_LABEL, CPR, QPC } from '../core/match.js';
import { escapeHtml } from '../core/util.js';
import { pickSummary, plPick, togglePick as _togglePick, syncQuizMode as _syncQuizMode, grpActive as _grpActive } from '../core/picker.js';
import { teamColor } from '../core/teams.js';
import { ic } from './icons.js';

let mpRender = () => {};                 // wstrzykiwany przez mp.js (re-render widoku pokoju)
let mpGetPlayers = () => [];             // [{id,name}] obecni gracze (z mp.js) — do przypisania do drużyn
export function initMpPicker(render, getPlayers){ mpRender = render; if(getPlayers) mpGetPlayers = getPlayers; }

let mpPickCats=new Set(), mpPickModes=new Set(['music']), mpPickRounds=4, mpPickTimer=60;
let mpPickSalon=false;   // tryb salonowy: TEN ekran tylko prowadzi i gra muzykę (TV), telefony = kontrolery
let mpPickFormat='coop'; // format meczu: 'coop' (jedna drużyna) | 'solo' (każdy sam) | 'teams' (podział)
function mpSetFormat(v){
  mpPickFormat=v;
  if(v!=='coop') mpPickSalon=false;       // salon (TV-sędzia) ma sens tylko dla jednej wspólnej drużyny
  mpRender();
}
function mpSetSalon(v){ if(mpPickFormat!=='coop') return; mpPickSalon=!!v; mpRender(); }

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
function mpToggleCat(k){ _togglePick(mpPickCats,k); mpRender(); }
function mpToggleMode(m){ _togglePick(mpPickModes,m); mpRender(); }
function mpSetRounds(r){ mpPickRounds=r; mpRender(); }
function mpSetTimer(t){ mpPickTimer=t; mpRender(); }
// chipy-grup (host-picker MP) — analogicznie do solo (ekran 02). Stan rozwinięcia trwa między re-renderami.
let mpPickOpenGrp=new Set();
const MP_GRP=[
  {g:'dekady', lab:ic('calendar')+' Dekady', keys:()=>ERA_KEYS, cls:''},
  {g:'style', lab:ic('guitar')+' Style', keys:()=>STYLE_KEYS, cls:'gen'},
  {g:'playlisty', lab:ic('playlist')+' Playlisty', keys:()=>READY_KEYS, cls:'pl'},
  {g:'teksty', lab:ic('quotes')+' Teksty', keys:()=>LYRICS_KEYS, cls:'gen'},
  {g:'wiedza', lab:ic('brain')+' Wiedza', keys:()=>QUIZ_KEYS, cls:'gen'},
  {g:'twoje', lab:ic('star')+' Twoje', keys:()=>Object.keys(plLoad()), cls:'pl'},
];
const MP_GRP_SUB={teksty:'tłumaczenia 🌐 (tryb lektor)', wiedza:'wiedza ogólna 🧠 (tryb quiz)'};
function mpToggleGrp(g){ if(mpPickOpenGrp.has(g)) mpPickOpenGrp.delete(g); else mpPickOpenGrp.add(g); mpRender(); }
function mpSyncQuizMode(){ _syncQuizMode(mpPickCats, mpPickModes, ALL_CATS); }
function mpPickerHTML(){
  mpSyncQuizMode();
  let grpChips='', grpBands='', nSel=0;
  MP_GRP.forEach(d=>{
    const keys=d.keys(); if(!keys.length && d.g!=='twoje') return;
    const active=_grpActive(keys, mpPickCats); if(active) nSel++;
    const open=mpPickOpenGrp.has(d.g);
    grpChips+=`<button class="grp-chip${active?' on':''}${open?' open':''}" onclick="mpToggleGrp('${d.g}')">${d.lab}</button>`;
    if(!open) return;
    let inner;
    if(d.g==='twoje'){
      inner=`<div class="band-sub">twoje playlisty <button class="pl-add" onclick="mpPlToggle()">+ ze Spotify</button></div>`+
        (keys.length? `<div class="ticks">`+keys.map(k=>`<button class="tick pl ${mpPickCats.has(k)?'on':''}" onclick="mpToggleCat('${k}')">${escapeHtml(ALL_CATS[k].label)}<small>${(ALL_CATS[k].songs||[]).length} utw.</small></button>`).join('')+`</div>`
          : `<div class="ticks"><span style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:6px 2px">brak — kliknij „+ ze Spotify"</span></div>`)+
        `<div class="pl-panel${mpPlOpen?' show':''}"><input id="mpPlUrl" autocomplete="off" placeholder="wklej link do publicznej playlisty Spotify" onkeydown="if(event.key==='Enter')mpPlImport()"><button onclick="mpPlImport()">Importuj</button><div class="pl-status ${mpPlStatusCls}" id="mpPlStatus">${escapeHtml(mpPlStatus)}</div></div>`;
    } else {
      inner=(MP_GRP_SUB[d.g]?`<div class="band-sub">${MP_GRP_SUB[d.g]}</div>`:'')+
        `<div class="ticks">`+keys.map(k=>`<button class="tick ${d.cls} ${mpPickCats.has(k)?'on':''}" onclick="mpToggleCat('${k}')">${escapeHtml(ALL_CATS[k].label)}<small>${escapeHtml(ALL_CATS[k].range||ALL_CATS[k].desc||'')}</small></button>`).join('')+`</div>`;
    }
    grpBands+=`<div class="grp-band open">${inner}</div>`;
  });
  const modeChips=ALL_MODES.filter(m=>m!=='quiz').map(m=>`<button class="grp-chip mode ${mpPickModes.has(m)?'on':''}" onclick="mpToggleMode('${m}')">${MODE_LABEL[m]}</button>`).join('');
  const roundsBtns=[1,2,3,4].map(r=>`<button class="${mpPickRounds===r?'on':''}" onclick="mpSetRounds(${r})">${r}</button>`).join('');
  const timerBtns=[[0,'bez'],[30,'30s'],[60,'60s'],[90,'90s']].map(([v,l])=>`<button class="${mpPickTimer===v?'on':''}" onclick="mpSetTimer(${v})">${l}</button>`).join('');
  // format meczu: jak punktujemy (jedna drużyna / każdy sam / podział na drużyny).
  const fmtBtns=[['coop','Wspólna'],['solo','Solo'],['teams','Drużyny']].map(([v,l])=>
    `<button class="${mpPickFormat===v?'on':''}" onclick="mpSetFormat('${v}')">${l}</button>`).join('');
  const fmtNote = mpPickFormat==='solo' ? 'każdy gra sam (ranking)' : mpPickFormat==='teams' ? 'podział na drużyny' : 'gracie jako jedna drużyna';
  const salonDis = mpPickFormat!=='coop';
  // sekcja przypisania (format 'teams'): liczba drużyn + chipy graczy (tknięcie = zmiana drużyny)
  let assignSec='', teamsBad=false;
  if(mpPickFormat==='teams'){
    const players=mpGetPlayers();
    const built=mpTeamsFromAssign(players);
    teamsBad = built.length<2;   // start tylko gdy ≥2 niepuste drużyny
    const tcBtns=[2,3,4].map(n=>`<button class="${mpPickTeamCount===n?'on':''}" onclick="mpSetTeamCount(${n})">${n}</button>`).join('');
    // pola nazw drużyn (oninput BEZ re-render → focus nie ucieka); kolor = kolor drużyny
    const nameInputs=Array.from({length:mpPickTeamCount},(_,i)=>
      `<input class="um-tname" style="border-color:${teamColor(i)}" maxlength="14" value="${escapeHtml(mpPickTeamNames[i]||'')}" placeholder="Drużyna ${i+1}" oninput="mpSetTeamName(${i}, this.value)">`).join('');
    const chips = players.length ? players.map(p=>{
      const ti=mpAssignOf(p.id), col=teamColor(ti), av=escapeHtml((p.name||'?').slice(0,1).toUpperCase());
      return `<button class="um-assign-chip" style="border-color:${col}" onclick="mpCycleAssign('${escapeHtml(p.id)}')"><b style="background:${col}">${av}</b><span>${escapeHtml(p.name||'gracz')}</span><i style="background:${col}">D${ti+1}</i></button>`;
    }).join('') : `<div class="um-assign-empty">czekamy na graczy w pokoju…</div>`;
    assignSec=`<div class="um-sec"><div class="um-h"><span>Drużyny</span><span class="note">tknij gracza = zmień drużynę</span></div>
        <div class="um-teamrow"><div class="um-rounds">${tcBtns}</div><button class="um-balance" onclick="mpBalance()">⚖️ równo</button></div>
        <div class="um-tnames">${nameInputs}</div>
        <div class="um-assign">${chips}</div></div>`;
  }
  const s=pickSummary(mpPickCats, mpPickModes, mpPickRounds, ALL_CATS);
  const bad=!!s.error || teamsBad;
  const info= s.error ? escapeHtml(s.error)
    : teamsBad ? 'Podziel graczy na min. 2 drużyny (potrzeba ≥2 graczy w pokoju).'
    : `${s.rounds} ${s.label} × ${CPR} kategorie × ${QPC} pytań = <b>${s.count} utworów</b>`;
  const catCount=nSel+' '+plPick(nSel,'wybrana','wybrane','wybranych');
  return `<div class="mpnav">
      <button class="nav-back" onclick="mpLobbyBack()" aria-label="wstecz">${ic('back')}</button>
      <span class="nav-title">Ułóż mecz</span>
      <button class="nav-menu" onclick="mpExitMenu()" aria-label="menu">${ic('menu')}</button>
    </div>
    <div class="mp-deck">
      <div class="um-sec"><div class="um-h"><span>Kategorie</span><span class="note">${catCount}</span></div>
        <div class="um-chips">${grpChips}</div>${grpBands}</div>
      <div class="um-sec"><div class="um-h"><span>Tryby pytań</span><span class="note">jak słyszysz utwór</span></div>
        <div class="um-chips">${modeChips}</div></div>
      <div class="um-sec"><div class="um-h"><span>Liczba rund</span><span class="note val">${mpPickRounds}</span></div>
        <div class="um-rounds">${roundsBtns}</div></div>
      <div class="um-sec"><div class="um-h"><span>Timer pytania</span></div>
        <div class="um-rounds">${timerBtns}</div></div>
      <div class="um-sec"><div class="um-h"><span>Format</span><span class="note">${fmtNote}</span></div>
        <div class="um-rounds">${fmtBtns}</div></div>
      ${assignSec}
      <div class="um-sec um-salon"><button class="um-salon-toggle${mpPickSalon?' on':''}"${salonDis?' disabled style="opacity:.45"':''} onclick="mpSetSalon(${mpPickSalon?'false':'true'})" role="switch" aria-checked="${mpPickSalon}">
          <span class="um-salon-tx"><b>${ic('tv')} Tryb salonowy</b><small>${salonDis?'dostępny tylko dla formatu Wspólna':'ten ekran tylko prowadzi i gra muzykę — gracze na telefonach'}</small></span>
          <span class="um-salon-sw"><i></i></span>
        </button></div>
      <div class="um-summary ${bad?'err':''}">${info}</div>
      <div class="um-foot">
        <button class="um-dice" onclick="mpRandomPick()" aria-label="Losuj kategorie i tryby">${ic('dice')}</button>
        <button class="um-start" ${bad?'disabled style="opacity:.55"':''} onclick="mpStart()">Zacznij mecz</button>
      </div>
    </div>`;
}
// AUTORYTET: złóż MINIMALNĄ pulę kategorii do wysłania (cap payloadu `start`).
// DO potrzebuje: artists; songs {title,artist,preview,year,album}; lyric/tts TYLKO dla lektora.
// Strip lyric/tts gdy lektor niewybrany (gros rozmiaru) + limit utworów/kategorię.
const MP_POOL_SONG_CAP=80;
function mpBuildPools(cats, modes){
  const wantLektor=modes.includes('lektor');
  const pools={};
  for(const k of cats){
    const c=ALL_CATS[k]; if(!c) continue;
    const out={ label:c.label, range:c.range, kind:c.kind };
    if(Array.isArray(c.artists) && c.artists.length) out.artists=c.artists.slice();
    if(Array.isArray(c.songs) && c.songs.length){
      out.songs=c.songs.slice(0, MP_POOL_SONG_CAP).map(s=>{
        const o={ title:s.title, artist:s.artist };
        if(s.preview) o.preview=s.preview; if(s.year) o.year=s.year; if(s.album) o.album=s.album;
        if(wantLektor && s.lyric){ o.lyric=s.lyric; if(s.tts) o.tts=s.tts; }   // lyric/tts tylko gdy lektor w grze
        return o;
      });
    }
    if(Array.isArray(c.questions) && c.questions.length){   // wiedza ogólna — pytania lecą do DO (DO re-clampuje)
      out.questions=c.questions.map(q=>({ prompt:q.prompt, slots:q.slots, answers:q.answers }));
    }
    pools[k]=out;
  }
  return pools;
}
function mpRandomPick(){ const {cats,modes}=randomPools(); mpPickCats=new Set(cats); mpPickModes=new Set(modes); mpRender(); }

// most do HTML (onclick="" w generowanym pickerze) + eksport stanu/HTML dla mp.js (mpStart, mpRender)
Object.assign(window, { mpToggleCat, mpToggleMode, mpToggleGrp, mpRandomPick, mpPlToggle, mpPlImport, mpSetRounds, mpSetTimer, mpSetSalon, mpSetFormat, mpSetTeamCount, mpCycleAssign, mpSetTeamName, mpBalance });
export { mpPickerHTML, mpBuildPools, mpPickCats, mpPickModes, mpPickRounds, mpPickTimer, mpPickSalon, mpPickFormat, mpTeamsFromAssign };
