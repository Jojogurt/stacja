/* app/mp-picker.js — host-picker MP („ułóż mecz"): wybór kategorii/trybów/rund/timera + budowa puli.
 * Stan pickera zamknięty w module (czytany przez mpStart w mp.js). mpRender wstrzykiwany (initMpPicker)
 * — re-render po zmianie wyboru bez cyklu z mp.js. */
import { ERA_KEYS, STYLE_KEYS, READY_KEYS, LYRICS_KEYS, QUIZ_KEYS, ALL_CATS, randomPools, plLoad, plFetch } from './catalog.js';
import { ALL_MODES, MODE_LABEL, CPR, QPC } from '../core/match.js';
import { escapeHtml } from '../core/util.js';
import { pickSummary, plPick, togglePick as _togglePick, syncQuizMode as _syncQuizMode, grpActive as _grpActive } from '../core/picker.js';

let mpRender = () => {};                 // wstrzykiwany przez mp.js (re-render widoku pokoju)
export function initMpPicker(render){ mpRender = render; }

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
function mpToggleCat(k){ _togglePick(mpPickCats,k); mpRender(); }
function mpToggleMode(m){ _togglePick(mpPickModes,m); mpRender(); }
function mpSetRounds(r){ mpPickRounds=r; mpRender(); }
function mpSetTimer(t){ mpPickTimer=t; mpRender(); }
// chipy-grup (host-picker MP) — analogicznie do solo (ekran 02). Stan rozwinięcia trwa między re-renderami.
let mpPickOpenGrp=new Set();
const MP_GRP=[
  {g:'dekady', lab:'📅 Dekady', keys:()=>ERA_KEYS, cls:''},
  {g:'style', lab:'🎸 Style', keys:()=>STYLE_KEYS, cls:'gen'},
  {g:'playlisty', lab:'📋 Playlisty', keys:()=>READY_KEYS, cls:'pl'},
  {g:'teksty', lab:'🗣 Teksty', keys:()=>LYRICS_KEYS, cls:'gen'},
  {g:'wiedza', lab:'🧠 Wiedza', keys:()=>QUIZ_KEYS, cls:'gen'},
  {g:'twoje', lab:'⭐ Twoje', keys:()=>Object.keys(plLoad()), cls:'pl'},
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
  const s=pickSummary(mpPickCats, mpPickModes, mpPickRounds, ALL_CATS);
  const bad=!!s.error;
  const info=bad ? escapeHtml(s.error)
    : `${s.rounds} ${s.label} × ${CPR} kategorie × ${QPC} pytań = <b>${s.count} utworów</b>`;
  const catCount=nSel+' '+plPick(nSel,'wybrana','wybrane','wybranych');
  return `<div class="mpnav">
      <button class="nav-back" onclick="mpLobbyBack()" aria-label="wstecz">←</button>
      <span class="nav-title">Ułóż mecz</span>
      <button class="nav-menu" onclick="mpExitMenu()" aria-label="menu">☰</button>
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
      <div class="um-summary ${bad?'err':''}">${info}</div>
      <div class="um-foot">
        <button class="um-dice" onclick="mpRandomPick()" aria-label="Losuj kategorie i tryby">🎲</button>
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
Object.assign(window, { mpToggleCat, mpToggleMode, mpToggleGrp, mpRandomPick, mpPlToggle, mpPlImport, mpSetRounds, mpSetTimer });
export { mpPickerHTML, mpBuildPools, mpPickCats, mpPickModes, mpPickRounds, mpPickTimer };
