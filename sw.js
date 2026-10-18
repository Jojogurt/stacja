/* sw.js — service worker STACJA (PWA).
   Strategia: NETWORK-FIRST dla zasobów własnych (online zawsze świeży deploy,
   brak pułapki starego cache), z fallbackiem do cache, gdy offline.
   F2a #8: sieć ma NET_TIMEOUT_MS — przy „lie-fi" (fetch wisi) po timeoucie oddajemy kopię z cache,
   a odpowiedź sieci (gdy w końcu dojdzie) i tak odświeża runtime-cache w tle.
   F2a #18: żądania z nagłówkiem Range (audio/wideo) NIE są przechwytywane, a do cache trafia tylko 200
   (Cache.put odrzuca 206).
   Cross-origin (Worker, iTunes, fonty, CDN) NIE jest przechwytywany — leci wprost do sieci.
   SHELL musi zawierać KAŻDY moduł osiągalny importami z quiz-loader.js + data/quiz-index.json
   (pilnuje tego test w test/run.js). Bumpnij CACHE przy zmianie listy shell-a. */
const CACHE = 'stacja-v77';
const SHELL = [
  './', './index.html',
  './quiz-loader.js', './app.js', './categories.js', './playlists.js', './lyrics.js', './questions.js', './config.js',
  './core/util.js', './core/lyricCheck.js', './core/scoring.js', './core/match.js', './core/phases.js',
  './core/mpReducer.js', './core/judge.js', './core/matchRecord.js', './core/trackSelect.js', './core/sources.js',
  './core/timing.js', './core/timeline.js', './core/picker.js', './core/matchSetup.js', './core/guitarCovers.js', './core/chatFeed.js', './core/teams.js', './core/handles.js', './core/daily.js', './core/lektorVoice.js', './core/qr.js', './core/tvStage.js',
  './app/dom.js', './app/lektor.js', './app/audioCtx.js', './app/audio.js',
  './app/catalog.js', './app/solo.js', './app/social.js', './app/catEditor.js',
  './app/mp-state.js', './app/mp-picker.js', './app/mp-render.js', './app/mp-tv.js', './app/mp.js', './app/sfx.js', './app/icons.js', './app/daily.js',
  './app/cover.js',   // EKSPERYMENT: tryb „okładka"
  './app/listen.js',  // Łamigłówki: „▶ posłuchaj" w odsłonie
  './app/vinyl.js',   // płyta winylowa = kontrolka odtwarzania (wszystkie tryby z dźwiękiem)
  './app/matchSetup.js',  // wspólny komponent ekranu „Nowy mecz” (solo + host MP)
  './app/taste.js', './app/gust.js', './core/taste.js',   // „Twój gust": oceny, półka, sesja oceniania
  './core/tasteProfile.js', './app/tasteCard.js',        // „Twój gust" etap 2: profil, archetyp, karta PNG
  './core/mpView.js', './app/mpResultCard.js',          // MP P2: copy/wynik meczu/dźwięki faz, karta PNG wyniku
  './core/tasteCompare.js',                              // „Twój gust" etap 3: porównanie, półki do gry
  './click.wav', './clapping.wav',
  './adapters-web/webAudio.js', './adapters-web/itunesRepository.js', './adapters-web/translator.js',
  './adapters-web/cf.js', './adapters-web/cfChannel.js', './adapters-web/roomTransport.js',
  './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  // kategorie quizu (ładowane przez quiz-loader.js) — precache do gry offline
  './data/quiz-index.json',
  './data/quiz-biologia.json', './data/quiz-disney.json', './data/quiz-film.json',
  './data/quiz-geografia.json', './data/quiz-gry-wideo.json', './data/quiz-harry-potter.json',
  './data/quiz-historia-polski.json', './data/quiz-historia-swiata.json', './data/quiz-kosmetyki.json',
  './data/quiz-kosmos.json', './data/quiz-kuchnia.json', './data/quiz-literatura.json',
  './data/quiz-marvel.json', './data/quiz-mitologia.json', './data/quiz-nauka.json',
  './data/quiz-sport.json', './data/quiz-star-wars.json', './data/quiz-sztuka.json',
  './data/quiz-wladca-pierscieni.json', './data/quiz-zwierzeta.json',
  './data/quiz-krolowie-polscy.json', './data/quiz-informatyka.json', './data/quiz-lotnictwo.json',
  './data/quiz-medycyna.json', './data/quiz-wiedzmin.json', './data/quiz-muzyka.json',
  './data/quiz-rebusy.json', './data/quiz-jedna-litera.json',   // Łamigłówki
];

self.addEventListener('install', (e) => {
  // precache best-effort (pojedynczy 404 nie wywala instalacji)
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' }))));   // świeże z sieci, nie z HTTP-cache
    self.skipWaiting();
  })());
});

// FAZA 6: osobny, OGRANICZONY cache dla odpowiedzi runtime (nie precache) — bez tego rósł bez końca.
const RUNTIME = CACHE + '-rt';
const RUNTIME_MAX = 60;                    // max wpisów runtime (LRU-ish: kasuj najstarsze)
async function trimRuntime(){
  const c = await caches.open(RUNTIME); const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - RUNTIME_MAX))) await c.delete(k);
}

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const NET_TIMEOUT_MS = 3000;   // F2a #8: po tylu ms bez odpowiedzi sieci → fallback do cache (jeśli jest)

async function putRuntime(req, res){
  // F2a #18: tylko pełne 200 (206/opaque/błędy nie trafiają do cache; Cache.put rzuca dla 206)
  if (!res || res.status !== 200) return;
  try {
    const c = await caches.open(RUNTIME);         // runtime → cache ograniczony (shell zostaje w CACHE)
    await c.put(req, res);
    trimRuntime();                                // fire-and-forget: utrzymaj limit wpisów
  } catch (_e) {}
}

async function cachedFor(req){
  const cached = await caches.match(req);
  if (cached) return cached;
  // nawigacja offline → podaj powłokę
  if (req.mode === 'navigate') return caches.match('./index.html');
  return undefined;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;              // F2a #18: Range (audio) → wprost do sieci
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // cross-origin → sieć (domyślnie)

  // 'no-cache' = rewalidacja w HTTP-cache przeglądarki: bez tego po deployu heurystyczny cache
  // (GitHub Pages max-age=600) potrafił podać STARY moduł obok nowych → błąd importu i biały ekran.
  // Nawigacji nie wolno przebudować z RequestInit (TypeError) — leci jak jest.
  const net = req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' });
  // klon PRZED oddaniem odpowiedzi stronie (ciało jeszcze nieprzeczytane); waitUntil synchronicznie,
  // żeby zapis do cache dokończył się także wtedy, gdy stronie oddaliśmy już kopię z cache (timeout)
  e.waitUntil(net.then((res) => putRuntime(req, res.clone())).catch(() => {}));

  e.respondWith((async () => {
    let timer;
    const timeout = new Promise((r) => { timer = setTimeout(() => r('timeout'), NET_TIMEOUT_MS); });
    try {
      const first = await Promise.race([net, timeout]);
      if (first !== 'timeout') return first;
      // sieć wisi → kopia z cache (sieć dalej dociąga w tle i odświeży runtime-cache)
      const cached = await cachedFor(req);
      if (cached) return cached;
      return await net;                              // brak kopii → czekaj na sieć do skutku
    } catch (err) {
      const cached = await cachedFor(req);
      if (cached) return cached;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  })());
});
