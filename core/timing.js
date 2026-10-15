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

// ile sekund trwa faza „słuchaj" per tryb (gdy kategoria nie nadpisuje listenSecs)
export const LISTEN_SECS = { lektor:22, music:15, reverse:15, snippet:12, intro:16, abcd:15, year:15 };

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
