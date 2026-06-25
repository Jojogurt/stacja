/* app/social.js — router ekranów + warstwa „społeczna": Drużyna / Znajomi / Profil + konto (OAuth).
 * Zależy od adapterów cf (sieć) i core/util. Powiązania z warstwą MP (mpMe, wejście do pokoju,
 * odblokowanie audio, kolor awatara) oraz etykiety kategorii wstrzykiwane przez initSocial —
 * dzięki temu moduł nie importuje app.js (brak cyklu), a przeniesiony kod został bez zmian. */
import { escapeHtml } from '../core/util.js';
import { ensureSession, setHandle, fetchProfile, loginOAuth, logout,
  teamCreate, teamJoin, teamLeave, myTeams, friendAdd, friendRespond,
  friendsList, pendingFriends, sentFriends, meInfo } from '../adapters-web/cf.js';
import { cfChannel } from '../adapters-web/cfChannel.js';
import { ic } from './icons.js';

const $m = id => document.getElementById(id);
const bbLoader = '<div class="bb-loader"><i></i><i></i><i></i></div>';   // lokalny (bez kruchego współdzielonego importu)

/* —— zależności wstrzyknięte z app.js (warstwa MP + etykiety kategorii) ——
 * Zadeklarowane jako locale, by przeniesiony kod wołał je dokładnie tak jak wcześniej. */
let mpMe, mpEnterRoom, mpRandCode, mpUnlockAudio, mpAvatarColor, catLabel;
export function initSocial(deps){
  ({ mpMe, mpEnterRoom, mpRandCode, mpUnlockAudio, mpAvatarColor, catLabel } = deps);
}

/* ---- wejście / wyjście z trybu ---- */
const SCR_HEAD={ solo:'Ułóż mecz', liga:'Drużyna i znajomi', profil:'Profil' };
export function showScreen(s){
  document.body.classList.remove('menu','solo','mp','liga','profil','salon'); document.body.classList.add(s);   // 'salon' (ekran-monitor TV) dokłada/zdejmuje mpRender
  if(s==='mp') mpPrefillName();
  const tt=$m('scrTitle'); if(tt) tt.textContent=SCR_HEAD[s]||'';
}

let dzMe=null;   // {id, handle, emoji, friend_code}

/* ---- ksywa: jedna tożsamość dla profilu i lobby MP ----
   Brak ksywy → losujemy zabawny nick z listy i zapisujemy (maxlength 32 — input i serwer). */
let myHandle=null;
const FUNNY_HANDLES=['Michał Dżemson','Darth Wiesław','Obi-Wan Kebabi','James Bonczur','Analny Korsarz',
  'Indiana Janusz','James Bondżur','Bruce Wilgotny','Gandalf Biały Ser','Spider-Chłop','Batman z Biedry',
  'Hulk po Kompocie','Rocky Balbochen','John Wycisk','Robert Lewa Noga','Krzysztof Kieślina','Pudzilla',
  'Jan Router II','Pan Kleksik','Wiesław Wszechmogący','Pirat z Karaibiedronki','Ojciec Chrzestny Karpia',
  'Cristiano Rolando','Lionel Messiasty','Kanye Westchnienie','Snoop Pies','Post Malonez','Dua Cipa',
  'Temu Batman','Taco z Paczkomatu','Betonowy Mnich','Kulturalny Chuligan','Szybki Proboszcz','Młody Janusz',
  'Szczur z otwarcia kanału','Książę Pasztetu','Szef Parówek','Mokra Włoszka','Drugi Peja','Mądrzejszy Einstein',
  'Łóżkowy Sprinter','Tłusty Ninja','Zimny Kaloryfer','Zaginiony Teść','Wujek Chaos','Pół Człowiek Pół Główek',
  'Grzybiarz Olek','Emerytka','Shrek po Krecie','Messi z Temu','Hari Pota','Geralt z Niedrzwicy',
  'Kapitan Oczywisty','Minionek Alfa','Naczelny Słoik','Mistrz Ceraty','Głuchy Pień','Mała Ale Ja Już',
  'Bober z Grzywką'];
function funnyHandle(){ return FUNNY_HANDLES[Math.floor(Math.random()*FUNNY_HANDLES.length)]; }
// zwróć stabilną ksywę: z profilu, a jak brak — wygeneruj i zapisz (idempotentne, cache w myHandle)
export async function ensureHandle(){
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
export async function renderDruzyna(){
  const el=$m('druzynaBody'); if(!el) return;
  el.innerHTML=`<div class="liga-empty">${bbLoader}</div>`;
  try{
  await Promise.race([ensureSession(), new Promise(r=>setTimeout(r,5000))]);   // nie blokuj w nieskończoność
  const [meR, teamsR, friR, penR, sentR] = await Promise.all([meInfo(), myTeams(), friendsList(), pendingFriends(), sentFriends()]);
  const noAuth = (meR.error && !meR.data);   // brak sesji (Worker nieosiągalny) — pokaż baner, ale NIE chowaj ekranu
  const notice = noAuth ? `<div class="dz-acct" style="background:#FFF1F1;border-color:var(--red);color:#E63946">⚠️ Brak połączenia z serwerem — drużyny i znajomi chwilowo niedostępne. Spróbuj odświeżyć.</div>` : '';
  dzMe = (meR.data&&meR.data[0]) || null;
  const secured = !!(dzMe && dzMe.secured);
  const teams = teamsR.data||[], friends = friR.data||[], pending = penR.data||[], sent = sentR.data||[];
  const av=(n,c)=>`<span class="dz-av" style="background:${mpAvatarColor(n)}">${escapeHtml((n||'?').slice(0,1).toUpperCase())}</span>`;

  // === KONTO — logowanie żyje w Profilu; tu tylko status/info ===
  const kontoSection = secured
    ? `<div class="dz-acct ok">✓ Zalogowano${dzMe.email?': '+escapeHtml(dzMe.email):''}</div>`
    : `<div class="dz-acct">${ic('lock')} Zaloguj się w <b>Profilu</b>, żeby zakładać drużyny i dodawać znajomych — i mieć je na każdym urządzeniu.</div>`;

  // === DRUŻYNA ===
  const team = teams[0] || null;   // jedna „twoja drużyna" w UI (jak makieta)
  dzTeamSync(team);                // podłącz/odłącz kanał lobby drużyny (#4)
  const teamCard = team ? `
    <div class="dz-team">
      <div class="dz-team-top"><span class="em">${escapeHtml(team.emoji||'🍺')}</span>
        <span class="nm"><b>${escapeHtml(team.name)}</b><small>${team.members} os. · kod <b>${escapeHtml(team.code)}</b></small></span>
        <span class="dz-online" id="dzOnline"></span></div>
      <div class="dz-team-btns">
        <button class="dz-play" onclick="dzPlay()">${ic('play')} Zagraj</button>
        <button class="dz-mini" onclick="dzCopy('${escapeHtml(team.code)}')">${ic('copy')} kod</button>
        <button class="dz-mini red" onclick="dzLeave('${team.id}')">wyjdź</button>
      </div>
      <div class="dz-gamebanner" id="dzGameBanner" style="display:none"></div>
    </div>` : '';
  const teamForms = secured ? `
    <div class="dz-row2">
      <input id="dzName" maxlength="20" placeholder="nazwa drużyny">
      <input id="dzEmoji" maxlength="2" placeholder="🍺" value="🍺" class="dz-emoji">
      <button class="dz-go" onclick="dzCreate()">Stwórz</button>
    </div>
    <div class="dz-row2">
      <input id="dzJoin" maxlength="6" placeholder="KOD DRUŻYNY" style="text-transform:uppercase">
      <button class="dz-go blue" onclick="dzJoin()">Dołącz</button>
    </div>` : `<div class="dz-hint">${ic('lock')} zaloguj się w Profilu, żeby stworzyć lub dołączyć do drużyny</div>`;
  const teamSection = `
    <div class="dz-lbl">Twoja drużyna</div>
    ${teamCard || '<div class="dz-empty">Nie masz jeszcze drużyny — stwórz albo dołącz po kodzie.</div>'}
    <div class="dz-lbl">${team?'Zmień drużynę':'Stwórz lub dołącz'}</div>
    ${teamForms}`;

  // === ZNAJOMI ===
  const myCode = dzMe?.friend_code || '—';
  const pendRows = pending.map(p=>`
    <div class="dz-fr"><span class="who">${av(p.handle)}${escapeHtml(p.handle||'gracz')}</span>
      <span class="acts"><button class="dz-yes" onclick="dzRespond(${p.req_id},true)">✓</button><button class="dz-no" onclick="dzRespond(${p.req_id},false)">✗</button></span></div>`).join('');
  const sentRows = sent.map(s=>`
    <div class="dz-fr"><span class="who">${av(s.handle)}${escapeHtml(s.handle||'gracz')}</span>
      <span class="pendtag">⏳ wysłano</span></div>`).join('');
  const friendRows = friends.map(f=>`<div class="dz-fr"><span class="who">${av(f.handle)}${escapeHtml(f.handle||'gracz')}</span><span class="code">${escapeHtml(f.friend_code||'')}</span></div>`).join('')
    || '<div class="dz-empty">Brak znajomych — dodaj kogoś po kodzie i zagrajcie razem.</div>';
  const friendAddRow = secured
    ? `<div class="dz-row2"><input id="dzFriend" maxlength="6" placeholder="KOD ZNAJOMEGO" style="text-transform:uppercase"><button class="dz-go" onclick="dzAddFriend()">Dodaj</button></div>`
    : `<div class="dz-hint">${ic('lock')} zaloguj się w Profilu, żeby dodawać znajomych</div>`;
  const friendSection = `
    <div class="dz-lbl">Twój kod znajomego</div>
    <div class="dz-mycode"><b>${escapeHtml(myCode)}</b><button class="dz-mini" onclick="dzCopy('${escapeHtml(myCode)}')">${ic('copy')} kopiuj</button></div>
    ${friendAddRow}
    ${pending.length?`<div class="dz-lbl">Zaproszenia <span class="dz-badge">${pending.length}</span></div>${pendRows}`:''}
    ${sent.length?`<div class="dz-lbl">Wysłane zaproszenia</div>${sentRows}`:''}
    <div class="dz-lbl">Lista znajomych</div>
    ${friendRows}`;

  el.innerHTML = notice + kontoSection + teamSection + friendSection + '<div class="dz-hint" id="dzMsg"></div>';
  dzRenderLobby();   // odśwież wskaźnik online + baner aktywnej gry (jeśli kanał już coś wie)
  }catch(e){ el.innerHTML='<div class="liga-empty">Coś poszło nie tak: '+escapeHtml(String(e&&e.message||e))+'<br><small>(prześlij mi ten komunikat)</small></div>'; }
}
function dzMsg(t,err){ const m=$m('dzMsg'); if(m){ m.textContent=t; m.className='dz-hint'+(err?' err':err===false?' ok':''); } }
const dzErrLabel=(e)=> e==='requires_account' ? 'Najpierw zaloguj się (Google/Apple).' : e;
async function dzCreate(){ const n=$m('dzName')?.value, e=$m('dzEmoji')?.value; const r=await teamCreate(n,e); if(r.error){ dzMsg('Nie udało się: '+dzErrLabel(r.error),true); } else renderDruzyna(); }
async function dzJoin(){ const c=$m('dzJoin')?.value; if(!c) return; const r=await teamJoin(c); if(r.error){ dzMsg(r.error==='group_not_found'?'Nie ma takiej drużyny.':dzErrLabel(r.error),true); } else renderDruzyna(); }
async function dzLeave(id){ dzTeamSync(null); await teamLeave(id); renderDruzyna(); }
async function dzAddFriend(){
  const c=$m('dzFriend')?.value; if(!c) return;
  const r=await friendAdd(c);
  if(r.error){ dzMsg(r.error==='profile_not_found'?'Nie ma takiego kodu.':(r.error==='self'?'To Twój kod 🙂':dzErrLabel(r.error)),true); return; }
  // sukces: jeśli druga osoba już mnie zaprosiła → od razu znajomi; inaczej zaproszenie wysłane
  dzMsg(r.data&&r.data.accepted ? '✓ Dodano znajomego!' : '✓ Wysłano zaproszenie — czeka na akceptację.', false);
  renderDruzyna();
}
async function dzRespond(id,ok){ const r=await friendRespond(id,ok); if(r&&r.error){ dzMsg(dzErrLabel(r.error),true); } else renderDruzyna(); }
function dzCopy(t){ try{ navigator.clipboard.writeText(t); }catch(e){} }
// „Zagraj" → utwórz pokój jako host i ROZGŁOŚ kod na kanale drużyny, by członkowie online
// dostali zaproszenie „dołącz jednym kliknięciem" (#4 — lobby drużyny w aplikacji).
async function dzPlay(){
  const n=await ensureHandle(); mpMe.name=n; setHandle(n);
  const code=mpRandCode();
  if(dzTeamCh){ try{ dzTeamCh.send({type:'broadcast',event:'gamestart',payload:{code, byName:n, by:mpMe.id}}); }catch(e){} }
  showScreen('mp');
  mpUnlockAudio();
  mpEnterRoom(code, true);
}

/* ---- #4: lobby drużyny (kanał realtime per drużyna) ----
   Reuse cfChannel (relay: presence + broadcast). Po wejściu na ekran Drużyna członkowie
   subskrybują kanał „team-<kod>": presence = kto online, event „gamestart" = host ruszył grę. */
let dzTeamCh=null, dzTeamCode=null, dzOnlineCount=0, dzActiveGame=null;
function dzTeamSync(team){
  const code = team ? team.code : null;
  if(code===dzTeamCode) return;          // bez zmian
  dzTeamDisconnect();
  if(!code) return;
  dzTeamCode=code; dzActiveGame=null;
  dzTeamCh=cfChannel('team-'+code, {config:{broadcast:{self:false}, presence:{key:mpMe.id}}});
  dzTeamCh.on('presence',{event:'sync'},()=>{ dzOnlineCount=Object.keys(dzTeamCh.presenceState()).length; dzRenderLobby(); });
  dzTeamCh.on('broadcast',{event:'gamestart'},({payload})=>{ if(payload&&payload.by!==mpMe.id){ dzActiveGame=payload; dzRenderLobby(); } });
  dzTeamCh.subscribe(async(st)=>{ if(st==='SUBSCRIBED'){ await dzTeamCh.track({name:mpMe.name||myHandle||'gracz'}); } });
}
function dzTeamDisconnect(){ if(dzTeamCh){ try{ dzTeamCh.unsubscribe(); }catch(e){} } dzTeamCh=null; dzTeamCode=null; dzOnlineCount=0; }
function dzRenderLobby(){
  const on=$m('dzOnline'); if(on) on.textContent = dzOnlineCount>1 ? `🟢 ${dzOnlineCount} online` : '';
  const b=$m('dzGameBanner'); if(!b) return;
  if(dzActiveGame){
    b.style.display='';
    b.innerHTML=`<span>🎮 <b>${escapeHtml(dzActiveGame.byName||'Ktoś')}</b> zaczął grę drużynową!</span>
      <button class="dz-join-game" onclick="dzJoinGame()">Dołącz →</button>`;
  } else { b.style.display='none'; b.innerHTML=''; }
}
async function dzJoinGame(){
  if(!dzActiveGame) return;
  const code=dzActiveGame.code, n=await ensureHandle(); mpMe.name=n; setHandle(n);
  showScreen('mp'); mpUnlockAudio(); mpEnterRoom(code, false);
}

/* ---- KONTO (Google/Apple) — sekcja w Profilu; wymagane do drużyn/znajomych ---- */
function dzLoadScript(src){ return new Promise((res,rej)=>{ if(document.querySelector(`script[src="${src}"]`)) return res(); const s=document.createElement('script'); s.src=src; s.async=true; s.onload=()=>res(); s.onerror=()=>rej(new Error('load')); document.head.appendChild(s); }); }
function acMsg(t,err){ const m=$m('acMsg')||$m('dzMsg'); if(m){ m.textContent=t; m.className='dz-hint'+(err?' err':''); } }
function acAfterLogin(){ if(document.body.classList.contains('profil')) renderProfil(); else if(document.body.classList.contains('liga')) renderDruzyna(); }
// HTML sekcji Konto (na ekran Profil): zalogowany → status + Wyloguj; niezalogowany → przyciski (stack, center).
function acAccountHTML(secured, email){
  const cfg=window.STACJA_CONFIG||{};
  if(secured) return `<div class="pf-acct"><div class="dz-acct ok">✓ Zalogowano${email?': '+escapeHtml(email):''}</div><button class="dz-go" style="width:100%;padding:13px 16px;font-size:15px" onclick="acLogout()">Wyloguj</button><div class="dz-hint" id="acMsg"></div></div>`;
  const g = cfg.googleClientId ? `<div id="acGoogleBtn"></div>` : '';
  // natywny czarny przycisk Apple — Apple JS sam go renderuje w #appleid-signin
  const a = cfg.appleServicesId ? `<div id="appleid-signin" data-color="black" data-border="false" data-type="sign in" data-mode="center-align" data-border-radius="22" style="width:240px;height:44px;cursor:pointer"></div>` : '';
  const buttons = (g||a) ? `<div class="dz-oauth col">${g}${a}</div>` : `<div class="dz-hint">Logowanie Google/Apple — wkrótce.</div>`;
  return `<div class="pf-acct"><div class="dz-acct">${ic('lock')} Zaloguj się, żeby zakładać drużyny i dodawać znajomych — i mieć je na każdym urządzeniu.</div>${buttons}<div class="dz-hint" id="acMsg"></div></div>`;
}
let _appleListenersAttached=false;
// lazy-load SDK i wyrenderuj OBA natywne przyciski (Google GIS + Apple #appleid-signin)
async function acInitAuthButtons(){
  const cfg=window.STACJA_CONFIG||{};
  const gbox=$m('acGoogleBtn');
  if(cfg.googleClientId && gbox){ try{
    await dzLoadScript('https://accounts.google.com/gsi/client');
    if(window.google&&google.accounts&&google.accounts.id){
      google.accounts.id.initialize({ client_id:cfg.googleClientId, callback: async (resp)=>{
        const r=await loginOAuth('google', resp.credential);
        if(r.error) acMsg('Logowanie Google: '+r.error,true); else acAfterLogin();
      }});
      google.accounts.id.renderButton(gbox, { theme:'outline', size:'large', shape:'pill', text:'signin_with', logo_alignment:'center', width:240 });
    }
  }catch(e){ /* przycisk się nie pokaże */ } }
  const abox=document.getElementById('appleid-signin');
  if(cfg.appleServicesId && abox){ try{
    await dzLoadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
    if(window.AppleID){
      AppleID.auth.init({ clientId:cfg.appleServicesId, scope:'email', redirectURI:location.origin+location.pathname, usePopup:true });
      if(!_appleListenersAttached){            // raz — natywny przycisk zgłasza wynik przez zdarzenia na document
        _appleListenersAttached=true;
        document.addEventListener('AppleIDSignInOnSuccess', async (e)=>{
          const idt=e.detail&&e.detail.authorization&&e.detail.authorization.id_token;
          if(!idt){ acMsg('Logowanie Apple: brak tokenu.',true); return; }
          const r=await loginOAuth('apple', idt);
          if(r.error) acMsg('Logowanie Apple: '+r.error,true); else acAfterLogin();
        });
        document.addEventListener('AppleIDSignInOnFailure', ()=>{ acMsg('Logowanie Apple anulowane.',true); });
      }
    }
  }catch(e){ /* przycisk się nie pokaże */ } }
}
async function acLogout(){ logout(); myHandle=null; await ensureSession(); acAfterLogin(); }

export async function renderProfil(){
  const el=$m('profilStats'); el.innerHTML=`<div class="profil-empty">${bbLoader}</div>`;
  const hd0=$m('profilHead'); if(hd0) hd0.innerHTML=`<div class="profil-empty" style="padding:20px 0">${bbLoader}</div>`;   // głowa też pokazuje loader (nie pustkę)
  await ensureSession();   // gest „Profil" → utwórz sesję/profil, by dało się ustawić ksywkę
  const p=await fetchProfile();
  if(!p){ $m('profilHandle').value=''; el.innerHTML='<div class="profil-empty">Profil niedostępny.<br>Brak połączenia z serwerem — spróbuj odświeżyć.</div>'; return; }
  if(!p.handle || p.handle==='gracz'){ p.handle=funnyHandle(); setHandle(p.handle); }   // pierwsza wizyta → zabawna ksywa
  myHandle=p.handle;
  $m('profilHandle').value=p.handle;
  const s=p.standing;
  const acc = s.correct&&s.matches ? Math.round(s.correct/(s.matches||1)) : null;
  // nagłówek: awatar + ksywa (design)
  const hd=$m('profilHead');
  if(hd){
    const av=escapeHtml((p.handle||'?').slice(0,1).toUpperCase());
    const sub = s.matches>0 ? `${s.matches} ${s.matches===1?'mecz':'meczów'} · ${s.points} pkt` : 'Nowy gracz — jeszcze bez serii';
    hd.innerHTML=`<span class="pf-av" style="background:${mpAvatarColor(p.handle)}">${av}</span>
      <div class="pf-name">${escapeHtml(p.handle||'gracz')}</div>
      <div class="pf-sub">${escapeHtml(sub)}</div>`;
  }
  const cats=Object.entries(p.byCat).sort((a,b)=>b[1].n-a[1].n);
  const CATCOL=['var(--green)','var(--blue)','var(--purple)','var(--gold)'];
  const catRows=cats.length? cats.map(([k,v],i)=>{
    const pct=Math.round(v.ok/v.n*100), col=CATCOL[i%CATCOL.length];
    return `<div class="pf-cat"><span class="lbl">${escapeHtml(catLabel(k))}</span>
      <span class="bar"><i style="width:${pct}%;background:${col}"></i></span><span class="pct" style="color:${col}">${pct}%</span></div>`;
  }).join('') : '<div class="profil-empty" style="padding:14px">Brak rozegranych pytań solo.</div>';
  // odznaki: kilka pochodnych ze statystyk + reszta zablokowana (placeholdery — pełny system później)
  const badge=(on,emoji,lab)=>`<div class="pf-badge${on?'':' lock'}"><span>${on?emoji:ic('lock')}</span><small>${on?lab:'—'}</small></div>`;
  const badgeDefs=[ [s.matches>0,'🎵','Pierwszy mecz'], [s.matches>=10,'🔥','10 meczów'],
    [s.points>=100,'💯','100 pkt'], [false,'','—'] ];
  const badges=badgeDefs.map(b=>badge(b[0],b[1],b[2])).join('');
  const badgeOn=badgeDefs.filter(b=>b[0]).length;
  el.innerHTML=`<div class="pf-lbl">Konto</div>
    ${acAccountHTML(!!p.secured, p.email)}
    <div class="pf-stats">
      <div class="pf-st g"><b>${s.matches}</b><small>MECZE</small></div>
      <div class="pf-st b"><b>${s.correct}</b><small>TRAFNE</small></div>
      <div class="pf-st y"><b>${s.points}</b><small>PUNKTY</small></div>
    </div>
    <div class="pf-lbl">Najlepsze kategorie</div>
    ${catRows}
    <div class="pf-lbl">Odznaki <span class="pf-badgecount">${badgeOn} / 12</span></div>
    <div class="pf-badges">${badges}</div>`;
  if(!p.secured) acInitAuthButtons();   // lazy-load GIS + Apple JS → natywne przyciski
}

// zapis ksywy z Profilu (stan ksywy + nazwa w MP żyją tutaj)
export async function saveHandle(v){ await setHandle(v); myHandle=v; mpMe.name=mpMe.name||v; }

// most do HTML (onclick="" w generowanych stringach żyje w globalnym scope)
Object.assign(window,{ dzCreate, dzJoin, dzLeave, dzAddFriend, dzRespond, dzCopy, dzPlay, dzJoinGame, acLogout });
