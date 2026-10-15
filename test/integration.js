/* test/integration.js — siatka testów integracyjnych (jsdom).
 * Ładuje app.js w realnym DOM index.html i klika kluczowe ścieżki.
 * Uruchom: node test/integration.js  (wymaga devDep: jsdom)
 * Cel: łapać regresje ŁADOWANIA i interakcji przy rozbijaniu app.js. */
import { bootApp, $, txt, click } from './domEnv.js';

let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++; console.error('  ✗ '+m);} };
const eq2=(a,b,m)=>ok(a===b, `${m} — oczekiwano ${JSON.stringify(b)}, było ${JSON.stringify(a)}`);
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
window.__MP_REVEAL_AUTO_MS__ = 600000;   // F2b #6: auto-„dalej" na odsłonie wyłączony w siatce (test F2b ustawia krótko)
// F3: siatka nie zależy od danych w toku — brak kategorii quizu (np. pusty questions.js, a data/ ładuje
// quiz-loader, którego jsdom nie odpala) → fixture dopięta zdarzeniem stacja:quiz (ścieżka F2a #8)
if(!Object.keys((window.CATEGORIES&&window.CATEGORIES.quiz)||{}).length){
  window.CATEGORIES.quiz = window.CATEGORIES.quiz || {};
  window.CATEGORIES.quiz['test-quiz'] = { kind:'quiz', label:'Test quiz',
    questions:[{ prompt:'Stolica Polski?', slots:[{key:'a',label:'miasto'}], answers:{a:['Warszawa']} }] };
  window.dispatchEvent(new window.CustomEvent('stacja:quiz'));
  await settle(2);
}
const optByText=(t)=>[...window.document.querySelectorAll('#quizForm .mc-opt')].find(b=>((b.querySelector('.mc-tx')||{}).textContent||'')===t);

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

await group('quiz ABCD (solo): przyciski opcji + wybór + ocena + odsłona', async ()=>{
  resetSelection(window);
  const C=window.CATEGORIES||{}; const qKey=Object.keys(C.quiz||{})[0];
  ok(qKey, 'jest kategoria quizu: '+qKey);
  if(!qKey) return;
  const cat=C.quiz[qKey]; const orig=cat.questions;
  // wstrzyknij JEDNO pytanie ABCD (poprawna = B), by mecz pokazał je deterministycznie
  cat.questions=[{ prompt:'Pytanie testowe ABCD?\nA) Alfa\nB) Beta\nC) Gamma\nD) Delta',
    slots:[{key:'a',label:'litera lub odpowiedź'}], answers:{ a:['B','Beta'] } }];
  try{
    const tk=[...window.document.querySelectorAll('.tick')].find(t=>t.dataset.era===qKey);
    ok(tk, 'jest tick kategorii quizu'); if(tk && !tk.classList.contains('on')) tk.click();   // quiz włącza się sam
    click(window,'matchStart');
    await settle(10);
    const opts=[...window.document.querySelectorAll('#quizForm .mc-opt')];
    ok(opts.length===4, 'ABCD: 4 przyciski opcji (jest: '+opts.length+')');
    ok(!$(window,'qf_a'), 'ABCD: brak pola tekstowego (klikasz zamiast pisać)');
    ok(!$(window,'lyricBox').textContent.includes('Alfa'), 'ABCD: opcje poza treścią pytania (w przyciskach)');
    const bBtn=optByText('Beta');   // F3: opcje tasowane w runtime — szukamy po TEKŚCIE, nie po literze z danych
    ok(bBtn, 'ABCD: jest opcja „Beta"'); bBtn.click();
    ok(bBtn.classList.contains('sel'), 'ABCD: klik zaznacza opcję (.sel)');
    ok(window.document.querySelectorAll('#quizForm .mc-opt.sel').length===1, 'ABCD: zaznaczona dokładnie jedna');
    click(window,'check');
    await settle(6);
    ok($(window,'reveal').classList.contains('show'), 'ABCD: odsłona po „Sprawdź"');
    ok($(window,'revealHead').className.includes('win'), 'ABCD: poprawna odpowiedź → win');
    ok(bBtn.classList.contains('ok'), 'ABCD: poprawna opcja na zielono (.ok)');
    ok(bBtn.disabled, 'ABCD: po ocenie opcje zablokowane');
  } finally { cat.questions=orig; }
});

await group('quiz ABC (solo): 3 opcje też renderują się jako przyciski', async ()=>{
  resetSelection(window);
  const C=window.CATEGORIES||{}; const qKey=Object.keys(C.quiz||{})[0];
  if(!qKey){ ok(true,'(brak kategorii quizu — pomijam)'); return; }
  const cat=C.quiz[qKey]; const orig=cat.questions;
  cat.questions=[{ prompt:'Pytanie z trzema opcjami?\nA) Pierwsza\nB) Druga\nC) Trzecia',
    slots:[{key:'a',label:'litera lub odpowiedź'}], answers:{ a:['C','Trzecia'] } }];
  try{
    const tk=[...window.document.querySelectorAll('.tick')].find(t=>t.dataset.era===qKey);
    if(tk && !tk.classList.contains('on')) tk.click();
    click(window,'matchStart');
    await settle(10);
    const opts=[...window.document.querySelectorAll('#quizForm .mc-opt')];
    ok(opts.length===3, 'ABC: 3 przyciski opcji (jest: '+opts.length+')');
    ok(opts.map(b=>b.dataset.letter).join('')==='ABC', 'ABC: litery A,B,C');
    const cBtn=optByText('Trzecia'); cBtn.click();
    click(window,'check');
    await settle(6);
    ok($(window,'revealHead').className.includes('win'), 'ABC: poprawna („Trzecia") → win');
    ok(cBtn.classList.contains('ok'), 'ABC: poprawna opcja na zielono');
  } finally { cat.questions=orig; }
});

/* ======== F3: silnik oceny quizu (SPEC v2) — solo ======== */
await group('F3 solo: ABCD tasowane w runtime + ocena po wybranej opcji + statKey trenera bez opcji', async ()=>{
  resetSelection(window);
  const C=window.CATEGORIES||{}; const qKey=Object.keys(C.quiz||{})[0];
  const cat=C.quiz[qKey]; const orig=cat.questions; const rnd=Math.random;
  cat.questions=[{ prompt:'F3 ABCD?\nA) Alfa\nB) Beta\nC) Gamma\nD) Delta', slots:[{key:'a',label:'odp'}], answers:{ a:['B','Beta','b'] } }];
  try{
    Math.random=()=>0;   // deterministyczne tasowanie: [Alfa,Beta,Gamma,Delta] → [Beta,Gamma,Delta,Alfa]
    const tk=[...window.document.querySelectorAll('.tick')].find(t=>t.dataset.era===qKey);
    if(tk && !tk.classList.contains('on')) tk.click();
    click(window,'matchStart'); await settle(10);
    Math.random=rnd;
    const opts=[...window.document.querySelectorAll('#quizForm .mc-opt')];
    eq2(opts.map(b=>b.dataset.letter+':'+b.querySelector('.mc-tx').textContent).join(','), 'A:Beta,B:Gamma,C:Delta,D:Alfa', 'opcje potasowane, litery A–D od nowa');
    const old=opts.find(b=>b.dataset.letter==='B');   // litera poprawnej Z DANYCH — teraz to „Gamma"
    old.click(); click(window,'check'); await settle(6);
    ok($(window,'revealHead').className.includes('fail'), 'litera z danych (B=Gamma) ✗ — ocena po opcji, alias „b" nie zalicza');
    ok(optByText('Beta').classList.contains('ok'), 'poprawna („Beta", teraz A) na zielono');
    const rm=txt(window,'rmeta');
    ok(/A\) Beta/.test(rm) && /Ty: B\) Gamma/.test(rm), 'odsłona: „A) Beta" + „Ty: B) Gamma" — '+rm.replace(/\s+/g,' '));
    const stats=JSON.parse(window.localStorage.getItem('stacjaQuizStats')||'{}');
    ok(stats[qKey+'::f3 abcd'] && stats[qKey+'::f3 abcd'].w>=1, '#6: statKey = kategoria::treść bez opcji (stabilny po tasowaniu)');
    ok(!Object.keys(stats).some(k=>/f3 abcd .*alfa/.test(k)), '#6: brak klucza z opcjami');
  } finally { Math.random=rnd; cat.questions=orig; }
  click(window,'sessEnd'); await settle(2);
});

await group('F3 solo: `pool` — dowolna kolejność ✓, ten sam wpis 2× ✗, kanoniczna odpowiedź + „Ty:" + 💡 (escape)', async ()=>{
  const C=window.CATEGORIES||{}; const qKey=Object.keys(C.quiz||{})[0];
  const cat=C.quiz[qKey]; const orig=cat.questions;
  const flat=['Litwa','Łotwa','Lotwa','Estonia'];
  cat.questions=[{ prompt:'Wymień dwa państwa bałtyckie.', slots:[{key:'a',label:'kraj 1'},{key:'b',label:'kraj 2'}],
    answers:{a:flat,b:flat}, pool:[['Litwa'],['Łotwa','Lotwa'],['Estonia']], fun:'<img src=x onerror="window.__f3xss=1">Estonia ma wyspy' }];
  try{
    await f2aStartMatch(qKey, null);
    $(window,'qf_a').value='Estonia'; $(window,'qf_b').value='lotwa';
    click(window,'check'); await settle(6);
    ok($(window,'revealHead').className.includes('win'), 'odwrócona kolejność → win');
    const rm=txt(window,'rmeta');
    ok(/Estonia \(Ty: Estonia\)/.test(rm) && /Łotwa \(Ty: lotwa\)/.test(rm), 'kanoniczna forma + „Ty:" przy polu — '+rm.replace(/\s+/g,' '));
    ok(!/ \/ /.test(rm), 'bez listy wariantów „a / b"');
    ok(/inne poprawne/.test(rm) && /Litwa/.test(rm), '„inne poprawne: Litwa"');
    ok(/💡/.test(rm) && !$(window,'rmeta').querySelector('img') && !window.__f3xss, 'ciekawostka 💡 escapowana (brak <img>)');
    click(window,'next'); await settle(10);
    // pula 1 pytania wyczerpana → trwały seen-set resetuje się → to samo pytanie wraca (bez „brak pytań")
    ok($(window,'qf_a'), 'kolejne pytanie po wyczerpaniu puli (reset seen-setu)');
    $(window,'qf_a').value='Litwa'; $(window,'qf_b').value='litwa';
    click(window,'check'); await settle(6);
    ok($(window,'revealHead').className.includes('fail'), '„Litwa ×2" → fail (dedup)');
    const seen=JSON.parse(window.localStorage.getItem('stacjaQuizSeen')||'{}');
    ok(Array.isArray(seen[qKey]) && seen[qKey].includes('wymien dwa panstwa baltyckie'), '#5: trwały seen-set per kategoria w localStorage');
  } finally { cat.questions=orig; }
  click(window,'sessEnd'); await settle(2);
});

await group('F3 solo: trwały seen-set — pytanie nie wraca w kolejnym meczu, dopóki pula się nie wyczerpie', async ()=>{
  const C=window.CATEGORIES||{}; const qKey=Object.keys(C.quiz||{})[0];
  const cat=C.quiz[qKey]; const orig=cat.questions;
  cat.questions=['S1','S2','S3'].map(p=>({ prompt:p+'?', slots:[{key:'a',label:'x'}], answers:{a:['x']} }));
  window.localStorage.removeItem('stacjaQuizSeen');
  try{
    const shown=[];
    for(let i=0;i<3;i++){ await f2aStartMatch(qKey, null); shown.push(txt(window,'lyricBox').replace('pytanie','').trim()); click(window,'sessEnd'); await settle(2); }
    eq2(new Set(shown).size, 3, '3 mecze po 1. pytaniu → 3 różne pytania ('+shown.join(',')+')');
    await f2aStartMatch(qKey, null);
    ok(/S\d\?/.test(txt(window,'lyricBox')), 'po wyczerpaniu puli → reset (jest pytanie)');
  } finally { cat.questions=orig; }
  click(window,'sessEnd'); await settle(2);
});

await group('ekrany: nawigacja menu → body class (showScreen)', async ()=>{
  $(window,'goSolo').click();
  ok(window.document.body.classList.contains('solo'), 'goSolo → body.solo');
});

/* ======== F2a: solo — wyścigi rund, blokady, a11y, audio (jeden boot, ten sam DOM) ======== */
// fetch z „zawieszaniem" wybranych żądań (iTunes / bajty zajawki) — moduły app/ wołają gołe `fetch` (globalThis)
const F2A = { hold:null, pending:[] };
{
  const base = globalThis.fetch;
  globalThis.fetch = (u, o) => {
    if(F2A.hold && F2A.hold(String(u))) return new Promise(r => F2A.pending.push(() => r(base(u, o))));
    return base(u, o);
  };
}
const f2aRelease = async () => { F2A.hold=null; while(F2A.pending.length){ F2A.pending.splice(0).forEach(f=>f()); await settle(10); } };
const soloAudioMod = await import('../app/audio.js');   // ten sam singleton co w app.js (bez cache-bustera)
const lektorMod = await import('../app/lektor.js');
// start meczu solo: tylko wskazana kategoria + tylko wskazany tryb (chip)
async function f2aStartMatch(catKey, modeRe){
  resetSelection(window);
  $(window,'sumAgain').click();   // zamknij ewentualne podsumowanie (match-over)
  const tk=[...window.document.querySelectorAll('.tick')].find(t=>t.dataset.era===catKey);
  if(tk && !tk.classList.contains('on')) tk.click();
  const chip=modeRe && modeChip(window, modeRe); if(chip && !chip.classList.contains('on')) chip.click();
  click(window,'matchStart');
  await settle(10);
}
const sessQ = () => (txt(window,'sessProg')||'').match(/pyt\. (\d+)/)?.[1];

await group('F2a #4: „pomiń" po „Sprawdź" zablokowane (bez podwójnego wpisu) + Enter → następne pytanie', async ()=>{
  const { audio } = catsByKind(window);
  await f2aStartMatch(audio, /muzyka/);
  ok(!$(window,'check').disabled, 'pytanie 1 gotowe (Sprawdź aktywne)');
  ok(!window.document.body.classList.contains('lektor-mode'), 'UI: „lepszy głos" ukryty poza lektorem (brak body.lektor-mode)');
  $(window,'fTitle').value='zzz';
  click(window,'check'); await settle(2);
  ok($(window,'reveal').classList.contains('show'), 'odsłona po Sprawdź');
  ok($(window,'skip').disabled, '#4: po ocenie „pomiń" wyłączone');
  $(window,'skip').onclick();   // nawet wymuszony handler (np. stary DOM) nie dopisze drugiego wiersza
  await settle(4);
  eq2(sessQ(), '1', '#4: wymuszony skip po ocenie nie przechodzi dalej / nie dubluje');
  const ev=new window.KeyboardEvent('keydown',{ key:'Enter', bubbles:true, cancelable:true });
  $(window,'fTitle').dispatchEvent(ev); await settle(10);
  eq2(sessQ(), '2', 'Enter po Sprawdź (odsłona widoczna) → pytanie 2');
  ok(!$(window,'reveal').classList.contains('show'), 'odsłona schowana na nowym pytaniu');
  // #10: „Zakończ" w trakcie pytania 2 → podsumowanie; deck/formularz wyłączone; wynik względem rozegranych
  const scoreBefore=txt(window,'sScore');
  click(window,'sessEnd'); await settle(4);
  const rows=window.document.querySelectorAll('#sumList .sum-row');
  ok(rows.length===1, '#4: podsumowanie ma 1 wiersz dla 1 ocenionego pytania (jest '+rows.length+')');
  ok(window.document.body.classList.contains('match-over'), '#10: body.match-over (deck/formularz schowane CSS)');
  ok($(window,'check').disabled && $(window,'skip').disabled && $(window,'replay').disabled, '#10: Sprawdź/pomiń/od nowa wyłączone po Zakończ');
  ok(!$(window,'knob').classList.contains('live'), '#10: gałka nieaktywna');
  $(window,'fTitle').value='Test Song';
  const ev2=new window.KeyboardEvent('keydown',{ key:'Enter', bubbles:true, cancelable:true });
  $(window,'fTitle').dispatchEvent(ev2); $(window,'check').onclick(); await settle(2);
  ok(txt(window,'sScore')===scoreBefore && !$(window,'reveal').classList.contains('show'), '#10: Sprawdź po Zakończ nic nie ocenia');
  ok(/^0 \/ 1$/.test(txt(window,'sumBig')), '#10: wynik względem rozegranych: '+txt(window,'sumBig'));
  ok(/rozegran/.test(txt(window,'sumSub')) && /przerwany/.test(txt(window,'sumSub')), '#10: podpis „z N rozegranych · mecz przerwany": '+txt(window,'sumSub'));
});

await group('F2a #3: „Zakończ" w trakcie strojenia → „Nowy mecz" startuje (busy zwolnione)', async ()=>{
  const { audio } = catsByKind(window);
  await f2aStartMatch(audio, /muzyka/);
  click(window,'check'); await settle(2);
  F2A.hold = (u) => /itunes|search/.test(u);   // pytanie 2: iTunes wisi (słaba sieć)
  click(window,'next'); await settle(4);
  ok(/strojenie/.test(txt(window,'state')), 'pytanie 2 stroi się (fetch wisi)');
  click(window,'sessEnd'); await settle(4);
  ok($(window,'summary').classList.contains('show'), 'podsumowanie po Zakończ');
  const pendBefore=F2A.pending.length;
  await f2aStartMatch(audio, /muzyka/);   // nowy mecz B (sieć nadal wisi)
  ok(F2A.pending.length>pendBefore, '#3: nowy mecz WYSŁAŁ własne zapytanie (newRound nie utknął na busy)');
  await f2aRelease();
  ok(!$(window,'check').disabled, '#3: po zwolnieniu sieci mecz B ma aktywne Sprawdź');
  ok(!/strojenie/.test(txt(window,'state')), '#3: stan nie „strojenie…" ('+txt(window,'state')+')');
  eq2(sessQ(), '1', 'mecz B na pytaniu 1');
});

await group('F2a #9/#15: solo gra na JEDNYM trwałym elemencie audio; zdarzenia po stopie nic nie ruszają', async ()=>{
  const { audio } = catsByKind(window);
  await f2aStartMatch(audio, /muzyka/);
  const el1=soloAudioMod._soloAudioDebug().el;
  ok(el1 && /preview/.test(el1.src) && !el1.paused, 'zajawka gra na trwałym elemencie');
  const n0=audioInstances.length;
  click(window,'check'); click(window,'next'); await settle(10);
  click(window,'check'); click(window,'next'); await settle(10);
  ok(soloAudioMod._soloAudioDebug().el===el1, '#9: ten sam element w kolejnych rundach');
  ok(audioInstances.length===n0, '#9: brak nowych `new Audio()` per runda (było '+n0+', jest '+audioInstances.length+')');
  click(window,'sessEnd'); await settle(4);
  const st=txt(window,'state');
  let threw=false; try{ ['loadedmetadata','timeupdate','error','ended','playing'].forEach(t=>el1.emit(t)); }catch(_e){ threw=true; }
  ok(!threw && txt(window,'state')===st, '#15: spóźnione zdarzenia starego odtwarzania nie zmieniają stanu/nie rzucają');
});

await group('F2a #14: „od tyłu" — dekodowanie porzuconej rundy nie blokuje nowej', async ()=>{
  const { audio } = catsByKind(window);
  F2A.hold = (u) => /preview\.m4a/.test(u);    // bajty zajawki do odwrócenia wiszą
  await f2aStartMatch(audio, /od tyłu/);
  ok(/odwracam|stuknij/.test(txt(window,'state')), 'runda „od tyłu" dekoduje ('+txt(window,'state')+')');
  ok(soloAudioMod._soloAudioDebug().revDecodingGen!=null, 'dekodowanie w toku (token rundy)');
  const p0=F2A.pending.length;
  click(window,'sessEnd'); await settle(4);      // brak wyników → endMatch
  await f2aStartMatch(audio, /od tyłu/);
  ok(F2A.pending.length>p0, '#14: nowa runda „od tyłu" zaczęła własne dekodowanie (było '+p0+', jest '+F2A.pending.length+')');
  await f2aRelease();
  ok(!$(window,'check').disabled, 'po zwolnieniu: runda grywalna (fallback/odtwarzanie)');
  ok(soloAudioMod._soloAudioDebug().revDecodingGen==null, 'token dekodowania zwolniony');
  click(window,'sessEnd'); await settle(2);
});

await group('F2a #16: lektor — błąd syntezy / koniec i błąd pre-gen audio → „odtwórz ponownie"', async ()=>{
  const ss=globalThis.speechSynthesis; const origSpeak=ss.speak; let utt=null;
  ss.speak=(u)=>{ utt=u; };
  try{
    lektorMod.speak('test');
    ok(utt && typeof utt.onerror==='function', 'wypowiedź ma onerror');
    utt.onerror({ error:'synthesis-failed' });
    ok(/przerwany|ponownie/.test(txt(window,'state')), 'onerror → stan „odtwórz ponownie": '+txt(window,'state'));
    ok(/Odtwórz/.test($(window,'knob').getAttribute('aria-label')), 'gałka wraca do „Odtwórz"');
  } finally { ss.speak=origSpeak; }
  const n=audioInstances.length;
  await lektorMod.lektorPlay('tekst', 'https://x/tts-err.mp3', (t)=>{ $(window,'state').textContent=t; }); await settle(4);
  const a=audioInstances[n]; ok(a && /tts-err/.test(a.src), 'pre-gen: element audio lektora');
  ok(lektorMod.isSpeaking(), 'pre-gen gra → isSpeaking');
  a.paused=true; a.emit('error'); await settle(1);
  ok(/niedostępne|ponownie/.test(txt(window,'state')) && !lektorMod.isSpeaking(), 'pre-gen error → stan „spróbuj ponownie", nie „czyta"');
  await lektorMod.lektorPlay('tekst', 'https://x/tts-ok.mp3', (t)=>{ $(window,'state').textContent=t; }); await settle(4);
  const b=audioInstances[audioInstances.length-1]; b.paused=true; b.emit('ended'); await settle(1);
  ok(/koniec/.test(txt(window,'state')), 'pre-gen ended → „koniec · ↻ powtórz"');
  lektorMod.lektorStop();
});

await group('F2a #20: ABCD — aria-pressed + ✓/✗ tekstem; gałka z aria-label wg stanu', async ()=>{
  const C=window.CATEGORIES||{}; const qKey=Object.keys(C.quiz||{})[0];
  if(!qKey){ ok(true,'(brak kategorii quizu)'); return; }
  const cat=C.quiz[qKey]; const orig=cat.questions;
  cat.questions=[{ prompt:'A11y?\nA) Alfa\nB) Beta\nC) Gamma\nD) Delta', slots:[{key:'a',label:'x'}], answers:{ a:['B','Beta'] } }];
  try{
    await f2aStartMatch(qKey, null);
    const opts=[...window.document.querySelectorAll('#quizForm .mc-opt')];
    ok(opts.every(b=>b.getAttribute('aria-pressed')==='false'), 'opcje startują z aria-pressed=false');
    const A=optByText('Alfa'), B=optByText('Beta');   // F3: A = błędna, B = poprawna (po tekście — opcje tasowane)
    A.click();
    ok(A.getAttribute('aria-pressed')==='true' && B.getAttribute('aria-pressed')==='false', 'wybór → aria-pressed=true tylko na wybranej');
    click(window,'check'); await settle(2);
    ok((B.querySelector('.mc-mark')||{}).textContent==='✓' && /poprawna/.test(B.getAttribute('aria-label')||''), 'poprawna: ✓ w treści + aria-label');
    ok((A.querySelector('.mc-mark')||{}).textContent==='✗' && /błędny/.test(A.getAttribute('aria-label')||''), 'błędny wybór: ✗ w treści + aria-label');
    ok(!(optByText('Gamma').querySelector('.mc-mark')), 'pozostałe opcje bez znacznika');
  } finally { cat.questions=orig; }
  click(window,'sessEnd'); await settle(2);
  const { audio } = catsByKind(window);
  await f2aStartMatch(audio, /muzyka/);
  ok($(window,'knob').getAttribute('aria-label')==='Pauza', 'gałka gra → aria-label „Pauza" (jest: '+$(window,'knob').getAttribute('aria-label')+')');
  click(window,'sessEnd'); await settle(2);
});

await group('F2a UI: podsumowanie pickera (faktyczne kategorie, „pytań") + chipy o stałej szerokości + lektor-mode', async ()=>{
  const { audio, quiz, lyrics } = catsByKind(window);
  resetSelection(window); $(window,'sumAgain').click();
  const tk=k=>[...window.document.querySelectorAll('.tick')].find(t=>t.dataset.era===k);
  tk(audio).click(); const mu=modeChip(window,/muzyka/); if(!mu.classList.contains('on')) mu.click();
  ok(/z 1 kategorii/.test(txt(window,'matchInfo')) && /utworów/.test(txt(window,'matchInfo')), '1 kategoria audio: „z 1 kategorii", „utworów" — '+txt(window,'matchInfo'));
  if(quiz){ tk(quiz).click(); ok(/pytań$|pytań ·/.test(txt(window,'matchInfo').replace(/\s+/g,' ')) && !/utworów/.test(txt(window,'matchInfo')), 'z quizem: „pytań" — '+txt(window,'matchInfo')); tk(quiz).click(); }
  const css=[...window.document.querySelectorAll('style')].map(x=>x.textContent).join('\n');
  ok(/\.grp-chip::after\{[^}]*visibility:hidden/.test(css) && /\.grp-chip\.on::after\{visibility:visible\}/.test(css), 'chip: ✓ ma zarezerwowane miejsce (visibility, nie content) — bez skoku szerokości');
  ok(/body:not\(\.lektor-mode\) \.voice-toggle\{display:none\}/.test(css), '„lepszy głos" ukrywany poza lektorem (CSS)');
  if(lyrics){
    await f2aStartMatch(lyrics, /lektor/);
    ok(window.document.body.classList.contains('lektor-mode'), 'mecz lektora → body.lektor-mode („lepszy głos" widoczny)');
    click(window,'sessEnd'); await settle(2);
  }
  resetSelection(window); $(window,'sumAgain').click();
});

await group('F2a #11: boot z localStorage rzucającym SecurityError → aplikacja startuje (osobny proces)', async ()=>{
  const { execFileSync } = await import('node:child_process');
  const envUrl = new URL('./domEnv.js', import.meta.url).href;
  const code = `import { bootApp } from ${JSON.stringify(envUrl)};
    const { window } = await bootApp({ storageThrows:true });
    const d=window.document; const pt=d.getElementById('piperToggle');
    pt.click(); pt.click();   // zapis ustawienia (lsSet) też nie rzuca
    console.log(JSON.stringify({ v:window.STACJA_VERSION, ticks:d.querySelectorAll('#ticks .tick').length,
      piper:/lepszy głos/.test(pt.textContent), denied:window.__lsThrows }));
    process.exit(0);`;
  const out = execFileSync(process.execPath, ['--input-type=module','-e',code], { encoding:'utf8', timeout:90000, stdio:['ignore','pipe','pipe'] });
  const r = JSON.parse(out.trim().split('\n').pop());
  ok(r.v && r.ticks>0 && r.piper, 'app.js zamontowany mimo SecurityError (wersja '+r.v+', ticki '+r.ticks+')');
  ok(r.denied>0, 'storage faktycznie rzucał (odczyty: '+r.denied+')');
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
  // FORMAT (Wspólna/Solo/Drużyny) — wybór trybu konkurencyjnego
  ok(/Format/.test(html) && /Wspólna/.test(html) && /Solo/.test(html), 'picker MP: sekcja Format (Wspólna/Solo)');
  ok(typeof w.mpSetFormat==='function', 'most do HTML: mpSetFormat na window');
  w.mpSetFormat('solo'); await settle(2);
  ok(/każdy gra sam/.test($(w,'mpRoom').innerHTML), 'format Solo → opis „każdy gra sam"');
  // Solo wyłącza salon (TV-sędzia tylko dla Wspólnej)
  w.mpSetSalon(true); await settle(2);
  ok(!/um-salon-toggle on/.test($(w,'mpRoom').innerHTML), 'Solo: salon wyłączony (niedostępny)');
  // format Drużyny → sekcja przypisania (liczba drużyn + nazwy + chipy graczy)
  w.mpSetFormat('teams'); await settle(2);
  const ht=$(w,'mpRoom').innerHTML;
  ok(/podział na drużyny/.test(ht) && /um-assign/.test(ht), 'format Drużyny → sekcja przypisania');
  ok(/um-tname/.test(ht) && /um-balance/.test(ht), 'Drużyny: pola nazw + przycisk „równo"');
  ok(['mpSetTeamCount','mpCycleAssign','mpSetTeamName','mpBalance'].every(f=>typeof w[f]==='function'), 'most do HTML: handlery drużyn');
  w.mpSetTeamCount(3); await settle(2);   // zmiana liczby drużyn nie rzuca
  ok((($(w,'mpRoom').innerHTML.match(/class="um-tname"/g)||[]).length)===3, 'mpSetTeamCount(3) → 3 pola nazw');
  w.mpSetTeamName(0,'Rekiny');            // nazwa BEZ re-render (focus) — nie rzuca
  w.mpBalance(); await settle(2);          // „równo" → reset round-robin, re-render bez wyjątku
  ok(/um-assign/.test($(w,'mpRoom').innerHTML), 'mpBalance → re-render przypisania bez wyjątku');
  w.mpSetFormat('coop'); await settle(2);   // przywróć Wspólną na kolejne testy
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
    format:'coop', teams:[{id:'all',name:'Drużyna',members:[ws._id]}], scores:{all:0},
    byTeam:{ all:{ proposals:[{id:'p1',aid:'a1',by:ws._id,byName:'Ja',values:{title:'Hey Jude',artist:'Beatles'}}],
      votes:{ title:{[ws._id]:'Hey Jude'}, artist:{[ws._id]:'Beatles'} }, sure:[], passed:[] } } };
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

await group('MP: odsłona ABCD — opcje w pionie (\\n) + bez labelu „litera lub odpowiedź"', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  ws.pushState({ phase:'reveal', round:1, rounds:4, si:0, qi:0, slots:[{round:1,cat:'q',mode:'quiz'}],
    mode:'quiz', catKey:'q', catLabel:'Wiedza',
    reveal:{ kind:'quiz', prompt:'Pytanie ABCD?\nA) Alfa\nB) Beta\nC) Gamma\nD) Delta',
      slots:[{key:'a',label:'litera lub odpowiedź'}], answers:{ a:['B','Beta'] }, okBySlot:{a:true},
      locked:{a:'B'}, teamOk:true },
    proposals:[], votes:{}, passed:[], playNonce:7, timer:0 });
  await settle(6);
  const rv=$(w,'mpRoom').innerHTML;
  ok(/rv-card quiz/.test(rv), 'ABCD reveal: karta quizu');
  ok(/A\) Alfa\nB\) Beta\nC\) Gamma\nD\) Delta/.test(rv), 'ABCD reveal: opcje z \\n (renderowane w pionie przez pre-line)');
  ok(/rv-slot mc/.test(rv), 'ABCD reveal: wiersz odpowiedzi w trybie mc (bez labelu po lewej)');
  ok(!/LITERA LUB ODPOWIEDŹ/i.test(rv), 'ABCD reveal: usunięty zbędny label „litera lub odpowiedź"');
  ok(!/undefined is not|Cannot read/.test(rv), 'ABCD reveal render bez wyjątku');
  w.mpAdvance && w.mpAdvance();   // zamknij odsłonę u siebie (nie zostawiaj „reveal pending" następnej grupie)
});

await group('F3 MP: odsłona quizu — forma kanoniczna (display), „inne poprawne", 💡 escapowana', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  ws.pushState({ phase:'reveal', round:1, rounds:4, si:0, qi:0, slots:[{round:1,cat:'q',mode:'quiz'}],
    mode:'quiz', catKey:'q', catLabel:'Wiedza',
    reveal:{ kind:'quiz', prompt:'Wymień dwóch aktorów Bonda.',
      slots:[{key:'a',label:'aktor 1'},{key:'b',label:'aktor 2'}],
      answers:{ a:['Sean Connery','Connery','Roger Moore','Moore'], b:['Sean Connery','Connery','Roger Moore','Moore'] },
      display:{ a:'Roger Moore', b:'Sean Connery' }, others:['Daniel Craig','<b>X</b>'], okBySlot:{a:true,b:false},
      locked:{a:'moore',b:'moore'}, teamOk:false, fun:'<img src=x onerror="window.__f3mp=1">Lazenby raz' },
    proposals:[], votes:{}, passed:[], playNonce:8, timer:0 });
  await settle(6);
  const rv=$(w,'mpRoom').innerHTML;
  ok(/Roger Moore/.test(rv) && /Sean Connery/.test(rv) && !/Connery \/ /.test(rv), 'kanoniczne formy, bez listy wariantów');
  ok(/inne poprawne: Daniel Craig, &lt;b&gt;X&lt;\/b&gt;/.test(rv), '„inne poprawne" escapowane');
  ok(/💡 &lt;img/.test(rv) && !$(w,'mpRoom').querySelector('.rv-card img') && !w.__f3mp, 'ciekawostka 💡 escapowana');
  ok(/drużyna: „moore"/.test(rv), 'odpowiedź drużyny przy polu');
  w.mpAdvance && w.mpAdvance();
});

await group('MP: tryb salonowy — host = normalne fazy, większe; bez pól/emotek; board nadpisywalny', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  // host=TV (salon:true): te same fazy co normalnie, ale host nie wpisuje/nie reaguje (latające emotki zostają),
  // może KLIKNĄĆ propozycję (nadpisanie), a TV jest poza paskiem graczy.
  ws.pushState({ phase:'play', round:1, rounds:4, si:0, qi:0, mode:'music', catKey:'d80', catLabel:'80s', salon:true,
    answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    format:'coop', teams:[{id:'all',name:'Drużyna',members:['ktos']}], scores:{all:0},
    byTeam:{ all:{ proposals:[{id:'p1',aid:'a1',by:'ktos',byName:'Ala',values:{title:'Hey Jude',artist:'Beatles'}}],
      votes:{ title:{ktos:'Hey Jude'}, artist:{ktos:'Beatles'} }, sure:[], passed:[] } },
    preview:'https://x/p.m4a', lyric:'', prompt:'', playNonce:50, timer:0, endsAt:null, beerTally:{}, hostId:ws._id, results:[] });
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

await group('MP: intro fazy zamiast paska faz (duża ikona na wejściu w scenę)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  // nowy playNonce → zmiana sceny → powinno odpalić intro (ikona „Słuchaj")
  ws.pushState({ phase:'play', round:1, rounds:4, si:0, qi:0, mode:'music', catKey:'d80', catLabel:'80s',
    answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    proposals:[], votes:{}, passed:[], preview:'https://x/p.m4a', lyric:'', prompt:'', playNonce:91, timer:0, endsAt:null, beerTally:{}, results:[] });
  await settle(6);
  const stage=$(w,'mpStage');
  // intro „zaangażowane": #mpStage dostaje klasę intra (overlay sam jest ulotny — fake-WS echo go zmiata,
  // w realnej apce zostaje; klasa przeżywa re-render, więc to stabilny sygnał)
  ok(/mp-intro(ing|done)/.test(stage.className), 'intro: #mpStage w trybie intra na wejściu w fazę');
  ok(!/mp-rail/.test($(w,'mpRoom').innerHTML), 'pasek faz (mp-rail) usunięty z widoku');
  ok(!/undefined is not|Cannot read/.test($(w,'mpRoom').innerHTML), 'render fazy z intrem bez wyjątku');
});

await group('MP: faza (audio+timer) startuje DOPIERO po intrze (gating)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const realWait=ms=>new Promise(r=>setTimeout(r,ms));
  w.__MP_INTRO_MS__ = 220;   // krótkie intro, ale > 0 → start fazy wstrzymany
  try{
    ws.pushState({ phase:'play', round:1, rounds:4, si:0, qi:0, mode:'music', catKey:'d80', catLabel:'80s',
      answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
      proposals:[], votes:{}, passed:[], preview:'https://x/p.m4a', lyric:'', prompt:'', playNonce:95, timer:0, endsAt:null, beerTally:{}, results:[] });
    await settle(6);
    const statusNow=(($(w,'mpPlayStatus')||{}).textContent||'');
    ok(!/ładowanie|gra/.test(statusNow), 'pod intrem audio NIE wystartowało (status nietknięty)');
    await realWait(300);   // intro mija → begin() odpala mpStartListenWindow + mpPlayLocal
    ok(/ładowanie|gra/.test((($(w,'mpPlayStatus')||{}).textContent||'')), 'po intrze audio wystartowało (status ustawiony)');
  } finally { w.__MP_INTRO_MS__ = 0; }
});

// —— FAZA 1 audytu: deadlocki multiplayera ——
await group('MP 1.1: zgubione ready → klient dosyła wg readyIds (anty-deadlock ARMING)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const me = ws._id;
  const nReady = () => ws.sent.filter(m=>m.t==='action' && m.action && m.action.type==='ready').length;
  // lektor (bez preview) → mpArm zgłasza ready synchronicznie
  const arm = (readyIds) => ({ phase:'arming', armNonce:410, mode:'lektor', lyric:'la la', prompt:'',
    round:1, rounds:4, si:0, qi:0, catKey:'d80', catLabel:'80s', preview:'', playNonce:0,
    timer:0, endsAt:null, hostId:me, readyCount:0, readyTotal:1, results:[],
    ...(readyIds!==undefined?{readyIds}:{}) });
  const c0 = nReady();
  ws.pushState(arm([])); await settle(4);
  ok(nReady()===c0+1, 'nowy armNonce → wysłano ready');
  ws.pushState(arm([])); await settle(4);   // ten sam nonce, serwer nas nie widzi → dosyłka
  ok(nReady()===c0+2, 'readyIds bez nas @ ten sam nonce → ready ponowione');
  ws.pushState(arm([me])); await settle(4);  // serwer już nas ma → anty-pętla
  ok(nReady()===c0+2, 'readyIds z nami → brak dosyłki (anty-pętla)');
  ws.pushState(arm(undefined)); await settle(4);   // stary serwer bez pola readyIds
  ok(nReady()===c0+2, 'brak pola readyIds @ ten sam nonce → brak dosyłki (kompat. starego serwera)');
});

await group('MP 1.2: host promowany w REVEAL po „dalej" ma przycisk „następne" (nie zamrożenie)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const me = ws._id;
  ws.pushState({ phase:'reveal', round:1, rounds:4, si:0, qi:0, slots:[{round:1,cat:'d80',mode:'music'}],
    mode:'music', catKey:'d80', catLabel:'80s', answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    reveal:{ kind:'music', track:'Hey Jude', artist:'Beatles', year:'1968', album:'X', art:'',
      okTitle:true, okArtist:true, teamOk:true, gained:2, firstBy:'Bob', pewniacy:[], pewniakWin:false, pewniakLose:false,
      locked:{title:'Hey Jude',artist:'Beatles'} },
    proposals:[], votes:{}, passed:[], playNonce:520, timer:0, hostId:me });
  await settle(6);
  const nNext = ws.sent.filter(m=>m.t==='next').length;
  w.mpAdvance();   // host „dalej" → ack=revealNonce + next do DO; stan lokalny wciąż REVEAL → waitNext
  await settle(4);
  const h=$(w,'mpRoom').innerHTML;
  ok(/idziesz dalej|gotowych/.test(h), 'host po „dalej" widzi ekran czekania (waitNext)');
  ok(/mpHostNextReveal/.test(h), '1.2: host ma przycisk „następne pytanie" na ekranie czekania');
  ok(ws.sent.filter(m=>m.t==='next').length===nNext+1, 'host „dalej" wysłał next do DO');
});

await group('MP 1.3: NETERR/NOLYRIC — host ma przycisk retry (autorytet → {t:retry})', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const me = ws._id;
  ws.pushState({ phase:'neterr', netReason:'nocat', round:1, rounds:4, si:0, qi:0, mode:'music',
    catKey:'d80', catLabel:'80s', hostId:me, results:[] });
  await settle(4);
  ok(/mpHostRetry/.test($(w,'mpRoom').innerHTML), '1.3 NETERR: host widzi przycisk „spróbuj ponownie"');
  const nRetry = ws.sent.filter(m=>m.t==='retry').length;
  w.mpHostRetry(); await settle(2);
  ok(ws.sent.filter(m=>m.t==='retry').length===nRetry+1, '1.3: mpHostRetry pod autorytetem wysyła {t:retry}');
  ws.pushState({ phase:'nolyric', round:1, rounds:4, si:0, qi:0, mode:'lektor',
    catKey:'d80', catLabel:'80s', hostId:me, results:[] });
  await settle(4);
  ok(/mpHostRetry/.test($(w,'mpRoom').innerHTML), '1.3 NOLYRIC: host widzi przycisk „pomiń" (nie ślepy zaułek)');
});

await group('MP 1.4: pod autorytetem klient NIE auto-lockuje (serwer = zegar prawdy)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const me = ws._id;
  const nLock = ws.sent.filter(m=>m.t==='lock').length;
  ws.pushState({ phase:'play', round:1, rounds:4, si:0, qi:0, mode:'music', catKey:'d80', catLabel:'80s',
    answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    proposals:[], votes:{}, passed:[], preview:'https://x/p.m4a', lyric:'', prompt:'',
    playNonce:1200, timer:20, endsAt:Date.now()-5000, beerTally:{}, hostId:me, results:[] });
  await settle(6);
  w.mpTickTimer(); w.mpTickTimer();   // endsAt w przeszłości → stary kod poleciałby mpLock()
  await settle(4);
  ok(ws.sent.filter(m=>m.t==='lock').length===nLock, '1.4: brak {t:lock} od klienta (endsAt w przeszłości, SERVER_AUTH)');
});

// —— Edytor własnych kategorii (B-MVP) ——
await group('CatEditor: search → koszyk → zapis tworzy kategorię w pickerze', async ()=>{
  const w = window;
  w.document.body.className='';               // wróć do menu → solo widoczne
  $(w,'goSolo').click(); await settle(2);
  ok($(w,'catNew'), 'przycisk „+ nowa" istnieje');
  $(w,'catNew').click(); await settle(1);
  ok($(w,'catPanel').classList.contains('show'), 'panel edytora otwarty');
  // wyszukaj (fetch zaślepiony w domEnv → 1 wynik „Test Song" per fraza)
  $(w,'catSearchIn').value='Kler'; $(w,'catSearchGo').click(); await settle(6);
  ok(/ce-row/.test($(w,'catResults').innerHTML), 'wyniki wyszukiwania wyrenderowane');
  ok(!$(w,'catSave').disabled===false, 'zapis nieaktywny przy <10 utworach (min gate)');
  // dobij koszyk do 10 różnych utworów (różna frazą → różny artysta → różny dedupKey)
  for(let i=0;i<11;i++){
    $(w,'catSearchIn').value='art'+i; $(w,'catSearchGo').click(); await settle(4);
    const add=$(w,'catResults').querySelector('.ce-add'); if(add) add.click();
  }
  await settle(2);
  ok(!$(w,'catSave').disabled, 'po ≥10 utworach zapis aktywny');
  $(w,'catName').value='Impreza Ani';
  const beforeTicks=$(w,'plTicks').innerHTML;
  $(w,'catSave').click(); await settle(3);
  ok(!$(w,'catPanel').classList.contains('show'), 'po zapisie panel zamknięty');
  ok(/Impreza Ani/.test($(w,'plTicks').innerHTML), 'nowa kategoria widoczna w pickerze „Twoje"');
  ok($(w,'plTicks').innerHTML!==beforeTicks, 'lista ticków odświeżona');
});

await group('CatEditor: import JSON — dedup, escape (XSS), błędny JSON nie wysypuje', async ()=>{
  const w = window;
  $(w,'catNew').click(); await settle(1);
  // XSS: tytuł ze skryptem — po renderze koszyka MUSI być escapowany
  const evil='<img src=x onerror=alert(1)>';
  const payload={ name:'Zła', tracks:[{title:evil, artist:'A', preview:'p', trackId:1},{title:'B', artist:'A', preview:'p', trackId:2}] };
  w.prompt=()=>JSON.stringify(payload);
  $(w,'catImport').click(); await settle(2);
  const cart=$(w,'catCart').innerHTML;
  ok(/&lt;img|&amp;lt;img/.test(cart) && !/<img /.test(cart), 'tytuł utworu escapowany w koszyku (brak surowego <img>)');
  ok(/Zła/.test($(w,'catName').value), 'nazwa z JSON wczytana');
  // błędny JSON → status err, brak wyjątku
  let threw=false; w.prompt=()=>'to nie jest json {{{';
  try{ $(w,'catImport').click(); await settle(1); }catch(_e){ threw=true; }
  ok(!threw && /err/.test($(w,'catStatus').className), 'błędny JSON → komunikat błędu, bez wyjątku');
  $(w,'catCancel').click();
});

await group('MVP-3: zaproszenia znajomych — most do HTML + baner', async ()=>{
  const w = window;
  ok(['dzInvite','dzAcceptInvite','dzDismissInvite'].every(f=>typeof w[f]==='function'), 'most do HTML: handlery zaproszeń na window');
  // baner zaproszenia: utwórz ręcznie (odbiór realtime testowany w przeglądarce) i sprawdź dismiss
  let el=$(w,'dzInviteBanner');
  if(!el){ el=w.document.createElement('div'); el.id='dzInviteBanner'; el.className='dz-invite-banner show'; el.dataset.code='WXYZ'; w.document.body.appendChild(el); }
  el.classList.add('show');
  w.dzDismissInvite(); await settle(1);
  ok(!el.classList.contains('show'), 'dzDismissInvite chowa baner zaproszenia');
});


// —— F1 audytu 2026-10: bezpieczeństwo MP (klient) ——
const playState=(ws, over={})=>({ phase:'play', round:1, rounds:4, si:0, qi:0, mode:'music', catKey:'d80', catLabel:'80s',
  answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}], format:'coop',
  teams:[{id:'all',name:'Drużyna',members:[ws._id]}], scores:{all:0},
  byTeam:{ all:{ proposals:[], votes:{}, sure:[], passed:[] } }, preview:'https://x/p.m4a', lyric:'', prompt:'',
  timer:0, endsAt:null, beerTally:{}, hostId:ws._id, results:[], ...over });

await group('F1 #1: event „sync" od gracza NIE zmienia stanu u klienta (stan tylko z t:state)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  ws.pushState(playState(ws, { playNonce:1300 })); await settle(6);
  ok(!/dn-hero/.test($(w,'mpRoom').innerHTML), 'start: faza gry (nie wynik)');
  ws._emit({ t:'event', event:'sync', from:'ATTACKER', payload:{ phase:'done', format:'teams', hostId:'ATTACKER',
    teams:[{ id:'x', name:'Hacker', color:'red"><img src=x onerror="window.__f1xss=1">' }], scores:{ x:9 }, tallyList:[], beerTally:{} } });
  await settle(6);
  const h=$(w,'mpRoom').innerHTML;
  ok(!/dn-hero/.test(h) && !/Hacker/.test(h), '#1: event sync zignorowany — brak podmienionego ekranu wyniku');
  ok(!w.document.querySelector('#mpStage img[onerror]'), '#1: brak wstrzykniętego <img onerror>');
  ws._emit({ t:'event', event:'act', payload:{ type:'pass', by:ws._id } }); await settle(2);
  ok(true, 'event act od gracza nie rzuca');
});

await group('F1 #2: kolor drużyny `red" onmouseover=…` nie trafia do DOM jako atrybut', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  ws.pushState({ phase:'done', format:'teams', hostId:ws._id, playNonce:1300,
    teams:[{ id:'x', name:'Zli', color:'red" onmouseover="window.__f1xss=1" x="' }, { id:'y', name:'Dobrzy', color:'#1CB0F6' }],
    scores:{ x:'<b>2</b>', y:1 }, tallyList:[{ name:'Ala', correct:'<i>3</i>' }], mvp:{ name:'Ala', correct:'<u>3</u>' }, beerTally:{} });
  await settle(6);
  const st=$(w,'mpStage');
  ok(/dn-hero/.test(st.innerHTML), 'wynik (Drużyny) wyrenderowany');
  ok(!st.querySelector('[onmouseover]'), '#2: brak atrybutu onmouseover z koloru drużyny');
  ok(!st.querySelector('b b, .pts i, small u'), 'liczby z sieci jako tekst (bez wstrzykniętych tagów)');
  ok([...st.querySelectorAll('.wk-row .av')].some(e=>/#1CB0F6|rgb\(28, 176, 246\)/i.test(e.getAttribute('style')||'')), 'poprawny kolor hex zachowany');
});

await group('F1 #2: klucz slotu `a" autofocus onfocus=…` nie trafia do DOM (id/inline JS)', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const evil='a" autofocus onfocus="window.__f1xss=1" x="';
  ws.pushState(playState(ws, { playNonce:1301, answerSlots:[{ key:evil, label:'odp' }, { key:'title', label:'tytuł' }],
    byTeam:{ all:{ proposals:[{ id:'p1', aid:'a1', by:ws._id, byName:'Ja', values:{ [evil]:'X', title:'Y' } }],
      votes:{ [evil]:{ [ws._id]:'X' } }, sure:[], passed:[] } } }));
  await settle(6);
  w.mpGoKombinuj && w.mpGoKombinuj(); await settle(4);
  const st=$(w,'mpStage');
  ok(!st.querySelector('[autofocus],[onfocus]'), '#2: brak autofocus/onfocus z klucza slotu');
  ok(!!$(w,'mpProp_title'), 'poprawny slot (title) nadal ma pole');
  ok(![...st.querySelectorAll('[onclick]')].some(e=>/autofocus|__f1xss/.test(e.getAttribute('onclick'))), '#2: klucz slotu nie trafia do inline onclick');
  ok(w.__f1xss===undefined, 'żaden wstrzyknięty handler się nie wykonał');
});

await group('F1 #4: czat/emotki — nadawca z serwera (`from`) ma pierwszeństwo przed `by`', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const fx=()=>($(w,'mpFx')||{}).innerHTML||'';
  ws._emit({ t:'event', event:'say', from:'OTHER', payload:{ by:ws._id, from:'OTHER', byName:'Ola', text:'cześć-F1' } });
  await settle(2);
  ok(/cześć-F1/.test(fx()), 'wiadomość od innego gracza (from≠ja) pokazana mimo sfałszowanego by=ja');
  ws._emit({ t:'event', event:'say', payload:{ by:ws._id, byName:'Ja', text:'echo-F1' } });   // stary serwer: by=ja → echo pominięte
  await settle(2);
  ok(!/echo-F1/.test(fx()), 'kompat. starego serwera: by=ja (bez from) → własne echo pominięte');
});

await group('F2a #8: kategoria quizu dociągnięta PO starcie (zdarzenie stacja:quiz) pojawia się w pickerze', async ()=>{
  const w=window;
  w.CATEGORIES.quiz['f2a-late']={ kind:'quiz', label:'Spóźniona', questions:[{ prompt:'?', slots:[{key:'a',label:'a'}], answers:{a:['x']} }] };
  w.dispatchEvent(new w.CustomEvent('stacja:quiz')); await settle(2);
  const t=[...w.document.querySelectorAll('#quizTicks .tick')].find(x=>x.dataset.era==='f2a-late');
  ok(t && /Spóźniona/.test(t.textContent), 'tick spóźnionej kategorii w #quizTicks');
  ok(!$(w,'grpWiedza').hidden, 'chip „Wiedza" widoczny');
  w.dispatchEvent(new w.CustomEvent('stacja:quiz')); await settle(1);
  ok([...w.document.querySelectorAll('#quizTicks .tick')].filter(x=>x.dataset.era==='f2a-late').length===1, 'idempotentne (bez duplikatu ticka)');
});


// —— F2b audytu 2026-10: odporność MP (klient) ——
const realWaitF2b=(ms)=>new Promise(r=>setTimeout(r,ms));
const revealState=(ws, over={})=>({ phase:'reveal', round:1, rounds:4, si:0, qi:0, slots:[{round:1,cat:'d80',mode:'music'}],
  mode:'music', catKey:'d80', catLabel:'80s', answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
  format:'coop', teams:[{id:'all',name:'Drużyna',members:[ws._id]}], scores:{all:0}, byTeam:{ all:{ proposals:[], votes:{}, sure:[], passed:[] } },
  reveal:{ kind:'music', track:'Hey Jude', artist:'Beatles', year:'1968', album:'X', art:'', okTitle:false, okArtist:false, teamOk:false,
    gained:0, pewniacy:[], pewniakWin:false, pewniakLose:false, locked:{} },
  timer:0, hostId:ws._id, results:[], ...over });
const armState=(ws, over={})=>({ phase:'arming', round:1, rounds:4, si:0, qi:0, mode:'lektor', catKey:'d80', catLabel:'80s',
  preview:'', lyric:'', prompt:'', playNonce:0, timer:0, endsAt:null, hostId:ws._id, readyCount:0, readyTotal:2, readyIds:[], results:[], ...over });

await group('F2b #3: presence z hostId=null → klient NIE zostaje przy roli hosta', async ()=>{
  const w=window, ws=wsInstances[wsInstances.length-1];
  ws.pushState(playState(ws, { playNonce:3000 })); await settle(6);
  w.mpGoKombinuj(); await settle(3);
  ok(/mp-lockmini/.test($(w,'mpRoom').innerHTML), 'host: przycisk „Zatwierdź"');
  ws._emit({ t:'presence', members:[{ id:ws._id, name:'host' }], hostId:null }); await settle(3);
  ok(!/mp-lockmini/.test($(w,'mpRoom').innerHTML), '#3: hostId=null → bez przycisków hosta (serwer i tak je odrzuca)');
  ws._emit({ t:'presence', members:[{ id:ws._id, name:'host' }], hostId:ws._id }); await settle(3);
  ok(/mp-lockmini/.test($(w,'mpRoom').innerHTML), 'powrót roli → przyciski hosta wracają');
});

await group('F2b #6: ARMING — host „pomiń czekających" ({t:go}) + licznik; stary serwer bez armMs → bez przycisku', async ()=>{
  const w=window, ws=wsInstances[wsInstances.length-1];
  ws.pushState(armState(ws, { armNonce:6100 })); await settle(4);
  ok(!/mpHostSkipWait/.test($(w,'mpRoom').innerHTML), 'stary serwer (brak armMs) → brak przycisku (go i tak ignorowane)');
  ws.pushState(armState(ws, { armNonce:6101, armMs:12000 })); await settle(4);
  const h=$(w,'mpRoom').innerHTML;
  ok(/mpHostSkipWait/.test(h) && /pomiń czekających/.test(h), '#6: host widzi „pomiń czekających"');
  ok(/start najpóźniej za 1[12] s/.test(h), '#6: licznik twardego limitu widoczny');
  const n=ws.sent.filter(m=>m.t==='go').length;
  w.mpHostSkipWait(); await settle(2);
  ok(ws.sent.filter(m=>m.t==='go').length===n+1, '#6: klik wysyła {t:go}');
});

await group('F2b #6: auto-„dalej" na odsłonie po bezczynności (licznik widoczny)', async ()=>{
  const w=window, ws=wsInstances[wsInstances.length-1];
  w.__MP_REVEAL_AUTO_MS__=60;
  try{
    ws.pushState(revealState(ws, { playNonce:3100 })); await settle(6);
    ok(/rv-banner/.test($(w,'mpRoom').innerHTML), 'odsłona pokazana');
    ok($(w,'mpRevealAuto') && /auto/.test($(w,'mpRevealAuto').textContent), '#6: licznik auto-„dalej" widoczny');
    const n=ws.sent.filter(m=>m.t==='next').length;
    await realWaitF2b(120); w.mpTickTimer(); await settle(3);
    ok(ws.sent.filter(m=>m.t==='next').length===n+1, '#6: po bezczynności odsłona zamknięta sama (host → next)');
  } finally { w.__MP_REVEAL_AUTO_MS__=600000; }
});

await group('F2b #6: PLAY przy niezamkniętej odsłonie → audio dopiero po „dalej" (na dogonienie)', async ()=>{
  const w=window, ws=wsInstances[wsInstances.length-1];
  const plays=()=>audioInstances.reduce((a,x)=>a+x.plays,0);
  ws.pushState(revealState(ws, { playNonce:3200 })); await settle(6);
  const p0=plays();
  ws.pushState(playState(ws, { playNonce:3201, preview:'https://x/catchup.m4a' })); await settle(8);
  ok(/rv-banner/.test($(w,'mpRoom').innerHTML), 'odsłona nadal widoczna (gracz jej nie zamknął)');
  ok(plays()===p0, '#6: zajawka NIE gra pod odsłoną');
  w.mpAdvance(); await settle(8);
  ok(/id="mpKnob"/.test($(w,'mpRoom').innerHTML), 'po „dalej" → faza słuchaj');
  ok(plays()===p0+1, '#6: audio na dogonienie wystartowało po „dalej"');
});

await group('F2b #6: salon — „pomiń czekanie" pomija też ARMING (TV wysyła go po swoim buforze)', async ()=>{
  const w=window, ws=wsInstances[wsInstances.length-1];
  ws.pushState(revealState(ws, { playNonce:3300, salon:true })); await settle(6);
  const nN=ws.sent.filter(m=>m.t==='next').length, nG=ws.sent.filter(m=>m.t==='go').length;
  w.mpAdvance(); await settle(3);   // TV: „pomiń czekanie ›"
  ok(ws.sent.filter(m=>m.t==='next').length===nN+1, 'TV: next wysłany');
  ws.pushState(armState(ws, { armNonce:6300, armMs:12000, salon:true })); await settle(6);
  ok(ws.sent.filter(m=>m.t==='go').length===nG+1, '#6: salon — po zbuforowaniu TV wysyła go (bez czekania na telefony)');
  ws.pushState(armState(ws, { armNonce:6301, armMs:12000, salon:true })); await settle(6);
  ok(ws.sent.filter(m=>m.t==='go').length===nG+1, 'pominięcie jednorazowe (kolejne ARMING czeka normalnie)');
  ws.pushState(playState(ws, { playNonce:3301, salon:false })); await settle(4);
});

await group('F2b #12: ARMING bez nas w readyIds NIE przeładowuje zajawki (load tylko przy nowym armNonce)', async ()=>{
  const w=window, ws=wsInstances[wsInstances.length-1];
  const P=w.Audio.prototype, origLoad=P.load; let loads=0, emit=true;
  P.load=function(){ loads++; if(emit) return origLoad.call(this); };
  const nReady=()=>ws.sent.filter(m=>m.t==='action' && m.action && m.action.type==='ready').length;
  try{
    const r0=nReady();
    ws.pushState(armState(ws, { armNonce:7000, mode:'music', preview:'https://x/arm12.m4a' })); await settle(4);
    ok(loads===1 && nReady()===r0+1, 'nowy armNonce → load + ready');
    ws.pushState(armState(ws, { armNonce:7000, mode:'music', preview:'https://x/arm12.m4a', readyIds:['OTHER'], readyCount:1 })); await settle(4);
    ok(loads===1, '#12: ARMING innego gracza → bez ponownego load()');
    ok(nReady()===r0+2, 'ready dosłane (1.1) bez przeładowania');
    // buforowanie w toku (load nie kończy się od razu) → kolejne ARMING ani nie przeładowuje, ani nie dosyła
    emit=false;
    ws.pushState(armState(ws, { armNonce:7001, mode:'music', preview:'https://x/arm12b.m4a' })); await settle(4);
    ws.pushState(armState(ws, { armNonce:7001, mode:'music', preview:'https://x/arm12b.m4a', readyIds:['OTHER'] })); await settle(4);
    ok(loads===2 && nReady()===r0+2, '#12: w trakcie buforowania → brak re-load i brak ready');
    const el=audioInstances.find(a=>a.src==='https://x/arm12b.m4a'); el && el.emit('canplay'); await settle(2);
    ok(nReady()===r0+3, 'koniec buforowania → jedno ready');
    el && el.emit('canplaythrough'); await settle(2);
    ok(nReady()===r0+3, 'kolejne zdarzenia bufora nie dublują ready');
  } finally { P.load=origLoad; }
});

await group('F2b picker MP: kategorie przez data-mp-cat + delegację (bez klucza w inline onclick)', async ()=>{
  const w=window;
  const cat=await import('../app/catalog.js');
  const evil="pl_x');window.__pk=1;('";
  cat.plSave({ ...cat.plLoad(), [evil]:{ label:'Zła', kind:'playlist', songs:[{ title:'A', artist:'B', preview:'https://x/a.m4a' }] } });
  cat.plMerge();
  w.mpNewGame(); await settle(3);   // host → picker
  const html=()=>$(w,'mpRoom').innerHTML;
  if(!/grp-chip[^"]*open[^>]*mpToggleGrp\('twoje'\)/.test(html())) w.mpToggleGrp('twoje');
  if(!/grp-chip[^"]*open[^>]*mpToggleGrp\('dekady'\)/.test(html())) w.mpToggleGrp('dekady');
  await settle(2);
  ok(!/mpToggleCat\('/.test(html()), 'picker: klucz kategorii NIE trafia do inline onclick');
  ok(!/class="tick[^"]*"[^>]*onclick=/.test(html()), 'ticki kategorii bez inline onclick');
  const tick=[...w.document.querySelectorAll('#mpStage .tick')].find(t=>t.dataset.mpCat===evil);
  ok(!!tick, 'tick z kluczem w data-mp-cat');
  tick && tick.click(); await settle(2);
  ok(w.__pk===undefined, 'złośliwy klucz nie wykonał kodu');
  const t2=[...w.document.querySelectorAll('#mpStage .tick')].find(t=>t.dataset.mpCat===evil);
  ok(t2 && t2.classList.contains('on'), 'klik zaznacza kategorię (delegacja działa)');
  t2 && t2.click(); await settle(1);
});

await group('F2b #13: wyjście w trakcie pytania i wejście do nowego pokoju → 1. pytanie od fazy „słuchaj"', async ()=>{
  const w=window;
  let ws=wsInstances[wsInstances.length-1];
  ws.pushState(playState(ws, { playNonce:1 })); await settle(6);
  w.mpGoKombinuj(); await settle(3);
  ok(!/id="mpKnob"/.test($(w,'mpRoom').innerHTML), 'stary pokój: kombinuj');
  w.mpRoomBack(); await settle(4);
  $(w,'mpCreate').click(); await settle(10);
  ws=wsInstances[wsInstances.length-1];
  ws.pushState(playState(ws, { playNonce:1 })); await settle(8);
  ok(/id="mpKnob"/.test($(w,'mpRoom').innerHTML), '#13: nowy pokój, playNonce=1 → gałka (faza słuchaj), nie kombinuj');
  ok(/mp-intro(ing|done)/.test($(w,'mpStage').className) || $(w,'mpListenBar'), '#13: intro/okno słuchania od nowa');
});

console.log(`\n${fail?'❌':'✅'} integracja: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
