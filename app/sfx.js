/* app/sfx.js — UI-dźwięki: klik na buttonach + oklaski przy trafieniu (pliki) oraz F6b (U4) dźwięki
 * GENEROWANE WebAudio (bez nowych plików): pudło („bzzt"), tik ostatnich 5 s timera, „ding" odsłony,
 * fanfara końca meczu; P2-14: dźwięki FAZ MP — sting startu pytania, whoosh karty, werbel przed odsłoną. Self-init na import:
 *  - deleguje 'pointerdown' z DOWOLNEGO <button> → klik (bez ruszania pojedynczych handlerów),
 *  - pierwszy klik (gest) odblokowuje audio → późniejsze oklaski (poza gestem) grają.
 * Wyciszenie: przełącznik „Dźwięki" w menu (localStorage 'bbSfx'='off').
 * DUCK: żaden UI-dźwięk nie gra, gdy leci zajawka albo lektor (sonda muzyki rejestrowana przez
 * app/audio.js i app/mp.js — registerMusicProbe), żeby nie zagłuszać utworu/tekstu. */
import { ensureCtx } from './audioCtx.js';

const CLICK = './click.wav', CLAP = './clapping.wav';
let click = null, clap = null;
const enabled = () => { try { return localStorage.getItem('bbSfx') !== 'off'; } catch (e) { return true; } };
// iOS: sesja 'ambient' → UI-dźwięki MIKSUJĄ się z muzyką w tle (i milkną przy wyciszeniu dzwonka),
// zamiast pauzować Spotify itp. Grę/zajawkę przełączamy na 'playback' osobno (audio.js/mp.js).
const audioSession = t => { try{ if(navigator.audioSession) navigator.audioSession.type = t; }catch(e){} };
function mk(src, vol){ try { const a = new Audio(src); a.preload = 'auto'; a.volume = vol; return a; } catch (e) { return null; } }

/* —— duck: sondy „czy gra muzyka/lektor" (true = cisza dla SFX) —— */
const probes = [];
export function registerMusicProbe(fn){ if(typeof fn === 'function') probes.push(fn); }
export function musicPlaying(){ return probes.some(p => { try { return !!p(); } catch (e) { return false; } }); }
const mayPlay = () => enabled() && !musicPlaying();
// seam testowy: window.__SFX_LOG__ = [] → nazwy zagranych (i zduszonych: '-nazwa') dźwięków
function log(name){ try { if (window.__SFX_LOG__) window.__SFX_LOG__.push(name); } catch (e) {} }

function play(a, name){
  if (!enabled()) return;
  if (musicPlaying()) { log('-'+name); return; }
  log(name);
  if (!a) return;
  try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
}

export function playClick(){ play(click, 'click'); }
export function playClap(){ play(clap, 'clap'); }

/* —— syntezator: krótkie tony na wspólnym AudioContext (odblokowywanym gestami w audioCtx.js) —— */
/* P2-14: DUCK pod zajawkę — aktywne wyjścia SFX (master gain) ściszane, gdy rusza muzyka/lektor (sfxDuck z app/mp.js
 * na zdarzeniu 'playing'), np. ogon „stingu" startu pytania nie zagłusza pierwszych taktów zajawki. */
const active = new Set();
function track(ctx, out, dur){
  const it = { ctx, out, end: (ctx.currentTime || 0) + dur + 0.1 };
  active.add(it);
  setTimeout(() => active.delete(it), Math.ceil((dur + 0.2) * 1000));
}
export function sfxDuck(level = 0.18, ms = 90){
  for (const it of active) {
    try {
      const t = it.ctx.currentTime || 0, g = it.out.gain;
      if (g.cancelScheduledValues) g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(Math.max(0.0001, g.value * level), t + ms / 1000);
    } catch (e) {}
  }
}
// nuta: {f: Hz, t: start (s), d: czas (s), type, vol, slide: Hz docelowe}; szum: {noise:true, t, d, vol, hp: Hz (filtr górnoprzepustowy)}
function synth(notes, master = 0.22){
  let ctx; try { ctx = ensureCtx(); } catch (e) { return false; }
  if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') return false;
  try {
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    const t0 = (ctx.currentTime || 0) + 0.01;
    const out = ctx.createGain(); out.gain.value = master; out.connect(ctx.destination);
    track(ctx, out, notes.reduce((m, n) => Math.max(m, n.t + n.d), 0));
    for (const n of notes) {
      if (n.noise) { noiseHit(ctx, out, t0 + n.t, n.d, n.vol == null ? 1 : n.vol, n.hp || 1800); continue; }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = n.type || 'sine';
      o.frequency.setValueAtTime(n.f, t0 + n.t);
      if (n.slide) o.frequency.exponentialRampToValueAtTime(n.slide, t0 + n.t + n.d);
      const v = n.vol == null ? 1 : n.vol;
      g.gain.setValueAtTime(0.0001, t0 + n.t);
      g.gain.exponentialRampToValueAtTime(v, t0 + n.t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
      o.connect(g); g.connect(out);
      o.start(t0 + n.t); o.stop(t0 + n.t + n.d + 0.02);
    }
    return true;
  } catch (e) { return false; }
}
const SOUNDS = {
  // pudło: niski, chropowaty „bzzt" opadający w dół
  buzz:    () => synth([{ f:150, t:0, d:0.28, type:'sawtooth', vol:0.7, slide:90 }, { f:155, t:0, d:0.28, type:'square', vol:0.25, slide:92 }], 0.16),
  // tik ostatnich sekund timera: krótki, suchy klik
  tick:    () => synth([{ f:1650, t:0, d:0.045, type:'square', vol:0.5 }], 0.12),
  // ding odsłony: jasny dzwonek (ton + kwinta)
  ding:    () => synth([{ f:1318.5, t:0, d:0.7, vol:0.9 }, { f:1975.5, t:0.005, d:0.45, vol:0.35 }], 0.2),
  // fanfara końca meczu: C-E-G-C (trójkąt) z akordem na końcu
  fanfare: () => synth([
    { f:523.25, t:0,    d:0.16, type:'triangle' }, { f:659.25, t:0.14, d:0.16, type:'triangle' },
    { f:783.99, t:0.28, d:0.16, type:'triangle' }, { f:1046.5, t:0.42, d:0.65, type:'triangle' },
    { f:659.25, t:0.42, d:0.65, type:'triangle', vol:0.5 }, { f:783.99, t:0.42, d:0.65, type:'triangle', vol:0.5 },
  ], 0.2),
  /* P2-14: dźwięki FAZ (bez plików). gain = mnożnik roli ekranu (core/mpView.phaseSfxGain: TV ×1.8, pilot w salonie 0) */
  // sting startu pytania (~0,4 s): akord w górę G→C→E + iskra — „jedziemy!"
  sting:  (k=1) => synth([
    { f:392,  t:0,    d:0.16, type:'triangle', vol:0.8 }, { f:523.25, t:0.08, d:0.18, type:'triangle', vol:0.8 },
    { f:659.25, t:0.16, d:0.26, type:'triangle' }, { f:1046.5, t:0.16, d:0.24, vol:0.35 }, { f:1568, t:0.2, d:0.18, vol:0.18 },
  ], 0.17*k),
  // whoosh karty pytania: szum przesuwany w górę + miękki ton (karta wjeżdża od dołu)
  whoosh: (k=1) => synth([ { noise:true, t:0, d:0.26, vol:0.55, hp:900 }, { f:220, t:0, d:0.24, vol:0.25, slide:660 } ], 0.14*k),
  // werbel przed odsłoną („Sprawdzamy…" ~0,6 s): narastające uderzenia szumu + akcent
  drum:   (k=1) => synth([
    ...Array.from({ length:12 }, (_, i) => ({ noise:true, t:i*0.042, d:0.05, vol:0.25+i*0.05, hp:2600 })),
    { noise:true, t:0.52, d:0.14, vol:1, hp:1500 }, { f:110, t:0.52, d:0.16, type:'sine', vol:0.7, slide:70 },
  ], 0.16*k),
};
// krótki impuls szumu (werbel/whoosh) — bufor białego szumu (cache per kontekst) + filtr górnoprzepustowy
let noiseBuf = null, noiseCtx = null;
function noiseHit(ctx, out, at, d, vol, hp){
  if (typeof ctx.createBuffer !== 'function' || typeof ctx.createBufferSource !== 'function') {   // stary/jsdom — tik zamiast szumu
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(hp, at);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol*0.4), at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(g); g.connect(out); o.start(at); o.stop(at + d + 0.02); return;
  }
  if (!noiseBuf || noiseCtx !== ctx) {
    const n = Math.floor((ctx.sampleRate || 44100) * 0.3);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate || 44100); noiseCtx = ctx;
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = noiseBuf;
  let node = src;
  if (typeof ctx.createBiquadFilter === 'function') { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.setValueAtTime(hp, at); src.connect(f); node = f; }
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
  node.connect(g); g.connect(out); src.start(at); src.stop(at + d + 0.02);
}
// zagraj wygenerowany dźwięk (respektuje „Dźwięki" + duck pod zajawką/lektorem).
// opts.gain (P2-14): mnożnik głośności wg roli ekranu (TV głośniej; 0 = wyciszony — np. telefon-pilot w salonie)
export function playSfx(name, opts = {}){
  if (!SOUNDS[name] || !enabled()) return false;
  const k = opts && opts.gain != null ? Number(opts.gain) : 1;
  if (!(k > 0)) { log('0'+name); return false; }
  // opts.overMusic: dźwięk fazy, w której z założenia nic nie gra (karta pytania, „Sprawdzamy…") — sonda muzyki bywa
  // chwilowo „true" (odblokowanie elementu audio w geście odtwarza ciszę), więc jej nie pytamy
  if (!(opts && opts.overMusic) && !mayPlay()) { log('-'+name); return false; }
  log(name);
  return SOUNDS[name](Math.min(3, k));
}

(function initSfx(){
  audioSession('ambient');   // domyślnie: nie przerywaj muzyki w tle przy klikach/oklaskach
  click = mk(CLICK, 0.45); clap = mk(CLAP, 0.8);
  document.addEventListener('pointerdown', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (b && !b.disabled) playClick();
  }, true);
})();
