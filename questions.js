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

   STAN (audyt 2026-10): wszystkie zestawy żyją w data/quiz-*.json (ładuje je
   quiz-loader.js i wpina pod window.CATEGORIES.quiz[<slug>]). Dawne zaszyte demo
   (muzyka = martwa kopia paczki, geografia = nadpisywana, popkultura = 6 pytań
   obok pełnej „Film i kino") usunięte — plik zostaje jako pusty kontener, bo
   ładuje go index.html. Nowe zestawy dodawaj jako data/quiz-<slug>.json.

   UWAGA: rozszerza window.CATEGORIES (nie nadpisuje) — ładuj przez <script src>
   PRZED app.js, obok categories.js/playlists.js/lyrics.js.
   ============================================================ */
window.CATEGORIES = window.CATEGORIES || {};
window.CATEGORIES.quiz = window.CATEGORIES.quiz || {};
