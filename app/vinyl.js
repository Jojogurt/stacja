/* app/vinyl.js — płyta winylowa = kontrolka odtwarzania (play/pauza) we WSZYSTKICH trybach z dźwiękiem
 * (solo: muzyka, od tyłu, fragment, intro, ABCD, rok, od tyłu krótko, składanka, fortepian, gitara, oś czasu, obroty,
 * lektor; MP: faza „słuchaj"). Zastąpiła okrągłą gałkę (poprawki po testach — wcześniej tylko w trybach obrotów).
 *
 * SVG (vinylSVG): czarna płyta z rowkami + STATYCZNY połysk (połysk się nie kręci — obrót widać po naklejce), naklejka
 * z nadrukiem „?" (NIE okładka — zdradzałaby odpowiedź), ramię gramofonu (opada przy grze, wędruje do środka wg postępu,
 * podnosi się przy pauzie/ładowaniu/błędzie), POSTĘP na obwodzie płyty (złoty łuk — dawny pierścień gałki).
 * Na środku STATYCZNY przycisk z ikoną stanu (▶ / ❚❚ / spinner / ! / ↻) — żeby było widać, że płytę się klika;
 * nie kręci się z płytą (czytelny także w trakcie gry). Decyzja „?" vs ikona: „?" zostaje na naklejce (nad ikoną),
 * ikona w kółku na środku (zamiast otworu na trzpień).
 *
 * Stany (data-state): idle · playing · paused · loading · error. Ładowanie = płyta stoi, ramię uniesione, spinner
 * (wyjątek: ładowanie W TRAKCIE gry — np. „szybciej" w obrotach — płyta kręci się dalej, bez szarpnięcia).
 * Prędkość obrotu ∝ tempo (core/timing.vinylTurnSecs: 1.0× ≈ 1,8 s/obrót, 0.6× → 3 s, 1.5× → 1,2 s). Zmiana tempa /
 * start po pauzie zaczyna od BIEŻĄCEGO kąta (macierz z getComputedStyle → `--vn-a0`). Pauza = płynne wyhamowanie.
 * Odsłona: naklejka → okładka albumu, ikona ▶ = „odtwórz oryginał", 1.0×. prefers-reduced-motion → płyta stoi
 * (klasa `still`), ramię bez animacji. Dostępność: role=button, tabindex=0, aria-label wg stanu, Enter/Spacja.
 *
 * Instancje (createVinyl) szukają elementów PO id przy każdej operacji — MP przebudowuje DOM (innerHTML), więc
 * po renderze wołający robi prepare()/refresh(). Solo: płyta słucha ikony gałki (app/dom.onKnob/onRing — jedno
 * źródło prawdy dla wszystkich torów audio: trwały <audio>, WebAudio, lektor). */
import { vinylTurnSecs } from '../core/timing.js';
import { onKnob, onRing } from './dom.js';

const BRAKE_S = 0.9;                 // czas wyhamowania (s)
// ikony środka (24×24, fill currentColor) — także dla MP (#mpKnobIcon: testy sprawdzają ścieżkę ↻)
export const VINYL_ICONS = {
  play:  '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
  wait:  '<path class="vn-spin" d="M12 4a8 8 0 1 0 8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  replay:'<path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 16.24 7.76L13 11h7V4z"/>',
  error: '<path d="M10.6 4h2.8l-.5 10h-1.8zM12 16.2a1.8 1.8 0 1 1 0 3.6a1.8 1.8 0 0 1 0-3.6z"/>',
};
const ICON_OF = { idle:'play', paused:'play', playing:'pause', loading:'wait', error:'error' };

function reducedMotion(){
  try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(_e){ return false; }
}
const fmtRate = r => String(Math.round(r*100)/100).replace('.', ',') + '×';

/* markup płyty (bez kontenera). `p` = prefiks id (unikalne gradienty/clipPath — solo i MP mogą być naraz w DOM),
 * `iconId` = id grupy ikony środka (MP: „mpKnobIcon"). */
export function vinylSVG(p='vn', iconId=''){
  const grooves=[40,44,48,52,56,60,64,68,72,76,80,84,88,92].map(r=>`<circle r="${r}"/>`).join('');
  return `<svg viewBox="0 0 240 200" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${p}Body" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#262626"/><stop offset=".72" stop-color="#141414"/><stop offset="1" stop-color="#050505"/></radialGradient>
    <linearGradient id="${p}Sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".18" stop-color="#fff" stop-opacity="0"/><stop offset=".38" stop-color="#fff" stop-opacity=".16"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset=".74" stop-color="#fff" stop-opacity=".09"/><stop offset=".84" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="${p}LabelClip"><circle cx="100" cy="100" r="31"/></clipPath>
  </defs>
  <circle class="vn-platter" cx="100" cy="100" r="99"/>
  <circle class="vn-prog" cx="100" cy="100" r="98" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100" transform="rotate(-90 100 100)"/>
  <g class="vn-disc" id="${p}Disc">
    <circle cx="100" cy="100" r="95" fill="url(#${p}Body)"/>
    <g class="vn-grooves" transform="translate(100 100)">${grooves}</g>
    <circle class="vn-label" cx="100" cy="100" r="31"/>
    <text class="vn-q" x="100" y="87" text-anchor="middle">?</text>
    <circle class="vn-dot" cx="100" cy="122" r="2.4"/>
    <image class="vn-art" id="${p}Art" x="69" y="69" width="62" height="62" clip-path="url(#${p}LabelClip)" preserveAspectRatio="xMidYMid slice" href="" visibility="hidden"/>
  </g>
  <circle class="vn-sheen" cx="100" cy="100" r="95" fill="url(#${p}Sheen)"/>
  <g class="vn-ctl">
    <circle class="vn-ctl-bg" cx="100" cy="100" r="16"/>
    <g class="vn-ic-wrap" transform="translate(90.4 90.4) scale(.8)"><g class="vn-ic"${iconId?` id="${iconId}"`:''}>${VINYL_ICONS.play}</g></g>
  </g>
  <g class="vn-arm">
    <circle class="vn-arm-base" cx="214" cy="28" r="12"/>
    <path class="vn-arm-tube" d="M214 28 L208 92 L168 148"/>
    <rect class="vn-arm-head" x="158" y="142" width="16" height="11" rx="2.5" transform="rotate(-36 166 148)"/>
    <circle class="vn-arm-pivot" cx="214" cy="28" r="4.5"/>
  </g>
</svg>`;
}

/* instancja płyty o id `rootId` (element kontenera z role=button). Stan w zamknięciu; DOM szukany przy każdej operacji. */
export function createVinyl(rootId){
  let rate=1, state='idle', angle=0, prog=0, revealed=false, icon='play';
  // tylko element płyty (MP: #mpKnob bywa też gałką „pilota" — dźwięk u hosta — tej nie ruszamy)
  const root=()=>{ const v=document.getElementById(rootId); return v && v.classList.contains('vinyl') ? v : null; };
  const disc=()=>{ const v=root(); return v ? v.querySelector('.vn-disc') : null; };
  function readAngle(d){
    try{
      const t=getComputedStyle(d).transform;
      const m=t && t.match(/matrix\(([^)]+)\)/);
      if(m){ const [a,b]=m[1].split(',').map(parseFloat); if(Number.isFinite(a) && Number.isFinite(b)) return Math.atan2(b,a)*180/Math.PI; }
    }catch(_e){}
    return angle;
  }
  function label(){
    const rt = rate!==1 ? ` (${fmtRate(rate)})` : '';
    if(state==='playing') return `Pauza — płyta gra${rt}`;
    if(state==='loading') return 'Ładowanie płyty…';
    if(state==='error') return 'Błąd odtwarzania — stuknij, by spróbować ponownie';
    if(revealed) return 'Odtwórz oryginał';
    if(icon==='replay') return 'Odtwórz fragment od nowa';
    return `Odtwórz płytę${rt}`;
  }
  function paintProg(v){
    v.style.setProperty('--vn-prog', String(Math.max(0, Math.min(1, prog))));
    const arc=v.querySelector('.vn-prog'); if(arc) arc.setAttribute('stroke-dashoffset', String(Math.round((1-Math.max(0, Math.min(1, prog)))*1000)/10));
  }
  function sync(){
    const v=root(); if(!v) return;
    v.dataset.state=state;
    v.dataset.rate=String(rate);
    v.style.setProperty('--vn-turn', vinylTurnSecs(rate).toFixed(2)+'s');
    paintProg(v);
    v.classList.toggle('still', reducedMotion());
    v.classList.toggle('arm-down', state==='playing' || (state==='loading' && v.classList.contains('spinning')));
    v.classList.toggle('revealed', revealed && v.classList.contains('has-art'));
    v.setAttribute('aria-pressed', state==='playing' ? 'true' : 'false');
    v.setAttribute('aria-busy', state==='loading' ? 'true' : 'false');
    v.setAttribute('aria-label', label());
    const ic=v.querySelector('.vn-ic');
    if(ic && ic.dataset.icon!==icon){ ic.innerHTML=VINYL_ICONS[icon]||VINYL_ICONS.play; ic.dataset.icon=icon; }
  }
  // (re)start obrotu od bieżącego kąta z bieżącym tempem
  function spin(){
    const v=root(), d=disc(); if(!v || !d) return;
    if(reducedMotion()){ v.classList.remove('spinning'); return; }   // płyta stoi (statyczna)
    if(v.classList.contains('spinning')) angle=readAngle(d);
    d.style.transition='none'; d.style.transform='';
    v.classList.remove('spinning');
    v.style.setProperty('--vn-a0', angle.toFixed(1)+'deg');
    void d.getBoundingClientRect();   // reflow → animacja rusza od nowa (od --vn-a0)
    v.classList.add('spinning');
  }
  // płynne wyhamowanie (ease-out ≈ stałe opóźnienie: droga = v0·T/2)
  function brake(){
    const v=root(), d=disc(); if(!v || !d) return;
    if(!v.classList.contains('spinning')) return;
    angle=readAngle(d);
    v.classList.remove('spinning');
    if(reducedMotion()){ d.style.transform=`rotate(${angle}deg)`; return; }
    d.style.transition='none'; d.style.transform=`rotate(${angle}deg)`;
    void d.getBoundingClientRect();
    angle += (360/vinylTurnSecs(rate)) * BRAKE_S / 2;
    d.style.transition=`transform ${BRAKE_S}s cubic-bezier(.33,.66,.66,1)`;
    d.style.transform=`rotate(${angle.toFixed(1)}deg)`;
    v.classList.add('braking');
    setTimeout(()=>{ const vv=root(); if(vv) vv.classList.remove('braking'); }, BRAKE_S*1000);
  }
  /* stan odtwarzacza: 'playing' | 'paused' | 'loading' | 'idle' | 'error'; opts.icon nadpisuje ikonę (MP: 'replay') */
  function setState(next, opts={}){
    const was=state; state=next;
    icon=opts.icon || ICON_OF[next] || 'play';
    sync();
    if(next===was) return;
    if(next==='playing') spin();
    else if(next==='loading' && was==='playing') { /* ładowanie w trakcie gry — płyta kręci się dalej */ }
    else brake();
  }
  // tryb gałki (dom.setIcon / MP mpSetKnob) → stan płyty
  function fromKnob(mode){
    if(mode==='pause') return setState('playing');
    if(mode==='wait') return setState('loading');
    if(mode==='error') return setState('error');
    if(mode==='replay') return setState('paused', { icon:'replay' });
    return setState(state==='idle' ? 'idle' : 'paused');
  }
  function setProgress(p){ const n=Number(p); prog=Number.isFinite(n) ? n : 0; const v=root(); if(v) paintProg(v); }
  // nowe pytanie: naklejka „?", tempo, płyta stoi, ramię w spoczynku
  function prepare(r=1){
    rate = Number(r)>0 ? Number(r) : 1; revealed=false; prog=0; state='idle'; icon='play';
    const v=root(), d=disc();
    if(v && d && v.classList.contains('spinning')) angle=readAngle(d);
    if(v) v.classList.remove('spinning','braking','revealed','has-art');
    if(d){ d.style.transition='none'; d.style.transform=`rotate(${angle.toFixed(1)}deg)`; }
    const art=v && v.querySelector('.vn-art'); if(art){ art.setAttribute('href',''); art.setAttribute('visibility','hidden'); }
    sync();
  }
  // zmiana tempa (np. „szybciej" 0.6× → 0.75×, odsłona → 1.0×) — gra dalej od bieżącego kąta
  function setRate(r){
    const n=Number(r); if(!(n>0)) return;
    rate=n; sync();
    if(state==='playing') spin();
  }
  // odsłona: naklejka → okładka albumu (bez okładki zostaje „?"), ikona ▶ = oryginał, 1.0×
  function reveal(artUrl, r=1){
    revealed=true;
    const v=root(), art=v && v.querySelector('.vn-art');
    if(art && artUrl){ art.setAttribute('href', artUrl); art.setAttribute('visibility','visible'); }
    if(v) v.classList.toggle('has-art', !!artUrl);
    setRate(r); sync();
  }
  // po przebudowie DOM (MP innerHTML): odtwórz stan na nowym elemencie
  function refresh(){ const v=root(); if(!v) return; sync(); if(state==='playing' && !v.classList.contains('spinning')) spin(); }
  const debug=()=>({ rate, state, angle, prog, revealed, icon, reduced: reducedMotion() });
  return { setState, fromKnob, setProgress, prepare, setRate, reveal, refresh, debug };
}

/* ===== SOLO: #vinyl w index.html (markup wstawiany tu — jedno źródło SVG dla solo i MP) ===== */
export const soloVinyl = createVinyl('vinyl');
(function mountSolo(){
  if(typeof document==='undefined') return;
  const v=document.getElementById('vinyl');
  if(v && !v.querySelector('svg')) v.innerHTML=vinylSVG('vn');
})();
// gałka → płyta: ikona stanu odtwarzacza (app/dom.setIcon) i postęp (setRing)
onKnob(mode=>soloVinyl.fromKnob(mode));
onRing(p=>soloVinyl.setProgress(p));

export const vinylPrepare = r => soloVinyl.prepare(r);
export const vinylRate = r => soloVinyl.setRate(r);
export const vinylReveal = (artUrl, r=1) => soloVinyl.reveal(artUrl, r);

/* ===== MP: płyta w fazie „słuchaj" (app/mp-render.mpVinylHTML; stan z app/mp.js mpSetKnob) ===== */
export const mpVinyl = createVinyl('mpKnob');
// markup kontenera MP: id „mpKnob" (zgodność: wykrywanie fazy słuchaj, delegacja mpKnobTap), ikona #mpKnobIcon
export function mpVinylHTML(){
  return `<div class="vinyl mp-vinyl" id="mpKnob" role="button" tabindex="0" aria-pressed="false" aria-label="Odtwórz płytę" data-state="idle" data-rate="1" onclick="mpKnobTap()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();mpKnobTap()}">${vinylSVG('mpv', 'mpKnobIcon')}</div>`;
}

// do testów (siatka jsdom)
export const _vinylDebug = () => soloVinyl.debug();
