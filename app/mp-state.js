/* app/mp-state.js — współdzielony, mutowalny stan warstwy MULTIPLAYER (jeden obiekt `S`).
 * Importowany przez app/mp.js (logika/transport) i app/mp-render.js (widok) — to ten sam obiekt,
 * więc zapisy widać wszędzie (żywe wiązanie ES eksportu `const S`). Tożsamość gracza `mpMe`
 * żyje osobno w app/mp.js (eksportowana — używa jej też app/solo.js i app/social.js). */
import { createFeed } from '../core/chatFeed.js';

// tożsamość gracza — współdzielona przez mp.js / mp-render.js / solo.js / social.js (mutowana, nie reassignowana)
export const mpMe = { id: Math.random().toString(36).slice(2,10), name: '' };

export const S = {
  ch: null,               // kanał transportu (cfChannel/authorityChannel) lub null
  code: null,             // kod pokoju
  host: false,            // czy ten klient jest hostem
  roomStage: 'wait',      // przed grą: 'wait' = poczekalnia, 'build' = picker „ułóż mecz" (host)
  lastView: null,         // ostatni „duży" widok (wait/picker/game) — do one-shot przejść
  game: null,             // stan gry (host/DO = źródło prawdy)
  hostCurrent: null,      // pełny utwór znany tylko hostowi
  hostSeen: new Set(),    // antypowtórki po stronie hosta
  lastNonce: null,        // ostatnio odtworzony playNonce
  lastArmNonce: null,     // ostatnio zbuforowana runda (faza gotowości)
  ready: new Set(),       // host: id graczy, którzy zbuforowali audio
  armTimer: null,         // host: bezpiecznik startu mimo braku gotowości
  ack: null,              // playNonce odsłony, którą TEN klient już zamknął („dalej")
  revealNonce: null,      // playNonce ostatnio pokazanej odsłony
  revealSnap: null,       // migawka odsłony do renderu we własnym tempie
  audio: null,            // jeden trwały, odblokowany gestem element audio (MP)
  revSrc: null,           // BufferSource trybu „od tyłu" w MP
  tally: {},              // id -> {name, correct} (do MVP)
  autoLocked: false,      // czy timer/host już zatwierdził rundę
  playRound: null,        // dla której rundy zbudowany formularz (by nie czyścić pól)
  timerInt: null,         // interwał odliczania
  seenActs: new Set(),    // id zastosowanych akcji — by akcja nie zadziałała dwa razy
  conf: 'normal',         // wybrana pewność przy wrzucaniu typu (normal/unsure/sure)
  typingSet: new Set(),   // kto „pisze…" (ulotny broadcast „typing")
  typingTimers: {},       // id → timeout wygaszający „pisze" po ~3 s
  lastTyping: 0,          // throttle wysyłki własnego „typing"
  feed: createFeed(),     // feed czatu (klient-side) — core/chatFeed.js
  playSkin: null,         // dla której skórki zbudowany scaffold gry
  playSub: null,          // dla którego pod-stanu fazy zbudowany scaffold
  sub: 'sluchaj',         // klient-lokalny pod-stan fazy PLAY (sluchaj/kombinuj)
  composerMode: 'chat',   // composer @odp: 'chat' / 'typ'
  subTimer: null,         // auto-przejście słuchaj → kombinuj
  listenStart: 0,         // okno fazy „słuchaj" — start (ms)
  listenDur: 0,           // okno fazy „słuchaj" — długość (ms)
};
