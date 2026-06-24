/* ============================================================
   questions.js — zestawy pytań „wiedza ogólna" (tryb quiz, bez audio)
   ------------------------------------------------------------
   Ten plik jest CELOWO oddzielony (jak categories.js/playlists.js), żeby dało
   się regenerować zestawy w osobnej sesji albo pobierać je z bazy (ten sam
   kształt JSON). Logika gry czyta tylko `kind:'quiz'` + `questions`.

   Format (kanoniczny — taki sam dla plików zaszytych i pobieranych z DB):
     window.CATEGORIES.quiz = {
       <klucz>: {
         label: 'Nazwa kategorii',
         kind:  'quiz',
         questions: [
           { prompt: 'Treść pytania?',
             slots:  [ {key:'a', label:'odpowiedź'} ],     // 1..N pól odpowiedzi
             answers:{ a:['Poprawna','Akceptowalny wariant'] } },  // ≥1 wariant na slot
         ],
       },
     }
   Zasady:
   - Każdy slot MUSI mieć niepustą listę wariantów (ocena tolerancyjna: literówki,
     brak polskich znaków — dlatego dla precyzyjnych odpowiedzi dodawaj warianty).
   - Sloty są per-pytanie (jedno pytanie 1-polowe, inne 2-polowe).

   UWAGA: rozszerza window.CATEGORIES (nie nadpisuje) — ładuj przez <script src>
   PRZED app.js, obok categories.js/playlists.js/lyrics.js.
   ============================================================ */
window.CATEGORIES = window.CATEGORIES || {};
window.CATEGORIES.quiz = {
  geografia: {
    label: 'Geografia', kind: 'quiz', questions: [
      { prompt: 'Stolica Australii?', slots:[{key:'a',label:'odpowiedź'}], answers:{ a:['Canberra','Kanberra'] } },
      { prompt: 'Najdłuższa rzeka świata?', slots:[{key:'a',label:'rzeka'}], answers:{ a:['Nil','Amazonka'] } },
      { prompt: 'Najwyższy szczyt Polski?', slots:[{key:'a',label:'szczyt'}], answers:{ a:['Rysy'] } },
      { prompt: 'W jakim kraju leży miasto Marrakesz?', slots:[{key:'a',label:'kraj'}], answers:{ a:['Maroko','Maroc','Morocco'] } },
      { prompt: 'Największa wyspa świata?', slots:[{key:'a',label:'wyspa'}], answers:{ a:['Grenlandia','Greenland'] } },
      { prompt: 'Stolica i waluta Japonii?', slots:[{key:'st',label:'stolica'},{key:'wal',label:'waluta'}], answers:{ st:['Tokio','Tokyo'], wal:['jen','yen'] } },
      { prompt: 'Przez ile stref czasowych rozciąga się Rosja?', slots:[{key:'a',label:'liczba'}], answers:{ a:['11','jedenaście'] } },
      { prompt: 'Jakie morze oblewa Polskę od północy?', slots:[{key:'a',label:'morze'}], answers:{ a:['Bałtyckie','Bałtyk','Morze Bałtyckie'] } },
    ],
  },
  popkultura: {
    label: 'Film i popkultura', kind: 'quiz', questions: [
      { prompt: 'Reżyser i rok premiery „Pulp Fiction”?', slots:[{key:'dir',label:'reżyser'},{key:'year',label:'rok'}], answers:{ dir:['Tarantino','Quentin Tarantino'], year:['1994'] } },
      { prompt: 'Jak nazywa się czarodziej, mentor Harry’ego Pottera (dyrektor Hogwartu)?', slots:[{key:'a',label:'imię i nazwisko'}], answers:{ a:['Dumbledore','Albus Dumbledore'] } },
      { prompt: 'Kto zagrał głównego bohatera w „Forrest Gump”?', slots:[{key:'a',label:'aktor'}], answers:{ a:['Tom Hanks','Hanks'] } },
      { prompt: 'Z jakiej planety pochodzi Superman?', slots:[{key:'a',label:'planeta'}], answers:{ a:['Krypton'] } },
      { prompt: 'Tytuł pierwszego filmu o Jamesie Bondzie (1962)?', slots:[{key:'a',label:'tytuł'}], answers:{ a:['Doktor No','Dr. No','Dr No'] } },
      { prompt: 'Jak nazywa się fikcyjne królestwo w „Krainie lodu”?', slots:[{key:'a',label:'królestwo'}], answers:{ a:['Arendelle'] } },
    ],
  },
  muzyka: {
    label: 'Muzyka', kind: 'quiz', desc: '50 pytań · poziom średni', questions: [
      { prompt: 'Kto wykonuje utwór „Bohemian Rhapsody”?', slots:[{key:'a',label:'wykonawca'}], answers:{ a:['Queen'] } },
      { prompt: 'Jak nazywał się wokalista zespołu Queen?', slots:[{key:'a',label:'imię i nazwisko'}], answers:{ a:['Freddie Mercury','Mercury'] } },
      { prompt: 'Z jakiego kraju pochodzi zespół ABBA?', slots:[{key:'a',label:'kraj'}], answers:{ a:['Szwecja'] } },
      { prompt: 'Kto jest liderem i wokalistą zespołu Kult?', slots:[{key:'a',label:'imię i nazwisko'}], answers:{ a:['Kazik Staszewski','Kazik','Kazimierz Staszewski'] } },
      { prompt: 'Jak nazywała się wokalistka zespołu Maanam?', slots:[{key:'a',label:'ksywa / imię'}], answers:{ a:['Kora','Olga Jackowska'] } },
      { prompt: 'Kto wykonuje „Smells Like Teen Spirit”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Nirvana'] } },
      { prompt: 'Jak nazywał się wokalista i lider Nirvany?', slots:[{key:'a',label:'imię i nazwisko'}], answers:{ a:['Kurt Cobain','Cobain'] } },
      { prompt: 'Kto nagrał album „The Dark Side of the Moon”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Pink Floyd'] } },
      { prompt: 'Jak nazywa się wokalista zespołu U2?', slots:[{key:'a',label:'ksywa'}], answers:{ a:['Bono'] } },
      { prompt: 'Kto śpiewa „Rolling in the Deep”?', slots:[{key:'a',label:'wykonawczyni'}], answers:{ a:['Adele'] } },
      { prompt: 'Z jakiego miasta pochodzi zespół The Beatles?', slots:[{key:'a',label:'miasto'}], answers:{ a:['Liverpool'] } },
      { prompt: 'W którym roku oficjalnie rozpadł się zespół The Beatles?', slots:[{key:'a',label:'rok'}], answers:{ a:['1970'] } },
      { prompt: 'Kto wykonuje „Like a Rolling Stone”?', slots:[{key:'a',label:'wykonawca'}], answers:{ a:['Bob Dylan','Dylan'] } },
      { prompt: 'Kto śpiewał i grał w „Purple Rain”?', slots:[{key:'a',label:'wykonawca'}], answers:{ a:['Prince'] } },
      { prompt: 'Jaki zespół założyli Mick Jagger i Keith Richards?', slots:[{key:'a',label:'zespół'}], answers:{ a:['The Rolling Stones','Rolling Stones'] } },
      { prompt: 'Z jakiego kraju pochodzi zespół AC/DC?', slots:[{key:'a',label:'kraj'}], answers:{ a:['Australia'] } },
      { prompt: 'Kto jest wokalistą zespołu Coldplay?', slots:[{key:'a',label:'imię i nazwisko'}], answers:{ a:['Chris Martin','Martin'] } },
      { prompt: 'Kto nagrał przełomowy album „Nevermind” (1991)?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Nirvana'] } },
      { prompt: 'Na jakim instrumencie wsławił się Jimi Hendrix?', slots:[{key:'a',label:'instrument'}], answers:{ a:['gitara','gitara elektryczna'] } },
      { prompt: 'Kto wykonuje przebój „Wonderwall”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Oasis'] } },
      { prompt: 'Jak nazywał się lider i wokalista zespołu Republika?', slots:[{key:'a',label:'imię i nazwisko'}], answers:{ a:['Grzegorz Ciechowski','Ciechowski'] } },
      { prompt: 'Kto śpiewał „Dziwny jest ten świat”?', slots:[{key:'a',label:'wykonawca'}], answers:{ a:['Czesław Niemen','Niemen'] } },
      { prompt: 'Z jakiego kraju pochodzi zespół U2?', slots:[{key:'a',label:'kraj'}], answers:{ a:['Irlandia'] } },
      { prompt: 'Kto nagrał album „Back to Black”?', slots:[{key:'a',label:'wykonawczyni'}], answers:{ a:['Amy Winehouse','Winehouse'] } },
      { prompt: 'Kto wykonuje „Shape of You”?', slots:[{key:'a',label:'wykonawca'}], answers:{ a:['Ed Sheeran','Sheeran'] } },
      { prompt: 'Jaki francuski duet nagrał „Get Lucky”?', slots:[{key:'a',label:'duet'}], answers:{ a:['Daft Punk'] } },
      { prompt: 'Kto rapuje w utworze „Lose Yourself”?', slots:[{key:'a',label:'raper'}], answers:{ a:['Eminem'] } },
      { prompt: 'Jak nazywał się wokalista zespołu The Doors?', slots:[{key:'a',label:'imię i nazwisko'}], answers:{ a:['Jim Morrison','Morrison'] } },
      { prompt: 'Kto wykonuje „Hotel California”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Eagles','The Eagles'] } },
      { prompt: 'Z jakiego polskiego zespołu pochodzi przebój „Autobiografia”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Perfect'] } },
      { prompt: 'Kto śpiewa „I Will Always Love You” z filmu „Bodyguard”?', slots:[{key:'a',label:'wykonawczyni'}], answers:{ a:['Whitney Houston','Houston'] } },
      { prompt: 'Jak nazywa się lider i wokalista zespołu The Police?', slots:[{key:'a',label:'ksywa'}], answers:{ a:['Sting'] } },
      { prompt: 'Kto wykonuje „Stairway to Heaven”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Led Zeppelin'] } },
      { prompt: 'Jaki zespół prowadził wokalista Ryszard Riedel?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Dżem','Dzem'] } },
      { prompt: 'Kto wykonuje „Uptown Funk” (z Markiem Ronsonem)?', slots:[{key:'a',label:'wykonawca'}], answers:{ a:['Bruno Mars'] } },
      { prompt: 'W którym roku ukazał się album „Sgt. Pepper’s Lonely Hearts Club Band”?', slots:[{key:'a',label:'rok'}], answers:{ a:['1967'] } },
      { prompt: 'Kto śpiewa „Creep”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Radiohead'] } },
      { prompt: 'Kto wykonuje „Master of Puppets”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Metallica'] } },
      { prompt: 'Kto wykonuje „Sweet Child o’ Mine”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Guns N’ Roses','Guns N Roses','Guns and Roses'] } },
      { prompt: 'Z jakiej grupy wokalnej wywodzi się Beyoncé?', slots:[{key:'a',label:'grupa'}], answers:{ a:['Destiny’s Child','Destinys Child'] } },
      { prompt: 'Kto śpiewał „Space Oddity” i „Heroes”?', slots:[{key:'a',label:'wykonawca'}], answers:{ a:['David Bowie','Bowie'] } },
      { prompt: 'Jaki polski artysta nagrał album „Małomiasteczkowy”?', slots:[{key:'a',label:'imię i nazwisko'}], answers:{ a:['Dawid Podsiadło','Podsiadło','Podsiadlo'] } },
      { prompt: 'Kto wykonuje „Californication”?', slots:[{key:'a',label:'zespół'}], answers:{ a:['Red Hot Chili Peppers','RHCP'] } },
      { prompt: 'Na jakim instrumencie grał legendarny jazzman Miles Davis?', slots:[{key:'a',label:'instrument'}], answers:{ a:['trąbka','trabka'] } },
      { prompt: 'Kto wykonuje „Billie Jean”?', slots:[{key:'a',label:'wykonawca'}], answers:{ a:['Michael Jackson','Jackson'] } },
      { prompt: 'Jakim przydomkiem określa się Elvisa Presleya?', slots:[{key:'a',label:'przydomek'}], answers:{ a:['Król rock and rolla','Król rocka','The King','King of Rock and Roll'] } },
      { prompt: 'Wykonawca i rok wydania albumu „Thriller”:', slots:[{key:'wyk',label:'wykonawca'},{key:'rok',label:'rok'}], answers:{ wyk:['Michael Jackson','Jackson'], rok:['1982'] } },
      { prompt: 'Zespół i jego wokalista — „Livin’ on a Prayer”:', slots:[{key:'zespol',label:'zespół'},{key:'wok',label:'wokalista'}], answers:{ zespol:['Bon Jovi'], wok:['Jon Bon Jovi','Bon Jovi'] } },
      { prompt: 'Polski zespół i jego wokalista — „Mniej niż zero”:', slots:[{key:'zespol',label:'zespół'},{key:'wok',label:'wokalista'}], answers:{ zespol:['Lady Pank'], wok:['Janusz Panasewicz','Panasewicz'] } },
      { prompt: 'Zespół i kraj pochodzenia — „Du Hast”:', slots:[{key:'zespol',label:'zespół'},{key:'kraj',label:'kraj'}], answers:{ zespol:['Rammstein'], kraj:['Niemcy'] } },
    ],
  },
};
