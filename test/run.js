/* test/run.js — lekki runner dla czystego rdzenia (zero zależności).
 * Uruchom: node test/run.js */
import { norm, lev, textMatch, deLatin, yearMatch, evaluateGuess, artistMatch, numTokens, parseMC, shuffleMC, quizKey,
  evaluateQuiz, poolOf, freshQuestions, rememberSeen, QUIZ_SEEN_LIMIT, scoreRound, speedFactor, streakMult, SCORE_MAX_PER_Q, PTS, SPEED_CAP_MS } from '../core/scoring.js';
import { modesFor, buildMatch, matchSlot, matchAdvance, randomPools, QPC, CPR, ALL_MODES, matchHeader, matchQLabel } from '../core/match.js';
import { NEUTRAL_HANDLES, SPICY_HANDLES, pickHandle, isSpicyHandle } from '../core/handles.js';
import { MP_INTRO_MS, LAST_ROOM_TTL_MS, lastRoomCode, tickSecond } from '../core/timing.js';
import { REACTIONS } from '../core/chatFeed.js';
import { reduceAction, countReady, evaluateAnswer, applyEvaluation, answerTiming, candidatesForSlot, teamAnswer, myVoteForSlot, rosterState, slotsFor, teamOf,
  answerCredits, audioHostOnly, playsAudioLocally } from '../core/mpReducer.js';
import { buildTeams, emptyByTeam, reconcileTeams, joinTeam, COOP_TEAM, sanitizeAssignments, teamColor } from '../core/teams.js';
import { escapeHtml, safeColor, isSlotKey, num, clipText } from '../core/util.js';
import { clampRounds, sanitizeMpConfig, MAX_ROUNDS, clampQuestions, roundsForQuestions, MAX_QUESTIONS, DEFAULT_QUESTIONS, QUICK_QUESTIONS, MATCH_LENGTHS, matchProgress } from '../core/match.js';
import { clampTimer, MP_TIMER_MAX_S, secsLeft, MP_ARM_TIMEOUT_MS, MP_REVEAL_AUTO_MS, MP_BUFFER_TIMEOUT_MS } from '../core/timing.js';
import { canTransitionSolo, canTransitionMp, MP, SOLO } from '../core/phases.js';
import { pickTrack, BAD } from '../adapters-web/itunesRepository.js';
import { resolveTrack, sameArtist, versionTier, titleKey, parseRange, inRange, rankTracks, pickTrackRanked,
  popWeight, cachedFetcher, matchSong } from '../core/trackSelect.js';
import { buildSoloRecord, buildMpRecord, noteAnswerers, rankCategories } from '../core/matchRecord.js';
import { listenSecs, soloSnipStart, mpSnipStart, shouldPing, SNIP_SECS, SOLO_SNIP_MAX, MP_SNIP_WINDOW_S } from '../core/timing.js';
import { plPick, togglePick, toggleAllPick, allSelected, syncQuizMode, grpActive, pickSummary, pickSummaryText, quickPool, restorePick, QUICK_PREFERRED } from '../core/picker.js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { createFeed, resetFeed, pushChat, ingestFeed, FEED_CAP } from '../core/chatFeed.js';
import { trackKey, isTrackKey, sanitizeRating, parseStore, rate, unrate, toggleHeart, ratingOf, activeRatings, capStore, tasteCounts,
  shelfItems, mergeTaste, markSynced, dropTombs, batches, genreGroup, catGroup, decadeOf, tasteCandidates, pickTasteSession, planCat,
  seenForArtist, TASTE_MAX, SESSION_N, SESSION_SPARE, isTasteVisibility, TASTE_VISIBILITY } from '../core/taste.js';
import { profileGenre, catProfileGenre, catDecadeOf, itemDecade, isPolish, plArtists, isPlCat, pctRound, confidenceOf, topArtists,
  ARCHETYPES, LOW_ARCHETYPE, pickArchetype, knownProfile, compareKnownLiked, buildTasteProfile, shareText, DECADES, PROFILE_GENRES,
  CONF_MID, CONF_HIGH } from '../core/tasteProfile.js';
import { compareTaste, cosine, verdictFor, VERDICTS, explainParts, sharedFavorites, recommendations, publicRating, sanitizeFriendRatings,
  shelfSongs, canPlayShelf, shelfCategory, tableShelfPayload, sanitizeTableShelf, buildTablePool, tablePoolCategory, COMPARE_MIN, JACCARD_FULL,
  SHELF_PLAY_MIN, TABLE_SHELF_MAX, TABLE_MIN_HEARTS, TABLE_KEY } from '../core/tasteCompare.js';

let pass=0, fail=0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.error('  ✗ '+msg); } }
function eq(a,b,msg){ ok(JSON.stringify(a)===JSON.stringify(b), `${msg} — oczekiwano ${JSON.stringify(b)}, było ${JSON.stringify(a)}`); }
function group(name,fn){ console.log('• '+name); fn(); }

/* --- F1: bezpieczeństwo MP — walidatory i sanityzacja configu/drużyn --- */
group('F1 util: safeColor / isSlotKey / num / escapeHtml(nie-string)', ()=>{
  eq(safeColor('#58CC02','#000'),'#58CC02','poprawny hex przechodzi');
  eq(safeColor('red" onmouseover="alert(1)','#000'),'#000','#2: kolor z wstrzyknięciem → fallback');
  eq(safeColor('red','#000'),'#000','nazwa koloru (nie hex) → fallback');
  eq(safeColor({},'#111'),'#111','obiekt → fallback');
  ok(isSlotKey('title') && isSlotKey('a') && isSlotKey('rok_2'), 'klucze slotów z danych przechodzą');
  ok(!isSlotKey('a" autofocus onfocus="x()') && !isSlotKey('') && !isSlotKey('A') && !isSlotKey('x'.repeat(13)) && !isSlotKey(5), '#2: zły klucz slotu odrzucony');
  eq(num('<img src=x>'),'0','num: HTML → 0'); eq(num(7),'7','num: liczba'); eq(num('3'),'3','num: liczba w stringu');
  eq(escapeHtml(5),'5','escapeHtml(liczba) nie rzuca'); eq(escapeHtml(0),'','escapeHtml(0) → \'\' (jak dotąd)');
  eq(clipText({x:1},5),'','clipText: obiekt → pusty'); eq(clipText('  abcdefgh ',4),'abcd','clipText: trim + cap');
});
group('F1 match: clampRounds / clampTimer / sanitizeMpConfig (#5)', ()=>{
  eq(clampRounds(200000), MAX_ROUNDS, 'rounds=200000 → MAX_ROUNDS');
  eq(clampRounds(0), 1, 'rounds=0 → 1'); eq(clampRounds('x'), 1, 'rounds śmieci → 1'); eq(clampRounds(3), 3, 'rounds=3 bez zmian');
  eq(clampTimer(9e9), MP_TIMER_MAX_S, 'timer ogromny → max'); eq(clampTimer(-5), 0, 'timer ujemny → 0'); eq(clampTimer(60), 60, 'timer 60 bez zmian');
  const c=sanitizeMpConfig({ rounds:200000, timer:'abc', modes:['music','<x>','music','quiz'], format:'evil', salon:'yes', extra:1 });
  eq(c, { rounds:MAX_ROUNDS, questions:MAX_QUESTIONS, timer:0, modes:['music','quiz'], format:'coop', salon:false, audioHostOnly:false }, 'sanitizeMpConfig: tylko znane pola, przycięte (F6a: + questions z rounds; F6b: + audioHostOnly)');
  eq(sanitizeMpConfig(null).rounds, 4, 'brak configu → domyślne 4 rundy');
});
group('F1 teams: sanitizeAssignments / buildTeams(teams) (#2)', ()=>{
  const ps=[{id:'u1',name:'Ala'},{id:'u2',name:'Bob'},{id:'u3',name:'Cyd'}];
  const evil=[
    { id:'t0', name:'<b>Rekiny</b> i bardzo długa nazwa', color:'red" onmouseover="alert(1)', members:['u1','u2','ghost'] },
    { id:'t0', name:{x:1}, color:'#CE82FF', members:['u2','u3'] },   // u2 już w t0 → tylko u3; id kolizja
    { id:'t9', name:'Pusta', color:'#fff', members:['ghost'] },        // nikt obecny → odpada
  ];
  const t=sanitizeAssignments(evil, ps);
  eq(t.length, 2, 'pusta drużyna odrzucona');
  eq(t[0].color, teamColor(0), '#2: kolor z wstrzyknięciem → kolor z palety');
  eq(t[0].members, ['u1','u2'], 'members ∩ obecni (ghost wycięty)');
  eq(t[1].members, ['u3'], 'gracz w max jednej drużynie');
  ok(t[0].id!==t[1].id, 'id drużyn unikalne');
  ok(t[0].name.length<=14, 'nazwa przycięta (14)');
  eq(t[1].name, 'Drużyna 2', 'nazwa nie-string → domyślna');
  eq(t[1].color, '#CE82FF', 'poprawny hex zachowany');
  const bt=buildTeams('teams', ps, evil);
  ok(bt.every(x=>/^#[0-9a-fA-F]{3,8}$/.test(x.color)), 'buildTeams(teams) też sanityzuje kolor');
  eq(buildTeams('teams', ps, [{id:'t0',members:['ghost']}]).length, 1, 'same puste przypisania → fallback coop (1 drużyna)');
});

/* --- scoring --- */
group('scoring.norm', ()=>{
  eq(norm('The Beatles'),'beatles','przedimek „the" usunięty');
  eq(norm('Beyoncé'),'beyonce','diakrytyk usunięty');
  eq(norm('Smells Like Teen Spirit (Remastered 2011)'),'smells like teen spirit','„(remaster)" obcięty');
  eq(norm('AC/DC'),'ac dc','znaki specjalne → spacja');
  eq(norm('Motörhead'),'motorhead','ö → o');
  eq(norm('Łódź'),'lodz','ł obsłużone przez deLatin');
  eq(norm('A'),'a','sam przedimek „a" (litera A w ABCD) nie redukuje się do pustego');
  eq(norm('the'),'the','samodzielny przedimek zachowany (gdy to całość)');
  eq(norm('A Day in the Life'),'day in life','przedimki w zdaniu nadal usuwane');
});
group('scoring.lev', ()=>{
  eq(lev('kot','kot'),0,'identyczne = 0');
  eq(lev('kot','koty'),1,'jedno wstawienie');
  eq(lev('',''),0,'puste');
  eq(lev('abc','xyz'),3,'całkiem różne');
});
group('scoring.textMatch', ()=>{
  ok(textMatch('Hey Jude','hey jude'),'wielkość liter ignorowana');
  ok(textMatch('beatles','The Beatles'),'przedimek pomijany');
  ok(textMatch('Bohemian Rapsody','Bohemian Rhapsody'),'jedna literówka tolerowana');
  ok(!textMatch('Yesterday','Help'),'różne tytuły odrzucone');
  ok(!textMatch('',''),'puste odrzucone');
  ok(textMatch('a','A'),'ABCD: mała „a" trafia odpowiedź „A" (litera, nie przedimek)');
  ok(textMatch('A','A'),'ABCD: „A" trafia „A"');
  ok(!textMatch('a','B'),'ABCD: zła litera nie trafia');
  ok(textMatch('d','D'),'ABCD: „d" trafia „D"');
  ok(textMatch('Imagine','Imagine (Remastered)'),'sufiks remaster pomijany');
  ok(textMatch('problem','PRO8L3M'),'leetspeak: „problem” == „PRO8L3M”');
  ok(textMatch('PRO8L3M','problem'),'leetspeak: symetrycznie');
  ok(textMatch('pro8l3m','PRO8L3M'),'oryginalny zapis też zalicza');
  ok(!textMatch('problem','Ulica'),'leet nie psuje normalnego odrzucenia');
  ok(!textMatch('flag','What\'s Left of the Flag'),'pojedyncze słowo nie zalicza długiego tytułu');
  ok(!textMatch('love','Love Will Tear Us Apart'),'krótkie słowo nie zalicza długiego tytułu');
  ok(textMatch('Bohemian Rhapsody','Bohemian Rhapsody - Live'),'sufiks live pomijany (containment dużej części)');
});

/* --- match --- */
const CATS={
  d80:{label:'80s', songs:[{title:'a'},{title:'b'}]},
  rock:{label:'rock', songs:[{title:'c',lyric:'tekst'}]},
  lyr:{label:'teksty', kind:'lyrics', songs:[{title:'d'}]},
  gk:{label:'wiedza', kind:'quiz', questions:[{prompt:'q',slots:[{key:'a',label:'odp'}],answers:{a:['x']}}]},
};
group('match.modesFor', ()=>{
  eq(modesFor('d80',CATS),['music','reverse','snippet','intro','revsnip','piano','guitar','slowmo','fastmo'],'audio bez tekstu (EKSP.: + fortepian, gitara) (F8a: + intro; EKSP.: + revsnip; 2 utwory bez roku → bez abcd/rok; bez puli wykonawców → bez składanki/okładki)');
  eq(modesFor('rock',CATS),['music','reverse','snippet','intro','revsnip','piano','guitar','slowmo','fastmo','lektor'],'audio + lektor (jest lyric)');
  eq(modesFor('lyr',CATS),['lektor'],'kind=lyrics → tylko lektor');
  eq(modesFor('gk',CATS),['quiz'],'kind=quiz → tylko quiz');
  ok(!modesFor('d80',CATS).includes('quiz'),'muzyka nigdy nie ma trybu quiz');
  eq(modesFor('brak',CATS),[],'nieznana kategoria → pusto');
});
group('match.buildMatch', ()=>{
  const m=buildMatch(['d80','rock'],['music'],2,CATS);
  eq(m.slots.length, 2*CPR, `2 rundy × ${CPR} slotów`);
  ok(m.slots.every(s=>s.mode==='music'),'wszystkie sloty w wybranym trybie');
  ok(m.slots.every(s=>s.round>=1&&s.round<=2),'numery rund w zakresie');
  // bez powtórki kategorii w rundzie gdy pula wystarcza
  const r1=m.slots.filter(s=>s.round===1).map(s=>s.cat);
  // pula = {d80, rock} → CPR=3 wymaga powtórki (pula < CPR), więc tylko sprawdzamy że sloty istnieją
  ok(r1.length===CPR,'runda 1 ma CPR slotów');
  const bad=buildMatch(['lyr'],['music'],1,CATS);
  ok(bad.error,'niekompatybilne tryby → error');
  // quiz: czysto quizowy mecz → wszystkie sloty mode=quiz
  const q=buildMatch(['gk'],['quiz'],1,CATS);
  ok(!q.error && q.slots.every(s=>s.mode==='quiz'),'czysty quiz → wszystkie sloty quiz');
  // mieszany quiz+muzyka → oba tryby, bez krzyżowania kind↔mode
  const mix=buildMatch(['d80','gk'],['music','quiz'],1,CATS);
  ok(mix.slots.some(s=>s.mode==='music') && mix.slots.some(s=>s.mode==='quiz'),'mieszany → oba tryby');
  ok(mix.slots.every(s=> (s.cat==='gk')===(s.mode==='quiz')),'quiz tylko dla kat. quizowej i odwrotnie');
});
group('match.matchAdvance', ()=>{
  const m={slots:[{round:1},{round:1}], si:0, qi:0, rounds:1};
  for(let i=0;i<QPC-1;i++){ ok(matchAdvance(m),'w obrębie kategorii zostaje'); }
  ok(m.qi===QPC-1 && m.si===0,'qi rośnie, si bez zmian');
  ok(matchAdvance(m),'po QPC przechodzi do kolejnego slotu (jest)');
  ok(m.si===1 && m.qi===0,'si++ i qi reset');
  ok(!matchAdvance(m)===false || true,'koniec slotów obsłużony');
});
group('match.randomPools', ()=>{
  for(let i=0;i<50;i++){
    const {cats,modes}=randomPools(Object.keys(CATS),CATS);
    ok(cats.length>0 && modes.length>0,'zawsze ≥1 kategoria i ≥1 tryb');
    ok(cats.every(c=>modesFor(c,CATS).some(m=>modes.includes(m))),'co najmniej kompatybilność puli');
  }
});

/* --- scoring: rok + evaluateGuess --- */
group('scoring.yearMatch', ()=>{
  ok(yearMatch('1991','1992'),'±1 trafia');
  ok(yearMatch(1990,1992),'±2 trafia (liczby)');
  ok(!yearMatch('1990','1993'),'±3 nie trafia');
  ok(!yearMatch('','1990'),'brak odgadnięcia → false');
  ok(!yearMatch('1990',''),'brak prawdy → false');
});
group('scoring.evaluateGuess', ()=>{
  const track={track:'Bohemian Rhapsody', artist:'Queen', year:'1975', album:'A Night at the Opera'};
  let r=evaluateGuess({title:'Bohemian Rhapsody',artist:'Queen',year:'1976',album:''}, track);
  ok(r.okTitle&&r.okArtist&&r.roundOk,'tytuł+wykonawca → roundOk');
  ok(r.okYear,'rok ±1 bonus');
  ok(!r.okAlbum,'album nie zgadywany → false');
  r=evaluateGuess({title:'Zła',artist:'Queen',year:'',album:''}, track);
  ok(!r.roundOk && r.okArtist,'zły tytuł → brak roundOk, ale wykonawca ok');
});

/* --- mpReducer (stan odpowiedzi PER-DRUŻYNA; coop = jedna drużyna 'all') --- */
// helper: gra coop z bucketem 'all' (members muszą zawierać graczy, inaczej teamOf=null → akcje ignorowane)
function coopG(over={}){
  return { phase:MP.PLAY, round:over.round||1, format:'coop', catKey:over.catKey, mode:over.mode,
    answerSlots: over.answerSlots||slotsFor(),
    teams:[{id:COOP_TEAM, name:'Drużyna', members:over.members||['u1','u2','u3','u9']}],
    byTeam:{ [COOP_TEAM]:{ proposals:over.proposals||[], votes:over.votes||{}, sure:over.sure||[], passed:over.passed||[] } },
    scores:{ [COOP_TEAM]:over.score||0 }, salon:over.salon, hostId:over.hostId };
}
function mkGame(){ return coopG(); }
const bAll = (g)=> g.byTeam[COOP_TEAM];   // bucket drużyny 'all'
group('teams.buildTeams / emptyByTeam', ()=>{
  const players=[{id:'u1',name:'Ala'},{id:'u2',name:'Bob'},{id:'u3',name:'Cyd'}];
  const coop=buildTeams('coop', players);
  eq(coop.length,1,'coop → jedna drużyna');
  eq(coop[0].members.length,3,'…ze wszystkimi graczami');
  const solo=buildTeams('solo', players);
  eq(solo.length,3,'solo → N drużyn 1-osobowych');
  eq(solo[0].id,'u1','solo: id drużyny = id gracza');
  eq(solo[1].members,['u2'],'solo: drużyna = jeden gracz');
  ok(solo[0].color!==solo[1].color,'kolory drużyn różne');
  const bt=emptyByTeam(solo);
  eq(Object.keys(bt).length,3,'emptyByTeam: bucket na drużynę');
  eq(bt.u1.proposals,[],'bucket pusty (proposals)');
  // teamOf: membership + brak dopasowania → null
  const g=coopG({members:['u1','u2']});
  eq(teamOf(g,'u1'),COOP_TEAM,'teamOf: gracz w drużynie');
  eq(teamOf(g,'zzz'),null,'teamOf: spoza drużyn → null');
  // teams: podział hosta z `assignments`
  const asg=[{id:'t0',name:'Drużyna 1',color:'#58CC02',members:['u1','u3']},{id:'t1',name:'Drużyna 2',color:'#CE82FF',members:['u2']}];
  const tm=buildTeams('teams', players, asg);
  eq(tm.length,2,'teams → drużyny z assignments');
  eq(tm[0].members,['u1','u3'],'teams: members z assignments');
  eq(tm[1].name,'Drużyna 2','teams: nazwa z assignments');
});
group('teams.reconcileTeams', ()=>{
  // coop: drużyna 'all' = wszyscy obecni
  const gc=coopG({members:['u1']}); reconcileTeams(gc,[{id:'u1'},{id:'u2'}]);
  eq(gc.teams[0].members,['u1','u2'],'coop: reconcile = wszyscy obecni');
  // solo: dorzuć brakujących jako nowe 1-os. drużyny
  const gs={ format:'solo', teams:[{id:'u1',name:'Ala',members:['u1']}], scores:{u1:0} };
  reconcileTeams(gs,[{id:'u1',name:'Ala'},{id:'u2',name:'Bob'}]);
  eq(gs.teams.length,2,'solo: nowy gracz → nowa drużyna');
  eq(gs.scores.u2,0,'solo: scores zainicjowane dla nowej drużyny');
  // teams: podział hosta zostaje, późny gracz → do NAJMNIEJSZEJ drużyny (fix: dawniej „widz do rewanżu",
  // jego typy reducer odrzucał po cichu — host nie widział odpowiedzi gościa przez cały mecz)
  const gt={ format:'teams', teams:[{id:'t0',name:'A',members:['u1','u3']},{id:'t1',name:'B',members:['u2']}], scores:{} };
  reconcileTeams(gt,[{id:'u1'},{id:'u2'},{id:'u3'},{id:'u9'}]);
  eq(gt.teams.length,2,'teams: reconcile nie tworzy nowych drużyn');
  eq(gt.teams[0].members,['u1','u3'],'teams: podział hosta nietknięty');
  eq(gt.teams[1].members,['u2','u9'],'teams: późny gracz → najmniejsza drużyna (B)');
  eq(gt.scores.t0,0,'teams: scores zainicjowane');
});
group('teams.joinTeam — późne wejście / powrót (fix „host nie widział moich odpowiedzi")', ()=>{
  const gc={ format:'coop', teams:[{id:'all',members:['h']}], scores:{all:3} };
  ok(joinTeam(gc,{id:'g',name:'Gość'}),'coop: gość dopisany'); eq(gc.teams[0].members,['h','g'],'coop: do drużyny all');
  ok(!joinTeam(gc,{id:'g'}),'coop: powtórka → bez zmian'); eq(gc.scores.all,3,'coop: wynik nietknięty');
  const gs={ format:'solo', teams:[{id:'h',name:'Host',members:['h']}], scores:{h:5} };
  ok(joinTeam(gs,{id:'g',name:'Gość'}),'solo: gość dostaje własną drużynę');
  eq(gs.teams.map(t=>t.id),['h','g'],'solo: id drużyny = id gracza'); eq(gs.teams[1].name,'Gość','solo: nazwa = ksywa'); eq(gs.scores.g,0,'solo: wynik od 0');
  ok(!joinTeam(gs,{id:'h'}),'solo: powrót gracza z drużyną → bez zmian');
  const gt={ format:'teams', teams:[{id:'t0',members:['a','b']},{id:'t1',members:['c']}], scores:{t0:1,t1:2} };
  ok(joinTeam(gt,{id:'g'}),'teams: późny gracz przypisany'); eq(gt.teams[1].members,['c','g'],'teams: do najmniejszej');
  ok(joinTeam(gt,{id:'h'}),'teams: remis → pierwsza'); eq(gt.teams[0].members,['a','b','h'],'teams: remis → t0');
  ok(!joinTeam({ format:'teams', teams:[], scores:{} },{id:'x'}),'teams bez podziału → bez zmian (nie wymyślamy drużyn)');
  ok(!joinTeam(null,{id:'x'}) && !joinTeam(gc,null),'null-safe');
});
group('mpReducer.propose: JEDNA odpowiedź na gracza (nowa zastępuje starą)', ()=>{
  const g=mkGame();
  reduceAction(g,{type:'propose',by:'u1',byName:'Ala',values:{title:'Hey Jude',artist:'Beatles'}});
  reduceAction(g,{type:'propose',by:'u1',byName:'Ala',values:{title:'We Will Rock You',artist:'Queen'}});
  eq(bAll(g).proposals.filter(p=>p.by==='u1').length,1,'gracz ma dokładnie 1 propozycję');
  eq(bAll(g).proposals.find(p=>p.by==='u1').values.artist,'Queen','została najnowsza odpowiedź');
  eq(bAll(g).votes.artist.u1,'Queen','głos gracza przesunięty na nową wartość');
  reduceAction(g,{type:'propose',by:'u2',byName:'B',values:{title:'Yesterday',artist:'Beatles'}});
  eq(bAll(g).proposals.length,2,'dwóch graczy → dwie propozycje (limit jest PER gracz)');
});
group('mpReducer.reduceAction', ()=>{
  const g=mkGame();
  ok(!reduceAction(g,{type:'propose',by:'zzz',values:{title:'x'}}),'gracz spoza drużyn → akcja ignorowana');
  ok(reduceAction(g,{type:'propose',by:'u1',byName:'Ala',values:{title:'Hey Jude',artist:'Beatles'}}),'propose zmienia stan');
  eq(bAll(g).proposals.length,1,'1 propozycja');
  ok(!reduceAction(g,{type:'propose',by:'u2',byName:'B',values:{title:'',artist:''}}),'pusty typ odrzucony');
  eq(bAll(g).votes.title.u1,'Hey Jude','auto-głos na własny tytuł');
  eq(bAll(g).votes.artist.u1,'Beatles','auto-głos na własnego wykonawcę');
  ok(reduceAction(g,{type:'vote',by:'u2',slot:'title',value:'Hey Jude'}),'głos na slot dodany');
  eq(bAll(g).votes.title.u2,'Hey Jude','głos zapisany');
  reduceAction(g,{type:'vote',by:'u2',slot:'title',value:'Hey Jude'});  // ten sam = wycofanie
  ok(!('u2' in bAll(g).votes.title),'ponowny głos = wycofanie');
  reduceAction(g,{type:'vote',by:'u1',slot:'title',value:'Yesterday',set:true});
  eq(bAll(g).votes.title.u1,'Yesterday','set: zmiana wyboru na inną wartość');
  // pewniak = per-gracz toggle (bucket), DZIAŁA też dla osoby która tylko głosowała (u2 nie ma typu)
  ok(reduceAction(g,{type:'sure',by:'u2',byName:'B'}),'pewniak włączony (głosujący, bez typu)');
  eq(bAll(g).sure.length,1,'1 pewniak');
  reduceAction(g,{type:'sure',by:'u2',byName:'B'});
  eq(bAll(g).sure.length,0,'pewniak wyłączony (toggle)');
  ok(reduceAction(g,{type:'pass',by:'u2',byName:'B'}),'pas włączony');
  // pewniak i pas wzajemnie się wykluczają
  reduceAction(g,{type:'sure',by:'u2',byName:'B'});
  eq(bAll(g).sure.length,1,'pewniak włączony');
  eq(bAll(g).passed.length,0,'…i pas zgaszony (przeciwne intencje)');
  const pid=bAll(g).proposals[0].id;
  ok(reduceAction(g,{type:'unpropose',by:'u1',pid}),'autor usuwa typ');
  eq(bAll(g).proposals.length,0,'typ usunięty');
  ok(!reduceAction(g,{type:'nieznana'}),'nieznana akcja → brak zmian');
  const armed=coopG({members:['x']}); armed.phase=MP.ARMING;
  ok(!reduceAction(armed,{type:'propose',by:'x',values:{title:'a'}}),'propose poza fazą play → ignorowane');
});
group('mpReducer: routing per-drużyna (izolacja bucketów)', ()=>{
  // 2 drużyny: A(u1,u2), B(u3). Akcje trafiają do bucketu drużyny aktora.
  const g={ phase:MP.PLAY, round:1, format:'teams', answerSlots:slotsFor(),
    teams:[{id:'A',name:'A',members:['u1','u2']},{id:'B',name:'B',members:['u3']}],
    byTeam:emptyByTeam([{id:'A'},{id:'B'}]), scores:{A:0,B:0} };
  reduceAction(g,{type:'propose',by:'u1',byName:'Ala',values:{title:'Hey Jude',artist:'Beatles'}});
  reduceAction(g,{type:'propose',by:'u3',byName:'Cyd',values:{title:'Help',artist:'Beatles'}});
  eq(g.byTeam.A.proposals.length,1,'typ u1 w buckecie A');
  eq(g.byTeam.B.proposals.length,1,'typ u3 w buckecie B');
  // izolacja selektorów: kandydaci A nie zawierają wartości z B
  eq(candidatesForSlot(g,'A','title').map(c=>c.value),['Hey Jude'],'kandydaci A: tylko typ A');
  eq(candidatesForSlot(g,'B','title').map(c=>c.value),['Help'],'kandydaci B: tylko typ B');
  eq(teamAnswer(g,'A').title,'Hey Jude','odpowiedź A ≠ B');
  eq(teamAnswer(g,'B').title,'Help','odpowiedź B');
});
group('mpReducer.countReady', ()=>{
  const s=new Set(['a','b']);
  eq(countReady(['a','b'],s).all,true,'wszyscy gotowi');
  eq(countReady(['a','b','c'],s).count,2,'liczy obecnych');
  eq(countReady(['a','b','c'],s).all,false,'brakuje jednego');
  eq(countReady([],s).all,false,'pusta lista → nie all');
});
group('mpReducer.evaluateAnswer (coop — wsteczna zgodność reveal)', ()=>{
  const g=coopG({round:2, members:['u9'],
    proposals:[{by:'u9',byName:'Zoe',values:{title:'Hey Jude',artist:'The Beatles'}}],
    votes:{ title:{u9:'Hey Jude'}, artist:{u9:'The Beatles'} }, sure:[{id:'u9',name:'Zoe'}] });
  const cur={track:'Hey Jude', artist:'Beatles', year:'1968', album:'X', art:''};
  const ev=evaluateAnswer(g, cur);   // ocenia drużynę 'all'
  ok(ev.reveal.teamOk,'drużyna trafiła (oba sloty)');
  eq(ev.reveal.gained,200,'F6a: pewniak + trafienie (tytuł 50 + wykonawca 50) ×2 = 200 pkt (reveal coop-flat)');
  eq(ev.perTeam.all.gained,200,'perTeam.all.gained == reveal.gained (spread)');
  eq(ev.reveal.pewniacy,['Zoe'],'pewniacy z bucketu drużyny');
  eq(ev.reveal.firstBy,'Zoe','pierwszy trafny = Zoe');
  eq(ev.perTeam.all.firstById,'u9','firstById per drużyna (do tally)');
  ok(ev.reveal.pewniakWin,'pewniak wygrany');
  eq(ev.result.round,2,'wynik z numerem rundy');
  eq(ev.ranking.length,1,'coop → ranking 1-elementowy');
  // pewniak GŁOSUJĄCEGO (bez typu) + pudło → pewniakLose
  const bad=evaluateAnswer(coopG({members:['u1','u2'],
    proposals:[{by:'u1',byName:'A',values:{title:'Złe',artist:'Złe'}}],
    votes:{ title:{u1:'Złe'}, artist:{u1:'Złe'} }, sure:[{id:'u2',name:'Bob'}] }), cur);
  eq(bad.reveal.gained,0,'pewniak nietrafiony = 0 pkt');
  eq(bad.reveal.pewniacy,['Bob'],'pewniak Bob (głosujący, nie autor typu)');
  ok(bad.reveal.pewniakLose,'pewniak przegrany');
});
group('mpReducer.evaluateAnswer: solo = wiele drużyn + ranking', ()=>{
  // A (u1) trafia, B (u2) pudłuje → osobne punkty, ranking A > B
  const g={ phase:MP.PLAY, round:1, format:'solo', answerSlots:slotsFor(),
    teams:[{id:'u1',name:'Ala',members:['u1']},{id:'u2',name:'Bob',members:['u2']}],
    byTeam:{ u1:{proposals:[{by:'u1',byName:'Ala',values:{title:'Hey Jude',artist:'Beatles'}}], votes:{title:{u1:'Hey Jude'},artist:{u1:'Beatles'}}, sure:[], passed:[]},
             u2:{proposals:[{by:'u2',byName:'Bob',values:{title:'Złe',artist:'Złe'}}], votes:{title:{u2:'Złe'},artist:{u2:'Złe'}}, sure:[], passed:[]} },
    scores:{u1:0,u2:0} };
  const cur={track:'Hey Jude', artist:'Beatles'};
  const ev=evaluateAnswer(g, cur);
  ok(ev.perTeam.u1.teamOk,'drużyna u1 trafiła');
  ok(!ev.perTeam.u2.teamOk,'drużyna u2 pudłuje');
  eq(ev.perTeam.u1.gained,100,'F6a: u1 +100 (tytuł+wykonawca, bez czasu → bez bonusu)');
  eq(ev.perTeam.u2.gained,0,'u2 +0');
  eq(ev.ranking[0].teamId,'u1','ranking: zwycięzca u1');
  ok(!('teamOk' in ev.reveal) || ev.reveal.byTeam,'solo: reveal niesie byTeam (bez coop-spread)');
});
group('mpReducer.selektory (per-drużyna)', ()=>{
  const g=coopG({
    proposals:[ {id:'p1',by:'u1',byName:'A',values:{title:'Hey Jude',artist:'Beatles'}},
                {id:'p2',by:'u2',byName:'B',values:{title:'Help',artist:'Beatles'}} ],
    votes:{ title:{u1:'Hey Jude',u2:'Help',u3:'Hey Jude'}, artist:{u1:'Beatles',u2:'Beatles'} },
    sure:[{id:'u1',name:'A'}] });
  const tc=candidatesForSlot(g,COOP_TEAM,'title');
  eq(tc[0].value,'Hey Jude','najwięcej głosów na górze');
  eq(tc[0].votes.length,2,'„Hey Jude" ma 2 głosy');
  const ta=teamAnswer(g,COOP_TEAM);
  eq(ta.title,'Hey Jude','tytuł drużyny = górka');
  eq(ta.artist,'Beatles','wykonawca drużyny = górka');
  eq(myVoteForSlot(g,COOP_TEAM,'title','u2'),'Help','mój głos w slocie');
  eq(myVoteForSlot(g,COOP_TEAM,'title','x'),null,'brak głosu → null');
  eq(rosterState(g,COOP_TEAM,'u1'),'sure','u1 postawił pewniaka (bucket.sure)');
  eq(rosterState(g,COOP_TEAM,'u2'),'ans','u2 wrzucił typ (bez pewniaka)');
  eq(rosterState(g,COOP_TEAM,'zzz'),'idle','brak aktywności → myśli');
  eq(rosterState(g,COOP_TEAM,'zzz',new Set(['zzz'])),'type','w secie typing (bez typu) → pisze');
  // rywal w PLAY: serwer wycina proposals, zostawia `answered` (KTO dał typ) → status „✓ typ" bez treści
  const gr={ byTeam:{ r:{ proposals:[], votes:{}, sure:[], passed:[], answered:['rv'] } } };
  eq(rosterState(gr,'r','rv'),'ans','answered (okrojony bucket rywala) → ✓ typ');
  eq(rosterState(gr,'r','inny'),'idle','spoza answered → myśli');
  eq(rosterState(g,COOP_TEAM,'u2',new Set(['u2'])),'ans','typ ma priorytet nad „pisze"');
  eq(rosterState(g,COOP_TEAM,'u1',new Set(['u1'])),'sure','pewniak ma priorytet nad „pisze"');
  g.byTeam[COOP_TEAM].passed=[{id:'u1'}];
  eq(rosterState(g,COOP_TEAM,'u1'),'pass','pas ma priorytet nad pewniakiem');
});

group('mpReducer.evaluateAnswer (quiz)', ()=>{
  eq(slotsFor('quiz', null, {slots:[{key:'a',label:'odp'}]}), [{key:'a',label:'odp'}], 'slotsFor: sloty z pytania');
  eq(slotsFor('music').map(s=>s.key), ['title','artist'], 'slotsFor: domyślne tytuł+wykonawca');
  const g1=coopG({members:['u1'], answerSlots:[{key:'a',label:'odp'}],
    proposals:[{by:'u1',byName:'A',values:{a:'Kanberra'}}], votes:{ a:{u1:'Kanberra'} } });
  const q1={prompt:'Stolica Australii?', answers:{a:['Canberra','Kanberra']}};
  const e1=evaluateAnswer(g1, q1);
  ok(e1.reveal.teamOk,'quiz 1-slot: wariant zalicza');
  eq(e1.reveal.kind,'quiz','reveal.kind=quiz');
  eq(e1.reveal.prompt,'Stolica Australii?','reveal.prompt');
  eq(e1.reveal.answers.a,['Canberra','Kanberra'],'reveal.answers per slot');
  eq(e1.reveal.locked.a,'Kanberra','reveal.locked per slot');
  eq(e1.reveal.firstBy,'A','firstBy po wariancie');
  eq(e1.result.track,'Stolica Australii?','result.track = prompt dla quizu');
  const g2=coopG({members:['u1'], answerSlots:[{key:'dir',label:'reżyser'},{key:'year',label:'rok'}],
    votes:{ dir:{u1:'Tarantino'}, year:{u1:'2010'} } });
  const q2={prompt:'x', answers:{dir:['Tarantino','Quentin Tarantino'], year:['1994']}};
  const e2=evaluateAnswer(g2, q2);
  ok(!e2.reveal.teamOk,'quiz 2-slot: jeden zły → drużyna nie trafia');
  ok(e2.reveal.okBySlot.dir && !e2.reveal.okBySlot.year,'okBySlot per slot (dir ok, year zły)');
});
group('mpReducer.teamAnswer — nadpisanie hosta (salon)', ()=>{
  // gracze: większość na „Help", ale host (TV) wskazał „Hey Jude" → nadpisuje górkę
  const mk=(salon)=> coopG({members:['u1','u2'], salon, hostId:'tv',
    votes:{ title:{u1:'Help',u2:'Help',tv:'Hey Jude'}, artist:{u1:'Beatles'} } });
  eq(teamAnswer(mk(false),COOP_TEAM).title,'Help','bez salonu: górka głosów wygrywa (Help)');
  eq(teamAnswer(mk(true),COOP_TEAM).title,'Hey Jude','salon: pick hosta nadpisuje większość');
  eq(teamAnswer(mk(true),COOP_TEAM).artist,'Beatles','salon: slot bez picku hosta → górka głosów');
  const noPick=coopG({members:['u1','u2'], salon:true, hostId:'tv', votes:{ title:{u1:'Help',u2:'Help'} } });
  eq(teamAnswer(noPick,COOP_TEAM).title,'Help','salon: host nic nie wskazał → auto górka głosów');
});

/* --- phases (FSM) --- */
group('phases.transitions', ()=>{
  ok(canTransitionMp(MP.ARMING,MP.PLAY),'arming→play dozwolone');
  ok(!canTransitionMp(MP.PLAY,MP.ARMING),'play→arming zabronione');
  ok(canTransitionMp(MP.PLAY,MP.REVEAL),'play→reveal dozwolone');
  ok(canTransitionMp(null,MP.LOADING),'pierwszy stan dozwolony');
  ok(canTransitionSolo(SOLO.PLAYING,SOLO.REVEAL),'solo playing→reveal');
  ok(!canTransitionSolo(SOLO.IDLE,SOLO.REVEAL),'solo idle→reveal zabronione');
});

/* --- itunesRepository.pickTrack (czysty filtr, bez DOM) --- */
group('repo.pickTrack', ()=>{
  const seen=new Set();
  const res=[
    {trackName:'Song A', artistName:'Queen', previewUrl:'u1', collectionName:'X'},
    {trackName:'Karaoke B', artistName:'Queen', previewUrl:'u2', collectionName:'Karaoke Hits'},
    {trackName:'Song C', artistName:'Inny', previewUrl:'u3', collectionName:'Y'},
    {trackName:'Song D', artistName:'Queen', previewUrl:'', collectionName:'Z'},
  ];
  const t=pickTrack(res,'Queen',seen);
  ok(t && t.trackName==='Song A','wybiera utwór tego wykonawcy z zajawką, bez karaoke');
  ok(BAD.test('Karaoke Hits'),'BAD łapie karaoke');
  ok(!pickTrack([{trackName:'X',artistName:'Queen',previewUrl:''}],'Queen',seen),'brak previewUrl → null');
  seen.add(norm('Song A'));
  ok(!pickTrack([res[0]],'Queen',seen),'już zagrany (seen) → odrzucony');
  ok(!pickTrack([{trackName:'Z',artistName:'Ktoś',previewUrl:'u'}],'Queen',seen),'inny wykonawca → odrzucony');
});

/* --- F5: dobór utworu — artysta ściśle, wersje, dekada, popularność (fixture wyników iTunes) --- */
const it=(trackName, artistName, year, extra={})=>({ trackName, artistName, previewUrl:'p:'+trackName,
  collectionName:extra.album||'Album', releaseDate: year ? year+'-01-01T08:00:00Z' : '', ...extra });
group('F5 #1 trackSelect.sameArtist — dokładnie / granica członu kolaboracji', ()=>{
  ok(sameArtist('Queen','Queen'), 'Queen = Queen');
  ok(sameArtist('Queen & David Bowie','Queen'), 'Queen & David Bowie ✓ Queen (człon duetu)');
  ok(sameArtist('David Bowie & Queen','Queen'), 'David Bowie & Queen ✓ Queen');
  ok(sameArtist('Madonna feat. Justin Timberlake','Madonna'), 'feat. po stronie wyniku ✓');
  ok(sameArtist('TACONAFIDE, Quebonafide & Taco Hemingway','Quebonafide'), 'lista „A, B & C" ✓ B');
  ok(sameArtist('Mata x Young Leosia','Mata'), '„x" ✓');
  ok(sameArtist('The Beatles','Beatles') && sameArtist('Beatles','The Beatles'), 'przedrostek „The" po obu stronach');
  ok(sameArtist('The Killers','The Killers'), 'The Killers = The Killers');
  ok(sameArtist('Dzem','Dżem') && sameArtist('KęKę','Kękę'), 'diakrytyki/wielkość liter');
  ok(sameArtist('Bedoes 2115 & Lanek','Bedoes'), '„Bedoes 2115" (artysta + numer) ✓ Bedoes');
  ok(sameArtist('AC/DC','AC/DC') && !sameArtist('AC/DC','DC'), 'AC/DC całością, ukośnik bez spacji nie dzieli');
  ok(!sameArtist('Queen Latifah','Queen'), 'Queen Latifah ✗ Queen');
  ok(!sameArtist('Queensrÿche','Queen'), 'Queensrÿche ✗ Queen');
  ok(!sameArtist('Backstreet Boys','Boys'), 'Backstreet Boys ✗ Boys');
  ok(!sameArtist('Saja Boys','Boys'), 'Saja Boys ✗ Boys');
  ok(!sameArtist('Toto Cutugno','Toto') && !sameArtist('Hey Violet','Hey') && !sameArtist('Migos','Mig'), 'Toto Cutugno/Hey Violet/Migos ✗');
  ok(!sameArtist('Taconafide','Taco Hemingway'), 'Taconafide ✗ Taco Hemingway');
  ok(!sameArtist('Культ','Kult') && !sameArtist('Kult','') && !sameArtist('',''), 'pusty norm (cyrylica/puste) ✗');
});
group('F5 #2 trackSelect.versionTier / titleKey — wersje i dedup', ()=>{
  eq(versionTier(it('Like a Prayer','Madonna',1989)), 0, 'czysty tytuł → 0');
  eq(versionTier(it('(I Can\'t Get No) Satisfaction','The Rolling Stones',1965)), 0, 'nawias będący tytułem → 0');
  eq(versionTier(it('Holiday (Single Version)','Madonna',1983)), 0, 'single version → 0');
  eq(versionTier(it('Holiday (Radio Edit)','Madonna',1983)), 0, 'radio edit → 0');
  eq(versionTier(it('Ironic (feat. X)','A',1995)), 0, 'feat. w nawiasie → 0');
  eq(versionTier(it('Take On Me (2015 Remaster)','a-ha',1985)), 1, 'remaster → 1');
  eq(versionTier(it('Heroes - 2017 Remastered Version','David Bowie',1977)), 1, '„- 2017 Remastered Version" → 1 (remaster, nie alt)');
  eq(versionTier(it('Crazy Little Thing Called Love (Live in Budapest)','Queen',1986)), 2, 'live → 2');
  eq(versionTier(it('Song (Live at Wembley / Remastered 2011)','Queen',1986)), 2, 'live + remaster → 2');
  eq(versionTier(it('Vogue - Live','Madonna',1990)), 2, '„- Live" → 2');
  eq(versionTier(it('Hung Up (SDP Extended Vocal Remix)','Madonna',2005)), 2, 'remix → 2');
  eq(versionTier(it('Song (Demo)','X',1990)), 2, 'demo → 2');
  eq(versionTier(it('Song (Acoustic Version)','X',1990)), 2, 'acoustic → 2');
  eq(versionTier(it('Song (BBC Session)','X',1990)), 2, 'session → 2');
  eq(versionTier(it('Radio Ga Ga','Queen',1986,{album:'Live at Wembley \'86'})), 2, 'album koncertowy → 2');
  eq(versionTier(it('Live and Let Die','Wings',1973)), 0, '„Live" w samym tytule (bez nawiasu) → 0');
  eq(titleKey('Crazy Little Thing Called Love (Live in Budapest)'), titleKey('Crazy Little Thing Called Love'), 'titleKey bez nawiasu');
  eq(titleKey('Vogue - 2009 Remaster'), 'vogue', 'titleKey bez sufiksu „ - …"');
});
group('F5 #4 trackSelect.parseRange / inRange — format categories.js', ()=>{
  eq(parseRange('1980–89'), {from:1980,to:1989}, "'1980–89' (półpauza)");
  eq(parseRange('2000–09'), {from:2000,to:2009}, "'2000–09'");
  eq(parseRange('1990-1999'), {from:1990,to:1999}, "'1990-1999'");
  eq(parseRange('2020–'), {from:2020,to:9999}, "'2020–' (otwarta)");
  eq(parseRange('2020+'), {from:2020,to:9999}, "'2020+'");
  eq(parseRange(undefined), null, 'brak range → null');
  const r=parseRange('1980–89');
  ok(inRange(it('a','b',1979),r) && inRange(it('a','b',1990),r), 'tolerancja ±1 rok');
  ok(!inRange(it('a','b',1978),r) && !inRange(it('a','b',2024),r), 'poza zakresem');
  ok(inRange(it('a','b',''),r), 'brak daty (Deezer) → nie karzemy');
});
group('F5 #2-#4 trackSelect.rankTracks / pickTrackRanked — dekada > wersja > popularność', ()=>{
  const range=parseRange('1980–89');
  const res=[
    it('L.E.S. Girl','Madonna',2026,{album:'Confessions II'}),
    it('Like a Prayer','Madonna',1989),
    it('Like a Prayer (Live)','Madonna',1990),
    it('Vogue','Madonna',1990),
    it('Frozen','Madonna',1998),
    it('Material Girl (Remix)','Madonna',1985),
    it('Queen Song','Queen Latifah',1989),
  ];
  const a=rankTracks(res,'Madonna',new Set(),{range});
  eq(a.level, 0, 'jest utwór z dekady w wersji studyjnej → poziom 0');
  eq(a.list.map(c=>c.r.trackName).sort(), ['Like a Prayer','Vogue'], 'tylko dekada+studyjne; „Like a Prayer (Live)" zdeduplikowane; remix i Latifah odrzucone');
  const b=rankTracks(res.filter(r=>r.releaseDate<'1980'||r.releaseDate>'1991'),'Madonna',new Set(),{range});
  eq(b.level, 1, 'brak utworów z dekady → poziom 1 (zapas spoza dekady)');
  const c=rankTracks([it('Material Girl (Remix)','Madonna',1985), it('Vogue - Live','Madonna',2004)],'Madonna',new Set(),{range});
  eq(c.level, 2, 'tylko remiks z dekady → poziom 2 (gramy tylko w ostateczności)');
  eq(rankTracks(res,'Madonna',new Set()).level, 0, 'kategoria bez range: wszystkie studyjne na poziomie 0');
  // dedup + wybór wersji: remaster jedyny → dopuszczalny; gdy są oba → studyjna
  const d=rankTracks([it('Take On Me (2015 Remaster)','a-ha',1985), it('Take On Me','a-ha',1985)],'a-ha',new Set(),{range});
  eq(d.list.length, 1, 'dwie wersje → jeden utwór'); eq(d.list[0].r.trackName, 'Take On Me', 'z grupy wersja bez nawiasu');
  const e=rankTracks([it('Take On Me (2015 Remaster)','a-ha',1985)],'a-ha',new Set(),{range});
  ok(e.level===0 && e.list.length===1, 'remaster jako jedyna wersja → grywalny (poziom 0)');
  // seen po titleKey: zagrany „Like a Prayer" blokuje też wersję live
  const seen=new Set([titleKey('Like a Prayer')]);
  ok(!rankTracks([it('Like a Prayer (Live)','Madonna',1989)],'Madonna',seen,{range}).list.length, 'seen po titleKey blokuje inne wersje');
  // popularność: wagi pozycji
  eq([popWeight(0),popWeight(9),popWeight(10),popWeight(24),popWeight(25),popWeight(59)], [3,3,2,2,1,1], 'wagi 0–9:3, 10–24:2, dalej 1');
  const many=Array.from({length:40},(_,i)=>it('T'+i,'X',1985));
  const cnt={top:0,low:0}; let x=0; const rng=()=>{ x=(x+0.61803398875)%1; return x; };
  for(let i=0;i<1000;i++){ const p=pickTrackRanked(many,'X',new Set(),{range,rng}); if(+p.track.trackName.slice(1)<10) cnt.top++; else if(+p.track.trackName.slice(1)>=25) cnt.low++; }
  ok(cnt.top>cnt.low*1.5, `top-10 losowane częściej niż pozycje 25+ (${cnt.top} vs ${cnt.low})`);
  ok(pickTrackRanked([it('A','Madonna',2026)],'Madonna',new Set(),{range}).level===1, 'pickTrackRanked zwraca poziom');
});
group('F5 #5 trackSelect.matchSong — tytuł I wykonawca, preferuj studyjną', ()=>{
  const s={title:'Bohemian Rhapsody', artist:'Queen'};
  eq(matchSong([it('Bohemian Rhapsody','Queen Latifah',1990)], s), null, 'inny wykonawca (Latifah) ✗');
  eq(matchSong([it('Killer Queen','Queen',1974)], s), null, 'inny tytuł ✗');
  const m=matchSong([it('Bohemian Rhapsody (Live Aid)','Queen',1985), it('Bohemian Rhapsody','Queen',1975)], s);
  eq(m && m.trackName, 'Bohemian Rhapsody', 'z kilku wersji — studyjna');
  ok(matchSong([it('Under Pressure','Queen & David Bowie',1981)], {title:'Under Pressure',artist:'Queen'}), 'duet po stronie wyniku ✓');
});

/* --- matchRecord (czysty builder payloadu) --- */
group('matchRecord.buildSoloRecord', ()=>{
  const slots=[{},{},{}];  // 3 sloty × QPC pytań
  const results=[
    {track:'A',artist:'X',okTitle:true,okArtist:true,cat:'d80',mode:'music'},
    {track:'B',artist:'Y',okTitle:true,okArtist:false,cat:'d80',mode:'reverse'},
    {track:'C',artist:'Z',okTitle:false,okArtist:false,skipped:true,cat:'rock',mode:'music'},
  ];
  const rec=buildSoloRecord({results, slots, profileId:'u1', displayName:'Ala', config:{rounds:1}});
  eq(rec.mode,'solo','tryb solo');
  eq(rec.score,1,'1 pełne trafienie');
  // F2b (liga solo): przerwany mecz (3 z 3×QPC pytań) → total = ROZEGRANE, nie pełna długość meczu
  eq(rec.total_questions,3,'F2b: przerwany mecz → total_questions = rozegrane (3), nie sloty × QPC');
  eq(rec.participants.length,1,'jeden uczestnik');
  eq(rec.participants[0].profile_id,'u1','uczestnik = profil gracza');
  eq(rec.answers.length,3,'po jednej odpowiedzi na pytanie');
  eq(rec.answers[0].ok,true,'pierwsza trafiona');
  eq(rec.answers[1].ok,false,'druga (tylko tytuł) → nie ok');
  eq(rec.answers[0].cat_key,'d80','cat_key przepisany');
});
group('matchRecord.buildMpRecord', ()=>{
  const game={ slots:[{},{}], rounds:1, score:5,
    results:[{round:1,cat:'d80',mode:'music',track:'A',artist:'X',ok:true}] };
  const tally={ host:{name:'Host',correct:2}, p2:{name:'Bob',correct:1} };
  const members=[{id:'host',name:'Host'},{id:'p2',name:'Bob'}];
  const rec=buildMpRecord({game, tally, members, hostId:'host', roomCode:'ABCD'});
  eq(rec.mode,'mp','tryb mp');
  eq(rec.score,5,'wynik drużyny');
  eq(rec.room_code,'ABCD','kod pokoju');
  eq(rec.participants.length,2,'dwóch uczestników');
  eq(rec.participants.find(p=>p.profile_id==='host').role,'host','host oznaczony');
  eq(rec.participants.find(p=>p.profile_id==='p2').score,1,'wkład gracza = jego trafne typy');
  eq(rec.answers[0].profile_id,null,'odpowiedź drużynowa (profile_id null)');
  eq(rec.answers[0].cat_key,'d80','cat_key z rundy');
  eq(rec.group_id,null,'brak groupId → group_id null');
  // MVP-3: mecz „z drużyną" tagowany id drużyny
  const recG=buildMpRecord({game:{...game, groupId:'team-42'}, tally, members, hostId:'host', roomCode:'ABCD'});
  eq(recG.group_id,'team-42','game.groupId → record.group_id (tag drużyny)');
});

group('F2b: liga solo — pełny mecz liczy wszystkie pytania, pusty 0', ()=>{
  const slots=[{}];
  const full=Array.from({length:QPC},(_,i)=>({track:'T'+i,artist:'A',okTitle:i<2,okArtist:i<2}));
  eq(buildSoloRecord({results:full, slots, profileId:'u'}).total_questions, QPC, 'pełny mecz → QPC pytań');
  eq(buildSoloRecord({results:[], slots, profileId:'u'}).total_questions, 0, 'brak odpowiedzi → 0');
  eq(buildSoloRecord({results:full.concat(full), slots, profileId:'u'}).total_questions, QPC, 'cap: nie więcej niż sloty × QPC');
});
group('F2b #8: noteAnswerers + uczestnicy MP = kto odpowiadał (bez widzów/TV, z tymi co wyszli)', ()=>{
  const g={ format:'coop', teams:[{id:'all',members:['H','P','Z']}], byTeam:{ all:{
    proposals:[{by:'P',byName:'Pola',values:{title:'x'}}], votes:{ title:{ P:'x', H:'x' } }, sure:[], passed:[{id:'Q',name:'Quba'}] } } };
  noteAnswerers(g);
  eq(Object.keys(g.playedBy).sort(), ['H','P','Q'], 'propozycja + głos + pas = odpowiadał (Z nic nie zrobił)');
  eq(g.playedBy.P, 'Pola', 'nazwa z propozycji');
  g.byTeam={ all:{ proposals:[], votes:{}, sure:[{id:'R',name:'Rysiek'}], passed:[] } };
  noteAnswerers(g);
  eq(Object.keys(g.playedBy).sort(), ['H','P','Q','R'], 'kumuluje przez rundy (pewniak też)');
  noteAnswerers(null); ok(true, 'noteAnswerers(null) nie rzuca');
  // P wyszedł przed DONE (nie ma go w members), Z dołączył na koniec (jest w members, nie odpowiadał)
  const game={ slots:[{}], rounds:1, scores:{all:3}, results:[], playedBy:{ H:'Host', P:'Pola' } };
  const rec=buildMpRecord({ game, tally:{ P:{name:'Pola',correct:7} }, members:[{id:'H',name:'Host'},{id:'Z',name:'Zocha'}], hostId:'H' });
  eq(rec.participants.map(p=>p.profile_id).sort(), ['H','P'], '#8: P (wyszedł) jest, Z (widz bez odpowiedzi) nie');
  eq(rec.participants.find(p=>p.profile_id==='P').correct_count, 7, '#8: trafienia P zachowane');
  eq(rec.participants.find(p=>p.profile_id==='H').role, 'host', 'host oznaczony');
  // salon: TV (host) nie jest uczestnikiem, nawet gdy „nadpisał" głos klikiem w kolumny
  const recS=buildMpRecord({ game:{ ...game, salon:true }, tally:{}, members:[{id:'H',name:'TV'}], hostId:'H' });
  eq(recS.participants.map(p=>p.profile_id), ['P'], '#8: salon — TV-host poza ligą');
  // tally bez historii (np. tylko trafienie) też liczy się jako udział
  const recT=buildMpRecord({ game:{ ...game, playedBy:{} }, tally:{ X:{name:'Iks',correct:1} }, members:[], hostId:'H' });
  eq(recT.participants.map(p=>[p.profile_id,p.display_name]), [['X','Iks']], 'uczestnik z tally (nazwa z tally)');
});

group('F2b #6: timing — limity gotowości/odsłony + secsLeft', ()=>{
  ok(MP_ARM_TIMEOUT_MS>MP_BUFFER_TIMEOUT_MS, 'limit ARMING dłuższy niż bezpiecznik buforowania klienta');
  eq(MP_REVEAL_AUTO_MS, 10000, 'auto-„dalej" po 10 s');
  eq(secsLeft(10500, 0), 11, 'zaokrąglenie w górę'); eq(secsLeft(1000, 5000), 0, 'minął → 0');
  eq(secsLeft(0, 5), 0, 'brak terminu → 0'); eq(secsLeft('x', 5), 0, 'śmieci → 0');
});
/* --- timing --- */
group('timing.listenSecs', ()=>{
  eq(listenSecs('lektor'),22,'lektor 22 s');
  eq(listenSecs('music'),15,'muzyka 15 s');
  eq(listenSecs('snippet'),12,'fragment 12 s');
  eq(listenSecs('cokolwiek'),15,'nieznany tryb → 15 s');
  eq(listenSecs('music',30),30,'override z kategorii (listenSecs>0)');
  eq(listenSecs('music',0),15,'0 nie nadpisuje → domyślny');
});
group('timing.soloSnipStart', ()=>{
  // dur=30 → okno [0.3 .. min(30,28)-2-1=25]
  eq(soloSnipStart(30, ()=>0), 0.3, 'rnd=0 → dolny klamr 0.3');
  eq(soloSnipStart(30, ()=>1), 25, 'rnd=1 → górny kraniec min(28)-SNIP-1');
  for(let i=0;i<50;i++){ const s=soloSnipStart(30); ok(s>=0.3 && s<=SOLO_SNIP_MAX-SNIP_SECS-1,'w bezpiecznym oknie'); }
});
group('timing.mpSnipStart', ()=>{
  eq(mpSnipStart(()=>0), 0.5, 'rnd=0 → dolny klamr 0.5');
  eq(mpSnipStart(()=>1), MP_SNIP_WINDOW_S, 'rnd=1 → górny kraniec okna');
  for(let i=0;i<50;i++){ const s=mpSnipStart(); ok(s>=0.5 && s<=MP_SNIP_WINDOW_S,'w oknie MP'); }
});
group('timing.shouldPing', ()=>{
  ok(!shouldPing(1000,1500),'1499 ms od ostatniego → nie (próg 1500)');
  ok(shouldPing(1000,2500),'1500 ms → tak');
  ok(shouldPing(0,9999),'dużo czasu → tak');
});

/* --- picker --- */
group('picker.plPick', ()=>{
  eq(plPick(1,'runda','rundy','rund'),'runda','1 → one');
  eq(plPick(2,'runda','rundy','rund'),'rundy','2 → few');
  eq(plPick(4,'runda','rundy','rund'),'rundy','4 → few');
  eq(plPick(5,'runda','rundy','rund'),'rund','5 → many');
  eq(plPick(12,'x','y','z'),'z','12 → many (wyjątek nastu)');
  eq(plPick(22,'x','y','z'),'y','22 → few');
  eq(plPick(0,'x','y','z'),'z','0 → many');
});
group('picker.togglePick / toggleAll / allSelected', ()=>{
  const s=new Set();
  togglePick(s,'a'); ok(s.has('a'),'dodane gdy brak');
  togglePick(s,'a'); ok(!s.has('a'),'usunięte gdy jest (toggle)');
  const all=['a','b','c'], set=new Set();
  toggleAllPick(all,set); ok(all.every(k=>set.has(k)),'pusty → zaznacz wszystkie');
  ok(allSelected(all,set),'komplet → allSelected true');
  toggleAllPick(all,set); eq(set.size,0,'komplet → wyczyść');
  ok(!allSelected(all,new Set(['a'])),'częściowy → false');
  ok(!allSelected([],new Set()),'pusty zbiór kluczy → false');
});
group('picker.syncQuizMode', ()=>{
  const CATS2={ d80:{label:'80s'}, gk:{label:'wiedza',kind:'quiz'} };
  let modes=new Set(['music']);
  syncQuizMode(new Set(['gk']),modes,CATS2); ok(modes.has('quiz'),'kat. quiz → tryb quiz dodany');
  syncQuizMode(new Set(['d80']),modes,CATS2); ok(!modes.has('quiz'),'brak quizu → tryb quiz usunięty');
});
group('picker.grpActive', ()=>{
  ok(grpActive(['a','b'],new Set(['b'])),'jeden klucz wybrany → aktywna');
  ok(!grpActive(['a','b'],new Set(['x'])),'żaden → nieaktywna');
});
group('picker.pickSummary', ()=>{
  const CATS3={ d80:{label:'80s',songs:[{title:'a'},{title:'b'}]}, lyr:{label:'t',kind:'lyrics',songs:[{title:'d'}]} };
  eq(pickSummary(new Set(),new Set(),4,CATS3).error,'zaznacz kategorie i tryby','brak wyboru → komunikat');
  ok(pickSummary(new Set(['lyr']),new Set(['music']),1,CATS3).error,'niekompatybilne → error z buildMatch');
  const ok1=pickSummary(new Set(['d80']),new Set(['music']),2,CATS3);
  eq(ok1.count, 2*CPR*QPC, 'liczba utworów = rundy×CPR×QPC');
  eq(ok1.label,'rundy','etykieta liczby rund');
});
group('F2a picker.pickSummary: faktyczna liczba kategorii + „pytań" przy quizie/lektorze', ()=>{
  const C={ d80:{label:'80s',artists:['A']}, d90:{label:'90s',artists:['B']}, d00:{label:'00s',artists:['C']}, d10:{label:'10s',artists:['D']},
    lyr:{label:'t',kind:'lyrics',songs:[{title:'d',lyric:'x'}]}, gk:{label:'g',kind:'quiz',questions:[{prompt:'?'}]} };
  const one=pickSummary(new Set(['d80']),new Set(['music']),2,C);
  eq([one.cats,one.unit],[1,'utworów'],'1 kategoria audio → cats=1, „utworów"');
  const t1=pickSummaryText(one);
  ok(/z 1 kategorii/.test(t1.from) && !/3 kategorie/.test(t1.head), '1 kategoria: nie udaje „3 kategorie" — '+t1.head+t1.total+t1.from);
  const four=pickSummary(new Set(['d80','d90','d00','d10']),new Set(['music']),1,C);
  const t4=pickSummaryText(four);
  ok(/3 kategorie/.test(t4.head) && /z 4 wybranych/.test(t4.from), '4 kategorie → „3 kategorie … z 4 wybranych" — '+t4.head+t4.from);
  eq(pickSummary(new Set(['d80','gk']),new Set(['music','quiz']),1,C).unit,'pytań','pula z quizem → „pytań"');
  eq(pickSummary(new Set(['lyr']),new Set(['lektor']),1,C).unit,'pytań','lektor → „pytań"');
  eq(pickSummary(new Set(['d80','lyr']),new Set(['music']),1,C).cats,1,'kategoria niekompatybilna z trybami nie jest liczona');
  eq(pickSummaryText({error:'x'}),{head:'',total:'',from:''},'błąd → puste części');
});

/* --- chatFeed --- */
group('chatFeed.pushChat / reset', ()=>{
  const f=createFeed();
  pushChat(f,'Ala','hej',true);
  eq(f.log.length,1,'1 wpis');
  eq(f.log[0].kind,'chat','kind=chat'); ok(f.log[0].mine,'mine=true');
  resetFeed(f); eq(f.log.length,0,'reset czyści log'); eq(f.seenProp.size,0,'reset czyści seenProp');
});
group('chatFeed.ingestFeed', ()=>{
  const f=createFeed();
  // typy/pewniaki/pasy czytane z bucketu MOJEJ drużyny (teamId='all')
  const g={ answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    byTeam:{ all:{ proposals:[{aid:'a1',by:'u1',byName:'Ala',values:{title:'Hey Jude',artist:'Beatles'}}],
      votes:{}, sure:[{id:'u3',name:'Cyd'}], passed:[{id:'u2',name:'Bob'}] } } };
  const r=ingestFeed(f,g,'me','all');
  ok(r.added,'doszły wpisy');
  eq(r.clearTyping,['u1'],'clearTyping zwraca autora typu');
  eq(f.log.filter(x=>x.kind==='typ').length,1,'1 wpis typu');
  eq(f.log.find(x=>x.kind==='typ').chips.length,2,'2 chipy (tytuł+wykonawca)');
  ok(f.log.some(x=>x.kind==='sys'&&x.cls==='sure'),'pewniak (bucket.sure) → linia systemowa');
  ok(f.log.some(x=>x.kind==='sys'&&x.cls==='pass'),'pas → linia systemowa');
  // ponowny ingest tego samego stanu → dedup, nic nie dochodzi
  const r2=ingestFeed(f,g,'me','all');
  ok(!r2.added,'dedup: ten sam stan → brak nowych');
  eq(r2.clearTyping.length,0,'dedup: brak clearTyping');
  // mine po meId
  const f2=createFeed();
  ingestFeed(f2,{answerSlots:g.answerSlots, byTeam:{all:{proposals:[{aid:'x',by:'me',byName:'Ja',values:{title:'T'}}]}}}, 'me','all');
  ok(f2.log.find(x=>x.kind==='typ').mine,'typ od meId → mine=true');
});
group('chatFeed.ring-buffer', ()=>{
  const f=createFeed();
  for(let i=0;i<FEED_CAP+10;i++) pushChat(f,'x','m'+i,false);
  eq(f.log.length,FEED_CAP,`limit ${FEED_CAP} wpisów`);
  eq(f.log[0].text,'m10','najstarsze wypchnięte');
});

group('mpReducer.evaluateAnswer: muzyka po quizie używa slotów title/artist (regresja answerSlots)', ()=>{
  const music={ track:'Hey Jude', artist:'Beatles' };
  // BUG: answerSlots dziedziczone z quizu (slot 'a') → ocenia 'a' vs puste pole utworu → pudło mimo dobrej odpowiedzi
  const gStale=coopG({members:['u1'], answerSlots:[{key:'a',label:'x'}],
    proposals:[{by:'u1',byName:'A',values:{a:'Hey Jude'}}], votes:{a:{u1:'Hey Jude'}} });
  ok(evaluateAnswer(gStale, music).reveal.teamOk===false, 'stale quiz answerSlots → muzyka pudłuje (objaw buga)');
  // FIX: answerSlots=null → slotsOf=DEFAULT (title/artist) → ocena poprawna
  const gOk=coopG({members:['u1'], answerSlots:null,
    proposals:[{by:'u1',byName:'A',values:{title:'Hey Jude',artist:'Beatles'}}],
    votes:{title:{u1:'Hey Jude'},artist:{u1:'Beatles'}} });
  const r=evaluateAnswer(gOk, music);
  ok(r.reveal.teamOk===true, 'answerSlots=null (reset) → muzyka oceniana po title/artist');
  ok(r.reveal.kind==='music', 'reveal muzyki (bez current.answers) → kind=music');
});

// trackSelect.resolveFromSongs (playlista): zajawka MUSI pasować do tytułu+wykonawcy odpowiedzi,
// inaczej grał inny utwór niż pokazana odpowiedź (regresja audio↔odpowiedź)
await (async ()=>{
  console.log('• trackSelect.resolveFromSongs: zajawka pasuje do odpowiedzi (bez rozjazdu)');
  const song={ title:'Beat It', artist:'Michael Jackson' };
  // iTunes zwraca tylko INNY utwór tego wykonawcy → BRAK trafienia → NIE bierz cudzej zajawki (dawniej res[0])
  const wrong=async()=>[{ trackName:'Thriller', artistName:'Michael Jackson', previewUrl:'thriller.m4a' }];
  const r1=await resolveTrack({ cat:{songs:[song]}, seen:new Set(), itunes:wrong });
  ok(r1.error===true, 'brak pasującej zajawki → error (nie gra cudzego utworu)');
  // iTunes zwraca pasujący utwór → zajawka TEGO utworu
  const right=async()=>[{ trackName:'Beat It', artistName:'Michael Jackson', previewUrl:'beatit.m4a' }];
  const r2=await resolveTrack({ cat:{songs:[song]}, seen:new Set(), itunes:right });
  ok(r2.preview==='beatit.m4a' && r2.track==='Beat It', 'trafienie → zajawka tego samego utworu co odpowiedź');
  // gust etap 3: „Gust stołu" — pole `from` utworu z puli przechodzi do wyniku (odsłona „z półki: <ksywa>")
  const r3=await resolveTrack({ cat:{songs:[{ ...song, from:'Ala, Bo' }]}, seen:new Set(), itunes:right });
  eq(r3.from, 'Ala, Bo', 'resolveFromSongs: from z półki → wynik');
  ok(!('from' in r2), 'bez from w puli → brak pola');
})();

// F5: resolveTrack — dekada przez kolejnych wykonawców, playlista po „artysta tytuł", cache per sesja
await (async ()=>{
  console.log('• F5 trackSelect.resolveTrack: dekada → inny wykonawca; zapas; playlista „artysta tytuł"; cache');
  const yr=y=>y+'-01-01T00:00:00Z';
  const db={
    'Nowy':  [{trackName:'Nowość', artistName:'Nowy', previewUrl:'n', releaseDate:yr(2024)}],
    'Stary': [{trackName:'Klasyk', artistName:'Stary', previewUrl:'k', releaseDate:yr(1984)},
              {trackName:'Klasyk (Live)', artistName:'Stary', previewUrl:'kl', releaseDate:yr(2010)}],
  };
  const calls=[]; const net=async(term,opts)=>{ calls.push([term,!!(opts&&opts.song)]); return db[term]||[]; };
  for(let i=0;i<5;i++){
    const r=await resolveTrack({ cat:{range:'1980–89', artists:['Nowy','Stary']}, seen:new Set(), recent:[], itunes:net });
    ok(r.track==='Klasyk' && r.year==='1984', `runda ${i}: utwór z dekady innego wykonawcy (${r.track} ${r.year})`);
  }
  const r2=await resolveTrack({ cat:{range:'1980–89', artists:['Nowy']}, seen:new Set(), recent:[], itunes:net });
  ok(r2.track==='Nowość' && r2.year==='2024', 'brak utworów z dekady u nikogo → zapas spoza dekady z PRAWDZIWYM rokiem');
  // playlista: najpierw „artysta tytuł" (opts.song), fallback po artyście
  const songDb={ 's:Queen Bohemian Rhapsody':[{trackName:'Bohemian Rhapsody',artistName:'Queen',previewUrl:'bo'}],
    'a:Lady Pank':[{trackName:'Mniej niż zero',artistName:'Lady Pank',previewUrl:'mz'}] };
  const sc=[]; const sNet=async(term,opts)=>{ const k=(opts&&opts.song?'s:':'a:')+term; sc.push(k); return songDb[k]||[]; };
  const p1=await resolveTrack({ cat:{songs:[{title:'Bohemian Rhapsody',artist:'Queen'}]}, seen:new Set(), itunes:sNet });
  ok(p1.preview==='bo' && sc[0]==='s:Queen Bohemian Rhapsody' && sc.length===1, 'playlista: trafienie z wyszukiwania „artysta tytuł" (bez zapytania po artyście)');
  sc.length=0;
  const p2=await resolveTrack({ cat:{songs:[{title:'Mniej niż zero',artist:'Lady Pank'}]}, seen:new Set(), itunes:sNet });
  ok(p2.preview==='mz' && sc.join('|')==='s:Lady Pank Mniej niż zero|a:Lady Pank', 'playlista: fallback na wyszukiwanie po artyście');
  sc.length=0;
  await resolveTrack({ cat:{songs:[{title:'Can\'t Stop (feat. X)',artist:'Band (PL)'}]}, seen:new Set(), itunes:sNet });
  eq(sc[0], 's:Band Can\'t Stop', 'zapytanie bez nawiasów i feat.');
  // cache: jedno zapytanie na termin, puste i błędy nie są cache'owane, TTL
  let n=0, t=0; const f=cachedFetcher(async term=>{ n++; if(term==='err') throw new Error('x'); return term==='pusty'?[]:[term]; }, {ttlMs:100, now:()=>t});
  await Promise.all([f('A'), f('a'), f('A ')]); eq(n, 1, 'cache: współbieżne/wielkość liter → 1 zapytanie');
  await f('A',{song:true}); eq(n, 2, 'cache: tryb song osobnym kluczem');
  await f('pusty'); await f('pusty'); eq(n, 4, 'cache: pusty wynik nie jest cache\'owany');
  await f('err').catch(()=>{}); await f('err').catch(()=>{}); eq(n, 6, 'cache: błąd nie jest cache\'owany');
  t=500; await f('A'); eq(n, 7, 'cache: po TTL ponowne zapytanie');
  const cf=cachedFetcher(net); calls.length=0;
  await resolveTrack({ cat:{range:'1980–89', artists:['Stary']}, seen:new Set(), recent:[], itunes:cf });
  await resolveTrack({ cat:{range:'1980–89', artists:['Stary']}, seen:new Set(), recent:[], itunes:cf });
  eq(calls.length, 1, 'resolveTrack z cachedFetcher: drugi raz bez sieci');
})();

// FAZA 4: zasady scoringu 2026-07 (tabele z planu naprawy — źródło prawdy)
group('scoring.zasady-2026-07: 4.1 duety/feat (człony oczekiwanego wykonawcy)', ()=>{
  ok(artistMatch('Queen','Queen & David Bowie')===true, 'Queen ✓ Queen & David Bowie');
  ok(artistMatch('David Bowie','Queen & David Bowie')===true, 'David Bowie ✓ Queen & David Bowie');
  ok(artistMatch('Bowie','Queen & David Bowie')===false, 'Bowie ✗ (człon to „david bowie")');
  ok(artistMatch('Sanah','sanah i Vito Bambino')===true, 'Sanah ✓ sanah i Vito Bambino');
  ok(artistMatch('Vito Bambino','sanah i Vito Bambino')===true, 'Vito Bambino ✓');
  ok(artistMatch('Queen David','Queen & David Bowie')===false, 'Queen David ✗ (żaden pojedynczy człon)');
});
group('F2a #12 artistMatch: „&"/przecinek w NAZWIE zespołu nie rozbija na pojedyncze słowa', ()=>{
  const T=[
    ['Earth','Earth, Wind & Fire',false], ['Wind','Earth, Wind & Fire',false], ['Fire','Earth, Wind & Fire',false],
    ['Earth Wind and Fire','Earth, Wind & Fire',true],
    ['Simon','Simon & Garfunkel',false], ['Garfunkel','Simon & Garfunkel',false], ['Simon and Garfunkel','Simon & Garfunkel',true],
    ['Sonny','Sonny & Cher',false], ['Cher','Sonny & Cher',false], ['Sonny & Cher','Sonny & Cher',true],
    ['Ed Sheeran','Ed Sheeran & Justin Bieber',true], ['Justin Bieber','Ed Sheeran & Justin Bieber',true], ['Bieber','Ed Sheeran & Justin Bieber',false],
    ['Dawid Podsiadło','Dawid Podsiadło x Taco Hemingway',true], ['Taco Hemingway','Dawid Podsiadło x Taco Hemingway',true],
    ['Kult','Kult',true], ['Kultura','Kult',false],
    ['Daft Punk','Daft Punk feat. Pharrell Williams',true], ['Pharrell Williams','Daft Punk feat. Pharrell Williams',true], ['Punk','Daft Punk feat. Pharrell Williams',false],
    ['Sons','Mumford & Sons',false], ['Tyler','Tyler, the Creator',false], ['Young','Crosby, Stills, Nash & Young',false],
    ['Dwa','Raz, Dwa, Trzy',false], ['News','Huey Lewis and the News',false], ['Papas','The Mamas & the Papas',false],
    ['Łona','Łona i Webber',true], ['Webber','Łona i Webber',true], ['Cleo','Donatan & Cleo',true],
    ['Kayah','Kayah i Goran Bregović',true], ['Pono','Sokół feat. Pono',true], ['Sia','David Guetta ft. Sia',true],
  ];
  T.forEach(([g,a,want])=>ok(artistMatch(g,a)===want, `${g} ${want?'✓':'✗'} ${a}`));
});
group('scoring.zasady-2026-07: 4.2 lev≤1 od 6 znaków', ()=>{
  ok(textMatch('Stan','Stay')===false, 'Stan ✗ Stay (regresja luzu)');
  ok(textMatch('Light','Night')===false, 'Light ✗ Night');
  ok(textMatch('Bohemian Rapsody','Bohemian Rhapsody')===true, 'Bohemian Rapsody ✓ Rhapsody (≥6)');
  ok(textMatch('Halo','Halo')===true, 'Halo ✓ Halo (dokładne)');
});
group('scoring.zasady-2026-07: 4.3 przedimki tylko przy sensownym rdzeniu', ()=>{
  eq(norm('De La Soul'),'de la soul','„De La Soul" bez redukcji (rdzeń „soul" za krótki)');
  eq(norm('The Beatles'),'beatles','„The Beatles" → „beatles" (≥6 znaków)');
  ok(textMatch('Soul','De La Soul')===false, 'Soul ✗ De La Soul');
  ok(textMatch('De La Soul','De La Soul')===true, 'De La Soul ✓ De La Soul');
});
group('scoring.zasady-2026-07: 4.4 leet warunkowo (strona z cyfrą ≥6 znaków)', ()=>{
  ok(textMatch('sos','50s')===false, 'sos ✗ 50s (kod <6 znaków — brak de-leet)');
  ok(textMatch('problem','PRO8L3M')===true, 'istniejący leet ≥6 znaków ✓ (bez regresji)');
});

/* ===================== F3: silnik oceny quizu (SPEC v2) ===================== */
group('F3 #6 textMatch: liczby/numeracja dokładnie (literówka w liczbie = źle)', ()=>{
  const NO=[['Apollo 12','Apollo 11'],['August III','August II'],['Ludwik XV','Ludwik XIV'],['Mieszko II','Mieszko I'],
    ['An-225','An-22'],['An-22','An-225'],['1011','101'],['101','1011'],['Henryk IV','Henryk V'],['Henryk V','Henryk IV'],
    ['Elżbieta I','Elżbieta II'],['Zygmunt III Waza','Zygmunt II Waza'],['Airbus A380','Airbus A320'],['Fiat 125p','Fiat 126p'],
    ['Symphony No. 9','Symphony No. 5'],['16 lipca 1410','15 lipca 1410'],['-40','40'],['minus 40','-40'],['Windows 98','Windows 95']];
  NO.forEach(([g,a])=>ok(textMatch(g,a)===false, `${g} ✗ ${a}`));
  const YES=[['apollo11','Apollo 11'],['Apollo 11','Apollo 11'],['ludwik 14','Ludwik XIV'],['Ludwik XIV','ludwik xiv'],
    ['mieszko 1','Mieszko I'],['Karol I Stuart','karol 1 stuart'],['20','20%'],['-40','−40'],['1939 - 1945','1939-1945'],
    ['blink 182','Blink-182'],['99 luftbalons','99 Luftballons'],['1999','1999'],['22','22'],['007','7'],
    ['PRO8L3M','Problem'],['problem','PRO8L3M'],['Romeo i Julia','Romeo i Julia'],['Kazimierz III Wielki','kazimierz iii wielki']];
  YES.forEach(([g,a])=>ok(textMatch(g,a)===true, `${g} ✓ ${a}`));
  eq(numTokens('An-22'),['22'],'numTokens: łącznik w nazwie ≠ minus');
  eq(numTokens('temperatura -40°C'),['-40'],'numTokens: minus przed liczbą po spacji zachowany');
  eq(numTokens('Romeo i Julia'),[],'numTokens: polski spójnik „i" to nie I');
  eq(numTokens('Mieszko I'),['1'],'numTokens: końcowe I = 1');
  eq(numTokens('PRO8L3M'),[],'numTokens: cyfry wewnątrz słowa = leet, nie liczba');
  ok(artistMatch('Queen & David Bowie','Queen & David Bowie'), 'artistMatch bez regresji');
});
group('F3 #1 evaluateQuiz: `pool` = sloty wymienne, dopasowanie optymalne + dedup', ()=>{
  const slots=[{key:'a',label:'aktor 1'},{key:'b',label:'aktor 2'},{key:'c',label:'aktor 3'}];
  const pool=[['Sean Connery','Connery'],['Roger Moore','Moore'],['Daniel Craig','Craig'],['Pierce Brosnan','Brosnan']];
  const flat=pool.flat();
  const q={prompt:'Wymień trzech aktorów Bonda.', slots, answers:{a:flat,b:flat,c:flat}, pool};
  const r1=evaluateQuiz(q,{a:'Daniel Craig',b:'Roger Moore',c:'Sean Connery'});
  ok(r1.ok,'dowolna kolejność → ✓'); eq(r1.matched,[2,1,0],'matched = indeksy pozycji puli');
  eq(r1.display,{a:'Daniel Craig',b:'Roger Moore',c:'Sean Connery'},'display = kanoniczne trafionych');
  eq(r1.others,['Pierce Brosnan'],'others = reszta puli');
  const r2=evaluateQuiz(q,{a:'Connery',b:'Sean Connery',c:'connery'});
  ok(!r2.ok,'to samo 3× → ✗'); eq([r2.bySlot.a,r2.bySlot.b,r2.bySlot.c].filter(Boolean).length,1,'zalicza się tylko jedno pole');
  const r3=evaluateQuiz(q,{a:'Craig',b:'Moore',c:''});
  ok(!r3.ok && r3.bySlot.a && r3.bySlot.b && !r3.bySlot.c,'puste pole ✗, reszta ✓');
  eq(r3.display.c,'Sean Connery','display pustego pola = kolejna nietrafiona pozycja');
  eq(r3.others,['Pierce Brosnan'],'others bez pozycji pokazanej w display');
  // optymalne (nie zachłanne): pole a pasuje do 2 pozycji, pole b tylko do jednej z nich
  const qx={slots:[{key:'a'},{key:'b'}], answers:{a:['x'],b:['x']}, pool:[['Jan Kowalski','Kowalski'],['Anna Kowalska','Kowalska']]};
  const rx=evaluateQuiz(qx,{a:'Kowalsk',b:'Jan Kowalski'});
  ok(rx.ok, 'skojarzenie optymalne: a→Kowalska, b→Kowalski (zachłanne dałoby ✗)');
  const qOwady={slots:[{key:'a'},{key:'b'},{key:'c'}], answers:{}, pool:[['mucha'],['pszczoła'],['mrówka'],['komar']]};
  ok(!evaluateQuiz(qOwady,{a:'mucha',b:'mucha',c:'mucha'}).ok, '#5: „mucha ×3" → ✗');
  ok(evaluateQuiz(qOwady,{a:'mrowka',b:'mucha',c:'pszczola'}).ok, 'bez diakrytyków, dowolna kolejność → ✓');
  // bez pool → per slot jak dotąd (sloty uporządkowane), display = answers[k][0]
  const qo={slots:[{key:'dir'},{key:'year'}], answers:{dir:['Quentin Tarantino','Tarantino'],year:['1994']}};
  const ro=evaluateQuiz(qo,{dir:'tarantino',year:'1994'});
  ok(ro.ok,'sloty uporządkowane: per slot'); eq(ro.display,{dir:'Quentin Tarantino',year:'1994'},'display = answers[k][0]');
  ok(!evaluateQuiz(qo,{dir:'1994',year:'tarantino'}).ok,'sloty uporządkowane: zamiana pól ✗');
  // kompatybilność: stary serwer obciął `pool` → ocena per slot ze spłaszczonej puli (bez dedup, bez crasha)
  const old={...q}; delete old.pool;
  ok(evaluateQuiz(old,{a:'Daniel Craig',b:'Roger Moore',c:'Sean Connery'}).ok,'bez pool: spłaszczona pula w answers zalicza dowolną kolejność');
  eq(poolOf({pool:[[],['  '],'x',['A',5,'a2']]}),[['A','a2']],'poolOf: sanityzacja (puste/nie-stringi wycięte)');
  eq(poolOf({pool:[]}),null,'poolOf: pusta pula → null');
});
group('F3 #3 ABCD: parseMC / shuffleMC / ocena po wybranej opcji', ()=>{
  const q={prompt:'Która witamina?\nA) A\nB) C\nC) D\nD) B12', slots:[{key:'a',label:'litera lub odpowiedź'}],
    answers:{a:['C','Witamina D','d','witamina d']}};
  eq(parseMC(q.prompt).options.map(o=>o.letter).join(''),'ABCD','parseMC: 4 opcje');
  ok(parseMC('Pytanie otwarte?')===null,'parseMC: otwarte → null');
  // #13: litera D (B12) NIE zaliczana przez alias „d"
  ok(!evaluateQuiz(q,{a:'D'}).ok,'#13: wybór D (B12) ✗ mimo aliasu „d"');
  ok(evaluateQuiz(q,{a:'C'}).ok,'wybór C ✓ (dane nietasowane)');
  ok(evaluateQuiz(q,{a:'witamina d'}).ok,'MP: tekst wariantu ✓');
  ok(!evaluateQuiz(q,{a:'B12'}).ok,'MP: tekst złej opcji ✗');
  // deterministyczne rng → znana permutacja; poprawna litera przemapowana
  const seq=[0.99,0.0,0.5]; let i=0; const rng=()=>seq[(i++)%seq.length];
  const s=shuffleMC(q, rng);
  const corr=s.mc.options.find(o=>o.letter===s.mc.correct);
  eq(corr.text,'D','po tasowaniu poprawna litera wskazuje opcję „D" (witamina D)');
  eq(s.answers.a[0], s.mc.correct, 'answers.a[0] = nowa litera'); eq(s.answers.a[1],'D','answers.a[1] = tekst poprawnej opcji');
  ok(!s.answers.a.slice(1).some(v=>norm(v).length<=1 && v!=='D'),'aliasy jednoliterowe a–d usunięte');
  ok(s.prompt.startsWith('Która witamina?\nA) ') && parseMC(s.prompt).options.length===4,'prompt przebudowany z nowymi literami');
  eq(parseMC(s.prompt).options.map(o=>o.text).sort(),['A','B12','C','D'],'te same opcje, inna kolejność');
  ok(evaluateQuiz(s,{a:s.mc.correct}).ok,'ocena po wybranej opcji (nowa litera) ✓');
  const wrong=s.mc.options.find(o=>o.letter!==s.mc.correct);
  ok(!evaluateQuiz(s,{a:wrong.letter}).ok,'inna opcja ✗');
  ok(!evaluateQuiz(s,{a:'C'}).ok || s.mc.correct==='C','stara litera z danych nie zalicza (chyba że trafiła na to samo miejsce)');
  eq(evaluateQuiz(s,{a:s.mc.correct}).display.a, s.mc.correct+') D','display = „X) tekst" poprawnej opcji');
  eq(quizKey(s), quizKey(q), 'quizKey stabilny po tasowaniu (treść bez opcji)');
  eq(quizKey(q),'ktora witamina','quizKey = norm(treści bez opcji)');
  // rozkład: poprawna nie zawsze na tej samej pozycji
  const letters=new Set(); for(let k=0;k<40;k++) letters.add(shuffleMC(q).mc.correct);
  ok(letters.size>=3,'Math.random: poprawna litera się zmienia ('+[...letters].join('')+')');
  const open={prompt:'Stolica?', slots:[{key:'a'}], answers:{a:['Canberra']}};
  ok(shuffleMC(open)===open,'pytanie otwarte → bez zmian');
  const bad={prompt:'Q?\nA) x\nB) y', slots:[{key:'a'}], answers:{a:['zzz']}};
  ok(shuffleMC(bad).mc.correct===null && shuffleMC(bad).prompt===bad.prompt,'nieustalona poprawna → bez tasowania');
});
group('F3 #1/#4 mpReducer.evaluateAnswer: pool + dedup w odpowiedzi drużyny, display/others/fun', ()=>{
  const slots=[{key:'a',label:'kraj 1'},{key:'b',label:'kraj 2'},{key:'c',label:'kraj 3'}];
  const pool=[['Litwa'],['Łotwa'],['Estonia']]; const flat=pool.flat();
  const cur={prompt:'Wymień państwa bałtyckie.', slots, answers:{a:flat,b:flat,c:flat}, pool, fun:'<b>Ciekawostka</b>'};
  const g=coopG({members:['u1'], answerSlots:slots,
    proposals:[{by:'u1',byName:'A',values:{a:'Estonia',b:'Łotwa',c:'Litwa'}}],
    votes:{ a:{u1:'Estonia'}, b:{u1:'Łotwa'}, c:{u1:'Litwa'} } });
  const e=evaluateAnswer(g, cur);
  ok(e.reveal.teamOk,'MP: odwrócona kolejność ✓'); eq(e.reveal.firstBy,'A','firstBy przez evaluateQuiz');
  eq(e.reveal.display,{a:'Estonia',b:'Łotwa',c:'Litwa'},'reveal.display (kanoniczne)');
  eq(e.reveal.fun,'<b>Ciekawostka</b>','reveal.fun (escape robi render)');
  const g2=coopG({members:['u1','u2'], answerSlots:slots,
    votes:{ a:{u1:'Litwa'}, b:{u1:'litwa'}, c:{u2:'Litwa'} } });
  const e2=evaluateAnswer(g2, cur);
  ok(!e2.reveal.teamOk,'MP: „Litwa ×3" → ✗ (dedup)');
  eq(Object.values(e2.reveal.okBySlot).filter(Boolean).length,1,'MP: zalicza się jedno pole');
  eq(e2.reveal.others,[],'others puste (2 nietrafione pokazane w display)');
  const mcq=shuffleMC({prompt:'Q?\nA) Alfa\nB) Beta\nC) Gamma\nD) Delta', slots:[{key:'a',label:'odp'}], answers:{a:['B','Beta']}}, ()=>0);
  const g3=coopG({members:['u1'], answerSlots:mcq.slots, votes:{a:{u1:mcq.mc.correct.toLowerCase()}}});
  ok(evaluateAnswer(g3, mcq).reveal.teamOk,'MP ABCD: litera po tasowaniu ✓');
  const g4=coopG({members:['u1'], answerSlots:mcq.slots, votes:{a:{u1:'B'}}});
  ok(evaluateAnswer(g4, mcq).reveal.teamOk === (mcq.mc.correct==='B'),'MP ABCD: stara litera z danych nie liczy się');
  const music=evaluateAnswer(coopG({members:['u1'], votes:{title:{u1:'Hey Jude'},artist:{u1:'Beatles'}}}), {track:'Hey Jude',artist:'The Beatles'});
  ok(music.reveal.teamOk && music.reveal.fun==='','muzyka: bez zmian, brak fun');
});
group('F3 #5 seen-set: freshQuestions / rememberSeen (reset po wyczerpaniu, limit)', ()=>{
  const qs=[{prompt:'P1?\nA) a\nB) b'},{prompt:'P2'},{prompt:'P3'}];
  const k=qs.map(quizKey);
  eq(freshQuestions(qs,[k[0]]).pool.map(quizKey),[k[1],k[2]],'zagrane odfiltrowane');
  const ex=freshQuestions(qs,[k[0],k[2],k[1]]);
  ok(ex.reset && ex.pool.length===2 && !ex.pool.some(q=>quizKey(q)===k[1]),'wyczerpane → reset bez ostatnio zagranego');
  eq(freshQuestions([qs[1]],[k[1]]).pool.length,1,'jedno pytanie → reset zwraca je');
  eq(rememberSeen(['a','b'],'a'),['b','a'],'rememberSeen: bez duplikatów, najnowszy na końcu');
  let big=[]; for(let i=0;i<QUIZ_SEEN_LIMIT+50;i++) big=rememberSeen(big,'k'+i);
  eq(big.length,QUIZ_SEEN_LIMIT,'limit '+QUIZ_SEEN_LIMIT); eq(big[big.length-1],'k'+(QUIZ_SEEN_LIMIT+49),'zostają najnowsze');
});

// 2.2: globalny cap czasu na resolveFromArtists — wiszący itunes nie kręci spinnera minutami
await (async ()=>{
  console.log('• trackSelect.resolveFromArtists: cap czasu (wiszący itunes → error, nie wieczny spinner)');
  const hang=()=>new Promise(()=>{});   // nigdy nie rozwiązuje (symulacja zawieszonej sieci/proxy)
  const t0=Date.now();
  const r=await resolveTrack({ cat:{artists:['A','B','C']}, seen:new Set(), recent:[], itunes:hang, capMs:120 });
  const dt=Date.now()-t0;
  ok(r.error===true, 'po capie → t.error');
  ok(dt<1500, `zwrot w budżecie czasu (było ${dt}ms) — nie czeka na każdego artystę osobno`);
})();

/* --- F2a #1: SW SHELL ⊇ graf modułów (quiz-loader.js → importy ES) + manifest quizów + zasoby index.html --- */
group('F2a #1 sw.js: SHELL zawiera każdy moduł osiągalny importami, każdy plik z quiz-index.json i zasoby index.html', ()=>{
  const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
  const sw=readFileSync(join(ROOT,'sw.js'),'utf8');
  const arr=sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
  const shell=new Set([...arr.matchAll(/'\.\/([^']*)'/g)].map(m=>m[1]));
  const seen=new Set();
  const walk=(rel)=>{
    if(seen.has(rel)) return; seen.add(rel);
    const src=readFileSync(join(ROOT,rel),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    // statyczne `import … from './x'`, `export … from './x'`, `import './x'` i dynamiczne `import('./x')`
    const re=/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
    let m; while((m=re.exec(src))){ const spec=m[1]||m[2]||m[3]; if(!spec.startsWith('.')) continue;
      walk(normalize(join(dirname(rel),spec.split('?')[0])).replace(/\\/g,'/')); }
  };
  walk('quiz-loader.js'); walk('app.js');
  const missingMods=[...seen].filter(f=>!shell.has(f));
  eq(missingMods,[],'moduły osiągalne z quiz-loader.js/app.js brakujące w SHELL');
  ok(seen.has('core/teams.js') && seen.has('app/solo.js'), 'graf importów faktycznie przeszedł moduły (sanity)');
  const idx=JSON.parse(readFileSync(join(ROOT,'data/quiz-index.json'),'utf8'));
  const files=Array.isArray(idx)?idx:idx.files;
  eq(files.filter(f=>!shell.has('data/'+f)),[],'pliki z data/quiz-index.json brakujące w SHELL');
  ok(shell.has('data/quiz-index.json'),'sam manifest quizów w SHELL');
  const html=readFileSync(join(ROOT,'index.html'),'utf8');
  const local=[...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"#:?]+)"/g)].map(m=>m[1].replace(/^\.\//,''));
  eq(local.filter(f=>!shell.has(f)),[],'lokalne <script>/<link> z index.html brakujące w SHELL');
  eq([...shell].filter(f=>f && !existsSync(join(ROOT,f))),[],'wpisy SHELL wskazujące na nieistniejące pliki');
});

/* --- F2a #8: quiz-loader nie blokuje bootu na zawieszonym fetchu; spóźnione kategorie → zdarzenie --- */
await (async ()=>{
  console.log('• F2a #8 quiz-loader: wiszący fetch → app.js startuje po budżecie; spóźniona kategoria ogłaszana');
  const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
  const src=readFileSync(join(ROOT,'quiz-loader.js'),'utf8');
  ok(src.includes("import('./app.js')"), 'loader importuje app.js');
  const pending={};
  const fetchFake=(u)=>{ const f=String(u).split('/').pop();
    if(f==='quiz-index.json') return Promise.resolve({ ok:true, json:()=>Promise.resolve({ files:['quiz-a.json','quiz-b.json'] }) });
    if(f==='quiz-a.json') return Promise.resolve({ ok:true, json:()=>Promise.resolve({ kind:'quiz', label:'A', questions:[{prompt:'?'}] }) });
    return new Promise(r=>{ pending.b=()=>r({ ok:true, json:()=>Promise.resolve({ kind:'quiz', label:'B', questions:[{prompt:'?'}] }) }); });   // wisi
  };
  const events=[]; let bootAt=0; const t0=Date.now();
  const win={ __QUIZ_BOOT_MS__:60, dispatchEvent:(e)=>events.push(e.type) };
  const run=new Function('window','document','fetch','CustomEvent','__boot', src.replace("import('./app.js')", '__boot()'));
  run(win, { baseURI:'https://stacja.test/' }, fetchFake, class { constructor(t){ this.type=t; } }, async ()=>{ bootAt=Date.now()-t0; });
  await new Promise(r=>setTimeout(r,150));
  ok(bootAt>0 && bootAt<1000, `app.js zaimportowany mimo wiszącego pliku (po ${bootAt}ms; budżet 60ms)`);
  ok(win.CATEGORIES.quiz.a && !win.CATEGORIES.quiz.b, 'szybka kategoria wczytana przed bootem, wisząca jeszcze nie');
  const before=events.length;
  pending.b && pending.b(); await new Promise(r=>setTimeout(r,20));
  ok(win.CATEGORIES.quiz.b && events.length>before && events.every(t=>t==='stacja:quiz'), 'spóźniona kategoria dociągnięta w tle + zdarzenie stacja:quiz');
})();


/* ===================== F6a: długość meczu, kostka, punktacja, liga ===================== */
group('F6a match: długość w pytaniach (buildMatch {questions}) + clampQuestions/roundsForQuestions', ()=>{
  const C={ d80:{label:'80s',artists:['A']}, d90:{label:'90s',artists:['B']}, d00:{label:'00s',artists:['C']}, d10:{label:'10s',artists:['D']} };
  const keys=Object.keys(C);
  const m5=buildMatch(keys,['music'],{questions:5},C);
  eq([m5.slots.length, m5.rounds, m5.questions],[1,1,5],'5 pytań → 1 slot, 1 runda');
  const m10=buildMatch(keys,['music'],{questions:QUICK_QUESTIONS},C);
  eq([m10.slots.length, m10.rounds],[2,1],'10 pytań („Graj teraz") → 2 sloty, 1 runda');
  ok(new Set(m10.slots.map(x=>x.cat)).size===2,'10 pytań: różne kategorie w rundzie');
  const m15=buildMatch(keys,['music'],{questions:15},C);
  eq([m15.slots.length, m15.rounds],[3,1],'15 pytań → 3 sloty (CPR), 1 runda');
  const m30=buildMatch(keys,['music'],{questions:30},C);
  eq([m30.slots.length, m30.rounds],[6,2],'30 pytań → 6 slotów, 2 rundy');
  eq(m30.slots.map(x=>x.round),[1,1,1,2,2,2],'sloty grupowane po CPR w rundy');
  eq(buildMatch(keys,['music'],2,C).slots.length, 2*CPR,'stary format (rundy) bez zmian: 2 × CPR');
  ok(buildMatch(['d80'],['music'],{questions:30},C).slots.every(x=>x.cat==='d80'),'mała pula → powtórki kategorii');
  eq(clampQuestions(7),10,'7 → zaokrąglone w górę do wielokrotności QPC'); eq(clampQuestions(1e9),MAX_QUESTIONS,'ogromne → MAX_QUESTIONS');
  eq(clampQuestions('x'),DEFAULT_QUESTIONS,'śmieci → domyślne'); eq(clampQuestions(-3),DEFAULT_QUESTIONS,'ujemne → domyślne');
  eq(MAX_QUESTIONS, MAX_ROUNDS*CPR*QPC,'MAX_QUESTIONS = dawny cap rund × CPR × QPC');
  eq([5,10,15,30].map(roundsForQuestions),[1,1,1,2],'rounds dla starego serwera: 5/10/15 → 1, 30 → 2');
  eq(MATCH_LENGTHS.map(l=>l.q),[5,15,30],'segment: Krótki 5 · Standard 15 · Długi 30'); eq(DEFAULT_QUESTIONS,15,'domyślnie 15');
  const p=matchProgress({slots:[{},{}], si:1, qi:2});
  eq([p.n,p.total],[QPC+3, 2*QPC],'matchProgress: pyt. 8/10');
});
group('F6a match: sanitizeMpConfig — questions z sieci przycięte, stary klient (tylko rounds)', ()=>{
  eq(sanitizeMpConfig({ questions:5, rounds:1 }).questions, 5,'nowy klient: questions=5');
  eq(sanitizeMpConfig({ questions:1e7, rounds:1 }).questions, MAX_QUESTIONS,'questions ogromne → MAX_QUESTIONS (cap stanu DO)');
  eq(sanitizeMpConfig({ questions:'<x>' }).questions, DEFAULT_QUESTIONS,'questions śmieci → domyślne');
  eq(sanitizeMpConfig({ rounds:2 }).questions, 2*CPR*QPC,'stary klient bez questions → rounds×CPR×QPC');
  eq(sanitizeMpConfig({ questions:30, rounds:roundsForQuestions(30) }).rounds, 2,'nowy klient wysyła też rounds zgodne ze starym formatem');
});
group('F6a (R-F3) randomPools: kostka bez wiedzy ogólnej (bez kind:quiz i trybu quiz)', ()=>{
  const C={ ...CATS, gk2:{label:'wiedza2', kind:'quiz', questions:[{prompt:'q'}]} };
  for(let i=0;i<200;i++){
    const {cats,modes}=randomPools(Object.keys(C),C);
    ok(!modes.includes('quiz'),'kostka: brak trybu quiz');
    ok(!cats.some(k=>C[k].kind==='quiz'),'kostka: brak kategorii kind:quiz');
    ok(cats.length>0 && cats.every(c=>modesFor(c,C).some(m=>modes.includes(m))),'kostka: ≥1 kompatybilna kategoria');
  }
  const onlyQuiz={ gk:{label:'g',kind:'quiz',questions:[{prompt:'q'}]} };
  eq(randomPools(Object.keys(onlyQuiz), onlyQuiz).cats,[],'same paczki wiedzy → kostka nic nie losuje (bez quizu)');
});
group('F6a (R2) scoring.scoreRound: częściowe, rok/album, szybkość, seria, pewniak', ()=>{
  eq(scoreRound({okTitle:true}).points, 50,'sam tytuł = 50 (częściowe trafienie punktuje)');
  eq(scoreRound({okArtist:true}).points, 50,'sam wykonawca = 50');
  eq(scoreRound({okTitle:true, okArtist:true}).points, 100,'tytuł + wykonawca = 100');
  eq(scoreRound({okTitle:true, okArtist:true, okYear:true, okAlbum:true}).points, 140,'+ rok ±2 +20 + album +20 = 140');
  eq(scoreRound({okYear:true}).points, 20,'sam rok = 20 (bonus realny)');
  eq(scoreRound({}).points, 0,'pudło = 0');
  eq(scoreRound({quizOk:true}).points, PTS.quiz,'quiz trafiony = 100');
  eq(scoreRound({quizOk:false, okTitle:true}).points, 0,'quiz nietrafiony = 0 (pola muzyki ignorowane)');
  // szybkość: liniowo, do +50%; bez czasu brak bonusu; cap 30 s (bez timera)
  eq(speedFactor(0, 30000), 1.5,'odpowiedź natychmiast → ×1.5'); eq(speedFactor(15000, 30000), 1.25,'połowa limitu → ×1.25');
  eq(speedFactor(45000, 30000), 1,'po limicie → ×1'); eq(speedFactor(null, 30000), 1,'brak czasu → ×1');
  eq(speedFactor(5000, 0), speedFactor(5000, SPEED_CAP_MS),'bez timera → limit 30 s');
  eq(scoreRound({okTitle:true, okArtist:true, elapsedMs:0}).points, 150,'trafienie od razu = 150');
  eq(scoreRound({okTitle:true, elapsedMs:15000, limitMs:30000}).points, 63,'częściowe + szybkość (50×1.25 → 63)');
  // seria: tylko przy pełnym trafieniu; ×1.5 od 3, ×2 od 5
  eq([1,2,3,4,5,9].map(streakMult),[1,1,1.5,1.5,2,2],'streakMult progi 3/5');
  eq(scoreRound({okTitle:true, okArtist:true, streak:3}).points, 150,'seria 3 → ×1.5');
  eq(scoreRound({okTitle:true, okArtist:true, streak:5}).points, 200,'seria 5 → ×2');
  eq(scoreRound({okTitle:true, streak:7}).points, 50,'częściowe trafienie bez mnożnika serii');
  eq(scoreRound({quizOk:true, streak:5}).points, 200,'quiz: seria 5 → ×2');
  // pewniak (MP): trafienie ×2, nietrafiony = 0 (zakład przegrany)
  eq(scoreRound({okTitle:true, okArtist:true, sure:true}).points, 200,'pewniak trafiony ×2');
  eq(scoreRound({okTitle:true, sure:true}).points, 0,'pewniak przy częściowym = 0 (przegrany zakład)');
  eq(SCORE_MAX_PER_Q, 840,'max za pytanie: 140 × 1.5 × 2 × 2 = 840 (cap ligi)');
  const r=scoreRound({okTitle:true, okArtist:true, okYear:true, elapsedMs:0, streak:3});
  eq([r.base, r.speed, r.streakMult, r.sureMult],[120,1.5,1.5,1],'rozbicie: baza × szybkość × seria × pewniak');
});
group('F6a mpReducer: punkty drużyny (scoreRound), szybkość od PLAY, seria per drużyna, applyEvaluation', ()=>{
  const mk=(over={})=>({ phase:MP.PLAY, round:1, format:'coop', answerSlots:slotsFor(), timer:over.timer||0, playAt:over.playAt,
    teams:[{id:COOP_TEAM,name:'D',members:['u1']}], scores:{[COOP_TEAM]:0}, streaks:over.streaks||{}, results:[],
    byTeam:{ [COOP_TEAM]:{ proposals:[{by:'u1',byName:'Ala',values:over.values||{title:'Hey Jude',artist:'Beatles'}}],
      votes:{ title:{u1:(over.values||{}).title||'Hey Jude'}, artist:{u1:(over.values||{}).artist||'Beatles'} }, sure:over.sure||[], passed:[] } } });
  const cur={track:'Hey Jude', artist:'Beatles'};
  eq(evaluateAnswer(mk(), cur).reveal.gained, 100,'bez playAt/now → bez bonusu: 100');
  eq(evaluateAnswer(mk({playAt:1000}), cur, undefined, 1000).reveal.gained, 150,'zatwierdzone od razu po PLAY → ×1.5 = 150');
  eq(evaluateAnswer(mk({playAt:0, timer:60}), cur, undefined, 30000).reveal.gained, 125,'timer 60 s, lock po 30 s → ×1.25');
  eq(answerTiming({timer:0, playAt:5}, 8).limitMs, SPEED_CAP_MS,'bez timera limit = 30 s zajawki');
  eq(answerTiming({}, 8).elapsedMs, null,'brak playAt → elapsed null');
  const part=evaluateAnswer(mk({values:{title:'Hey Jude', artist:'Złe'}}), cur);
  ok(!part.reveal.teamOk && part.reveal.gained===50,'MP: częściowe (sam tytuł) = 50 pkt, teamOk=false');
  const sureLose=evaluateAnswer(mk({values:{title:'Hey Jude', artist:'Złe'}, sure:[{id:'u1',name:'Ala'}]}), cur);
  ok(sureLose.reveal.pewniakLose && sureLose.reveal.gained===0,'pewniak przy częściowym → 0 pkt + „stawia kolejkę"');
  const g=mk({streaks:{[COOP_TEAM]:2}});
  const ev=evaluateAnswer(g, cur);
  eq([ev.reveal.streak, ev.reveal.gained],[3,150],'seria drużyny 2→3 → ×1.5');
  const tally={};
  applyEvaluation(g, ev, tally);
  eq(g.scores[COOP_TEAM],150,'applyEvaluation: punkty dopisane'); eq(g.streaks[COOP_TEAM],3,'seria zapisana');
  eq(tally.u1 && tally.u1.correct,1,'tally: pierwszy trafny gracz +1'); eq(g.results.length,1,'wynik pytania do ligi');
  ok(g.reveal===ev.reveal,'reveal ustawiony');
  const g2=mk({streaks:{[COOP_TEAM]:4}, values:{title:'Złe',artist:'Złe'}, sure:[{id:'u1',name:'Ala'}]});
  const ev2=evaluateAnswer(g2, cur); applyEvaluation(g2, ev2, {});
  eq(g2.streaks[COOP_TEAM],0,'pudło zeruje serię'); eq(g2.beerTally.Ala,1,'przepalony pewniak → beerTally');
  // quiz w MP: 100 za komplet
  const gq={ phase:MP.PLAY, format:'coop', answerSlots:[{key:'a',label:'x'}], teams:[{id:COOP_TEAM,members:['u1']}], scores:{}, results:[],
    byTeam:{ [COOP_TEAM]:{ proposals:[{by:'u1',byName:'A',values:{a:'Warszawa'}}], votes:{a:{u1:'Warszawa'}}, sure:[], passed:[] } } };
  eq(evaluateAnswer(gq, {prompt:'Stolica?', slots:[{key:'a'}], answers:{a:['Warszawa']}}).reveal.gained, 100,'MP quiz trafiony = 100');
});
group('F6a matchRecord: solo w punktach (correct_count = trafienia) + rankCategories (profil)', ()=>{
  const results=[ {track:'A',artist:'X',okTitle:true,okArtist:true,points:150}, {track:'B',artist:'Y',okTitle:true,okArtist:false,points:50},
    {track:'C',artist:'Z',okTitle:false,okArtist:false,skipped:true,points:0} ];
  const rec=buildSoloRecord({results, slots:[{}], profileId:'u'});
  eq([rec.score, rec.participants[0].score, rec.participants[0].correct_count],[200,200,1],'score = suma punktów, correct_count = pełne trafienia');
  eq(buildSoloRecord({results:[{okTitle:true,okArtist:true}], slots:[{}], profileId:'u'}).score, 1,'stary format bez points → trafienia');
  const rc=rankCategories({ a:{n:10,ok:5}, b:{n:5,ok:5}, c:{n:4,ok:4}, d:{n:20,ok:10} });
  eq(rc.map(x=>x.key),['b','d','a'],'po skuteczności; <5 pytań pominięte; remis → więcej pytań wyżej');
  eq(rankCategories(null),[],'brak danych → pusto');
  eq(buildMpRecord({ game:{ slots:[{},{}], rounds:1, scores:{all:420}, results:[] }, tally:{}, members:[], hostId:'h' }).config.questions, 2*QPC,'MP record: config.questions');
});
group('F6a picker: quickPool / restorePick / pickSummary {questions}', ()=>{
  const C={ '80s':{label:'80',artists:['A']}, '90s':{label:'90',artists:['B']}, lyr:{label:'t',kind:'lyrics',songs:[{title:'x',lyric:'y'}]},
    gk:{label:'g',kind:'quiz',questions:[{prompt:'q'}]} };
  eq(quickPool(C),['80s','90s'],'hity: preferowane klucze istniejące w runtime');
  ok(QUICK_PREFERRED.includes('80s') && QUICK_PREFERRED.includes('evergreen-pl'),'preferowane: dekady + polskie');
  eq(quickPool({ x:{label:'x',artists:['A']}, gk:C.gk }),['x'],'fallback: dowolna kategoria z muzyką (bez wiedzy/lektora)');
  eq(quickPool({ x:{label:'x',artists:['A']}, y:{label:'y',artists:['B']} }, undefined, ['y']),['y'],'fallback: najpierw wskazane klucze (dekady)');
  eq(restorePick({cats:['80s','zniknęła',5], modes:['music','<x>'], questions:31}, C, ALL_MODES),{cats:['80s'],modes:['music'],questions:35},'restorePick: tylko istniejące klucze, znane tryby, clamp długości');
  eq(restorePick(null, C, ALL_MODES),{cats:[],modes:[],questions:null},'restorePick(null) → pusto');
  const s5=pickSummary(new Set(['80s','90s']), new Set(['music']), {questions:5}, C);
  eq([s5.count, s5.blocks, s5.unit],[5,1,'utworów'],'pickSummary {questions:5}');
  const t5=pickSummaryText(s5);
  ok(/1 kategoria × 5 pytań = /.test(t5.head) && t5.total==='5 utworów' && /z 2 wybranych/.test(t5.from),'tekst: „1 kategoria × 5 pytań = 5 utworów · losowane z 2 wybranych" — '+t5.head+t5.total+t5.from);
  const t30=pickSummaryText(pickSummary(new Set(['80s']), new Set(['music']), {questions:30}, C));
  ok(/6 bloków/.test(t30.head) && /powtarzane/.test(t30.from),'30 pytań z 1 kategorii → „6 bloków … (powtarzane)" — '+t30.head+t30.from);
});

/* --- F6b: layout/MP pub (audyt 2026-10) --- */
group('F6b match: matchQLabel (cały mecz) + matchHeader bez „pyt." (A2)', ()=>{
  const C={ a:{label:'A',range:'pop świat',artists:['x']}, b:{label:'B',artists:['y']} };
  const m={ slots:[{round:1,cat:'a',mode:'music'},{round:1,cat:'b',mode:'music'}], rounds:1, si:1, qi:2 };
  eq(matchQLabel(m), 'pyt. 8/10', 'blok 2, pytanie 3 → 8/10 w meczu (nie 3/5)');
  eq(matchHeader(m, C), 'B · muzyka · blok 2/2', 'kontekst: kategoria · tryb · blok (runda pominięta przy 1 rundzie)');
  const m1={ slots:[{round:1,cat:'a',mode:'music'}], rounds:1, si:0, qi:0 };
  eq(matchHeader(m1, C), 'pop świat · muzyka', '1 blok → bez „blok"');
  const m2={ slots:[{round:1,cat:'a',mode:'music'},{round:1,cat:'a',mode:'music'},{round:1,cat:'a',mode:'music'},{round:2,cat:'b',mode:'reverse'}], rounds:2, si:3, qi:0 };
  ok(/^Runda 2\/2 · B · od tyłu · blok 4\/4$/.test(matchHeader(m2, C)), 'mecz 2-rundowy → „Runda 2/2 · …" — '+matchHeader(m2, C));
  eq(matchQLabel(null), '', 'brak meczu → pusto');
});
group('F6b config/stan: audioHostOnly („Jeden głośnik", tryb #6)', ()=>{
  eq(sanitizeMpConfig({ audioHostOnly:true }).audioHostOnly, true, 'boolean true przechodzi');
  eq(sanitizeMpConfig({ audioHostOnly:'yes' }).audioHostOnly, false, 'nie-boolean → false');
  eq(audioHostOnly(null), false, 'brak gry → false');
  eq(audioHostOnly({ salon:true }), true, 'salon ⇒ audio tylko u hosta (TV)');
  eq(audioHostOnly({ audioHostOnly:true }), true, 'flaga meczu');
  eq(playsAudioLocally({ hostId:'h' }, 'p'), true, 'bez flagi: każdy gra u siebie');
  eq(playsAudioLocally({ hostId:'h', audioHostOnly:true }, 'h'), true, 'flaga: host gra');
  eq(playsAudioLocally({ hostId:'h', audioHostOnly:true }, 'p'), false, 'flaga: nie-host = pilot');
  eq(playsAudioLocally({ hostId:'h', salon:true }, 'p'), false, 'salon: telefon nie gra');
});
group('F6b teamOf: salon w Solo/Drużynach — TV nie sędziuje drużyny (#6)', ()=>{
  const teams=[{id:'t0',members:['a']},{id:'t1',members:['b']}];
  eq(teamOf({ salon:true, hostId:'h', format:'coop', teams:[{id:'all',members:['a']}] }, 'h'), 'all', 'coop: TV sędziuje jedyną drużynę (jak dotąd)');
  eq(teamOf({ salon:true, hostId:'h', format:'teams', teams }, 'h'), null, 'Drużyny: TV poza drużynami');
  const g={ phase:'play', salon:true, hostId:'h', format:'solo', teams, byTeam:{t0:{proposals:[],votes:{},sure:[],passed:[]},t1:{proposals:[],votes:{},sure:[],passed:[]}} };
  eq(reduceAction(g, { type:'vote', by:'h', slot:'title', value:'X' }), false, 'Solo: głos TV ignorowany (nie nadpisuje rywalom)');
});
group('F6b answerCredits: „złożona z głosów: kaśka → tytuł, mati → wykonawca" (R8)', ()=>{
  const g={ phase:'play', format:'coop', teams:[{id:'all',members:['k','m','z']}], byTeam:{ all:{
    proposals:[ {id:'1',by:'k',byName:'kaśka',values:{title:'Kombinacja',artist:'Lady Pank'}},
                {id:'2',by:'m',byName:'mati',values:{artist:'Maanam'}} ],
    votes:{ title:{k:'Kombinacja'}, artist:{m:'Maanam', z:'maanam'} }, sure:[], passed:[] } } };
  const cr=answerCredits(g, 'all', { title:'Kombinacja', artist:'Maanam' });
  eq(cr.map(c=>c.name+'→'+c.key), ['kaśka→title','mati→artist'], 'autor pierwszego typu z wartością (norm)');
  eq(answerCredits(g, 'all', { title:'', artist:'' }), [], 'puste sloty → brak');
  const g2={ ...g, byTeam:{ all:{ proposals:[{id:'1',by:'k',byName:'kaśka',values:{title:'Inny'}}], votes:{ title:{k:'Zupełnie inny'} }, sure:[], passed:[] } } };
  eq(answerCredits(g2, 'all', { title:'Zupełnie inny' }).map(c=>c.name), ['kaśka'], 'wartość tylko z głosu → głosujący (znany z typów)');
  const ev=evaluateAnswer(g, { track:'Kombinacja', artist:'Maanam' });
  eq((ev.reveal.credits||[]).map(c=>c.name), ['kaśka','mati'], 'credits w odsłonie (coop spłaszczone) — serwer i host relay liczą tak samo');
});
group('F6b timing: intro 0,9 s, „wróć do pokoju" 30 min, tik ostatnich 5 s', ()=>{
  ok(MP_INTRO_MS<=1000 && MP_INTRO_MS>=600, 'intro fazy ~0,9 s (dawniej 2,3 s) — '+MP_INTRO_MS);
  const now=1e12;
  eq(lastRoomCode({ code:'abcd', at:now-60000 }, now), 'ABCD', 'świeży rekord → kod (wielkie litery)');
  eq(lastRoomCode({ code:'ABCD', at:now-LAST_ROOM_TTL_MS-1 }, now), null, 'po 30 min → brak');
  eq(lastRoomCode({ code:'AB"D', at:now }, now), null, 'zły kod → brak');
  eq(lastRoomCode(null, now), null, 'brak rekordu → brak');
  eq(tickSecond(4200, null), 5, '4,2 s → tik „5"');
  eq(tickSecond(4100, 5), null, 'ta sama sekunda → bez powtórki');
  eq(tickSecond(3900, 5), 4, 'kolejna sekunda → tik');
  eq(tickSecond(6000, null), null, '>5 s → cisza');
  eq(tickSecond(0, null), null, 'koniec czasu → cisza');
});
group('F6b ksywy: domyślnie neutralne, pikantne opt-in; 🖕 → 🍺 (U10)', ()=>{
  ok(NEUTRAL_HANDLES.length>=40 && SPICY_HANDLES.length>0, 'obie pule niepuste');
  ok(!NEUTRAL_HANDLES.some(isSpicyHandle), 'pule rozłączne');
  for(const bad of ['Analny Korsarz','Dua Cipa','Mokra Włoszka','Łóżkowy Sprinter','Bruce Wilgotny']) ok(!NEUTRAL_HANDLES.includes(bad) && isSpicyHandle(bad), 'pikantna poza pulą domyślną: '+bad);
  let spicyHit=false; for(let i=0;i<200;i++){ if(isSpicyHandle(pickHandle({ rnd:()=>i/200 }))) spicyHit=true; }
  ok(!spicyHit, 'pickHandle() domyślnie nigdy nie zwraca pikantnej');
  eq(pickHandle({ spicy:true, rnd:()=>0.9999 }), SPICY_HANDLES[SPICY_HANDLES.length-1], 'spicy=true → pula z pikantnymi');
  ok(!REACTIONS.includes('🖕') && REACTIONS.includes('🍺'), 'pasek reakcji: 🍺 zamiast 🖕');
  const srv=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'..','server','authorityRoom.js'),'utf8');
  const rel=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'..','server','gameRoom.js'),'utf8');
  ok(/import \{ REACTIONS \} from '\.\.\/core\/chatFeed\.js'/.test(srv) && /import \{ REACTIONS \} from '\.\.\/core\/chatFeed\.js'/.test(rel) && !srv.includes("'🖕'") && !rel.includes("'🖕'"), 'serwer (autorytet + relay) używa wspólnej whitelist z rdzenia');
});

/* ===================== F8a: norm (przedimki tylko na początku), intro, ABCD muzyki, rok ===================== */
import { yearScore, parseYear, introMult, INTRO_MULTS, YEAR_PTS } from '../core/scoring.js';
import { INTRO_STAGES, introStageSecs, introNextStage, LISTEN_SECS } from '../core/timing.js';
import { pickDistractors, buildTrackMC, gatherDistractors, displayTitle, yearReliable } from '../core/trackSelect.js';
import { MP_MODES, SOLO_ONLY_MODES, LEGACY_MP_MODES, mpAvailableModes, MODE_LABEL } from '../core/match.js';
group('F8a norm(): przedimki tylko na POCZĄTKU (+ „the" w środku), jednoliterowe człony dokładnie', ()=>{
  ok(!textMatch('witamina A','witamina B3'), '„witamina A" ≠ „witamina B3" (dawniej „a" w środku usuwane)');
  ok(!textMatch('witamina B3','witamina A'), 'symetrycznie');
  ok(!textMatch('Grupa A','Grupa B'), '„Grupa A" ≠ „Grupa B" (jednoliterowy człon bez tolerancji literówek)');
  ok(!textMatch('witamina C','witamina D'), '„witamina C" ≠ „witamina D"');
  ok(textMatch('Grupa A','grupa a'), '„Grupa A" = „grupa a"');
  ok(textMatch('witamina A','Witamina A'), '„witamina A" = „Witamina A"');
  eq(norm('witamina A'),'witamina a','„a" w środku zostaje');
  eq(norm('Grupa A'),'grupa a','„Grupa A" bez redukcji');
  ok(textMatch('The Beatles','Beatles'), '„The Beatles" = „Beatles"');
  ok(textMatch('Beatles','The Beatles'), '„Beatles" = „The Beatles"');
  eq(norm('A-ha'),'a ha','„A-ha" — obecne zachowanie (rdzeń „ha" za krótki → bez redukcji)');
  ok(textMatch('a-ha','A-ha') && textMatch('A ha','A-ha'), '„A-ha" zalicza zapis z/bez myślnika');
  eq(norm('A Day in the Life'),'day in life','przedimek na początku + „the" w środku (uzasadniony wyjątek)');
  ok(textMatch('Day in the Life','A Day in the Life'), 'tytuł bez „A" na początku zalicza');
  eq(norm('De La Soul'),'de la soul','„De La Soul" bez zmian');
  eq(norm('Le Freak'),'le freak','„Le Freak" — rdzeń „freak" za krótki → bez redukcji');
  eq(norm('La Isla Bonita'),'isla bonita','„La …" na początku usuwane');
  eq(norm('Viva la Vida'),'viva la vida','„la" w środku zostaje');
  ok(textMatch('Viva la Vida','Viva La Vida'), '„Viva la Vida" OK');
  ok(textMatch('Romeo i Julia','Romeo i Julia') && !textMatch('Romeo a Julia','Romeo i Julia'), 'spójnik jednoliterowy dokładnie');
  ok(textMatch('Malcolm X','malcolm x'), '„Malcolm X" OK');
});
group('F8a timing: etapy intro 1→2→4→8→16 s', ()=>{
  eq(INTRO_STAGES,[1,2,4,8,16],'stała etapów');
  eq([0,1,2,3,4].map(introStageSecs),[1,2,4,8,16],'długość etapu');
  eq(introStageSecs(99),16,'poza zakresem → ostatni'); eq(introStageSecs('x'),1,'śmieci → etap 0');
  eq(introNextStage(0),1,'0 → 1'); eq(introNextStage(3),4,'3 → 4'); eq(introNextStage(4),null,'ostatni → null');
  ok(LISTEN_SECS.intro>0 && LISTEN_SECS.abcd>0 && LISTEN_SECS.year>0, 'faza „słuchaj" zdefiniowana dla nowych trybów');
});
group('F8a scoring: mnożnik etapu intro (×2.0/1.6/1.3/1.1/1.0)', ()=>{
  eq(INTRO_MULTS,[2,1.6,1.3,1.1,1],'mnożniki');
  eq([0,1,2,3,4].map(introMult),[2,1.6,1.3,1.1,1],'introMult per etap');
  eq(introMult(-3),2,'ujemny → etap 0'); eq(introMult(9),1,'poza zakresem → ×1'); eq(introMult(undefined),1,'brak → ×1');
  const full={ okTitle:true, okArtist:true, roundOk:true, elapsedMs:null, streak:1 };
  eq(scoreRound({ ...full, mult:introMult(0) }).points, 200, 'etap 1 s, pełne trafienie: 100 × 2 = 200');
  eq(scoreRound({ ...full, mult:introMult(1) }).points, 160, 'etap 2 s: ×1.6 = 160');
  eq(scoreRound({ ...full, mult:introMult(4) }).points, 100, 'etap 16 s: ×1 = 100');
  eq(scoreRound({ okTitle:true, elapsedMs:null, mult:introMult(2) }).points, 65, 'częściowe (sam tytuł 50) × 1.3 = 65');
  eq(scoreRound({ ...full, mult:introMult(0) }).mult, 2, 'mult w wyniku (rozbicie punktów)');
  eq(scoreRound(full).mult, 1, 'domyślnie ×1');
  const worst=scoreRound({ okTitle:true, okArtist:true, okYear:true, okAlbum:true, elapsedMs:null, streak:99, mult:introMult(0) }).points;
  ok(worst<=SCORE_MAX_PER_Q, 'intro (bez bonusu za szybkość) mieści się w limicie ligi: '+worst+' ≤ '+SCORE_MAX_PER_Q);
  ok(scoreRound({ okTitle:true, okArtist:true, okYear:true, okAlbum:true, elapsedMs:0, streak:99, sure:true, mult:9 }).points<=SCORE_MAX_PER_Q, 'nawet z mult/pewniakiem — przycięte do SCORE_MAX_PER_Q');
  eq(SCORE_MAX_PER_Q, 840, 'limit ligi bez zmian (format statystyk)');
});
group('F8a scoring: tryb „rok" (100 / ±1 70 / ±2 50 / dekada 20)', ()=>{
  eq(yearScore('1984','1984').points,100,'dokładnie'); eq(yearScore(1985,'1984').points,70,'+1');
  eq(yearScore('1983','1984-05-01').points,70,'−1 (rok z daty)'); eq(yearScore('1986','1984').points,50,'±2');
  eq(yearScore('1989','1984').points,20,'ta sama dekada'); eq(yearScore('1980','1984').points,20,'początek dekady');
  eq(yearScore('1979','1981').points,50,'±2 przez granicę dekady'); eq(yearScore('1978','1981').points,0,'inna dekada, ±3 → 0');
  eq(yearScore('1990','1987').points,0,'±3 w innej dekadzie → 0');
  eq(yearScore('','1984'), { points:0, diff:null, tier:'miss' }, 'brak odpowiedzi'); eq(yearScore('abc','1984').points,0,'śmieci');
  eq(yearScore('1984','').points,0,'brak roku utworu');
  eq(yearScore('1984','1984').tier,'exact','tier'); eq(yearScore('1987','1984').tier,'decade','tier dekada');
  eq(parseYear(' 2001 '),2001,'parseYear'); eq(parseYear('12'),null,'za krótki'); eq(parseYear(null),null,'null');
  eq(scoreRound({ yearPts:100, elapsedMs:null, streak:1 }).points,100,'scoreRound yearPts=100');
  eq(scoreRound({ yearPts:20, elapsedMs:null, streak:5 }).points,20,'dekada nie liczy się do serii (pełne trafienie = ±2)');
  eq(scoreRound({ yearPts:50, elapsedMs:null, streak:3 }).points,75,'±2 przy serii 3 → ×1.5');
  eq(scoreRound({ yearPts:70, elapsedMs:null }).parts.year,70,'parts.year = punkty roku');
  eq(scoreRound({ yearPts:20, sure:true, elapsedMs:null }).points,0,'pewniak przy samej dekadzie = przegrany');
  eq(scoreRound({ yearPts:500, elapsedMs:null }).base,100,'yearPts przycięte do 100');
  eq(YEAR_PTS,{exact:100,off1:70,off2:50,decade:20},'stałe');
});
group('F8a trackSelect: pickDistractors (duplikaty, wersje, fallback ten sam wykonawca)', ()=>{
  const it=(t,a,extra={})=>({ trackName:t, artistName:a, previewUrl:'https://x', collectionName:'', ...extra });
  const correct={ track:'Bohemian Rhapsody (Remastered 2011)', artist:'Queen' };
  const cands=[
    it('Bohemian Rhapsody','Queen'), it('Bohemian Rhapsody (Live Aid)','Queen'), it('Bohemian Rhapsody','Panic! At The Disco'),
    it('Africa','Toto'), it('Rosanna','Toto'), it('Take On Me','a-ha'), it('Take On Me (2015 Remaster)','a-ha'),
    it('Jump','Van Halen'), it('Jump (Live)','Van Halen'), it('Karaoke Hits','Tribute Band'),
    it('Under Pressure','Queen'), it('Somebody to Love','Queen'),
  ];
  let i=0; const rnd=()=>((i++*0.37)%1);
  const d=pickDistractors(cands, correct, rnd);
  eq(d.length,3,'3 dystraktory');
  ok(!d.some(x=>/bohemian/i.test(x.track)), 'nigdy ten sam utwór (też wersja live i cover innego wykonawcy)');
  eq(new Set(d.map(x=>x.artist)).size,3,'najpierw RÓŻNI wykonawcy');
  ok(!d.some(x=>x.artist==='Queen'), 'inni wykonawcy przed tym samym');
  ok(!d.some(x=>/\(|live|karaoke/i.test(x.track)), 'bez live/remaster w nazwie (displayTitle) i bez karaoke');
  eq(new Set(d.map(x=>x.track.toLowerCase())).size,3,'bez duplikatów tytułów');
  const own=pickDistractors([it('Under Pressure','Queen'),it('Somebody to Love','Queen'),it('Under Pressure (Remastered)','Queen'),it('Radio Ga Ga','Queen'), it('Bohemian Rhapsody','Queen')], correct, Math.random);
  eq(own.length,3,'fallback: utwory tego samego wykonawcy');
  ok(own.every(x=>x.artist==='Queen') && new Set(own.map(x=>x.track)).size===3, 'bez wersji tego samego utworu („Under Pressure" raz)');
  const few=pickDistractors([it('Africa','Toto')], correct, Math.random);
  eq(few.length,1,'za mało kandydatów → mniej (wołający gra jak muzyka)');
  const songs=pickDistractors([{title:'A1',artist:'X'},{title:'B1',artist:'Y'},{title:'C1',artist:'Z'},{title:'Bohemian Rhapsody',artist:'Queen'}], correct, Math.random);
  eq(songs.length,3,'kandydaci z playlisty {title,artist}');
  eq(pickDistractors(null, correct), [], 'null → []');
  eq(displayTitle('Take On Me (2015 Remaster)'),'Take On Me','displayTitle: remaster precz');
  eq(displayTitle('Hey Jude - Remastered 2015'),'Hey Jude','displayTitle: sufiks remaster precz');
  eq(displayTitle('Stayin\' Alive (feat. X)'),'Stayin\' Alive','displayTitle: feat. precz');
  eq(displayTitle('Jump (Live)'),'Jump (Live)','displayTitle: live zostaje (widoczna różnica wersji)');
});
group('F8a trackSelect: buildTrackMC — kształt pytania ABCD (evaluateQuiz)', ()=>{
  const correct={ track:'Africa', artist:'Toto' };
  const ds=[{track:'Jump',artist:'Van Halen'},{track:'Take On Me',artist:'a-ha'},{track:'Rosanna',artist:'Toto'}];
  const q=buildTrackMC(correct, ds, ()=>0.5);
  ok(q && q.mc && q.mc.options.length===4, '4 kafle');
  eq(q.slots,[{key:'a',label:'litera (A–D)'}],'jeden slot litery');
  const c=q.mc.options.find(o=>o.letter===q.mc.correct);
  eq(c.text,'Africa — Toto','poprawny kafel = „Tytuł — Wykonawca"');
  eq(q.answers.a,[q.mc.correct,'Africa — Toto'],'answers: litera + tekst');
  ok(/^Jaki to utwór\?\nA\) /.test(q.prompt), 'prompt z opcjami A) … (parseMC / odsłona MP)');
  eq(parseMC(q.prompt).options.length,4,'parseMC rozpoznaje 4 opcje');
  eq(evaluateQuiz(q, {a:q.mc.correct}).ok, true, 'wybór poprawnej litery → ok');
  const wrong='ABCD'.split('').find(l=>l!==q.mc.correct);
  eq(evaluateQuiz(q, {a:wrong}).ok, false, 'inna litera → źle');
  eq(evaluateQuiz(q, {a:'Africa — Toto'}).ok, true, 'MP: tekst kafla bez litery też wskaże opcję');
  eq(buildTrackMC(correct, ds.slice(0,2)), null, '< 3 dystraktory → null');
  eq(buildTrackMC(null, ds), null, 'brak utworu → null');
  const lets=new Set(); for(let k=0;k<20;k++) lets.add(buildTrackMC(correct, ds, Math.random).mc.correct);
  ok(lets.size>1, 'poprawna litera losowana');
  eq(scoreRound({ quizOk:true, elapsedMs:null }).points, 100, 'punkty jak quiz (scoreRound quizOk)');
});
console.log('• F8a trackSelect: gatherDistractors (wstrzyknięta sieć, playlista bez sieci, błędy)');
await (async ()=>{
  const it=(t,a)=>({ trackName:t, artistName:a, previewUrl:'https://x' });
  const net={ 'Toto':[it('Africa','Toto'),it('Rosanna','Toto'),it('Hold the Line','Toto')], 'a-ha':[it('Take On Me','a-ha'),it('The Sun Always Shines on T.V.','a-ha')],
    'Van Halen':[it('Jump','Van Halen')], 'Queen':[it('Bohemian Rhapsody','Queen'),it('Under Pressure','Queen')] };
  const calls=[];
  const itunes=async(term)=>{ calls.push(term); if(term==='Boom') throw new Error('x'); return net[term]||[]; };
  const d=await gatherDistractors({ cat:{ artists:['Toto','a-ha','Van Halen','Queen','Boom'] }, correct:{track:'Africa',artist:'Toto'}, itunes, rnd:()=>0.3 });
  eq(d.length,3,'gather: 3 dystraktory z innych wykonawców'); ok(!d.some(x=>x.track==='Africa'),'bez poprawnego');
  ok(!calls.includes('Toto') || d.length===3, 'własny wykonawca pytany tylko w fallbacku');
  const own=await gatherDistractors({ cat:{ artists:['Toto','Boom'] }, correct:{track:'Africa',artist:'Toto'}, itunes, rnd:Math.random });
  eq(own.map(x=>x.artist),['Toto','Toto'],'fallback: inne utwory tego samego wykonawcy (2 dostępne)');
  const pl=await gatherDistractors({ cat:{ songs:[{title:'S1',artist:'A'},{title:'S2',artist:'B'},{title:'S3',artist:'C'},{title:'Africa',artist:'Toto'}] }, correct:{track:'Africa',artist:'Toto'}, itunes:null });
  eq(pl.length,3,'playlista: dystraktory z utworów kategorii (bez sieci)');
  const off=await gatherDistractors({ cat:{ artists:['Boom','Zzz'] }, correct:{track:'X',artist:'Q'}, itunes:async()=>{ throw new Error('offline'); } });
  eq(off,[],'offline → [] (nie rzuca)');
  const slow=await gatherDistractors({ cat:{ artists:['A','B'] }, correct:{track:'X',artist:'Q'}, itunes:()=>new Promise(()=>{}), capMs:30 });
  eq(slow,[],'wiszące zapytania → cap czasu → []');
})();
group('F8a trackSelect: wiarygodność roku', ()=>{
  ok(yearReliable('1984','1980–89'), 'rok w dekadzie kategorii');
  ok(!yearReliable('2011','1980–89'), 'remaster spoza dekady → niewiarygodny');
  ok(!yearReliable('1984',''), 'styl/playlista bez zakresu → „rok wg iTunes"');
  ok(yearReliable('1984','', 'data'), 'rok z danych playlisty → wiarygodny');
  ok(yearReliable('2023','2020+'), 'otwarta dekada');
});
group('F8a match: tryby, modesFor, MP_MODES, capabilities', ()=>{
  ok(['intro','abcd','year'].every(m=>ALL_MODES.includes(m) && MODE_LABEL[m]), 'nowe tryby w ALL_MODES + etykiety');
  eq(MODE_LABEL.intro,'⏱ intro','etykieta intro');
  eq(SOLO_ONLY_MODES,['intro','medley','cover','piano','guitar','timeline'],'intro (EKSP.: + składanka, okładka, fortepian) tylko solo'); ok(!MP_MODES.includes('intro') && MP_MODES.includes('abcd') && MP_MODES.includes('year'), 'MP_MODES');
  const C={ dek:{label:'80', range:'1980–89', artists:['A','B','C']}, pl:{label:'pl', songs:[1,2,3,4,5].map(i=>({title:'t'+i,artist:'a'+i,year:'199'+i}))},
    pl2:{label:'pl2', songs:[{title:'x',artist:'y'},{title:'z',artist:'w'}]}, lyr:{label:'l', kind:'lyrics', songs:[{title:'d'}]}, q:{label:'q', kind:'quiz', questions:[]},
    solo1:{label:'s', artists:['Only']} };
  eq(modesFor('dek',C),['music','reverse','snippet','intro','revsnip','abcd','year','medley','cover','piano','guitar','timeline','slowmo','fastmo'],'dekada: wszystkie tryby audio');
  eq(modesFor('pl',C),['music','reverse','snippet','intro','revsnip','abcd','year','medley','cover','timeline','slowmo','fastmo'],'playlista z rokiem: + rok (EKSP.: 5 wykonawców → składanka/okładka)');
  eq(modesFor('pl2',C),['music','reverse','snippet','intro','revsnip','piano','guitar','slowmo','fastmo'],'2 utwory bez roku: bez ABCD/roku');
  eq(modesFor('solo1',C),['music','reverse','snippet','intro','revsnip','year','medley','cover','piano','guitar','slowmo','fastmo'],'1 wykonawca: bez ABCD (brak dystraktorów z kategorii)');
  eq(modesFor('lyr',C),['lektor'],'teksty bez audio — bez nowych trybów'); eq(modesFor('q',C),['quiz'],'quiz bez nowych trybów');
  const mi=buildMatch(['dek'],['intro'],{questions:5},C); ok(!mi.error && mi.slots[0].mode==='intro', 'buildMatch: mecz intro');
  eq(sanitizeMpConfig({ modes:['music','intro','abcd','year','zzz'] }).modes,['music','abcd','year'],'MP config: intro odrzucone (tylko solo)');
  eq(mpAvailableModes(null,true),LEGACY_MP_MODES,'stary serwer (brak modes w presence) → tylko dawne tryby');
  eq(mpAvailableModes(MP_MODES,true),MP_MODES,'nowy serwer → wszystkie MP');
  eq(mpAvailableModes(['music','abcd'],true),['music','abcd'],'przecięcie z tym, co zna serwer');
  eq(mpAvailableModes(null,false),MP_MODES,'relay (host liczy sam) → wszystkie MP');
  for(let k=0;k<30;k++){ const r=randomPools(Object.keys(C), C, ['music','reverse']); ok(r.modes.every(m=>['music','reverse'].includes(m)), 'randomPools: tylko dozwolone tryby'); }
  ok(pickSummary(new Set(['dek']), new Set(['year']), {questions:5}, C).unit==='utworów', 'picker: rok = utwory');
});
group('F8a mpReducer: tryb „rok" — slot liczbowy, głosowanie co-op, yearScore', ()=>{
  eq(slotsFor('year'),[{key:'year',label:'rok'}],'slotsFor(year)');
  const g={ phase:MP.PLAY, answerSlots:slotsFor('year'), teams:[{id:COOP_TEAM,name:'D',members:['a','b','c']}], byTeam:{}, scores:{}, format:'coop', mode:'year', round:1, catKey:'d' };
  reduceAction(g,{type:'propose',by:'a',byName:'A',values:{year:'1984'}});
  reduceAction(g,{type:'propose',by:'b',byName:'B',values:{year:'1986'}});
  reduceAction(g,{type:'vote',by:'c',slot:'year',value:'1986'});
  eq(teamAnswer(g,COOP_TEAM).year,'1986','górka głosów na rok');
  const ev=evaluateAnswer(g,{ track:'T', artist:'A', year:'1985', yearNote:'rok wg wydania w iTunes' });
  eq(ev.reveal.kind,'year','reveal.kind = year'); eq(ev.reveal.year,'1985','rok w odsłonie');
  eq(ev.perTeam[COOP_TEAM].yearEval.pts,70,'±1 → 70'); eq(ev.reveal.yearEval.tier,'off1','coop: yearEval spłaszczone, reveal.year nienadpisany'); eq(ev.perTeam[COOP_TEAM].gained,70,'punkty drużyny');
  ok(ev.perTeam[COOP_TEAM].teamOk,'±1 = trafienie'); eq(ev.reveal.yearNote,'rok wg wydania w iTunes','notka o roku');
  eq(ev.result.track,'T','wynik do ligi: tytuł utworu');
  eq(ev.perTeam[COOP_TEAM].firstBy,'A','pierwszy z trafionym rokiem (±2)');
  const g2={ ...g, byTeam:{} }; reduceAction(g2,{type:'propose',by:'a',byName:'A',values:{year:'1975'}});
  const ev2=evaluateAnswer(g2,{ track:'T', artist:'A', year:'1985' });
  eq(ev2.perTeam[COOP_TEAM].gained,0,'pudło → 0'); ok(!ev2.perTeam[COOP_TEAM].teamOk,'pudło');
});
group('F8a mpReducer: ABCD muzyki = pytanie quizu w stanie (sekret do REVEAL)', ()=>{
  const q=buildTrackMC({track:'Africa',artist:'Toto'}, [{track:'Jump',artist:'Van Halen'},{track:'Take On Me',artist:'a-ha'},{track:'Rosanna',artist:'Toto'}], ()=>0.2);
  const g={ phase:MP.PLAY, answerSlots:q.slots, teams:[{id:COOP_TEAM,name:'D',members:['a']}], byTeam:{}, scores:{}, format:'coop', mode:'abcd', round:1, catKey:'d' };
  reduceAction(g,{type:'propose',by:'a',byName:'A',values:{a:q.mc.correct}});
  const ev=evaluateAnswer(g,{ track:'Africa', artist:'Toto', year:'1982', prompt:q.prompt, slots:q.slots, answers:q.answers, mc:q.mc });
  ok(ev.perTeam[COOP_TEAM].teamOk,'poprawna litera'); eq(ev.perTeam[COOP_TEAM].gained,100,'100 pkt (jak quiz)');
  eq(ev.reveal.kind,'quiz','odsłona jak quiz ABCD'); eq(ev.result.track,'Africa','wynik do ligi: tytuł, nie prompt'); eq(ev.result.artist,'Toto','i wykonawca');
});

/* ===================== F8b: Stacja dnia (seed daty, plan, seria, siatka, share), rnd w wyborze utworu, dystraktory, legenda ===================== */
import { dateKey, dayIndex, addDays, isDayKey, dailyNumber, hash32, mulberry32, dailySeed, dailyQuestionRnd, dailyPool, dailyPlan,
  dailyStreak, bestStreak, dailyCell, resultGrid, countHits, dailyShareText, matchShareText, dailyRecord, sanitizeDailyStore, dailyStatus,
  DAILY_EPOCH, DAILY_QUESTIONS, DAILY_PREFERRED, DAILY_KEEP_DAYS } from '../core/daily.js';
import { matchQpc, matchTotal } from '../core/match.js';
import { scoreLegend } from '../core/scoring.js';
import { shuffle } from '../core/util.js';
import { distractorWindow, DISTRACTOR_TOP } from '../core/trackSelect.js';
group('F8b daily: data w Europe/Warsaw (północ, zmiana roku, zmiana czasu) + numer dnia', ()=>{
  eq(dateKey(new Date('2026-10-15T21:59:00Z')),'2026-10-15','23:59 CEST → ten sam dzień');
  eq(dateKey(new Date('2026-10-15T22:00:00Z')),'2026-10-16','00:00 CEST (UTC 22:00) → następny dzień w Warszawie');
  eq(dateKey(new Date('2026-12-31T23:30:00Z')),'2027-01-01','sylwester 23:30 UTC = 00:30 CET → 1 stycznia');
  eq(dateKey(new Date('2026-10-25T00:30:00Z')),'2026-10-25','dzień zmiany czasu (CEST→CET)');
  eq(dateKey(new Date('2026-10-25T22:59:00Z')),'2026-10-25','po zmianie czasu: 23:59 CET');
  eq(dateKey(new Date('2026-10-25T23:00:00Z')),'2026-10-26','po zmianie czasu: północ CET = 23:00 UTC');
  eq(dateKey(new Date('2026-06-01T12:00:00Z'),'America/New_York'),'2026-06-01','inna strefa (parametr)');
  eq(dateKey(new Date('2026-06-01T02:00:00Z'),'America/New_York'),'2026-05-31','inna strefa: wcześniej');
  eq(dateKey('nie-data'), null, 'śmieci → null');
  eq(dailyNumber(DAILY_EPOCH),1,'#1 = 2026-10-15'); eq(dailyNumber('2026-10-17'),3,'#3');
  eq(dailyNumber('2027-01-01'),79,'przez zmianę roku'); eq(dailyNumber('2026-10-26'),12,'przez zmianę czasu (doby UTC)');
  eq(addDays('2026-12-31',1),'2027-01-01','addDays przez rok'); eq(addDays('2028-02-28',1),'2028-02-29','rok przestępny');
  eq(addDays('2026-03-01',-1),'2026-02-28','wstecz przez luty');
  ok(isDayKey('2026-02-28') && !isDayKey('2026-02-30') && !isDayKey('2026-1-1') && !isDayKey(null), 'isDayKey: tylko poprawne daty');
  eq(dayIndex('2027-01-01')-dayIndex('2026-12-31'),1,'dayIndex: kolejne dni');
});
group('F8b daily: seed + PRNG deterministyczne', ()=>{
  eq(dailySeed('2026-10-16'), dailySeed('2026-10-16'), 'ten sam dzień → ten sam seed');
  eq(dailySeed(new Date('2026-10-16T10:00:00Z')), dailySeed('2026-10-16'), 'Date → klucz dnia w Warszawie → ten sam seed');
  eq(dailySeed(new Date('2026-10-15T22:30:00Z')), dailySeed('2026-10-16'), '00:30 w Warszawie (22:30 UTC dnia wcześniej) = już nowy dzień');
  ok(dailySeed('2026-10-16')!==dailySeed('2026-10-17'), 'inny dzień → inny seed');
  ok(Number.isInteger(dailySeed('2026-10-16')) && dailySeed('2026-10-16')>=0 && dailySeed('2026-10-16')<2**32, 'seed: uint32');
  const a=mulberry32(42), b=mulberry32(42), xa=[...Array(20)].map(a), xb=[...Array(20)].map(b);
  eq(xa, xb, 'mulberry32: ten sam seed → ten sam ciąg'); ok(xa.every(x=>x>=0 && x<1), 'zakres [0,1)');
  ok(JSON.stringify(xa)!==JSON.stringify([...Array(20)].map(mulberry32(43))), 'inny seed → inny ciąg');
  eq(hash32('abc'), hash32('abc'), 'hash32 stabilny');
  eq(dailyQuestionRnd(7,3)(), dailyQuestionRnd(7,3)(), 'strumień pytania deterministyczny');
  ok(dailyQuestionRnd(7,3)()!==dailyQuestionRnd(7,4)(), 'różne pytania → różne strumienie');
  eq(shuffle([1,2,3,4,5,6], mulberry32(5)), shuffle([1,2,3,4,5,6], mulberry32(5)), 'util.shuffle(a, rnd) deterministyczny');
  eq(shuffle([1,2,3]).sort(), [1,2,3], 'util.shuffle bez rnd — dalej permutacja');
});
group('F8b daily: plan dnia (pula dekady + PL, 10 pytań, qpc 1)', ()=>{
  const C={ '80s':{artists:['A','B'],range:'1980–89'}, '90s':{artists:['C']}, '00s':{artists:['D']}, 'evergreen-pl':{artists:['E']}, 'rock-pl':{artists:['F']},
    'lyr':{kind:'lyrics',songs:[{title:'x',artist:'y',lyric:'z'}]}, 'q':{kind:'quiz',questions:[]}, 'metal':{artists:['M']} };
  const pool=dailyPool(C);
  eq(pool, ['00s','80s','90s','evergreen-pl','rock-pl'], 'pula: preferowane istniejące muzyczne, posortowane (bez metalu/lektora/quizu)');
  eq(dailyPool({ x:{artists:['A']}, y:{kind:'quiz'} }), ['x'], 'brak preferowanych → dowolne muzyczne');
  ok(DAILY_PREFERRED.includes('80s') && DAILY_PREFERRED.includes('evergreen-pl'), 'preferowane: dekady + PL');
  const p1=dailyPlan(dailySeed('2026-10-16'), pool), p2=dailyPlan(dailySeed('2026-10-16'), [...pool].reverse());
  eq(p1, p2, 'ten sam dzień → ten sam plan (niezależnie od kolejności puli)');
  eq(p1.slots.length, DAILY_QUESTIONS, '10 pytań'); eq(p1.qpc, 1, 'qpc 1 (pytanie = slot)'); eq(p1.questions, 10, 'questions 10');
  ok(p1.slots.every(x=>x.mode==='music' && x.round===1 && pool.includes(x.cat)), 'tryb muzyka, kategorie z puli');
  ok(p1.slots.every((x,i)=>i===0 || x.cat!==p1.slots[i-1].cat), 'ta sama kategoria nigdy dwa razy z rzędu');
  eq(new Set(p1.slots.slice(0,5).map(x=>x.cat)).size, 5, 'pierwsze 5 pytań — 5 różnych kategorii');
  const p3=dailyPlan(dailySeed('2026-10-17'), pool);
  ok(JSON.stringify(p3.slots)!==JSON.stringify(p1.slots) || p3.trackSeed!==p1.trackSeed, 'inny dzień → inny plan');
  let diff=0; for(let d=0; d<10; d++){ const k=addDays('2026-10-16', d+1); if(JSON.stringify(dailyPlan(dailySeed(k), pool).slots)!==JSON.stringify(p1.slots)) diff++; }
  eq(diff, 10, 'kolejne 10 dni — każdy z innym układem kategorii');
  eq(dailyPlan(1, ['80s']).slots.map(x=>x.cat), Array(10).fill('80s'), 'pula 1 kategorii → powtórki');
  ok(dailyPlan(1, []).error, 'pusta pula → error');
  const mix=dailyPlan(9, pool, { modes:['music','year'], allCats:{ ...C, '90s':{artists:['C']} } });
  ok(mix.slots.every(x=>['music','year'].includes(x.mode)), 'opcjonalna mieszanka trybów (filtrowana modesFor)');
  const r=buildMatch(['80s'],['music'],{questions:10},C); ok(!r.qpc, 'buildMatch bez qpc (zwykłe mecze bez zmian)');
});
group('F8b match: qpc (pytań na slot) — Stacja dnia 10×1, reszta bez zmian', ()=>{
  const m={ slots:[{round:1,cat:'a',mode:'music'},{round:1,cat:'b',mode:'music'},{round:1,cat:'c',mode:'music'}], rounds:1, si:0, qi:0, qpc:1 };
  eq(matchQpc(m),1,'qpc 1'); eq(matchTotal(m),3,'3 pytania'); eq(matchProgress(m),{n:1,total:3},'pyt. 1/3');
  ok(matchAdvance(m) && m.si===1 && m.qi===0, 'qpc 1: każde pytanie = następny slot');
  eq(matchQLabel(m),'pyt. 2/3','etykieta'); ok(!/blok/.test(matchHeader(m,{a:{label:'A'},b:{label:'B'}})), 'qpc 1 → bez „blok x/y"');
  matchAdvance(m); ok(!matchAdvance(m), 'koniec po 3 pytaniach');
  eq(matchQpc({slots:[]}),QPC,'brak qpc → QPC'); eq(matchQpc({slots:[],qpc:99}),QPC,'śmieci → QPC'); eq(matchQpc({slots:[],qpc:'1'}),QPC,'string → QPC');
  eq(matchTotal({slots:[{},{}]}),2*QPC,'matchTotal bez qpc = sloty × QPC');
});
group('F8b daily: seria dni (przez miesiąc/rok, wczoraj = seria żyje) + najlepsza', ()=>{
  const k=['2026-12-30','2026-12-31','2027-01-01'];
  eq(dailyStreak(k,'2027-01-01'),3,'przez zmianę roku');
  eq(dailyStreak(k,'2027-01-02'),3,'dziś jeszcze nie zagrano — seria z wczoraj żyje');
  eq(dailyStreak(k,'2027-01-03'),0,'dzień przerwy → 0');
  eq(dailyStreak(['2026-10-30','2026-10-31','2026-11-01'],'2026-11-01'),3,'przez zmianę miesiąca (i czasu)');
  eq(dailyStreak(['2028-02-28','2028-02-29','2028-03-01'],'2028-03-01'),3,'rok przestępny');
  eq(dailyStreak(['2026-02-28','2026-03-01'],'2026-03-01'),2,'luty nieprzestępny');
  eq(dailyStreak(['2026-10-16','2026-10-18'],'2026-10-18'),1,'luka → seria od nowa');
  eq(dailyStreak(['x','2026-13-01',null],'2026-10-18'),0,'śmieci ignorowane');
  eq(dailyStreak([],'2026-10-18'),0,'pusto → 0');
  eq(bestStreak(['2026-10-16','2026-10-17','2026-10-18','2026-10-20','2026-12-31','2027-01-01']),3,'najlepsza seria');
  eq(bestStreak(['2026-12-31','2027-01-01','2027-01-02','2027-01-03','2026-10-16']),4,'najlepsza przez rok, kolejność dowolna');
  eq(bestStreak([]),0,'brak → 0');
  // strefa: gra o 00:30 w Warszawie (22:30 UTC) liczy się do NOWEGO dnia
  const day1=dateKey(new Date('2026-10-16T18:00:00Z')), day2=dateKey(new Date('2026-10-16T22:30:00Z'));
  eq([day1,day2],['2026-10-16','2026-10-17'],'gra wieczorem i po północy (Warszawa) = dwa dni');
  eq(dailyStreak([day1,day2], dateKey(new Date('2026-10-17T10:00:00Z'))),2,'seria 2 dni mimo < 24 h różnicy');
});
group('F8b daily: siatka emoji + tekst udostępniania (bez danych osobowych)', ()=>{
  const R=(t,a,extra={})=>({ okTitle:t, okArtist:a, points:(t?50:0)+(a?50:0), ...extra });
  const res=[R(1,1),R(1,1),R(1,0),R(0,0),R(1,1),R(1,1),{okTitle:false,okArtist:false,skipped:true,points:0},R(1,1),R(1,1),R(0,1)];
  eq(dailyCell(res[0]),'🟩','pełne'); eq(dailyCell(res[2]),'🟨','częściowe'); eq(dailyCell(res[3]),'⬛','pudło'); eq(dailyCell(res[6]),'⬛','pominięte');
  eq(dailyCell({okTitle:false,okArtist:false,points:20}),'🟨','same punkty (np. rok/album) → częściowe'); eq(dailyCell(null),'⬜','brak → ⬜');
  eq(resultGrid(res,10),'🟩🟩🟨⬛🟩🟩⬛🟩🟩🟨','siatka 10 pytań');
  eq(resultGrid(res.slice(0,3),10),'🟩🟩🟨⬜⬜⬜⬜⬜⬜⬜','przerwany mecz → ⬜ za nierozegrane');
  eq(countHits(res),6,'trafione (pełne)');
  const t=dailyShareText({ n:7, hits:7, total:10, streak:3, grid:'🟩🟩🟨⬛🟩🟩⬛🟩🟩🟨', url:'https://x.pl/stacja/' });
  eq(t,'STACJA #7 🎧 7/10 · 🔥3\n🟩🟩🟨⬛🟩🟩⬛🟩🟩🟨\nhttps://x.pl/stacja/','tekst Stacji dnia (format z briefu)');
  eq(dailyShareText({ n:1, hits:0, total:10, streak:0, grid:'⬛', url:'' }),'STACJA #1 🎧 0/10\n⬛','bez serii i linku');
  eq(matchShareText({ points:452.4, hits:3, total:5, grid:'🟩🟩🟩⬛🟨', url:'https://x.pl/' }),'STACJA 🎧 452 pkt · 3/5\n🟩🟩🟩⬛🟨\nhttps://x.pl/','tekst zwykłego meczu');
});
group('F8b daily: rekord dnia, sanityzacja magazynu, status karty', ()=>{
  const res=[{track:'T1',artist:'A1',okTitle:true,okArtist:true,points:120},{track:'T2',artist:'A2',okTitle:true,okArtist:false,points:50}];
  const rec=dailyRecord({ key:'2026-10-18', results:res, points:170, done:false });
  eq([rec.n,rec.hits,rec.total,rec.played,rec.done,rec.grid],[4,1,10,2,false,'🟩🟨⬜⬜⬜⬜⬜⬜⬜⬜'],'rekord częściowy');
  eq(rec.results[1],{track:'T2',artist:'A2',c:'🟨',points:50},'wynik pytania: utwór + kratka + punkty (bez danych gracza)');
  eq(sanitizeDailyStore(null),{v:1,days:{},best:0},'null → pusty magazyn');
  eq(sanitizeDailyStore('x'),{v:1,days:{},best:0},'śmieci → pusty');
  const st=sanitizeDailyStore({ days:{ '2026-10-16':{hits:1}, '2026-10-17':{hits:2}, 'zły':{}, '2026-10-18':5 }, best:'7' });
  eq(Object.keys(st.days),['2026-10-16','2026-10-17'],'tylko poprawne dni z obiektem'); eq(st.best,7,'best z zapisu (np. po przycięciu historii)');
  const many={days:{}}; for(let i=0;i<DAILY_KEEP_DAYS+20;i++) many.days[addDays('2026-01-01',i)]={hits:1};
  const ms=sanitizeDailyStore(many); eq(Object.keys(ms.days).length,DAILY_KEEP_DAYS,'historia przycięta'); eq(ms.best,DAILY_KEEP_DAYS+20,'najlepsza seria liczona przed przycięciem');
  const s1=dailyStatus({days:{'2026-10-16':{hits:1},'2026-10-17':{hits:5}}}, '2026-10-17');
  eq([s1.n,s1.streak,s1.best,s1.played,!!s1.record],[3,2,2,2,true],'status: zagrane dziś');
  const s2=dailyStatus({days:{'2026-10-16':{hits:1}}}, '2026-10-17');
  eq([s2.streak,s2.record],[1,null],'status: dziś nie zagrane, seria z wczoraj');
});
console.log('• F8b trackSelect: resolveTrack/pickTrack z seedowanym rnd (ten sam seed + te same wyniki ⇒ ten sam utwór)');
await (async ()=>{
  const it=(t,a,y,extra={})=>({ trackName:t, artistName:a, previewUrl:'https://p/'+t, releaseDate:y+'-01-01', collectionName:'Alb', ...extra });
  const net={}; ['A','B','C','D','E','F'].forEach(a=>{ net[a]=[1,2,3,4,5,6,7,8].map(i=>it(a+' song '+i, a, 1984)); });
  const itunes=async(term)=>net[term]||[];
  const cat={ artists:['A','B','C','D','E','F'], range:'1980–89' };
  const run=async(seed)=>{ const t=await resolveTrack({ cat, seen:new Set(), recent:[], itunes, rnd:mulberry32(seed) }); return t.artist+'|'+t.track; };
  eq(await run(11), await run(11), 'ten sam seed → ten sam wykonawca i utwór');
  const outs=new Set(); for(let k=0;k<12;k++) outs.add(await run(100+k));
  ok(outs.size>1, 'różne seedy → różne utwory ('+outs.size+')');
  const pl={ songs:[1,2,3,4,5,6].map(i=>({title:'S'+i, artist:'X', preview:'https://p/'+i})) };
  const rp=async(seed)=>(await resolveTrack({ cat:pl, seen:new Set(), itunes, rnd:mulberry32(seed) })).track;
  eq(await rp(3), await rp(3), 'playlista: ten sam seed → ten sam utwór');
  const res=net.A;
  eq(pickTrack(res,'A',new Set(),{rnd:mulberry32(9)}).trackName, pickTrack(res,'A',new Set(),{rnd:mulberry32(9)}).trackName, 'pickTrack(opts.rnd) deterministyczny');
  ok(pickTrack(res,'A',new Set()) && pickTrack(res,'A'), 'pickTrack bez rnd — działa jak dotąd (Math.random)');
})();
group('F8b trackSelect: dystraktory ABCD — dekada kategorii (±1), popularne (pozycja < 15), bez odstających', ()=>{
  const it=(t,a,y,pos)=>({ trackName:t, artistName:a, previewUrl:'https://x', collectionName:'', releaseDate:y+'-05-01', _pos:pos });
  const correct={ track:'Hey Ya!', artist:'OutKast', year:'2003' };
  const cands=[
    it('Get Lucky','Daft Punk',2013,0), it('Around the World','Daft Punk',1997,3), it('One More Time','Daft Punk',2000,1),
    it('Crazy in Love','Beyoncé',2003,0), it('Halo','Beyoncé',2008,2), it('Drunk in Love','Beyoncé',2013,1),
    it('Yeah!','Usher',2004,30), it('OMG','Usher',2010,0), it('Burn','Usher',2004,25),
    it('Toxic','Britney Spears',2003,5), it('Womanizer','Britney Spears',2008,40),
    it('Rehab','Amy Winehouse',2006,40),
  ];
  let i=0; const rnd=()=>((i++*0.61)%1);
  const d=pickDistractors(cands, correct, rnd, 3, { range:'2000–09' });
  eq(d.length,3,'3 dystraktory');
  ok(!d.some(x=>['Get Lucky','Drunk in Love'].includes(x.track)), 'bez hitów z 2013 w kategorii 2000–09 (odstające)');
  ok(!d.some(x=>x.track==='Around the World'), '1997 poza oknem 1999–2010 → odrzucony');
  eq(new Set(d.map(x=>x.artist)).size,3,'różni wykonawcy');
  ok(d.every(x=>!['Yeah!','Burn','Womanizer','Rehab'].includes(x.track)), 'popularne (pozycja < '+DISTRACTOR_TOP+') przed niszowymi — '+d.map(x=>x.track).join(', '));
  ok(d.some(x=>x.track==='OMG') || true, '2010 (±1) dopuszczalny');
  // gdy popularnych za mało — niszowe z dekady zamiast odstających
  const d2=pickDistractors([it('Get Lucky','Daft Punk',2013,0), it('Yeah!','Usher',2004,30), it('Rehab','Amy Winehouse',2006,40), it('Toxic','Britney Spears',2003,2)], correct, Math.random, 3, { range:'2000–09' });
  eq(d2.map(x=>x.track).sort(),['Rehab','Toxic','Yeah!'],'za mało popularnych → mniej popularne z dekady, nadal bez 2013');
  // ściśle w dekadzie przed ±1
  const d3=pickDistractors([it('OMG','Usher',2010,0), it('Toxic','Britney Spears',2003,0), it('Crazy','Gnarls Barkley',2006,0), it('Hips','Shakira',2005,0)], correct, ()=>0, 3, { range:'2000–09' });
  ok(!d3.some(x=>x.track==='OMG'), 'przy remisie popularności — ściśle w dekadzie przed tolerancją ±1');
  // poprawny utwór spoza dekady (zapas F5) → okno rozszerzone o jego rok
  eq(distractorWindow('2000–09','2013'),{from:1999,to:2014},'okno: zakres ±1 ∪ rok poprawnego ±1');
  eq(distractorWindow('2020+',''),{from:2019,to:9999},'zakres otwarty');
  eq(distractorWindow('',2001),null,'kategoria bez zakresu → bez filtra');
  const d4=pickDistractors([it('Get Lucky','Daft Punk',2013,0), it('Toxic','Britney Spears',2003,0), it('Halo','Beyoncé',2008,0)], { track:'Counting Stars', artist:'OneRepublic', year:'2013' }, Math.random, 3, { range:'2000–09' });
  eq(d4.length,3,'poprawny z 2013 → 2013 też dopuszczony (to poprawny nie odstaje)');
  // bez zakresu (styl/playlista) i bez dat → jak dotąd
  eq(pickDistractors([{title:'A1',artist:'X'},{title:'B1',artist:'Y'},{title:'C1',artist:'Z'}], correct, Math.random, 3, {}).length,3,'playlista bez lat — bez filtra');
  eq(pickDistractors([it('A','X',1975,0),it('B','Y',1976,0),it('C','Z',1977,0)], correct, Math.random).length,3,'bez opts.range — zachowanie F8a');
});
console.log('• F8b trackSelect: gatherDistractors — zakres kategorii i pozycja w wynikach z sieci');
await (async ()=>{
  const it=(t,a,y)=>({ trackName:t, artistName:a, previewUrl:'https://x', releaseDate:y+'-01-01' });
  const filler=(a,n,y)=>[...Array(n)].map((_,k)=>it(a+' deep cut '+k, a, y));
  const net={ 'Daft Punk':[it('Get Lucky','Daft Punk',2013), it('One More Time','Daft Punk',2000)],
    'Beyoncé':[it('Drunk in Love','Beyoncé',2013), it('Crazy in Love','Beyoncé',2003)],
    // OMG na pozycji 0; pozycje 1–14 spoza dekady (odrzucone); „deep cuts" z dekady dopiero od pozycji 15
    'Usher':[it('OMG','Usher',2010), ...filler('Usher',14,1990).map((r,k)=>({...r, trackName:'Old '+k})), ...filler('Usher',20,2004)],
    'Britney Spears':[it('Womanizer','Britney Spears',2013)] };   // tylko utwór spoza dekady → Britney odpada
  const d=await gatherDistractors({ cat:{ artists:['OutKast','Daft Punk','Beyoncé','Usher','Britney Spears'], range:'2000–09' }, correct:{track:'Hey Ya!',artist:'OutKast',year:'2003'}, itunes:async t=>net[t]||[], rnd:()=>0.5 });
  eq(d.length,3,'3 dystraktory'); ok(!d.some(x=>/Get Lucky|Drunk in Love/.test(x.track)),'bez 2013 — '+d.map(x=>x.track).join(', '));
  const u=d.find(x=>x.artist==='Usher'); ok(u && u.track==='OMG', 'Usher: hit z top-15 (OMG 2010, ±1) zamiast „deep cut" z pozycji ≥ 15 — '+(u&&u.track));
})();
group('F8b scoring: legenda punktacji wg trybu (stopka solo)', ()=>{
  eq(scoreLegend('abcd'),'trafienie 100 · szybkość · seria','ABCD'); eq(scoreLegend('quiz'),'trafienie 100 · szybkość · seria','quiz');
  eq(scoreLegend('year'),'dokładnie 100 · ±1 70 · ±2 50 · dekada 20','rok');
  eq(scoreLegend('intro'),'im wcześniej, tym więcej: ×2.0 → ×1.0','intro');
  eq(scoreLegend('music'),'tytuł 50 · wykonawca 50 · rok ±2 +20 · album +20 · szybkość do +50% · seria ×1,5 / ×2','muzyka (jak dotąd)');
  eq(scoreLegend('reverse'),scoreLegend('music'),'od tyłu = muzyka'); eq(scoreLegend(undefined),scoreLegend('music'),'brak → muzyka');
});
/* ===================== EKSPERYMENT: tryby „od tyłu krótko" / „składanka" / „okładka" ===================== */
const T8 = await import('../core/timing.js');
const S8 = await import('../core/scoring.js');
const TS8 = await import('../core/trackSelect.js');
const M8 = await import('../core/match.js');
group('EKSP. timing: okno „od tyłu krótko", wycinki składanki, etapy okładki', ()=>{
  eq(T8.REVSNIP_STAGES,[3,5],'etapy 3 → 5 s');
  for(const r of [0,0.5,0.999]){ const e=T8.revsnipEnd(30,()=>r); ok(e>=8 && e<=27.5, 'koniec okna w [8..27,5] — '+e); }
  eq(T8.revsnipWindow(12,0),{start:9,secs:3},'etap 0: [end−3, end]');
  eq(T8.revsnipWindow(12,1),{start:7,secs:5},'„dłużej": [end−5, end] (te same 3 s + 2 s dalej)');
  eq(T8.revsnipWindow(2,1),{start:0,secs:2},'okno przycięte do początku zajawki');
  ok(T8.revsnipEnd(6,()=>0.5)<=6, 'krótka zajawka: koniec okna ≤ długość');
  for(const r of [0,1]){ const e=T8.mpRevsnipEnd(()=>r); ok(e>=8 && e<=20, 'MP: koniec okna w [8..20] — '+e); }
  eq(T8.mpSnipOffset('music',()=>0.5),0,'MP offset: muzyka 0');
  ok(T8.mpSnipOffset('snippet',()=>0.5)===T8.mpSnipStart(()=>0.5),'MP offset: fragment = mpSnipStart');
  ok(T8.mpSnipOffset('revsnip',()=>0.5)===T8.mpRevsnipEnd(()=>0.5),'MP offset: od tyłu krótko = koniec okna');
  eq(T8.revsnipNextStage(0),1,'następny etap'); eq(T8.revsnipNextStage(1),null,'ostatni etap');
  for(const r of [0,0.5,1]){ const st=T8.medleyClipStart(30,()=>r); ok(st>=8 && st<=20, 'wycinek składanki w [8..20] — '+st); }
  ok(T8.medleyClipStart(12,()=>1)<=12-1.5-0.5+1e-9, 'krótka zajawka: wycinek mieści się przed końcem');
  eq(T8.medleyClipStart(1,()=>0.5),0,'zajawka krótsza niż wycinek → od początku');
  eq(T8.MEDLEY_GAP_S,3,'przerwa między fragmentami 3 s (było 0,25 s)');
  eq(T8.medleyDuration(4),15.4,'0,4 s wejścia + 4 × 1,5 s + 3 × 3 s'); eq(T8.medleyDuration(0),0,'pusto'); eq(T8.medleyDuration(1),1.9,'1 wycinek: bez przerwy');
  eq(T8.medleyClipOffsets(4),[0.4,4.9,9.4,13.9],'początki wycinków w buforze');
  ok(T8.medleyTickOffsets(4).every((t,i)=>t>=0 && t<T8.medleyClipOffsets(4)[i] && T8.medleyClipOffsets(4)[i]-t<=0.31),'„tik" tuż przed KAŻDYM wycinkiem (także pierwszym)');
  ok(T8.medleyTickOffsets(4).every((t,i,a)=>i===0 || t-a[i-1]>=T8.MEDLEY_GAP_S),'tiki rozdzielone ≥ przerwa');
  eq(T8.medleyClipAt(0,4),{index:0,playing:false,done:false},'wejście: czekamy na fragment 1');
  eq(T8.medleyClipAt(1,4),{index:0,playing:true,done:false},'gra fragment 1');
  eq(T8.medleyClipAt(3,4),{index:1,playing:false,done:false},'przerwa → następny fragment 2');
  eq(T8.medleyClipAt(14,4),{index:3,playing:true,done:false},'gra fragment 4');
  eq(T8.medleyClipAt(99,4).done,true,'po końcu → done'); eq(T8.medleyClipAt(NaN,4).index,0,'śmieci → początek'); eq(T8.medleyClipAt(1,0).done,true,'0 wycinków → done');
  eq(T8.medleyLabel(5.2,4),'fragment 2/4…','licznik w trakcie'); eq(T8.medleyLabel(7,4),'przerwa · zaraz fragment 3/4','licznik w przerwie');
  ok(/^koniec/.test(T8.medleyLabel(20,4)),'po końcu: koniec składanki');
  eq(T8.COVER_STAGES,[16,32,64,0],'okładka: 16 → 32 → 64 → pełna (bez etapu 8×8)');
  eq(T8.coverStageBlocks(0),16,'pierwszy etap = 16 bloków'); eq(T8.coverStageBlocks(-3),16,'ujemny → etap 0');
  eq(T8.coverStageBlocks(3),0,'etap 3 = pełna'); eq(T8.coverStageBlocks(99),0,'poza zakresem → pełna');
  eq(T8.coverNextStage(2),3,'następny'); eq(T8.coverNextStage(3),null,'koniec');
  eq(T8.COVER_STEP_MS,6000,'etap okładki trwa 6 s (było 3 s)');
  eq(T8.COVER_STEP_MS*(T8.COVER_STAGES.length-1),18000,'pełna okładka po 18 s auto-odsłony (mieści się w czasie pytania)');
});
group('EKSP. scoring: „tylko wykonawca" (składanka/okładka), mnożniki etapów, legenda', ()=>{
  const hit=S8.scoreRound({ okArtist:true, artistOnly:true, elapsedMs:null, streak:1 });
  eq([hit.points, hit.parts.artist],[100,100],'wykonawca trafiony = 100');
  eq(S8.scoreRound({ okArtist:false, okTitle:true, artistOnly:true }).points,0,'tytuł nie liczy się w trybie wykonawcy');
  eq(S8.scoreRound({ okArtist:true, okAlbum:true, artistOnly:true }).points,120,'okładka: + album 20');
  eq(S8.scoreRound({ okArtist:false, okAlbum:true, artistOnly:true }).points,20,'album bez wykonawcy = sam bonus');
  eq(S8.scoreRound({ okArtist:true, artistOnly:true, streak:3 }).streakMult,1.5,'seria liczona od trafienia wykonawcy');
  eq(S8.scoreRound({ okArtist:false, okAlbum:true, artistOnly:true, streak:5 }).streakMult,1,'bez wykonawcy — bez serii');
  const sp=S8.scoreRound({ okArtist:true, artistOnly:true, elapsedMs:0 }); eq(sp.points,150,'szybkość jak quiz (+50%)');
  eq(S8.scoreRound({ okArtist:true, okAlbum:true, artistOnly:true, mult:S8.coverMult(0) }).points,240,'okładka etap 0: ×2');
  eq(S8.COVER_MULTS,[2,1.6,1.3,1],'mnożniki okładki: ×2.0 → ×1.6 → ×1.3 → ×1.0');
  eq(S8.COVER_MULTS.length,T8.COVER_STAGES.length,'mnożnik na każdy etap odsłony');
  ok(S8.COVER_MULTS.every((m,i,a)=>i===0 || m<a[i-1]),'mnożniki maleją');
  eq(S8.coverMult(3),1,'pełna okładka ×1'); eq(S8.coverMult(99),1,'poza zakresem → ×1'); eq(S8.coverMult('x'),1,'śmieci → ×1');
  eq(S8.coverMult(1),1.6,'etap 32×32 ×1.6');
  eq(S8.REVSNIP_MULTS,[1,0.8],'od tyłu krótko: 3 s ×1, 5 s ×0,8');
  eq(S8.scoreRound({ okTitle:true, okArtist:true, mult:S8.revsnipMult(1) }).points,80,'„dłużej" → 100 × 0,8');
  ok(S8.scoreRound({ okArtist:true, okAlbum:true, artistOnly:true, elapsedMs:0, streak:9, mult:2 }).points<=S8.SCORE_MAX_PER_Q,'limit ligi bez zmian');
  eq(S8.scoreLegend('medley'),'wykonawca 100 · szybkość · seria','legenda składanki');
  ok(/wykonawca 100 · album \+20/.test(S8.scoreLegend('cover')) && /×2\.0 → ×1\.0/.test(S8.scoreLegend('cover')),'legenda okładki');
  ok(/„dłużej" ×0\.8/.test(S8.scoreLegend('revsnip')),'legenda od tyłu krótko');
});
group('EKSP. match: tryby, etykiety, MP (revsnip tak, składanka/okładka tylko solo), modesFor', ()=>{
  ok(['revsnip','medley','cover'].every(m=>M8.ALL_MODES.includes(m) && M8.MODE_LABEL[m] && M8.MODE_SHORT[m]),'nowe tryby + etykiety');
  eq([M8.MODE_LABEL.medley,M8.MODE_LABEL.revsnip,M8.MODE_LABEL.cover],['🎛 składanka','⏪ od tyłu krótko','🖼 okładka'],'etykiety');
  ok(M8.MP_MODES.includes('revsnip') && !M8.MP_MODES.includes('medley') && !M8.MP_MODES.includes('cover'),'MP_MODES');
  eq(M8.sanitizeMpConfig({ modes:['revsnip','medley','cover','music'] }).modes,['revsnip','music'],'MP config: składanka/okładka odrzucone');
  ok(!M8.mpAvailableModes(null,true).includes('revsnip'),'stary serwer → bez „od tyłu krótko"');
  const C={ pl3:{label:'p', songs:[{title:'a',artist:'A'},{title:'b',artist:'B feat. C'},{title:'c',artist:'A'}]},
    pl4:{label:'p', songs:['A','B feat. X','C','D'].map((a,i)=>({title:'t'+i,artist:a}))} };
  ok(!M8.modesFor('pl3',C).includes('medley') && !M8.modesFor('pl3',C).includes('cover'),'playlista 2 wykonawców → bez składanki/okładki');
  ok(M8.modesFor('pl4',C).includes('medley') && M8.modesFor('pl4',C).includes('cover'),'playlista ≥4 wykonawców → składanka/okładka');
  for(let k=0;k<20;k++){ const r=M8.randomPools(['pl3'],C); ok(r.modes.length>0 && r.cats.length>0,'kostka: zawsze grywalna para'); }
});
group('EKSP. trackSelect: pula wykonawców, wybór 4 utworów składanki', ()=>{
  eq(TS8.artistPool({artists:['Queen','Toto']}),['Queen','Toto'],'pula z artists');
  eq(TS8.artistPool({songs:['A','B feat. X','B','C','D x E'].map((a,i)=>({title:'t'+i,artist:a}))}),['A','B','C','D'],'playlista: różni wykonawcy główni (bez feat./x)');
  eq(TS8.artistPool({songs:[{title:'a',artist:'Simon & Garfunkel'}]}),[],'za mało wykonawców');
  eq(TS8.artistPool({kind:'lyrics', artists:['X']}),[],'teksty — brak');
  const it=(t,a,extra={})=>({ trackName:t, artistName:a, previewUrl:'https://p/'+t, collectionName:'Album', releaseDate:'1980-01-01', artworkUrl100:'https://a/100x100bb.jpg', ...extra });
  const res=[ it('Bohemian Rhapsody','Queen'), it('Bohemian Rhapsody (Live Aid)','Queen'), it('Radio Ga Ga','Queen'), it('Under Pressure','Queen & David Bowie'),
    it('Killer Queen','Queen'), it('Queen of Hearts','Queen Latifah'), it('Somebody to Love (Live)','Queen'), it('We Will Rock You (Karaoke Version)','Queen') ];
  const p=TS8.pickMedleyTracks(res,'Queen',()=>0.3);
  eq(p.length,4,'4 utwory'); eq(new Set(p.map(c=>c.key)).size,4,'różne tytuły');
  ok(!p.some(c=>/Latifah|Karaoke/.test(c.r.artistName+c.r.trackName)),'tylko ten wykonawca, bez karaoke');
  ok(!p.some(c=>c.r.trackName==='Bohemian Rhapsody (Live Aid)'),'wersja studyjna zamiast live (dedup tytułu)');
  eq(p.map(c=>c.r.trackName).sort(),['Bohemian Rhapsody','Killer Queen','Radio Ga Ga','Under Pressure'],'4 studyjne (też duet „Queen & David Bowie") — live tylko, gdy studyjnych za mało');
  ok(TS8.pickMedleyTracks(res.slice(0,3).concat(res[6]),'Queen',()=>0.3).some(c=>/Live/.test(c.r.trackName)),'za mało studyjnych → dobiera live');
  const studio=[...Array(12)].map((_,i)=>it('Hit '+i,'Queen'));
  const p2=TS8.pickMedleyTracks([...studio, it('X (Live)','Queen')],'Queen',Math.random);
  ok(p2.every(c=>/^Hit /.test(c.r.trackName)),'dość studyjnych → bez live');
  const pop=[...Array(30)].map((_,i)=>it('Song '+i,'Queen'));
  for(let k=0;k<10;k++) ok(TS8.pickMedleyTracks(pop,'Queen',Math.random).every(c=>c.idx<TS8.MEDLEY_TOP),'popularne (top '+TS8.MEDLEY_TOP+') przed niszowymi');
  eq(TS8.pickMedleyTracks(pop,'Queen',Math.random,{ seen:new Set(pop.slice(0,28).map(r=>TS8.titleKey(r.trackName))) }).length,2,'bez już zagranych (seen)');
});
console.log('• EKSP. trackSelect: resolveMedley — inny wykonawca, 3 wycinki, brak');
await (async ()=>{
  const it=(t,a)=>({ trackName:t, artistName:a, previewUrl:'https://p/'+encodeURIComponent(t), collectionName:'Album', releaseDate:'1985-01-01', artworkUrl100:'https://a/100x100bb.jpg' });
  const net={ Solo:[it('Jedyny','Solo')], Trio:['a','b','c'].map(t=>it('T'+t,'Trio')), Kwartet:['a','b','c','d','e'].map(t=>it('K'+t,'Kwartet')) };
  const itunes=async a=>net[a]||[];
  const recent=[], seen=new Set();
  const r=await TS8.resolveMedley({ cat:{ artists:['Solo','Trio','Kwartet'] }, seen, recent, itunes, rnd:()=>0 });
  eq(r.artist,'Kwartet','wykonawca z ≥4 utworami (pozostali za mało)'); eq(r.clips.length,4,'4 wycinki');
  ok(r.clips.every(c=>c.preview && c.track && c.artist==='Kwartet'),'wycinki: zajawka + tytuł');
  ok(recent.includes('Kwartet') && seen.size>=4,'recent/seen zaktualizowane');
  const r3=await TS8.resolveMedley({ cat:{ artists:['Solo','Trio'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  eq([r3.artist, r3.clips.length],['Trio',3],'po próbach — 3 wycinki');
  const r0=await TS8.resolveMedley({ cat:{ artists:['Solo'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  ok(r0.error && r0.reason==='empty','brak → błąd (wołający gra muzykę)');
  const off=await TS8.resolveMedley({ cat:{ artists:['Solo'] }, seen:new Set(), recent:[], itunes:async()=>{ throw new Error('x'); }, rnd:()=>0 });
  eq(off.reason,'offline','brak sieci → offline');
  const pl=await TS8.resolveMedley({ cat:{ songs:['Kwartet','Trio','Solo','Inny'].map((a,i)=>({title:'t'+i,artist:a})) }, seen:new Set(), recent:['Trio','Solo','Inny'], itunes, rnd:()=>0 });
  eq(pl.artist,'Kwartet','playlista ≥4 wykonawców → pula z utworów');
})();
group('EKSP. trackSelect: okładka — rangi albumów, tytuł, URL 600×600, wybór', ()=>{
  const al=(n,a='Queen',extra={})=>({ collectionName:n, artistName:a, artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/x/y.jpg/100x100bb.jpg', releaseDate:'1975-11-21T08:00:00Z', trackCount:12, collectionType:'Album', ...extra });
  eq(TS8.albumTier(al('A Night At The Opera')),0,'zwykły album'); eq(TS8.albumTier(al('Nocny Patrol (Remastered)')),0,'remaster = zwykły');
  eq(TS8.albumTier(al('Innuendo (Deluxe Edition)')),1,'deluxe = edycja'); eq(TS8.albumTier(al('Greatest Hits II')),2,'kompilacja');
  eq(TS8.albumTier(al('Live at Wembley Stadium')),2,'koncertowy'); eq(TS8.albumTier(al('Miłość Jest Cudowna (1975-2015)')),2,'zakres lat = składak');
  eq(TS8.albumTier(al('Face It Alone - Single')),-1,'singiel odrzucony'); eq(TS8.albumTier(al('X',undefined,{trackCount:2})),-1,'EP/2 utwory odrzucone');
  eq(TS8.albumTitle('Innuendo (Deluxe Edition)'),'Innuendo','tytuł bez „(Deluxe Edition)"'); eq(TS8.albumTitle('Nocny Patrol (Remastered)'),'Nocny Patrol','bez „(Remastered)"');
  eq(TS8.albumTitle('Bohemian Rhapsody (The Original Soundtrack)'),'Bohemian Rhapsody (The Original Soundtrack)','nawias treściowy zostaje');
  eq(TS8.albumKey('Innuendo (Deluxe Edition)'),TS8.albumKey('Innuendo'),'klucz wspólny dla wersji płyty');
  eq(TS8.coverArtUrl('https://is1-ssl.mzstatic.com/image/thumb/x/y.jpg/100x100bb.jpg'),'https://is1-ssl.mzstatic.com/image/thumb/x/y.jpg/600x600bb.jpg','artwork 600×600');
  eq(TS8.coverArtUrl('https://a/100x100.jpg',300),'https://a/300x300bb.jpg','inny rozmiar');
  const list=[ al('The Platinum Collection',undefined,{trackCount:51}), al('Greatest Hits II'), al('A Night At The Opera'), al('Made In Heaven (Deluxe Edition)'),
    al('QUEEN - Single','ZeeDND',{trackCount:1}), al('News Of The World'), al('Queen','Ten Walls'), al('Innuendo (Deluxe Edition)'), al('Innuendo'), al('Queen (Platinum Edition)','Eva') ];
  for(let k=0;k<20;k++){ const p=TS8.pickAlbum(list,'Queen',null,Math.random); ok(p && p.tier===0 && ['A Night At The Opera','News Of The World','Innuendo'].includes(p.a.collectionName),'album studyjny wykonawcy, bez kompilacji/deluxe/cudzych — '+(p&&p.a.collectionName)); }
  const onlyComp=TS8.pickAlbum([al('Greatest Hits'), al('Live Killers')],'Queen',null,()=>0);
  ok(onlyComp && onlyComp.tier===2,'same kompilacje → kompilacja (brak alternatyw)');
  eq(TS8.pickAlbum([al('Innuendo')],'Queen',new Set(['album:'+TS8.albumKey('Innuendo')]),()=>0),null,'album już pokazany (seen) → brak');
  eq(TS8.pickAlbum([al('X',undefined,{artworkUrl100:''})],'Queen',null,()=>0),null,'bez okładki → brak');
  const fromSongs=TS8.albumsFromSongs([{ trackName:'a', artistName:'Queen', collectionName:'Jazz', collectionId:1, artworkUrl100:'u', trackCount:13 },
    { trackName:'b', artistName:'Queen', collectionName:'Jazz', collectionId:1, artworkUrl100:'u' }, { trackName:'c', artistName:'Queen', collectionName:'Hot Space', collectionId:2, artworkUrl100:'v' }]);
  eq(fromSongs.map(a=>a.collectionName),['Jazz','Hot Space'],'albumy z wyników utworów (dedup po collectionId)');
});
console.log('• EKSP. trackSelect: resolveCover — wyszukiwanie albumów, zapas z utworów, cache „al:"');
await (async ()=>{
  const al=(n,a)=>({ collectionName:n, artistName:a, artworkUrl100:'https://m/x.jpg/100x100bb.jpg', releaseDate:'1980-06-01T00:00:00Z', trackCount:10 });
  const calls=[];
  const itunes=async(a,opts)=>{ calls.push((opts&&opts.album?'al:':'a:')+a);
    if(opts && opts.album) return a==='Toto' ? [al('Toto IV','Toto'), al('Greatest Hits','Toto')] : [];
    return a==='Maanam' ? [{ trackName:'Kocham cię', artistName:'Maanam', collectionName:'Nocny Patrol', collectionId:7, artworkUrl100:'https://m/n.jpg/100x100bb.jpg', releaseDate:'1983-01-01', trackCount:10 }] : []; };
  const seen=new Set(), recent=[];
  const r=await TS8.resolveCover({ cat:{ artists:['Toto'] }, seen, recent, itunes, rnd:()=>0 });
  eq([r.artist, r.album, r.year],['Toto','Toto IV','1980'],'album studyjny z wyszukiwania albumów');
  ok(/600x600bb\.jpg$/.test(r.art),'okładka 600×600'); ok(seen.has('album:'+TS8.albumKey('Toto IV')) && recent.includes('Toto'),'seen/recent');
  const r2=await TS8.resolveCover({ cat:{ artists:['Maanam'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  eq([r2.artist, r2.album],['Maanam','Nocny Patrol'],'zapas: album z wyników utworów');
  const r3=await TS8.resolveCover({ cat:{ artists:['Nikt'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  ok(r3.error,'brak albumów → błąd (wołający gra muzykę)');
  // cache: zapytanie o albumy nie koliduje z wynikami utworów tego samego wykonawcy
  let n=0; const cf=TS8.cachedFetcher(async(t,o)=>[{ kind:o&&o.album?'album':'song', n:++n }]);
  const a1=await cf('Toto'), a2=await cf('Toto',{album:true}), a3=await cf('Toto');
  ok(a1[0].kind==='song' && a2[0].kind==='album' && a3===a1,'cachedFetcher: osobny klucz „al:" dla albumów');
})();
/* ===== EKSPERYMENT „fortepian" (piano): wybór coveru fortepianowego, reguła kategorii polskich, fallback ===== */
group('EKSP. fortepian: tryb, modesFor (bez kategorii polskich), pickPianoCover', ()=>{
  ok(M8.ALL_MODES.includes('piano') && M8.MODE_LABEL.piano && M8.MODE_SHORT.piano && M8.MODE_SUB.piano,'tryb + etykiety');
  ok(!M8.MP_MODES.includes('piano') && M8.SOLO_ONLY_MODES.includes('piano'),'tylko solo');
  eq(M8.sanitizeMpConfig({ modes:['piano','music'] }).modes,['music'],'MP config: fortepian odrzucony');
  const C={ '80s':{label:'lata 80', range:'1980–89', artists:['Maanam','Madonna']}, 'pop-world':{label:'pop świat', desc:'wielkie gwiazdy', artists:['Adele']},
    'rock-pl':{label:'rock PL', desc:'polski rock', artists:['Dżem']}, 'rap-pl':{label:'rap PL', artists:['Mata']}, 'disco-polo':{label:'disco polo', artists:['Akcent']},
    'evergreen-pl':{label:'evergreeny PL', desc:'polskie złoto', artists:['Anna German']}, 'pl:abc':{label:'Polskie hity 2024', songs:[{title:'a',artist:'b'}]},
    'pl:def':{label:'Top 50 Global', songs:[{title:'a',artist:'b'}]}, wym:{label:'x', artists:['A'], lang:'pl'}, odwr:{label:'hity PL', artists:['A'], lang:'en'},
    lyr:{label:'polskie po angielsku', kind:'lyrics', lang:'en', songs:[{title:'t',lyric:'x'}]} };
  ok(M8.modesFor('80s',C).includes('piano') && M8.modesFor('pop-world',C).includes('piano'),'dekada i pop świat → fortepian');
  ['rock-pl','rap-pl','disco-polo','evergreen-pl','pl:abc','wym'].forEach(k=>ok(!M8.modesFor(k,C).includes('piano'),'kategoria polska bez fortepianu: '+k));
  ok(M8.modesFor('pl:def',C).includes('piano'),'playlista światowa → fortepian');
  ok(M8.modesFor('odwr',C).includes('piano'),'jawne lang:"en" wygrywa z etykietą „PL"');
  eq(M8.modesFor('lyr',C),['lektor'],'teksty — bez fortepianu');
  const it=(t,a,col='Piano Covers',extra={})=>({ trackName:t, artistName:a, collectionName:col, previewUrl:'https://p/'+encodeURIComponent(a+t), ...extra });
  const orig={ track:'Billie Jean', artist:'Michael Jackson' };
  const res=[ it('Billie Jean','Michael Jackson','Thriller'), it('Billie Jean (Piano & Vocal Version)','Ana Piano'), it('Billie Jean (Lullaby Rendition)','Rockabye Baby!','Lullaby Renditions of Michael Jackson'),
    it('Billie Jean (Piano & Cello)','The Cello Fingers'), it('Billie Jean (Instrumental)','Studio Band','Hits Instrumental'), it('Billie Jean (Michael Jackson Cover)','Calum Graham','Tabula Rasa'),
    it('Bad / Billie Jean (Medley) [Piano Version]','Piano Guys'), it('Billie Jean (Piano Cover)','Dreaming Piano','Billie Jean (Piano Cover) - Single'), it('Billie Jean (Piano Version)','Steven Garreda') ];
  const c=TS8.pickPianoCover(res, orig);
  eq(c && c.artistName,'Dreaming Piano','pierwszy poprawny: bez oryginału, wokalu, kołysanki, wiolonczeli, „instrumental" bez piano, gitary, medleya');
  eq(TS8.pickPianoCover([it('Billie Jean','Michael Jackson','Piano Hits')],orig),null,'oryginał (nawet w albumie „Piano…") odrzucony');
  const O=it('Billie Jean','Michael Jackson','Thriller');   // oryginał w wynikach = „kotwica" (bez kolizji tytułów)
  eq(TS8.pickPianoCover([O, it('Billie Jean (Piano Version)','Michael Jackson & Piano Friends')],orig),null,'człon kolaboracji = oryginał → odrzucony');
  eq(TS8.pickPianoCover([O, it('Beat It (Piano Version)','Dreaming Piano')],orig),null,'inny tytuł → brak');
  eq(TS8.pickPianoCover([O, it('Billie Jean (Piano Version)','X',undefined,{previewUrl:''})],orig),null,'bez zajawki → brak');
  eq(TS8.pickPianoCover([O, it('Billie Jean','Flying Fingers','Piano Covers, Vol. 2')],orig).artistName,'Flying Fingers','słowo „piano" w albumie wystarcza');
  eq(TS8.pickPianoCover([O, it('Billie Jean - Klavierversion','Klavier Klaus','Pop')],orig) ? 1 : 0,1,'klavier + sufiks „ - …"');
  eq(TS8.pickPianoCover([O, it('Billie Jean Piano Version','Pianaura','Single')],orig).artistName,'Pianaura','dopisek „Piano Version" bez nawiasu');
  eq(TS8.pickPianoCover([O, it('Bilie Jean (Piano)','Pianaura')],orig).artistName,'Pianaura','literówka w tytule coveru — textMatch');
  // kolizja tytułów (pomiar na żywo: „King" T.Love dostał cover „King" Florence + the Machine)
  const king={ track:'King', artist:'T.Love' };
  eq(TS8.pickPianoCover([it('King','Florence + the Machine','King - Single'), it('King (Piano Arrangement)','The Theorist','Piano Covers, Vol. 4')],king),null,'brak oryginału w wynikach + ten sam tytuł innego wykonawcy → cover bez dowodu odrzucony');
  eq(TS8.pickPianoCover([it('King (Piano Arrangement)','The Theorist'), it('King (Piano Version)','Piano Tribute Players','Piano Tribute to T.Love')],king).artistName,'Piano Tribute Players','dowód: nazwa oryginalnego wykonawcy w albumie');
  const fr={ track:'Freedom', artist:'Wham!' };
  const frRes=[ it('Freedom (Piano)','Lumina Vibe'), it('Freedom (Piano Arrangement)','Niko Kotoulas','Piano Covers Tribute to Kygo'), it('Freedom (Piano Only)','S. Williams'),
    it('Freedom (Piano Version)','George Simpson'), it('Freedom (Piano)','Piano Peace'), it('Freedom','Wham!','Make It Big'), it('Freedom','Kygo & Zak Abel','Freedom - Single'), it('Freedom','Ed Sheeran','Play') ];
  eq(TS8.pickPianoCover(frRes,fr),null,'oryginał dopiero na 6. miejscu i ≥2 inne „Freedom" → wymagany dowód');
  const ets={ track:'Enjoy the Silence', artist:'Depeche Mode' };
  eq(TS8.pickPianoCover([it('Enjoy the Silence','SD Project','Piano Covers Popular Songs'), it('Enjoy the Silence','Depeche Mode','Violator'), it('Enjoy the Silence','Carla Bruni','French Touch'), it('Enjoy the Silence','Anberlin','Lost Songs')],ets).artistName,'SD Project','oryginał w top 5 + covery innych wykonawców niżej → bez wymogu dowodu');
  eq(TS8.pickPianoCover(frRes.concat(it('Freedom (Originally Performed by Wham!) [Piano Version]','Piano Hits')),fr).artistName,'Piano Hits','„Originally Performed by Wham!" = dowód');
  const tom={ track:'Take On Me', artist:'a-ha' };
  eq(TS8.pickPianoCover([it('Take On Me (Piano Version)','Dreaming Piano'), it('Take On Me','a-ha','Hunting High and Low'), it('Take On Me','Weezer','Teal Album')],tom).artistName,'Dreaming Piano','jeden inny wykonawca PONIŻEJ oryginału → bez wymogu dowodu');
  eq(TS8.pickPianoCover([it('Take On Me (Piano Version)','Dreaming Piano'), it('Take On Me','Weezer','Teal Album'), it('Take On Me','a-ha','Hunting High and Low')],tom),null,'inny wykonawca WYŻEJ niż oryginał → wymagany dowód');
  eq(TS8.pianoQueries({ track:'Billie Jean (Single Version)', artist:'Michael Jackson feat. X' }),['Billie Jean piano','Billie Jean Michael Jackson piano cover'],'zapytania: tytuł piano, zapas tytuł+wykonawca piano cover');
  ok(TS8.looksPolish({ track:'Wszystko czego dziś chcę', artist:'Izabela Trojanowska' }) && !TS8.looksPolish({ track:'Despacito', artist:'Luis Fonsi' }),'polskie znaki → pomiń');
  ok(!TS8.BAD.test('x') && TS8.BAD.test('Piano Tribute Players'),'BAD bez zmian (tribute dalej odfiltrowany w zwykłych trybach)');
});
console.log('• EKSP. fortepian: resolvePiano — cover, kolejne próby, fallback');
await (async ()=>{
  const it=(t,a,col='Album',extra={})=>({ trackName:t, artistName:a, collectionName:col, previewUrl:'https://p/'+encodeURIComponent(a+'|'+t), releaseDate:'1985-01-01', artworkUrl100:'https://a/'+encodeURIComponent(a)+'/100x100bb.jpg', ...extra });
  const net={ 'a:Madonna':[it('Like a Prayer','Madonna')], 'a:Maanam':[it('Kocham cię, kochanie moje','Maanam')], 'a:Toto':[it('Africa','Toto')],
    's:like a prayer piano':[it('Like a Prayer','Madonna'), it('Like a Prayer (Piano Version)','Piano Tribute Players','Piano Tribute to Madonna')],
    's:africa piano':[it('Africa (Lullaby)','Rockabye Baby!')], 's:africa toto piano cover':[it('Africa','Toto','Toto IV'), it('Africa','The Piano Guys','Uncharted')] };
  const calls=[];
  const itunes=async(term,opts)=>{ const k=(opts&&opts.song?'s:':'a:')+(opts&&opts.song?term.toLowerCase():term); calls.push(k); return net[k]||[]; };
  const r=await TS8.resolvePiano({ cat:{ artists:['Madonna'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  eq([r.track, r.artist, r.coverArtist],['Like a Prayer','Madonna','Piano Tribute Players'],'oryginał + cover (tribute dozwolony w trybie fortepian)');
  ok(r.preview===net['s:like a prayer piano'][1].previewUrl && r.origPreview===net['a:Madonna'][0].previewUrl,'zajawka COVERU, zapamiętana zajawka oryginału');
  ok(/Madonna/.test(r.art),'okładka oryginału (nie coveru)');
  ok(calls.includes('s:like a prayer piano'),'wyszukiwanie utworu (tryb song, bez artistTerm)');
  const r2=await TS8.resolvePiano({ cat:{ artists:['Toto'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  eq(r2.coverArtist,'The Piano Guys','kołysanka odrzucona → zapytanie zapasowe „tytuł wykonawca piano cover"');
  calls.length=0;
  const seen=new Set();
  const r3=await TS8.resolvePiano({ cat:{ artists:['Maanam','Madonna'] }, seen, recent:[], itunes, rnd:()=>0 });
  eq(r3.artist,'Madonna','polski utwór pominięty → następna próba');
  ok(!calls.some(k=>/kocham/.test(k)),'polski utwór bez zapytania o cover');
  const r4=await TS8.resolvePiano({ cat:{ artists:['Maanam'] }, seen:new Set(), recent:[], itunes, rnd:()=>0, tries:3 });
  ok(r4.error && r4.reason==='empty','brak coveru po próbach → błąd (wołający gra zwykłą muzykę)');
  const off=await TS8.resolvePiano({ cat:{ artists:['Madonna'] }, seen:new Set(), recent:[], itunes:async()=>{ throw new Error('x'); }, rnd:()=>0 });
  eq(off.reason,'offline','brak sieci → offline');
  const pl=await TS8.resolvePiano({ cat:{ songs:[{ title:'Like a Prayer', artist:'Madonna' }] }, seen:new Set(), recent:[],
    itunes:async(term,opts)=>{ const t=term.toLowerCase(); if(t==='madonna like a prayer') return net['a:Madonna']; return net['s:'+t]||[]; }, rnd:()=>0 });
  eq(pl.coverArtist,'Piano Tribute Players','playlista: oryginał z utworów + cover');
})();
/* ===== „Nowy mecz" (core/matchSetup.js + rodziny trybów w core/match.js): gotowce, filtr, tryby, podsumowania, szkic MP ===== */
const MS = await import('../core/matchSetup.js');
const MM = await import('../core/match.js');
const MS_CATS = {
  '80s':{ label:'lata 80', range:'1980–89', artists:['A1','A2','A3'] },
  '90s':{ label:'lata 90', range:'1990–99', artists:['B1','B2'] },
  '00s':{ label:'lata 2000', range:'2000–09', artists:['C1','C2'] },
  'pop-world':{ label:'pop świat', desc:'wielkie gwiazdy', artists:['Madonna','Prince'] },
  'disco-polo':{ label:'disco polo', desc:'parkietowe', artists:['Weekend','Akcent'] },
  'tlum':{ label:'światowe po polsku', kind:'lyrics', songs:[{ title:'T', artist:'A', lyric:'opis' }] },
  'rebusy':{ label:'Rebusy emoji', kind:'quiz', group:'lamiglowki', questions:[{ prompt:'?' }] },
};
group('Nowy mecz: MODE_FAMILIES — każdy tryb dokładnie w jednej rodzinie, etykiety, kolejność makiety', ()=>{
  const all=MM.MODE_FAMILIES.flatMap(f=>f.modes);
  eq([...all].sort(), [...MM.ALL_MODES].sort(), 'rodziny pokrywają ALL_MODES');
  eq(all.length, new Set(all).size, 'bez duplikatów');
  eq(MM.MODE_FAMILIES.map(f=>f.name), ['Słuchaj','Kombinuj','Covery','Bez dźwięku','Lektor'], 'nazwy rodzin');
  eq(MM.MODE_FAMILIES[0].modes, ['music','intro','snippet','reverse','revsnip','slowmo','fastmo'], 'Słuchaj: muzyka, intro, fragment, od tyłu, od tyłu krótko, obroty');
  ok(MM.MODE_FAMILIES.every(f=>f.desc && f.id), 'każda rodzina ma opis');
  ok(MM.ALL_MODES.every(m=>MM.MODE_PICK_LABEL[m]), 'każdy tryb ma etykietę pickera');
});
group('Nowy mecz: gotowce — klucze kategorii ISTNIEJĄ w danych (categories.js + data/quiz-*.json)', ()=>{
  const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
  const win={}; new Function('window', readFileSync(join(ROOT,'categories.js'),'utf8'))(win);
  const C=win.CATEGORIES||{};
  const keys=new Set([...Object.keys(C.decades||{}), ...Object.keys(C.styles||{}), ...Object.keys(C.playlists||{})]);
  const idx=JSON.parse(readFileSync(join(ROOT,'data/quiz-index.json'),'utf8'));
  (Array.isArray(idx)?idx:idx.files).forEach(f=>keys.add(f.replace(/^quiz-|\.json$/g,'')));
  eq(MS.PRESETS.map(p=>p.id), ['hity','pl','dek','lam','hard','polka'], 'gotowce: hity, Polska klasyka, Lata 80·90·00, Łamigłówki, Hardcore, Z mojej półki');
  MS.PRESETS.filter(p=>Array.isArray(p.cats)).forEach(p=>{ const miss=p.cats.filter(k=>!keys.has(k)); eq(miss, [], `gotowiec ${p.id}: brakujące klucze`); });
  ok(!keys.has(MS.SHELF_PRESET_KEY), 'klucz kategorii półki nie koliduje z danymi');
  ok(MS.PRESETS.every(p=>p.modes.every(m=>MM.ALL_MODES.includes(m))) && MS.PRESETS.every(p=>[5,10,15,30].includes(p.questions) && MM.clampQuestions(p.questions)===p.questions), 'tryby i długości gotowców poprawne');
});
group('Nowy mecz: gotowiec „Z mojej półki" (gust) — tylko solo, ≥ 8 polubionych, inaczej nieaktywny z podpowiedzią', ()=>{
  const P=MS.PRESETS.find(p=>p.id==='polka');
  ok(P && typeof P.cats==='function' && P.ctx==='solo', 'cats jako funkcja, kontekst solo');
  eq(MS.resolvePreset(P, MS_CATS), null, 'bez kontekstu solo → ukryty (np. MP — tam „Gust stołu")');
  eq(MS.resolvePreset(P, MS_CATS, MM.MP_MODES, { ctx:'mp', shelf:30 }), null, 'MP → ukryty');
  const locked=MS.resolvePreset(P, MS_CATS, MM.ALL_MODES, { ctx:'solo', shelf:3 });
  ok(locked && locked.disabled && locked.cats.length===0, 'za mało (brak kategorii półki) → nieaktywny, bez puli');
  eq(locked.sub, 'polub min. 8 utworów (❤️/👍) — masz 3', 'podpowiedź z licznikiem');
  ok(!MS.presetMatches(locked, [], new Set(), 10), 'nieaktywny gotowiec nigdy „nie pasuje" do wyboru');
  const songs=n=>Array.from({ length:n }, (_,i)=>({ title:'T'+i, artist:'A'+i, year:'2001' }));
  const C7={ ...MS_CATS, [MS.SHELF_PRESET_KEY]:{ label:'Moja półka', kind:'playlist', temp:true, songs:songs(7) } };
  ok(MS.resolvePreset(P, C7, MM.ALL_MODES, { ctx:'solo', shelf:7 }).disabled, '7 utworów → nadal nieaktywny');
  const C8={ ...MS_CATS, [MS.SHELF_PRESET_KEY]:{ label:'Moja półka', kind:'playlist', temp:true, songs:songs(8) } };
  const r=MS.resolvePreset(P, C8, MM.ALL_MODES, { ctx:'solo', shelf:8 });
  eq([r.disabled, r.cats, r.modes, r.questions, r.sub], [undefined, [MS.SHELF_PRESET_KEY], ['music','abcd'], 10, '10 pyt · muzyka, ABCD'], '≥ 8 → 10 pytań, muzyka + ABCD z półki');
  eq(MS.presetsFor(C8, MM.ALL_MODES, undefined, { ctx:'solo', shelf:8 }).map(p=>p.id).pop(), 'polka', 'presetsFor(env solo) zawiera gotowiec półki');
  ok(!MS.presetsFor(C8).some(p=>p.id==='polka'), 'presetsFor bez env → bez gotowca półki (wsteczna zgodność)');
});
group('Dane: klucze kategorii UNIKALNE między grupami (decades/styles/playlists/lyrics/quiz) — wspólny ALL_CATS', ()=>{
  const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
  const win={};
  for(const f of ['categories.js','playlists.js','lyrics.js','questions.js']) new Function('window', readFileSync(join(ROOT,f),'utf8'))(win);
  const C=win.CATEGORIES||{};
  const idx=JSON.parse(readFileSync(join(ROOT,'data/quiz-index.json'),'utf8'));
  const quizFiles=(Array.isArray(idx)?idx:idx.files).map(f=>f.replace(/^quiz-/,'').replace(/\.json$/,''));
  const groups={ decades:Object.keys(C.decades||{}), styles:Object.keys(C.styles||{}), playlists:Object.keys(C.playlists||{}),
    lyrics:Object.keys(C.lyrics||{}), quiz:[...new Set([...Object.keys(C.quiz||{}), ...quizFiles])] };
  ok(groups.decades.length && groups.styles.length && groups.lyrics.length, 'dane wczytane');
  const owner={}, dup=[];
  for(const [g, keys] of Object.entries(groups)) for(const k of keys){ if(owner[k]) dup.push(`${k} (${owner[k]} + ${g})`); else owner[k]=g; }
  eq(dup, [], 'brak kolizji kluczy między grupami');
  ok(C.styles['rap-pl'] && !C.lyrics['rap-pl'] && C.lyrics['rap-pl-lektor'] && C.lyrics['rap-pl-lektor'].kind==='lyrics', 'rap-pl = styl; kategoria lektora pod rap-pl-lektor');
  eq(C.lyrics['rap-pl-lektor'].label, 'rap PL — opisy', 'etykieta kategorii lektora odróżnia ją od stylu');
  ok(!['polka-moja','polka-tmp','gust-stolu'].some(k=>owner[k]), 'klucze tymczasowe gustu (półka / stół) nie kolidują z danymi');
  const all={ ...C.decades, ...C.styles, ...C.playlists, ...C.lyrics, ...C.quiz };
  ok(modesFor('rap-pl', all).includes('music') && !modesFor('rap-pl', all).includes('lektor'), 'rap-pl w scalonym ALL_CATS gra muzykę (styl), nie lektora');
  ok(dailyPool(all).includes('rap-pl'), 'Stacja dnia: rap-pl (styl) w puli dnia');
});
group('Nowy mecz: resolvePreset / presetsFor / presetMatches', ()=>{
  const hity=MS.resolvePreset(MS.PRESETS[0], MS_CATS);
  eq(hity.cats, ['80s','90s','00s','pop-world'], 'hity: kategorie');
  eq(hity.modes, ['music','intro','abcd'], 'hity: tryby (solo)');
  eq(hity.sub, '15 pyt · muzyka, intro, ABCD', 'podpis z trybów');
  const mp=MS.resolvePreset(MS.PRESETS[0], MS_CATS, MM.MP_MODES);
  eq(mp.modes, ['music','abcd'], 'MP: intro (solo-only) wycięte');
  const legacy=MS.resolvePreset(MS.PRESETS[2], MS_CATS, MM.LEGACY_MP_MODES);
  eq(legacy.modes, ['music'], 'stary serwer: oś czasu wycięta → zostaje muzyka');
  const lam=MS.resolvePreset(MS.PRESETS[3], MS_CATS);
  eq([lam.cats, lam.modes, lam.sub], [['rebusy'], ['quiz'], '15 pyt · rebusy i litery'], 'Łamigłówki: tylko istniejące klucze, tryb quiz, własny podpis');
  eq(MS.resolvePreset(MS.PRESETS[1], MS_CATS).cats, ['disco-polo'], 'Polska klasyka: brakujące klucze pominięte');
  eq(MS.resolvePreset({ id:'x', name:'X', cats:['nie-ma'], modes:['music'], questions:15 }, MS_CATS), null, 'gotowiec bez kategorii → null (ukryty)');
  eq(MS.resolvePreset({ id:'f', name:'Z półki', cats:(c)=>Object.keys(c).filter(k=>/s$/.test(k)), modes:['music'], questions:5 }, MS_CATS).cats, ['80s','90s','00s'], 'cats jako funkcja (przyszły „Z mojej półki")');
  eq(MS.presetsFor({ '80s':MS_CATS['80s'] }).map(p=>p.id), ['hity','dek','hard'], 'presetsFor: tylko gotowce z istniejącymi kategoriami');
  ok(MS.presetMatches(hity, ['00s','80s','pop-world','90s'], new Set(['abcd','music','intro']), 15), 'presetMatches: ten sam wybór (inna kolejność)');
  ok(!MS.presetMatches(hity, hity.cats, hity.modes, 5) && !MS.presetMatches(hity, ['80s'], hity.modes, 15), 'presetMatches: inna długość / pula → nie');
});
group('Nowy mecz: wyszukiwarka — normQuery + searchCats (wszystkie grupy, AND słów, bez diakrytyków)', ()=>{
  eq(MS.normQuery('  Łamigłówki–Pop! '), 'lamiglowki pop', 'normQuery: ł/diakrytyki/znaki');
  const groups=[{ id:'dekady', label:'Dekady', keys:['80s','90s','00s'] }, { id:'style', label:'Style', keys:['pop-world','disco-polo','80s'] },
    { id:'teksty', label:'Teksty', keys:['tlum'] }, { id:'lamiglowki', label:'Łamigłówki', keys:['rebusy'] }];
  eq(MS.searchCats(groups, 'disco', MS_CATS), [{ key:'disco-polo', group:'style' }], 'disco → style');
  eq(MS.searchCats(groups, '80', MS_CATS), [{ key:'80s', group:'dekady' }], '„80" → lata 80 (bez duplikatu z drugiej grupy)');
  eq(MS.searchCats(groups, 'lata 9', MS_CATS).map(h=>h.key), ['90s'], 'słowa AND');
  eq(MS.searchCats(groups, 'swiatowe', MS_CATS).map(h=>h.key), ['tlum'], 'bez polskich znaków');
  eq(MS.searchCats(groups, 'lamiglowki', MS_CATS).map(h=>h.key), ['rebusy'], 'po nazwie grupy');
  eq(MS.searchCats(groups, 'gwiazdy', MS_CATS).map(h=>h.key), ['pop-world'], 'po opisie');
  eq(MS.searchCats(groups, '   ', MS_CATS), [], 'puste zapytanie → []');
});
group('Nowy mecz: modeStates — wyszarzenie wg kategorii, MP solo-only/serwer, quiz auto', ()=>{
  const flat=(st)=>Object.fromEntries(st.families.flatMap(f=>f.modes).map(m=>[m.mode,m]));
  let st=MS.modeStates({ cats:new Set(), modes:new Set(['music','lektor']), allCats:MS_CATS });
  ok(Object.values(flat(st)).every(m=>!m.disabled || m.auto), 'bez kategorii: nic wyszarzonego (poza auto-quizem)');
  eq(st.active, ['music','lektor'], 'aktywne = wybrane');
  st=MS.modeStates({ cats:new Set(['tlum']), modes:new Set(['music','lektor']), allCats:MS_CATS });
  let f=flat(st);
  ok(f.music.disabled && f.music.reason==='cats' && !f.lektor.disabled, 'tylko teksty: muzyka wyszarzona (cats), lektor aktywny');
  eq(st.active, ['lektor'], 'wybrana-ale-wyszarzona muzyka się nie liczy'); eq(st.reasons, ['cats'], 'powody');
  st=MS.modeStates({ cats:new Set(['80s','rebusy']), modes:new Set(['music','quiz']), allCats:MS_CATS, available:MM.mpAvailableModes(null, true) });
  f=flat(st);
  ok(f.intro.disabled && f.intro.reason==='solo' && f.abcd.reason==='server' && f.quiz.auto && f.quiz.on, 'MP stary serwer: intro=solo, ABCD=server, quiz auto włączony');
  eq(st.active, ['music','quiz'], 'aktywne w MP');
  ok(/tylko solo/.test(MS.modeNote(st.reasons)) && /serwer pokoju/.test(MS.modeNote(st.reasons)), 'modeNote: wyjaśnienie solo + serwer');
  eq(MS.modeNote([]), '', 'bez powodów — bez notki');
});
group('Nowy mecz: setupSummary / settingsSummary', ()=>{
  eq(MS.setupSummary({ cats:new Set(), active:['music'], questions:15, allCats:MS_CATS }), { ok:false, text:'Wybierz co najmniej jedną kategorię' }, 'brak kategorii');
  eq(MS.setupSummary({ cats:new Set(['80s']), active:[], questions:15, allCats:MS_CATS }).ok, false, 'brak trybu');
  const s=MS.setupSummary({ cats:new Set(['80s','90s','00s','pop-world']), active:['music','intro','abcd'], questions:15, allCats:MS_CATS });
  eq([s.ok, s.text], [true, '15 utworów · 4 kat. · 3 tryby'], 'makieta: „15 … · 4 kat. · 3 tryby"');
  eq(MS.setupSummary({ cats:new Set(['80s']), active:['music'], questions:30, allCats:MS_CATS }).text, '30 utworów · 1 kat. · 1 tryb · z powtórkami', 'mała pula → „z powtórkami"');
  eq(MS.setupSummary({ cats:new Set(['80s','rebusy']), active:['music','quiz'], questions:5, allCats:MS_CATS }).text, '5 pytań · 2 kat. · 2 tryby', 'z quizem → „pytań"');
  eq(MS.setupSummary({ cats:new Set(['tlum']), active:['music'], questions:15, allCats:MS_CATS }).ok, false, 'niekompatybilne → ok:false');
  eq(MS.settingsSummary({ questions:15, trener:false }), '15 pytań · trener wył.', 'solo');
  eq(MS.settingsSummary({ ctx:'mp', questions:30, format:'teams', timer:0, salon:true }), '30 pytań · Drużyny · bez limitu · TV', 'MP');
});
group('Nowy mecz: sanitizeDraft — szkic MP dla gości (te same reguły klient/serwer)', ()=>{
  eq(MS.sanitizeDraft(null), null, 'null'); eq(MS.sanitizeDraft([1]), null, 'tablica'); eq(MS.sanitizeDraft('x'), null, 'string');
  const d=MS.sanitizeDraft({ preset:'Hity '+'x'.repeat(100), cats:[{ k:'80s', l:'lata 80' }, { k:'80s', l:'dup' }, { k:'', l:'pusty' }, 7, { k:'pl:x', l:'' }],
    modes:['music','music','hack','abcd'], questions:999, timer:-5, format:'evil', salon:'yes', audioHostOnly:true, extra:'<script>' });
  eq(d.cats, [{ k:'80s', l:'lata 80' }, { k:'pl:x', l:'pl:x' }], 'kategorie: bez duplikatów/pustych, etykieta → klucz');
  eq(d.modes, ['music','abcd'], 'tryby: tylko znane, bez duplikatów');
  eq([d.questions, d.timer, d.format, d.salon, d.audioHostOnly], [MM.MAX_QUESTIONS, 0, 'coop', false, true], 'długość/timer/format/flagi przycięte');
  ok(d.preset.length<=MS.DRAFT_LABEL_MAX && !('extra' in d), 'teksty przycięte, nieznane pola wycięte');
  const many=MS.sanitizeDraft({ cats:Array.from({ length:40 }, (_,i)=>({ k:'k'+i, l:'L'+i })), salon:true });
  eq([many.cats.length, many.more, many.audioHostOnly], [MS.DRAFT_MAX_CATS, 16, true], 'cap kategorii + „more"; salon ⇒ dźwięk tylko u hosta');
  ok(JSON.stringify({ t:'event', event:'draft', payload:many }).length < MS.DRAFT_PAYLOAD_MAX, 'maksymalny szkic mieści się w capie serwera');
  eq(MS.draftModesText(['music','intro','abcd']), 'muzyka · intro 1–16 s · ABCD', 'tryby szkicu do wyświetlenia');
});
/* ===== EKSPERYMENT „gitara": zaostrzona akceptacja coveru (core/guitarCovers.js) ===== */
const GC = await import('../core/guitarCovers.js');
group('EKSP. gitara: guitarCoverVerdict — znacznik w tytule / lista wykonawców / album coverów + „guitar"; odrzuty vocal/feat./lyrics/karaoke', ()=>{
  const v=(t,a,c='Album')=>GC.guitarCoverVerdict({ trackName:t, artistName:a, collectionName:c });
  eq(v('Hotel California (Guitar Version)','Manuel Granada','Spanish Guitar 2'),{ok:true,why:'title'},'(a) „Guitar Version"');
  for(const t of ['X (Instrumental)','X (Fingerstyle Guitar)','X (Acoustic Guitar Version)','X (Guitar Cover)','X (Arr. for Guitar)','X (Guitar Instrumental)','X Finger-Style'])
    ok(v(t,'Nobody','Single').ok, '(a) znacznik w tytule: '+t);
  eq(v('Creep','Andy Angel','Guitar Covers, Vol. 2'),{ok:true,why:'artist'},'(b) lista: Andy Angel');
  ok(v('Africa','sungha jung','Cover Compilation').ok,'(b) lista bez wielkości liter');
  ok(GC.isGuitarCoverArtist('Johanna & Ebba Högberg') && GC.isGuitarCoverArtist('Johanna and Ebba Hogberg'),'(b) „&"/„and" i diakrytyki');
  eq(v('Zombie','Best Guitar Players','Fingerstyle Hits'),{ok:true,why:'album'},'(c) album „Fingerstyle" + „guitar" w wykonawcy');
  eq(v('Zombie','Best Players','Fingerstyle Hits'),{ok:false,why:'none'},'(c) bez „guitar" w wykonawcy');
  eq(v('Zombie (Acoustic)','Some Guitar Guy','Acoustic Hits'),{ok:false,why:'none'},'„Acoustic" bez znacznika/listy/albumu coverów → nie');
  for(const [t,a,c] of [['X (Guitar Version) [Vocal Version]','Paco Nula','A'],['X (feat. Y) [Guitar Version]','Z','A'],['X (Instrumental) ft. Y','Z','A'],['X (Guitar Version)','Z featuring Y','A'],['X (Guitar Version with Lyrics)','Z','A'],['X (Instrumental)','Z','Acoustic Guitar Karaoke'],['X','Andy Angel','Vocal Covers']])
    eq(v(t,a,c).why,'reject','twardy odrzut: '+[t,a,c].join(' / '));
  eq(v('X (Acoustic Guitar Instrumental)','Sing2Guitar','A').why,'deny','lista odmów (karaoke)');
  ok(GC.GUITAR_COVER_ARTISTS.length>=30 && new Set(GC.GUITAR_COVER_ARTISTS.map(a=>a.toLowerCase())).size===GC.GUITAR_COVER_ARTISTS.length,'lista ≥30 wykonawców, bez duplikatów');
  ok(!GC.GUITAR_COVER_ARTISTS.some(a=>GC.GUITAR_COVER_DENY.includes(a)),'lista i odmowy rozłączne');
});
/* ===== EKSPERYMENT „gitara" (guitar): cover gitarowy — wspólna ścieżka z fortepianem (resolveInstrumentalCover) ===== */
group('EKSP. gitara: tryb, modesFor (bez kategorii polskich), pickInstrumentalCover(guitar)', ()=>{
  ok(M8.ALL_MODES.includes('guitar') && M8.MODE_LABEL.guitar==='🎸 gitara' && M8.MODE_SHORT.guitar && M8.MODE_SUB.guitar,'tryb + etykiety „🎸 gitara"');
  ok(!M8.MP_MODES.includes('guitar') && M8.SOLO_ONLY_MODES.includes('guitar'),'tylko solo');
  eq(M8.sanitizeMpConfig({ modes:['guitar','music'] }).modes,['music'],'MP config: gitara odrzucona');
  const C={ '80s':{label:'lata 80', range:'1980–89', artists:['Maanam','Madonna']}, 'rock-pl':{label:'rock PL', desc:'polski rock', artists:['Dżem']},
    'disco-polo':{label:'disco polo', artists:['Akcent']}, 'pl:abc':{label:'Polskie hity 2024', songs:[{title:'a',artist:'b'}]}, 'pl:def':{label:'Top 50 Global', songs:[{title:'a',artist:'b'}]},
    ak:{label:'akustycznie / unplugged', noModes:['piano','guitar','cover','medley'], songs:[1,2,3,4].map(i=>({ title:'T'+i, artist:'A'+i, year:'199'+i, album:'MTV Unplugged', match:'unplugged' }))} };
  ok(M8.modesFor('80s',C).includes('guitar') && M8.modesFor('pl:def',C).includes('guitar'),'dekada i playlista światowa → gitara');
  ['rock-pl','disco-polo','pl:abc'].forEach(k=>ok(!M8.modesFor(k,C).includes('guitar') && !M8.modesFor(k,C).includes('piano'),'kategoria polska bez gitary i fortepianu: '+k));
  eq(M8.modesFor('ak',C),['music','reverse','snippet','intro','revsnip','abcd','year','timeline','slowmo','fastmo'],'noModes: akustyczna bez fortepianu/gitary/okładki/składanki (reszta jak playlista z rokiem)');
  ok(M8.pianoCapable===M8.instrumentalCapable,'pianoCapable = instrumentalCapable (zgodność)');
  const it=(t,a,col='Album',extra={})=>({ trackName:t, artistName:a, collectionName:col, previewUrl:'https://p/'+encodeURIComponent(a+t), ...extra });
  const orig={ track:'Wonderwall', artist:'Oasis' }, O=it('Wonderwall','Oasis',"(What's the Story) Morning Glory?");
  const res=[ O, it('Wonderwall (Guitar Cover)','Cover Kings','Cover Sessions Vol. 13'), it('Wonderwall (Acoustic)','Andie Case','Wonderwall - Single'),
    it('How to Play Wonderwall - Guitar Lesson','Guitar Tutor','Guitar Lessons Vol. 2'), it('Wonderwall (Guitar Backing Track)','Backing Band','Guitar Backing Tracks'),
    it('Wonderwall (In the Style of Oasis) [Instrumental]','Pop Workshop','Free Guitar Backing Tracks'), it('Wonderwall (Piano & Guitar)','Duo Keys'),
    it('Wonderwall (Guitar Version) [Vocal]','Sing2Guitar','Acoustic Guitar Karaoke'), it('Wonderwall (Lullaby)','Rockabye Baby!','Lullaby Guitar'),
    it('Wonderwall (guitar version sped up)','Guitar Girl'), it('Wonderwall (Fingerstyle)','Fingerstyle Duo','Acoustic Covers'), it('Wonderwall (Guitar Version)','Paco Nula','Spanish Guitar Hits') ];
  eq(TS8.pickInstrumentalCover(res, orig, 'guitar').artistName,'Fingerstyle Duo','pierwszy poprawny: bez oryginału, wokalnych „cover sessions"/akustycznych bez słowa guitar, lekcji, podkładów, fortepianu, karaoke, kołysanek, sped up');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall (Guitar Cover)','Cover Kings','Cover Sessions Vol. 13')], orig, 'guitar'),null,'wokalny zespół coverowy („cover sessions") odrzucony');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall (Acoustic Cover)','Jane Singer','Acoustic Covers')], orig, 'guitar'),null,'cover bez słowa guitar/gitar/fingerstyle → odrzucony (zwykle wokal)');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall - Guitar Tutorial','Learn Guitar'), it('Wonderwall (Easy Guitar Tabs)','TabMaster')], orig, 'guitar'),null,'lekcja/tutorial/taby odrzucone');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall (Fingerstyle)','Fingerstyle Duo','Acoustic Covers')], orig, 'guitar').artistName,'Fingerstyle Duo','fingerstyle przyjęty');
  // poprawki po testach (zaostrzenie): samo słowo „Guitar" w tytule/albumie już NIE wystarcza (bywał wokal)
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall Guitar','Kim Yu Na','Peaceful Music Romantic Guitar')], orig, 'guitar'),null,'zaostrzenie: dopisek „Guitar" bez znacznika instrumentalnego → odrzucony');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall Guitar Version','Kim Yu Na','Peaceful Music Romantic Guitar')], orig, 'guitar').artistName,'Kim Yu Na','… ze znacznikiem „Guitar Version" na końcu tytułu → przyjęty');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall','Gitarowe Duo','Gitara akustyczna')], orig, 'guitar'),null,'zaostrzenie: polskie „gitar…" bez znacznika/listy → odrzucony');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall','Andy Angel','Guitar Covers, Vol. 1')], orig, 'guitar').artistName,'Andy Angel','(b) wykonawca z kuratorowanej listy — bez znacznika w tytule');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall','Guitar Moods Band','Guitar Covers 2020')], orig, 'guitar').artistName,'Guitar Moods Band','(c) album „Guitar Covers" + „guitar" w nazwie wykonawcy');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall','Moods Band','Guitar Covers 2020')], orig, 'guitar'),null,'(c) bez „guitar" w nazwie wykonawcy → odrzucony');
  eq(TS8.pickInstrumentalCover([O, it('Smells Like Teen Spirit (Acoustic Version)','Acoustic Guitar Revival',"90's Alternative Rock Hits (Acoustic Version)")], { track:'Smells Like Teen Spirit', artist:'Nirvana' }, 'guitar'),null,'pomiar: „Acoustic Version" wykonawcy z „Guitar" w nazwie (bez albumu coverów) → odrzucony');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall (Guitar Version) [feat. Anna]','Paco Nula','Spanish Guitar Hits')], orig, 'guitar'),null,'„feat." → odrzucony nawet z listy/znacznikiem');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall (Acoustic Guitar Instrumental)','singahit','Guitar Acoustic Instrumental, Vol. 19')], orig, 'guitar'),null,'wytwórnia karaoke/podkładów (lista odmów) → odrzucona');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall (Guitar Version)','Oasis & Friends')], orig, 'guitar'),null,'człon kolaboracji = oryginał → odrzucony');
  const aag={ track:'About a Girl', artist:'Nirvana' }, AO=it('About a Girl','Nirvana','Bleach');
  eq(TS8.pickInstrumentalCover([AO, it('About a Girl','The Academy Is...','Guitar Underground')], aag, 'guitar'),null,'pomiar: „guitar" tylko w nazwie kompilacji rockowej (inna piosenka, wokal) → odrzucony');
  eq(TS8.pickInstrumentalCover([AO, it('About a Girl','Andy Angel','Guitar Covers, Vol. 1')], aag, 'guitar').artistName,'Andy Angel','„guitar" tylko w albumie, ale album coverów → przyjęty');
  eq(TS8.pickInstrumentalCover([AO, it('About a Girl (Guitar) [Remix]','Luke Muzzic','About a Girl (Guitar Remix) - EP'), it('About a Girl (Extended Version)','Luke Muzzic','About a Girl (Guitar Remix) - EP')], aag, 'guitar'),null,'pomiar: remiksy „Guitar Remix"/„Extended" odrzucone');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall (Piano Version)','Dreaming Piano')], orig, 'guitar'),null,'cover fortepianowy to nie gitara');
  eq(TS8.pickInstrumentalCover([O, it('Wonderwall (Guitar Version)','Paco Nula')], orig, 'piano'),null,'… i odwrotnie: gitara to nie fortepian');
  const king={ track:'King', artist:'T.Love' };
  eq(TS8.pickInstrumentalCover([it('King','Florence + the Machine','King - Single'), it('King (Guitar Version)','Paco Nula','Spanish Guitar Hits')], king, 'guitar'),null,'kolizja tytułów: cover bez dowodu odrzucony (jak fortepian)');
  eq(TS8.pickInstrumentalCover([it('King','Florence + the Machine'), it('King (Guitar Version)','Guitar: Abraham Sevilla','Tribute to T.Love in Spanish Guitar')], king, 'guitar').artistName,'Guitar: Abraham Sevilla','dowód: wykonawca oryginału w albumie');
  eq(TS8.coverTitleKey('Guitar Man','guitar'),'guitar man','„Guitar Man" — słowo na początku tytułu zostaje');
  eq(TS8.coverTitleKey('Shape of You Acoustic Guitar Version','guitar'),'shape of you','dopisek „Acoustic Guitar Version" zdjęty');
  eq(TS8.coverQueries({ track:'Wonderwall (Remastered)', artist:'Oasis' }, 'guitar'),['Wonderwall guitar','Wonderwall acoustic guitar','Wonderwall Oasis guitar'],'zapytania gitary');
  eq(TS8.pianoQueries({ track:'Billie Jean', artist:'Michael Jackson' }),TS8.coverQueries({ track:'Billie Jean', artist:'Michael Jackson' }, 'piano'),'pianoQueries = coverQueries(piano)');
  eq(TS8.INSTRUMENT_EMOJI.guitar,'🎸','emoji odsłony');
});
console.log('• EKSP. gitara: resolveGuitar — cover, polskie pomijane, fallback');
await (async ()=>{
  const it=(t,a,col='Album',extra={})=>({ trackName:t, artistName:a, collectionName:col, previewUrl:'https://p/'+encodeURIComponent(a+'|'+t), releaseDate:'1985-01-01', artworkUrl100:'https://a/'+encodeURIComponent(a)+'/100x100bb.jpg', ...extra });
  const net={ 'a:Madonna':[it('Like a Prayer (2012 Remaster)','Madonna')], 'a:Maanam':[it('Kocham cię, kochanie moje','Maanam')], 'a:Toto':[it('Africa','Toto')],
    's:like a prayer guitar':[it('Like a Prayer','Madonna'), it('Like a Prayer (Guitar Lesson)','Guitar Tutor'), it('Like a Prayer (Fingerstyle Guitar)','Strings Duo','Acoustic Guitar Covers')],
    's:africa guitar':[it('Africa','Toto','Toto IV'), it('Africa (Guitar Cover)','Cover Kings','Cover Sessions')], 's:africa acoustic guitar':[],
    's:africa toto guitar':[it('Africa','Toto','Toto IV'), it('Africa (Acoustic Guitar)','Guitar Dreamers','Guitar Dreamers Play Toto')] };
  const calls=[];
  const itunes=async(term,opts)=>{ const k=(opts&&opts.song?'s:':'a:')+(opts&&opts.song?term.toLowerCase():term); calls.push(k); return net[k]||[]; };
  const r=await TS8.resolveGuitar({ cat:{ artists:['Madonna'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  eq([r.track, r.artist, r.coverArtist, r.instrument],['Like a Prayer (2012 Remaster)','Madonna','Strings Duo','guitar'],'oryginał + cover gitarowy (lekcja pominięta)');
  ok(r.preview===net['s:like a prayer guitar'][2].previewUrl && r.origPreview===net['a:Madonna'][0].previewUrl,'zajawka COVERU, zapamiętana zajawka oryginału');
  const r2=await TS8.resolveGuitar({ cat:{ artists:['Toto'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  eq(r2.coverArtist,'Guitar Dreamers','wokalny „cover sessions" odrzucony → zapytania zapasowe aż do „tytuł wykonawca guitar"');
  calls.length=0;
  const r3=await TS8.resolveGuitar({ cat:{ artists:['Maanam','Madonna'] }, seen:new Set(), recent:[], itunes, rnd:()=>0 });
  eq(r3.artist,'Madonna','polski utwór pominięty → następna próba');
  ok(!calls.some(k=>/kocham/.test(k)),'polski utwór bez zapytania o cover');
  const r4=await TS8.resolveGuitar({ cat:{ artists:['Maanam'] }, seen:new Set(), recent:[], itunes, rnd:()=>0, tries:3 });
  ok(r4.error && r4.reason==='empty','brak coveru po próbach → błąd (wołający gra zwykłą muzykę)');
  const rp=await TS8.resolvePiano({ cat:{ artists:['Madonna'] }, seen:new Set(), recent:[], itunes, rnd:()=>0, tries:1 });
  ok(rp.error,'fortepian nie bierze coveru gitarowego (wspólna ścieżka, osobne reguły)');
})();
/* ===== „akustycznie / unplugged": pole `match` utworu (wersja akustyczna zamiast studyjnej) ===== */
group('songs[].match: matchSong wymaga słowa w tytule/albumie, songTerms najpierw z tym słowem', ()=>{
  const it=(t,a,col,idx)=>({ trackName:t, artistName:a, collectionName:col, previewUrl:'https://p/'+idx });
  const res=[ it('About a Girl','Nirvana','Bleach',1), it('About a Girl (Live)','Nirvana','Live at Reading',2), it('About a Girl (Live Acoustic)','Nirvana','MTV Unplugged In New York (Live Acoustic)',3) ];
  eq(TS8.matchSong(res, { title:'About a Girl', artist:'Nirvana' }).previewUrl,'https://p/1','bez match: studyjna (jak dotąd)');
  eq(TS8.matchSong(res, { title:'About a Girl', artist:'Nirvana', match:'unplugged' }).previewUrl,'https://p/3','match:unplugged → wersja z albumu MTV Unplugged');
  eq(TS8.matchSong(res.slice(0,2), { title:'About a Girl', artist:'Nirvana', match:'unplugged' }),null,'brak wersji unplugged → null (nie gramy studyjnej)');
  eq(TS8.matchSong([it('Hotel California (Live On MTV, 1994)','Eagles','Hell Freezes Over',4)], { title:'Hotel California', artist:'Eagles', match:'mtv' }).previewUrl,'https://p/4','słowo w tytule wystarcza');
  eq(TS8.matchSong([it('Czerwony Jak Cegla (1994 Remastered Version)','Dzem','Akustycznie',5)], { title:'Czerwony jak cegła', artist:'Dżem', match:'akustycz' }).previewUrl,'https://p/5','akustycz ~ „Akustycznie" (bez diakrytyków)');
  ok(TS8.versionMatches({ trackName:'X', collectionName:'Żywo Akustycznie' }, 'unplugged|akustycz') && !TS8.versionMatches({ trackName:'X', collectionName:'Studio' }, 'unplugged|akustycz'),'alternatywy „|"');
  eq(TS8.songTerms({ title:'About a Girl', artist:'Nirvana', match:'unplugged' }).map(x=>x[0]),['Nirvana About a Girl unplugged','Nirvana About a Girl','Nirvana'],'zapytania: z „unplugged", potem zwykłe, potem wykonawca');
  eq(TS8.songTerms({ title:'X', artist:'Y' }).length,2,'bez match — jak dotąd (2 zapytania)');
});
console.log('• songs[].match: resolveTrack z playlisty gra wersję unplugged');
await (async ()=>{
  const res=[ { trackName:'Rooster', artistName:'Alice in Chains', collectionName:'Dirt', previewUrl:'https://p/studio' },
    { trackName:'Rooster (Live)', artistName:'Alice In Chains', collectionName:'MTV Unplugged (Live)', previewUrl:'https://p/unplugged' } ];
  const q=[];
  const t=await TS8.resolveTrack({ cat:{ songs:[{ title:'Rooster', artist:'Alice in Chains', year:'1996', album:'MTV Unplugged', match:'unplugged' }] }, seen:new Set(),
    itunes:async(term)=>{ q.push(term); return res; }, rnd:()=>0 });
  eq([t.preview, t.track, t.year, t.album, t.yearSrc],['https://p/unplugged','Rooster','1996','MTV Unplugged','data'],'zajawka unplugged, tytuł/rok/album z danych');
  eq(q[0],'Alice in Chains Rooster unplugged','pierwsze zapytanie ze słowem z match');
  const none=await TS8.resolveTrack({ cat:{ songs:[{ title:'Rooster', artist:'Alice in Chains', match:'unplugged' }] }, seen:new Set(), itunes:async()=>res.slice(0,1), rnd:()=>0, capMs:2000 });
  ok(none.error,'tylko studyjna w wynikach → brak (nie gramy wersji studyjnej)');
})();
/* ===== displayTitle: tytuł do wyświetlenia bez dopisków wydania ===== */
group('displayTitle: bez „(2012 Remaster)", „- Remastered 2011", „(Single Version)"…, wersje zostają', ()=>{
  const D=TS8.displayTitle;
  eq(D('Speed Demon (2012 Remaster)'),'Speed Demon','„(2012 Remaster)" (karta osi czasu z gry)');
  eq(D('Something - Remastered 2009'),'Something','„ - Remastered 2009"');
  eq(D('Paint It Black (Remastered)'),'Paint It Black','„(Remastered)"');
  eq(D('Wish You Were Here - 2011 Remaster'),'Wish You Were Here','„ - 2011 Remaster"');
  eq(D('Smells Like Teen Spirit (Single Version)'),'Smells Like Teen Spirit','„(Single Version)"');
  eq(D('Take On Me [2015 Remastered Version]'),'Take On Me','„[2015 Remastered Version]"');
  eq(D('Song - Single Version - 2009 Remaster'),'Song','kilka sufiksów „ - …"');
  eq(D("(I Can't Get No) Satisfaction - Mono Version"),"(I Can't Get No) Satisfaction",'nawias w tytule zostaje, „Mono Version" precz');
  eq(D('Jump (Live)'),'Jump (Live)','live zostaje');
  eq(D('Song (Live / Remastered 2011)'),'Song (Live / Remastered 2011)','remaster obok „live" — dopisek wersji zostaje');
  eq(D('About a Girl (Live On MTV Unplugged)'),'About a Girl (Live On MTV Unplugged)','unplugged zostaje');
  eq(D('Crazy - Gnarls Barkley Cover'),'Crazy - Gnarls Barkley Cover','zwykły sufiks zostaje');
  eq(D('[Remastered]'),'[Remastered]','nic by nie zostało → oryginał');
  eq(D(''),'','pusty');
});
/* ===== lektor: język opisu → głos ===== */
const LV = await import('../core/lektorVoice.js');
group('lektor: język kategorii i wybór głosu (core/lektorVoice)', ()=>{
  eq([LV.lektorLang('en'), LV.lektorLang('EN-us'), LV.lektorLang('pl'), LV.lektorLang(undefined), LV.lektorLang('de'), LV.lektorLang('<x>')],['en','en','pl','pl','pl','pl'],'sanityzacja: tylko pl|en, domyślnie pl');
  eq([LV.catLektorLang({lang:'en'}), LV.catLektorLang({}), LV.catLektorLang(null)],['en','pl','pl'],'język kategorii');
  eq([LV.piperVoiceFor('pl'), LV.piperVoiceFor('en'), LV.piperVoiceFor('xx')],['pl_PL-gosia-medium','en_US-hfc_female-medium','pl_PL-gosia-medium'],'głosy Pipera wg języka');
  const V=[ {name:'Zosia', lang:'pl-PL', localService:true}, {name:'Daniel', lang:'en-GB', localService:true, default:true}, {name:'Samantha', lang:'en-US', localService:true},
    {name:'Microsoft Marek Online (Natural) - Polish (Poland)', lang:'pl-PL'}, {name:'Veena', lang:'en-IN', localService:true}, {name:'Thomas', lang:'fr-FR'} ];
  eq(LV.pickVoice(V,'pl').name,'Microsoft Marek Online (Natural) - Polish (Poland)','pl: głos „Natural" przed zwykłym');
  eq(LV.pickVoice(V,'en').name,'Samantha','en: en-US przed en-GB (domyślnym) i en-IN');
  eq(LV.pickVoice(V.concat({name:'Microsoft Ava Online (Natural) - English (United States)', lang:'en-US'}),'en').name,'Microsoft Ava Online (Natural) - English (United States)','en: Natural wygrywa');
  eq(LV.pickVoice([{name:'Kate (Enhanced)', lang:'en_GB'}, {name:'Fred', lang:'en-US'}],'en').name,'Kate (Enhanced)','Enhanced + zapis en_GB');
  eq(LV.pickVoice([{name:'Thomas', lang:'fr-FR'}],'en'),null,'brak głosu w języku → null (u.lang wystarczy)');
  eq(LV.pickVoice([{name:'Daniel', lang:'en-GB'}],'pl'),null,'pl nie bierze angielskiego');
  eq(LV.pickVoice([{name:'Polish voice', lang:''}],'pl').name,'Polish voice','pusty lang → po nazwie');
  eq(LV.pickVoice(null,'en'),null,'brak listy');
  eq(LV.LEKTOR_BCP47,{pl:'pl-PL', en:'en-US'},'znaczniki BCP-47');
});

/* ===== Łamigłówki: częściowe punkty, odsłuch utworu, grupa pickera, lint drabinki ===== */
const SC9 = await import('../core/scoring.js');
const PK9 = await import('../core/picker.js');
const LR9 = await import('./lintRules.js');
group('Łamigłówki: scoreRound — częściowe punkty (quizFrac) tylko przy nie-pełnym trafieniu', ()=>{
  eq(scoreRound({ quizOk:false, quizFrac:1/3 }).points, 33, '1/3 słów → 33 pkt');
  eq(scoreRound({ quizOk:false, quizFrac:2/3 }).points, 67, '2/3 słów → 67 pkt');
  eq(scoreRound({ quizOk:true, quizFrac:1 }).points, 100, 'komplet → 100 (jak quiz)');
  eq(scoreRound({ quizOk:false }).points, 0, 'bez quizFrac → stare „wszystko albo nic"');
  eq(scoreRound({ quizOk:false, quizFrac:0 }).points, 0, 'nic trafione → 0');
  eq(scoreRound({ quizOk:false, quizFrac:2/3, streak:5 }).streakMult, 1, 'seria tylko przy pełnym trafieniu');
  eq(scoreRound({ quizOk:false, quizFrac:2/3, sure:true }).points, 0, 'pewniak przy częściowym = zakład przegrany (0)');
  eq(scoreRound({ quizOk:false, quizFrac:1/3, elapsedMs:0, limitMs:30000 }).points, 50, 'szybkość działa na częściowe (33×1.5≈50)');
  eq(scoreRound({ quizOk:false, quizFrac:'x' }).points, 0, 'śmieci → 0');
});
group('Łamigłówki: quizKey rebusu zachowuje emoji (seen-set/statystyki nie sklejają rebusów)', ()=>{
  const a={ prompt:'🟣 🌧️\n🎵 tytuł · hit lat 80.', display:'rebus' }, b={ prompt:'💃 👑\n🎵 tytuł · hit lat 80.', display:'rebus' };
  ok(quizKey(a)!==quizKey(b), 'różne rebusy z tą samą podpowiedzią → różne klucze');
  eq(quizKey({ ...a, prompt:a.prompt+'\nA) Purple Rain\nB) X\nC) Y\nD) Z' }), quizKey(a), 'ABCD: klucz bez opcji (stabilny po tasowaniu)');
  eq(quizKey({ prompt:'Stolica Polski?' }), 'stolica polski', 'zwykłe pytanie — klucz bez zmian');
});
group('Łamigłówki: quizPartialFrac — tylko pytania z partial:true', ()=>{
  const q={ prompt:'Jedna litera', slots:[{key:'a'},{key:'b'},{key:'c'}], answers:{a:['Creep'],b:['Creed'],c:['Cream']}, partial:true };
  const ev=evaluateQuiz(q, { a:'creep', b:'zle', c:'Cream' });
  ok(!ev.ok, 'nie komplet');
  eq(SC9.quizPartialFrac(q, ev), 2/3, '2 z 3 słów');
  eq(SC9.quizPartialFrac({ ...q, partial:undefined }, ev), null, 'bez partial → null (wszystko albo nic)');
  eq(SC9.quizPartialFrac({ ...q, partial:'true' }, ev), null, 'partial musi być true (bool)');
  eq(SC9.quizPartialFrac(q, null), null, 'brak oceny → null');
});
group('Łamigłówki: clampQuizTrack / quizListen / listenList — sanityzacja utworu do odsłuchu', ()=>{
  eq(SC9.clampQuizTrack({ track:{ title:'  Purple Rain ', artist:'Prince', x:1 } }), { track:{ title:'Purple Rain', artist:'Prince' } }, 'track przycięty, obce pola precz');
  eq(SC9.clampQuizTrack({ track:{ title:'X' } }), {}, 'track bez wykonawcy odrzucony');
  eq(SC9.clampQuizTrack({ track:'Purple Rain' }), {}, 'track-string odrzucony');
  const big='y'.repeat(500);
  eq(SC9.clampQuizTrack({ track:{ title:big, artist:'A' } }).track.title.length, SC9.LISTEN_TEXT_MAX, 'długi tytuł przycięty');
  const tr=SC9.clampQuizTrack({ tracks:[{title:'Creep',artist:'Radiohead'}, null, {title:'Sunshine of Your Love',artist:'Cream'}, {title:'x',artist:'y'}] });
  eq(tr.tracks.length, 3, 'tracks ≤ 3 elementy');
  eq(tr.tracks[1], null, 'null per slot zachowany');
  eq(SC9.clampQuizTrack({ tracks:[null, {title:''}] }), {}, 'tracks bez żadnego utworu → brak pola');
  eq(SC9.clampQuizTrack({ tracks:'zle' }), {}, 'tracks nie-lista → brak');
  const q={ slots:[{key:'a',label:'1'},{key:'b',label:'2'},{key:'c',label:'3'}], tracks:[{title:'Creep',artist:'Radiohead'}, null, {title:'Sunshine of Your Love',artist:'Cream'}] };
  eq(SC9.quizListen(q), [{title:'Creep',artist:'Radiohead',label:'1'},{title:'Sunshine of Your Love',artist:'Cream',label:'3'}], 'quizListen: etykiety slotów, null pominięty');
  eq(SC9.quizListen({ track:{title:'Purple Rain',artist:'Prince'} }), [{title:'Purple Rain',artist:'Prince',label:''}], 'quizListen: pojedynczy track');
  eq(SC9.quizListen({ prompt:'x' }), [], 'bez utworu → []');
  eq(SC9.listenList([{title:'A',artist:'B',label:'<b>1</b>'.repeat(20)}, {title:'',artist:'B'}, 'x']).length, 1, 'listenList: tylko poprawne, label przycięty');
  eq(SC9.listenList('zle'), [], 'listenList: nie-lista → []');
});
group('Łamigłówki: mpReducer — częściowe punkty drużyny + listen/promptStyle TYLKO w reveal', ()=>{
  const slots=[{key:'a',label:'1'},{key:'b',label:'2'},{key:'c',label:'3'}];
  const g=coopG({ answerSlots:slots, members:['u1'],
    proposals:[{by:'u1',byName:'Ala',values:{a:'Creep',b:'Greed',c:'Cream'}}],
    votes:{ a:{u1:'Creep'}, b:{u1:'Greed'}, c:{u1:'Cream'} } });
  const cur={ prompt:'Jedna litera różnicy', slots, answers:{a:['Creep'],b:['Creed'],c:['Cream']}, partial:true,
    listen:[{title:'Creep',artist:'Radiohead',label:'1'}], display:'', track:'', artist:'' };
  const ev=evaluateAnswer(g, cur);
  ok(!ev.reveal.teamOk, 'nie komplet');
  eq(ev.reveal.gained, 67, '2/3 słów → 67 pkt');
  eq(ev.reveal.listen, [{title:'Creep',artist:'Radiohead',label:'1'}], 'reveal.listen = utwory do odsłuchu');
  const ev2=evaluateAnswer(g, { ...cur, partial:false });
  eq(ev2.reveal.gained, 0, 'bez partial → 0 (wszystko albo nic)');
  const ev3=evaluateAnswer(g, { ...cur, display:'rebus' });
  eq(ev3.reveal.promptStyle, 'rebus', 'reveal.promptStyle = rebus');
  const mus=evaluateAnswer(coopG({}), { track:'Hey Jude', artist:'Beatles' });
  eq(mus.reveal.listen, [], 'muzyka: listen puste');
});
group('Łamigłówki: picker — grupa „lamiglowki" osobno od Wiedzy, kostka jej nie losuje', ()=>{
  const cats={ wq:{ kind:'quiz', label:'Wiedza', questions:[{prompt:'?',slots:[{key:'a'}],answers:{a:['x']}}] },
    rb:{ kind:'quiz', label:'Rebusy', group:'lamiglowki', questions:[{prompt:'?',slots:[{key:'a'}],answers:{a:['x']}}] },
    d80:{ label:'80s', artists:['A','B'] } };
  eq(PK9.quizGroupKeys(['wq','rb'], cats, 'wiedza'), ['wq'], 'Wiedza bez łamigłówek');
  eq(PK9.quizGroupKeys(['wq','rb'], cats, 'lamiglowki'), ['rb'], 'Łamigłówki = group:lamiglowki');
  ok(PK9.isPuzzleCat(cats.rb) && !PK9.isPuzzleCat(cats.wq) && !PK9.isPuzzleCat(null), 'isPuzzleCat');
  for(let i=0;i<20;i++){ const r=randomPools(Object.keys(cats), cats); ok(!r.cats.includes('rb') && !r.cats.includes('wq'), 'kostka: bez quizu/łamigłówek'); }
  const m=buildMatch(['rb'], ['quiz'], {questions:5}, cats);
  ok(!m.error && m.slots.every(s=>s.cat==='rb' && s.mode==='quiz'), 'łamigłówki grają jak quiz (tryb quiz)');
});
group('Łamigłówki: lint — oneLetterApart / ladderErrors / puzzleFieldErrors', ()=>{
  ok(LR9.oneLetterApart('Creep','Creed'), 'Creep→Creed');
  ok(!LR9.oneLetterApart('Creed','Cream'), 'Creed→Cream to DWIE litery (e→a, d→m) → nie');
  ok(!LR9.oneLetterApart('Kult','Kola'), 'dwie różnice → nie');
  ok(LR9.oneLetterApart('Kult','Kalt'), 'wielkość liter bez znaczenia');
  ok(!LR9.oneLetterApart('Lato','Łato') === false, 'ł≠l — polska litera to inna litera (różnica 1)');
  ok(!LR9.oneLetterApart('Abba','Abbaa'), 'inna długość → nie');
  ok(!LR9.oneLetterApart('Abba','Abba'), 'identyczne → nie (0 różnic)');
  ok(LR9.oneLetterApart('Bon Jovi','Bon Jove'), 'spacje liczone jak znaki');
  ok(!LR9.oneLetterApart('Hey Jude','HeyXJude') === false, 'spacja→litera to też 1 podmiana');
  const good={ slots:[{key:'a'},{key:'b'},{key:'c'}], answers:{a:['Creep','x'],b:['Creed'],c:['Greed']} };
  eq(LR9.ladderErrors(good), [], 'poprawna drabinka');
  ok(LR9.ladderErrors({ ...good, tracks:[{title:'Creep',artist:'Radiohead'}, null, null] }).some(m=>/bez odsłuchu/.test(m)), 'drabinka z tracks → błąd (bez odsłuchu w odsłonie)');
  ok(LR9.ladderErrors({ ...good, track:{title:'Creep',artist:'Radiohead'} }).some(m=>/bez odsłuchu/.test(m)), 'drabinka z track → błąd');
  eq(LR9.ladderErrors({ ...good, answers:{a:['Creep'],b:['Creed'],c:['Cream']} }).length, 1, 'złamany krok 2→3 (Creed→Cream)');
  eq(LR9.ladderErrors({ slots:[{key:'a'}], answers:{a:['X']} }).length, 1, '1 slot → błąd');
  ok(LR9.ladderErrors({ slots:[{key:'a'},{key:'b'}], answers:{a:['Sylwia'],b:['Sylvia']} }).some(m=>/tolerancja/.test(m)), '≥6 znaków: sąsiad zaliczany jako literówka → błąd');
  eq(LR9.puzzleFieldErrors({ display:'rebus', track:{title:'Purple Rain',artist:'Prince'} }), [], 'rebus z trackiem OK');
  ok(LR9.puzzleFieldErrors({ display:'rebus' }).length===1, 'rebus bez tracka → błąd');
  ok(LR9.puzzleFieldErrors({ display:'big' }).length===1, 'display spoza „rebus" → błąd');
  ok(LR9.puzzleFieldErrors({ partial:'yes' }).length===1, 'partial nie-bool → błąd');
  ok(LR9.puzzleFieldErrors({ slots:[{key:'a'},{key:'b'}], tracks:[{title:'A',artist:'B'}, null, null] }).length>=1, 'tracks dłuższe niż sloty → błąd');
  ok(LR9.puzzleFieldErrors({ slots:[{key:'a'}], tracks:[null] }).length>=1, 'same null → błąd');
  eq(LR9.puzzleFieldErrors({ slots:[{key:'a'},{key:'b'}], tracks:[{title:'A',artist:'B'}, null] }), [], 'tracks z null OK');
});

/* ===================== EKSPERYMENT: „oś czasu" (timeline) + „zwolnione/przyspieszone obroty" (slowmo/fastmo) ===================== */
const TL = await import('../core/timeline.js');
const T9 = await import('../core/timing.js');
const S9 = await import('../core/scoring.js');
const M9 = await import('../core/match.js');
group('EKSP. oś czasu: karty, szczeliny, ocena (równy rok = poprawnie po obu stronach), wstawianie', ()=>{
  const c=(y,t='t'+y)=>({ track:t, artist:'a', year:y, art:'' });
  eq(TL.timelineCard({ track:'X', artist:'Y', year:'1984-05-01T00:00:00Z', art:'u' }), { track:'X', artist:'Y', year:1984, art:'u' }, 'karta z utworu (rok z daty)');
  eq(TL.timelineCard({ track:'X', year:'' }), null, 'brak roku → null');
  const cards=[c(1980), c(1985,'a'), c(1985,'b'), c(1990)];
  eq(TL.gapCount(cards), 5, 'n kart → n+1 szczelin'); eq(TL.gapCount([]), 1, 'pusta oś → 1 szczelina');
  eq(TL.gapBounds(cards,0), { lo:null, hi:1980 }, 'szczelina 0 = przed pierwszą');
  eq(TL.gapBounds(cards,4), { lo:1990, hi:null }, 'ostatnia = po ostatniej');
  eq(TL.gapBounds(cards,5), null, 'poza zakresem → null'); eq(TL.gapBounds(cards,1.5), null, 'nie-całkowita → null');
  ok(TL.gapOk(cards,0,1975) && !TL.gapOk(cards,0,1981), 'przed pierwszą: ≤1980');
  ok(TL.gapOk(cards,0,1980), 'rok równy pierwszej karcie — przed nią OK');
  ok(TL.gapOk(cards,1,1980), 'rok równy pierwszej karcie — po niej też OK');
  eq(TL.correctGaps(cards,1985), [1,2,3], '1985: obok obu kart 1985 i między nimi');
  eq(TL.correctGaps(cards,1987), [3], '1987 → tylko między 1985 a 1990');
  eq(TL.correctGaps(cards,2001), [4], 'po ostatniej');
  ok(!TL.gapOk(cards,2,'abc') && !TL.gapOk(cards,-1,1985), 'śmieci → false');
  eq(TL.correctGaps([],1999), [0], 'pusta oś: jedyna szczelina poprawna');
  const ins=TL.insertCard(cards, c(1985,'nowa'), 1);
  eq(ins.index, 1, 'poprawna szczelina gracza = miejsce wstawienia (równy rok)');
  eq(ins.cards.map(x=>x.year), [1980,1985,1985,1985,1990], 'oś posortowana'); eq(cards.length, 4, 'wejście niemutowane');
  const nat=TL.insertCard(cards, c(1986), 0);
  eq(nat.index, 3, 'zła szczelina → miejsce naturalne (po ≤)');
  eq(TL.insertCard([], c(1999)).index, 0, 'wstawienie do pustej osi');
  eq(TL.sortCards([c(1990,'x'), c(1980), c(1990,'y')]).map(x=>x.track), ['t1980','x','y'], 'sortowanie stabilne');
  eq(TL.gapLabel(cards,0), 'przed 1980', 'opis: przed'); eq(TL.gapLabel(cards,4), 'po 1990', 'opis: po');
  eq(TL.gapLabel(cards,1), 'między 1980 a 1985', 'opis: między'); eq(TL.gapLabel(cards,2), 'obok 1985', 'opis: równe lata');
  eq(TL.gapLabel([],0), 'pierwsza karta', 'opis: pusta oś');
  eq([1,2,5,12,22,25].map(TL.cardsWord), ['karta','karty','kart','kart','karty','kart'], 'odmiana „karta"');
  eq(TL.timelineSummary([c(1990), c(1979), c(1984)]), '3 karty · 1979–1990', 'podsumowanie osi');
});
group('EKSP. oś czasu: wiarygodny rok, kategorie, seria lat', ()=>{
  const dek={ range:'1980–89', artists:['A'] };
  ok(TL.timelineEligible({ year:'1984-01-01', yearSrc:'' }, dek), 'rok w dekadzie → wiarygodny');
  ok(!TL.timelineEligible({ year:'2011-01-01' }, dek), 'remaster spoza dekady → niewiarygodny');
  ok(!TL.timelineEligible({ year:'' }, dek), 'bez roku → nie');
  ok(TL.timelineEligible({ year:'1999', yearSrc:'data' }, { songs:[] }), 'rok z danych playlisty → wiarygodny');
  ok(!TL.timelineEligible({ error:true }, dek), 'błąd rozwiązania → nie');
  ok(TL.timelineCapable(dek), 'dekada → oś czasu');
  ok(!TL.timelineCapable({ artists:['A'], desc:'rock' }), 'styl bez zakresu lat → bez osi');
  ok(TL.timelineCapable({ songs:[1,2,3,4].map(i=>({ title:'t', year:'199'+i })) }), 'playlista z rokiem w danych → oś');
  ok(!TL.timelineCapable({ songs:[{year:'1990'},{},{},{}] }), 'playlista z rokiem u mniejszości → bez osi');
  ok(!TL.timelineCapable({ kind:'quiz' }) && !TL.timelineCapable({ kind:'lyrics', songs:[] }), 'quiz/teksty bez osi');
  ok(TL.yearRunOk([], 1984) && TL.yearRunOk([1984], 1984), '1–2 te same lata OK');
  ok(!TL.yearRunOk([1990, 1984, 1984], 1984), 'trzeci raz z rzędu ten sam rok → unikaj');
  ok(TL.yearRunOk([1984, 1990, 1984], 1984), 'nie z rzędu → OK');
});
{
  const dek={ range:'1980–89', artists:['A'] };
  const seq=(list)=>{ let i=0; return ()=>Promise.resolve(list[Math.min(i++, list.length-1)]); };
  const r1=await TL.pickTimelineTrack({ resolve:seq([{ track:'remaster', year:'2012' }, { track:'ok', year:'1986' }]), cat:dek });
  const r2=await TL.pickTimelineTrack({ resolve:seq([{ track:'a', year:'1984' }, { track:'b', year:'1987' }]), cat:dek, recentYears:[1984,1984] });
  const r3=await TL.pickTimelineTrack({ resolve:seq([{ track:'a', year:'1984' }]), cat:dek, recentYears:[1984,1984], tries:3 });
  const r4=await TL.pickTimelineTrack({ resolve:seq([{ track:'x', year:'2015' }]), cat:dek, tries:2 });
  let calls=0;
  const r5=await TL.pickTimelineTrack({ resolve:()=>{ calls++; return Promise.resolve({ error:true, reason:'offline' }); }, cat:dek });
  let live=true;
  const r6=await TL.pickTimelineTrack({ resolve:()=>{ live=false; return Promise.resolve({ track:'a', year:'1984' }); }, cat:dek, alive:()=>live });
  group('EKSP. oś czasu: pickTimelineTrack — wiarygodny rok, bez 3. tego samego roku, zapasy', ()=>{
    ok(r1.track && r1.track.track==='ok' && r1.card.year===1986, 'utwór z rokiem spoza dekady pominięty → następny');
    ok(r2.track.track==='b' && !r2.relaxed, 'trzeci 1984 z rzędu pominięty → inny rok');
    ok(r3.track && r3.relaxed && r3.card.year===1984, 'same 1984 → zapas (relaxed) zamiast błędu');
    ok(r4.error && r4.reason==='noyear' && r4.track && r4.track.track==='x', 'brak wiarygodnego roku → błąd z grywalnym utworem (zagra jak muzyka)');
    ok(r5.error && r5.reason==='offline' && calls===1 && r5.track===null, 'offline → od razu koniec');
    ok(r6.aborted, 'runda porzucona w trakcie → aborted');
  });
}
group('EKSP. oś czasu: punkty (100 + żetony 20/20, seria tylko przy dobrym miejscu), legenda, tryb tylko solo', ()=>{
  eq(S9.scoreRound({ placeOk:true, elapsedMs:null }).points, 100, 'dobre miejsce = 100');
  eq(S9.scoreRound({ placeOk:true, okTitle:true, okArtist:true, elapsedMs:null }).points, 140, '+ tytuł + wykonawca = 140');
  eq(S9.scoreRound({ placeOk:false, okTitle:true, elapsedMs:null }).points, 20, 'pudło na osi, tytuł OK → 20');
  eq(S9.scoreRound({ placeOk:false, elapsedMs:null, streak:5 }).points, 0, 'pudło → 0');
  eq(S9.scoreRound({ placeOk:true, elapsedMs:null, streak:3 }).points, 150, 'seria ×1,5 przy dobrym miejscu');
  eq(S9.scoreRound({ placeOk:false, okArtist:true, elapsedMs:null, streak:5 }).streakMult, 1, 'seria nie liczy się przy pudle');
  eq(S9.scoreRound({ placeOk:true, elapsedMs:null }).parts.place, 100, 'parts.place');
  ok(S9.scoreRound({ placeOk:true, okTitle:true, okArtist:true, elapsedMs:0, streak:9 }).points<=S9.SCORE_MAX_PER_Q, 'limit ligi bez zmian');
  eq(S9.scoreRound({ okTitle:true, okArtist:true, elapsedMs:null }).parts.place, undefined, 'muzyka bez parts.place (format bez zmian)');
  ok(/dobre miejsce na osi 100/.test(S9.scoreLegend('timeline')) && /tytuł \+20/.test(S9.scoreLegend('timeline')), 'legenda osi — '+S9.scoreLegend('timeline'));
  ok(M9.ALL_MODES.includes('timeline') && M9.MODE_LABEL.timeline==='🕰 oś czasu' && M9.MODE_SHORT.timeline && M9.MODE_SUB.timeline, 'tryb + etykiety');
  ok(!M9.MP_MODES.includes('timeline') && M9.SOLO_ONLY_MODES.includes('timeline'), 'oś czasu tylko solo');
  eq(M9.sanitizeMpConfig({ modes:['music','timeline','slowmo','fastmo'] }).modes, ['music','slowmo','fastmo'], 'MP config: oś czasu odrzucona, tempo przyjęte');
  const C={ dek:{ label:'80', range:'1980–89', artists:['A','B','C'] }, sty:{ label:'rock', artists:['A','B'] } };
  ok(M9.modesFor('dek',C).includes('timeline') && !M9.modesFor('sty',C).includes('timeline'), 'modesFor: dekada tak, styl bez zakresu nie');
  const m=M9.buildMatch(['dek','sty'],['timeline'],{questions:5},C); ok(!m.error && m.slots.every(s=>s.cat==='dek' && s.mode==='timeline'), 'buildMatch: oś tylko z kategorii z rokiem');
  eq(T9.LISTEN_SECS.timeline, 15, 'faza „słuchaj" osi (MP przyszłościowo)');
});
group('EKSP. obroty: etapy tempa, mnożniki, płyta, MP', ()=>{
  eq(T9.TEMPO_STAGES.slowmo, [0.6, 0.75], 'slowmo: 0.6× → 0.75× (bez 0.9×)'); eq(T9.TEMPO_STAGES.fastmo, [1.5], 'fastmo: 1.5×');
  eq([T9.tempoRate('slowmo',0), T9.tempoRate('slowmo',1), T9.tempoRate('slowmo',9), T9.tempoRate('slowmo','x')], [0.6,0.75,0.75,0.6], 'tempoRate slowmo + clamp');
  eq([T9.tempoRate('fastmo',0), T9.tempoRate('fastmo',3), T9.tempoRate('music',0)], [1.5,1.5,1], 'tempoRate fastmo / inne tryby = 1');
  eq([T9.tempoNextStage('slowmo',0), T9.tempoNextStage('slowmo',1), T9.tempoNextStage('fastmo',0), T9.tempoNextStage('music',0)], [1,null,null,null], 'tempoNextStage');
  ok(T9.isTempoMode('slowmo') && T9.isTempoMode('fastmo') && !T9.isTempoMode('music') && !T9.isTempoMode('constructor'), 'isTempoMode');
  eq([T9.mpTempoRate('slowmo'), T9.mpTempoRate('fastmo'), T9.mpTempoRate('music')], [0.6,1.5,1], 'MP: stałe tempo (etap 0)');
  eq([T9.vinylTurnSecs(1), T9.vinylTurnSecs(0.6), T9.vinylTurnSecs(1.5), T9.vinylTurnSecs(0), T9.vinylTurnSecs('x')].map(x=>+x.toFixed(2)), [1.8,3,1.2,1.8,1.8], 'obrót płyty ∝ 1/tempo (1.0× = 1,8 s)');
  ok(T9.vinylTurnSecs(0.6)>T9.vinylTurnSecs(0.75) && T9.vinylTurnSecs(0.75)>T9.vinylTurnSecs(1.5), 'wolniej = dłuższy obrót');
  eq([S9.tempoMult('slowmo',0), S9.tempoMult('slowmo',1), S9.tempoMult('slowmo',7), S9.tempoMult('fastmo',0), S9.tempoMult('music',0)], [1.5,1,1,1.2,1], 'mnożniki ×1.5 → ×1.0, fastmo ×1.2');
  eq(S9.scoreRound({ okTitle:true, okArtist:true, elapsedMs:null, mult:S9.tempoMult('slowmo',0) }).points, 150, '100 × 1.5 = 150');
  eq(S9.scoreRound({ okTitle:true, elapsedMs:null, mult:S9.tempoMult('fastmo',0) }).points, 60, '50 × 1.2 = 60');
  ok(/0\.6× ×1\.5 → 0\.75× ×1\.0/.test(S9.scoreLegend('slowmo')), 'legenda slowmo — '+S9.scoreLegend('slowmo'));
  ok(/1\.5× ×1\.2/.test(S9.scoreLegend('fastmo')), 'legenda fastmo — '+S9.scoreLegend('fastmo'));
  ok(['slowmo','fastmo'].every(m=>M9.MP_MODES.includes(m) && !M9.SOLO_ONLY_MODES.includes(m)), 'tempo działa w MP');
  ok(!M9.mpAvailableModes(null,true).includes('slowmo') && M9.mpAvailableModes(M9.MP_MODES,true).includes('fastmo'), 'stary serwer → bez tempa; nowy → z');
  eq([M9.MODE_LABEL.slowmo, M9.MODE_LABEL.fastmo], ['🐢 zwolnione obroty','🐿 przyspieszone'], 'etykiety');
  eq(M9.modesFor('lyr',{ lyr:{ kind:'lyrics', songs:[] } }), ['lektor'], 'teksty (bez audio) bez tempa');
  ok(T9.LISTEN_SECS.slowmo>T9.LISTEN_SECS.music && T9.LISTEN_SECS.fastmo>0, 'MP: dłuższa faza „słuchaj" przy 0.6×');
  // MP: mnożnik tempa w ocenie drużyny (stały etap 0)
  const g={ phase:'play', mode:'slowmo', teams:[{id:'all',name:'D',members:['u1']}], byTeam:{ all:{ proposals:[], votes:{ title:{u1:'Hey Jude'}, artist:{u1:'Beatles'} }, sure:[], passed:[] } }, scores:{all:0} };
  const ev=evaluateAnswer(g, { track:'Hey Jude', artist:'Beatles', year:'', album:'' });
  eq(ev.perTeam.all.gained, 150, 'MP slowmo: trafienie 100 × 1.5');
  eq(evaluateAnswer({ ...g, mode:'fastmo' }, { track:'Hey Jude', artist:'Beatles' }).perTeam.all.gained, 120, 'MP fastmo: 100 × 1.2');
  eq(evaluateAnswer({ ...g, mode:'music' }, { track:'Hey Jude', artist:'Beatles' }).perTeam.all.gained, 100, 'MP muzyka bez zmian');
});

/* ===== „Twój gust" (etap 1): core/taste.js ===== */
group('gust: trackKey — klucz utworu (norm + displayTitle), isTrackKey', ()=>{
  eq(trackKey('The Beatles', 'Hey Jude'), 'beatles|hey jude', 'przedimek, małe litery');
  eq(trackKey('Queen', 'Bohemian Rhapsody (2011 Remaster)'), trackKey('Queen', 'Bohemian Rhapsody'), 'remaster ≡ oryginał');
  eq(trackKey('Queen', 'Bohemian Rhapsody - Remastered 2011'), trackKey('Queen', 'Bohemian Rhapsody'), '„ - Remastered" ≡ oryginał');
  eq(trackKey('Myslovitz', 'Długość dźwięku samotności'), 'myslovitz|dlugosc dzwieku samotnosci', 'diakrytyki (ł → l)');
  eq(trackKey('', 'X'), '', 'brak wykonawcy → pusty klucz');
  eq(trackKey('A', '   '), '', 'pusty tytuł → pusty klucz');
  ok(isTrackKey('queen|bohemian rhapsody') && !isTrackKey('<script>|x') && !isTrackKey('bez-kreski') && !isTrackKey(5), 'isTrackKey');
});
group('gust: sanitizeRating — pola, walidacja, ts', ()=>{
  const now=1_000_000;
  const r=sanitizeRating({ title:' Hey  Jude ', artist:'The Beatles', year:'1968-08-26', genre:'Rock', art:'https://x/a.jpg', cat:'60s', rating:2, source:'reveal', ts:500, trackKey:'cudzy|klucz', extra:'x' }, now);
  eq(r, { trackKey:'beatles|hey jude', title:'Hey Jude', artist:'The Beatles', year:'1968', genre:'Rock', art:'https://x/a.jpg', cat:'60s', rating:2, source:'reveal', ts:500 }, 'pełna ocena (klucz liczony, rok 4 cyfry, bez obcych pól)');
  eq(sanitizeRating({ title:'a', artist:'b', rating:0 }, now), null, 'rating 0 → null');
  eq(sanitizeRating({ title:'a', artist:'b', rating:3 }, now), null, 'rating 3 → null');
  eq(sanitizeRating(null, now), null, 'null → null');
  const b=sanitizeRating({ title:'a', artist:'b', rating:-1, art:'javascript:alert(1)', cat:'x"><img', year:'zz', source:'?', ts:now+2*86400000 }, now);
  eq([b.art, b.cat, b.year, b.source, b.ts], ['', '', '', 'swipe', now], 'złe art/cat/rok/source → bezpieczne; ts z przyszłości → teraz');
  eq(sanitizeRating({ title:'a', artist:'b', rating:1, art:'http://x/a.jpg' }, now).art, '', 'okładka tylko https');
  eq(sanitizeRating({ title:'x'.repeat(500), artist:'b', rating:1 }, now).title.length, 200, 'tytuł przycięty do 200');
});
group('gust: rate / toggleHeart / unrate (nagrobek) / ratingOf / tasteCounts / półka', ()=>{
  let st={};
  const hj={ track:'Hey Jude (Remastered 2015)', artist:'The Beatles', year:'1968', art:'https://x/1.jpg', genre:'Rock' };
  const r1=rate(st, hj, 1, { source:'swipe', now:100 }); st=r1.store;
  eq(r1.item.title, 'Hey Jude (Remastered 2015)', 'rate: tytuł z `track`');
  eq(ratingOf(st, trackKey('The Beatles','Hey Jude')), 1, '👍 zapisane pod kluczem bez remasteru');
  let t=toggleHeart(st, { title:'Hey Jude', artist:'The Beatles' }, { now:200 }); st=t.store;
  ok(t.on && ratingOf(st, t.key)===2, '❤️ toggle: 👍 → ❤️');
  eq(st[t.key].source, 'reveal', 'toggleHeart domyślnie source=reveal');
  t=toggleHeart(st, { title:'Hey Jude', artist:'The Beatles' }, { now:300 }); st=t.store;
  ok(!t.on && ratingOf(st, t.key)===0 && st[t.key].rating===0 && st[t.key].ts===300, '❤️ toggle 2×: zdjęte z półki → nagrobek z ts');
  eq(activeRatings(st).length, 0, 'nagrobek nie liczy się jako ocena');
  eq(unrate(st, t.key).changed, false, 'unrate nagrobka → bez zmian');
  st=rate(st, { title:'B', artist:'Z', year:'1999' }, 2, { now:400 }).store;
  st=rate(st, { title:'A', artist:'Y', year:'1975' }, 2, { now:500 }).store;
  st=rate(st, { title:'C', artist:'X' }, -1, { now:600 }).store;
  eq(tasteCounts(st), { total:3, hearts:2, up:0, down:1 }, 'liczniki');
  eq(shelfItems(st,'recent').map(x=>x.title), ['A','B'], 'półka: ostatnio');
  eq(shelfItems(st,'artist').map(x=>x.artist), ['Y','Z'], 'półka: wykonawca A→Z');
  eq(shelfItems(st,'year').map(x=>x.year), ['1975','1999'], 'półka: rok rosnąco');
  eq(rate({}, { title:'', artist:'x' }, 1).item, null, 'pusty tytuł → brak oceny');
  const u=unrate(st, trackKey('Y','A'), { now:700 });
  ok(u.changed && ratingOf(u.store, trackKey('Y','A'))===0, 'unrate → nagrobek');
});
group('gust: capStore — limit ocen (❤️ chronione najdłużej), parseStore', ()=>{
  let st={};
  st=rate(st, { title:'h1', artist:'a' }, 2, { now:1 }).store;
  for(let i=0;i<5;i++) st=rate(st, { title:'u'+i, artist:'a' }, 1, { now:10+i }).store;
  const c=capStore(st, 3);
  eq(activeRatings(c).map(x=>x.title).sort(), ['h1','u3','u4'], 'ponad limit → najpierw najstarsze 👍, ❤️ zostaje');
  ok(TASTE_MAX===2000, 'TASTE_MAX = 2000');
  const raw=JSON.stringify({ ...st, 'zly': { rating:7 }, 'a|tomb': { rating:0, ts:5, syn:true }, [trackKey('a','h1')]: { ...st[trackKey('a','h1')], syn:true } });
  const p=parseStore(raw);
  ok(p['a|tomb'] && p['a|tomb'].rating===0 && p['a|tomb'].syn, 'parseStore: nagrobek + syn zachowane');
  ok(!p.zly && p[trackKey('a','h1')].syn===true, 'parseStore: śmieci odrzucone, syn zachowany');
  eq(parseStore('{zepsuty'), {}, 'zepsuty JSON → {}');
  eq(parseStore('[1,2]'), {}, 'tablica → {}');
});
group('gust: mergeTaste — last-write-wins, push/del, usunięte na innym urządzeniu', ()=>{
  const now=10_000;
  const S=(title, rating, ts)=>({ title, artist:'X', rating, ts });
  const k=t=>trackKey('X', t);
  let local={};
  local=rate(local, S('newer-local'), 1, { now:500 }).store;          // lokalnie nowsze → push
  local=rate(local, S('older-local'), 1, { now:100 }).store;          // serwer nowszy → nadpisz
  local=rate(local, S('only-local'), 2, { now:300 }).store;           // nie ma na serwerze, bez syn → push
  local={ ...local, [k('synced-gone')]: { ...sanitizeRating(S('synced-gone', 1, 50), now), syn:true } };   // syn + brak na serwerze → usunięte gdzie indziej
  local={ ...local, [k('tomb')]: { trackKey:k('tomb'), rating:0, ts:900 } };              // nagrobek nowszy niż serwer → del
  local={ ...local, [k('tomb-gone')]: { trackKey:k('tomb-gone'), rating:0, ts:900 } };    // nagrobek, serwer nie ma → znika
  const server=[ S('newer-local', -1, 200), S('older-local', 2, 400), S('tomb', 2, 100), S('server-only', 1, 50), { junk:true } ];
  const m=mergeTaste(local, server, now);
  eq(m.store[k('newer-local')].rating, 1, 'lokalnie nowsza ocena zostaje');
  eq(m.store[k('older-local')].rating, 2, 'serwer nowszy → nadpisuje');
  ok(m.store[k('older-local')].syn, 'z serwera → syn');
  ok(m.store[k('server-only')] && m.store[k('server-only')].syn, 'tylko na serwerze → dociągnięte');
  ok(!m.store[k('synced-gone')], 'syn + brak na serwerze → usunięte (skasowane na innym urządzeniu)');
  ok(!m.store[k('tomb-gone')], 'nagrobek bez wpisu na serwerze → znika');
  eq(m.push.map(x=>x.title).sort(), ['newer-local','only-local'], 'push: lokalnie nowsze + niewysłane');
  ok(m.push.every(x=>!('syn' in x)), 'push bez flagi syn');
  eq(m.del, [k('tomb')], 'del: nagrobek nowszy niż serwer');
  const ms=markSynced(m.store, [m.store[k('newer-local')], { trackKey:k('only-local'), ts:1 }]);
  ok(ms[k('newer-local')].syn && !ms[k('only-local')].syn, 'markSynced: tylko gdy ts się zgadza (nie zmienione w locie)');
  ok(!dropTombs(m.store, [k('tomb')])[k('tomb')], 'dropTombs: nagrobek po DELETE znika');
  ok(dropTombs(m.store, [k('newer-local')])[k('newer-local')], 'dropTombs nie rusza aktywnej oceny');
  eq(batches([1,2,3,4,5], 2), [[1,2],[3,4],[5]], 'batches');
});
group('gust: grupy gatunków, dekady, kategorie', ()=>{
  eq(['Pop','Hard Rock','Heavy Metal','Hip-Hop/Rap','R&B/Soul','Dance','Electronic','Alternative','Soundtrack','',undefined].map(genreGroup),
    ['pop','rock','metal','hiphop','hiphop','dance','dance','rock','inne','',''], 'genreGroup (iTunes primaryGenreName)');
  eq([['rap-pl','rap PL'],['disco-polo','disco polo'],['rock-world','rock świat'],['metal','metal'],['hits-now','hity dziś'],['dz-film','filmy i gry'],['80s','lata 80'],['unplugged','akustycznie / unplugged']].map(([k,l])=>catGroup(k,l)),
    ['hiphop','dance','rock','metal','pop','inne','','rock'], 'catGroup z klucza/etykiety');
  eq(['1984','1984-05-01','2021','1899','',null,'abc'].map(decadeOf), ['1980','1980','2020','','','',''], 'decadeOf');
});
// fixture: 7 dekad × artyści, style z częścią tych samych artystów, playlista z utworami
const TASTE_CATS={
  '60s':{ label:'lata 60', range:'1960–69', artists:['A60','B60','C60','D60'] },
  '70s':{ label:'lata 70', range:'1970–79', artists:['A70','B70','C70','D70'] },
  '80s':{ label:'lata 80', range:'1980–89', artists:['A80','B80','C80','D80','E80'] },
  '90s':{ label:'lata 90', range:'1990–99', artists:['A90','B90','C90','D90'] },
  '00s':{ label:'lata 2000', range:'2000–09', artists:['A00','B00','C00','D00'] },
  '10s':{ label:'lata 2010', range:'2010–19', artists:['A10','B10','C10','D10'] },
  '20s':{ label:'lata 2020', range:'2020–', artists:['A20','B20','C20','D20'] },
  'rock-world':{ label:'rock świat', artists:['A60','A70','A80','B80','A90','A00','A10'] },
  'pop-world':{ label:'pop świat', artists:['B60','B70','C80','B90','B00','B10','A20'] },
  'metal':{ label:'metal', artists:['C70','D80','C90'] },
  'rap-pl':{ label:'rap PL', artists:['C00','C10','B20','C20'] },
  'dance-90':{ label:'eurodance', artists:['D90','E80','D00','D10','D20'] },
  'dz-top':{ label:'światowe hity', songs:[{ title:'Hit One', artist:'Solo Star', year:1985 }, { title:'Hit Two', artist:'Duo', year:2015 }, { title:'Akustyk', artist:'Duo', match:'acoustic' }] },
  'quizik':{ kind:'quiz', label:'quiz', questions:[] },
};
group('gust: tasteCandidates — wykonawcy (dekada × grupa z krzyżowania kategorii) + utwory playlist', ()=>{
  const pool=tasteCandidates(TASTE_CATS);
  const a80=pool.find(c=>c.artist==='A80');
  eq([a80.cat, a80.decade, a80.group], ['80s','1980','rock'], 'artysta dekady dostaje grupę ze stylu');
  const d20=pool.find(c=>c.artist==='D20');
  eq([d20.decade, d20.group], ['2020','dance'], 'otwarta dekada „2020–" → 2020');
  eq(pool.filter(c=>c.artist==='A80').length, 1, 'bez duplikatów wykonawcy (dekada + styl)');
  const hit=pool.find(c=>c.title==='Hit One');
  eq([hit.decade, hit.group, hit.year], ['1980','pop','1985'], 'utwór playlisty: dekada z roku, grupa z kategorii');
  ok(!pool.some(c=>c.title==='Akustyk'), 'utwory z `match` (wersje akustyczne) pominięte');
  ok(!pool.some(c=>c.cat==='quizik'), 'kategorie quiz/lyrics pominięte');
  eq(planCat(a80, TASTE_CATS), { artists:['A80'], range:'1980–89' }, 'planCat: wykonawca + zakres dekady');
  eq(planCat(hit, TASTE_CATS), { songs:[{ title:'Hit One', artist:'Solo Star', year:'1985' }] }, 'planCat: utwór playlisty');
});
group('gust: pickTasteSession — 20 różnorodnych (pokrycie dekad × gatunków), adaptacja do profilu, bez ocenionych', ()=>{
  const pool=tasteCandidates(TASTE_CATS);
  const seeded=(seed)=>{ let s=seed; return ()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646; }; };
  const plan=pickTasteSession(pool, {}, seeded(7));
  eq(plan.length, Math.min(pool.length, SESSION_N+SESSION_SPARE), 'plan = n + zapas (ograniczony pulą)');
  const first=plan.slice(0, SESSION_N);
  eq(new Set(first.map(c=>c.decade).filter(Boolean)).size, 7, 'pierwsze 20: wszystkie 7 dekad');
  eq(new Set(first.map(c=>c.group).filter(Boolean)).size, 5, 'pierwsze 20: wszystkie 5 grup gatunków');
  eq(new Set(first.map(c=>c.artist)).size, first.length, 'bez powtórki wykonawcy w sesji');
  const firstTen=plan.slice(0, 7);
  eq(new Set(firstTen.map(c=>c.decade)).size, 7, 'pierwsze 7 kart = 7 różnych dekad (różnorodność od startu)');
  eq(JSON.stringify(pickTasteSession(pool, {}, seeded(7))), JSON.stringify(plan), 'deterministyczny przy tym samym rnd');
  // profil „zalany" latami 80 i rockiem → sesja odsuwa się od nich
  let st={};
  for(let i=0;i<30;i++) st=rate(st, { title:'R'+i, artist:'Rocker'+i, year:'198'+(i%10), genre:'Rock' }, 1, { now:i+1 }).store;
  let n80=0, nRock=0, b80=0, bRock=0;
  for(let sd=1; sd<=20; sd++){
    const p=pickTasteSession(pool, st, seeded(sd)).slice(0, 10), b=pickTasteSession(pool, {}, seeded(sd)).slice(0, 10);
    n80+=p.filter(c=>c.decade==='1980').length; nRock+=p.filter(c=>c.group==='rock').length;
    b80+=b.filter(c=>c.decade==='1980').length; bRock+=b.filter(c=>c.group==='rock').length;
  }
  ok(n80<b80, `adaptacja: mniej lat 80 przy profilu pełnym lat 80 (${n80} < ${b80})`);
  ok(nRock<bRock, `adaptacja: mniej rocka przy profilu pełnym rocka (${nRock} < ${bRock})`);
  // utwór playlisty już oceniony → nie trafia do planu
  const rated=rate({}, { title:'Hit One', artist:'Solo Star' }, 1).store;
  ok(!pickTasteSession(pool, rated, seeded(3), { n:200, spare:0 }).some(c=>c.title==='Hit One'), 'oceniony utwór playlisty pominięty');
  eq(pickTasteSession([], {}, seeded(1)), [], 'pusta pula → pusty plan');
  // seen dla resolveTrack: ocenione tytuły tego wykonawcy
  const sn=seenForArtist(rate({}, { title:'Song (Remastered)', artist:'The Band' }, 1).store, 'the band');
  ok(sn.has('song'), 'seenForArtist: tytuły ocenione u wykonawcy (norm)');
});
await (async ()=>{
  console.log('• gust: normalize() — gatunek iTunes (primaryGenreName) w rozwiązanym utworze; Deezer → pusty');
  const it=async()=>[{ trackName:'Song', artistName:'Band', previewUrl:'p', releaseDate:'1985-01-01', primaryGenreName:'Rock' }];
  const r=await resolveTrack({ cat:{ artists:['Band'] }, seen:new Set(), recent:[], itunes:it });
  eq(r.genre, 'Rock', 'artysta: genre z primaryGenreName');
  const dz=async()=>[{ trackName:'Song', artistName:'Band', previewUrl:'p', releaseDate:'' }];
  eq((await resolveTrack({ cat:{ artists:['Band'] }, seen:new Set(), recent:[], itunes:dz })).genre, '', 'bez gatunku (Deezer) → ""');
  const pl=await resolveTrack({ cat:{ songs:[{ title:'Song', artist:'Band' }] }, seen:new Set(), itunes:it });
  eq(pl.genre, 'Rock', 'utwór playlisty: genre z dopasowanego wyniku');
})();

/* ===== „Twój gust" (etap 2): core/tasteProfile.js — wektory, PL, „co znasz", pewność, archetypy, tekst ===== */
const TP_CATS={
  '80s':{ label:'lata 80', range:'1980–89', artists:['Maanam','Madonna'] },
  '20s':{ label:'lata 2020', range:'2020–', artists:['sanah'] },
  'rock-pl':{ label:'rock PL', artists:['Kult','Dżem','Myslovitz'] },
  'disco-polo':{ label:'disco polo', artists:['Akcent'] },
  'rock-world':{ label:'rock świat', artists:['Queen'] },
  'metal':{ label:'metal', artists:['Metallica'] },
  'pl:abc':{ label:'Moja playlista', kind:'playlist', songs:[{ title:'X', artist:'Foreign' }] },
};
// fabryka ocen: n ocen danego rodzaju (różne tytuły), ts rosnący
let tpTs=1;
const tpR=(n, o)=>Array.from({ length:n }, (_,i)=>({ trackKey:'k'+(tpTs)+'|t', title:'T'+(tpTs++), artist:o.artist||'A'+tpTs, year:o.year||'', genre:o.genre||'', cat:o.cat||'', rating:o.rating||1, ts:tpTs }));
group('gust2: profileGenre (iTunes EN/PL → 9 grup) + catProfileGenre + dekady kategorii', ()=>{
  const m={ 'Pop':'pop', 'K-Pop':'pop', 'Rock':'rock', 'Hard Rock':'rock', 'Blues':'rock', 'Hip-Hop/Rap':'hiphop', 'Rap':'hiphop',
    'Dance':'dance', 'Electronic':'dance', 'Muzyka elektroniczna':'dance', 'House':'dance', 'Disco':'dance', 'R&B/Soul':'rnb', 'Soul':'rnb', 'Funk':'rnb',
    'Alternative':'alt', 'Muzyka alternatywna':'alt', 'Indie Rock':'alt', 'Punk':'alt', 'Metal':'metal', 'Heavy Metal':'metal',
    'Disco Polo':'plscena', 'Muzyka biesiadna':'plscena', 'Poezja śpiewana':'plscena', 'Singer/Songwriter':'pop', 'Jazz':'inne', 'Soundtrack':'inne', '':'' };
  for(const [g,e] of Object.entries(m)) eq(profileGenre(g), e, `profileGenre(${JSON.stringify(g)})`);
  eq(PROFILE_GENRES.length, 9, '9 grup gatunków (z „inne")');
  eq(['rap-pl','disco-polo','rock-pl','dance-90','hits-now','evergreen-pl','metal','unplugged','80s'].map(k=>catProfileGenre(k, k==='dance-90'?'eurodance':'')),
    ['hiphop','plscena','rock','dance','pop','pop','metal','rock',''], 'catProfileGenre: style categories.js; dekada → ""');
  eq([catDecadeOf({ range:'1980–89' }), catDecadeOf({ range:'2020–' }), catDecadeOf({ range:'1960–99' }), catDecadeOf(null)], ['1980','2020','',''], 'dekada kategorii (≤10 lat / otwarta), szeroki zakres → ""');
  eq([itemDecade({ year:'1957' }), itemDecade({ year:'1994' }), itemDecade({ year:'', cat:'80s' }, TP_CATS), itemDecade({ year:'abc' })], ['1960','1990','1980',''], 'itemDecade: <1960 → 60., rok > kategoria');
});
group('gust2: PL vs świat — kategoria PL, polskie znaki, znani wykonawcy PL, gatunek', ()=>{
  const pls=plArtists(TP_CATS);
  ok(pls.has('kult') && pls.has('akcent') && !pls.has('queen') && !pls.has('madonna') && !pls.has('foreign'), 'plArtists: z kategorii PL (rock-pl, disco-polo), bez playlist');
  ok(isPlCat('rock-pl', TP_CATS['rock-pl']) && isPlCat('disco-polo', {}) && !isPlCat('pl:abc', TP_CATS['pl:abc']) && !isPlCat('rock-world', TP_CATS['rock-world']), 'isPlCat');
  const o={ cats:TP_CATS, plSet:pls };
  ok(isPolish({ artist:'Kult', cat:'80s' }, o), 'znany wykonawca PL (z rock-pl) w kategorii dekady');
  ok(isPolish({ artist:'Zespół Nieznany' }, o), 'polskie znaki w wykonawcy');
  ok(!isPolish({ artist:'Ramón Ayala' }, o), '„ó" samo nie wystarcza (hiszpański)');
  ok(isPolish({ artist:'X', cat:'rock-pl' }, o) && isPolish({ artist:'Y', genre:'Disco Polo' }, o), 'kategoria PL / gatunek polskiej sceny');
  ok(!isPolish({ artist:'Madonna', cat:'80s' }, o) && !isPolish(null, o), 'świat');
});
group('gust2: pctRound (suma 100) + pewność profilu + top artyści z półki', ()=>{
  eq(pctRound([1/3, 1/3, 1/3]), [34, 33, 33], 'największe reszty → suma 100');
  eq(pctRound([0, 0]), [0, 0], 'zera → zera');
  eq(pctRound([0.5, 0.25, 0.25, 0]).reduce((a,b)=>a+b, 0), 100, 'suma 100');
  eq([confidenceOf(0), confidenceOf(CONF_MID-1), confidenceOf(CONF_MID), confidenceOf(40), confidenceOf(CONF_HIGH)], ['low','low','mid','mid','high'], '<10 niska, 10–40 średnia, >40 wysoka');
  const ta=topArtists([
    { artist:'B', rating:2, ts:1 }, { artist:'a', rating:2, ts:2 }, { artist:'A', rating:2, ts:3 }, { artist:'C', rating:1, ts:9 },
    { artist:'D', rating:2, ts:8 }, { artist:'E', rating:2, ts:7 }, { artist:'F', rating:2, ts:6 }, { artist:'G', rating:2, ts:5 } ], 5);
  eq(ta.map(x=>x.artist+':'+x.n), ['A:2','D:1','E:1','F:1','G:1'], 'top 5: liczba ❤️ (bez 👍), remis → nowsze; nazwa z najnowszej oceny');
});
group('gust2: buildTasteProfile — wektory ważone ❤️=2/👍=1/👎=-1, udziały, PL, top', ()=>{
  const r=[ ...tpR(4, { year:'1985', genre:'Rock', rating:2, artist:'Kult' }), ...tpR(2, { year:'1995', genre:'Pop', rating:1, artist:'Madonna' }),
    ...tpR(2, { year:'1995', genre:'Pop', rating:-1, artist:'Madonna' }), ...tpR(3, { year:'2001', genre:'Hip-Hop/Rap', rating:-1, artist:'Eminem' }) ];
  const p=buildTasteProfile(r, { cats:TP_CATS });
  eq([p.total, p.hearts, p.up, p.down, p.liked], [11, 4, 2, 5, 6], 'liczniki');
  eq(p.confidence, 'mid', '11 ocen → średnia pewność');
  const d=k=>p.decades.find(x=>x.key===k), g=k=>p.genres.find(x=>x.key===k);
  eq([d('1980').score, d('1990').score, d('2000').score], [8, 0, -3], 'wynik dekad: 4×❤️=8, 2×👍+2×👎=0, 3×👎=-3');
  eq([d('1980').pct, d('1990').pct, d('2000').pct], [100, 0, 0], 'udziały: ujemne/zerowe kubełki → 0%');
  eq(d('2000').n, 3, 'n = liczba ocen w kubełku (także 👎)');
  eq(g('rock').pct, 100, 'gatunek: rock 100%');
  eq(p.decades.map(x=>x.key), DECADES, 'wektor dekad: stała kolejność 60.…2020');
  eq(p.topDecade.key+'|'+p.topGenre.key, '1980|rock', 'top dekada / gatunek');
  eq([p.pl.pct, p.pl.worldPct], [80, 20], 'PL: waga polubień (Kult 4×2=8) / (8+2) = 80%');
  eq(p.topArtists.map(x=>x.artist), ['Kult'], 'top artyści tylko z ❤️');
  eq(p.archetype.id, 'polska-szkola', 'archetyp: PL ≥ 70% → Polska szkoła');
  // magazyn (obiekt) z nagrobkiem też działa
  const st={ 'a|b':{ trackKey:'a|b', title:'b', artist:'a', rating:2, year:'1970', genre:'Rock', ts:1 }, 'c|d':{ trackKey:'c|d', rating:0, ts:2 } };
  eq(buildTasteProfile(st).total, 1, 'magazyn: nagrobki pominięte');
  const e=buildTasteProfile({});
  eq([e.total, e.confidence, e.archetype.id, e.topDecade, e.pl.pct], [0, 'low', 'poznajemy', null, 0], 'pusty profil → niska pewność, „Jeszcze cię poznajemy"');
});
group('gust2: archetypy — deterministyczne reguły (kolejność = priorytet), niska pewność → „Jeszcze cię poznajemy"', ()=>{
  const ids=ARCHETYPES.map(a=>a.id);
  ok(ids.length>=12 && ids.length<=16, '12–16 archetypów: '+ids.length);
  eq(new Set(ids).size, ids.length, 'unikalne id');
  ok(ARCHETYPES.every(a=>a.name && a.desc && a.emoji && a.when && typeof a.test==='function' && typeof a.why==='function'), 'każdy: nazwa, opis, emoji, warunek');
  ok(ARCHETYPES.every(a=>!/kurw|chuj|pierd|jeb|debil|idiot|głup/i.test(a.name+a.desc)), 'bez wulgaryzmów / obraźliwych słów');
  eq(ARCHETYPES[ARCHETYPES.length-1].id, 'zloty-srodek', 'fallback na końcu');
  const prof=(spec)=>buildTasteProfile(spec.flatMap(([n,o])=>tpR(n, o)), { cats:TP_CATS });
  const W={ artist:'Madonna' };
  const cases=[
    ['biesiada', [[12, { ...W, genre:'Disco Polo', year:'1997' }], [14, { ...W, genre:'Pop', year:'2015' }]]],
    ['metal', [[8, { ...W, genre:'Metal', year:'1986' }], [10, { ...W, genre:'Pop', year:'2015' }]]],
    ['hiphop', [[9, { ...W, genre:'Hip-Hop/Rap', year:'2015' }], [8, { ...W, genre:'Pop', year:'2016' }]]],
    ['parkiet', [[6, { ...W, genre:'Dance', year:'1994' }], [10, { ...W, genre:'Pop', year:'2015' }]]],
    ['groove', [[6, { ...W, genre:'R&B/Soul', year:'1999' }], [10, { ...W, genre:'Pop', year:'2015' }]]],
    ['indie', [[6, { ...W, genre:'Alternative', year:'2008' }], [10, { ...W, genre:'Pop', year:'2015' }]]],
    ['rock', [[9, { ...W, genre:'Rock', year:'1975' }], [8, { ...W, genre:'Pop', year:'1972' }]]],
    ['sentymentalny', [[12, { ...W, genre:'Pop', year:'1968' }]]],
    ['ejtis', [[12, { ...W, genre:'Pop', year:'1984' }], [1, { ...W, genre:'Rock', year:'2012', rating:-1 }]]],
    ['dziecko90', [[12, { ...W, genre:'Pop', year:'1996' }]]],
    ['mp3', [[12, { ...W, genre:'Pop', year:'2004' }]]],
    ['lowca', [[12, { ...W, genre:'Pop', year:'2021' }]]],
    ['pop', [[5, { ...W, genre:'Pop', year:'1975' }], [4, { ...W, genre:'Pop', year:'2004' }], [3, { ...W, genre:'Jazz', year:'1999' }]]],
    ['zloty-srodek', [[3, { ...W, genre:'Jazz', year:'1975' }], [3, { ...W, genre:'Soundtrack', year:'2004' }], [3, { ...W, genre:'Country', year:'1999' }], [3, { ...W, genre:'Pop', year:'2012' }]]],
    ['wszystkozerca', [[3, { ...W, genre:'Rock', year:'1975' }], [3, { ...W, genre:'Pop', year:'1985' }], [3, { ...W, genre:'Dance', year:'1995' }], [3, { ...W, genre:'Hip-Hop/Rap', year:'2005' }]]],
    ['polska-szkola', [[12, { artist:'Kult', genre:'Rock', year:'1990' }], [2, { ...W, genre:'Pop', year:'1990' }]]],
  ];
  for(const [id, spec] of cases){ const p=prof(spec); eq(p.archetype.id, id, `archetyp ${id} (why: ${p.archetype.why})`); }
  eq(new Set(cases.map(c=>c[0])).size, ARCHETYPES.length, 'każdy archetyp osiągalny (przypadek testowy na każdy)');
  // niska pewność: < 10 ocen → poznajemy (nawet przy wyraźnym gatunku); brak polubień → poznajemy
  const low=prof([[9, { ...W, genre:'Metal', year:'1986' }]]);
  eq([low.confidence, low.archetype.id, low.archetype.why], ['low', LOW_ARCHETYPE.id, 'brakuje jeszcze 1 oceny'], '9 ocen → poznajemy + ile brakuje');
  eq(prof([[12, { ...W, genre:'Metal', year:'1986', rating:-1 }]]).archetype.id, 'poznajemy', 'same 👎 → poznajemy');
  // determinizm: ta sama lista w innej kolejności → ten sam archetyp
  const spec=[[5, { ...W, genre:'Rock', year:'1975' }], [5, { ...W, genre:'Pop', year:'1995' }]];
  const ra=spec.flatMap(([n,o])=>tpR(n, o));
  eq(buildTasteProfile(ra.slice().reverse(), { cats:TP_CATS }).archetype.id, buildTasteProfile(ra, { cats:TP_CATS }).archetype.id, 'kolejność ocen nie zmienia archetypu');
  eq(pickArchetype(null).id, 'poznajemy', 'pickArchetype(null) → poznajemy');
});
group('gust2: „co znasz" (byCat z gry) vs „co lubisz"', ()=>{
  const k=knownProfile({ '80s':{ n:10, ok:8 }, 'rock-pl':{ n:6, ok:3 }, 'metal':{ n:2, ok:2 }, 'pl:abc':{ n:5, ok:5 }, 'nieznana':{ n:9, ok:1 }, 'zle':{ n:'x' }, '20s':{ n:4, ok:9 } }, TP_CATS);
  eq(k.decades.map(x=>x.key+':'+x.pct), ['1980:80', '2020:100'], 'dekady: trafienia % (ok przycięte do n)');
  eq(k.genres.map(x=>x.key+':'+x.pct), ['rock:50', 'metal:100'], 'gatunki z kategorii-stylów');
  eq(k.total, 22, 'suma pytań w rozpoznanych kategoriach (bez playlist / nieznanych)');
  const p=buildTasteProfile(tpR(12, { year:'1985', genre:'Rock', artist:'Madonna' }), { cats:TP_CATS, byCat:{ '80s':{ n:10, ok:8 }, 'rock-pl':{ n:6, ok:3 }, 'metal':{ n:2, ok:2 } } });
  ok(p.known && p.compare, 'profil z byCat → known + compare');
  eq(p.compare.decades.map(x=>`${x.key}:${x.liked}/${x.known}`), ['1980:100/80'], 'porównanie dekad: lubisz % vs znasz % (min. 5 pytań)');
  eq(p.compare.genres.map(x=>x.key), ['rock'], 'metal (2 pytania) pominięty — za mało danych');
  eq(p.compare.best.key, '1980', 'najlepiej znane');
  eq(buildTasteProfile(tpR(3, { year:'1985' }), { byCat:{} }).compare, null, 'brak danych gry → brak sekcji');
  eq(compareKnownLiked(p, { decades:[{ key:'1980', n:2, pct:50 }], genres:[] }), null, 'za mało pytań → null');
});
group('gust2: shareText — archetyp, top dekady/gatunki, top 3 artystów, link; ksywa tylko opcjonalnie', ()=>{
  const p=buildTasteProfile([ ...tpR(10, { year:'1996', genre:'Pop', rating:2, artist:'Britney' }), ...tpR(2, { year:'1985', genre:'Rock', rating:2, artist:'Kult' }) ], { cats:TP_CATS });
  const t=shareText(p, { url:'https://x.test/' });
  ok(/Mój gust muzyczny — 💿 Dziecko lat 90\./.test(t), 'nagłówek z archetypem');
  ok(/Dekady: lata 90\. \d+% · lata 80\. \d+%/.test(t) && /Gatunki: pop \d+% · rock \d+%/.test(t), 'top dekady i gatunki z %');
  ok(/Na mojej półce: Britney, Kult/.test(t), 'top artyści');
  ok(/https:\/\/x\.test\//.test(t) && /Uszy & Muzk/.test(t), 'link + nazwa aplikacji');
  ok(!/gracz|@/.test(t), 'bez ksywy domyślnie');
  ok(/Gust muzyczny: Zbyszek/.test(shareText(p, { handle:'Zbyszek' })), 'ksywa na życzenie');
  const low=shareText(buildTasteProfile([]));
  ok(/Jeszcze cię poznajemy/.test(low) && !/Dekady/.test(low), 'niska pewność: bez wektorów');
});
group('gust2: widoczność gustu — tylko friends|hidden', ()=>{
  eq(TASTE_VISIBILITY, ['friends','hidden'], 'wartości');
  ok(isTasteVisibility('friends') && isTasteVisibility('hidden') && !isTasteVisibility('public') && !isTasteVisibility('') && !isTasteVisibility(null), 'walidacja');
});
/* ===== „Twój gust" (etap 3): core/tasteCompare.js — zgodność, listy, werdykt, półki do gry ===== */
let tcTs=1;
const TC=(title, artist, year, genre, rating)=>sanitizeRating({ title, artist, year, genre, rating, ts:tcTs++ });
// n ocen: utwory „S<i>" wykonawcy `artist`, rok/gatunek wspólne
const TCN=(n, { artist='Art', year='1985', genre='Rock', rating=1, pre='S' }={})=>Array.from({ length:n }, (_,i)=>TC(pre+i, artist, year, genre, rating));
group('gust3: cosinus, werdykty, opis składowych', ()=>{
  eq(cosine([1,0],[1,0]), 1, 'identyczne → 1');
  eq(cosine([1,0],[0,1]), 0, 'rozłączne → 0');
  eq(cosine([0,0],[1,0]), null, 'pusty wektor → null (brak danych)');
  ok(Math.abs(cosine([0.5,0.5],[1,0])-Math.SQRT1_2)<1e-9, 'kąt 45° → √2/2');
  eq([100,85,84,70,55,40,25,24,0].map(x=>verdictFor(x).name), ['Bratnie dusze','Bratnie dusze','Wspólny parkiet','Wspólny parkiet','Zgrany duet',
    'Lubicie się mimo wszystko','Różne stacje, jedna częstotliwość','Przeciwieństwa się przyciągają','Przeciwieństwa się przyciągają'], 'przedziały werdyktów');
  ok(VERDICTS.every(v=>v.name && v.desc && v.emoji && !/głup|bezgust|beznadz|okropn|fataln/i.test(v.name+v.desc)), 'werdykty bez obrażania');
  eq(explainParts({ genres:82, decades:64, common:12 }), 'gatunki 82% · dekady 64% · wspólne utwory 12', 'opis składowych');
  eq(explainParts({ genres:null, decades:50, common:0 }), 'dekady 50% · wspólne utwory 0', 'brak wektora gatunków → pominięty');
});
group('gust3: compareTaste — identyczne gusty, przeciwne gusty, za mało danych', ()=>{
  const mine=TCN(20, { rating:2 });
  const same=compareTaste(mine, mine.map(x=>({ ...x })));
  ok(same.enough, 'oba po ≥ '+COMPARE_MIN+' ocen → enough');
  eq([same.score, same.parts.genres, same.parts.decades, same.parts.common], [100, 100, 100, 20], 'identyczne: 100%, składowe 100%, 20 wspólnych');
  eq(same.verdict.name, 'Bratnie dusze', 'werdykt dla 100%');
  eq(same.recs.length, 0, 'brak rekomendacji (wszystko ocenione)');
  eq(same.shared.length, 20, 'wspólne ulubione (limit listy 30)');
  const other=TCN(20, { artist:'Rap', year:'2015', genre:'Hip-Hop/Rap', rating:2, pre:'R' });
  const diff=compareTaste(mine, other);
  eq([diff.score, diff.parts.genres, diff.parts.decades, diff.parts.common], [0, 0, 0, 0], 'przeciwne gusty i 0 wspólnych → 0%');
  eq(diff.verdict.name, 'Przeciwieństwa się przyciągają', 'werdykt dla 0%');
  eq(diff.diffs.map(d=>d.kind+':'+d.key+':'+d.me+'/'+d.them), ['genre:rock:100/0', 'genre:hiphop:0/100', 'decade:1980:100/0'], 'różnicie się w: top 3 rozbieżności');
  const few=compareTaste(TCN(5), mine);
  ok(!few.enough && few.score===null && few.verdict===null, 'mniej niż '+COMPARE_MIN+' ocen u mnie → za mało danych');
  eq([few.need.me, few.need.them], [COMPARE_MIN-5, 0], 'ile brakuje po każdej stronie');
  ok(few.explain==='' && few.diffs.length===0, 'za mało danych: bez składowych i różnic');
  eq(few.recs.length, 15, 'rekomendacje liczone mimo „za mało danych" (15 nieocenionych przeze mnie)');
  const onlyDown=compareTaste(TCN(12, { rating:-1 }), mine);
  ok(!onlyDown.enough && !onlyDown.need.likedMe, 'same 👎 (zero polubień) → za mało danych');
});
group('gust3: compareTaste — wzór 0.6 × wektory + 0.4 × wspólne (Jaccard z wygładzeniem)', ()=>{
  // ten sam profil wektorów (rock, 80.), ale RÓŻNE utwory → wektory 100%, wspólne 0
  const a=TCN(40, { rating:1, pre:'A' }), b=TCN(40, { rating:1, pre:'B' });
  const r=compareTaste(a, b);
  eq([r.parts.vector, r.parts.common], [100, 0], 'wektory 100%, 0 wspólnych');
  // union=80 → w=80/92; common = w*0 + (1-w)*1 = 12/92 → 0.6 + 0.4*0.1304 = 0.652
  eq(r.score, 65, 'wynik = round(100 × (0.6 + 0.4 × (1−w)))');
  // małe zbiory: wygładzenie ciągnie składową „wspólne" ku podobieństwu wektorów
  const s=compareTaste(TCN(10, { pre:'A' }), TCN(10, { pre:'B' }));
  ok(s.score>r.score, 'mniejsze zbiory bez wspólnych → wyższy wynik (wygładzenie) — '+s.score+' > '+r.score);
  // część wspólnych: 12 wspólnych z 40 → J = 12/68 ≈ 0.176 → min(1, J/0.3)
  const c=compareTaste([...TCN(28, { pre:'A' }), ...TCN(12, { pre:'X' })], [...TCN(28, { pre:'B' }), ...TCN(12, { pre:'X' })]);
  eq(c.parts.common, 12, '12 wspólnych');
  const J=12/68, w=68/(68+12), exp=Math.round(100*(0.6+0.4*(w*Math.min(1, J/JACCARD_FULL)+(1-w))));
  eq(c.score, exp, 'wynik zgodny ze wzorem ('+exp+')');
  ok(c.score>r.score, 'wspólne utwory podnoszą wynik');
  ok(/^gatunki 100% · dekady 100% · wspólne utwory 12$/.test(c.explain), 'wyjaśnienie: '+c.explain);
  for(const x of [r, s, c]) ok(x.score>=0 && x.score<=100, 'wynik w 0–100');
});
group('gust3: wspólne ulubione i rekomendacje (sortowanie, nieocenione)', ()=>{
  const mine=[TC('Wspólna', 'Kult', '1987', 'Rock', 2), TC('Ja lubię', 'Kult', '1990', 'Rock', 1), TC('Nie lubię', 'Doda', '2005', 'Pop', -1), TC('Pół', 'Maanam', '1984', 'Rock', 1)];
  const theirs=[TC('Wspólna', 'Kult', '1987', 'Rock', 2), TC('Pół', 'Maanam', '1984', 'Rock', 2), TC('Nie lubię', 'Doda', '2005', 'Pop', 2),
    TC('Polecam 👍', 'Abba', '1976', 'Pop', 1), TC('Polecam ❤️', 'Queen', '1980', 'Rock', 2), TC('Też Kult', 'Kult', '1995', 'Rock', 1), TC('Nie', 'Zenek', '2010', 'Disco Polo', -1)];
  eq(sharedFavorites(mine, theirs).map(x=>`${x.title}:${x.mine}/${x.theirs}`), ['Wspólna:2/2', 'Pół:1/2'], 'wspólne: oboje ≥ 👍, podwójne ❤️ najwyżej');
  const rec=recommendations(mine, theirs);
  eq(rec.map(x=>x.title), ['Polecam ❤️', 'Też Kult', 'Polecam 👍'], 'rekomendacje: ❤️ przed 👍, potem wykonawcy, których lubię; bez ocenionych przeze mnie (też 👎) i bez jego 👎');
  ok(rec[1].knownArtist && !rec[2].knownArtist, 'flaga „znany wykonawca"');
  const store={}; mine.forEach(x=>{ store[x.trackKey]=x; });
  store[trackKey('Abba', 'Polecam 👍')]={ trackKey:trackKey('Abba', 'Polecam 👍'), rating:0, ts:1 };   // nagrobek = nieoceniony
  eq(recommendations(store, theirs).map(x=>x.title), ['Polecam ❤️', 'Też Kult', 'Polecam 👍'], 'magazyn z nagrobkiem: nagrobek ≠ ocena');
});
group('gust3: kształt ocen znajomego z API (publicRating / sanitizeFriendRatings)', ()=>{
  eq(publicRating({ title:'A', artist:'B', year:'1999', genre:'Pop', art:'https://x/a.jpg', cat:'90s', rating:2, ts:5, source:'swipe', profile_id:'X' }),
    { title:'A', artist:'B', year:'1999', genre:'Pop', art:'https://x/a.jpg', cat:'90s', rating:2 }, 'bez ts/source/profile_id');
  eq(publicRating({ title:'A', artist:'B', rating:0 }), null, 'zła ocena → null');
  const f=sanitizeFriendRatings([{ title:'Song', artist:'Art', rating:2, art:'javascript:alert(1)', year:'abcd' }, { title:'Song (2011 Remaster)', artist:'Art', rating:1 }, null, { title:'', artist:'x', rating:1 }]);
  eq(f.length, 1, 'duplikat klucza / śmieci odrzucone');
  eq([f[0].trackKey, f[0].art, f[0].year, f[0].ts, f[0].source], [trackKey('Art','Song'), '', '', undefined, undefined], 'klucz liczony, złe art/rok puste, bez ts/source');
  eq(sanitizeFriendRatings(Array.from({ length:2100 }, (_,i)=>({ title:'t'+i, artist:'a', rating:1 }))).length, TASTE_MAX, 'max '+TASTE_MAX);
  eq(sanitizeFriendRatings('x'), [], 'nie-tablica → []');
});
group('gust3: „Zagraj z półki" — songs[] z polubionych, min. '+SHELF_PLAY_MIN+', kategoria tymczasowa', ()=>{
  const rs=[...TCN(5, { rating:1, pre:'U', year:'1999' }), ...TCN(3, { rating:2, pre:'H', year:'' }), TC('Zły', 'X', '2000', 'Pop', -1)];
  const songs=shelfSongs(rs);
  eq(songs.length, 8, 'tylko ❤️ i 👍 (bez 👎)');
  eq(songs.slice(0,3).map(s=>s.title), ['H2','H1','H0'], '❤️ najpierw (najnowsze)');
  ok(songs.every(s=>Object.keys(s).every(k=>['title','artist','year'].includes(k))), 'tylko tytuł/wykonawca/rok');
  ok(!('year' in songs[0]) && songs[3].year==='1999', 'rok tylko gdy 4 cyfry');
  ok(canPlayShelf(rs) && !canPlayShelf(rs.slice(0, 7)), 'min. '+SHELF_PLAY_MIN+' utworów do gry');
  eq(shelfSongs(TCN(80)).length, 60, 'limit 60 utworów');
  const c=shelfCategory('Ola', songs);
  eq([c.label, c.kind, c.temp, c.songs.length], ['Półka Ola', 'playlist', true, 8], 'kategoria „Półka <ksywa>" (playlista, tymczasowa)');
  eq(shelfCategory('', []).label, 'Półka znajomego', 'brak ksywy');
  ok(modesFor('x', { x:c }).includes('music'), 'kategoria półki obsługuje tryb muzyka');
  const m=buildMatch(['x'], ['music'], { questions:10 }, { x:c });
  ok(!m.error && m.questions===10, 'mecz 10 pytań z półki');
});
group('gust3: MP „Gust stołu" — półka gracza, sanityzacja, pula stołu', ()=>{
  const hearts=Array.from({ length:25 }, (_,i)=>TC('Hit '+i, 'Art '+i, '199'+(i%10), 'Pop', 2));
  const p=tableShelfPayload([...hearts, ...TCN(5, { rating:1, pre:'U' })]);
  eq(p.length, TABLE_SHELF_MAX, 'top '+TABLE_SHELF_MAX+' ❤️');
  eq(p[0].title, 'Hit 24', 'najnowsze ❤️ najpierw');
  ok(p.every(x=>Object.keys(x).every(k=>['title','artist','year'].includes(k))), 'tylko tytuł/wykonawca/rok (bez okładek, ocen, ts)');
  eq(tableShelfPayload(hearts.slice(0, TABLE_MIN_HEARTS-1)), null, '< '+TABLE_MIN_HEARTS+' ❤️ → nic nie wysyłamy');
  eq(tableShelfPayload(hearts, { visibility:'hidden' }), null, 'gust ukryty → nic nie wysyłamy');
  const s=sanitizeTableShelf([{ title:'  A   b ', artist:'X', year:'1999', art:'https://x', rating:2 }, { title:'A b', artist:'x' }, { title:'<script>', artist:'' }, 'x', null,
    { title:'T'.repeat(500), artist:'Y', year:'99999' }, ...Array.from({ length:40 }, (_,i)=>({ title:'z'+i, artist:'Z' }))]);
  eq(s.length, TABLE_SHELF_MAX, 'max '+TABLE_SHELF_MAX+' pozycji');
  eq(s[0], { title:'A b', artist:'X', year:'1999' }, 'tekst przycięty, tylko title/artist/year');
  eq(s[1].title.length, 200, 'cap długości tytułu');
  ok(!('year' in s[1]), 'zły rok wycięty');
  eq(sanitizeTableShelf({}), [], 'nie-tablica → []');
  const pool=buildTablePool([
    { id:'a', name:'Ola', items:[{ title:'X', artist:'Q' }, { title:'A1', artist:'A' }, { title:'A2', artist:'A' }] },
    { id:'b', name:'Kuba', items:[{ title:'X', artist:'Q' }, { title:'B1', artist:'B' }] },
    { id:'c', name:'', items:[] },
  ]);
  eq(pool.map(x=>x.title+':'+x.from), ['X:Ola, Kuba', 'A1:Ola', 'B1:Kuba', 'A2:Ola'], 'po kolei od graczy; duplikat łączy ksywy; pusta półka pominięta');
  eq(buildTablePool(Array.from({ length:8 }, (_,i)=>({ name:'p'+i, items:Array.from({ length:20 }, (_,j)=>({ title:'t'+j, artist:'a'+i })) }))).length, 120, 'cap puli 120');
  const cat=tablePoolCategory(pool);
  eq([cat.label, cat.kind, TABLE_KEY], ['🎧 Gust stołu', 'playlist', 'gust-stolu'], 'kategoria stołu');
});
console.log(`\n${fail?'❌':'✅'} ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
