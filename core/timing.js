/* core/timing.js — czyste stałe i obliczenia czasowe (zero DOM / Web API).
 * Decyzje „ile sekund / od którego miejsca / czy już wolno wysłać" — testowalne.
 * Efekty (setTimeout, audio.currentTime, broadcast) zostają w app.js. */

export const SNIP_SECS = 2;               // długość odtwarzanego fragmentu (s)
export const SOLO_SNIP_MAX = 28;          // górne okno losowania startu fragmentu (solo)
export const MP_SNIP_WINDOW_S = 16;       // okno losowania startu fragmentu (multiplayer)

// ile sekund trwa faza „słuchaj" per tryb (gdy kategoria nie nadpisuje listenSecs)
export const LISTEN_SECS = { lektor:22, music:15, reverse:15, snippet:12 };

export const MP_BUFFER_TIMEOUT_MS = 6000; // bezpiecznik klienta: zgłoś „ready" mimo zawieszenia
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

// start fragmentu (MP): losowo w oknie [0.5 .. 0.5+MP_SNIP_WINDOW_S]
export function mpSnipStart(rnd = Math.random){
  return Math.max(0.5, rnd() * MP_SNIP_WINDOW_S);
}

// czy minęło dość czasu, by ponownie wysłać sygnał „pisze…"
export function shouldPing(lastTs, now, interval = TYPING_PING_MS){
  return (now - lastTs) >= interval;
}
