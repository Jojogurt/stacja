/* core/mpReducer.js — czysta logika multiplayera (host = źródło prawdy).
 * Zero DOM / sieci / Supabase — to jest „reduce" host-authority z analizy:
 * akcje gracza → nowy stan gry. Efekty (broadcast/render/audio) zostają w app.js.
 *
 * MODEL ODPOWIEDZI = SLOTY (uogólnienie tytuł/wykonawca → N pól):
 *   - answerSlots: [{key,label}]   — definicja pól odpowiedzi dla pytania
 *   - proposal:    {id, by, byName, values:{[slotKey]:string}}
 *   - votes:       {[slotKey]: {[voterId]: wartość}}   — jeden głos na osobę PER slot
 * Odpowiedź drużyny = górka głosów w każdym slocie (miks najlepszych pól).
 *
 * PEWNIAK / PAS = niezależne per-gracz toggle (NIE są właściwością typu):
 *   - sure:   [{id,name}]   — kto postawił „pewniaka" (zakład ×2 dla CAŁEJ drużyny)
 *   - passed: [{id,name}]   — kto już nic nie doda
 * Działają dla każdego uczestnika — też dla osoby, która tylko głosowała, nie wrzuciła
 * własnego typu. Pewniak i pas wzajemnie się wykluczają (włączenie jednego gasi drugi).
 *
 * DRUŻYNY (tryby konkurencyjne) — stan odpowiedzi jest PER-DRUŻYNA:
 *   - teams:   [{id,name,color,members:[playerId]}]   — skład (coop=1 drużyna, solo=N×1)
 *   - byTeam:  {[teamId]: {proposals, votes, sure, passed}}   — izolowany bucket każdej drużyny
 *   - scores:  {[teamId]: liczba}                              — wynik per drużyna (F6a: PUNKTY z core/scoring.scoreRound)
 *   - streaks: {[teamId]: liczba}                              — F6a: seria pełnych trafień drużyny (mnożnik ×1.5/×2)
 *   - playAt:  ms epoki startu fazy PLAY (serwer/host)          — F6a: bonus za szybkość = czas od PLAY do zatwierdzenia
 * Reducer routuje akcję do bucketu drużyny AKTORA (teamOf po a.by — anty-spoof). Selektory
 * dostają teamId i czytają tylko swój bucket. coop = jedna drużyna 'all' (ta sama ścieżka). */
import { textMatch, norm, parseMC, evaluateQuiz, scoreRound, SPEED_CAP_MS, yearScore, YEAR_OK_PTS, quizPartialFrac, listenList, tempoMult, artistMatch, coverMult, introMult, poolOf } from './scoring.js';
import { judgeEligible } from './judge.js';   // sędzia AI: twarde reguły przed modelem (judgeRequests)
import { stageIndexAt, coverStageBlocks, introStageSecs } from './timing.js';
import { validGap, gapOk, correctGaps, insertCard } from './timeline.js';   // MP oś czasu: szczelina, ocena, wstawienie karty   // MP okładka/intro: etap odsłony z czasu propozycji
import { MP } from './phases.js';
import { COOP_TEAM } from './teams.js';

const rid = () => Math.random().toString(36).slice(2,8);

/* drużyna gracza (membership po a.by). Salon-host (sędzia) nie jest członkiem — w coop
 * sędziuje jedyną drużynę, więc dostaje teams[0]. Brak dopasowania → null (akcja ignorowana). */
/* P0-1 (przegląd MP 2026-10): TV salonu to OSOBNA rola (`game.tvId`, ustalana przy starcie), nie „aktualny host".
 * Dawniej rolę TV wyznaczał hostId — gdy TV wyszło, awansowany GRACZ stawał się TV (traci pola, widzi typy rywali).
 * Stan bez tvId (stary serwer / relay sprzed zmiany) → dawne zachowanie (host = TV). Poza salonem → null. */
export function tvIdOf(game){
  if(!game || !game.salon) return null;
  return (typeof game.tvId==='string' && game.tvId) ? game.tvId : (game.hostId || null);
}
export function teamOf(game, playerId){
  if(!game || !Array.isArray(game.teams)) return null;
  for(const t of game.teams){ if((t.members||[]).includes(playerId)) return t.id; }
  // F6b (#6): salon w formatach Solo/Drużyny — TV nie sędziuje żadnej drużyny (nie nadpisuje rywalom odpowiedzi)
  if(game.salon && playerId && playerId===tvIdOf(game) && game.teams.length && (game.format||'coop')==='coop') return game.teams[0].id;
  return null;
}
/* F6b (tryb #6 „Jeden głośnik"): zajawka/lektor gra TYLKO u hosta (flaga meczu albo salon — TV gra muzykę).
 * Nie-host jest „pilotem": nie buforuje i nie odtwarza audio, widzi gałkę „słuchaj z głośnika hosta". */
export function audioHostOnly(game){ return !!(game && (game.audioHostOnly===true || game.salon)); }
export function playsAudioLocally(game, myId){
  if(!audioHostOnly(game)) return true;
  return !!(game && game.hostId && game.hostId===myId);
}
// bucket stanu odpowiedzi drużyny (lazy-init) — jedno źródło prawdy reducer/selektory
function bucketOf(game, teamId){
  game.byTeam = game.byTeam || {};
  return game.byTeam[teamId] || (game.byTeam[teamId] = { proposals:[], votes:{}, sure:[], passed:[] });
}
// tylko-do-odczytu bucket (selektory) — pusty placeholder, gdy drużyny jeszcze nie ma
const readBucket = (game, teamId)=> (game && game.byTeam && game.byTeam[teamId]) || { proposals:[], votes:{}, sure:[], passed:[] };

/* —— definicja slotów odpowiedzi (jedno źródło prawdy: render + scoring + composer) ——
 * Dziś zawsze tytuł+wykonawca; przyszłe tryby (np. uzupełnij słowa) zwrócą inne sloty. */
export const YEAR_SLOT = { key:'year', label:'rok' };   // F8a: tryb „rok" — jeden slot liczbowy (głosowanie jak na sloty)
export function slotsFor(mode, cat, q){
  // pytanie z własnymi slotami (quiz, wiedza ogólna, F8a: ABCD muzyki) → użyj ich; inaczej domyślne tytuł+wykonawca
  if(q && Array.isArray(q.slots) && q.slots.length) return q.slots;
  if(mode==='year') return [ { ...YEAR_SLOT } ];
  if(mode==='cover') return COVER_SLOTS.map(s=>({ ...s }));   // MP okładka: wykonawca (główny) + album (bonus)
  if(mode==='medley') return [ { key:'artist', label:'wykonawca' } ];   // MP składanka: tylko wykonawca (jak solo)
  if(mode==='timeline') return TIMELINE_SLOTS.map(s=>({ ...s }));   // MP oś czasu: szczelina + żetony tytuł/wykonawca
  return [ {key:'title', label:'tytuł'}, {key:'artist', label:'wykonawca'} ];
}
export const COVER_SLOTS = [ { key:'artist', label:'wykonawca' }, { key:'album', label:'album +20' } ];
// MP oś czasu: 'gap' = indeks szczeliny na osi DRUŻYNY (0 = przed pierwszą kartą … n = po ostatniej) — walidowany w reducerze
export const TIMELINE_SLOTS = [ { key:'gap', label:'miejsce na osi' }, { key:'title', label:'tytuł (+20)' }, { key:'artist', label:'wykonawca (+20)' } ];
// oś drużyny (karty jawne, posortowane po roku) — game.timeline[teamId]; brak → []
export function teamTimeline(game, teamId){ const t=game && game.timeline && game.timeline[teamId]; return Array.isArray(t) ? t : []; }
// wartość slotu 'gap' z sieci → poprawny indeks szczeliny osi drużyny (string liczby) albo null
export function cleanGap(game, teamId, v){
  const s=String(v==null?'':v).trim(); if(!/^\d{1,3}$/.test(s)) return null;
  return validGap(teamTimeline(game, teamId), Number(s)) ? String(Number(s)) : null;
}
// mapowanie klucza slotu → pole w obiekcie utworu (current) do oceny
export const SLOT_FIELD = { title:'track', artist:'artist', year:'year', album:'album' };
// F8a: pytanie „rok" = jedyny slot 'year' i brak wariantów odpowiedzi (quiz) — ocena yearScore, nie textMatch
const isYearQ = (slots, hasAnswers)=> !hasAnswers && slots.length===1 && slots[0].key==='year';
const DEFAULT_SLOTS = slotsFor();
const slotsOf = (game)=> (game && game.answerSlots) || DEFAULT_SLOTS;

/* ---- reducer akcji w fazie gry (propose/unpropose/vote/sure/pass) ----
 * Mutuje `game` w miejscu (broadcast wysyła tę samą referencję) i zwraca
 * `true`, gdy akcja coś zmieniła — wtedy caller robi broadcast+render. */
export function reduceAction(game, a){
  if(!game || game.phase!==MP.PLAY) return false;
  const teamId = teamOf(game, a.by);     // routuj do drużyny AKTORA (membership po wymuszonym a.by)
  if(!teamId) return false;              // gracz spoza drużyn (np. jeszcze nieprzydzielony) → ignoruj
  const bkt = bucketOf(game, teamId);
  const slots = slotsOf(game);
  switch(a.type){
    case 'propose': {
      const values = a.values || {};
      const clean = {};
      slots.forEach(s=>{ const v=String(values[s.key]||'').trim().slice(0,120); if(v) clean[s.key]=v; });   // 3.3: cap długości wejścia
      if(clean.gap!=null){ const g=cleanGap(game, teamId, clean.gap); if(g==null) delete clean.gap; else clean.gap=g; }   // MP oś czasu: zła szczelina odpada
      if(!Object.keys(clean).length) return false;          // pusty typ odrzucony
      bkt.proposals = (bkt.proposals||[]).filter(p=>p.by!==a.by);   // JEDNA odpowiedź na gracza — nowa zastępuje poprzednią
      const p={ id:rid(), aid:a.aid, by:a.by, byName:a.byName, values:clean };
      // MP okładka: czas zgłoszenia (epoch ms) WSTAWIA SERWER (authorityRoom nadpisuje a.at) — etap/mnożnik bez ufania klientowi
      const at=Number(a.at); if(Number.isFinite(at) && at>0) p.at=at;
      bkt.proposals.push(p);
      // auto-głos: wrzucając typ głosuję własną wartością w każdym wypełnionym slocie
      slots.forEach(s=>{ const v=clean[s.key]; if(v){ (bkt.votes[s.key]=bkt.votes[s.key]||{})[a.by]=v; } });
      return true;
    }
    case 'unpropose': {                                      // tylko autor usuwa swoją
      const before=(bkt.proposals||[]).length;
      bkt.proposals = (bkt.proposals||[]).filter(p=>!(p.id===a.pid && p.by===a.by));
      return bkt.proposals.length!==before;                  // 3.5: false gdy nic nie usunął (brak zbędnego broadcastu)
    }
    case 'vote': {                                           // głos na (slot, wartość); ponowny = wycofanie
      if(!a.slot || !slots.some(s=>s.key===a.slot)) return false;   // 3.5: slot musi istnieć w answerSlots
      let val = String(a.value==null?'':a.value).slice(0,120);    // 3.3: cap długości wejścia
      if(a.slot==='gap'){ val=cleanGap(game, teamId, val); if(val==null) return false; }   // MP oś czasu: tylko istniejąca szczelina
      const sv = bkt.votes[a.slot] = bkt.votes[a.slot] || {};
      // a.set = jawny WYBÓR (host „wybiera odpowiedź") → zawsze ustaw, bez przełączania.
      // Bez a.set → toggle (klik na własny głos = wycofanie), jak dotąd.
      if(a.set) sv[a.by] = val;
      else if(sv[a.by] === val) delete sv[a.by]; else sv[a.by] = val;
      return true;
    }
    case 'sure': {                                           // toggle „pewniaka" (zakład ×2) — per gracz, niezależny od typu/głosu
      const i=(bkt.sure||[]).findIndex(p=>p.id===a.by);
      if(i>=0){ bkt.sure.splice(i,1); }
      else { bkt.sure.push({ id:a.by, name:a.byName });
        bkt.passed = (bkt.passed||[]).filter(p=>p.id!==a.by); }     // pewniak gasi pas (przeciwne intencje)
      return true;
    }
    case 'pass': {                                           // toggle „pasu" (już nic nie dodam)
      const i=(bkt.passed||[]).findIndex(p=>p.id===a.by);
      if(i>=0){ bkt.passed.splice(i,1); }
      else { bkt.passed.push({ id:a.by, name:a.byName });
        bkt.sure = (bkt.sure||[]).filter(p=>p.id!==a.by); }         // pas gasi pewniaka
      return true;
    }
    default:
      return false;
  }
}

/* ---- liczenie gotowości w fazie „arming" (czyste) ---- */
export function countReady(expectedIds, readySet){
  const count = expectedIds.filter(id=>readySet.has(id)).length;
  return { count, total: expectedIds.length, all: expectedIds.length>0 && count===expectedIds.length };
}

/* ---- selektory (czyste) — każdy czyta bucket SWOJEJ drużyny (izolacja) ---- */
// kandydaci na dany slot W DRUŻYNIE: deduplikacja po norm, liczba głosów
export function candidatesForSlot(game, teamId, slotKey){
  if(!game) return [];
  const bkt=readBucket(game, teamId);
  const byNorm = new Map();   // normKey → {value, voters:Set}
  const get=(val)=>{ const k=norm(val); if(!k) return null;
    let e=byNorm.get(k); if(!e){ e={value:val, voters:new Set()}; byNorm.set(k,e); } return e; };
  (bkt.proposals||[]).forEach(p=>{
    const v=(p.values&&p.values[slotKey]||'').trim(); if(!v) return;
    get(v);
  });
  const sv=(bkt.votes&&bkt.votes[slotKey])||{};
  Object.entries(sv).forEach(([voter,val])=>{ const e=get(val); if(e) e.voters.add(voter); });
  return [...byNorm.values()].map(e=>({ value:e.value, votes:[...e.voters] }))
    .sort((a,b)=>b.votes.length-a.votes.length);
}
// odpowiedź DRUŻYNY = górka głosów w każdym slocie (''-jeśli nikt nie zagłosował).
// SALON: host (TV-sędzia) może nadpisać górkę — jego głos w slocie wygrywa z większością.
export function teamAnswer(game, teamId){
  const out={};
  const bkt=readBucket(game, teamId);
  const hostId = tvIdOf(game);   // P0-1: nadpisuje TV salonu, nie awansowany gracz
  slotsOf(game).forEach(s=>{
    const c=candidatesForSlot(game, teamId, s.key);
    const pick = hostId && bkt.votes && bkt.votes[s.key] && bkt.votes[s.key][hostId];
    out[s.key] = pick || ((c.length && c[0].votes.length) ? c[0].value : '');
  });
  return out;
}
// na co zagłosowałem w danym slocie (wartość) — do podświetlenia
export function myVoteForSlot(game, teamId, slotKey, myId){
  const bkt=readBucket(game, teamId);
  return (bkt.votes && bkt.votes[slotKey] && bkt.votes[slotKey][myId]) || null;
}
// stan gracza do paska osób (priorytet: pas > pewniak > wrzucił typ > pisze > myśli)
export function rosterState(game, teamId, id, typingSet){
  if(!game) return 'idle';
  const bkt=readBucket(game, teamId);
  if((bkt.passed||[]).some(p=>p.id===id)) return 'pass';
  if((bkt.sure||[]).some(p=>p.id===id)) return 'sure';
  if((bkt.proposals||[]).some(p=>p.by===id)) return 'ans';
  if(Array.isArray(bkt.answered) && bkt.answered.includes(id)) return 'ans';   // rywal w PLAY (serwer wyciął treść, zostawił KTO)
  if(typingSet && typingSet.has && typingSet.has(id)) return 'type';
  return 'idle';
}

/* P1-3: czy gracz „skończył" pytanie — dał typ, spasował albo zagłosował (np. na typ kolegi z drużyny). */
export function playerSettled(game, playerId){
  const tid = teamOf(game, playerId); if(!tid) return false;
  const bkt = readBucket(game, tid);
  if((bkt.passed||[]).some(p=>p.id===playerId)) return true;
  if((bkt.proposals||[]).some(p=>p.by===playerId)) return true;
  if(Array.isArray(bkt.answered) && bkt.answered.includes(playerId)) return true;   // P1-4: rywal w widoku okrojonym (KTO dał typ)
  return Object.values(bkt.votes||{}).some(sv=>sv && Object.prototype.hasOwnProperty.call(sv, playerId));
}
/* P1-3: auto-zamknięcie pytania — WSZYSCY obecni gracze (`presentIds`, bez TV) przypisani do drużyn skończyli.
 * Tylko w PLAY; pusta lista → false (nie zamykamy pustego stołu). */
export function allSettled(game, presentIds){
  if(!game || game.phase!==MP.PLAY) return false;
  const ids = (presentIds||[]).filter(id=>id && teamOf(game, id) && id!==tvIdOf(game));
  return ids.length>0 && ids.every(id=>playerSettled(game, id));
}
/* P1-4 (przegląd MP 2026-10): „Czekamy na: Ola, Kuba" — kogo jeszcze brakuje.
 * pendingIds: oczekiwani bez potwierdzenia (gotowość ARMING = readyIds, „dalej" na odsłonie = kto kliknął).
 * unsettledIds: kto w PLAY nie dał typu/pasa/głosu (widok hosta; rywale z okrojonego bucketu przez `answered`). */
export function pendingIds(expectedIds, doneIds){
  const done = new Set(Array.isArray(doneIds) ? doneIds : []);
  return [...new Set((expectedIds||[]).filter(id=>id && !done.has(id)))];
}
export function unsettledIds(game, presentIds){
  if(!game || game.phase!==MP.PLAY) return [];
  const tv = tvIdOf(game);
  return [...new Set((presentIds||[]).filter(id=>id && id!==tv && teamOf(game, id) && !playerSettled(game, id)))];
}
/* P1-8 (przegląd MP 2026-10): ABCD w MP = KAFLE. Pytanie ABCD = jeden slot + opcje „A) …" w treści (quiz i tryb „abcd").
 * mcOptions → {question, options:[{letter,text}], key} albo null (pytanie otwarte). Tap w kafel = `propose` {key: litera}
 * (jedna odpowiedź na gracza + auto-głos) → odpowiedź drużyny = NAJCZĘSTSZA litera (górka głosów, teamAnswer).
 * mcTally: ile głosów drużyny na każdą literę (wartość „b) Beta" / „B" → „B"; tekst opcji → jej litera). */
export function mcOptions(game){
  if(!game || typeof game.prompt!=='string' || !game.prompt) return null;
  const slots = slotsOf(game);
  if(slots.length!==1 || !['quiz','abcd'].includes(game.mode)) return null;
  const mc = parseMC(game.prompt);
  return mc ? { ...mc, key:slots[0].key } : null;
}
export function mcLetterOf(value, options){
  const v = String(value==null?'':value).trim();
  const m = v.match(/^([A-Da-d])(?:\s*[).:]|$)/);
  if(m) return m[1].toUpperCase();
  const o = (options||[]).find(x=>norm(x.text)===norm(v));
  return o ? o.letter : null;
}
export function mcTally(game, teamId, mc){
  const out = {}; if(!mc) return out;
  mc.options.forEach(o=>{ out[o.letter]=[]; });
  const sv = (readBucket(game, teamId).votes||{})[mc.key] || {};
  Object.entries(sv).forEach(([voter, val])=>{ const l=mcLetterOf(val, mc.options); if(l && out[l]) out[l].push(voter); });
  return out;
}
/* P1-5: wynik MOJEJ drużyny na żywo (nagłówek „⭐ 270") i przyrost w odsłonie („+50" leci do nagłówka).
 * reveal (opcjonalnie) → gained mojej drużyny (byTeam albo spłaszczony coop); prev = score − gained. */
export function teamScoreLine(game, teamId, reveal){
  const score = Number(game && game.scores && game.scores[teamId]) || 0;
  let gained = 0;
  if(reveal){ const r = (reveal.byTeam && reveal.byTeam[teamId]) || reveal; gained = Math.max(0, Number(r && r.gained) || 0); }
  return { score, gained, prev: Math.max(0, score - gained) };
}
/* P0-3: pewniak „×2" bez odpowiedzi drużyny = pewna przegrana („stawia kolejkę") → klient prosi o potwierdzenie.
 * true = włączam pewniaka, a odpowiedź mojej drużyny jest pusta. */
export function needsSureConfirm(game, teamId, myId){
  if(!game || !teamId) return false;
  const bkt = readBucket(game, teamId);
  if((bkt.sure||[]).some(p=>p.id===myId)) return false;   // wyłączanie — bez pytania
  const ta = teamAnswer(game, teamId);
  return !Object.values(ta).some(v=>String(v||'').trim());
}

/* F6b (R8): kto co wniósł do odpowiedzi drużyny — per slot pierwszy autor typu z tą wartością (norm),
 * a gdy wartość przyszła tylko głosem (np. host wybrał z czatu) — pierwszy głosujący, którego znamy z typów.
 * Zwraca [{key,label,name}] tylko dla niepustych slotów z ustalonym autorem. */
export function answerCredits(game, teamId, locked){
  const bkt = readBucket(game, teamId);
  const props = bkt.proposals || [];
  const nameOf = (id)=>{ const p=props.find(x=>x.by===id); return p ? p.byName : null; };
  const out = [];
  slotsOf(game).forEach(s=>{
    const v = locked && locked[s.key]; const k = norm(v||''); if(!k) return;
    let name = null;
    const p = props.find(x=>x.values && norm(x.values[s.key]||'')===k);
    if(p) name = p.byName;
    else {
      const sv = (bkt.votes && bkt.votes[s.key]) || {};
      for(const [voter,val] of Object.entries(sv)){ if(norm(val)===k){ name = nameOf(voter); if(name) break; } }
    }
    if(name) out.push({ key:s.key, label:s.label||s.key, name:String(name).slice(0,40) });
  });
  return out;
}

/* ---- MP etapy odsłony (serwer-autorytet): okładka i intro — ocena + etap, na którym padła odpowiedź drużyny ----
 * Okładka = tryb 'cover' bez wariantów quizu: wykonawca (artistMatch: też człon duetu / zapis iTunes artistAlt) = trafienie,
 * album (textMatch) = bonus. Intro = tryb 'intro': tytuł + wykonawca jak muzyka, mnożnik introMult zamiast szybkości.
 * Etap: chwila, w której odpowiedź drużyny była KOMPLETNA = max po niepustych slotach (okładka: sam wykonawca, a gdy
 * pusty — album) z czasu NAJWCZEŚNIEJSZEJ obecnej propozycji z tą wartością; etap z RZECZYWISTYCH startów etapów ze stanu
 * (game.stageStarts — serwer przesuwa je przy „+ więcej"/„wyraźniej"; core/timing.stageIndexAt). Brak czasu (wartość tylko
 * z głosu / stary stan) → chwila zatwierdzenia; brak startów → bieżący etap ze stanu (ostrożnie: mniejszy mnożnik). */
const isCoverQ = (game, hasAnswers)=> !hasAnswers && !!game && game.mode==='cover';
const isIntroQ = (game, hasAnswers)=> !hasAnswers && !!game && game.mode==='intro';
const isMedleyQ = (game, hasAnswers)=> !hasAnswers && !!game && game.mode==='medley';     // MP składanka: tylko wykonawca
const isTimelineQ = (game, hasAnswers)=> !hasAnswers && !!game && game.mode==='timeline'; // MP oś czasu: szczelina + żetony
function coverEval(vals, current, match){
  const ga=String(vals.artist||''), gal=String(vals.album||'');
  // `match` dokłada się do artistMatch (domyślny textMatch nic nie zmienia — artistMatch go zawiera); sędzia AI / „Uznaj" — tak
  const okA = !!ga && (artistMatch(ga, current.artist||'') || (!!current.artistAlt && artistMatch(ga, current.artistAlt))
    || (match!==textMatch && (match(ga, current.artist||'') || (!!current.artistAlt && match(ga, current.artistAlt)))));
  const okAl = !!gal && !!current.album && match(gal, current.album);
  return { ok:okA, bySlot:{ artist:okA, album:okAl } };
}
export function answerStage(game, teamId, locked, now, keys){
  const bkt = readBucket(game, teamId);
  const ks = (keys||[]).filter(k=>norm((locked && locked[k]) || ''));
  let at = null, missing = !ks.length;
  for(const key of ks){
    const v = norm(locked[key]);
    const ts = (bkt.proposals||[]).filter(p=>p && p.values && norm(p.values[key]||'')===v && Number.isFinite(p.at)).map(p=>p.at);
    if(!ts.length){ missing = true; break; }
    at = Math.max(at==null ? -Infinity : at, Math.min(...ts));
  }
  const t = !missing && at!=null ? at : (Number.isFinite(now) ? now : null);
  const starts = Array.isArray(game && game.stageStarts) && game.stageStarts.length ? game.stageStarts : null;
  const stage = (starts && t!=null) ? stageIndexAt(starts, t) : Math.max(0, Math.floor(Number(game && game.stage)) || 0);
  return { stage, at: missing ? null : at };
}
// okładka: etap z czasu wykonawcy (a gdy pusty — albumu); album dopisany później nie obniża mnożnika
export function coverAnswerStage(game, teamId, locked, now){
  return answerStage(game, teamId, locked, now, norm((locked && locked.artist) || '') ? ['artist'] : ['album']);
}
// intro: etap, w którym drużyna miała komplet (tytuł i wykonawcę — te, które wpisała)
export function introAnswerStage(game, teamId, locked, now){
  return answerStage(game, teamId, locked, now, ['title','artist']);
}

/* ---- ocena JEDNEJ drużyny (dawne wnętrze mpLock) — czysta ----
 * locked = odpowiedź tej drużyny (górka głosów w jej buckecie). Zwraca per-drużyna wyliczenia. */
function evaluateTeam(game, teamId, current, match, timing, aiSlots){
  const locked = teamAnswer(game, teamId);
  const bkt = readBucket(game, teamId);
  const slots = slotsOf(game);
  // QUIZ (wiedza ogólna): current.answers = {slot:[warianty]} → slot trafiony, gdy guess pasuje do
  // DOWOLNEGO wariantu. MUZYKA: porównanie z polem utworu (SLOT_FIELD). Ta sama funkcja match.
  const hasAnswers = !!(current && current.answers && typeof current.answers==='object');
  // F3: QUIZ → wspólny silnik evaluateQuiz (ABCD po wybranej opcji, `pool` = sloty wymienne z dedup,
  // inaczej per slot). Odpowiedź drużyny = górka głosów per slot — to samo „Connery" w dwóch slotach
  // zalicza tylko jeden (skojarzenie dwudzielne). MUZYKA: porównanie z polem utworu (SLOT_FIELD).
  const quizEval = (vals)=> evaluateQuiz(current, vals||{}, match, slots);
  const yearQ = isYearQ(slots, hasAnswers);
  const coverQ = isCoverQ(game, hasAnswers), introQ = isIntroQ(game, hasAnswers), medleyQ = isMedleyQ(game, hasAnswers), tlQ = isTimelineQ(game, hasAnswers);
  const cards = tlQ ? teamTimeline(game, teamId) : null, tlYear = tlQ ? (current.tlCard && current.tlCard.year) : null;
  const evalAll = (vals)=>{
    if(hasAnswers) return quizEval(vals);
    if(coverQ || medleyQ) return coverEval(vals||{}, current, match);
    if(tlQ){   // MP oś czasu: trafienie = dobra szczelina (rok między sąsiadami); tytuł/wykonawca = żetony
      const gs=String((vals && vals.gap) || ''), place = /^\d{1,3}$/.test(gs) && gapOk(cards, Number(gs), tlYear);
      const okT=match((vals&&vals.title)||'', current.track||''), okA=match((vals&&vals.artist)||'', current.artist||'');
      return { ok:place, bySlot:{ gap:place, title:okT, artist:okA } };
    }
    if(yearQ){ const ys=yearScore(vals && vals.year, current && current.year); return { ok: ys.points>=YEAR_OK_PTS, bySlot:{ year: ys.points>=YEAR_OK_PTS }, year:ys }; }
    const bySlot={}; slots.forEach(s=>{ bySlot[s.key]=match((vals&&vals[s.key])||'', current[SLOT_FIELD[s.key]] || ''); });
    return { ok: slots.every(s=>bySlot[s.key]), bySlot };
  };
  const ev = evalAll(locked);
  const okBySlot = {};
  slots.forEach(s=>{ okBySlot[s.key] = !!ev.bySlot[s.key]; });
  const teamOk = (coverQ || medleyQ || tlQ) ? !!ev.ok : slots.every(s=>okBySlot[s.key]);   // okładka: album to bonus — trafienie = wykonawca; oś: szczelina
  const okTitle = !!okBySlot.title, okArtist = !!okBySlot.artist;
  // pewniacy = gracze drużyny, którzy postawili „pewniaka" (bkt.sure)
  const pewniacy = (bkt.sure||[]).map(p=>p.name);
  const anySure = pewniacy.length>0;
  // F6a: punkty ze wspólnej funkcji (muzyka: tytuł/wykonawca częściowo; quiz: 100). Seria per drużyna (game.streaks),
  // szybkość = czas od startu PLAY do zatwierdzenia (wspólny dla drużyn — reducer nie zna czasu zgłoszenia per drużyna).
  const prevStreak = (game.streaks && game.streaks[teamId]) || 0;
  const streak = teamOk ? prevStreak+1 : 0;
  // Łamigłówki (`partial:true`, „Jedna litera"): nie-pełne trafienie = ułamek trafionych słów (core/scoring.quizPartialFrac)
  const quizFrac = hasAnswers ? quizPartialFrac(current, ev) : null;
  // MP okładka/intro: etap odsłony, na którym padła odpowiedź drużyny (czas propozycji od serwera) → mnożnik ZAMIAST szybkości
  const stg = coverQ ? coverAnswerStage(game, teamId, locked, timing.now) : introQ ? introAnswerStage(game, teamId, locked, timing.now) : null;
  const sc = hasAnswers
    ? scoreRound({ quizOk:teamOk, quizFrac, elapsedMs:timing.elapsedMs, limitMs:timing.limitMs, streak, sure:anySure })
    : coverQ ? scoreRound({ okArtist, okAlbum:!!okBySlot.album, artistOnly:true, elapsedMs:null, streak, sure:anySure, mult:coverMult(stg.stage) })
    : introQ ? scoreRound({ okTitle, okArtist, roundOk:teamOk, elapsedMs:null, streak, sure:anySure, mult:introMult(stg.stage) })
    : medleyQ ? scoreRound({ okArtist, artistOnly:true, elapsedMs:timing.elapsedMs, limitMs:timing.limitMs, streak, sure:anySure })   // jak solo: szybkość + seria
    : tlQ ? scoreRound({ placeOk:teamOk, okTitle, okArtist, elapsedMs:timing.elapsedMs, limitMs:timing.limitMs, streak, sure:anySure })
    : yearQ ? scoreRound({ yearPts:ev.year.points, elapsedMs:timing.elapsedMs, limitMs:timing.limitMs, streak, sure:anySure })   // F8a: rok
    // EKSPERYMENT: „zwolnione obroty"/„przyspieszone" — MP bez etapów (stałe 0.6× / 1.5×) → mnożnik etapu 0 (×1.5 / ×1.2)
    : scoreRound({ okTitle, okArtist, roundOk:teamOk, elapsedMs:timing.elapsedMs, limitMs:timing.limitMs, streak, sure:anySure, mult:tempoMult(game.mode, 0) });
  const gained = sc.points;
  // kto PIERWSZY w drużynie zaproponował komplet trafnych slotów (bonus/MVP)
  let firstBy=null, firstById=null;
  for(const p of (bkt.proposals||[])){
    if(evalAll(p.values||{}).ok){ firstBy=p.byName; firstById=p.by; break; }
  }
  const lockedAll = {};
  slots.forEach(s=>{ lockedAll[s.key] = locked[s.key]||''; });
  // F3 #4: formy kanoniczne do odsłony (per drużyna — przy `pool` zależą od tego, co drużyna trafiła)
  const display = hasAnswers ? ev.display : undefined, others = hasAnswers ? ev.others : undefined;
  const credits = answerCredits(game, teamId, lockedAll);   // F6b (R8): „złożona z głosów: kaśka → tytuł…"
  // F8a: odsłona „rok" (NIE `year` — coop spłaszcza pola drużyny na reveal, a reveal.year = rok utworu)
  const yearEval = yearQ ? { pts:ev.year.points, diff:ev.year.diff, tier:ev.year.tier } : undefined;
  // odsłona: etap i mnożnik drużyny (okładka: bloki; intro: sekundy etapu)
  // przegląd v70: drużyna bez odpowiedzi (pas/cisza) → bez linii „odpowiedź przy 16×16 · ×2,0" (mylące)
  const answeredAny = slots.some(s=>String(locked[s.key]||'').trim());
  const stageEval = stg && answeredAny ? { stage:stg.stage, mult:sc.mult, ...(coverQ ? { blocks:coverStageBlocks(stg.stage) } : { secs:introStageSecs(stg.stage) }) } : undefined;
  // MP oś czasu: szczelina drużyny, dobre szczeliny, karta i oś PRZED wstawieniem (odsłona); karta wstawiana w applyEvaluation
  const timelineEval = tlQ ? { gap: /^\d{1,3}$/.test(String(locked.gap||'')) ? Number(locked.gap) : null, placeOk:teamOk,
    good:correctGaps(cards, tlYear), card:current.tlCard || null, before:cards.slice() } : undefined;
  // sędzia AI: sloty zaliczone DZIĘKI werdyktowi modelu (odsłona: „✓ uznane (sędzia AI)") — tylko te, które ostatecznie trafione
  let aiOk;
  if(aiSlots && typeof aiSlots==='object'){
    const ks=slots.map(s=>s.key).filter(k=>aiSlots[k] && okBySlot[k]);
    if(ks.length){ aiOk={}; ks.forEach(k=>{ aiOk[k]=true; }); }
  }
  return { okTitle, okArtist, okBySlot, teamOk, locked: lockedAll, firstBy, firstById, display, others, credits, yearEval, stageEval, timelineEval,
    pewniacy, gained, anySure, pewniakWin: teamOk&&anySure, pewniakLose: !teamOk&&anySure,
    streak, prevStreak, aiOk, pts:{ base:sc.base, speed:sc.speed, streakMult:sc.streakMult, sureMult:sc.sureMult, mult:sc.mult } };
}
/* ---- ocena CAŁEGO pytania: każda drużyna osobno + ranking — czysta ----
 * reveal niesie wspólne fakty utworu + `byTeam` (wynik każdej drużyny) + `ranking`.
 * Dla coop (1 drużyna) pola jedynej drużyny są SPŁASZCZONE na top-level reveal →
 * mpRenderRevealCard działa bez zmian (wsteczna zgodność). app.js nakłada scores/tally w pętli. */
export function answerTiming(game, now){
  // P1-2: okno pytania = playAt → endsAt (intro + słuchanie + czas na odpowiedź); stan bez endsAt → sam timer
  const win = (game && Number.isFinite(game.endsAt) && Number.isFinite(game.playAt) && game.endsAt>game.playAt) ? game.endsAt-game.playAt : 0;
  const limitMs = win>0 ? win : (game && game.timer>0) ? game.timer*1000 : SPEED_CAP_MS;
  const elapsedMs = (game && Number.isFinite(game.playAt) && Number.isFinite(now)) ? Math.max(0, now-game.playAt) : null;
  return { elapsedMs, limitMs, now: Number.isFinite(now) ? now : null };
}
// `now` (ms) — chwila zatwierdzenia (lock); bez niej (albo bez game.playAt) punkty bez bonusu za szybkość
// `extra.aiSlots` = {teamId:{slotKey:true}} — sloty z werdyktem TAK sędziego AI (serwer); oznaczane w odsłonie jako aiOk
export function evaluateAnswer(game, current, match=textMatch, now=null, extra=null){
  const hasAnswers = !!(current && current.answers && typeof current.answers==='object');
  const slots = slotsOf(game);
  const teams = (game.teams && game.teams.length) ? game.teams : [{ id:COOP_TEAM, name:'Drużyna' }];
  const timing = answerTiming(game, now);
  const perTeam = {};
  const aiSlots = (extra && extra.aiSlots) || {};
  teams.forEach(t=>{ perTeam[t.id] = evaluateTeam(game, t.id, current, match, timing, aiSlots[t.id]); });
  const ranking = teams.map(t=>({ teamId:t.id, name:t.name, color:t.color,
      gained: perTeam[t.id].gained, teamOk: perTeam[t.id].teamOk,
      score: ((game.scores&&game.scores[t.id])||0) + perTeam[t.id].gained }))
    .sort((a,b)=> b.score-a.score);
  const isCoop = (game.format||'coop')==='coop';
  const flat = isCoop ? perTeam[teams[0].id] : {};   // coop: spłaszcz pola jedynej drużyny
  const yearQ = isYearQ(slots, hasAnswers);
  const coverQ = isCoverQ(game, hasAnswers), medleyQ = isMedleyQ(game, hasAnswers), tlQ = isTimelineQ(game, hasAnswers);
  const reveal = {
    track:current.track, artist:current.artist, year:current.year, album:current.album, art:current.art,
    kind: hasAnswers ? 'quiz' : (yearQ ? 'year' : coverQ ? 'cover' : medleyQ ? 'medley' : tlQ ? 'timeline' : 'music'), prompt: current.prompt || '',
    // MP składanka: zagrane utwory (dopiero w odsłonie); fortepian/gitara: kto grał cover (🎹/🎸)
    clips: medleyQ && Array.isArray(current.clips) ? current.clips.map(c=>({ track:String(c.track||''), artist:String(c.artist||''), year:String(c.year||''), art:String(c.art||'') })) : undefined,
    coverArtist: !hasAnswers && current.coverArtist ? String(current.coverArtist).slice(0, 80) : '',
    // MP okładka: utwór reprezentatywny albumu (❤️ „na półkę" — gust ocenia utwory), dopiero w odsłonie
    rep: coverQ && current.rep && current.rep.title ? { title:String(current.rep.title).slice(0,200), artist:String(current.rep.artist||current.artist||'').slice(0,200), year:String(current.rep.year||''), art:String(current.rep.art||''), genre:String(current.rep.genre||'') } : undefined,
    instrument: !hasAnswers && current.instrument ? String(current.instrument) : '',
    yearNote: yearQ && current.yearNote ? String(current.yearNote) : '',   // F8a: „rok wg wydania w iTunes"
    from: !hasAnswers && typeof current.from==='string' ? current.from.slice(0, 80) : '',   // gust etap 3: „Gust stołu" — z czyjej półki (dopiero w odsłonie)
    slots, answers: hasAnswers ? current.answers : null,
    fun: hasAnswers ? String(current.fun||'') : '',          // F3 #4: ciekawostka (💡) — dopiero w odsłonie
    // Łamigłówki: utwór(y)-rozwiązanie do odsłuchu (▶ posłuchaj) i duży rebus — TYLKO tu (reveal = po lock),
    // nigdy w stanie PLAY (zdradza odpowiedź). Stary klient ignoruje pola.
    listen: hasAnswers ? listenList(current.listen) : [],
    promptStyle: hasAnswers && current.display==='rebus' ? 'rebus' : '',
    byTeam: perTeam, ranking,
    ...flat,   // coop → okTitle/okArtist/okBySlot/teamOk/locked/firstBy/pewniacy/gained/pewniakWin/pewniakLose
  };
  // wynik do ligi: 1 wpis/pytanie (kształt coop). ok = czy ZWYCIĘSKA drużyna trafiła.
  const anyOk = ranking.length ? !!ranking[0].teamOk : false;
  return {
    reveal, perTeam, ranking, timing,
    result: { round:game.round, cat:game.catKey, mode:game.mode,
      track: hasAnswers ? (current.track||current.prompt||'') : coverQ ? (current.album||current.track) : current.track,   // F8a: ABCD muzyki → tytuł utworu; okładka → album
      artist: hasAnswers ? (current.artist||'') : current.artist, ok:anyOk },
  };
}

/* F6a: nałóż ocenę pytania na stan gry (wspólne: serwer-autorytet `lock` i host relay `mpLock`) —
 * punkty drużyn, serie, wkład graczy (tally: {id:{name,correct}}), przegrane pewniaki, wynik do ligi, reveal. */
export function applyEvaluation(game, ev, tally){
  game.scores = game.scores || {}; game.streaks = game.streaks || {}; game.beerTally = game.beerTally || {};
  for(const t of (game.teams||[])){
    const rr=ev.perTeam[t.id]; if(!rr) continue;
    game.scores[t.id]=(game.scores[t.id]||0)+rr.gained;
    game.streaks[t.id]=rr.streak||0;
    if(rr.firstById && tally){ tally[rr.firstById]=tally[rr.firstById]||{name:rr.firstBy,correct:0}; tally[rr.firstById].correct++; }
    if(!rr.teamOk && rr.anySure){ rr.pewniacy.forEach(n=>{ game.beerTally[n]=(game.beerTally[n]||0)+1; }); }
    // MP oś czasu: dobra szczelina → karta zostaje na osi drużyny (pudło → odpada, jak w solo)
    const te=rr.timelineEval;
    if(te && te.placeOk && te.card){ game.timeline=game.timeline||{}; game.timeline[t.id]=insertCard(teamTimeline(game, t.id), te.card, te.gap).cards; }
  }
  (game.results = game.results || []).push(ev.result);
  game.reveal = ev.reveal;
  // „Uznaj": przeliczenie pytania po głosowaniu potrzebuje tego samego okna czasu (endsAt zerowany po lock)
  game.lockTiming = ev.timing ? { elapsedMs:ev.timing.elapsedMs, limitMs:ev.timing.limitMs, now:ev.timing.now } : null;
}


/* ======================= SĘDZIA AI (serwer-autorytet) — co zapytać przed oceną =======================
 * Dla każdej drużyny i każdego slotu TEKSTOWEGO: zatwierdzona wartość (teamAnswer), która NIE pasuje regułami, a slot się
 * kwalifikuje (core/judge.judgeEligible). Zakres: quiz otwarty (bez ABCD, bez łamigłówek: rebus / `partial`) + tryby
 * z utworem: tytuł / wykonawca / album (muzyka, lektor, od tyłu, fragment, intro, okładka, składanka, fortepian/gitara,
 * tempo, żetony osi czasu). Bez: „rok", szczelina osi, ABCD. Pula „wymień N": wzorzec = wszystkie pozycje (items —
 * werdykt TAK dopasowuje do NAJBLIŻSZEJ pozycji, dedup przez skojarzenie w evaluateQuiz).
 * Zwraca [{teamId, slotKey, guess, question, expected, label, items}] — wołający (serwer) pyta model i buduje dopasowanie. */
const MUSIC_JUDGE_SLOTS = ['title','artist','album'];
/* jedna odpowiedź (MP: drużyna, solo: gracz) → prośby do sędziego. mode = tryb pytania, slots = pola, values = {slot:tekst}.
 * Wspólne dla serwera (judgeRequests) i klienta solo (app/solo.js → /api/judge). */
export function judgeRequestsFor(mode, current, slots, values){
  if(!current || !Array.isArray(slots)) return [];
  const hasAnswers = !!(current.answers && typeof current.answers==='object');
  if(hasAnswers){
    if(current.mc || parseMC(current.prompt)) return [];                 // ABCD — wybór opcji, nie tekst
    if(current.display==='rebus' || current.partial===true) return [];   // łamigłówki słowne — liczy się dokładne słowo
  } else if(isYearQ(slots, false) || mode==='year') return [];
  const pool = hasAnswers ? poolOf(current) : null;
  const out = [];
  slots.forEach(s=>{
    const guess = String((values && values[s.key])||'').trim();
    if(!guess) return;
    let expected, others=[], items=null, question, match=textMatch;
    const label = s.label || s.key;
    if(hasAnswers){
      question = String(current.prompt||'');
      if(pool){ items = pool; expected = [...pool.map(it=>it[0]), ...pool.flatMap(it=>it.slice(1))]; }   // formy kanoniczne najpierw (prompt ma limit wariantów)
      else {
        expected = (current.answers[s.key]||[]).filter(v=>typeof v==='string');
        others = slots.filter(o=>o.key!==s.key).flatMap(o=>current.answers[o.key]||[]);
      }
    } else {
      if(!MUSIC_JUDGE_SLOTS.includes(s.key)) return;
      const track=String(current.track||''), artist=String(current.artist||''), alt=String(current.artistAlt||''), album=String(current.album||'');
      if(s.key==='title'){
        expected=[track]; others=[artist, alt];
        question=`Podaj tytuł utworu${artist ? ` (wykonawca: ${artist})` : ''}.`;
      } else if(s.key==='artist'){
        expected=[artist, alt]; others = mode==='cover' ? [album] : mode==='medley' ? [] : [track];
        question = mode==='cover' ? `Podaj wykonawcę albumu „${album}”.` : mode==='medley' ? 'Podaj wykonawcę składanki kilku jego utworów.' : `Podaj wykonawcę utworu „${track}”.`;
        match = (g,a)=>artistMatch(g,a);   // człon duetu / feat już zalicza regułami — nie pytaj
      } else {
        expected=[album]; others=[artist, alt];
        question=`Podaj tytuł albumu${artist ? ` wykonawcy ${artist}` : ''}.`;
      }
      expected = expected.filter(Boolean); others = others.filter(Boolean);
    }
    if(!judgeEligible({ guess, expected, others, match, mode })) return;
    out.push({ slotKey:s.key, guess, question, expected, label, items, others });
  });
  return out;
}
export function judgeRequests(game, current){
  if(!game || !current) return [];
  const slots = slotsOf(game);
  const teams = (game.teams && game.teams.length) ? game.teams : [{ id:COOP_TEAM }];
  const out = [];
  teams.forEach(t=>{ judgeRequestsFor(game.mode, current, slots, teamAnswer(game, t.id)).forEach(r=>out.push({ teamId:t.id, ...r })); });
  return out;
}

/* ======================= „UZNAJ" — głosowanie po odsłonie (serwer-autorytet) =======================
 * game.accept = { nonce:playNonce, teams:[teamId…], votes:{teamId:[voterId…]}, need:{teamId:n}, done:{teamId:true} }.
 * Kwalifikuje się drużyna, która w tym pytaniu wpisała coś w slot tekstowy i ten slot NIE został zaliczony (quiz otwarty /
 * tytuł–wykonawca–album; bez ABCD, „roku" i osi czasu). Głosują: coop — obecni członkowie TEJ drużyny; Solo / Drużyny —
 * wszyscy obecni GRACZE pokoju (rywale też — inaczej jednoosobowa drużyna zaliczałaby sobie sama). TV salonu nie gra
 * i nie głosuje. Większość = ponad połowa uprawnionych obecnych. Po osiągnięciu: applyAccept (raz na drużynę). */
const ACCEPT_KINDS = ['quiz','music','cover','medley'];
export function acceptableTeams(game, current){
  const rv = game && game.reveal;
  if(!rv || !rv.byTeam || !ACCEPT_KINDS.includes(rv.kind)) return [];
  if(current && (current.mc || parseMC(current.prompt))) return [];
  if(rv.kind==='quiz' && /\nA\)/.test(rv.prompt||'')) return [];
  const slots = (Array.isArray(rv.slots) && rv.slots.length) ? rv.slots : slotsOf(game);
  const textKeys = slots.map(s=>s.key).filter(k=> rv.kind==='quiz' ? true : MUSIC_JUDGE_SLOTS.includes(k));
  return Object.keys(rv.byTeam).filter(tid=>{
    const t = rv.byTeam[tid]; if(!t) return false;
    const lk = t.locked || {}, ok = t.okBySlot || {};
    return textKeys.some(k=>String(lk[k]||'').trim() && !ok[k]);
  });
}
// stan „Uznaj" na nową odsłonę (lock): lista drużyn, puste głosy
export function initAccept(game, current, presentIds){
  const teams = acceptableTeams(game, current);
  game.accept = teams.length ? { nonce:game.playNonce, teams, votes:{}, need:{}, done:{} } : null;
  if(game.accept) refreshAcceptNeed(game, presentIds);
  return game.accept;
}
// uprawnieni do głosu (obecni) dla drużyny
export function acceptVoters(game, teamId, presentIds){
  const tv = tvIdOf(game);
  const players = [...new Set(presentIds||[])].filter(id=>id && id!==tv && (game.teams||[]).some(t=>(t.members||[]).includes(id)));
  if((game.format||'coop')==='coop') return players.filter(id=>teamOf(game, id)===teamId);
  return players;
}
export const acceptNeed = (n)=> n>0 ? Math.floor(n/2)+1 : 0;
export function refreshAcceptNeed(game, presentIds){
  const a = game && game.accept; if(!a) return;
  a.teams.forEach(tid=>{ a.need[tid] = acceptNeed(acceptVoters(game, tid, presentIds).length); });
}
/* głos „Uznaj" — idempotentny (powtórny = bez zmian). Zwraca 'noop' | 'voted' | 'reached' (wołający robi applyAccept). */
export function acceptVote(game, teamId, voterId, playNonce, presentIds){
  const a = game && game.accept;
  if(!a || game.phase!==MP.REVEAL || a.nonce!==game.playNonce || playNonce!==game.playNonce) return 'noop';
  if(typeof teamId!=='string' || !a.teams.includes(teamId) || a.done[teamId]) return 'noop';
  const voters = acceptVoters(game, teamId, presentIds);
  if(!voters.includes(voterId)) return 'noop';
  const vs = a.votes[teamId] = (a.votes[teamId]||[]).filter(id=>typeof id==='string');
  if(vs.includes(voterId)) return 'noop';
  vs.push(voterId);
  refreshAcceptNeed(game, presentIds);
  const have = vs.filter(id=>voters.includes(id)).length;
  return have >= (a.need[teamId]||Infinity) ? 'reached' : 'voted';
}
/* PRZELICZENIE pytania dla drużyny „jakby odpowiedź była poprawna" — każdy WPISANY slot liczony jako trafiony
 * (puste dalej puste). Ta sama ocena co przy lock (evaluateTeam: punkty, szybkość z game.lockTiming, seria od serii SPRZED
 * pytania, pewniak, etap okładki/intro), wynik nakładany RÓŻNICĄ: scores += nowe − stare, seria, tally (pierwszy trafiający),
 * zwrot „kolejki" za pewniaka, który teraz wygrał, ranking i wynik do ligi. Raz na drużynę (accept.done). true = zmiana. */
export function applyAccept(game, current, teamId, tally){
  const rv = game && game.reveal, old = rv && rv.byTeam && rv.byTeam[teamId];
  if(!old || !current) return false;
  if(game.accept){ if(game.accept.done[teamId]) return false; game.accept.done[teamId]=true; }
  const typed = new Set(Object.values(old.locked||{}).map(v=>norm(v||'')).filter(Boolean));
  const forced = (g,a)=> textMatch(g,a) || typed.has(norm(g||''));
  game.streaks = game.streaks || {}; game.scores = game.scores || {}; game.beerTally = game.beerTally || {};
  const keepStreak = game.streaks[teamId];
  game.streaks[teamId] = Number(old.prevStreak)||0;   // evaluateTeam liczy serię od stanu SPRZED pytania
  const lt = game.lockTiming || {};
  const timing = { elapsedMs: Number.isFinite(lt.elapsedMs) ? lt.elapsedMs : null, limitMs: lt.limitMs || SPEED_CAP_MS, now: Number.isFinite(lt.now) ? lt.now : null };
  let nu;
  try{ nu = evaluateTeam(game, teamId, current, forced, timing, null); }
  catch(_e){ game.streaks[teamId]=keepStreak; return false; }
  const delta = (Number(nu.gained)||0) - (Number(old.gained)||0);
  game.scores[teamId] = (game.scores[teamId]||0) + delta;
  game.streaks[teamId] = nu.streak||0;
  if(tally && nu.firstById && !old.firstById){ tally[nu.firstById]=tally[nu.firstById]||{ name:nu.firstBy, correct:0 }; tally[nu.firstById].correct++; }
  if(old.pewniakLose && nu.teamOk){ (old.pewniacy||[]).forEach(n=>{ if(game.beerTally[n]>0){ game.beerTally[n]--; if(!game.beerTally[n]) delete game.beerTally[n]; } }); }
  const merged = { ...nu, aiOk: old.aiOk, accepted:true };
  rv.byTeam[teamId] = merged;
  rv.ranking = (rv.ranking||[]).map(r=> r.teamId===teamId ? { ...r, gained:merged.gained, teamOk:merged.teamOk, score:game.scores[teamId] } : r)
    .sort((a,b)=> b.score-a.score);
  if((game.format||'coop')==='coop' && (game.teams||[])[0] && game.teams[0].id===teamId) Object.assign(rv, merged);   // coop: pola spłaszczone
  const last = (game.results||[])[game.results.length-1];
  if(last && rv.ranking.length) last.ok = !!rv.ranking[0].teamOk;
  return true;
}
