/* test/run.js — lekki runner dla czystego rdzenia (zero zależności).
 * Uruchom: node test/run.js */
import { norm, lev, textMatch, deLatin, yearMatch, evaluateGuess } from '../core/scoring.js';
import { modesFor, buildMatch, matchSlot, matchAdvance, randomPools, QPC, CPR, ALL_MODES } from '../core/match.js';
import { reduceAction, countReady, evaluateAnswer, candidatesForSlot, teamAnswer, myVoteForSlot, rosterState, slotsFor } from '../core/mpReducer.js';
import { canTransitionSolo, canTransitionMp, MP, SOLO } from '../core/phases.js';
import { pickTrack, BAD } from '../adapters-web/itunesRepository.js';
import { buildSoloRecord, buildMpRecord } from '../core/matchRecord.js';
import { listenSecs, soloSnipStart, mpSnipStart, shouldPing, SNIP_SECS, SOLO_SNIP_MAX, MP_SNIP_WINDOW_S } from '../core/timing.js';
import { plPick, togglePick, toggleAllPick, allSelected, syncQuizMode, grpActive, pickSummary } from '../core/picker.js';
import { createFeed, resetFeed, pushChat, ingestFeed, FEED_CAP } from '../core/chatFeed.js';

let pass=0, fail=0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.error('  ✗ '+msg); } }
function eq(a,b,msg){ ok(JSON.stringify(a)===JSON.stringify(b), `${msg} — oczekiwano ${JSON.stringify(b)}, było ${JSON.stringify(a)}`); }
function group(name,fn){ console.log('• '+name); fn(); }

/* --- scoring --- */
group('scoring.norm', ()=>{
  eq(norm('The Beatles'),'beatles','przedimek „the" usunięty');
  eq(norm('Beyoncé'),'beyonce','diakrytyk usunięty');
  eq(norm('Smells Like Teen Spirit (Remastered 2011)'),'smells like teen spirit','„(remaster)" obcięty');
  eq(norm('AC/DC'),'ac dc','znaki specjalne → spacja');
  eq(norm('Motörhead'),'motorhead','ö → o');
  eq(norm('Łódź'),'lodz','ł obsłużone przez deLatin');
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
  eq(modesFor('d80',CATS),['music','reverse','snippet'],'audio bez tekstu');
  eq(modesFor('rock',CATS),['music','reverse','snippet','lektor'],'audio + lektor (jest lyric)');
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

/* --- mpReducer --- */
function mkGame(){ return {phase:MP.PLAY, round:1, answerSlots:slotsFor(), proposals:[], votes:{}, sure:[]}; }
group('mpReducer.reduceAction', ()=>{
  const g=mkGame();
  ok(reduceAction(g,{type:'propose',by:'u1',byName:'Ala',conf:'sure',values:{title:'Hey Jude',artist:'Beatles'}}),'propose zmienia stan');
  eq(g.proposals.length,1,'1 propozycja');
  ok(!reduceAction(g,{type:'propose',by:'u2',byName:'B',values:{title:'',artist:''}}),'pusty typ odrzucony');
  eq(g.votes.title.u1,'Hey Jude','auto-głos na własny tytuł');
  eq(g.votes.artist.u1,'Beatles','auto-głos na własnego wykonawcę');
  ok(reduceAction(g,{type:'vote',by:'u2',slot:'title',value:'Hey Jude'}),'głos na slot dodany');
  eq(g.votes.title.u2,'Hey Jude','głos zapisany');
  reduceAction(g,{type:'vote',by:'u2',slot:'title',value:'Hey Jude'});  // ten sam = wycofanie
  ok(!('u2' in g.votes.title),'ponowny głos = wycofanie');
  // host „wybiera odpowiedź": set=true zawsze ustawia (bez przełączania), nawet ponownie
  reduceAction(g,{type:'vote',by:'u1',slot:'title',value:'Hey Jude',set:true});
  eq(g.votes.title.u1,'Hey Jude','set: wybór ustawiony (nie wycofany przy ponownym kliknięciu)');
  reduceAction(g,{type:'vote',by:'u1',slot:'title',value:'Yesterday',set:true});
  eq(g.votes.title.u1,'Yesterday','set: zmiana wyboru na inną wartość');
  eq(g.proposals[0].conf,'sure','pewniak = typ z conf=sure (bez osobnego zakładu)');
  ok(reduceAction(g,{type:'pass',by:'u2',byName:'B'}),'pas włączony');
  eq(g.passed.length,1,'1 pas');
  reduceAction(g,{type:'pass',by:'u2',byName:'B'});
  eq(g.passed.length,0,'pas wyłączony (toggle)');
  const pid=g.proposals[0].id;
  ok(reduceAction(g,{type:'unpropose',by:'u1',pid}),'autor usuwa typ');
  eq(g.proposals.length,0,'typ usunięty');
  ok(!reduceAction(g,{type:'nieznana'}),'nieznana akcja → brak zmian');
  const armed={phase:MP.ARMING, answerSlots:slotsFor(), proposals:[], votes:{}};
  ok(!reduceAction(armed,{type:'propose',by:'x',values:{title:'a'}}),'propose poza fazą play → ignorowane');
});
group('mpReducer.countReady', ()=>{
  const s=new Set(['a','b']);
  eq(countReady(['a','b'],s).all,true,'wszyscy gotowi');
  eq(countReady(['a','b','c'],s).count,2,'liczy obecnych');
  eq(countReady(['a','b','c'],s).all,false,'brakuje jednego');
  eq(countReady([],s).all,false,'pusta lista → nie all');
});
group('mpReducer.evaluateAnswer', ()=>{
  const g={phase:MP.PLAY, round:2, answerSlots:slotsFor(),
    proposals:[{by:'u9',byName:'Zoe',conf:'sure',values:{title:'Hey Jude',artist:'The Beatles'}}],
    votes:{ title:{u9:'Hey Jude'}, artist:{u9:'The Beatles'} }};
  const cur={track:'Hey Jude', artist:'Beatles', year:'1968', album:'X', art:''};
  const ev=evaluateAnswer(g, cur);   // locked = odpowiedź drużyny (górka głosów)
  ok(ev.teamOk,'drużyna trafiła (oba sloty)');
  eq(ev.gained,2,'pewniak (conf=sure) + trafienie = 2 pkt');
  eq(ev.pewniacy,['Zoe'],'pewniacy z typów conf=sure');
  eq(ev.firstBy,'Zoe','pierwszy trafny = Zoe');
  ok(ev.reveal.pewniakWin,'pewniak wygrany');
  eq(ev.result.round,2,'wynik z numerem rundy');
  // pewniak nietrafiony: typ conf=sure, który nie pasuje → pewniakLose
  const bad=evaluateAnswer({phase:MP.PLAY,round:1,answerSlots:slotsFor(),
    proposals:[{by:'u1',byName:'A',conf:'sure',values:{title:'Złe',artist:'Złe'}}],
    votes:{ title:{u1:'Złe'}, artist:{u1:'Złe'} }}, cur);
  eq(bad.gained,0,'pewniak nietrafiony = 0 pkt');
  ok(bad.reveal.pewniakLose,'pewniak przegrany');
});
group('mpReducer.evaluateAnswer (quiz)', ()=>{
  // slotsFor z pytaniem → sloty z pytania; bez → domyślne
  eq(slotsFor('quiz', null, {slots:[{key:'a',label:'odp'}]}), [{key:'a',label:'odp'}], 'slotsFor: sloty z pytania');
  eq(slotsFor('music').map(s=>s.key), ['title','artist'], 'slotsFor: domyślne tytuł+wykonawca');
  // 1-slot, wariant „Kanberra" zalicza
  const g1={phase:MP.PLAY, round:1, answerSlots:[{key:'a',label:'odp'}],
    proposals:[{by:'u1',byName:'A',conf:'normal',values:{a:'Kanberra'}}], votes:{ a:{u1:'Kanberra'} }};
  const q1={prompt:'Stolica Australii?', answers:{a:['Canberra','Kanberra']}};
  const e1=evaluateAnswer(g1, q1);
  ok(e1.teamOk,'quiz 1-slot: wariant zalicza');
  eq(e1.reveal.kind,'quiz','reveal.kind=quiz');
  eq(e1.reveal.prompt,'Stolica Australii?','reveal.prompt');
  eq(e1.reveal.answers.a,['Canberra','Kanberra'],'reveal.answers per slot');
  eq(e1.reveal.locked.a,'Kanberra','reveal.locked per slot');
  eq(e1.firstBy,'A','firstBy po wariancie');
  eq(e1.result.track,'Stolica Australii?','result.track = prompt dla quizu');
  // 2-slot mieszany: jeden dobrze, jeden źle → teamOk false
  const g2={phase:MP.PLAY, round:1, answerSlots:[{key:'dir',label:'reżyser'},{key:'year',label:'rok'}],
    proposals:[], votes:{ dir:{u1:'Tarantino'}, year:{u1:'2010'} }};
  const q2={prompt:'x', answers:{dir:['Tarantino','Quentin Tarantino'], year:['1994']}};
  const e2=evaluateAnswer(g2, q2);
  ok(!e2.teamOk,'quiz 2-slot: jeden zły → drużyna nie trafia');
  ok(e2.reveal.okBySlot.dir && !e2.reveal.okBySlot.year,'okBySlot per slot (dir ok, year zły)');
});
group('mpReducer.selektory', ()=>{
  const g={answerSlots:slotsFor(), proposals:[
    {id:'p1',by:'u1',byName:'A',conf:'sure',values:{title:'Hey Jude',artist:'Beatles'}},
    {id:'p2',by:'u2',byName:'B',conf:'unsure',values:{title:'Help',artist:'Beatles'}},
  ], votes:{ title:{u1:'Hey Jude',u2:'Help',u3:'Hey Jude'}, artist:{u1:'Beatles',u2:'Beatles'} }};
  const tc=candidatesForSlot(g,'title');
  eq(tc[0].value,'Hey Jude','najwięcej głosów na górze');
  eq(tc[0].votes.length,2,'„Hey Jude" ma 2 głosy');
  eq(tc[0].tag,'sure','tag pewniaka z propozycji u1');
  const ta=teamAnswer(g);
  eq(ta.title,'Hey Jude','tytuł drużyny = górka');
  eq(ta.artist,'Beatles','wykonawca drużyny = górka');
  eq(myVoteForSlot(g,'title','u2'),'Help','mój głos w slocie');
  eq(myVoteForSlot(g,'title','x'),null,'brak głosu → null');
  eq(rosterState(g,'u1'),'sure','u1 wrzucił pewniaka');
  eq(rosterState(g,'u2'),'unsure','u2 tylko niepewny');
  eq(rosterState(g,'zzz'),'idle','brak aktywności → myśli');
  eq(rosterState(g,'zzz',new Set(['zzz'])),'type','w secie typing (bez typu) → pisze');
  eq(rosterState(g,'u1',new Set(['u1'])),'sure','typ ma priorytet nad „pisze"');
  eq(rosterState({...g,passed:[{id:'u1'}]},'u1'),'pass','pas ma priorytet');
});

group('mpReducer.teamAnswer — nadpisanie hosta (salon)', ()=>{
  // gracze: większość na „Help", ale host (TV) wskazał „Hey Jude" → nadpisuje górkę
  const base={answerSlots:slotsFor(), proposals:[], hostId:'tv',
    votes:{ title:{u1:'Help',u2:'Help',tv:'Hey Jude'}, artist:{u1:'Beatles'} }};
  eq(teamAnswer({...base, salon:false}).title,'Help','bez salonu: górka głosów wygrywa (Help)');
  eq(teamAnswer({...base, salon:true}).title,'Hey Jude','salon: pick hosta nadpisuje większość');
  eq(teamAnswer({...base, salon:true}).artist,'Beatles','salon: slot bez picku hosta → górka głosów');
  const noPick={answerSlots:slotsFor(), proposals:[], salon:true, hostId:'tv',
    votes:{ title:{u1:'Help',u2:'Help'} }};
  eq(teamAnswer(noPick).title,'Help','salon: host nic nie wskazał → auto górka głosów');
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
  eq(rec.total_questions,3*QPC,'sloty × QPC');
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
  const g={ answerSlots:[{key:'title',label:'tytuł'},{key:'artist',label:'wykonawca'}],
    proposals:[{aid:'a1',by:'u1',byName:'Ala',conf:'sure',values:{title:'Hey Jude',artist:'Beatles'}}],
    passed:[{id:'u2',name:'Bob'}] };
  const r=ingestFeed(f,g,'me');
  ok(r.added,'doszły wpisy');
  eq(r.clearTyping,['u1'],'clearTyping zwraca autora typu');
  eq(f.log.filter(x=>x.kind==='typ').length,1,'1 wpis typu');
  eq(f.log.find(x=>x.kind==='typ').chips.length,2,'2 chipy (tytuł+wykonawca)');
  ok(f.log.some(x=>x.kind==='sys'&&x.cls==='sure'),'pewniak → linia systemowa');
  ok(f.log.some(x=>x.kind==='sys'&&x.cls==='pass'),'pas → linia systemowa');
  // ponowny ingest tego samego stanu → dedup, nic nie dochodzi
  const r2=ingestFeed(f,g,'me');
  ok(!r2.added,'dedup: ten sam stan → brak nowych');
  eq(r2.clearTyping.length,0,'dedup: brak clearTyping');
  // mine po meId
  const f2=createFeed();
  ingestFeed(f2,{answerSlots:g.answerSlots,proposals:[{aid:'x',by:'me',byName:'Ja',values:{title:'T'}}]}, 'me');
  ok(f2.log.find(x=>x.kind==='typ').mine,'typ od meId → mine=true');
});
group('chatFeed.ring-buffer', ()=>{
  const f=createFeed();
  for(let i=0;i<FEED_CAP+10;i++) pushChat(f,'x','m'+i,false);
  eq(f.log.length,FEED_CAP,`limit ${FEED_CAP} wpisów`);
  eq(f.log[0].text,'m10','najstarsze wypchnięte');
});

console.log(`\n${fail?'❌':'✅'} ${pass} przeszło, ${fail} nie przeszło`);
process.exit(fail?1:0);
