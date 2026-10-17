/* core/match.js — model meczu (czysty, zero DOM / Web API).
 * Dane kategorii (`cats`) wstrzykiwane parametrem → moduł nie zna `window`. */
import { shuffle, escapeHtml } from './util.js';
import { clampTimer } from './timing.js';
import { artistPool } from './trackSelect.js';
import { timelineCapable } from './timeline.js';

export const QPC=5, CPR=3;   // pytań na kategorię, kategorii na rundę (jak prawdziwy quiz)
export const MAX_ROUNDS=4;   // F1 (#5): max rund meczu — serwer przycina `start` do tego (F6a: długość w pytaniach ≤ MAX_ROUNDS×CPR×QPC)
// F8a: + 'intro' (Heardle 1→16 s), 'abcd' (4 kafle „Tytuł — Wykonawca"), 'year' (rok wydania, oś czasu lite)
// EKSPERYMENT: + 'revsnip' (od tyłu krótko: 3 s wspak), 'medley' (składanka 4 × 1,5 s wykonawcy), 'cover' (okładka albumu)
// EKSPERYMENT: + 'piano' (fortepianowy cover — zgadnij tytuł i ORYGINALNEGO wykonawcę), 'guitar' (to samo z coverem gitarowym)
// EKSPERYMENT: + 'timeline' (oś czasu, Hitster), 'slowmo' (zwolnione obroty 0.6× → 0.75×), 'fastmo' (przyspieszone 1.5×)
export const ALL_MODES=['music','lektor','reverse','snippet','intro','abcd','year','revsnip','medley','cover','piano','guitar','timeline','slowmo','fastmo','quiz'];
export const MODE_LABEL={music:'♪ muzyka', lektor:'🗣 lektor', reverse:'🔄 od tyłu', snippet:'✂️ fragment', quiz:'🧠 wiedza',
  intro:'⏱ intro', abcd:'🔠 ABCD', year:'📅 rok', revsnip:'⏪ od tyłu krótko', medley:'🎛 składanka', cover:'🖼 okładka', piano:'🎹 fortepian', guitar:'🎸 gitara',
  timeline:'🕰 oś czasu', slowmo:'🐢 zwolnione obroty', fastmo:'🐿 przyspieszone'};
export const MODE_SHORT={music:'muzyka', lektor:'lektor', reverse:'od tyłu', snippet:'fragment', quiz:'wiedza',
  intro:'intro', abcd:'ABCD', year:'rok', revsnip:'od tyłu 3 s', medley:'składanka', cover:'okładka', piano:'fortepian', guitar:'gitara',
  timeline:'oś czasu', slowmo:'zwolnione', fastmo:'przyspieszone'};
export const MODE_SUB={music:'zajawka', lektor:'czytany tekst', reverse:'wspak', snippet:'2 s', quiz:'pytanie',
  intro:'1→16 s', abcd:'4 kafle', year:'rok wydania', revsnip:'3 s wspak', medley:'4 × 1,5 s', cover:'bez dźwięku', piano:'cover', guitar:'cover',
  timeline:'ułóż po roku', slowmo:'0.6× → 0.75×', fastmo:'1.5×'};
/* Ekran „Nowy mecz" (app/matchSetup.js): tryby pogrupowane w RODZINY z krótkim opisem — czysta definicja,
 * każdy tryb z ALL_MODES dokładnie w jednej rodzinie (test w test/run.js). Kolejność = kolejność w UI. */
/* P1-1/P1-13 (przegląd MP 2026-10): POLECENIE zadania per tryb — karta pytania, pasek fazy i podpis pod winylem
 * („Zgadnij ROK wydania" zamiast samego chipa „♬ rok"). mc = pytanie ABCD (kafle) → „Wybierz A–D". */
export const MODE_TASK={music:'Tytuł + wykonawca', lektor:'Z opisu: tytuł + wykonawca', reverse:'Od tyłu: tytuł + wykonawca',
  snippet:'Fragment: tytuł + wykonawca', revsnip:'Od tyłu: tytuł + wykonawca', slowmo:'Zwolnione: tytuł + wykonawca',
  fastmo:'Przyspieszone: tytuł + wykonawca', year:'Zgadnij ROK wydania', abcd:'Wybierz A–D', quiz:'Odpowiedz na pytanie',
  intro:'Intro: tytuł + wykonawca', medley:'Wykonawcy ze składanki', cover:'Wykonawca z okładki (+ album)', piano:'Cover: tytuł + oryginalny wykonawca',
  guitar:'Cover: tytuł + oryginalny wykonawca', timeline:'Ułóż na osi czasu'};
export function modeTask(mode, { mc=false }={}){
  if(mc) return MODE_TASK.abcd;
  return MODE_TASK[mode] || MODE_TASK.music;
}
export const MODE_FAMILIES=[
  { id:'listen',  name:'Słuchaj',     desc:'rozpoznaj utwór',        modes:['music','intro','snippet','reverse','revsnip','slowmo','fastmo'] },
  { id:'combine', name:'Kombinuj',    desc:'inaczej niż wpisywanie', modes:['abcd','year','timeline','medley'] },
  { id:'covers',  name:'Covery',      desc:'tylko hity światowe',    modes:['piano','guitar'] },
  { id:'silent',  name:'Bez dźwięku', desc:'patrz i myśl',           modes:['cover','quiz'] },
  { id:'lektor',  name:'Lektor',      desc:'opis czytany na głos',   modes:['lektor'] },
];
// etykiety trybów w pickerze (bez emoji; „quiz" włącza się sam z kategorią Wiedzy/Łamigłówek)
export const MODE_PICK_LABEL={music:'muzyka', intro:'intro 1–16 s', snippet:'fragment 2 s', reverse:'od tyłu', revsnip:'od tyłu krótko',
  slowmo:'zwolnione obroty', fastmo:'przyspieszone', abcd:'ABCD', year:'rok wydania', timeline:'oś czasu', medley:'składanka',
  piano:'fortepian', guitar:'gitara', cover:'okładka', quiz:'wiedza i łamigłówki', lektor:'lektor'};
/* F8a: „intro" (1-2-4-8-16 s) działa w MP TYLKO pod serwerem-autorytetem (AUTHORITY_ONLY_MODES): etapy odsłony prowadzi
 * timer DO (core/timing.introStageOffsets: etap + przerwa na typ; starty etapów w game.stageStarts), każdy klient gra
 * [0, introStageSecs(stage)] od wspólnego game.stageAt (z offsetem zegara serwera); „+ więcej" — dowolny gracz, serwer
 * przesuwa harmonogram. Mnożnik introMult z etapu, w którym drużyna miała komplet (core/mpReducer). Relay — bez intro. */
/* EKSPERYMENT: „od tyłu krótko" działa w MP (offset okna od autorytetu jak „fragment", F2b).
 * Pozostałe tryby z etapami/rozwiązywaniem po stronie serwera działają w MP TYLKO pod serwerem-autorytetem
 * (AUTHORITY_ONLY_MODES; relay-host gra takie pytanie jak „muzykę"):
 *  • „okładka" — album wybiera DO (server/lib/resolve.resolveCoverServer), etapy 16 → 24 → 40 z timera DO, w stanie tylko
 *    obraz w rozdzielczości etapu (coverStageUrl; pełny wyłącznie w odsłonie). Mnożnik z czasu propozycji (core/mpReducer).
 *  • „składanka" — DO rozwiązuje 4 utwory wykonawcy (resolveMedleyServer) i losuje starty wycinków; klienci buforują
 *    4 zajawki w ARMING i sklejają lokalnie 4 × 1,5 s (app/audio.loadMedley — ten sam kod co solo). Sekret = wykonawca.
 *  • „fortepian"/„gitara" — DO szuka coveru instrumentalnego (resolveInstrumentalServer: iTunes + Deezer /search?q=);
 *    brak → pytanie jak muzyka. Odpowiedź: tytuł + ORYGINALNY wykonawca; w odsłonie kto grał cover.
 *  • „oś czasu" — każda drużyna ma własną, jawną oś (game.timeline[teamId]); kotwicę dostaje od DO przy pierwszym pytaniu
 *    osi (także drużyna dołączająca później), slot 'gap' walidowany w reducerze (cleanGap), ocena gapOk w evaluateTeam,
 *    wstawienie karty w applyEvaluation (core/mpReducer); UI szczelin w app/mp-render. */
export const SOLO_ONLY_MODES=[];   // wszystkie tryby działają w MP (część tylko pod autorytetem — niżej)
export const MP_MODES=ALL_MODES.filter(m=>!SOLO_ONLY_MODES.includes(m));
// tryby MP wymagające serwera-autorytetu (etapy odsłony z timera DO) — relay-host ich nie obsługuje
export const AUTHORITY_ONLY_MODES=['intro','cover','medley','piano','guitar','timeline'];
export const RELAY_MP_MODES=MP_MODES.filter(m=>!AUTHORITY_ONLY_MODES.includes(m));
// tryby, które zna serwer sprzed F8a (brak `modes` w presence → nowe tryby ukryte w MP pod autorytetem)
export const LEGACY_MP_MODES=['music','lektor','reverse','snippet','quiz'];
// tryby do pickera MP: relay (host liczy sam) → MP_MODES bez trybów tylko-autorytet; autorytet → przecięcie z tym, co zna
// serwer (stary serwer nie ogłasza 'cover' w presence.modes → okładka ukryta)
export function mpAvailableModes(serverModes, authority=true){
  if(!authority) return RELAY_MP_MODES.slice();
  const known = Array.isArray(serverModes) && serverModes.length ? serverModes : LEGACY_MP_MODES;
  return MP_MODES.filter(m=>known.includes(m));
}

// F8a: kategoria z wiarygodnym rokiem dla trybu „rok": pula wykonawców (releaseDate z iTunes) albo
// playlista, w której co najmniej połowa (≥4) utworów ma rok w danych
function yearCapable(c){
  if(Array.isArray(c.artists) && c.artists.length) return true;
  const songs=c.songs||[], withYear=songs.filter(s=>s && /^\d{4}/.test(String(s.year||''))).length;
  return withYear>=4 && withYear*2>=songs.length;
}
// F8a: ABCD potrzebuje ≥3 dystraktorów z kategorii — ≥2 wykonawców w puli albo ≥4 utwory playlisty
function abcdCapable(c){
  return (Array.isArray(c.artists) && c.artists.length>=2) || (c.songs||[]).length>=4;
}
/* EKSPERYMENT „fortepian": kategoria z przewagą POLSKICH wykonawców (iTunes nie ma dla nich piano coverów: 0/8 w badaniu).
 * Reguła: jawne `c.lang` wygrywa ('pl' → polska); inaczej klucz kończy się na „-pl"/„_pl" albo zawiera „polo"
 * (evergreen-pl, rock-pl, rap-pl, disco-polo) lub etykieta/opis mówi „PL"/„polsk…"/„disco polo"
 * (np. „polskie złoto", playlista Spotify „Polskie hity"). Dekady (mieszane PL+świat) zostają — polskie utwory
 * odsiewa resolvePiano (kolejne próby). */
export function polishDominant(catKey, c){
  if(!c) return false;
  if(typeof c.lang==='string' && c.lang) return c.lang==='pl';
  return /(?:^|[-_])pl$|polo/i.test(String(catKey||'')) || /\bPL\b|polsk|disco polo/i.test(String(c.label||'')+' '+String(c.desc||''));
}
// EKSPERYMENT „covery instrumentalne" (fortepian, gitara): kategoria audio (pula wykonawców albo utwory playlisty),
// bez przewagi polskich wykonawców (gitara: badanie 0/4 polskich hitów z coverem — ta sama reguła co fortepian)
export function instrumentalCapable(catKey, c){
  if(!c || c.kind==='quiz' || c.kind==='lyrics') return false;
  const audio=(Array.isArray(c.artists) && c.artists.length) || (Array.isArray(c.songs) && c.songs.length);
  return !!audio && !polishDominant(catKey, c);
}
export const pianoCapable = instrumentalCapable;
/* `noModes` kategorii (np. „akustycznie / unplugged": zajawka JEST już wersją akustyczną — cover instrumentalny, okładka
 * albumu MTV czy składanka 4 utworów jednego wykonawcy nie mają tam sensu) → te tryby wyłączone. */
function catNoModes(c){ return Array.isArray(c && c.noModes) ? c.noModes.filter(m=>typeof m==='string') : []; }
// jakie tryby obsługuje kategoria (kompatybilność). F8a: intro/abcd/year — tylko kategorie z audio.
// EKSPERYMENT: revsnip — każda kategoria audio; medley/cover — tylko z PULĄ WYKONAWCÓW (artists albo playlista ≥4 wykonawców)
export function modesFor(catKey, cats){
  const c=cats[catKey]; if(!c) return [];
  if(c.kind==='quiz') return ['quiz'];                // wiedza ogólna — tylko quiz (bez audio)
  if(c.kind==='lyrics') return ['lektor'];            // brak audio
  const m=['music','reverse','snippet','intro','revsnip'];
  if(abcdCapable(c)) m.push('abcd');
  if(yearCapable(c)) m.push('year');
  if(artistPool(c).length) m.push('medley','cover');
  if(instrumentalCapable(catKey, c)) m.push('piano','guitar');   // EKSPERYMENT: cover fortepianowy/gitarowy — nie w kategoriach polskich
  if(timelineCapable(c)) m.push('timeline');     // EKSPERYMENT: oś czasu — tylko wiarygodny rok (dekady / playlisty z rokiem)
  m.push('slowmo','fastmo');                     // EKSPERYMENT: zwolnione / przyspieszone obroty — każda kategoria audio
  if((c.songs||[]).some(s=>s.lyric)) m.push('lektor'); // tekst do lektora (np. hits-now)
  const off=catNoModes(c);
  return off.length ? m.filter(x=>!off.includes(x)) : m;
}

export function catLabel(catKey, cats){ const c=cats[catKey]; return c?(c.range||c.label):catKey; }

/* F6a (R-F2): długość meczu w PYTANIACH (zamiast „rund 1–4"). Mecz = ceil(Q/QPC) slotów po QPC pytań,
 * sloty grupowane po CPR w rundy (struktura slotów bez zmian: 5 → 1 slot, 10 → 2, 15 → 3 = 1 runda, 30 → 6 = 2 rundy). */
export const MATCH_LENGTHS=[ {q:5, label:'Krótki'}, {q:15, label:'Standard'}, {q:30, label:'Długi'} ];
export const DEFAULT_QUESTIONS=15;
export const QUICK_QUESTIONS=10;                       // „Graj teraz" (R-F1)
export const MAX_QUESTIONS=MAX_ROUNDS*CPR*QPC;         // twardy limit (serwer: ten sam cap co dawne MAX_ROUNDS)
// liczba pytań z sieci/UI → wielokrotność QPC w [QPC..MAX_QUESTIONS]; śmieci → DEFAULT_QUESTIONS
export function clampQuestions(q){
  const n=Math.floor(Number(q));
  if(!Number.isFinite(n) || n<=0) return DEFAULT_QUESTIONS;
  return Math.min(MAX_QUESTIONS, Math.max(QPC, Math.ceil(n/QPC)*QPC));
}
// rundy (stary format `rounds`) odpowiadające liczbie pytań — dla starego serwera (5/10/15 → 1, 30 → 2)
export function roundsForQuestions(q){ return Math.max(1, Math.ceil(clampQuestions(q)/(CPR*QPC))); }

/* P1-7 (przegląd MP 2026-10): KRÓTKI mecz (≤ QPC pytań) gra po JEDNYM pytaniu na slot (qpc 1, jak Stacja dnia) —
 * 5 pytań = 5 slotów z różnymi kategoriami i trybami (dawniej 1 slot = 5× ta sama kategoria i tryb, mimo wybranych
 * 2 kat. i 3 trybów). Dłuższe mecze bez zmian (bloki po QPC). */
export function matchQpcFor(questions){ return clampQuestions(questions)<=QPC ? 1 : QPC; }
// qpc 1: wybór par MIESZAJĄCY — najpierw nieużyta kategoria, potem nieużyty tryb (remis → kolejność po tasowaniu)
function mixSlots(pairs, n){
  const catN=new Map(), modeN=new Map(), out=[];
  for(let i=0;i<n;i++){
    let best=null, bestK=Infinity;
    for(const p of shuffle(pairs)){
      const k=(catN.get(p.cat)||0)*100 + (modeN.get(p.mode)||0)*10 + (out.length && out[out.length-1].cat===p.cat ? 5 : 0);
      if(k<bestK){ best=p; bestK=k; }
    }
    catN.set(best.cat, (catN.get(best.cat)||0)+1); modeN.set(best.mode, (modeN.get(best.mode)||0)+1);
    out.push({ round:1, cat:best.cat, mode:best.mode });
  }
  return out;
}
// ułóż mecz: sloty {round,cat,mode} — kompatybilne, bez powtórki kategorii w rundzie.
// `len` = liczba rund (stary format: rounds × CPR slotów) ALBO {questions} (F6a: ceil(Q/QPC) slotów;
// P1-7: ≤ QPC pytań → `qpc:1`, slot = pytanie, kategorie i tryby na przemian).
export function buildMatch(catPool, modePool, len, cats){
  const catsArr=[...catPool], modes=[...modePool];
  const pairs=[];
  catsArr.forEach(cat=> modesFor(cat,cats).forEach(m=>{ if(modes.includes(m)) pairs.push({cat,mode:m}); }));
  if(!pairs.length) return {error:'Wybrane tryby nie pasują do kategorii — dodaj kategorię audio (muzyka/od tyłu/fragment) albo z tekstem (lektor).'};
  const byQ = len && typeof len==='object';
  if(byQ && matchQpcFor(len.questions)===1){
    const n=clampQuestions(len.questions);
    return { slots:mixSlots(pairs, n), rounds:1, qpc:1, questions:n };
  }
  const nSlots = byQ ? clampQuestions(len.questions)/QPC : Math.max(1, Math.floor(Number(len))||1)*CPR;
  const rounds = Math.ceil(nSlots/CPR);
  const slots=[];
  for(let r=1;r<=rounds;r++){
    const want=Math.min(CPR, nSlots-slots.length);
    const used=new Set(); let added=0;
    for(const p of shuffle(pairs)){
      if(added>=want) break;
      if(used.has(p.cat)) continue;              // różne kategorie w rundzie
      slots.push({round:r, cat:p.cat, mode:p.mode}); used.add(p.cat); added++;
    }
    while(added<want){                           // mała pula — dopuść powtórkę kategorii
      const p=shuffle(pairs)[0];
      slots.push({round:r, cat:p.cat, mode:p.mode}); added++;
    }
  }
  return {slots, rounds, questions:slots.length*QPC};
}

// losowa pula kategorii + trybów (do przycisku 🎲) — gwarantuje ≥1 kompatybilną parę.
// F6a (R-F3): kostka losuje TYLKO muzykę — bez kategorii kind:'quiz' i bez trybu 'quiz' (wiedza = świadomy wybór).
// F8a: `allowed` — tryby dostępne w danym kontekście (MP: bez „intro"/bez trybów nieznanych serwerowi)
export function randomPools(allKeys, cats, allowed=ALL_MODES){
  const keys=allKeys.filter(k=>!(cats[k] && cats[k].kind==='quiz'));
  const pool=ALL_MODES.filter(m=>m!=='quiz' && allowed.includes(m));
  let modes=shuffle(pool).slice(0, 1+Math.floor(Math.random()*pool.length));
  let catsPick=shuffle(keys).filter(k=>modesFor(k,cats).some(m=>modes.includes(m))).slice(0, 3+Math.floor(Math.random()*4));
  if(!catsPick.length){ modes=['music']; catsPick=shuffle(keys).filter(k=>modesFor(k,cats).includes('music')).slice(0,4); }
  return {cats:catsPick, modes};
}

// nawigacja po meczu (m = {slots, si, qi, rounds, qpc?})
// F8b: `qpc` — pytań na slot (Stacja dnia: 1 → każde pytanie z innej kategorii); brak/śmieci → QPC (solo/MP bez zmian)
export function matchQpc(m){ const q=m && m.qpc; return Number.isInteger(q) && q>=1 && q<=QPC ? q : QPC; }
export function matchTotal(m){ return m && m.slots ? m.slots.length*matchQpc(m) : 0; }
export function matchSlot(m){ return m && m.slots ? m.slots[m.si] : null; }
export function matchAdvance(m){ m.qi++; if(m.qi>=matchQpc(m)){ m.qi=0; m.si++; } return m.si < m.slots.length; }
// F6a (F12): postęp meczu — numer bieżącego pytania (1-based) i liczba pytań meczu
export function matchProgress(m){
  if(!m || !m.slots) return { n:0, total:0 };
  const q=matchQpc(m);
  return { n: Math.min(m.si*q + m.qi + 1, m.slots.length*q), total: m.slots.length*q };
}
// F6b (A2): kontekst bieżącego pytania BEZ numeru (numer meczu osobno — matchQLabel). Runda tylko gdy >1,
// blok (kategoria × QPC pytań) tylko gdy mecz ma >1 blok — krótko, żeby pasek mieścił się na 320 px.
export function matchHeader(m, cats){ const s=matchSlot(m); if(!s) return '';
  const parts=[];
  if((m.rounds||1)>1) parts.push(`Runda ${s.round}/${m.rounds}`);
  parts.push(escapeHtml(catLabel(s.cat,cats)), MODE_SHORT[s.mode]||s.mode);
  if(m.slots.length>1 && matchQpc(m)>1) parts.push(`blok ${m.si+1}/${m.slots.length}`);   // F8b: qpc 1 → bez „bloków"
  return parts.join(' · '); }
// F6b (A2): numer pytania w CAŁYM meczu („pyt. 7/10"), nie w bloku („pyt. 2/5")
export function matchQLabel(m){ const p=matchProgress(m); return p.total ? `pyt. ${p.n}/${p.total}` : ''; }

// F1 (#5): liczba rund z sieci → całkowita w [1..MAX_ROUNDS] (rounds=200000 → MAX_ROUNDS, śmieci → 1)
export function clampRounds(r){
  const n = Math.floor(Number(r));
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_ROUNDS, n)) : 1;
}
export const MP_FORMATS = ['coop','solo','teams'];
/* F1 (#5): sanityzacja configu `start` od klienta (DO nie ufa hostowi). Zwraca TYLKO znane pola
 * z przyciętymi wartościami: rounds∈[1..MAX_ROUNDS], timer∈[0..MP_TIMER_MAX_S], modes⊂MP_MODES (bez trybów tylko-solo)
 * (bez duplikatów), format∈MP_FORMATS (inaczej coop), salon:boolean, audioHostOnly:boolean (F6b). Pule/assignments/groupId
 * sanityzuje wołający (osobne capy).
 * F6a (R-F2): `questions` (długość meczu w pytaniach) ∈ [QPC..MAX_QUESTIONS]; brak → z `rounds` (stary klient:
 * rounds×CPR×QPC). Nowy klient wysyła OBA pola (rounds zgodne ze starym formatem → stary serwer też zbuduje mecz). */
export function sanitizeMpConfig(config){
  const c = (config && typeof config==='object') ? config : {};
  const modes = Array.isArray(c.modes) ? [...new Set(c.modes.filter(m=>MP_MODES.includes(m)))] : [];   // F8a: bez trybów tylko-solo
  const rounds = clampRounds(c.rounds==null ? 4 : c.rounds);
  const questions = c.questions==null ? rounds*CPR*QPC : clampQuestions(c.questions);
  return {
    rounds,
    questions,
    timer: clampTimer(c.timer),
    modes,
    format: MP_FORMATS.includes(c.format) ? c.format : 'coop',
    salon: c.salon===true,
    audioHostOnly: c.audioHostOnly===true,   // F6b (#6 „Jeden głośnik"): zajawka/lektor gra tylko u hosta
  };
}
