/* test/integration.js — siatka testów integracyjnych (jsdom).
 * Ładuje app.js w realnym DOM index.html i klika kluczowe ścieżki.
 * Uruchom: node test/integration.js  (wymaga devDep: jsdom)
 * Cel: łapać regresje ŁADOWANIA i interakcji przy rozbijaniu app.js. */
import { bootApp, $, txt, click } from './domEnv.js';

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.error('  ✗ '+m);} };
const tick=()=>new Promise(r=>setTimeout(r,0));
const settle=async(n=4)=>{ for(let i=0;i<n;i++) await tick(); };
async function group(name, fn){ console.log('• '+name); try{ await fn(); }catch(e){ fail++; console.error('  ✗ WYJĄTEK: '+(e&&e.stack||e)); } }

// twardy reset wyboru picker'a (jeden boot dzielony → testy muszą być izolowane):
// odznacz wszystkie kategorie i wszystkie tryby, zdejmij „playing"
const resetSelection=(window)=>{
  window.document.querySelectorAll('.tick.on').forEach(t=>t.click());
  window.document.querySelectorAll('#modeTicks .grp-chip.on').forEach(c=>c.click());
  window.document.body.classList.remove('playing');
};
const modeChip=(window, re)=>[...window.document.querySelectorAll('#modeTicks .grp-chip')].find(c=>re.test(c.textContent));

// kategorie wg rodzaju (po załadowaniu window.CATEGORIES)
const catsByKind=(window)=>{
  const C=window.CATEGORIES||{};
  const all={...(C.decades||{}),...(C.styles||{}),...(C.playlists||{}),...(C.lyrics||{}),...(C.quiz||{})};
  const audio=Object.keys(all).find(k=>!all[k].kind && (all[k].artists||all[k].songs));
  const lyrics=Object.keys(C.lyrics||{})[0] || Object.keys(all).find(k=>all[k].kind==='lyrics');
  const quiz=Object.keys(C.quiz||{})[0] || Object.keys(all).find(k=>all[k].kind==='quiz');
  return { audio, lyrics, quiz };
};

// JEDEN boot dla całej siatki: moduły app/ to singletony (cache ESM) — drugi boot nie
// re-wiązałby DOM/window. serverAuthority czytane przy ładowaniu; roomsBase ustawiamy runtime
// dopiero w grupie MP (reszta testów działa jak dotąd z pustym base → wariant „bez backendu").
const { window, fetchCalls, wsInstances, audioInstances } = await bootApp({ serverAuthority:true });

await group('load: app.js montuje się bez wyjątku', async ()=>{
  ok(window.STACJA_VERSION, 'STACJA_VERSION ustawione: '+window.STACJA_VERSION);
  ok($(window,'ticks') && $(window,'ticks').querySelectorAll('.tick').length>0, 'tuner: ticki epok wyrenderowane');
  ok($(window,'modeTicks') && $(window,'modeTicks').querySelectorAll('.grp-chip').length>0, 'chipy trybów wyrenderowane');
  ok($(window,'piperToggle') && /lepszy głos/.test($(window,'piperToggle').textContent), 'lektor: etykieta Pipera (moduł app/lektor.js)');
});

await group('picker: wybór kategorii → podsumowanie meczu (core/picker.js)', async ()=>{
  const tickEl=$(window,'ticks').querySelector('.tick:not(.rnd)');
  tickEl.click();
  ok(/utworów/.test(txt(window,'matchInfo')), 'po wyborze kategorii: liczba utworów — '+txt(window,'matchInfo'));
  // wyłącz jedyny tryb (music) → stan pusty „zaznacz…"
  const modeBtn=$(window,'modeTicks').querySelector('.grp-chip.on')||$(window,'modeTicks').querySelector('.grp-chip');
  modeBtn.click();
  ok(/zaznacz/.test(txt(window,'matchInfo')), 'bez trybu: komunikat „zaznacz…"');
  modeBtn.click(); // przywróć music
  tickEl.click();  // odznacz kategorię (czysty stan na kolejne testy)
});

await group('audio: mecz solo → newRound → startAudio (ścieżka audio)', async ()=>{
  resetSelection(window);
  const { audio:catKey } = catsByKind(window);
  ok(catKey, 'jest kategoria audio: '+catKey);
  // zaznacz TYLKO kategorię audio + tryb music (deterministycznie)
  const tk=[...window.document.querySelectorAll('.tick:not(.rnd)')].find(t=>t.dataset.era===catKey);
  ok(tk, 'jest tick kategorii audio');
  tk.click();
  const musicChip=modeChip(window, /muzyka/); if(musicChip && !musicChip.classList.contains('on')) musicChip.click();
  const before=fetchCalls.length;
  click(window,'matchStart');
  await settle(10);
  ok(window.document.body.classList.contains('playing'), 'body.playing — mecz wystartował');
  ok(fetchCalls.length>before, 'newRound odpytał sieć (resolveTrack → itunes)');
  ok($(window,'check') && $(window,'check').disabled===false, 'startAudio dograł: przycisk „sprawdź" odblokowany');
});

await group('lektor: tryb lektor → knob → synteza mowy (app/lektor.js)', async ()=>{
  const { lyrics:lyrKey } = catsByKind(window);
  if(!lyrKey){ ok(true, '(brak kategorii lyrics — pomijam)'); return; }
  resetSelection(window);
  // zaznacz TYLKO kategorię tekstów + TYLKO tryb lektor → pierwszy slot na pewno lektor
  const tk=[...window.document.querySelectorAll('.tick')].find(t=>t.dataset.era===lyrKey);
  ok(tk, 'jest tick kategorii tekstów: '+lyrKey);
  if(tk && !tk.classList.contains('on')) tk.click();
  const lektorChip=modeChip(window, /lektor/);
  if(lektorChip && !lektorChip.classList.contains('on')) lektorChip.click();
  let spoke=0; window.speechSynthesis.speak=()=>{ spoke++; };
  click(window,'matchStart');
  await settle(10);
  ok(window.document.body.classList.contains('playing'), 'mecz lektor wystartował');
  // knob → toggleAudio (mode=lektor) → lektorPlay → speak
  $(window,'knob').click();
  await settle(6);
  ok(spoke>0, 'lektor: synteza mowy wywołana (speechSynthesis.speak)');
});

await group('ekrany: nawigacja menu → body class (showScreen)', async ()=>{
  $(window,'goSolo').click();
  ok(window.document.body.classList.contains('solo'), 'goSolo → body.solo');
});

await group('social: liga/profil renderują (wariant wylogowany, bez backendu)', async ()=>{
  $(window,'goLiga').click();
  await settle(8);
  ok(window.document.body.classList.contains('liga'), 'goLiga → body.liga');
  ok(($(window,'druzynaBody')||{}).innerHTML?.length>0, 'renderDruzyna wypełnił #druzynaBody');
  $(window,'goProfil').click();
  await settle(8);
  ok(window.document.body.classList.contains('profil'), 'goProfil → body.profil');
});

// MP używa transportu — fake WebSocket + serverAuthority (zaślepka DO w domEnv.js); ten sam boot.
await group('MP: pokój hosta → lobby → picker renderują (app/mp.js)', async ()=>{
  const w = window;
  w.STACJA_CONFIG.roomsBase='https://test.invalid';   // runtime: włącz transport (fake WS) dla MP
  resetSelection(window);
  $(w,'goMp').click(); await settle(4);
  ok(w.document.body.classList.contains('mp'), 'goMp → body.mp');
  $(w,'mpCreate').click(); await settle(8);   // host tworzy pokój → mpEnterRoom → fake WS → lobby
  ok($(w,'mpRoom').style.display==='' , 'pokój widoczny (#mpRoom)');
  ok($(w,'mpRoom').innerHTML.length>200, 'lobby wyrenderowane (niepuste)');
  ok(!/Błąd kanału|Brak połączenia/.test($(w,'mpRoom').innerHTML), 'lobby bez bannera błędu transportu');
  // host: poczekalnia → „ułóż mecz" (picker jest lokalny, bez serwera)
  ok(typeof w.mpLobbyStart==='function', 'most do HTML: mpLobbyStart na window');
  w.mpLobbyStart(); await settle(4);
  const html=$(w,'mpRoom').innerHTML;
  ok(/Kategorie/.test(html) && /Tryby pytań/.test(html) && /Liczba rund/.test(html), 'picker MP: sekcje Kategorie/Tryby/Rundy');
  ok(/um-start/.test(html), 'picker MP: przycisk startu meczu');
  // toggle kategorii w pickerze MP → re-render bez wyjątku
  const before=html.length;
  w.mpToggleGrp && w.mpToggleGrp('dekady'); await settle(2);
  ok($(w,'mpRoom').innerHTML.length>0, 'mpToggleGrp → re-render pickera bez wyjątku');
  // toggle „Tryb salonowy" w pickerze → zaznaczony stan w re-renderze
  ok(typeof w.mpSetSalon==='function', 'most do HTML: mpSetSalon na window');
  w.mpSetSalon(true); await settle(2);
  ok(/um-salon-toggle on/.test($(w,'mpRoom').innerHTML) && /Tryb salonowy/.test($(w,'mpRoom').innerHTML), 'picker MP: toggle „Tryb salonowy" zaznaczony');
  w.mpSetSalon(false); await settle(2);   // wyłącz — kolejne testy pushują stan bez salonu
});

await group('MP: faza gry (play/kombinuj) renderuje (warstwa renderu app/mp.js)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  ok(ws && ws._id, 'aktywny kanał (fake WS)');
  const game = { phase:'play', round:1, rounds:4, si:0, qi:0, mode:'music', catKey:'d80', catLabel:'80s',
    answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    proposals:[], votes:{}, passed:[], preview:'https://x/p.m4a', lyric:'', prompt:'',
    playNonce:1, timer:0, endsAt:null, beerTally:{}, hostId:ws._id, results:[] };
  ws.pushState(game); await settle(8);                 // {t:'state'} → mpAfterSync → mpRender(play) + mpStartListenWindow + mpPlayLocal
  ok(/id="mpKnob"/.test($(w,'mpRoom').innerHTML), 'faza słuchaj: gałka odtwarzania');
  ok(!/undefined is not|Cannot read/.test($(w,'mpRoom').innerHTML), 'play render bez wyjątku');
  // EFEKT (nie tylko render): mpStartListenWindow + mpPlayLocal MUSZĄ zadziałać, inaczej audio nie
  // startuje i faza nie przechodzi (regresja: brak importu w mp-render rzuca, transport łyka po cichu).
  ok($(w,'mpListenBar') && $(w,'mpListenBar').querySelector('i'), 'listen-bar wyrenderowany (auto-przejście)');
  ok(/ładowanie|gra/.test(($(w,'mpPlayStatus')||{}).textContent||''), 'audio auto-start: mpPlayLocal ustawił status (nie zawisł na „posłuchaj")');
  // pod-faza „kombinuj" → composer/sloty odpowiedzi
  w.mpGoKombinuj && w.mpGoKombinuj(); await settle(4);
  const h=$(w,'mpRoom').innerHTML;
  ok(h.length>200, 'kombinuj: niepusty render');
  ok(/mpProp_|mp-slot|mpChatIn|mpComposer|odpowied/i.test(h), 'kombinuj: pola odpowiedzi / composer');
  // KOLEJNOŚĆ sekcji (design): profile → odpowiedź drużyny → kolumny → [foot: input+pewność+emotki]
  const ix=s=>h.indexOf(s);
  ok(ix('id="mpRoster"')<ix('id="mpTeam"') && ix('id="mpTeam"')<ix('id="mpBoard"')
     && ix('id="mpBoard"')<ix('mp-foot') && ix('mp-form')>ix('mp-foot') && ix('mp-reacts')>ix('mp-form'),
     'kolumny: kolejność profile→team→kolumny→[foot:input→emotki]');
  ok((h.match(/mp-hr/g)||[]).length>=3, 'kolumny: sekcje oddzielone kreskami (mp-hr)');
  // #5: brak kreski MIĘDZY kolumnami a polem wpisywania (board styka się z foot bez mp-hr)
  ok(ix('id="mpBoard"')<ix('mp-foot') && h.slice(ix('id="mpBoard"'), ix('mp-form')).indexOf('mp-hr')===-1,
     'kolumny: brak kreski board↔input (#5)');
  ok(/class="mp-foot"/.test(h), 'kolumny: pasek emotek/input w sticky foot');
  // STAN Z GŁOSAMI → mpSlotsHTML porównuje przez norm (regresja: norm nieimportowane → throw, render zamarza).
  const g2 = { ...game, playNonce:1,
    proposals:[{id:'p1',aid:'a1',by:ws._id,byName:'Ja',conf:'normal',values:{title:'Hey Jude',artist:'Beatles'}}],
    votes:{ title:{[ws._id]:'Hey Jude'}, artist:{[ws._id]:'Beatles'} } };
  ws.pushState(g2); await settle(4);
  ok($(w,'mpRoom').innerHTML.includes('Hey Jude'), 'render ze stanem+głosami pokazuje typ (mpSlotsHTML/norm OK)');
  // propose przez UI: optymistyczny apply + mpRender NIE może rzucać
  w.mpGoKombinuj && w.mpGoKombinuj(); await settle(3);
  const ti=$(w,'mpProp_title'), ar=$(w,'mpProp_artist');
  if(ti) ti.value='Yesterday'; if(ar) ar.value='Beatles';
  w.mpPropose && w.mpPropose(); await settle(4);
  ok($(w,'mpRoom').innerHTML.includes('Yesterday'), 'mpPropose: typ pojawia się w odpowiedzi drużyny');
});

await group('MP: tryb fragment — po dograniu klik gra fragment OD NOWA (nie resztę utworu)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const SNIP=2, START=5;
  ws.pushState({ phase:'play', round:1, rounds:4, si:0, qi:0, mode:'snippet', catKey:'d80', catLabel:'80s', snipStart:START,
    answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    proposals:[], votes:{}, passed:[], preview:'https://x/p.m4a', lyric:'', prompt:'',
    playNonce:7, timer:0, endsAt:null, beerTally:{}, hostId:ws._id, results:[] });   // nonce≠wcześniejsze → startPlay
  await settle(6);
  const a = audioInstances.find(x=>x.src && x.src.includes('p.m4a')) || audioInstances[audioInstances.length-1];
  ok(a && !a.paused && Math.abs(a.currentTime-START)<0.01, 'fragment startuje od snipStart');
  const playsBefore = a.plays;
  // symuluj dograny CAŁY fragment (nie piosenkę)
  a.currentTime = START + SNIP + 0.1; a.emit('timeupdate'); await settle(2);
  ok(a.paused && a._snipEnd, 'po fragmencie: pauza + flaga _snipEnd');
  ok(/↻ jeszcze raz/.test(($(w,'mpPlayStatus')||{}).textContent||''), 'status: „fragment · ↻ jeszcze raz"');
  ok(/M17\.65/.test(($(w,'mpKnobIcon')||{}).innerHTML||''), 'ikona gałki = replay (↻)');
  // klik gałki → REPLAY fragmentu (seek do startu), NIE wznowienie reszty utworu
  w.mpKnobTap(); await settle(3);
  ok(Math.abs(a.currentTime-START)<0.5 && !a.paused && a.plays>playsBefore, 'klik → fragment od nowa (currentTime≈start, nowe play)');
});

await group('MP: akcje gracza (react/say/propose/typing) nie rzucają', async ()=>{
  const w = window;
  // reakcja (emotka) — float + broadcast
  let threw=false;
  try{ w.mpReact && w.mpReact('🔥'); }catch(_e){ threw=true; }
  ok(!threw, 'mpReact bez wyjątku');
  // wiadomość czatu (pole + wyślij)
  const sayIn=$(w,'mpSayIn'); if(sayIn){ sayIn.value='hej'; try{ w.mpSay && w.mpSay(); }catch(_e){ threw=true; } }
  ok(!threw, 'mpSay bez wyjątku');
  // composer typ → propose (wypełnij sloty, wyślij)
  w.mpGoKombinuj && w.mpGoKombinuj(); await settle(3);
  const t0=$(w,'mpProp_title')||$(w,'mpTyp_title'); if(t0) t0.value='Yesterday';
  try{ w.mpComposerSend && w.mpComposerSend(); }catch(_e){ threw=true; }
  ok(!threw, 'mpComposerSend (propose) bez wyjątku');
  // sygnał „pisze…" (throttle/timer)
  try{ w.mpTypingPing && w.mpTypingPing(); }catch(_e){ threw=true; }
  ok(!threw, 'mpTypingPing bez wyjątku');
});

await group('MP: odsłona (reveal) i wynik (done) renderują', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  // ODSŁONA (muzyka): karta utworu + baner + odpowiedź drużyny
  ws.pushState({ phase:'reveal', round:1, rounds:4, si:0, qi:0, slots:[{round:1,cat:'d80',mode:'music'}],
    mode:'music', catKey:'d80', catLabel:'80s', answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    reveal:{ kind:'music', track:'Hey Jude', artist:'Beatles', year:'1968', album:'X', art:'',
      okTitle:true, okArtist:true, teamOk:true, gained:2, firstBy:'Bob', pewniacy:[], pewniakWin:false, pewniakLose:false,
      locked:{title:'Hey Jude',artist:'Beatles'} },
    proposals:[], votes:{}, passed:[], playNonce:2, timer:0 });
  await settle(6);
  const rv=$(w,'mpRoom').innerHTML;
  ok(/rv-card/.test(rv) && /Hey Jude/.test(rv), 'reveal: karta utworu z tytułem');
  ok(/rv-banner/.test(rv) && /mp-next/.test(rv), 'reveal: baner wyniku + przycisk dalej');
  ok(!/undefined is not|Cannot read/.test(rv), 'reveal render bez wyjątku');
  // WYNIK KOŃCOWY
  w.mpAdvance && w.mpAdvance();   // zamknij odsłonę u siebie
  ws.pushState({ phase:'done', score:5, tallyList:[{name:'Host',correct:3},{name:'Bob',correct:1}],
    mvp:{name:'Host',correct:3}, beerTally:{}, playNonce:2 });
  await settle(6);
  const dn=$(w,'mpRoom').innerHTML;
  ok(/dn-hero/.test(dn) && /dn-wk/.test(dn), 'done: hero wyniku + wkład drużyny');
  ok(!/undefined is not|Cannot read/.test(dn), 'done render bez wyjątku');
});

await group('MP: tryb salonowy — host = normalne fazy, większe; bez pól/emotek; board nadpisywalny', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  // host=TV (salon:true): te same fazy co normalnie, ale host nie wpisuje/nie reaguje (latające emotki zostają),
  // może KLIKNĄĆ propozycję (nadpisanie), a TV jest poza paskiem graczy.
  ws.pushState({ phase:'play', round:1, rounds:4, si:0, qi:0, mode:'music', catKey:'d80', catLabel:'80s', salon:true,
    answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    proposals:[{id:'p1',aid:'a1',by:'ktos',byName:'Ala',conf:'normal',values:{title:'Hey Jude',artist:'Beatles'}}],
    votes:{ title:{ktos:'Hey Jude'}, artist:{ktos:'Beatles'} },
    passed:[], preview:'https://x/p.m4a', lyric:'', prompt:'', playNonce:50, timer:0, endsAt:null, beerTally:{}, hostId:ws._id, results:[] });
  await settle(8);
  ok($(w,'mpStage').classList.contains('salon'), 'salon: #mpStage ma klasę .salon (powiększenie CSS)');
  ok(/id="mpKnob"/.test($(w,'mpRoom').innerHTML), 'salon słuchaj: gałka audio (host gra na TV)');
  ok(!/mp-reacts/.test($(w,'mpRoom').innerHTML), 'salon: brak paska wysyłania emotek u hosta');
  // pod-faza kombinuj → board nadpisywalny przez hosta, bez pól/pewności/emotek
  w.mpGoKombinuj && w.mpGoKombinuj(); await settle(4);
  const h=$(w,'mpRoom').innerHTML;
  ok(/id="mpBoard"/.test(h) && h.includes('Hey Jude'), 'salon kombinuj: kolumny z typami telefonów');
  ok(/onclick="mpVote/.test(h), 'salon: board KLIKALNY (host nadpisuje odpowiedź)');
  ok(!/mpProp_|mp-composer|id="mpConf"/.test(h), 'salon: brak pól typowania/pewności na TV');
  ok(!/mp-reacts/.test(h), 'salon kombinuj: brak paska emotek u hosta');
  ok(/mp-lockmini/.test(h), 'salon: host ma „Zatwierdź ✓"');
  ok(!/mp-rz[^>]*\byou\b/.test(h), 'salon: TV (host) poza paskiem graczy');
  ok(!/undefined is not|Cannot read/.test(h), 'salon render bez wyjątku');
});

console.log(`\n${fail?'❌':'✅'} integracja: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
