/* core/match.js — model meczu (czysty, zero DOM / Web API).
 * Dane kategorii (`cats`) wstrzykiwane parametrem → moduł nie zna `window`. */
import { shuffle, escapeHtml } from './util.js';
import { clampTimer } from './timing.js';

export const QPC=5, CPR=3;   // pytań na kategorię, kategorii na rundę (jak prawdziwy quiz)
export const MAX_ROUNDS=4;   // F1 (#5): max rund meczu — serwer przycina `start` do tego (F6a: długość w pytaniach ≤ MAX_ROUNDS×CPR×QPC)
// F8a: + 'intro' (Heardle 1→16 s), 'abcd' (4 kafle „Tytuł — Wykonawca"), 'year' (rok wydania, oś czasu lite)
export const ALL_MODES=['music','lektor','reverse','snippet','intro','abcd','year','quiz'];
export const MODE_LABEL={music:'♪ muzyka', lektor:'🗣 lektor', reverse:'🔄 od tyłu', snippet:'✂️ fragment', quiz:'🧠 wiedza',
  intro:'⏱ intro', abcd:'🔠 ABCD', year:'📅 rok'};
export const MODE_SHORT={music:'muzyka', lektor:'lektor', reverse:'od tyłu', snippet:'fragment', quiz:'wiedza',
  intro:'intro', abcd:'ABCD', year:'rok'};
export const MODE_SUB={music:'zajawka', lektor:'czytany tekst', reverse:'wspak', snippet:'2 s', quiz:'pytanie',
  intro:'1→16 s', abcd:'4 kafle', year:'rok wydania'};
/* F8a: tryby tylko solo. „intro" w MP wymagałby etapu odsłony sterowanego przez hosta/serwer + ponownego
 * startu audio u wszystkich i przebudowy lokalnej fazy „słuchaj → kombinuj" — poza zakresem; picker MP go nie pokazuje,
 * a sanitizeMpConfig odrzuca. */
export const SOLO_ONLY_MODES=['intro'];
export const MP_MODES=ALL_MODES.filter(m=>!SOLO_ONLY_MODES.includes(m));
// tryby, które zna serwer sprzed F8a (brak `modes` w presence → nowe tryby ukryte w MP pod autorytetem)
export const LEGACY_MP_MODES=['music','lektor','reverse','snippet','quiz'];
// tryby do pickera MP: relay (host liczy sam) → wszystkie MP_MODES; autorytet → przecięcie z tym, co zna serwer
export function mpAvailableModes(serverModes, authority=true){
  if(!authority) return MP_MODES.slice();
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
// jakie tryby obsługuje kategoria (kompatybilność). F8a: intro/abcd/year — tylko kategorie z audio.
export function modesFor(catKey, cats){
  const c=cats[catKey]; if(!c) return [];
  if(c.kind==='quiz') return ['quiz'];                // wiedza ogólna — tylko quiz (bez audio)
  if(c.kind==='lyrics') return ['lektor'];            // brak audio
  const m=['music','reverse','snippet','intro'];
  if(abcdCapable(c)) m.push('abcd');
  if(yearCapable(c)) m.push('year');
  if((c.songs||[]).some(s=>s.lyric)) m.push('lektor'); // tekst do lektora (np. hits-now)
  return m;
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

// ułóż mecz: sloty {round,cat,mode} — kompatybilne, bez powtórki kategorii w rundzie.
// `len` = liczba rund (stary format: rounds × CPR slotów) ALBO {questions} (F6a: ceil(Q/QPC) slotów).
export function buildMatch(catPool, modePool, len, cats){
  const catsArr=[...catPool], modes=[...modePool];
  const pairs=[];
  catsArr.forEach(cat=> modesFor(cat,cats).forEach(m=>{ if(modes.includes(m)) pairs.push({cat,mode:m}); }));
  if(!pairs.length) return {error:'Wybrane tryby nie pasują do kategorii — dodaj kategorię audio (muzyka/od tyłu/fragment) albo z tekstem (lektor).'};
  const byQ = len && typeof len==='object';
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
 * z przyciętymi wartościami: rounds∈[1..MAX_ROUNDS], timer∈[0..MP_TIMER_MAX_S], modes⊂MP_MODES (F8a: bez 'intro')
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
