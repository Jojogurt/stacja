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

const { window, fetchCalls } = await bootApp();

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

console.log(`\n${fail?'❌':'✅'} integracja: ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
