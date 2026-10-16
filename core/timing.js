/* core/timing.js — czyste stałe i obliczenia czasowe (zero DOM / Web API).
 * Decyzje „ile sekund / od którego miejsca / czy już wolno wysłać" — testowalne.
 * Efekty (setTimeout, audio.currentTime, broadcast) zostają w app.js. */

export const SNIP_SECS = 2;               // długość odtwarzanego fragmentu (s)
export const SOLO_SNIP_MAX = 28;          // górne okno losowania startu fragmentu (solo)
export const MP_SNIP_WINDOW_S = 16;       // okno losowania startu fragmentu (multiplayer)

// F8a (#1 „Heardle"): tryb „intro" — zajawka odsłaniana etapami OD POCZĄTKU utworu (sekundy na etap).
// Etap 0 = 1 s … etap 4 = 16 s; „+ więcej" przechodzi do następnego i gra od początku do nowej długości.
export const INTRO_STAGES = [1, 2, 4, 8, 16];
// długość odsłony etapu (s) — etap przycinany do [0..ostatni]; śmieci → etap 0
export function introStageSecs(stage){
  const i = Math.floor(Number(stage));
  return INTRO_STAGES[Number.isFinite(i) ? Math.max(0, Math.min(INTRO_STAGES.length-1, i)) : 0];
}
// następny etap (null = już ostatni — „+ więcej" nieaktywne)
export function introNextStage(stage){
  const i = Math.max(0, Math.floor(Number(stage)) || 0);
  return i+1 < INTRO_STAGES.length ? i+1 : null;
}

/* EKSPERYMENT: tryb „od tyłu krótko" (revsnip) — krótkie OKNO zajawki odtwarzane od tyłu.
 * Okno opisane KOŃCEM `end` (s w zajawce): etap 0 = [end−3, end], „dłużej" = [end−5, end]. Odwrócone okno zaczyna
 * się od `end`, więc „dłużej" powtarza te same 3 s i dokłada 2 s dalej (gracz nie traci tego, co już słyszał). */
export const REVSNIP_STAGES = [3, 5];
export const REVSNIP_SAFE_MIN = 3;        // początek okna nie wcześniej niż 3 s (cisza/wejście utworu)
export const REVSNIP_MAX_END = 28;        // koniec okna nie dalej niż 28 s (zajawka ~30 s, wyciszenie na końcu)
export const MP_REVSNIP_END_MAX = 20;     // MP: koniec okna losowany w [SAFE_MIN+5 .. 20]
export function revsnipStageSecs(stage){
  const i = Math.floor(Number(stage));
  return REVSNIP_STAGES[Number.isFinite(i) ? Math.max(0, Math.min(REVSNIP_STAGES.length-1, i)) : 0];
}
export function revsnipNextStage(stage){
  const i = Math.max(0, Math.floor(Number(stage)) || 0);
  return i+1 < REVSNIP_STAGES.length ? i+1 : null;
}
const REV_MAX_SECS = REVSNIP_STAGES[REVSNIP_STAGES.length-1];
// koniec okna (solo): losowo w [SAFE_MIN+5 .. min(dur,28)−0,5]; krótka zajawka → przycięte do [secs .. dur]
export function revsnipEnd(dur, rnd = Math.random){
  const d = Number(dur) > 0 ? Number(dur) : 30;
  const lo = REVSNIP_SAFE_MIN + REV_MAX_SECS;
  const hi = Math.min(d, REVSNIP_MAX_END) - 0.5;
  if(hi <= lo) return hi > 0 ? hi : d;   // bardzo krótka zajawka — okno kończy się tuż przed jej końcem
  return lo + rnd() * (hi - lo);
}
// MP: koniec okna bez znajomości długości zajawki (serwer) — [8 .. 20]
export function mpRevsnipEnd(rnd = Math.random){
  const lo = REVSNIP_SAFE_MIN + REV_MAX_SECS;
  return lo + rnd() * (MP_REVSNIP_END_MAX - lo);
}
// okno etapu: {start, secs} (start ≥ 0)
export function revsnipWindow(end, stage){
  const secs = revsnipStageSecs(stage), e = Number(end) > 0 ? Number(end) : secs;
  const start = Math.max(0, e - secs);
  return { start, secs: e - start };
}
// MP: wspólny offset fragmentu per tryb (serwer-autorytet i relay-host): fragment → start 2 s, od tyłu krótko → koniec okna
export function mpSnipOffset(mode, rnd = Math.random){
  if(mode === 'snippet') return mpSnipStart(rnd);
  if(mode === 'revsnip') return mpRevsnipEnd(rnd);
  return 0;
}

/* EKSPERYMENT: „składanka" (medley) — 4 wycinki po 1,5 s z różnych utworów wykonawcy.
 * Poprawki po testach: przerwa między wycinkami 3 s (było 0,25 s — utwory zlewały się w jeden), a tuż PRZED
 * każdym wycinkiem (także pierwszym — stąd krótka cisza na wejściu MEDLEY_LEAD_S) cichy „tik": gracz słyszy, że
 * zaczyna się nowy utwór. W trakcie licznik „fragment k/n" (medleyClipAt).
 * Start wycinka w bezpiecznym oknie 8–20 s zajawki (nie cisza na początku, nie wyciszenie na końcu). */
export const MEDLEY_CLIP_S = 1.5;
export const MEDLEY_GAP_S = 3;
export const MEDLEY_LEAD_S = 0.4;      // cisza przed pierwszym wycinkiem (miejsce na jego „tik")
export const MEDLEY_TICK_LEAD_S = 0.3; // „tik" startuje tyle sekund przed wycinkiem
export const MEDLEY_SAFE_FROM = 8, MEDLEY_SAFE_TO = 20;
export function medleyClipStart(dur, rnd = Math.random){
  const d = Number(dur) > 0 ? Number(dur) : 30;
  const hi = Math.min(MEDLEY_SAFE_TO, d - MEDLEY_CLIP_S - 0.5);
  if(hi <= 0) return 0;
  const lo = Math.min(MEDLEY_SAFE_FROM, hi);
  return lo + rnd() * (hi - lo);
}
const medleyN = n => Math.max(0, Math.floor(Number(n)) || 0);
// początki wycinków w sklejonym buforze (s): lead, lead + klip + przerwa, …
export function medleyClipOffsets(n){
  const k = medleyN(n), out = [];
  for(let i = 0; i < k; i++) out.push(MEDLEY_LEAD_S + i*(MEDLEY_CLIP_S + MEDLEY_GAP_S));
  return out;
}
// momenty „tików" (s) — tuż przed każdym wycinkiem
export const medleyTickOffsets = n => medleyClipOffsets(n).map(t => Math.max(0, t - MEDLEY_TICK_LEAD_S));
// łączna długość składanki (s) dla n wycinków
export function medleyDuration(n){
  const k = medleyN(n);
  return k ? MEDLEY_LEAD_S + k*MEDLEY_CLIP_S + (k-1)*MEDLEY_GAP_S : 0;
}
/* gdzie jesteśmy w składance w chwili t (s od startu bufora): {index (0-based), playing} — index = wycinek grający
 * (playing:true) albo NASTĘPNY w kolejce (przerwa/wejście, playing:false); po ostatnim → {index:n-1, playing:false, done:true}. */
export function medleyClipAt(t, n){
  const k = medleyN(n), x = Number(t);
  if(!k) return { index:0, playing:false, done:true };
  const offs = medleyClipOffsets(k), pos = Number.isFinite(x) ? x : 0;
  for(let i = 0; i < k; i++){
    if(pos < offs[i]) return { index:i, playing:false, done:false };
    if(pos < offs[i] + MEDLEY_CLIP_S) return { index:i, playing:true, done:false };
  }
  return { index:k-1, playing:false, done:true };
}
// tekst licznika dla gracza (solo: deck-state)
export function medleyLabel(t, n){
  const k = medleyN(n), at = medleyClipAt(t, k);
  if(!k || at.done) return 'koniec składanki · ↻ od nowa';
  return at.playing ? `fragment ${at.index+1}/${k}…` : `przerwa · zaraz fragment ${at.index+1}/${k}`;
}

/* EKSPERYMENT: „okładka" (cover) — okładka albumu odsłaniana etapami rozdzielczości (bloki na bok; 0 = pełna).
 * Auto-odsłona co COVER_STEP_MS albo przycisk „wyraźniej". Mnożnik punktów: core/scoring.coverMult (COVER_MULTS).
 * Poprawki po testach: etap 8×8 usunięty (praktycznie nie do zgadnięcia) — start od 16×16; etap trwa 6 s (było 3 s). */
export const COVER_STAGES = [16, 32, 64, 0];
export const COVER_STEP_MS = 6000;
export function coverStageBlocks(stage){
  const i = Math.floor(Number(stage));
  return COVER_STAGES[Number.isFinite(i) ? Math.max(0, Math.min(COVER_STAGES.length-1, i)) : 0];
}
export function coverNextStage(stage){
  const i = Math.max(0, Math.floor(Number(stage)) || 0);
  return i+1 < COVER_STAGES.length ? i+1 : null;
}

/* EKSPERYMENT: „zwolnione obroty" (slowmo) / „przyspieszone" (fastmo) — zajawka jak płyta na złych obrotach
 * (zmiana tempa I wysokości). slowmo: etap 0 = 0.6×, „szybciej" → 0.75× (bez 0.9× — za blisko oryginału);
 * fastmo: jeden etap 1.5× („chipmunk"). Odsłona gra oryginał 1.0×. MP: stałe tempo etapu 0 (bez etapów). */
export const TEMPO_STAGES = { slowmo:[0.6, 0.75], fastmo:[1.5] };
export const TEMPO_MODES = Object.keys(TEMPO_STAGES);
export const isTempoMode = mode => Object.prototype.hasOwnProperty.call(TEMPO_STAGES, mode);
// tempo etapu (przycięte do [0..ostatni]); tryb spoza tempa / śmieci → 1 (oryginał)
export function tempoRate(mode, stage){
  const st = isTempoMode(mode) ? TEMPO_STAGES[mode] : null;
  if(!st) return 1;
  const i = Math.floor(Number(stage));
  return st[Number.isFinite(i) ? Math.max(0, Math.min(st.length-1, i)) : 0];
}
// następny etap (null = ostatni / tryb bez etapów)
export function tempoNextStage(mode, stage){
  const st = isTempoMode(mode) ? TEMPO_STAGES[mode] : null;
  if(!st) return null;
  const i = Math.max(0, Math.floor(Number(stage)) || 0);
  return i+1 < st.length ? i+1 : null;
}
// MP: stałe tempo trybu (etap 0) — tempo jest lokalne u każdego klienta, serwer niesie tylko `mode`
export const mpTempoRate = mode => tempoRate(mode, 0);
/* płyta winylowa (UI): 1.0× = 33⅓ obr/min „wizualnie" ~1,8 s na obrót; czas obrotu odwrotnie proporcjonalny
 * do tempa (0.6× → 3 s, 0.75× → 2,4 s, 1.5× → 1,2 s). Śmieci/≤0 → 1.0×. */
export const VINYL_TURN_S = 1.8;
export function vinylTurnSecs(rate){
  const r = Number(rate);
  return VINYL_TURN_S / (Number.isFinite(r) && r > 0 ? r : 1);
}

// ile sekund trwa faza „słuchaj" per tryb (gdy kategoria nie nadpisuje listenSecs)
export const LISTEN_SECS = { lektor:22, music:15, reverse:15, snippet:12, intro:16, abcd:15, year:15, revsnip:12, medley:18, cover:15, slowmo:18, fastmo:12, timeline:15 };

export const MP_BUFFER_TIMEOUT_MS = 6000; // bezpiecznik klienta: zgłoś „ready" mimo zawieszenia
// F2b (#6): twardy limit fazy gotowości (ARMING) po stronie serwera — po nim pytanie rusza z tymi,
// którzy są gotowi; niegotowi dostają audio „na dogonienie". Bez tego jeden AFK blokował pokój.
export const MP_ARM_TIMEOUT_MS = 12000;
// F2b (#6): auto-„dalej" na odsłonie po tylu ms bezczynności (licznik widoczny na karcie)
export const MP_REVEAL_AUTO_MS = 10000;
// F6b (F9/R-F9): intro fazy MP (duża ikona „Słuchaj") — tylko przed „słuchaj". Każdy klient po odbiorze
// PLAY wstrzymuje audio o ten sam czas (wspólny LEAD → równy start). Serwer go NIE zna (endsAt liczy od go()),
// więc to stała klienta — trzymana w rdzeniu jako jedno źródło (render + testy). Dawniej 2300 ms na KAŻDĄ fazę.
export const MP_INTRO_MS = 900;
// F6b (F6): „Wróć do pokoju ABCD" po wyjściu — rekord {code, at} w sessionStorage ważny 30 min
export const LAST_ROOM_TTL_MS = 30*60*1000;
const ROOM_CODE_RE = /^[A-Z0-9]{4}$/;
// rekord ostatniego pokoju → kod (gdy poprawny i świeży) albo null
export function lastRoomCode(rec, now, ttl = LAST_ROOM_TTL_MS){
  if(!rec || typeof rec!=='object') return null;
  const code = typeof rec.code==='string' ? rec.code.toUpperCase() : '';
  const at = Number(rec.at);
  if(!ROOM_CODE_RE.test(code) || !Number.isFinite(at) || at > now + 60000 || now - at > ttl) return null;
  return code;
}
// F6b (U4): tik ostatnich sekund timera — która pełna sekunda (5..1) ma właśnie zabrzmieć (null = nic)
export const TICK_LAST_S = 5;
export function tickSecond(remMs, lastTicked){
  if(!(remMs > 0) || remMs > TICK_LAST_S*1000) return null;
  const s = Math.ceil(remMs/1000);
  return s !== lastTicked ? s : null;
}
// ile pełnych sekund zostało do terminu (0 gdy minął / brak terminu) — liczniki w UI
export function secsLeft(deadline, now){
  const d = Number(deadline);
  if(!Number.isFinite(d) || d <= 0) return 0;
  return Math.max(0, Math.ceil((d - now) / 1000));
}
// F1 (#5): opcje timera pytania MP (picker) + clamp na serwerze — jedno źródło
export const MP_TIMER_OPTIONS = [0, 30, 60, 90];
export const MP_TIMER_MAX_S = 90;
// timer z sieci → liczba całkowita s w [0..MP_TIMER_MAX_S] (śmieci/ujemne → 0 = bez timera)
export function clampTimer(t){
  const n = Math.floor(Number(t));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MP_TIMER_MAX_S) : 0;
}
export const EMOJI_TTL_MS = 2400;         // jak długo leci emotka po ekranie
export const SAY_TTL_MS = 4400;           // jak długo wisi dymek wiadomości
export const TYPING_PING_MS = 1500;       // throttle własnego sygnału „pisze…"
export const TYPING_HOLD_MS = 3000;       // jak długo trzymać cudze „pisze…" bez odświeżenia

// długość fazy „słuchaj": override z kategorii (catSecs>0) albo domyślnie wg trybu
export function listenSecs(mode, catSecs){
  return (catSecs > 0 ? catSecs : (LISTEN_SECS[mode] || 15));
}

// start fragmentu (solo): losowo w bezpiecznym oknie [0.3 .. min(dur,28)-SNIP-1]
export function soloSnipStart(dur, rnd = Math.random){
  return Math.max(0.3, rnd() * (Math.min(dur, SOLO_SNIP_MAX) - SNIP_SECS - 1));
}

// start fragmentu (MP): losowo w oknie [0.5 .. MP_SNIP_WINDOW_S] (np. [0.5 .. 16])
export function mpSnipStart(rnd = Math.random){
  return Math.max(0.5, rnd() * MP_SNIP_WINDOW_S);
}

// czy minęło dość czasu, by ponownie wysłać sygnał „pisze…"
export function shouldPing(lastTs, now, interval = TYPING_PING_MS){
  return (now - lastTs) >= interval;
}
