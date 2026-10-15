/* ============================================================
   quiz-loader.js — ładuje kategorie quizu z data/quiz-*.json do
   window.CATEGORIES.quiz, a NA KOŃCU startuje aplikację (import app.js).
   ------------------------------------------------------------
   Po co: rdzeń (app/catalog.js) czyta window.CATEGORIES SYNCHRONICZNIE przy
   imporcie, więc dane muszą być na miejscu ZANIM app.js się załaduje. Dlatego
   to ten plik jest „entry pointem" w index.html (zamiast app.js), a app.js
   ładujemy dynamicznym importem dopiero po dociągnięciu kategorii.

   Manifest: data/quiz-index.json → { files: ['quiz-disney.json', ...] }.
   Klucz kategorii = nazwa pliku bez „quiz-" i „.json" (np. quiz-harry-potter.json
   → 'harry-potter'). Kategorie z plików NADPISUJĄ te zaszyte w questions.js
   o tym samym kluczu (np. pełna 'geografia' zastępuje wersję demo).

   ODPORNOŚĆ: każdy błąd sieci/parsowania jest połykany — aplikacja i tak
   wystartuje (po prostu bez dodatkowych kategorii). Gra solo/lektor/MP działa
   bez tych danych, więc loader nigdy nie może zablokować bootu.
   F2a #8: ZAWIESZONY fetch (lie-fi) też nie blokuje — boot czeka na dane najwyżej
   BOOT_BUDGET_MS; co nie zdążyło, dociąga się w tle i jest ogłaszane zdarzeniem
   `stacja:quiz` na window (app/solo.js dopina wtedy kategorie do pickera).
   ============================================================ */
(async () => {
  window.CATEGORIES = window.CATEGORIES || {};
  window.CATEGORIES.quiz = window.CATEGORIES.quiz || {};
  const BOOT_BUDGET_MS = typeof window.__QUIZ_BOOT_MS__ === 'number' ? window.__QUIZ_BOOT_MS__ : 2500;
  let booted = false;   // po imporcie app.js każda spóźniona kategoria jest ogłaszana zdarzeniem
  const announce = () => {
    if (!booted) return;
    try { window.dispatchEvent(new CustomEvent('stacja:quiz')); } catch (_e) {}
  };
  const load = (async () => {
    try {
      const base = new URL('./data/', document.baseURI);
      const idx = await fetch(new URL('quiz-index.json', base))
        .then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)));
      const files = Array.isArray(idx) ? idx : (idx && idx.files) || [];
      const keys = await Promise.all(files.map(async (f) => {
        try {
          const data = await fetch(new URL(f, base))
            .then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)));
          if (data && data.kind === 'quiz' && Array.isArray(data.questions) && data.questions.length) {
            const key = String(f).replace(/^quiz-/, '').replace(/\.json$/, '');
            window.CATEGORIES.quiz[key] = data;
            announce();
            return key;
          }
          console.warn('[quiz-loader] pominięto (zły kształt):', f);
        } catch (e) { console.warn('[quiz-loader] pominięto', f, e); }
        return null;
      }));
      const n = keys.filter(Boolean).length;
      if (n) console.info('[quiz-loader] wczytano kategorii quizu:', n);
    } catch (e) {
      console.warn('[quiz-loader] brak/niepoprawny data/quiz-index.json — start bez dodatkowych kategorii', e);
    }
  })();
  let timer;
  await Promise.race([load, new Promise((r) => { timer = setTimeout(r, BOOT_BUDGET_MS); })]);
  clearTimeout(timer);
  try {
    await import('./app.js');
  } finally {
    booted = true;
    announce();   // kategorie, które doszły w trakcie ładowania modułów (po odczycie katalogu)
  }
})();
