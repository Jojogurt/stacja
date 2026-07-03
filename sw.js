/* sw.js — service worker STACJA (PWA).
   Strategia: NETWORK-FIRST dla zasobów własnych (online zawsze świeży deploy,
   brak pułapki starego cache), z fallbackiem do cache, gdy offline.
   Cross-origin (Worker, iTunes, fonty, CDN) NIE jest przechwytywany — leci wprost do sieci.
   Bumpnij CACHE przy zmianie listy shell-a. */
const CACHE = 'stacja-v51';
const SHELL = [
  './', './index.html',
  './quiz-loader.js', './app.js', './categories.js', './playlists.js', './lyrics.js', './questions.js', './config.js',
  './core/util.js', './core/scoring.js', './core/match.js', './core/phases.js',
  './core/mpReducer.js', './core/matchRecord.js', './core/trackSelect.js',
  './core/timing.js', './core/picker.js', './core/chatFeed.js',
  './app/dom.js', './app/lektor.js', './app/audioCtx.js', './app/audio.js',
  './app/catalog.js', './app/solo.js', './app/social.js', './app/catEditor.js',
  './app/mp-state.js', './app/mp-picker.js', './app/mp-render.js', './app/mp.js', './app/sfx.js', './app/icons.js',
  './click.wav', './clapping.wav',
  './adapters-web/webAudio.js', './adapters-web/itunesRepository.js',
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
  './data/quiz-medycyna.json', './data/quiz-wiedzmin.json',
];

self.addEventListener('install', (e) => {
  // precache best-effort (pojedynczy 404 nie wywala instalacji)
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => c.add(u)));
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // cross-origin → sieć (domyślnie)

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const c = await caches.open(RUNTIME);        // runtime → cache ograniczony (shell zostaje w CACHE)
        await c.put(req, res.clone());
        trimRuntime();                               // fire-and-forget: utrzymaj limit wpisów
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      // nawigacja offline → podaj powłokę
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
