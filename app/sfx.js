/* app/sfx.js — UI-dźwięki: klik na buttonach + oklaski przy trafieniu (faza odsłony).
 * Lekki player na HTMLAudio. Self-init na import:
 *  - deleguje 'pointerdown' z DOWOLNEGO <button> → klik (bez ruszania pojedynczych handlerów),
 *  - pierwszy klik (gest) odblokowuje audio → późniejsze oklaski (poza gestem) grają.
 * Wyciszenie: localStorage 'bbSfx'='off' (pod przyszły przełącznik) — bez UI na razie. */
const CLICK = './click.wav', CLAP = './clapping.wav';
let click = null, clap = null;
const enabled = () => { try { return localStorage.getItem('bbSfx') !== 'off'; } catch (e) { return true; } };
// iOS: sesja 'ambient' → UI-dźwięki MIKSUJĄ się z muzyką w tle (i milkną przy wyciszeniu dzwonka),
// zamiast pauzować Spotify itp. Grę/zajawkę przełączamy na 'playback' osobno (audio.js/mp.js).
const audioSession = t => { try{ if(navigator.audioSession) navigator.audioSession.type = t; }catch(e){} };
function mk(src, vol){ try { const a = new Audio(src); a.preload = 'auto'; a.volume = vol; return a; } catch (e) { return null; } }
function play(a){ if (!a || !enabled()) return; try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {} }

export function playClick(){ play(click); }
export function playClap(){ play(clap); }

(function initSfx(){
  audioSession('ambient');   // domyślnie: nie przerywaj muzyki w tle przy klikach/oklaskach
  click = mk(CLICK, 0.45); clap = mk(CLAP, 0.8);
  document.addEventListener('pointerdown', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (b && !b.disabled) playClick();
  }, true);
})();
