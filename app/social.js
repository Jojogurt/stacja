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
import { rankCategories } from '../core/matchRecord.js';
import { pickHandle, isSpicyHandle } from '../core/handles.js';
import { dailyInfo } from './daily.js';   // F8b: seria Stacji dnia (localStorage) w profilu

const $m = id => document.getElementById(id);
const bbLoader = '<div class="bb-loader"><i></i><i></i><i></i></div>';   // lokalny (bez kruchego współdzielonego importu)

/* —— zależności wstrzyknięte z app.js (warstwa MP + etykiety kategorii) ——
 * Zadeklarowane jako locale, by przeniesiony kod wołał je dokładnie tak jak wcześniej. */
let mpMe, mpEnterRoom, mpRandCode, mpUnlockAudio, mpAvatarColor, catLabel;
export function initSocial(deps){
  ({ mpMe, mpEnterRoom, mpRandCode, mpUnlockAudio, mpAvatarColor, catLabel } = deps);
}

/* ---- wejście / wyjście z trybu ---- */
const SCR_HEAD={ solo:'Nowy mecz', liga:'Drużyna i znajomi', profil:'Profil' };
export function showScreen(s){
  document.body.classList.remove('menu','solo','mp','liga','profil','salon'); document.body.classList.add(s);   // 'salon' (ekran-monitor TV) dokłada/zdejmuje mpRender
  if(s==='mp') mpPrefillName();
  const tt=$m('scrTitle'); if(tt) tt.textContent=SCR_HEAD[s]||'';
  // F6a (F12): powiadom moduły (solo: „Kontynuuj mecz" w menu, nagłówek rundy zamiast „Ułóż mecz")
  try{ window.dispatchEvent(new window.CustomEvent('stacja:screen', { detail:s })); }catch(_e){}
}

let dzMe=null;   // {id, handle, emoji, friend_code}

/* ---- ksywa: jedna tożsamość dla profilu i lobby MP ----
   Brak ksywy → losujemy zabawny nick z listy i zapisujemy (maxlength 32 — input i serwer). */
let myHandle=null;
// F6b (U10): pule ksyw w core/handles.js — domyślnie NEUTRALNE; „Pikantne ksywy" (menu) = opt-in
const SPICY_KEY='stacjaSpicy', HANDLE_KEY='stacjaHandle';
const spicyOn=()=>{ try{ return localStorage.getItem(SPICY_KEY)==='on'; }catch(_e){ return false; } };
function funnyHandle(){ return pickHandle({ spicy:spicyOn() }); }
// lokalna kopia ksywy (deep-link `?room=` dołącza od razu, gdy gracz już ją ma — F6b/F5)
function cacheHandle(h){ try{ if(h) localStorage.setItem(HANDLE_KEY, h); else localStorage.removeItem(HANDLE_KEY); }catch(_e){} }
export function knownHandle(){ if(myHandle) return myHandle; try{ return localStorage.getItem(HANDLE_KEY)||null; }catch(_e){ return null; } }
// automatycznie nadana pikantna ksywa przy wyłączonych „Pikantnych ksywach" → podmień na neutralną
const needsNewHandle=(h)=> !h || h==='gracz' || (isSpicyHandle(h) && !spicyOn());
// zwróć stabilną ksywę: z profilu, a jak brak — wygeneruj i zapisz (idempotentne, cache w myHandle)
export async function ensureHandle(){
  if(myHandle) return myHandle;
  await ensureSession();
  const p=await fetchProfile();
  let h=p&&p.handle;
  if(needsNewHandle(h)){ h=funnyHandle(); setHandle(h); }
  myHandle=h; cacheHandle(h); return h;
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
  const notice = noAuth ? `<div class="dz-acct err">⚠️ Brak połączenia z serwerem — drużyny i znajomi chwilowo niedostępne. Spróbuj odświeżyć.</div>` : '';
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
  dzActiveTeamId = team ? team.id : null;   // MVP-3: id do tagowania meczu „z drużyną"
  dzTeamSync(team);                // podłącz/odłącz kanał lobby drużyny (#4)
  const teamCard = team ? `
    <div class="dz-team">
      <div class="dz-team-top"><span class="em">${escapeHtml(team.emoji||'🍺')}</span>
        <span class="nm"><b>${escapeHtml(team.name)}</b><small>${team.members} os. · kod <b>${escapeHtml(team.code)}</b></small></span>
        <span class="dz-online" id="dzOnline"></span></div>
      <div class="dz-team-btns">
        <button class="dz-play" onclick="dzPlay()">${ic('play')} Zagraj</button>
        <button class="dz-mini" data-v="${escapeHtml(team.code)}" onclick="dzCopy(this.dataset.v)">${ic('copy')} kod</button>
        <button class="dz-mini red" data-v="${escapeHtml(String(team.id||''))}" onclick="dzLeave(this.dataset.v)">wyjdź</button>
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
      <span class="acts"><button class="dz-yes" data-v="${escapeHtml(String(p.req_id))}" onclick="dzRespond(+this.dataset.v,true)">✓</button><button class="dz-no" data-v="${escapeHtml(String(p.req_id))}" onclick="dzRespond(+this.dataset.v,false)">✗</button></span></div>`).join('');
  const sentRows = sent.map(s=>`
    <div class="dz-fr"><span class="who">${av(s.handle)}${escapeHtml(s.handle||'gracz')}</span>
      <span class="pendtag">⏳ wysłano</span></div>`).join('');
  const friendRows = friends.map(f=>`<div class="dz-fr"><span class="who">${av(f.handle)}${escapeHtml(f.handle||'gracz')}</span>${
    secured && f.profile_id
      ? `<button class="dz-invite" data-fid="${escapeHtml(String(f.profile_id))}" data-fh="${escapeHtml(f.handle||'gracz')}" onclick="dzInvite(this.dataset.fid, this.dataset.fh)">${ic('play')} zaproś</button>`
      : `<span class="code">${escapeHtml(f.friend_code||'')}</span>`}</div>`).join('')
    || '<div class="dz-empty">Brak znajomych — dodaj kogoś po kodzie i zagrajcie razem.</div>';
  const friendAddRow = secured
    ? `<div class="dz-row2"><input id="dzFriend" maxlength="6" placeholder="KOD ZNAJOMEGO" style="text-transform:uppercase"><button class="dz-go" onclick="dzAddFriend()">Dodaj</button></div>`
    : `<div class="dz-hint">${ic('lock')} zaloguj się w Profilu, żeby dodawać znajomych</div>`;
  const friendSection = `
    <div class="dz-lbl">Twój kod znajomego</div>
    <div class="dz-mycode"><b>${escapeHtml(myCode)}</b><button class="dz-mini" data-v="${escapeHtml(myCode)}" onclick="dzCopy(this.dataset.v)">${ic('copy')} kopiuj</button></div>
    ${friendAddRow}
    ${pending.length?`<div class="dz-lbl">Zaproszenia <span class="dz-badge">${pending.length}</span></div>${pendRows}`:''}
    ${sent.length?`<div class="dz-lbl">Wysłane zaproszenia</div>${sentRows}`:''}
    <div class="dz-lbl">Lista znajomych</div>
    ${friendRows}`;

  el.innerHTML = notice + kontoSection + teamSection + friendSection + '<div class="dz-hint" id="dzMsg"></div>';
  dzRenderLobby();   // odśwież wskaźnik online + baner aktywnej gry (jeśli kanał już coś wie)
  ensureFriendChannel();   // MVP-3: nasłuch zaproszeń od znajomych (raz, po poznaniu tożsamości)
  }catch(e){ el.innerHTML='<div class="liga-empty">Nie udało się wczytać drużyny i znajomych.<br>Sprawdź internet i spróbuj ponownie za chwilę.<br><small>szczegóły: '+escapeHtml(String(e&&e.message||e))+'</small></div>'; }
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
  mpEnterRoom(code, true, dzActiveTeamId);   // MVP-3: mecz otagowany drużyną (host)
}

/* ---- #4: lobby drużyny (kanał realtime per drużyna) ----
   Reuse cfChannel (relay: presence + broadcast). Po wejściu na ekran Drużyna członkowie
   subskrybują kanał „team-<kod>": presence = kto online, event „gamestart" = host ruszył grę. */
let dzTeamCh=null, dzTeamCode=null, dzOnlineCount=0, dzActiveGame=null, dzActiveTeamId=null;
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

/* ---- MVP-3: znajomi W GRZE — osobisty kanał zaproszeń (realtime, relay) ----
   Każdy klient słucha własnego kanału „user-<id>"; znajomy wysyła tam „invite" z kodem pokoju.
   Dostarczenie tylko gdy odbiorca online (relay ulotny) — jak „poke". */
let dzUserCh=null;
function ensureFriendChannel(){
  if(dzUserCh || !(mpMe&&mpMe.id)) return;
  dzUserCh=cfChannel('user-'+mpMe.id, {config:{broadcast:{self:false}, presence:{key:mpMe.id}}});
  dzUserCh.on('broadcast',{event:'invite'},({payload})=>{ if(payload && payload.by!==mpMe.id) dzShowInvite(payload); });
  dzUserCh.subscribe(async(st)=>{ if(st==='SUBSCRIBED') await dzUserCh.track({name:mpMe.name||myHandle||'gracz'}); });
}
// „zaproś do gry" ze znajomym: utwórz pokój (host) i wyślij kod na kanał znajomego
async function dzInvite(friendId, handle){
  const n=await ensureHandle(); mpMe.name=n; setHandle(n);
  const code=mpRandCode();
  try{
    const ch=cfChannel('user-'+friendId, {config:{broadcast:{self:false}, presence:{key:mpMe.id}}});
    ch.subscribe((st)=>{ if(st==='SUBSCRIBED'){
      ch.send({type:'broadcast',event:'invite',payload:{code, byName:n, by:mpMe.id}});
      setTimeout(()=>{ try{ ch.unsubscribe(); }catch(e){} }, 1500);   // ulotny nadawca — daj czas na dostarczenie
    }});
  }catch(e){}
  dzMsg('Zaproszenie wysłane do '+(handle||'znajomego')+' — czekasz w pokoju.', false);
  showScreen('mp'); mpUnlockAudio(); mpEnterRoom(code, true);
}
// globalny baner zaproszenia (fixed) — działa na każdym ekranie
function dzShowInvite(p){
  const code=String(p.code||'').replace(/[^A-Za-z0-9]/g,'').slice(0,8); if(!code) return;
  let el=$m('dzInviteBanner');
  if(!el){ el=document.createElement('div'); el.id='dzInviteBanner'; el.className='dz-invite-banner'; document.body.appendChild(el); }
  el.dataset.code=code;
  el.innerHTML=`<span>🎮 <b>${escapeHtml(p.byName||'Znajomy')}</b> zaprasza do gry</span>
    <button class="go" onclick="dzAcceptInvite()">Dołącz →</button><button class="x" onclick="dzDismissInvite()" aria-label="Zamknij">×</button>`;
  el.classList.add('show');
}
async function dzAcceptInvite(){
  const el=$m('dzInviteBanner'); const code=el&&el.dataset.code; dzDismissInvite(); if(!code) return;
  const n=await ensureHandle(); mpMe.name=n; setHandle(n);
  showScreen('mp'); mpUnlockAudio(); mpEnterRoom(code, false);
}
function dzDismissInvite(){ const el=$m('dzInviteBanner'); if(el) el.classList.remove('show'); }

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
async function acLogout(){ logout(); myHandle=null; cacheHandle(null); await ensureSession(); acAfterLogin(); }

export async function renderProfil(){
  const el=$m('profilStats'); el.innerHTML=`<div class="profil-empty">${bbLoader}</div>`;
  const hd0=$m('profilHead'); if(hd0) hd0.innerHTML=`<div class="profil-empty" style="padding:20px 0">${bbLoader}</div>`;   // głowa też pokazuje loader (nie pustkę)
  await ensureSession();   // gest „Profil" → utwórz sesję/profil, by dało się ustawić ksywkę
  const p=await fetchProfile();
  if(!p){ $m('profilHandle').value=''; el.innerHTML='<div class="profil-empty">Profil niedostępny.<br>Brak połączenia z serwerem — spróbuj odświeżyć.</div>'+dailyProfileHTML(); return; }
  if(needsNewHandle(p.handle)){ p.handle=funnyHandle(); setHandle(p.handle); }   // pierwsza wizyta → zabawna ksywa (F6b: neutralna domyślnie)
  myHandle=p.handle; cacheHandle(p.handle);
  $m('profilHandle').value=p.handle;
  const s=(p.standing && typeof p.standing==='object') ? p.standing : { matches:0, correct:0, points:0 };   // F6a: odporność na niepełną odpowiedź API
  // nagłówek: awatar + ksywa (design)
  const hd=$m('profilHead');
  if(hd){
    const av=escapeHtml((p.handle||'?').slice(0,1).toUpperCase());
    const sub = s.matches>0 ? `${s.matches} ${s.matches===1?'mecz':'meczów'} · ${s.points} pkt` : 'Nowy gracz — jeszcze bez serii';
    hd.innerHTML=`<span class="pf-av" style="background:${mpAvatarColor(p.handle)}">${av}</span>
      <div class="pf-name">${escapeHtml(p.handle||'gracz')}</div>
      <div class="pf-sub">${escapeHtml(sub)}</div>`;
  }
  // F6a (U12): „Najlepsze kategorie" po SKUTECZNOŚCI (min. 5 pytań w kategorii), nie po liczbie pytań
  const rawCats=p.byCat||{};
  const cats=rankCategories(rawCats, 5);
  const CATCOL=['var(--green)','var(--blue)','var(--purple)','var(--gold)'];
  const catRows=cats.length? cats.map(({key:k, n, ok:hit},i)=>{
    const pct=Math.round(hit/n*100), col=CATCOL[i%CATCOL.length];
    return `<div class="pf-cat"><span class="lbl">${escapeHtml(catLabel(k))}</span>
      <span class="bar"><i style="width:${pct}%;background:${col}"></i></span><span class="pct" style="color:${col}">${pct}%</span></div>`;
  }).join('') : (Object.keys(rawCats).length
    ? '<div class="profil-empty" style="padding:14px">Zagraj min. 5 pytań w kategorii, żeby zobaczyć skuteczność.</div>'
    : '<div class="profil-empty" style="padding:14px">Brak rozegranych pytań solo.</div>');
  // odznaki: pochodne ze statystyk — licznik = faktyczna liczba definicji (bez placeholderów „/ 12")
  const badge=(on,emoji,lab)=>`<div class="pf-badge${on?'':' lock'}"><span>${on?emoji:ic('lock')}</span><small>${escapeHtml(lab)}</small></div>`;
  const badgeDefs=[ [s.matches>0,'🎵','Pierwszy mecz'], [s.matches>=10,'🔥','10 meczów'],
    [s.correct>=50,'🎯','50 trafnych'], [s.points>=1000,'💯','1000 pkt'] ];
  const badges=badgeDefs.map(b=>badge(b[0],b[1],b[2])).join('');
  const badgeOn=badgeDefs.filter(b=>b[0]).length;
  el.innerHTML=`<div class="pf-lbl">Konto</div>
    ${acAccountHTML(!!p.secured, p.email)}
    <div class="pf-stats">
      <div class="pf-st g"><b>${s.matches}</b><small>MECZE</small></div>
      <div class="pf-st b"><b>${s.correct}</b><small>TRAFNE</small></div>
      <div class="pf-st y"><b>${s.points}</b><small>PUNKTY</small></div>
    </div>
    ${dailyProfileHTML()}
    <div class="pf-lbl">Najlepsze kategorie</div>
    ${catRows}
    <div class="pf-lbl">Odznaki <span class="pf-badgecount">${badgeOn} / ${badgeDefs.length}</span></div>
    <div class="pf-badges">${badges}</div>`;
  if(!p.secured) acInitAuthButtons();   // lazy-load GIS + Apple JS → natywne przyciski
}

// F8b: „Stacja dnia" w profilu — bieżąca i NAJLEPSZA seria dni (lokalnie, bez serwera)
function dailyProfileHTML(){
  let d; try{ d=dailyInfo(); }catch(_e){ return ''; }
  return `<div class="pf-lbl">Stacja dnia</div>
    <div class="pf-stats" id="pfDaily">
      <div class="pf-st y"><b>🔥 ${Number(d.streak)||0}</b><small>SERIA DNI</small></div>
      <div class="pf-st g"><b>${Number(d.best)||0}</b><small>NAJLEPSZA SERIA</small></div>
      <div class="pf-st b"><b>${Number(d.played)||0}</b><small>ZAGRANE DNI</small></div>
    </div>`;
}

// zapis ksywy z Profilu (stan ksywy + nazwa w MP żyją tutaj)
export async function saveHandle(v){ await setHandle(v); myHandle=v; cacheHandle(v); mpMe.name=mpMe.name||v; }

/* F6b (U10): przełącznik „Pikantne ksywy" w menu (domyślnie WYŁ.) — dotyczy losowanych ksyw */
(function wireSpicy(){
  const seg=document.getElementById('spicySeg'); if(!seg) return;
  const sync=()=>{ const on=spicyOn(); seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.spicy===(on?'on':'off'))); };
  seg.querySelectorAll('button').forEach(b=> b.onclick=()=>{ try{ localStorage.setItem(SPICY_KEY, b.dataset.spicy==='on'?'on':'off'); }catch(_e){} sync(); });
  sync();
})();

// most do HTML (onclick="" w generowanych stringach żyje w globalnym scope)
Object.assign(window,{ dzCreate, dzJoin, dzLeave, dzAddFriend, dzRespond, dzCopy, dzPlay, dzJoinGame, acLogout,
  dzInvite, dzAcceptInvite, dzDismissInvite });   // MVP-3: zaproszenia znajomych
