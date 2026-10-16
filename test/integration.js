/* test/integration.js — siatka testów integracyjnych (jsdom).
 * Ładuje app.js w realnym DOM index.html i klika kluczowe ścieżki.
 * Uruchom: node test/integration.js  (wymaga devDep: jsdom)
 * Cel: łapać regresje ŁADOWANIA i interakcji przy rozbijaniu app.js. */
import { bootApp, $, txt, click } from './domEnv.js';
import { readFileSync } from 'node:fs';

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
  // F8a: kategoria bez ticka (np. dodana przez picker MP, wylosowana kostką) zostawała w puli solo →
  // „wszystkie" (zaznacz → odznacz) czyści pulę w całości (flaky: mecz grał z obcej kategorii)
  const all=window.document.querySelector('.tick.rnd');
  if(all){ all.click(); if(all.classList.contains('on')) all.click(); }
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

await group('lektor: tryb lektor → płyta (play) → synteza mowy (app/lektor.js)', async ()=>{
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
  // płyta → toggleAudio (mode=lektor) → lektorPlay → speak
  ok(!$(window,'knob'), 'okrągła gałka usunięta — kontrolką jest płyta');
  $(window,'vinyl').click();
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
const repoMod = await import('../adapters-web/itunesRepository.js');   // F5: cache iTunes per sesja (singleton)
const M8dom = await import('../core/match.js');   // EKSP. fortepian: modesFor na danych categories.js
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
const sessQ = () => (txt(window,'sessProg')||'').match(/pyt\. (\d+)/i)?.[1];

/* ======== Łamigłówki (solo): chip 🧩, rebus duży, odsłona „▶ posłuchaj", jedna litera — częściowe punkty ======== */
const listenMod = await import('../app/listen.js');   // singleton odsłuchu (ten sam co w app/solo.js)
await group('Łamigłówki solo: chip „🧩 Łamigłówki" + rebus duży + odsłona z „▶ posłuchaj" (auto ~10 s z iTunes)', async ()=>{
  const w=window;
  const REB={ prompt:'🟣 🌧️\n🎵 tytuł · hit lat 80.', slots:[{key:'a',label:'tytuł'}], answers:{a:['Test Song']},
    display:'rebus', track:{ title:'Test Song', artist:'Rebus Artist' }, fun:'ciekawostka rebusu' };
  w.CATEGORIES.quiz['lam-test']={ kind:'quiz', label:'Rebusy test', group:'lamiglowki', questions:[REB] };
  w.dispatchEvent(new w.CustomEvent('stacja:quiz')); await settle(2);
  const chip=$(w,'grpLam');
  ok(chip && !chip.hidden && /Łamigłówki/.test(chip.textContent), 'chip „🧩 Łamigłówki" widoczny');
  ok($(w,'lamTicks').querySelector('[data-era="lam-test"]'), 'kategoria w paśmie Łamigłówek');
  ok(!$(w,'quizTicks').querySelector('[data-era="lam-test"]'), '… a nie w paśmie Wiedza');
  resetSelection(w);
  $(w,'lamTicks').querySelector('[data-era="lam-test"]').click();
  ok(chip.classList.contains('on') && !$(w,'grpWiedza').classList.contains('on'), 'wybór → ✓ na chipie Łamigłówek (nie Wiedzy)');
  await f2aStartMatch('lam-test', null);
  const lb=$(w,'lyricBox'), big=lb && lb.querySelector('.rebus-big');
  ok(lb.classList.contains('rebus') && big && /🟣/.test(big.textContent), 'rebus: duża linia emoji (.rebus-big)');
  ok(/hit lat 80/.test((lb.querySelector('.rebus-hint')||{}).textContent||''), 'podpowiedź kategorii pod rebusem');
  $(w,'qf_a').value='test song'; click(w,'check'); await settle(6);
  ok($(w,'revealHead').className.includes('win'), 'trafienie');
  const btn=$(w,'rmeta').querySelector('.listen-btn');
  ok(btn && /Test Song/.test(btn.textContent), 'odsłona: przycisk „▶ posłuchaj" z tytułem');
  for(let i=0;i<40 && listenMod._listenDebug().playing!==0;i++) await settle(2);
  const d=listenMod._listenDebug();
  eq2(d.playing, 0, 'auto-odtworzenie utworu-rozwiązania');
  ok(d.el && /preview\.m4a/.test(d.el.src) && !d.el.paused, 'zajawka iTunes gra na elemencie odsłuchu — '+(d.el&&d.el.src));
  ok(/■ stop/.test($(w,'rmeta').querySelector('.listen-btn').textContent), 'przycisk pokazuje „■ stop" w trakcie');
  $(w,'rmeta').querySelector('.listen-btn').click(); await settle(2);
  ok(listenMod._listenDebug().playing===-1 && d.el.paused, 'klik = stop');
  click(w,'sessEnd'); await settle(4);
  ok(listenMod._listenDebug().playing===-1, 'koniec meczu — cisza');
});
await group('Łamigłówki solo: „Jedna litera różnicy" — częściowe punkty (partial) + odsłuch per slot', async ()=>{
  const w=window;
  const cat=w.CATEGORIES.quiz['lam-test']; const orig=cat.questions;
  cat.questions=[{ prompt:'Jedna litera różnicy:\n1) debiut Radiohead\n2) post-grunge\n3) Nirvana', partial:true,
    slots:[{key:'a',label:'1'},{key:'b',label:'2'},{key:'c',label:'3'}], answers:{ a:['Creep'], b:['Creed'], c:['Breed'] },
    tracks:[{ title:'Test Song', artist:'Lit One' }, null, { title:'Test Song', artist:'Lit Three' }] }];
  try{
    await f2aStartMatch('lam-test', null);
    ok(!$(w,'lyricBox').classList.contains('rebus'), 'drabinka: zwykły (nie-rebusowy) prompt');
    $(w,'qf_a').value='Creep'; $(w,'qf_b').value='Greed'; $(w,'qf_c').value='Breed';
    click(w,'check'); await settle(6);
    const head=txt(w,'revealHead'), pts=+((head.match(/\+(\d+)/)||[])[1]||0);
    ok(/Częściowo/.test(head) && /trafione 2 z 3/.test(head), 'nagłówek: „Częściowo · trafione 2 z 3" — '+head);
    ok(pts>=67 && pts<=101, 'częściowe punkty 2/3 (67 × szybkość) — '+pts);
    const btns=[...$(w,'rmeta').querySelectorAll('.listen-btn')];
    eq2(btns.length, 2, 'dwa przyciski odsłuchu (slot 2 bez utworu)');
    ok(/1: Test Song/.test(btns[0].textContent) && /3: Test Song/.test(btns[1].textContent), 'etykiety slotów na przyciskach');
  } finally { cat.questions=orig; }
  click(w,'sessEnd'); await settle(4);
});

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
  ok(!$(window,'vinyl').classList.contains('live'), '#10: płyta nieaktywna');
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
  repoMod.clearTrackCache();   // F5: bez cache — inaczej wykonawca z pytania 1 rozwiąże się bez sieci
  click(window,'next'); await settle(4);
  ok(/strojenie/.test(txt(window,'state')), 'pytanie 2 stroi się (fetch wisi)');
  click(window,'sessEnd'); await settle(4);
  ok($(window,'summary').classList.contains('show'), 'podsumowanie po Zakończ');
  const pendBefore=F2A.pending.length;
  repoMod.clearTrackCache();
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
    ok(/Odtwórz/.test($(window,'vinyl').getAttribute('aria-label')), 'płyta wraca do „Odtwórz…" — '+$(window,'vinyl').getAttribute('aria-label'));
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
  const vv=$(window,'vinyl');
  ok(vv.getAttribute('aria-label')==='Pauza — płyta gra', 'płyta gra → aria-label „Pauza — płyta gra" (jest: '+vv.getAttribute('aria-label')+')');
  ok(vv.dataset.state==='playing' && vv.dataset.rate==='1' && vv.style.getPropertyValue('--vn-turn')==='1.80s' && vv.classList.contains('spinning'), 'muzyka: płyta kręci się 1.0× (1,8 s/obrót)');
  ok(vv.getAttribute('role')==='button' && vv.getAttribute('tabindex')==='0' && vv.getAttribute('aria-pressed')==='true', 'dostępność: role=button, tabindex, aria-pressed');
  ok((vv.querySelector('.vn-ic')||{}).dataset.icon==='pause', 'środek płyty: ikona ❚❚');
  ok(!window.document.querySelector('.knob-wrap') && !window.document.querySelector('.deck-eq'), 'bez gałki i „equalizera"');
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
  ok(/Kategorie/.test(html) && /Tryby pytań/.test(html) && /Długość meczu/.test(html), 'picker MP: sekcje Kategorie/Tryby/Długość meczu (F6a)');
  ok(/Krótki/.test(html) && /Standard/.test(html) && /Długi/.test(html) && /um-len on[^>]*mpSetQuestions\(15\)/.test(html), 'F6a: segment długości (Krótki 5 · Standard 15 · Długi 30), domyślnie 15');
  ok(/um-start/.test(html), 'picker MP: przycisk startu meczu');
  // FORMAT (Wspólna/Solo/Drużyny) — wybór trybu konkurencyjnego
  ok(/Format/.test(html) && /Wspólna/.test(html) && /Solo/.test(html), 'picker MP: sekcja Format (Wspólna/Solo)');
  ok(typeof w.mpSetFormat==='function', 'most do HTML: mpSetFormat na window');
  w.mpSetFormat('solo'); await settle(2);
  ok(/każdy gra sam/.test($(w,'mpRoom').innerHTML), 'format Solo → opis „każdy gra sam"');
  // F6b (#6): salon działa też w Solo/Drużynach (TV pokazuje status drużyn + ranking); wymusza „dźwięk tylko u hosta"
  w.mpSetSalon(true); await settle(2);
  ok(/um-salon-toggle on/.test($(w,'mpRoom').innerHTML) && /pokazuje ranking/.test($(w,'mpRoom').innerHTML), 'F6b: Solo + salon dozwolone');
  ok(/um-audiohost on[^>]*disabled/.test($(w,'mpRoom').innerHTML), 'F6b: salon ⇒ „Dźwięk tylko u hosta" włączony i zablokowany');
  w.mpSetSalon(false); await settle(2);
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
  // F6a (R-F2): długość w pytaniach → start wysyła `questions` ORAZ `rounds` zgodne ze starym serwerem
  ok(typeof w.mpSetQuestions==='function', 'most do HTML: mpSetQuestions na window');
  w.mpSetQuestions(5); await settle(2);
  const { audio:mpAudio } = catsByKind(w);
  w.mpToggleCat(mpAudio); await settle(2);
  ok(/um-len on[^>]*mpSetQuestions\(5\)/.test($(w,'mpRoom').innerHTML) && /= <b>5 utworów<\/b>/.test($(w,'mpRoom').innerHTML), 'F6a: Krótki → podsumowanie „= 5 utworów"');
  const wsP = wsInstances[wsInstances.length-1];
  w.mpStart(); await settle(4);
  const st = wsP.sent.filter(m=>m.t==='start').pop();
  ok(st && st.config && st.config.questions===5 && st.config.rounds===1, 'F6a: start {questions:5, rounds:1} (stary serwer zbuduje 1 rundę) — '+JSON.stringify(st&&{q:st.config.questions,r:st.config.rounds}));
  w.mpToggleCat(mpAudio); w.mpSetQuestions(15); await settle(2);
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
  ok(/M17\.65/.test(($(w,'mpKnobIcon')||{}).innerHTML||''), 'ikona płyty = replay (↻)');
  const mv=$(w,'mpKnob');
  ok(mv && mv.classList.contains('vinyl') && mv.classList.contains('mp-vinyl') && mv.getAttribute('role')==='button' && mv.getAttribute('tabindex')==='0', 'MP faza słuchaj: płyta winylowa (role=button, klawiatura)');
  ok(mv && mv.dataset.state==='paused' && !mv.classList.contains('spinning') && /od nowa/.test(mv.getAttribute('aria-label')||''), 'fragment dograł → płyta stoi, aria-label „od nowa" — '+(mv&&mv.getAttribute('aria-label')));
  ok(mv && mv.querySelector('#mpKnobIcon') && mv.querySelector('#mpvDisc') && !mv.querySelector('#mpKnobIcon').closest('.vn-disc'), 'MP: własne id SVG (prefiks mpv), ikona poza obracającą się płytą');
  // klik gałki → REPLAY fragmentu (seek do startu), NIE wznowienie reszty utworu
  w.mpKnobTap(); await settle(3);
  ok(Math.abs(a.currentTime-START)<0.5 && !a.paused && a.plays>playsBefore, 'klik → fragment od nowa (currentTime≈start, nowe play)');
  ok($(w,'mpKnob').dataset.state==='playing' && $(w,'mpKnob').dataset.rate==='1', 'gra → płyta MP kręci się 1.0×');
  a.emit('error'); await settle(1);
  ok($(w,'mpKnob').dataset.state==='error' && /Błąd/.test($(w,'mpKnob').getAttribute('aria-label')), 'MP: brak zajawki → płyta w stanie błędu');
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

await group('Łamigłówki MP: odsłona — rebus duży + „▶ posłuchaj" (lokalnie) / „🔈 dźwięk tylko u hosta" → notka u pilota', async ()=>{
  const w = window;
  const ws = wsInstances[wsInstances.length-1];
  const reveal={ kind:'quiz', prompt:'🟣 🌧️\n🎵 tytuł · hit lat 80.', promptStyle:'rebus', listen:[{ title:'Test Song', artist:'Test Artist', label:'' }],
    slots:[{key:'a',label:'tytuł'}], answers:{ a:['Test Song'] }, display:{ a:'Test Song' }, okBySlot:{a:true}, locked:{a:'test song'}, teamOk:true };
  ws.pushState({ phase:'reveal', round:1, rounds:4, si:0, qi:0, slots:[{round:1,cat:'q',mode:'quiz'}], mode:'quiz', catKey:'q', catLabel:'Rebusy',
    reveal, proposals:[], votes:{}, passed:[], playNonce:91, timer:0, hostId:ws._id });
  await settle(6);
  let rv=$(w,'mpRoom').innerHTML;
  ok(/rebus-big/.test(rv) && /🟣/.test(rv), 'MP odsłona: rebus duży');
  ok(/listen-btn/.test(rv) && /Test Song/.test(rv), 'MP odsłona: przycisk „▶ posłuchaj"');
  for(let i=0;i<40 && listenMod._listenDebug().playing!==0;i++) await settle(2);
  eq2(listenMod._listenDebug().playing, 0, 'MP: zajawka rozwiązania gra lokalnie u gracza');
  w.mpAdvance && w.mpAdvance(); await settle(2);
  ok(listenMod._listenDebug().playing===-1, '„dalej" ucisza odsłuch');
  // pilot przy „🔈 dźwięk tylko u hosta" (host = ktoś inny): bez odtwarzania, notka
  ws.pushState({ phase:'reveal', round:1, rounds:4, si:0, qi:1, slots:[{round:1,cat:'q',mode:'quiz'}], mode:'quiz', catKey:'q', catLabel:'Rebusy',
    reveal, proposals:[], votes:{}, passed:[], playNonce:92, timer:0, audioHostOnly:true, hostId:'ktos-inny' });
  await settle(6);
  rv=$(w,'mpRoom').innerHTML;
  ok(/utwór gra u hosta/.test(rv) && !/listen-btn/.test(rv), 'pilot: notka „🔈 utwór gra u hosta", bez przycisku');
  ok(listenMod._listenDebug().playing===-1 && listenMod._listenDebug().loading===-1, 'pilot: nic nie gra');
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
  ok(/mp-lockbtn/.test(h) && /ZATWIERDŹ/.test(h), 'salon: host ma pełny przycisk „ZATWIERDŹ" (F6b, dawniej ✓ 36 px)');
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
  ok(/mp-lockbtn/.test($(w,'mpRoom').innerHTML), 'host: przycisk „Zatwierdź"');
  ws._emit({ t:'presence', members:[{ id:ws._id, name:'host' }], hostId:null }); await settle(3);
  ok(!/mp-lockbtn/.test($(w,'mpRoom').innerHTML), '#3: hostId=null → bez przycisków hosta (serwer i tak je odrzuca)');
  ws._emit({ t:'presence', members:[{ id:ws._id, name:'host' }], hostId:ws._id }); await settle(3);
  ok(/mp-lockbtn/.test($(w,'mpRoom').innerHTML), 'powrót roli → przyciski hosta wracają');
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

await group('lektor MP: język opisu (game.lyricLang) → głos lektora; stary serwer bez pola → pl', async ()=>{
  const w=window, ws=wsInstances[wsInstances.length-1];
  const ss=globalThis.speechSynthesis, origSpeak=ss.speak; const utts=[]; ss.speak=(u)=>{ utts.push(u); };
  try{
    ws.pushState(playState(ws, { mode:'lektor', preview:'', lyric:'A song about a strange world', lyricLang:'en', playNonce:3050 })); await settle(6);
    eq2(lektorMod.lektorLastLang(), 'en', 'lyricLang:"en" → lektor po angielsku');
    ok(utts.length && /^en/.test(utts[utts.length-1].lang||''), 'syntezator: u.lang en — '+(utts.length&&utts[utts.length-1].lang));
    ws.pushState(playState(ws, { mode:'lektor', preview:'', lyric:'Piosenka o dziwnym świecie', playNonce:3051 })); await settle(6);
    eq2(lektorMod.lektorLastLang(), 'pl', 'brak lyricLang (stary serwer) → pl');
    ok(/^pl/.test(utts[utts.length-1].lang||''), 'syntezator: u.lang pl');
  } finally { ss.speak=origSpeak; lektorMod.lektorStop(); }
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


/* ======== F6a: „Graj teraz", „Kontynuuj mecz", długość meczu, punkty, odsłona edukacyjna, offline, motyw, profil ======== */
await group('F6a (R-F1/F12/R2/R-U2): menu „Graj teraz" → 10 pytań; punkty + „Ty:"/„literówka OK"; „Kontynuuj mecz"', async ()=>{
  const d=window.document, body=d.body;
  repoMod.clearTrackCache();
  const prevBase=window.STACJA_CONFIG.roomsBase; window.STACJA_CONFIG.roomsBase='';   // solo bez proxy Workera (zaślepka iTunes echo)
  $(window,'toMenu').click(); await settle(4);
  if($(window,'session').classList.contains('live')){ $(window,'goSolo').click(); click(window,'sessEnd'); await settle(4); $(window,'toMenu').click(); await settle(2); }
  ok(body.classList.contains('menu') && $(window,'goContinue').hidden, 'menu bez trwającego meczu → „Kontynuuj" ukryte');
  ok($(window,'goQuick') && /Graj teraz/.test(txt(window,'goQuick')), 'menu: przycisk „Graj teraz"');
  $(window,'goQuick').click();
  for(let i=0;i<300 && $(window,'check').disabled;i++) await settle(2);   // pula hitów: dekady → kilka wykonawców (fallback)
  ok(body.classList.contains('solo') && body.classList.contains('playing'), '„Graj teraz" → ekran solo, mecz trwa (1 tapnięcie)');
  ok(/^Pyt\. 1\/10$/.test(txt(window,'sessProg')) && /blok 1\/2/.test(txt(window,'sessCtx')) && /^Runda 1\/1/.test(txt(window,'scrTitle')), 'F6b (A2): mecz 10 pytań → „Pyt. 1/10" (cały mecz) + „blok 1/2" osobno — '+txt(window,'sessProg')+' | '+txt(window,'sessCtx'));
  ok(!$(window,'check').disabled, 'pytanie 1 gotowe — stan: '+txt(window,'state'));
  $(window,'fTitle').value='Tes Song'; $(window,'fArtist').value='zzz'; $(window,'fYear').value='1986';
  click(window,'check'); await settle(2);
  const rm=txt(window,'rmeta');
  ok(/Ty: Tes Song/.test(rm) && /literówka OK/.test(rm), 'R-U2: „Ty: …" przy tytule + tag „literówka OK" — '+rm.replace(/\s+/g,' '));
  ok(/rok ±2 OK/.test(rm), 'R-U2: rok 1986 vs 1985 → „rok ±2 OK"');
  ok(/\+\d+/.test(txt(window,'revealHead')) && $(window,'revealHead').className.includes('part'), 'odsłona: „+N" punktów, częściowe trafienie (Prawie!)');
  const pts=+txt(window,'sPoints');
  ok(pts>=70 && pts<=105, 'R2: tytuł 50 + rok 20 (+ szybkość ≤50%) = '+pts+' pkt (częściowe trafienie punktuje)');
  ok(new RegExp('^'+pts+' pkt').test(txt(window,'sessMini')), 'nagłówek meczu: suma punktów — '+txt(window,'sessMini'));
  // F12: menu w trakcie meczu → „Kontynuuj mecz (pyt. X/Y)"; powrót = nagłówek rundy, nie „Ułóż mecz"
  $(window,'toMenu').click(); await settle(2);
  ok(!$(window,'goContinue').hidden && /Kontynuuj mecz \(pyt\. 1\/10\)/.test(txt(window,'goContinue')), 'F12: menu pokazuje „Kontynuuj mecz (pyt. 1/10)" — '+txt(window,'goContinue'));
  $(window,'goContinue').click(); await settle(2);
  ok(body.classList.contains('solo') && /^Runda 1\/1 · /.test(txt(window,'scrTitle')), 'F12: powrót do meczu — nagłówek rundy: '+txt(window,'scrTitle'));
  click(window,'sessEnd'); await settle(4);
  ok(new RegExp('^'+pts+' pkt$').test(txt(window,'sumPts')) && /^0 \/ 1$/.test(txt(window,'sumBig')), 'wynik końcowy: punkty obok X/Y trafień — '+txt(window,'sumPts')+' · '+txt(window,'sumBig'));
  $(window,'toMenu').click(); await settle(2);
  ok($(window,'goContinue').hidden, 'po zakończeniu meczu „Kontynuuj" znika');
  $(window,'goSolo').click(); await settle(2); $(window,'sumAgain').click();
  window.STACJA_CONFIG.roomsBase=prevBase;
});

await group('F6a (R-F2/R-F1/R-F3): długość meczu 5/15/30, zapamiętana pula, kostka bez wiedzy', async ()=>{
  const { audio, quiz } = catsByKind(window);
  resetSelection(window); $(window,'sumAgain').click();
  const lens=[...window.document.querySelectorAll('#lenPick button')].map(b=>b.dataset.q);
  eq2(lens.join(','), '5,15,30', 'segment Krótki 5 · Standard 15 · Długi 30');
  ok(window.document.querySelector('#lenPick button.on').dataset.q==='15', 'domyślnie Standard 15');
  const tk=[...window.document.querySelectorAll('.tick')].find(t=>t.dataset.era===audio); tk.click();
  const mu=modeChip(window,/muzyka/); if(!mu.classList.contains('on')) mu.click();
  window.document.querySelector('#lenPick button[data-q="5"]').click();
  ok(/= 5 utworów/.test(txt(window,'matchInfo').replace(/\s+/g,' ')) && /5 pytań/.test(txt(window,'lenVal')), 'Krótki → „… = 5 utworów" — '+txt(window,'matchInfo'));
  click(window,'matchStart'); await settle(10);
  ok(/^Pyt\. 1\/5$/.test(txt(window,'sessProg')) && !/blok/.test(txt(window,'sessCtx')), 'mecz 5 pytań (1 blok) — '+txt(window,'sessProg'));
  const saved=JSON.parse(window.localStorage.getItem('stacjaSoloPick')||'null');
  ok(saved && saved.questions===5 && saved.cats.includes(audio) && saved.modes.includes('music'), 'R-F1: picker zapamiętał pulę + długość — '+JSON.stringify(saved));
  click(window,'sessEnd'); await settle(4); $(window,'sumAgain').click();
  window.document.querySelector('#lenPick button[data-q="15"]').click();
  // R-F3: kostka nigdy nie zaznacza wiedzy ogólnej
  let quizHit=0;
  for(let i=0;i<40;i++){ click(window,'matchRandom'); if(window.document.querySelector('#quizTicks .tick.on')) quizHit++; }
  ok(quizHit===0 && (!quiz || true), 'R-F3: 40× kostka — 0 razy kategoria wiedzy');
  resetSelection(window);
});

await group('F6a (R-F10/F11): brak sieci w solo → komunikat dla gracza + „Zagraj offline: Lektor / Wiedza"', async ()=>{
  const { audio } = catsByKind(window);
  repoMod.clearTrackCache();
  const prevFetch=globalThis.fetch, prevBase=window.STACJA_CONFIG.roomsBase, body=window.document.body, prevAppend=body.appendChild;
  // offline: proxy Workera, bezpośredni fetch i JSONP iTunes — wszystko pada od razu
  window.STACJA_CONFIG.roomsBase='';
  globalThis.fetch=(u,o)=> /itunes|search|tracks/.test(String(u)) ? Promise.reject(new TypeError('Failed to fetch')) : prevFetch(u,o);
  body.appendChild=function(n){ if(n && n.tagName==='SCRIPT' && /itunes/.test(n.src||'')){ setTimeout(()=>n.onerror && n.onerror(),0); return n; } return prevAppend.call(this,n); };
  try{
    await f2aStartMatch(audio, /muzyka/);
    for(let i=0;i<300 && !/Brak internetu/.test(txt(window,'state'));i++) await settle(2);
    const st=txt(window,'state');
    ok(/Brak internetu/.test(st) && !/jojogurt|podgląd|categories\.js/.test(st), 'komunikat w języku gracza: '+st);
    const off=$(window,'offlinePlay');
    ok(off && !off.hidden, 'przycisk „Zagraj offline: Lektor / Wiedza" widoczny');
    off.click(); await settle(10);
    const b=window.document.body.classList;
    ok(b.contains('playing') && (b.contains('quiz-mode') || b.contains('lektor-mode')), 'offline: mecz lektor/wiedza wystartował');
    ok(off.hidden, 'po starcie offline przycisk schowany');
  } finally { globalThis.fetch=prevFetch; window.STACJA_CONFIG.roomsBase=prevBase; body.appendChild=prevAppend; }
  click(window,'sessEnd'); await settle(4); $(window,'sumAgain').click();
  const src=(await import('node:fs')).readFileSync(new URL('../app/solo.js', import.meta.url),'utf8')+(await import('node:fs')).readFileSync(new URL('../app/social.js', import.meta.url),'utf8');
  ok(!/jojogurt|Dodaj songs\[\]|Brak pliku categories\.js|prześlij mi ten komunikat/.test(src), 'R-F10: brak deweloperskich komunikatów w solo/social');
});

await group('F6a (R-U7/R-U1/U12): motyw 3-stanowy (systemowy), tokeny typografii, profil', async ()=>{
  const d=window.document;
  const btns=[...d.querySelectorAll('#themeSeg button')].map(b=>b.dataset.theme);
  eq2(btns.join(','), 'light,dark,system', 'przełącznik motywu: Jasny / Ciemny / Systemowy');
  ok(d.querySelector('#themeSeg button[data-theme="system"]').classList.contains('on'), 'bez wyboru → „Systemowy" (prefers-color-scheme)');
  d.querySelector('#themeSeg button[data-theme="dark"]').click();
  ok(d.documentElement.classList.contains('dark') && window.localStorage.getItem('stacjaTheme')==='dark', 'Ciemny → html.dark');
  d.querySelector('#themeSeg button[data-theme="system"]').click();
  ok(!d.documentElement.classList.contains('dark') && window.localStorage.getItem('stacjaTheme')==='system', 'Systemowy (jsdom: jasny system) → bez html.dark');
  const head=[...d.querySelectorAll('script:not([src])')].map(x=>x.textContent).join('\n');
  ok(/prefers-color-scheme: dark/.test(head), 'wczesny skrypt motywu respektuje prefers-color-scheme');
  const css=[...d.querySelectorAll('style')].map(x=>x.textContent).join('\n');
  ok(/--fs-xs:13px; --fs-sm:14px; --fs-md:15px/.test(css), 'R-U1: tokeny --fs-xs/sm/md w :root');
  const tiny=(css.match(/font-size: ?(8|9|10|11)(\.\d+)?px/g)||[]).length;
  ok(tiny<=3, 'R-U1: deklaracje 8–11 px zastąpione tokenami (zostały tylko glify ×/✎ w kółkach 16–18 px: '+tiny+')');
  ok(/\.grp-chip\{[^}]*color:var\(--muted\)/.test(css), 'U6: nieaktywny .grp-chip w kolorze --muted (≥4.5:1)');
  ok(/\.mini button,[^{]*\{min-height:44px;min-width:44px\}/.test(css), 'R-U1: mini-akcje min. 44×44 px');
  $(window,'goProfil').click(); await settle(8);
  ok(!/\/ 12/.test(txt(window,'profilStats')), 'U12: brak placeholdera „/ 12" odznak');
});

// —— F6b audytu 2026-10: layout + MP pub ——
async function f6bRoom(){
  const w=window;
  w.STACJA_CONFIG.roomsBase='https://test.invalid';
  $(w,'goMp').click(); await settle(4);
  if($(w,'mpRoom').style.display==='none'){ $(w,'mpCreate').click(); await settle(10); }
  return wsInstances[wsInstances.length-1];
}
await group('F6b (A1/A4): pasek meczu solo — ✕ z aria-label; kolory stanów w tokenach CSS z wariantem dark', async ()=>{
  const d=window.document;
  const end=$(window,'sessEnd');
  ok(end && end.getAttribute('aria-label')==='Zakończ mecz' && !/Zakończ/.test(end.textContent), 'A1: „Zakończ" = ikonowy ✕ z aria-label (nie tekst, który wypychał pasek)');
  ok($(window,'sessCtx') && $(window,'sessProg'), 'A1: pasek 2-wierszowy (numer + kontekst)');
  const css=[...d.querySelectorAll('style')].map(x=>x.textContent).join('\n');
  ok(/\.rv-shead\.fail\{background:var\(--fail-bg\)\}/.test(css) && /html\.dark\{[^}]*--fail-bg:rgba/.test(css), 'A4: nagłówek „Pudło" z tokenu --fail-bg (dark: półprzezroczysty)');
  ok(/\.mp-seg\{[^}]*background:var\(--surface\)/.test(css) && /\.dn-menu\{[^}]*background:var\(--surface\)/.test(css) && /\.mp-cand\{background:var\(--surface\)/.test(css), 'A4: białe tła .mp-seg/.dn-menu/.mp-cand → --surface');
  ok(!/background:#FFF1F1/i.test(css), 'A4: brak hardkodu #FFF1F1 w CSS');
  const mr=readFileSync(new URL('../app/mp-render.js', import.meta.url),'utf8');
  const src=readFileSync(new URL('../app/social.js', import.meta.url),'utf8')+(mr.match(/const ROSTER_META=\{[\s\S]*?\n\};/)||[''])[0];
  ok(src.includes('var(--rs-idle-bg)') && !/#FFF1F1|#E5E5E5|#1899D6|#FFE9A8/.test(src), 'A4: ROSTER_META i baner błędu bez hardkodów (zmienne CSS)');
  ok(/\.field\{display:grid;grid-template-columns:minmax\(0,1fr\)/.test(css), 'A3: etykieta nad polem (bez kolumny 84/64 px)');
  ok(/\.mh-setting\{[^}]*flex-wrap:wrap/.test(css), '320 px: ustawienia w menu zawijają segmenty');
});
await group('F6b (U10): „Pikantne ksywy" w menu — domyślnie WYŁ.', async ()=>{
  const seg=$(window,'spicySeg');
  ok(seg && seg.querySelector('button[data-spicy="off"]').classList.contains('on'), 'domyślnie Wył.');
  seg.querySelector('button[data-spicy="on"]').click();
  eq2(window.localStorage.getItem('stacjaSpicy'), 'on', 'Wł. zapisane');
  seg.querySelector('button[data-spicy="off"]').click();
  eq2(window.localStorage.getItem('stacjaSpicy'), 'off', 'Wył. zapisane');
});
await group('F6b (F8/U8c/F9/R8/U4): ZATWIERDŹ, wskaźnik faz, intro tylko przed „słuchaj", kredyty, SFX', async ()=>{
  const w=window; const ws=await f6bRoom();
  w.__SFX_LOG__=[];
  ws.pushState(playState(ws, { playNonce:6001, slots:[{round:1,cat:'d80',mode:'music'},{round:1,cat:'d80',mode:'music'}], si:1, qi:2, rounds:1 })); await settle(8);
  const hd=$(w,'mpStage').querySelector('.mp-hd');
  ok(hd && /Pyt\. 8\/10/.test(hd.textContent), 'A2: nagłówek MP — numer w CAŁYM meczu (8/10) — '+(hd&&hd.querySelector('.mp-hd-title').textContent));
  ok(hd.querySelector('.mp-ph i.on') && hd.querySelector('.mp-ph i.on').textContent==='🎧', 'U8c: wskaźnik faz — aktywne 🎧 w „słuchaj"');
  w.mpGoKombinuj(); await settle(4);
  ok($(w,'mpStage').querySelector('.mp-ph i.on').textContent==='🧠', 'U8c: po „kombinujemy" aktywne 🧠');
  ok(![...$(w,'mpStage').querySelectorAll('.mp-intro-lb')].some(x=>/Kombinujcie/i.test(x.textContent)), 'F9: „kombinujcie" bez intra');
  const lb=$(w,'mpStage').querySelector('.mp-lockbtn');
  ok(lb && /ZATWIERDŹ/.test(lb.textContent) && lb.getAttribute('aria-label'), 'F8: host ma pełny przycisk „ZATWIERDŹ" (opisany)');
  ok(!$(w,'mpStage').querySelector('.mp-lockmini'), 'F8: bez mini ✓ 36 px');
  // odsłona: stary serwer (bez credits) → kredyty z bucketu drużyny w stanie REVEAL; pudło → „bzzt"
  ws.pushState(revealState(ws, { playNonce:6002, byTeam:{ all:{ proposals:[{id:'p',by:'k',byName:'kaśka',values:{title:'Yesterday'}}], votes:{title:{k:'Yesterday'}}, sure:[], passed:[] } },
    reveal:{ kind:'music', track:'Hey Jude', artist:'Beatles', okTitle:false, okArtist:false, teamOk:false, gained:0, pewniacy:[], locked:{title:'Yesterday',artist:''} } })); await settle(6);
  const rv=$(w,'mpRoom').innerHTML;
  ok(/rv-credits/.test(rv) && /kaśka<\/b> → tytuł/.test(rv), 'R8: „Złożona z głosów: kaśka → tytuł" (fallback z bucketu)');
  ok(w.__SFX_LOG__.includes('buzz'), 'U4: pudło → „bzzt" — '+w.__SFX_LOG__.join(','));
  ok($(w,'mpStage').querySelector('.mp-ph i.on').textContent==='👁', 'U8c: odsłona → 👁');
  w.mpAdvance(); await settle(3);
  // częściowe + credits z serwera
  ws.pushState(revealState(ws, { playNonce:6003, reveal:{ kind:'music', track:'A', artist:'B', okTitle:true, okArtist:false, teamOk:false, gained:50, pewniacy:[],
    locked:{title:'A',artist:'x'}, credits:[{key:'title',label:'tytuł',name:'<b>mati</b>'}] } })); await settle(6);
  ok(w.__SFX_LOG__.includes('ding'), 'U4: częściowe → „ding"');
  ok(/&lt;b&gt;mati&lt;\/b&gt;<\/b> → tytuł/.test($(w,'mpRoom').innerHTML), 'R8: credits z serwera (escapowane)');
  w.mpAdvance(); await settle(3);
  ws.pushState({ phase:'done', tallyList:[{name:'Host',correct:1}], mvp:null, beerTally:{}, playNonce:6003 }); await settle(6);
  ok(w.__SFX_LOG__.includes('fanfare'), 'U4: koniec meczu → fanfara');
  // duck: gra zajawka → SFX wyciszony
  const a=audioInstances.find(x=>x && typeof x.play==='function' && x.src && /p\.m4a|preview/.test(x.src)) || audioInstances[audioInstances.length-1];
  const sfx=await import('../app/sfx.js');
  w.__SFX_LOG__=[];
  const was=a.paused; a.paused=false; a.ended=false;
  sfx.playSfx('tick');
  a.paused=was;
  ok(w.__SFX_LOG__.includes('-tick') || w.__SFX_LOG__.length===0, 'U4: duck — pod zajawką brak SFX — '+w.__SFX_LOG__.join(','));
  window.localStorage.setItem('bbSfx','off'); w.__SFX_LOG__=[]; sfx.playSfx('ding'); window.localStorage.setItem('bbSfx','on');
  eq2(w.__SFX_LOG__.length, 0, 'U4: przełącznik „Dźwięki: Wył" → cisza');
  w.__SFX_LOG__=null;
});
await group('F6b (tryb #6): „Dźwięk tylko u hosta" — nie-host nie buforuje i nie gra; gałka „słuchaj z głośnika hosta"', async ()=>{
  const w=window; const ws=await f6bRoom();
  ws._emit({ t:'presence', members:[{ id:ws._id, name:'ja' },{ id:'HOST', name:'Host' }], hostId:'HOST' }); await settle(3);
  const loads=audioInstances.reduce((n,x)=>n+(x._loads||0),0);
  audioInstances.forEach(x=>{ if(!x._wrapped){ const l=x.load.bind(x); x.load=()=>{ x._loads=(x._loads||0)+1; l(); }; x._wrapped=true; } });
  const sent0=ws.sent.length;
  ws.pushState(armState(ws, { mode:'music', preview:'https://x/p2.m4a', hostId:'HOST', armNonce:7001, audioHostOnly:true, teams:[{id:'all',members:[ws._id,'HOST']}], format:'coop' })); await settle(6);
  ok(ws.sent.slice(sent0).some(m=>m.t==='action' && m.action && m.action.type==='ready'), 'pilot zgłasza gotowość od razu');
  eq2(audioInstances.reduce((n,x)=>n+(x._loads||0),0), loads, 'pilot NIE buforuje zajawki (bez load)');
  const plays0=audioInstances.reduce((n,x)=>n+x.plays,0);
  ws.pushState(playState(ws, { playNonce:7002, preview:'https://x/p2.m4a', hostId:'HOST', audioHostOnly:true })); await settle(8);
  const k=$(w,'mpKnob');
  ok(k && k.classList.contains('remote') && /głośnika/.test(k.getAttribute('aria-label')), 'gałka pilota (głośnik) z opisem — '+(k?k.outerHTML.slice(0,120):$(w,'mpRoom').innerHTML.slice(0,300)));
  ok(k && !k.classList.contains('vinyl') && !k.hasAttribute('data-state'), 'pilot: bez płyty (nie gra tutaj) — płyta nie nadpisuje gałki głośnika');
  ok(/słuchaj z głośnika hosta/.test(txt(w,'mpPlayStatus')), 'status: „słuchaj z głośnika hosta"');
  w.mpKnobTap(); await settle(2);
  eq2(audioInstances.reduce((n,x)=>n+x.plays,0), plays0, 'nie-host nie odtwarza (też po stuknięciu gałki)');
  ok(/🔈 u hosta/.test($(w,'mpStage').querySelector('.mp-hd').textContent), 'nagłówek: znacznik „🔈 u hosta"');
  // host w tym samym trybie gra normalnie
  ws._emit({ t:'presence', members:[{ id:ws._id, name:'ja' }], hostId:ws._id }); await settle(3);
  ws.pushState(playState(ws, { playNonce:7003, preview:'https://x/p3.m4a', audioHostOnly:true })); await settle(8);
  ok($(w,'mpKnob') && !$(w,'mpKnob').classList.contains('remote') && audioInstances.reduce((n,x)=>n+x.plays,0)>plays0, 'host gra zajawkę');
});
await group('F6b (#6): TV salonu w formacie Solo — karty drużyn bez treści typów, ZATWIERDŹ WSZYSTKICH', async ()=>{
  const w=window; const ws=await f6bRoom();
  ws.pushState(playState(ws, { playNonce:7101, salon:true, format:'solo',
    teams:[{id:'t0',name:'Ala',color:'#58CC02',members:['A']},{id:'t1',name:'Bo',color:'#1CB0F6',members:['B']}], scores:{t0:0,t1:0},
    byTeam:{ t0:{ proposals:[{id:'p',by:'A',byName:'Ala',values:{title:'TAJNY TYP'}}], votes:{title:{A:'TAJNY TYP'}}, sure:[], passed:[] }, t1:{ proposals:[], votes:{}, sure:[], passed:[] } } })); await settle(8);
  w.mpGoKombinuj(); await settle(4);
  const h=$(w,'mpRoom').innerHTML;
  ok(/mp-tvteams/.test(h) && (h.match(/class="mp-tvteam"/g)||[]).length===2, 'TV: karta na drużynę');
  ok(!/TAJNY TYP/.test(h), 'TV: treść typów niewidoczna (TV widzą wszyscy)');
  ok(/ZATWIERDŹ WSZYSTKICH/.test(h), 'TV: host zatwierdza wszystkich');
  ok(!/mpProp_|mp-reacts/.test(h), 'TV: bez pól i emotek');
  ws.pushState(revealState(ws, { playNonce:7102, salon:true, format:'solo', teams:[{id:'t0',name:'Ala',members:['A']},{id:'t1',name:'Bo',members:['B']}],
    reveal:{ kind:'music', track:'Hey Jude', artist:'Beatles', byTeam:{}, ranking:[{teamId:'t0',name:'Ala',score:100,teamOk:true},{teamId:'t1',name:'Bo',score:0,teamOk:false}] } })); await settle(6);
  const r=$(w,'mpRoom').innerHTML;
  ok(/Hey Jude/.test(r) && /RANKING DRUŻYN/.test(r) && !/rv-banner/.test(r), 'TV odsłona: utwór + ranking, bez banera „swojej" drużyny');
  w.mpAdvance(); await settle(3);
});
await group('F6b (F6/F5): potwierdzenie wyjścia + „Wróć do pokoju" (30 min) + deep-link przy znanej ksywie', async ()=>{
  const w=window; let ws=await f6bRoom();
  ws.pushState(playState(ws, { playNonce:7201 })); await settle(6);
  const code=(($(w,'mpStage').querySelector('.mp-hd-title')||{}).textContent||'').match(/[A-Z0-9]{4}/)?.[0];
  ok(code, 'kod pokoju w nagłówku — '+$(w,'mpRoom').innerHTML.slice(0,200));
  ok(/mpConfirmLeave\('game'\)/.test($(w,'mpStage').querySelector('.mp-hd-back').getAttribute('onclick')), 'strzałka w nagłówku → mpConfirmLeave (nie natychmiastowe wyjście)');
  w.mpConfirmLeave('game'); await settle(2);   // jsdom (outside-only) nie odpala inline onclick — wołamy most z window
  const dlg=$(w,'mpLeaveDlg');
  ok(dlg && dlg.classList.contains('show') && /Opuścić pokój/.test(dlg.textContent) && dlg.textContent.includes(code), 'strzałka → „Opuścić pokój '+code+'?"');
  ok(/mpLeaveCancel/.test(dlg.querySelector('.mp-dlg-stay').getAttribute('onclick')), '„Zostań" podpięte');
  w.mpLeaveCancel(); await settle(2);
  ok(!dlg.classList.contains('show') && $(w,'mpRoom').style.display==='', '„Zostań" → nadal w pokoju');
  w.mpConfirmLeave('game'); await settle(2);
  ok(/mpLeaveConfirmed\('room'\)/.test($(w,'mpLeaveDlg').querySelector('.mp-dlg-go').getAttribute('onclick')), '„Wyjdź" podpięte');
  w.mpLeaveConfirmed('room'); await settle(6);
  ok($(w,'mpRoom').style.display==='none', '„Wyjdź" → poza pokojem');
  const lb=w.document.querySelector('#mpLobby [data-room-back]');
  ok(lb && !lb.hidden && lb.textContent.includes(code), 'ekran „Ze znajomymi": „Wróć do pokoju '+code+'"');
  $(w,'mpExit').click(); await settle(3);
  ok(!$(w,'goRoomBack').hidden && $(w,'goRoomBack').textContent.includes(code), 'menu: baner „Wróć do pokoju '+code+'"');
  const n=wsInstances.length;
  $(w,'goRoomBack').click(); await settle(10);
  ok(wsInstances.length===n+1 && wsInstances[n].url.includes(code), 'jeden tap → ponowne dołączenie do '+code);
  ok(w.document.body.classList.contains('mp') && $(w,'mpRoom').style.display==='', 'ekran pokoju');
  ok($(w,'goRoomBack').hidden, 'w pokoju baner ukryty');
  // lobby „wyjdź" też pyta
  ws=wsInstances[wsInstances.length-1];
  ws.pushState({ phase:null, hostId:ws._id }); await settle(4);
  const ex=w.document.querySelector('.pcz-exit'); ok(ex, 'lobby: przycisk „wyjdź"');
  if(ex){ ok(/mpConfirmLeave\('lobby'\)/.test(ex.getAttribute('onclick')), 'lobby „wyjdź" → potwierdzenie (mpConfirmLeave)'); w.mpConfirmLeave('lobby'); await settle(2); ok($(w,'mpLeaveDlg').classList.contains('show'), 'arkusz potwierdzenia w lobby'); w.mpLeaveConfirmed('room'); await settle(6); }
  // wygasły rekord (>30 min) → bez banera
  w.sessionStorage.setItem('stacjaLastRoom', JSON.stringify({ code:'ZZZZ', at:Date.now()-31*60*1000 }));
  $(w,'mpExit').click(); await settle(3);
  ok($(w,'goRoomBack').hidden, 'po 30 min baner znika — '+w.sessionStorage.getItem('stacjaLastRoom')+' '+$(w,'mpRoom').style.display);
  // deep-link ?room= przy znanej ksywie → od razu dołącza
  w.localStorage.setItem('stacjaHandle','Kapitan Refren');
  w.history.pushState({}, '', '/?room=QWER');
  const mpMod=await import('../app/mp.js');
  const n2=wsInstances.length;
  mpMod.mpBootDeepLink(); await settle(10);
  ok(wsInstances.length===n2+1 && wsInstances[n2].url.includes('QWER'), 'F5: ?room=QWER + znana ksywa → auto-dołączenie (bez „DOŁĄCZ")');
  ok($(w,'mpRoom').style.display==='', 'F5: od razu w pokoju');
  w.mpLeaveConfirmed('room'); await settle(4);
  w.history.pushState({}, '', '/');
});

/* ===================== F8a: nowe tryby — intro (solo), ABCD muzyki, rok; picker MP wg capabilities ===================== */
// zaślepka iTunes F8a: różne utwory per wykonawca (dystraktory ABCD muszą się różnić tytułem od poprawnego)
const f8aFetch=(url)=>{
  let term='X'; try{ term=new URL(String(url)).searchParams.get('term')||'X'; }catch(_e){}
  const r=(t,y)=>({ trackName:t, artistName:term, previewUrl:'https://x/'+encodeURIComponent(t)+'.m4a', collectionName:'Album '+term, releaseDate:y+'-01-01', artworkUrl100:'https://x/a100x100.jpg' });
  return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ results:[ r('Pieśń '+term, 1985), r('Ballada '+term, 1986) ] }) });
};
async function f8aSolo(modeRe, run){
  const w=window, prevFetch=globalThis.fetch, prevBase=w.STACJA_CONFIG.roomsBase;
  globalThis.fetch=f8aFetch; w.STACJA_CONFIG.roomsBase=''; repoMod.clearTrackCache();
  try{
    $(w,'toMenu').click(); await settle(2); $(w,'goSolo').click(); await settle(2);
    const { audio } = catsByKind(w);
    ok(modeChip(w, modeRe), 'picker solo: chip trybu '+modeRe);
    await f2aStartMatch(audio, modeRe);
    for(let i=0;i<200 && $(w,'check').disabled;i++) await settle(2);
    ok(!$(w,'check').disabled, 'pytanie gotowe — stan: '+txt(w,'state'));
    await run(w);
  } finally {
    if($(w,'session').classList.contains('live')){ click(w,'sessEnd'); await settle(4); }
    $(w,'sumAgain').click(); globalThis.fetch=prevFetch; w.STACJA_CONFIG.roomsBase=prevBase; repoMod.clearTrackCache();
  }
}
await group('F8a solo: tryb „intro" — etapy 1→2 s, „+ więcej", mnożnik etapu w odsłonie', async ()=>{
  await f8aSolo(/intro/, async (w)=>{
    const body=w.document.body, more=$(w,'introMore');
    ok(body.classList.contains('intro-mode'), 'body.intro-mode (przycisk „+ więcej" widoczny)');
    ok(more && !more.disabled && /\+ więcej \(2 s\)/.test(more.textContent), '„+ więcej (2 s)" aktywne — '+(more&&more.textContent));
    const dbg=soloAudioMod._soloAudioDebug();
    ok(dbg.round && dbg.round.mode==='intro' && dbg.el.currentTime===0, 'gra od początku zajawki');
    dbg.el.currentTime=1.05; dbg.el.emit('timeupdate'); await settle(1);
    ok(dbg.el.paused && /intro 1 s/.test(txt(w,'state')), 'etap 1 s: stop po 1 s — '+txt(w,'state'));
    const plays=dbg.el.plays;
    more.click(); await settle(3);
    ok(dbg.el.plays===plays+1 && dbg.el.currentTime===0, '„+ więcej" → od początku, dłużej');
    ok(/\+ więcej \(4 s\)/.test(more.textContent), 'etap 2 s → kolejny „+ więcej (4 s)"');
    dbg.el.currentTime=1.5; dbg.el.emit('timeupdate'); await settle(1);
    ok(!dbg.el.paused, 'etap 2 s: po 1,5 s nadal gra');
    $(w,'fTitle').value='Pieśń';   // tytuł utworu = „Pieśń <wykonawca>" albo „Ballada …" — częściowe/zero; ważny mnożnik
    click(w,'check'); await settle(2);
    const rm=txt(w,'rmeta');
    ok(/na etapie 2 s/.test(rm) && /mnożnik ×1,6/.test(rm), 'odsłona: „na etapie 2 s · mnożnik ×1,6" — '+rm.replace(/\s+/g,' ').slice(0,200));
    ok(more.disabled, 'po Sprawdź „+ więcej" nieaktywne');
    const pts=+txt(w,'sPoints'); ok(pts===0 || pts===80, 'punkty = baza × 1,6 bez bonusu za szybkość (0 albo 50×1,6=80): '+pts);
  });
  ok(!window.document.body.classList.contains('intro-mode'), 'koniec meczu zdejmuje intro-mode');
});
await group('F8a solo: tryb „abcd" — 4 kafle .mc-opt z dystraktorami z kategorii, ocena po kaflu, punkty jak quiz', async ()=>{
  await f8aSolo(/ABCD/, async (w)=>{
    const opts=[...w.document.querySelectorAll('#quizForm .mc-opt')];
    ok(opts.length===4, '4 kafle (reuse .mc-opt quizu) — '+opts.length);
    ok($(w,'form').classList.contains('quiz') && !w.document.body.classList.contains('quiz-mode'), 'pola tytuł/wykonawca schowane, gałka audio widoczna');
    const texts=opts.map(b=>(b.querySelector('.mc-tx')||{}).textContent||'');
    ok(texts.every(t=>/ — /.test(t)) && new Set(texts).size===4, 'kafle „Tytuł — Wykonawca", bez duplikatów — '+texts.join(' | '));
    ok(soloAudioMod._soloAudioDebug().round, 'zajawka gra (tryb audio)');
    // wybierz klawiszem A–D (jak quiz) i sprawdź
    const ev=new w.KeyboardEvent('keydown',{ key:'b', bubbles:true, cancelable:true });
    $(w,'form').dispatchEvent(ev); await settle(1);
    ok(w.document.querySelector('#quizForm .mc-opt.sel')?.dataset.letter==='B', 'klawisz B zaznacza kafel B');
    click(w,'check'); await settle(2);
    const ok1=w.document.querySelector('#quizForm .mc-opt.ok');
    ok(ok1 && /✓/.test(ok1.textContent), 'odsłona: poprawny kafel zielony ✓');
    const pts=+txt(w,'sPoints'); const hit=ok1.dataset.letter==='B';
    ok(hit ? (pts>=100 && pts<=150) : pts===0, 'punkty jak quiz (100 + szybkość) / 0 — '+pts+' (trafienie: '+hit+')');
    ok($(w,'art').style.display!=='none', 'okładka utworu w odsłonie');
    click(w,'sessEnd'); await settle(4);
    ok(/Pieśń|Ballada/.test(txt(w,'sumList')), 'podsumowanie: tytuł utworu (nie prompt ABCD) — '+txt(w,'sumList').slice(0,80));
  });
});
await group('F8a solo: tryb „rok" — pole ±1 + suwak, punkty 100/70/50/20, odsłona z rokiem', async ()=>{
  await f8aSolo(/rok/, async (w)=>{
    const inp=$(w,'qf_year'), rng=$(w,'qf_yearRange');
    ok(inp && rng && inp.type==='number' && rng.type==='range', 'pole liczbowe + suwak');
    ok(+rng.min===1950 && +rng.max===2026, 'zakres 1950–2026');
    rng.value='1983'; rng.dispatchEvent(new w.Event('input')); ok(inp.value==='1983', 'suwak → pole');
    const plus=w.document.querySelector('#quizForm .yr-step[data-d="1"]'); plus.click(); plus.click();
    ok(inp.value==='1985' && rng.value==='1985', '+1 ×2 → 1985 (pole i suwak)');
    click(w,'check'); await settle(2);
    const head=txt(w,'revealHead'), rm=txt(w,'rmeta');
    ok(/Dokładnie|±1 rok/.test(head), 'nagłówek wyniku roku — '+head);
    ok(/Rok/.test(rm) && /198[56]/.test(rm) && /Ty: 1985/.test(rm), 'odsłona: rok utworu + „Ty: 1985" — '+rm.replace(/\s+/g,' ').slice(0,160));
    const pts=+txt(w,'sPoints'); ok(pts>=70 && pts<=150, 'punkty 100/70 (+ szybkość) — '+pts);
    ok(inp.disabled, 'po Sprawdź pole roku zablokowane');
  });
});
await group('F8a MP: picker wg capabilities serwera — stary serwer bez ABCD/rok, nowy z; intro nigdy', async ()=>{
  const w=window; const ws=await f6bRoom();
  ws.pushState({ phase:null, hostId:ws._id }); await settle(4);
  w.mpLobbyStart(); await settle(4);
  let html=$(w,'mpRoom').innerHTML;
  ok(/Tryby pytań/.test(html) && /muzyka/.test(html), 'picker MP wyrenderowany');
  ok(!/ABCD/.test(html) && !/📅 rok/.test(html) && !/⏱ intro/.test(html), 'stary serwer (presence bez modes) → bez nowych trybów');
  ws._emit({ t:'presence', members:[{id:ws._id,name:'host'}], hostId:ws._id, modes:['music','lektor','reverse','snippet','abcd','year','quiz'] }); await settle(4);
  w.mpLobbyStart(); await settle(4);
  html=$(w,'mpRoom').innerHTML;
  ok(/mpToggleMode\('abcd'\)/.test(html) && /mpToggleMode\('year'\)/.test(html), 'nowy serwer → chipy ABCD i rok');
  ok(!/mpToggleMode\('intro'\)/.test(html), 'intro tylko solo — brak w MP');
  // stan PLAY trybu „rok": pole liczbowe; ABCD: kafle w pudełku pytania
  ws.pushState(playState(ws, { playNonce:8101, mode:'year', answerSlots:[{key:'year',label:'rok'}] })); await settle(6);
  w.mpGoKombinuj(); await settle(3);
  const yi=$(w,'mpProp_year')||$(w,'mpTyp_year');
  ok(yi && yi.getAttribute('inputmode')==='numeric', 'MP rok: pole liczbowe (inputmode numeric)');
  ws.pushState(playState(ws, { playNonce:8102, mode:'abcd', answerSlots:[{key:'a',label:'litera (A–D)'}], prompt:'Jaki to utwór?\nA) X — Y\nB) Africa — Toto\nC) Jump — Van Halen\nD) Take On Me — a-ha' })); await settle(6);
  w.mpGoKombinuj(); await settle(3);
  ok(/który utwór\?/.test($(w,'mpRoom').innerHTML) && $(w,'mpRoom').innerHTML.includes('Africa — Toto'), 'MP ABCD: kafle widoczne w fazie odpowiadania');
  // odsłona „rok"
  ws.pushState(playState(ws, { phase:'reveal', playNonce:8103, mode:'year', slots:[{round:1,cat:'d80',mode:'year'}], answerSlots:[{key:'year',label:'rok'}],
    reveal:{ kind:'year', track:'Africa', artist:'Toto', year:'1982', album:'Toto IV', art:'', yearNote:'rok wg wydania w iTunes',
      okBySlot:{year:true}, teamOk:true, gained:70, locked:{year:'1983'}, yearEval:{pts:70,diff:1,tier:'off1'} } })); await settle(6);
  const rv=$(w,'mpRoom').innerHTML;
  ok(/ROK/.test(rv) && /1982/.test(rv) && /drużyna: „1983"/.test(rv) && /±1 rok/.test(rv), 'odsłona MP „rok": rok utworu + typ drużyny + tier');
  ok(/rok wg wydania w iTunes/.test(rv), 'odsłona MP: notka o roku z iTunes');
  w.mpAdvance && w.mpAdvance();
  w.mpLeaveConfirmed('room'); await settle(4);
});

/* ===================== F8b: Stacja dnia (karta, start, jedna próba, udostępnianie), share zwykłego meczu, legenda ===================== */
const dailyCore = await import('../core/daily.js');
const catalogMod = await import('../app/catalog.js');
// schowek: przechwyć tekst „Udostępnij" (navigator.share brak w jsdom → fallback do schowka)
const shared=[];
const stubClipboard=()=>{ const v={ writeText:(t)=>{ shared.push(t); return Promise.resolve(); } };
  for(const nav of new Set([window.navigator, globalThis.navigator].filter(Boolean))){ try{ Object.defineProperty(nav,'clipboard',{ value:v, configurable:true }); }catch(_e){} } };
await group('F8b Stacja dnia: karta w menu → start (plan z seeda daty) → próba zapisana → druga próba zablokowana → udostępnianie', async ()=>{
  const w=window, d=w.document, body=d.body;
  stubClipboard();
  const prevFetch=globalThis.fetch, prevBase=w.STACJA_CONFIG.roomsBase;
  globalThis.fetch=f8aFetch; w.STACJA_CONFIG.roomsBase=''; repoMod.clearTrackCache();
  try{
    if($(w,'session').classList.contains('live')){ click(w,'sessEnd'); await settle(4); }
    $(w,'sumAgain').click();
    w.__STACJA_TODAY__='2026-10-20';
    w.localStorage.setItem('stacjaDaily', JSON.stringify({ v:1, days:{ '2026-10-19':{ key:'2026-10-19', hits:5, total:10, grid:'🟩', results:[], done:true } }, best:1 }));
    $(w,'toMenu').click(); await settle(2);
    const card=$(w,'goDaily');
    ok(card && /^Stacja dnia #6/.test(txt(w,'goDailyTx')), 'karta „Stacja dnia #6" (2026-10-15 = #1) — '+txt(w,'goDailyTx'));
    ok(/zagraj/.test(txt(w,'goDailySub')) && /🔥 seria 1 dzień/.test(txt(w,'goDailySub')), 'stan: „zagraj" + seria z wczoraj żyje — '+txt(w,'goDailySub'));
    const goQuickIdx=[...$(w,'menu').children].indexOf($(w,'goQuick')), dailyIdx=[...$(w,'menu').children].indexOf(card);
    ok(dailyIdx===goQuickIdx+1, 'karta pod „Graj teraz"');
    const plan=dailyCore.dailyPlan(dailyCore.dailySeed('2026-10-20'), dailyCore.dailyPool(catalogMod.ALL_CATS));
    card.click();
    for(let i=0;i<300 && $(w,'check').disabled;i++) await settle(2);
    ok(body.classList.contains('solo') && body.classList.contains('playing') && body.classList.contains('daily'), 'ekran solo, mecz dnia trwa');
    ok(/^Pyt\. 1\/10$/.test(txt(w,'sessProg')) && !/blok/.test(txt(w,'sessCtx')), '10 pytań po jednym (bez „bloków") — '+txt(w,'sessProg')+' | '+txt(w,'sessCtx'));
    ok(txt(w,'scrTitle')==='Stacja dnia #6 · '+catalogMod.catLabel(plan.slots[0].cat), 'pytanie 1 z kategorii planu dnia (seed daty) — '+txt(w,'scrTitle'));
    ok(!$(w,'check').disabled, 'pytanie 1 gotowe — stan: '+txt(w,'state'));
    ok(/tytuł 50/.test(txt(w,'footLegend')), 'stopka: legenda muzyki — '+txt(w,'footLegend'));
    const st=JSON.parse(w.localStorage.getItem('stacjaDaily'));
    ok(st.days['2026-10-20'] && st.days['2026-10-20'].done===false, 'próba zapisana już przy pierwszym grywalnym pytaniu (przerwanie = wynik częściowy)');
    // pytanie 1: pudło
    click(w,'check'); await settle(2);
    ok(/Pudło/.test(txt(w,'revealHead')), 'pudło w pytaniu 1');
    // menu w trakcie → karta „w trakcie"
    $(w,'toMenu').click(); await settle(2);
    ok(/w trakcie/.test(txt(w,'goDailySub')), 'karta w trakcie meczu dnia — '+txt(w,'goDailySub'));
    $(w,'goDaily').click(); await settle(2);
    ok(body.classList.contains('solo') && $(w,'session').classList.contains('live') && /^Pyt\. 1\/10$/.test(txt(w,'sessProg')), 'karta w trakcie → powrót do gry (bez nowego meczu)');
    // przerwanie meczu → wynik częściowy + udostępnianie
    click(w,'sessEnd'); await settle(4);
    ok($(w,'summary').classList.contains('show'), 'podsumowanie po przerwaniu');
    eq2(txt(w,'sumGrid'), '⬛⬜⬜⬜⬜⬜⬜⬜⬜⬜', 'siatka: pudło + 9 nierozegranych');
    ok(/Stacja dnia #6/.test(txt(w,'sumSub')) && /🔥 seria 2 dni/.test(txt(w,'sumSub')), 'podtytuł: numer dnia + seria 2 dni — '+txt(w,'sumSub'));
    const sb=$(w,'sumShare'); ok(sb && !sb.hidden && txt(w,'sumShare')==='Udostępnij', 'przycisk „Udostępnij"');
    sb.click(); await settle(4);
    const t=shared[shared.length-1]||'';
    ok(/^STACJA #6 🎧 0\/10 · 🔥2\n⬛⬜⬜⬜⬜⬜⬜⬜⬜⬜\nhttps?:\/\/[^?#\s]+$/.test(t), 'tekst udostępniania (bez danych osobowych): '+JSON.stringify(t));
    ok(/Skopiowano/.test(txt(w,'sumShareSt')), 'fallback do schowka → „Skopiowano"');
    const rec=JSON.parse(w.localStorage.getItem('stacjaDaily')).days['2026-10-20'];
    ok(rec && rec.played===1 && rec.grid==='⬛⬜⬜⬜⬜⬜⬜⬜⬜⬜' && !('name' in rec), 'zapis dnia: 1 rozegrane, siatka');
    // druga próba zablokowana
    $(w,'toMenu').click(); await settle(2);
    ok(/zagrane: 0\/10/.test(txt(w,'goDailySub')) && /🔥 seria 2 dni/.test(txt(w,'goDailySub')) && card.classList.contains('done'), 'karta po zagraniu: „zagrane: 0/10 · 🔥 seria 2 dni" — '+txt(w,'goDailySub'));
    const nFetch=fetchCalls.length;
    card.click(); await settle(6);
    ok(!$(w,'session').classList.contains('live') && $(w,'summary').classList.contains('show'), 'druga próba zablokowana → wynik dnia zamiast meczu');
    ok(fetchCalls.length===nFetch, 'bez losowania utworów przy zablokowanej próbie');
    eq2(txt(w,'sumBig'), '0 / 10', 'wynik z zapisu'); ok(/kolejna jutro/.test(txt(w,'sumSub')), 'informacja „kolejna jutro"');
    $(w,'sumShare').click(); await settle(4);
    ok(/^STACJA #6 🎧 0\/10 · 🔥2\n/.test(shared[shared.length-1]||''), 'udostępnianie z ekranu wyniku dnia');
    // profil: najlepsza seria (lokalnie, także bez serwera)
    $(w,'toMenu').click(); await settle(2); $(w,'goProfil').click(); await settle(10);
    const pf=$(w,'pfDaily');
    ok(pf && /NAJLEPSZA SERIA/.test(pf.textContent) && /🔥 2/.test(pf.textContent), 'profil: seria dni + najlepsza seria — '+(pf&&pf.textContent.replace(/\s+/g,' ')));
    // nowy dzień → karta znów „zagraj"
    w.__STACJA_TODAY__='2026-10-21';
    $(w,'toMenu').click(); await settle(2);
    ok(/#7/.test(txt(w,'goDailyTx')) && /zagraj/.test(txt(w,'goDailySub')) && !card.classList.contains('done'), 'następny dzień: #7, znów „zagraj" — '+txt(w,'goDailySub'));
  } finally {
    delete w.__STACJA_TODAY__; w.localStorage.removeItem('stacjaDaily');
    if($(w,'session').classList.contains('live')){ $(w,'goSolo').click(); click(w,'sessEnd'); await settle(4); }
    $(w,'goSolo').click(); await settle(2); $(w,'sumAgain').click();
    globalThis.fetch=prevFetch; w.STACJA_CONFIG.roomsBase=prevBase; repoMod.clearTrackCache();
  }
});
await group('F8b zwykły mecz solo: „Udostępnij wynik" (punkty + X/Y + siatka)', async ()=>{
  const w=window; stubClipboard();
  const prevFetch=globalThis.fetch, prevBase=w.STACJA_CONFIG.roomsBase;
  globalThis.fetch=f8aFetch; w.STACJA_CONFIG.roomsBase=''; repoMod.clearTrackCache();
  try{
    $(w,'toMenu').click(); await settle(2); $(w,'goSolo').click(); await settle(2);
    const { audio } = catsByKind(w);
    await f2aStartMatch(audio, /muzyka/);
    for(let i=0;i<200 && $(w,'check').disabled;i++) await settle(2);
    click(w,'check'); await settle(2);
    click(w,'sessEnd'); await settle(4);
    ok(!w.document.body.classList.contains('daily'), 'zwykły mecz — bez body.daily');
    ok(txt(w,'sumShare')==='Udostępnij wynik' && !$(w,'sumShare').hidden, 'przycisk „Udostępnij wynik"');
    eq2(txt(w,'sumGrid'), '⬛', 'siatka rozegranych pytań');
    $(w,'sumShare').click(); await settle(4);
    ok(/^STACJA 🎧 0 pkt · 0\/1\n⬛\nhttps?:\/\//.test(shared[shared.length-1]||''), 'tekst: punkty + X/Y + siatka + link — '+JSON.stringify(shared[shared.length-1]));
  } finally { $(w,'sumAgain').click(); globalThis.fetch=prevFetch; w.STACJA_CONFIG.roomsBase=prevBase; repoMod.clearTrackCache(); }
});
await group('F8b stopka-legenda punktacji wg trybu pytania (rok / intro / ABCD)', async ()=>{
  await f8aSolo(/rok/, async (w)=>{ eq2(txt(w,'footLegend'), 'dokładnie 100 · ±1 70 · ±2 50 · dekada 20', 'rok'); });
  await f8aSolo(/intro/, async (w)=>{ eq2(txt(w,'footLegend'), 'im wcześniej, tym więcej: ×2.0 → ×1.0', 'intro'); });
  await f8aSolo(/ABCD/, async (w)=>{ eq2(txt(w,'footLegend'), 'trafienie 100 · szybkość · seria', 'ABCD'); });
});
/* ===================== EKSPERYMENT: „od tyłu krótko" / „składanka" / „okładka" (solo) + picker MP ===================== */
const eksTerms=[];   // zapytania iTunes (entity:term) — test zna wykonawcę wylosowanego pytania
// zaślepka iTunes: 5 różnych utworów per wykonawca, albumy (entity=album), bajty zajawek (arrayBuffer)
const eksFetch=(url)=>{
  const u=String(url);
  if(/^https:\/\/x\/.*\.m4a/.test(u)) return Promise.resolve({ ok:true, status:200, arrayBuffer:()=>Promise.resolve(new ArrayBuffer(16)) });
  let term='X', entity='song'; try{ const q=new URL(u).searchParams; term=q.get('term')||'X'; entity=q.get('entity')||'song'; }catch(_e){}
  eksTerms.push(entity+':'+term);
  if(entity==='album'){
    const al=(n,extra={})=>({ collectionName:n, artistName:term, artworkUrl100:'https://x/c/'+encodeURIComponent(n)+'/100x100bb.jpg', releaseDate:'1984-05-01T00:00:00Z', trackCount:10, ...extra });
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ results:[ al('Greatest Hits'), al('Płyta '+term), al('Jakiś Singiel - Single',{trackCount:1}) ] }) });
  }
  const r=(t,y)=>({ trackName:t, artistName:term, previewUrl:'https://x/'+encodeURIComponent(t)+'.m4a', collectionName:'Album '+term, releaseDate:y+'-01-01', artworkUrl100:'https://x/a100x100.jpg' });
  return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ results:['Raz','Dwa','Trzy','Cztery','Pięć'].map((t,i)=>r(t+' '+term, 1980+i)) }) });
};
// minimalny WebAudio (dekodowanie/bufory/źródła) na prototypie FakeAudioContext — przywracany po grupie
class EksBuf { constructor(ch,len,sr){ this.numberOfChannels=ch; this.length=len; this.sampleRate=sr; this.duration=len/sr; this._d=[...Array(ch)].map(()=>new Float32Array(len)); } getChannelData(c){ return this._d[c]; } }
const eksSources=[];
function eksWebAudio(on){
  const P=window.AudioContext.prototype;
  const api={ decodeAudioData(){ return Promise.resolve(new EksBuf(2, 30*800, 800)); }, createBuffer(ch,len,sr){ return new EksBuf(ch,len,sr); },
    createBufferSource(){ const src={ buffer:null, connect(){}, start(...a){ src.started=true; src.startArgs=a; eksSources.push(src); }, stop(){ src.stopped=true; }, onended:null }; return src; },
    createGain(){ return { gain:{ value:1 }, connect(){} }; } };
  for(const k of Object.keys(api)){ if(on) P[k]=api[k]; else delete P[k]; }
  if(on){ P.destination={}; P.currentTime=0; } else { delete P.destination; delete P.currentTime; }
}
const stateLog=[];
const stateObs=new window.MutationObserver(()=>stateLog.push(txt(window,'state')));
async function eksSolo(modeRe, run, catKey){
  const w=window, prevFetch=globalThis.fetch, prevBase=w.STACJA_CONFIG.roomsBase;
  const P=w.HTMLCanvasElement.prototype, prevGC=P.getContext;
  const draws=[]; P.getContext=function(){ const cv=this; return { imageSmoothingEnabled:true, clearRect(){}, drawImage(src,x,y,wd,ht){ draws.push({ to:cv.width, w:wd, smooth:this.imageSmoothingEnabled }); } }; };
  globalThis.fetch=eksFetch; w.STACJA_CONFIG.roomsBase=''; repoMod.clearTrackCache(); eksWebAudio(true);
  stateLog.length=0; stateObs.observe($(w,'state'), { childList:true, characterData:true, subtree:true });
  try{
    $(w,'toMenu').click(); await settle(2); $(w,'goSolo').click(); await settle(2);
    const { audio } = catsByKind(w);
    ok(modeChip(w, modeRe), 'picker solo: chip trybu '+modeRe);
    await f2aStartMatch(catKey || audio, modeRe);
    for(let i=0;i<300 && $(w,'check').disabled;i++) await settle(2);
    ok(!$(w,'check').disabled, 'pytanie gotowe — stan: '+txt(w,'state'));
    await run(w, { draws });
  } finally {
    stateObs.disconnect();
    if($(w,'session').classList.contains('live')){ click(w,'sessEnd'); await settle(4); }
    $(w,'sumAgain').click(); globalThis.fetch=prevFetch; w.STACJA_CONFIG.roomsBase=prevBase; repoMod.clearTrackCache(); eksWebAudio(false); P.getContext=prevGC;
  }
}
await group('EKSP. solo: „od tyłu krótko" — okno 3 s wspak (WebAudio), „+ dłużej (5 s)" ×0,8, odpowiedź jak muzyka', async ()=>{
  await eksSolo(/od tyłu krótko/, async (w)=>{
    const body=w.document.body, more=$(w,'introMore'), dbg=()=>soloAudioMod._soloAudioDebug();
    ok(body.classList.contains('revsnip-mode') && !body.classList.contains('intro-mode'), 'body.revsnip-mode');
    ok(more && !more.disabled && /\+ dłużej \(5 s\)/.test(more.textContent), '„+ dłużej (5 s)" aktywne — '+(more&&more.textContent));
    for(let i=0;i<50 && !dbg().revSrc;i++) await settle(2);
    const src=dbg().revSrc && dbg().revSrc.source;
    ok(src && src.started, 'bufor WebAudio gra');
    ok(src && Math.abs(src.buffer.duration-3)<0.01, 'okno 3 s — '+(src&&src.buffer.duration));
    ok(dbg().revCache && /\.m4a$/.test(dbg().revCache.url), 'zajawka zdekodowana raz (cache do „dłużej")');
    more.click(); await settle(2);
    for(let i=0;i<50 && !(dbg().revSrc && dbg().revSrc.source!==src);i++) await settle(2);
    const src2=dbg().revSrc && dbg().revSrc.source;
    ok(src2 && src2!==src && Math.abs(src2.buffer.duration-5)<0.01 && src.stopped, '„dłużej" → nowe okno 5 s (poprzednie zatrzymane)');
    ok(more.disabled, 'ostatni etap → przycisk nieaktywny');
    $(w,'fTitle').value='Zupełnie inny'; click(w,'check'); await settle(2);
    const rm=txt(w,'rmeta').replace(/\s+/g,' ');
    ok(/okno 5 s/.test(rm) && /„dłużej" ×0,8/.test(rm), 'odsłona: okno 5 s · ×0,8 — '+rm.slice(0,200));
    ok(/Tytuł/.test(rm) && /Wykonawca/.test(rm), 'odsłona jak muzyka (tytuł + wykonawca)');
    eq2(txt(w,'footLegend'), 'tytuł 50 · wykonawca 50 · rok/album +20 · szybkość · „dłużej" ×0.8', 'legenda');
  });
});
await group('EKSP. solo: „składanka" — 4 zajawki buforowane („ładuję składankę k/4"), jeden bufor, zgadujesz wykonawcę, odsłona z 4 tytułami', async ()=>{
  await eksSolo(/składanka/, async (w)=>{
    ok(stateLog.some(t=>/ładuję składankę [1-4]\/4/.test(t||'')), 'pasek ładowania „ładuję składankę k/4" — '+stateLog.filter(Boolean).slice(0,6).join(' | '));
    const dbg=()=>soloAudioMod._soloAudioDebug();
    for(let i=0;i<50 && !dbg().revSrc;i++) await settle(2);
    const src=dbg().revSrc && dbg().revSrc.source;
    const TM=await import('../core/timing.js');
    ok(src && src.started && Math.abs(src.buffer.duration-TM.medleyDuration(4))<0.01 && Math.abs(src.buffer.duration-15.4)<0.01, 'jeden sklejony bufor: wejście 0,4 s + 4 × 1,5 s + 3 przerwy × 3 s — '+(src&&src.buffer.duration));
    if(src){   // zdekodowane zajawki = cisza (fałszywy bufor) → niezerowe próbki to WYŁĄCZNIE „tiki" (przed każdym wycinkiem)
      const d=src.buffer.getChannelData(0), sr=src.buffer.sampleRate, nz=[]; d.forEach((v,i)=>{ if(v!==0) nz.push(i); });
      const ticks=TM.medleyTickOffsets(4).map(t=>Math.round(t*sr)), clips=TM.medleyClipOffsets(4).map(t=>Math.round(t*sr));
      ok(ticks.every((t,i)=>nz.some(j=>j>=t && j<clips[i])), 'cichy „tik" tuż przed każdym z 4 wycinków — '+ticks.join(','));
      ok(nz.every(j=>ticks.some(t=>j>=t && j<t+Math.round(0.03*sr))), 'poza tikami cisza (przerwy 3 s)');
      ok(Math.max(...nz.map(j=>Math.abs(d[j])))<=0.15, 'tik cichy (amplituda ≤ 0,15)');
    }
    ok(/składanka: 4 utwory — przerwa · zaraz fragment 1\/4/.test(txt(w,'state')), 'start: liczba utworów + „zaraz fragment 1/4" — '+txt(w,'state'));
    const wait=ms=>new Promise(r=>setTimeout(r,ms));   // postęp bufora: setInterval 100 ms
    const AP=w.AudioContext.prototype; AP.currentTime=5.2; for(let i=0;i<10 && !/fragment 2\/4…/.test(txt(w,'state'));i++) await wait(60);
    ok(/^fragment 2\/4…$/.test(txt(w,'state')), 'w trakcie: licznik „fragment 2/4…" — '+txt(w,'state'));
    AP.currentTime=7; for(let i=0;i<10 && !/zaraz fragment 3\/4/.test(txt(w,'state'));i++) await wait(60);
    ok(/przerwa · zaraz fragment 3\/4/.test(txt(w,'state')), 'przerwa: „zaraz fragment 3/4" — '+txt(w,'state'));
    AP.currentTime=0;
    ok($(w,'qf_artist') && !$(w,'qf_album') && $(w,'form').classList.contains('quiz'), 'tylko pole „Wykonawca" (tytuł/rok/album schowane)');
    eq2(txt(w,'footLegend'), 'wykonawca 100 · szybkość · seria', 'legenda składanki');
    ok(/składanka/.test(txt(w,'sessCtx')), 'pasek meczu: tryb składanka — '+txt(w,'sessCtx'));
    $(w,'replay').click(); await settle(4);
    ok(src.stopped && dbg().revSrc && dbg().revSrc.source!==src, '↻ od nowa — składanka gra ponownie');
    const who=(eksTerms.filter(t=>t.startsWith('song:')).pop()||'').slice(5);   // wykonawca pytania = ostatnie zapytanie o utwory
    const C=w.CATEGORIES, { audio } = catsByKind(w), pool=({...(C.decades||{}),...(C.styles||{})})[audio].artists;
    ok(pool.includes(who), 'wykonawca z puli kategorii — '+who);
    $(w,'qf_artist').value=who.toLowerCase();
    click(w,'check'); await settle(2);
    const rm=txt(w,'rmeta').replace(/\s+/g,' ');
    ok(/Wykonawca/.test(rm) && /zagrały/.test(rm), 'odsłona: wykonawca + lista utworów — '+rm.slice(0,220));
    const zl=[...w.document.querySelectorAll('#rmeta .rnote')].map(e=>e.textContent.replace(/\s+/g,' ').trim()).map(t=>t.replace(/^·\s*/,'')).find(t=>/^zagrały/.test(t))||'';
    const m=zl.match(/^zagrały\s*1\. (.+?) · 2\. (.+?) · 3\. (.+?) · 4\. (.+)$/);
    ok(m && new Set(m.slice(1,5)).size===4 && m.slice(1,5).every(t=>/^(Raz|Dwa|Trzy|Cztery|Pięć) /.test(t) && t.endsWith(who)), '4 różne tytuły tego wykonawcy — '+(m&&m.slice(1,5).join(' | ')));
    ok(/Dobrze!/.test(txt(w,'revealHead')), 'trafiony wykonawca → „Dobrze!"');
    const pts=+txt(w,'sPoints'); ok(pts>=100 && pts<=150, 'punkty: 100 + szybkość (jak quiz) — '+pts);
    ok(!$(w,'replay').disabled && $(w,'qf_artist').disabled, 'po odsłonie: ↻ aktywne, pole zablokowane');
    click(w,'next'); await settle(4);
    for(let i=0;i<300 && $(w,'check').disabled;i++) await settle(2);
    const who2=(eksTerms.filter(t=>t.startsWith('song:')).pop()||'').slice(5);
    ok(who2 && who2!==who, 'następna składanka — inny wykonawca (anty-powtórka) — '+who2);
    $(w,'qf_artist').value='Ktoś Zupełnie Inny'; click(w,'check'); await settle(2);
    ok(/Pudło/.test(txt(w,'revealHead')) && +txt(w,'sPoints')===pts, 'pudło: 0 pkt, seria zerowana');
    click(w,'sessEnd'); await settle(4);
    ok(/Raz|Dwa|Trzy|Cztery|Pięć/.test(txt(w,'sumList')) && /składanka/.test(txt(w,'sumList')), 'podsumowanie: tytuły + tryb — '+txt(w,'sumList').slice(0,100));
  });
});
await group('EKSP. solo: „okładka" — bez audio, pikselizacja 16→32 („wyraźniej"), wykonawca + album (bonus), mnożnik etapu', async ()=>{
  await eksSolo(/okładka/, async (w, { draws })=>{
    const body=w.document.body, more=$(w,'introMore'), box=$(w,'coverBox');
    ok(body.classList.contains('cover-mode'), 'body.cover-mode (gałka/audio schowane)');
    ok(box && !box.hidden && box.dataset.blocks==='16', 'okładka widoczna, pierwszy etap 16×16 (bez 8×8) — '+(box&&box.dataset.blocks));
    ok(!soloAudioMod._soloAudioDebug().round && !soloAudioMod._soloAudioDebug().revSrc, 'brak odtwarzania audio');
    ok(/600x600bb\.jpg$/.test($(w,'coverImg').getAttribute('src')||''), 'okładka 600×600 z iTunes — '+$(w,'coverImg').getAttribute('src'));
    ok(/Płyta /.test(decodeURIComponent($(w,'coverImg').getAttribute('src')||'')), 'album studyjny zamiast „Greatest Hits" i singla');
    ok($(w,'qf_artist') && $(w,'qf_album'), 'pola: wykonawca + album (bonus)');
    ok(more && !more.disabled && /wyraźniej/.test(more.textContent), 'przycisk „wyraźniej"');
    // obraz „wczytany" → rysowanie: zmniejszanie z wygładzaniem, powiększenie bez wygładzania (twarde bloki)
    const coverMod=await import('../app/cover.js'); const img=coverMod._coverDebug().img;
    if(img){ Object.defineProperty(img,'complete',{value:true,configurable:true}); Object.defineProperty(img,'naturalWidth',{value:600,configurable:true}); img.onload && img.onload(); }
    ok(draws.some(d=>d.to===16 && d.smooth) && !draws.some(d=>d.to===8) && draws.some(d=>d.to===320 && d.smooth===false), 'pikselizacja: 16×16 → widok 320 bez wygładzania — '+JSON.stringify(draws.slice(-3)));
    ok(coverMod._coverDebug().timer, 'auto-odsłona uzbrojona (etap co 6 s)');
    more.click(); await settle(1);
    eq2(box.dataset.blocks, '32', '„wyraźniej" → 32×32');
    const src=decodeURIComponent($(w,'coverImg').getAttribute('src')||'');
    const who=(src.match(/Płyta (.+?)\//)||[])[1]||'';
    $(w,'qf_artist').value=who; $(w,'qf_album').value='Plyta '+who;
    click(w,'check'); await settle(2);
    const rm=txt(w,'rmeta').replace(/\s+/g,' ');
    ok(/Wykonawca/.test(rm) && /Album/.test(rm) && /1984/.test(rm), 'odsłona: wykonawca + album + rok — '+rm.slice(0,220));
    ok(/32×32/.test(rm) && /mnożnik ×1,6/.test(rm), 'mnożnik etapu 32×32 = ×1,6');
    eq2(+txt(w,'sPoints'), Math.round(120*1.6), 'punkty: (100 + album 20) × 1,6, bez bonusu za szybkość');
    eq2(box.dataset.blocks, '0', 'po Sprawdź — pełna okładka');
    ok(/Dobrze!/.test(txt(w,'revealHead')), 'nagłówek: trafienie');
    ok(/wykonawca 100 · album \+20/.test(txt(w,'footLegend')), 'legenda okładki');
  });
  ok($(window,'coverBox').hidden && !window.document.body.classList.contains('cover-mode'), 'koniec meczu chowa okładkę i cover-mode');
});
await group('EKSP. MP: picker — „od tyłu krótko" z nowym serwerem, składanka/okładka nigdy', async ()=>{
  const w=window; const ws=await f6bRoom();
  ws.pushState({ phase:null, hostId:ws._id }); await settle(4);
  w.mpLobbyStart(); await settle(4);
  let html=$(w,'mpRoom').innerHTML;
  ok(!/mpToggleMode\('revsnip'\)/.test(html), 'stary serwer → bez „od tyłu krótko"');
  ws._emit({ t:'presence', members:[{id:ws._id,name:'host'}], hostId:ws._id, modes:['music','lektor','reverse','snippet','abcd','year','revsnip','quiz'] }); await settle(4);
  w.mpLobbyStart(); await settle(4);
  html=$(w,'mpRoom').innerHTML;
  ok(/mpToggleMode\('revsnip'\)/.test(html) && /od tyłu krótko/.test(html), 'nowy serwer → chip „od tyłu krótko"');
  ok(!/mpToggleMode\('medley'\)/.test(html) && !/mpToggleMode\('cover'\)/.test(html), 'składanka/okładka tylko solo');
  w.mpLeaveConfirmed('room'); await settle(4);
});
/* ===================== lektor: język opisu kategorii (lyrics.js `lang`) → głos ===================== */
await group('lektor solo: „polskie po angielsku" (lang:"en") czyta angielskim głosem, inne kategorie — polskim', async ()=>{
  const w=window, C=w.CATEGORIES||{}, L=C.lyrics||{};
  ok(L['tlum-pl'] && L['tlum-pl'].lang==='en', 'lyrics.js: tlum-pl ma lang:"en"');
  ok(L['tlum-int'] && !L['tlum-int'].lang, 'tlum-int bez lang (domyślnie pl)');
  const ss=globalThis.speechSynthesis, origSpeak=ss.speak, origGV=ss.getVoices; const utts=[]; ss.speak=(u)=>{ utts.push(u); };
  ss.getVoices=()=>[ { name:'Zosia', lang:'pl-PL', localService:true }, { name:'Daniel', lang:'en-GB', localService:true, default:true },
    { name:'Microsoft Ava Online (Natural) - English (United States)', lang:'en-US' } ];
  if(typeof ss.onvoiceschanged==='function') ss.onvoiceschanged();
  try{
    $(w,'toMenu').click(); await settle(2); $(w,'goSolo').click(); await settle(2);
    for(const [key, want, voice] of [['tlum-pl','en',/Ava/], ['tlum-int','pl',/Zosia/]]){
      await f2aStartMatch(key, /lektor/);
      ok(w.document.body.classList.contains('playing'), 'mecz lektora: '+key);
      for(let i=0;i<20 && !utts.length;i++) await settle(2);
      eq2(lektorMod.lektorLastLang(), want, key+' → lektorPlay lang '+want);
      const u=utts[utts.length-1];
      ok(u && voice.test((u.voice&&u.voice.name)||'') && new RegExp('^'+want).test(u.lang||''), key+': głos '+(u&&u.voice&&u.voice.name)+' / '+(u&&u.lang));
      $(w,'replay').click(); await settle(3);   // ↻ powtórka — ten sam język
      eq2(lektorMod.lektorLastLang(), want, key+': powtórka w tym samym języku');
      utts.length=0;
      if($(w,'session').classList.contains('live')){ click(w,'sessEnd'); await settle(4); }
      $(w,'sumAgain').click(); await settle(1);
    }
  } finally { ss.speak=origSpeak; ss.getVoices=origGV; if(typeof ss.onvoiceschanged==='function') ss.onvoiceschanged(); lektorMod.lektorStop(); }
});

/* ===================== EKSPERYMENT: „fortepian" (solo) — cover fortepianowy, odsłona „cover: …" ===================== */
await group('EKSP. solo: „fortepian" — gra zajawka COVERU, odpowiedź = tytuł + oryginalny wykonawca, odsłona „cover"', async ()=>{
  const pianoQ=[];
  const pianoFetch=(url)=>{
    const u=String(url);
    if(/^https:\/\/x\/.*\.m4a/.test(u)) return Promise.resolve({ ok:true, status:200, arrayBuffer:()=>Promise.resolve(new ArrayBuffer(16)) });
    let q; try{ q=new URL(u).searchParams; }catch(_e){ q=new URLSearchParams(); }
    const term=q.get('term')||'X';
    if(q.get('attribute')==='artistTerm'){
      const r=(t,y)=>({ trackName:t, artistName:term, previewUrl:'https://x/orig-'+encodeURIComponent(t)+'.m4a', collectionName:'Album '+term, releaseDate:y+'-01-01', artworkUrl100:'https://x/orig/100x100bb.jpg' });
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ results:['Raz','Dwa','Trzy'].map((t,i)=>r(t+' '+term, 1960+i)) }) });
    }
    pianoQ.push(term);
    const m=term.match(/^(.*) piano$/);
    const who=m ? m[1].replace(/^(Raz|Dwa|Trzy) /,'') : '';   // oryginał też jest w wynikach (jak w iTunes) — kotwica tytułu
    const results = m ? [ { trackName:m[1], artistName:who, collectionName:'Album '+who, previewUrl:'https://x/orig2.m4a' }, { trackName:m[1]+' (Lullaby Version)', artistName:'Rockabye Baby!', collectionName:'Lullaby Renditions', previewUrl:'https://x/lullaby.m4a' },
      { trackName:m[1]+' (Piano Version)', artistName:'Piano Tribute Players', collectionName:'Piano Covers', previewUrl:'https://x/piano-'+encodeURIComponent(m[1])+'.m4a', artworkUrl100:'https://x/cover-art/100x100bb.jpg' } ] : [];
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ results }) });
  };
  const w=window, prevFetch=globalThis.fetch, prevBase=w.STACJA_CONFIG.roomsBase;
  globalThis.fetch=pianoFetch; w.STACJA_CONFIG.roomsBase=''; repoMod.clearTrackCache();
  try{
    $(w,'toMenu').click(); await settle(2); $(w,'goSolo').click(); await settle(2);
    ok(modeChip(w, /fortepian/), 'picker solo: chip „🎹 fortepian"');
    const C=w.CATEGORIES, all={...(C.decades||{}),...(C.styles||{})};
    ok(!M8dom.modesFor('rock-pl', all).includes('piano') && !M8dom.modesFor('disco-polo', all).includes('piano') && M8dom.modesFor('pop-world', all).includes('piano'), 'kategorie polskie bez fortepianu, pop świat z nim');
    await f2aStartMatch('pop-world', /fortepian/);
    for(let i=0;i<300 && $(w,'check').disabled;i++) await settle(2);
    ok(!$(w,'check').disabled, 'pytanie gotowe — stan: '+txt(w,'state'));
    const q=pianoQ.find(t=>/ piano$/.test(t))||''; const title=q.replace(/ piano$/,'');
    ok(title, 'zapytanie o cover „<tytuł> piano" — '+q);
    for(let i=0;i<20 && !soloAudioMod._soloAudioDebug().round;i++) await settle(2);
    const el=soloAudioMod._soloAudioDebug().el;
    ok(el && /piano-/.test(el.src||''), 'gra zajawka coveru fortepianowego (nie kołysanka, nie oryginał) — '+(el&&el.src));
    const artist=title.replace(/^(Raz|Dwa|Trzy) /,'');
    $(w,'fTitle').value=title; $(w,'fArtist').value=artist;
    click(w,'check'); await settle(2);
    const rm=txt(w,'rmeta').replace(/\s+/g,' ');
    ok(/Dobrze!/.test(txt(w,'revealHead')), 'tytuł + ORYGINALNY wykonawca → „Dobrze!" — '+txt(w,'revealHead'));
    ok(/cover/.test(rm) && /Piano Tribute Players/.test(rm), 'odsłona: „cover 🎹 Piano Tribute Players" — '+rm.slice(0,240));
    ok(/orig\/300x300/.test($(w,'art').getAttribute('src')||''), 'okładka ORYGINAŁU (nie coveru) — '+$(w,'art').getAttribute('src'));
    ok(/tytuł 50 · wykonawca 50/.test(txt(w,'footLegend')), 'punktacja jak muzyka');
  } finally {
    if($(w,'session').classList.contains('live')){ click(w,'sessEnd'); await settle(4); }
    $(w,'sumAgain').click(); globalThis.fetch=prevFetch; w.STACJA_CONFIG.roomsBase=prevBase; repoMod.clearTrackCache();
  }
});
/* ===================== EKSPERYMENT: „gitara" (solo) — cover gitarowy (fingerstyle), wokalny/lekcja odrzucone; tytuł bez „(2012 Remaster)" ===================== */
await group('EKSP. solo: „gitara" — gra zajawka coveru fingerstyle (nie wokalny, nie lekcja), odsłona „cover 🎸", tytuł bez dopisku remasteru', async ()=>{
  const gQ=[];
  const gFetch=(url)=>{
    const u=String(url);
    if(/^https:\/\/x\/.*\.m4a/.test(u)) return Promise.resolve({ ok:true, status:200, arrayBuffer:()=>Promise.resolve(new ArrayBuffer(16)) });
    let q; try{ q=new URL(u).searchParams; }catch(_e){ q=new URLSearchParams(); }
    const term=q.get('term')||'X';
    if(q.get('attribute')==='artistTerm'){
      const r=(t,y)=>({ trackName:t+' (2012 Remaster)', artistName:term, previewUrl:'https://x/orig-'+encodeURIComponent(t)+'.m4a', collectionName:'Album '+term, releaseDate:y+'-01-01', artworkUrl100:'https://x/orig/100x100bb.jpg' });
      return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ results:['Raz','Dwa','Trzy'].map((t,i)=>r(t+' '+term, 1960+i)) }) });
    }
    gQ.push(term);
    const m=term.match(/^(.*) guitar$/);
    const who=m ? m[1].replace(/^(Raz|Dwa|Trzy) /,'') : '';
    const results = m ? [ { trackName:m[1], artistName:who, collectionName:'Album '+who, previewUrl:'https://x/orig2.m4a' },
      { trackName:m[1]+' (Guitar Cover)', artistName:'Cover Kings', collectionName:'Cover Sessions Vol. 3', previewUrl:'https://x/vocal.m4a' },
      { trackName:'How to Play '+m[1]+' - Guitar Lesson', artistName:'Guitar Tutor', collectionName:'Guitar Lessons', previewUrl:'https://x/lesson.m4a' },
      { trackName:m[1]+' (Fingerstyle)', artistName:'Fingerstyle Duo', collectionName:'Acoustic Guitar Covers', previewUrl:'https://x/guitar-'+encodeURIComponent(m[1])+'.m4a' } ] : [];
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ results }) });
  };
  const w=window, prevFetch=globalThis.fetch, prevBase=w.STACJA_CONFIG.roomsBase;
  globalThis.fetch=gFetch; w.STACJA_CONFIG.roomsBase=''; repoMod.clearTrackCache();
  try{
    $(w,'toMenu').click(); await settle(2); $(w,'goSolo').click(); await settle(2);
    ok(modeChip(w, /gitara/), 'picker solo: chip „🎸 gitara"');
    const C=w.CATEGORIES, all={...(C.decades||{}),...(C.styles||{})};
    ok(!M8dom.modesFor('rock-pl', all).includes('guitar') && !M8dom.modesFor('evergreen-pl', all).includes('guitar') && M8dom.modesFor('pop-world', all).includes('guitar'), 'kategorie polskie bez gitary, pop świat z nią');
    await f2aStartMatch('pop-world', /gitara/);
    for(let i=0;i<300 && $(w,'check').disabled;i++) await settle(2);
    ok(!$(w,'check').disabled, 'pytanie gotowe — stan: '+txt(w,'state'));
    const q=gQ.find(t=>/ guitar$/.test(t))||''; const title=q.replace(/ guitar$/,'');
    ok(title && !/Remaster/.test(q), 'zapytanie o cover „<tytuł> guitar" (bez dopisku remasteru) — '+q);
    for(let i=0;i<20 && !soloAudioMod._soloAudioDebug().round;i++) await settle(2);
    const el=soloAudioMod._soloAudioDebug().el;
    ok(el && /guitar-/.test(el.src||''), 'gra zajawka coveru fingerstyle (nie wokalny „Cover Sessions", nie lekcja, nie oryginał) — '+(el&&el.src));
    const artist=title.replace(/^(Raz|Dwa|Trzy) /,'');
    $(w,'fTitle').value=title; $(w,'fArtist').value=artist;
    click(w,'check'); await settle(2);
    const rm=txt(w,'rmeta').replace(/\s+/g,' ');
    ok(/Dobrze!/.test(txt(w,'revealHead')), 'tytuł + ORYGINALNY wykonawca → „Dobrze!" — '+txt(w,'revealHead'));
    ok(/cover/.test(rm) && /🎸 Fingerstyle Duo/.test(rm), 'odsłona: „cover 🎸 Fingerstyle Duo" — '+rm.slice(0,240));
    ok(rm.includes(title) && !/Remaster/.test(rm), 'odsłona: tytuł bez „(2012 Remaster)" — '+rm.slice(0,160));
  } finally {
    if($(w,'session').classList.contains('live')){ click(w,'sessEnd'); await settle(4); }
    $(w,'sumAgain').click(); globalThis.fetch=prevFetch; w.STACJA_CONFIG.roomsBase=prevBase; repoMod.clearTrackCache();
  }
});
/* ===================== „akustycznie / unplugged" — kategoria w pickerze, tryby bez coverów/okładki/składanki, gra wersja unplugged ===================== */
await group('Kategoria „akustycznie / unplugged": w pickerze (Style), tryby, zajawka = wersja z albumu MTV Unplugged (nie studyjna)', async ()=>{
  const w=window, C=w.CATEGORIES, cat=C.styles && C.styles.unplugged;
  ok(cat && Array.isArray(cat.songs) && cat.songs.length>=40 && cat.songs.every(s=>s.match && s.title && s.artist && s.year && s.album), 'categories.js: songs[] {title, artist, year, album, match}');
  const tk=[...w.document.querySelectorAll('.tick')].find(t=>t.dataset.era==='unplugged');
  ok(tk && /akustycznie \/ unplugged/.test(tk.textContent), 'picker solo: tick „akustycznie / unplugged" — '+(tk&&tk.textContent));
  const all={...(C.decades||{}),...(C.styles||{})};
  const ms=M8dom.modesFor('unplugged', all);
  ok(['music','intro','abcd','year','reverse','revsnip','slowmo','fastmo'].every(m=>ms.includes(m)), 'tryby: muzyka/intro/ABCD/rok/od tyłu/obroty — '+ms.join(','));
  ok(!['piano','guitar','cover','medley'].some(m=>ms.includes(m)), 'bez fortepianu/gitary/okładki/składanki');
  const songQ=[];
  const uFetch=(url)=>{
    const u=String(url);
    if(/^https:\/\/x\/.*\.m4a/.test(u)) return Promise.resolve({ ok:true, status:200, arrayBuffer:()=>Promise.resolve(new ArrayBuffer(16)) });
    let q; try{ q=new URL(u).searchParams; }catch(_e){ q=new URLSearchParams(); }
    const term=(q.get('term')||'').toLowerCase(); songQ.push(term);
    const s=cat.songs.find(x=>term.startsWith((x.artist+' '+x.title).toLowerCase()));
    const results = s ? [ { trackName:s.title, artistName:s.artist, collectionName:'Studio Album', previewUrl:'https://x/studio.m4a', releaseDate:'1990-01-01' },
      { trackName:s.title+' (Live)', artistName:s.artist, collectionName:'Big Live Show', previewUrl:'https://x/live.m4a', releaseDate:'1999-01-01' },
      { trackName:s.title+' (Live Acoustic)', artistName:s.artist, collectionName:s.album+' (MTV Unplugged) Akustycznie', previewUrl:'https://x/unplugged-1.m4a', releaseDate:s.year+'-01-01' } ] : [];
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve({ results }) });
  };
  const prevFetch=globalThis.fetch, prevBase=w.STACJA_CONFIG.roomsBase;
  globalThis.fetch=uFetch; w.STACJA_CONFIG.roomsBase=''; repoMod.clearTrackCache();
  try{
    await f2aStartMatch('unplugged', /muzyka/);
    for(let i=0;i<300 && $(w,'check').disabled;i++) await settle(2);
    ok(!$(w,'check').disabled, 'pytanie gotowe — stan: '+txt(w,'state'));
    for(let i=0;i<20 && !soloAudioMod._soloAudioDebug().round;i++) await settle(2);
    const el=soloAudioMod._soloAudioDebug().el;
    ok(el && /unplugged-1/.test(el.src||''), 'gra wersja akustyczna/unplugged (nie studyjna, nie zwykłe live) — '+(el&&el.src));
    ok(songQ.some(t=>/ (unplugged|akustycz|mtv)$/.test(t)), 'zapytanie „artysta tytuł <słowo z match>" — '+songQ[0]);
    click(w,'check'); await settle(2);
    const rm=txt(w,'rmeta').replace(/\s+/g,' ');
    ok(cat.songs.some(s=>rm.includes(s.title) && rm.includes(s.album)), 'odsłona: tytuł i album wydania akustycznego z danych — '+rm.slice(0,200));
  } finally {
    if($(w,'session').classList.contains('live')){ click(w,'sessEnd'); await settle(4); }
    $(w,'sumAgain').click(); globalThis.fetch=prevFetch; w.STACJA_CONFIG.roomsBase=prevBase; repoMod.clearTrackCache();
  }
});
/* ===================== EKSPERYMENT: „oś czasu" (solo) — kotwica, szczeliny, wstawienie/odpadnięcie, podsumowanie ===================== */
const soloMod = await import('../app/solo.js');   // ten sam singleton co w app.js
const TLcore = await import('../core/timeline.js');
await group('EKSP. solo: „oś czasu" — kotwica, szczeliny „tu", trafienie wsuwa kartę, pudło — karta odpada, oś w podsumowaniu', async ()=>{
  await eksSolo(/oś czasu/, async (w)=>{
    const body=w.document.body, d=()=>soloMod._timelineDebug();
    ok(body.classList.contains('timeline-mode') && $(w,'form').classList.contains('quiz'), 'body.timeline-mode, pola tytuł/wykonawca muzyki schowane');
    let dbg=d();
    ok(dbg && dbg.cards.length===1 && dbg.cards[0].anchor && dbg.cards[0].year>=1980 && dbg.cards[0].year<=1989, 'kotwica: 1 karta z rokiem z dekady — '+JSON.stringify(dbg&&dbg.cards));
    ok(dbg.card && dbg.card.year>=1980 && dbg.card.year<=1989, 'karta pytania z wiarygodnym rokiem — '+(dbg.card&&dbg.card.year));
    const sc=$(w,'tlScroll'); ok(sc, 'oś w kontenerze ze scrollem (.tl-scroll)');
    let gaps=[...w.document.querySelectorAll('#quizForm .tl-gap')];
    ok(gaps.length===2 && gaps.every(b=>/^tu$/.test(b.textContent)), '2 szczeliny „tu" wokół kotwicy');
    ok(w.document.querySelector('#quizForm .tl-card.tl-anchor .tl-y').textContent===String(dbg.cards[0].year), 'karta: rok duży (tl-y)');
    ok(/Wstaw tutaj — (przed|po) \d{4}/.test(gaps[0].getAttribute('aria-label')||''), 'aria-label szczeliny — '+gaps[0].getAttribute('aria-label'));
    ok(!/\d{4}/.test(txt(w,'quizForm').replace(String(dbg.cards[0].year),'')), 'rok pytanego utworu NIE jest widoczny przed odsłoną');
    eq2(txt(w,'footLegend'), 'dobre miejsce na osi 100 · tytuł +20 · wykonawca +20 · szybkość · seria', 'legenda osi');
    // trafienie: poprawna szczelina + tytuł (żeton +20)
    const good=TLcore.correctGaps(dbg.cards, dbg.card.year);
    gaps[good[0]].click(); await settle(1);
    ok(gaps[good[0]].classList.contains('sel') && gaps[good[0]].getAttribute('aria-pressed')==='true', 'wybrana szczelina zaznaczona (aria-pressed)');
    $(w,'qf_title').value=dbg.card.track;
    click(w,'check'); await settle(2);
    ok(/Dobre miejsce!/.test(txt(w,'revealHead')), 'nagłówek: dobre miejsce — '+txt(w,'revealHead'));
    dbg=d(); ok(dbg.cards.length===2, 'karta zostaje na osi (2 karty)');
    ok(w.document.querySelector('#quizForm .tl-card.tl-new'), 'nowa karta z animacją wsuwania (tl-new)');
    ok(!w.document.querySelector('#quizForm .tl-gap'), 'po odsłonie bez szczelin');
    const pts1=+txt(w,'sPoints'); ok(pts1>=120 && pts1<=180, 'punkty: 100 + tytuł 20 (+ szybkość) — '+pts1);
    const rm=txt(w,'rmeta').replace(/\s+/g,' ');
    ok(/Miejsce/.test(rm) && /rok/.test(rm) && rm.includes(String(dbg.cards[dbg.last].year)) && /2 karty/.test(rm), 'odsłona: miejsce, rok, oś — '+rm.slice(0,200));
    ok($(w,'qf_title').disabled && $(w,'qf_title').value===dbg.cards[dbg.last].track, 'żeton tytułu zachowany i zablokowany');
    // pytanie 2 — pudło (zła szczelina, jeśli istnieje)
    click(w,'next'); await settle(4);
    for(let i=0;i<300 && $(w,'check').disabled;i++) await settle(2);
    dbg=d();
    gaps=[...w.document.querySelectorAll('#quizForm .tl-gap')];
    ok(gaps.length===3, '3 szczeliny przy 2 kartach — '+gaps.length);
    ok(w.document.querySelector(`#quizForm .tl-card[data-i="${dbg.last}"]`), 'ostatnio wstawiona karta na osi (auto-scroll do niej)');
    const ok2=TLcore.correctGaps(dbg.cards, dbg.card.year), bad=[0,1,2].find(g=>!ok2.includes(g));
    if(bad!=null){
      gaps[bad].click(); click(w,'check'); await settle(2);
      ok(/Pudło/.test(txt(w,'revealHead')) && /karta odpada/.test(txt(w,'revealHead')), 'pudło: karta odpada — '+txt(w,'revealHead'));
      ok(d().cards.length===2, 'oś bez zmian (2 karty)');
      const miss=w.document.querySelector('#quizForm .tl-card.tl-miss');
      ok(miss && miss.querySelector('.tl-y').textContent===String(dbg.card.year), 'odpadła karta pokazana z rokiem tam, gdzie powinna była trafić');
      ok(w.document.querySelector('#quizForm .tl-gap.no'), 'wybrana szczelina na czerwono');
    } else ok(true, '(wszystkie szczeliny poprawne — równe lata; pudło pominięte)');
    click(w,'sessEnd'); await settle(4);
    const sum=txt(w,'sumList');
    ok(/Twoja oś czasu — 2 karty/.test(sum) && w.document.querySelectorAll('#sumList .sum-tl .tl-card').length===2, 'podsumowanie: zbudowana oś (2 karty) — '+sum.slice(0,80));
    ok(/oś czasu: 2 karty/.test(txt(w,'sumSub')), 'wynik: liczba kart — '+txt(w,'sumSub'));
  }, '80s');
  ok(!window.document.body.classList.contains('timeline-mode'), 'koniec meczu zdejmuje timeline-mode');
});
/* ===================== EKSPERYMENT: „zwolnione obroty" / „przyspieszone" (solo) — tempo WebAudio, płyta winylowa ===================== */
const vinylMod = await import('../app/vinyl.js');
await group('EKSP. solo: „zwolnione obroty" — 0.6× (WebAudio playbackRate), „szybciej" 0.75×, płyta kręci się wg tempa, pauza hamuje, odsłona 1.0× z okładką', async ()=>{
  await eksSolo(/zwolnione obroty/, async (w)=>{
    const body=w.document.body, v=$(w,'vinyl'), more=$(w,'introMore'), dbg=()=>soloAudioMod._soloAudioDebug();
    ok(body.classList.contains('tempo-mode') && body.classList.contains('slowmo-mode'), 'body.tempo-mode (płyta zamiast gałki)');
    for(let i=0;i<50 && !dbg().revSrc;i++) await settle(2);
    const src=dbg().revSrc && dbg().revSrc.source;
    ok(src && src.started && src.playbackRate && src.playbackRate.value===0.6, 'bufor gra z playbackRate 0.6 — '+(src&&src.playbackRate&&src.playbackRate.value));
    ok(v.dataset.rate==='0.6' && v.style.getPropertyValue('--vn-turn')==='3.00s', 'płyta: tempo 0.6× → obrót 3 s — '+v.style.getPropertyValue('--vn-turn'));
    ok(v.dataset.state==='playing' && v.classList.contains('spinning') && v.classList.contains('arm-down'), 'gra → płyta się kręci, ramię opuszczone');
    ok(v.getAttribute('role')==='button' && /Pauza — płyta gra \(0,6×\)/.test(v.getAttribute('aria-label')), 'dostępność: role=button + aria-label wg stanu — '+v.getAttribute('aria-label'));
    ok(/^ ?\?$/.test(w.document.querySelector('#vinyl .vn-q').textContent) && w.document.querySelector('#vinyl .vn-art').getAttribute('visibility')==='hidden', 'naklejka „?" (bez okładki przed odsłoną)');
    ok((v.querySelector('.vn-ic')||{}).dataset.icon==='pause' && !v.querySelector('.vn-ic').closest('.vn-disc'), 'ikona ❚❚ na środku — STATYCZNA (poza obracającą się płytą)');
    ok(+v.querySelector('.vn-prog').getAttribute('stroke-dashoffset')<=100, 'postęp na obwodzie płyty (łuk .vn-prog)');
    ok(more && !more.disabled && /szybciej \(0,75×\)/.test(more.textContent), '„szybciej (0,75×)" — '+(more&&more.textContent));
    eq2(txt(w,'footLegend'), 'tytuł 50 · wykonawca 50 · rok/album +20 · 0.6× ×1.5 → 0.75× ×1.0', 'legenda');
    // pauza (tap w płytę) → hamowanie, ramię odjeżdża; wznowienie od tego samego miejsca
    v.click(); await settle(2);
    ok(!dbg().revSrc && src.stopped, 'tap → pauza (źródło zatrzymane)');
    ok(v.dataset.state==='paused' && !v.classList.contains('spinning') && !v.classList.contains('arm-down'), 'pauza → płyta hamuje, ramię w spoczynku');
    v.dispatchEvent(new w.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true })); await settle(2);
    for(let i=0;i<50 && !dbg().revSrc;i++) await settle(2);
    ok(dbg().revSrc && v.dataset.state==='playing', 'Enter na płycie → wznów');
    // „szybciej" → 0.75×
    more.click(); await settle(2);
    for(let i=0;i<50 && !(dbg().revSrc && dbg().revSrc.source.playbackRate.value===0.75);i++) await settle(2);
    ok(dbg().revSrc && dbg().revSrc.source.playbackRate.value===0.75, '„szybciej" → bufor 0.75×');
    ok(v.dataset.rate==='0.75' && v.style.getPropertyValue('--vn-turn')==='2.40s' && v.classList.contains('spinning'), 'płyta przyspiesza (2,4 s/obrót) i kręci się dalej');
    ok(more.disabled && /0,75× ✓/.test(more.textContent), 'brak etapu 0.9× — przycisk nieaktywny');
    const dec=dbg().revCache; ok(dec && /\.m4a$/.test(dec.url), 'zajawka zdekodowana raz (cache)');
    $(w,'fTitle').value='Zupełnie inny'; click(w,'check'); await settle(3);
    const rm=txt(w,'rmeta').replace(/\s+/g,' ');
    ok(/zgadywane przy 0,75×/.test(rm) && /mnożnik ×1/.test(rm), 'odsłona: tempo + mnożnik — '+rm.slice(0,220));
    ok(v.classList.contains('revealed') && /a100x100|300x300|https:\/\/x\//.test(w.document.querySelector('#vinyl .vn-art').getAttribute('href')||'') && w.document.querySelector('#vinyl .vn-art').getAttribute('visibility')==='visible', 'odsłona: naklejka → okładka albumu');
    ok(v.dataset.rate==='1' && v.style.getPropertyValue('--vn-turn')==='1.80s', 'odsłona: płyta rozpędza się do 1.0× (1,8 s/obrót)');
    const el=dbg().el; ok(dbg().round && el.playbackRate===1 && el.preservesPitch===true && /\.m4a$/.test(el.src), 'odsłona: oryginał 1.0× na trwałym elemencie');
  });
  ok(!window.document.body.classList.contains('tempo-mode'), 'koniec meczu zdejmuje tempo-mode');
});
await group('EKSP. solo: „przyspieszone" 1.5× + prefers-reduced-motion → płyta stoi, ramię bez animacji', async ()=>{
  const w=window, prevMM=w.matchMedia;
  w.matchMedia=(q)=>({ matches:/reduce/.test(String(q)), addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  try{
    await eksSolo(/przyspieszone/, async (w)=>{
      const v=$(w,'vinyl'), dbg=()=>soloAudioMod._soloAudioDebug();
      for(let i=0;i<50 && !dbg().revSrc;i++) await settle(2);
      ok(dbg().revSrc && dbg().revSrc.source.playbackRate.value===1.5, 'bufor 1.5×');
      ok(v.dataset.rate==='1.5' && v.style.getPropertyValue('--vn-turn')==='1.20s', 'obrót 1,2 s przy 1.5×');
      ok(v.dataset.state==='playing' && v.classList.contains('still') && !v.classList.contains('spinning'), 'reduced-motion: gra, ale płyta statyczna (still, bez spinning)');
      ok(vinylMod._vinylDebug().reduced, 'vinyl widzi reduced-motion');
      ok(w.document.body.classList.contains('tempo-mode') && !w.document.body.classList.contains('slowmo-mode'), 'fastmo: bez „szybciej"');
      eq2(txt(w,'footLegend'), 'tytuł 50 · wykonawca 50 · rok/album +20 · 1.5× ×1.2', 'legenda fastmo');
      const g=dbg().revSrc && dbg().revSrc;
      ok(g, 'gra');
    });
  } finally { w.matchMedia=prevMM; }
});
await group('EKSP. MP: obroty — chipy z nowym serwerem (oś czasu nigdy), PLAY slowmo gra lokalnie 0.6× (WebAudio)', async ()=>{
  const w=window, prevFetch=globalThis.fetch; const ws=await f6bRoom();
  ws.pushState({ phase:null, hostId:ws._id }); await settle(4);
  w.mpLobbyStart(); await settle(4);
  let html=$(w,'mpRoom').innerHTML;
  ok(!/mpToggleMode\('slowmo'\)/.test(html), 'stary serwer → bez obrotów');
  ws._emit({ t:'presence', members:[{id:ws._id,name:'host'}], hostId:ws._id, modes:['music','lektor','reverse','snippet','abcd','year','revsnip','slowmo','fastmo','quiz'] }); await settle(4);
  w.mpLobbyStart(); await settle(4);
  html=$(w,'mpRoom').innerHTML;
  ok(/mpToggleMode\('slowmo'\)/.test(html) && /mpToggleMode\('fastmo'\)/.test(html) && /zwolnione obroty/.test(html), 'nowy serwer → chipy obrotów');
  ok(!/mpToggleMode\('timeline'\)/.test(html), 'oś czasu tylko solo');
  globalThis.fetch=eksFetch; eksWebAudio(true); eksSources.length=0;
  try{
    ws.pushState(playState(ws, { playNonce:9101, mode:'slowmo', preview:'https://x/tempo.m4a' })); await settle(8);
    ok(/zwolnione 0,6×/.test($(w,'mpRoom').innerHTML), 'nagłówek MP: „🐢 zwolnione 0,6×"');
    let src=eksSources.filter(s=>!s.stopped).pop();
    if(!src){ w.mpKnobTap(); for(let i=0;i<30 && !eksSources.filter(s=>!s.stopped).length;i++) await settle(2); src=eksSources.filter(s=>!s.stopped).pop(); }
    ok(src && src.playbackRate && src.playbackRate.value===0.6, 'MP: zajawka gra lokalnie 0.6× — '+(src&&src.playbackRate&&src.playbackRate.value));
    w.mpKnobTap(); await settle(2);
    ok(src && src.stopped, 'gałka MP: stop (jak „od tyłu")');
  } finally { globalThis.fetch=prevFetch; eksWebAudio(false); }
  w.mpLeaveConfirmed('room'); await settle(4);
});
/* ===================== poprawki po testach: płyta wszędzie (solo), legenda punktacji, rzędy kategorii ===================== */
await group('Płyta winylowa (solo, od tyłu): stany, odsłona z okładką → ▶ oryginał, pauza z klawiatury, błąd zajawki', async ()=>{
  await eksSolo(/🔄 od tyłu/, async (w)=>{
    const dbg=()=>soloAudioMod._soloAudioDebug(), v=$(w,'vinyl');
    ok(v && v.querySelector('svg .vn-disc') && v.querySelector('.vn-prog') && v.querySelector('.vn-ctl'), 'płyta: SVG z obracającą się płytą, łukiem postępu i środkiem-przyciskiem');
    ok(!w.document.body.classList.contains('tempo-mode') && w.getComputedStyle(w.document.querySelector('.vinyl-wrap')).display!=='none', 'płyta widoczna poza trybami obrotów');
    ok(v.dataset.rate==='1' && !v.classList.contains('revealed') && w.document.querySelector('#vinyl .vn-art').getAttribute('visibility')==='hidden', 'pytanie: 1.0×, naklejka „?" (bez okładki)');
    for(let i=0;i<50 && !dbg().revSrc;i++) await settle(2);
    ok(dbg().revSrc && v.dataset.state==='playing' && v.classList.contains('arm-down') && v.dataset.rate==='1', 'od tyłu gra → płyta kręci się 1.0×, ramię opuszczone');
    ok(v.querySelector('.vn-ic').dataset.icon==='pause' && v.getAttribute('aria-busy')==='false', 'środek: ❚❚');
    $(w,'fTitle').value='Nic'; click(w,'check'); await settle(3);
    const href=w.document.querySelector('#vinyl .vn-art').getAttribute('href')||'';
    ok(/^https?:/.test(href) && v.classList.contains('revealed') && /Odtwórz oryginał/.test(v.getAttribute('aria-label')), 'odsłona: naklejka = okładka, aria „Odtwórz oryginał" — '+href.slice(0,40));
    ok(v.querySelector('.vn-ic').dataset.icon==='play' && !dbg().revSrc, 'odsłona: ikona ▶, „od tyłu" zatrzymane');
    v.click();
    ok(v.dataset.state==='loading' && v.querySelector('.vn-ic').dataset.icon==='wait' && !v.classList.contains('arm-down'), 'ładowanie oryginału (synchronicznie po stuknięciu): spinner, ramię uniesione');
    await settle(3);
    const r1=dbg().round;
    ok(r1 && r1.mode==='music' && !dbg().revSrc && /\.m4a$/.test(dbg().el.src), 'stuknięcie płyty w odsłonie → ORYGINAŁ na elemencie (nie od tyłu)');
    dbg().el.emit('playing'); await settle(1);
    ok(v.dataset.state==='playing', 'oryginał gra');
    v.dispatchEvent(new w.KeyboardEvent('keydown', { key:' ', bubbles:true, cancelable:true })); await settle(2);
    ok(dbg().el.paused && v.dataset.state==='paused' && !v.classList.contains('arm-down'), 'spacja na płycie → pauza, ramię w spoczynku');
    dbg().el.emit('error'); await settle(1);
    ok(v.dataset.state==='error' && /Błąd odtwarzania/.test(v.getAttribute('aria-label')) && v.querySelector('.vn-ic').dataset.icon==='error', 'błąd zajawki → płyta: stan błędu (aria + ikona !)');
  });
});
await group('Legenda punktacji: przycisk „ℹ️ jak liczymy punkty" przy wyniku → dymek z legendą trybu (bez stałego podpisu w stopce)', async ()=>{
  const w=window, { audio } = catsByKind(w);
  await f2aStartMatch(audio, /muzyka/);
  const btn=$(w,'legendBtn'), pop=$(w,'legendPop');
  ok(btn && /jak liczymy punkty/.test(btn.textContent) && btn.getAttribute('aria-expanded')==='false' && pop.hidden, 'przycisk widoczny, dymek zamknięty');
  ok(!/tytuł 50/.test(w.document.querySelector('.foot').textContent) && /iTunes/.test(w.document.querySelector('.foot').textContent), 'stopka: tylko źródło (bez stałej legendy)');
  ok($(w,'footLegend').closest('#legendPop'), 'legenda żyje w dymku');
  btn.click(); await settle(1);
  ok(!pop.hidden && btn.getAttribute('aria-expanded')==='true' && /tytuł 50 · wykonawca 50/.test(txt(w,'footLegend')) && /muzyka/.test(txt(w,'legendMode')), 'klik → dymek z legendą bieżącego trybu — '+txt(w,'legendMode'));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key:'Escape', bubbles:true })); await settle(1);
  ok(pop.hidden && w.document.activeElement===btn, 'Esc zamyka, fokus wraca na przycisk');
  btn.click(); await settle(1); $(w,'sessProg').click(); await settle(1);
  ok(pop.hidden, 'klik poza dymkiem zamyka');
  btn.click(); await settle(1); $(w,'legendClose').click(); await settle(1);
  ok(pop.hidden && btn.getAttribute('aria-expanded')==='false', '✕ zamyka');
  click(w,'sessEnd'); await settle(2);
});
await group('Rzędy kategorii: podpowiedź krawędzi (more-l/more-r) + kółko myszy przewija poziomo; CSS ≥600 px zawija', async ()=>{
  const w=window, rs=await import('../app/rowScroll.js');
  $(w,'toMenu').click(); await settle(2); $(w,'goSolo').click(); await settle(2);
  const row=$(w,'ticks'); let x=0;
  Object.defineProperty(row,'scrollWidth',{ value:900, configurable:true }); Object.defineProperty(row,'clientWidth',{ value:300, configurable:true });
  Object.defineProperty(row,'scrollLeft',{ get:()=>x, set:v=>{ x=v; }, configurable:true });
  rs.syncRow(row);
  ok(row.classList.contains('more-r') && !row.classList.contains('more-l'), 'początek rzędu: podpowiedź „›" po prawej');
  const prevMM=w.matchMedia;
  w.matchMedia=(q)=>({ matches:/pointer: fine|hover: hover/.test(String(q)), addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  try{
    const tk=row.querySelector('.tick')||row;
    const ev=new w.WheelEvent('wheel', { deltaY:120, bubbles:true, cancelable:true });
    tk.dispatchEvent(ev);
    ok(x===120 && ev.defaultPrevented, 'kółko (mysz) → rząd przewija się w prawo, strona nie — scrollLeft='+x);
    ok(row.classList.contains('more-l') && row.classList.contains('more-r'), 'w środku: podpowiedzi po obu stronach');
    x=600; const ev2=new w.WheelEvent('wheel', { deltaY:120, bubbles:true, cancelable:true }); tk.dispatchEvent(ev2);
    ok(!ev2.defaultPrevented && x===600, 'na końcu rzędu kółko przewija stronę (bez przejęcia)');
  } finally { w.matchMedia=prevMM; }
  const css=[...w.document.querySelectorAll('style')].map(s=>s.textContent).join('\n');
  ok(/@media \(min-width:600px\)\{[^}]*\.ticks,\.grp-band \.ticks\{flex-wrap:wrap;overflow-x:visible\}/.test(css), 'CSS: od 600 px rzędy kategorii zawijają się (siatka)');
  delete row.scrollWidth; delete row.clientWidth; delete row.scrollLeft;
});
console.log(`\n${fail?'❌':'✅'} integracja: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
