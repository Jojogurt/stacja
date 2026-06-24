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
};
