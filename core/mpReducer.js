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
import { textMatch, norm, evaluateQuiz, scoreRound, SPEED_CAP_MS, yearScore, YEAR_OK_PTS, quizPartialFrac, listenList, tempoMult } from './scoring.js';
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
  return [ {key:'title', label:'tytuł'}, {key:'artist', label:'wykonawca'} ];
}
// mapowanie klucza slotu → pole w obiekcie utworu (current) do oceny
export const SLOT_FIELD = { title:'track', artist:'artist', year:'year' };
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
      if(!Object.keys(clean).length) return false;          // pusty typ odrzucony
      bkt.proposals = (bkt.proposals||[]).filter(p=>p.by!==a.by);   // JEDNA odpowiedź na gracza — nowa zastępuje poprzednią
      bkt.proposals.push({ id:rid(), aid:a.aid, by:a.by, byName:a.byName, values:clean });
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
      const val = String(a.value==null?'':a.value).slice(0,120);    // 3.3: cap długości wejścia
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
  return Object.values(bkt.votes||{}).some(sv=>sv && Object.prototype.hasOwnProperty.call(sv, playerId));
}
/* P1-3: auto-zamknięcie pytania — WSZYSCY obecni gracze (`presentIds`, bez TV) przypisani do drużyn skończyli.
 * Tylko w PLAY; pusta lista → false (nie zamykamy pustego stołu). */
export function allSettled(game, presentIds){
  if(!game || game.phase!==MP.PLAY) return false;
  const ids = (presentIds||[]).filter(id=>id && teamOf(game, id) && id!==tvIdOf(game));
  return ids.length>0 && ids.every(id=>playerSettled(game, id));
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

/* ---- ocena JEDNEJ drużyny (dawne wnętrze mpLock) — czysta ----
 * locked = odpowiedź tej drużyny (górka głosów w jej buckecie). Zwraca per-drużyna wyliczenia. */
function evaluateTeam(game, teamId, current, match, timing){
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
  const evalAll = (vals)=>{
    if(hasAnswers) return quizEval(vals);
    if(yearQ){ const ys=yearScore(vals && vals.year, current && current.year); return { ok: ys.points>=YEAR_OK_PTS, bySlot:{ year: ys.points>=YEAR_OK_PTS }, year:ys }; }
    const bySlot={}; slots.forEach(s=>{ bySlot[s.key]=match((vals&&vals[s.key])||'', current[SLOT_FIELD[s.key]] || ''); });
    return { ok: slots.every(s=>bySlot[s.key]), bySlot };
  };
  const ev = evalAll(locked);
  const okBySlot = {};
  slots.forEach(s=>{ okBySlot[s.key] = !!ev.bySlot[s.key]; });
  const teamOk = slots.every(s=>okBySlot[s.key]);
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
  const sc = hasAnswers
    ? scoreRound({ quizOk:teamOk, quizFrac, elapsedMs:timing.elapsedMs, limitMs:timing.limitMs, streak, sure:anySure })
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
  return { okTitle, okArtist, okBySlot, teamOk, locked: lockedAll, firstBy, firstById, display, others, credits, yearEval,
    pewniacy, gained, anySure, pewniakWin: teamOk&&anySure, pewniakLose: !teamOk&&anySure,
    streak, pts:{ base:sc.base, speed:sc.speed, streakMult:sc.streakMult, sureMult:sc.sureMult, mult:sc.mult } };
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
  return { elapsedMs, limitMs };
}
// `now` (ms) — chwila zatwierdzenia (lock); bez niej (albo bez game.playAt) punkty bez bonusu za szybkość
export function evaluateAnswer(game, current, match=textMatch, now=null){
  const hasAnswers = !!(current && current.answers && typeof current.answers==='object');
  const slots = slotsOf(game);
  const teams = (game.teams && game.teams.length) ? game.teams : [{ id:COOP_TEAM, name:'Drużyna' }];
  const timing = answerTiming(game, now);
  const perTeam = {};
  teams.forEach(t=>{ perTeam[t.id] = evaluateTeam(game, t.id, current, match, timing); });
  const ranking = teams.map(t=>({ teamId:t.id, name:t.name, color:t.color,
      gained: perTeam[t.id].gained, teamOk: perTeam[t.id].teamOk,
      score: ((game.scores&&game.scores[t.id])||0) + perTeam[t.id].gained }))
    .sort((a,b)=> b.score-a.score);
  const isCoop = (game.format||'coop')==='coop';
  const flat = isCoop ? perTeam[teams[0].id] : {};   // coop: spłaszcz pola jedynej drużyny
  const yearQ = isYearQ(slots, hasAnswers);
  const reveal = {
    track:current.track, artist:current.artist, year:current.year, album:current.album, art:current.art,
    kind: hasAnswers ? 'quiz' : (yearQ ? 'year' : 'music'), prompt: current.prompt || '',
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
    reveal, perTeam, ranking,
    result: { round:game.round, cat:game.catKey, mode:game.mode,
      track: hasAnswers ? (current.track||current.prompt||'') : current.track,   // F8a: ABCD muzyki → tytuł utworu
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
  }
  (game.results = game.results || []).push(ev.result);
  game.reveal = ev.reveal;
}
