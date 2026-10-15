/* app/sfx.js — UI-dźwięki: klik na buttonach + oklaski przy trafieniu (pliki) oraz F6b (U4) dźwięki
 * GENEROWANE WebAudio (bez nowych plików): pudło („bzzt"), tik ostatnich 5 s timera, „ding" odsłony,
 * fanfara końca meczu. Self-init na import:
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
// nuta: {f: Hz, t: start (s), d: czas (s), type, vol, slide: Hz docelowe}
function synth(notes, master = 0.22){
  let ctx; try { ctx = ensureCtx(); } catch (e) { return false; }
  if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') return false;
  try {
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    const t0 = (ctx.currentTime || 0) + 0.01;
    const out = ctx.createGain(); out.gain.value = master; out.connect(ctx.destination);
    for (const n of notes) {
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
};
// zagraj wygenerowany dźwięk (respektuje „Dźwięki" + duck pod zajawką/lektorem)
export function playSfx(name){
  if (!SOUNDS[name] || !enabled()) return false;
  if (!mayPlay()) { log('-'+name); return false; }
  log(name);
  return SOUNDS[name]();
}

(function initSfx(){
  audioSession('ambient');   // domyślnie: nie przerywaj muzyki w tle przy klikach/oklaskach
  click = mk(CLICK, 0.45); clap = mk(CLAP, 0.8);
  document.addEventListener('pointerdown', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (b && !b.disabled) playClick();
  }, true);
})();
