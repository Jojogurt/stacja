/* core/timing.js — czyste stałe i obliczenia czasowe (zero DOM / Web API).
 * Decyzje „ile sekund / od którego miejsca / czy już wolno wysłać" — testowalne.
 * Efekty (setTimeout, audio.currentTime, broadcast) zostają w app.js. */

export const SNIP_SECS = 2;               // długość odtwarzanego fragmentu (s)
export const SOLO_SNIP_MAX = 28;          // górne okno losowania startu fragmentu (solo)
export const MP_SNIP_WINDOW_S = 16;       // okno losowania startu fragmentu (multiplayer)

// F8a (#1 „Heardle"): tryb „intro" — zajawka odsłaniana etapami OD POCZĄTKU utworu (sekundy na etap).
// Etap 0 = 1 s … etap 4 = 16 s; „+ więcej" przechodzi do następnego i gra od początku do nowej długości.
export const INTRO_STAGES = [1, 2, 4, 8, 16];
export const INTRO_GAP_MS = 3000;          // MP intro: przerwa na typ po każdym etapie (przed następnym, dłuższym)
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

/* EKSPERYMENT: „okładka" (cover) — okładka albumu odsłaniana etapami rozdzielczości (bloki na bok).
 * Auto-odsłona co COVER_STEP_MS albo przycisk „wyraźniej". Mnożnik punktów: core/scoring.coverMult (COVER_MULTS).
 * Poprawki po testach: etap 8×8 usunięty (praktycznie nie do zgadnięcia) — start od 16×16; etap trwa 6 s (było 3 s).
 * Dług z TODO: pełna okładka często pokazuje nazwę zespołu → w trakcie zgadywania TYLKO 16 → 32 → 64 bloki; PEŁNA
 * okładka wyłącznie w odsłonie (solo po „Sprawdź"/pominięciu, MP w REVEAL — coverFullUrl). */
export const COVER_STAGES = [16, 32, 64];
export const COVER_STEP_MS = 6000;
// bloki etapu — przycinane do [0..ostatni] (NIGDY pełna: ta tylko w odsłonie); śmieci → etap 0
export function coverStageBlocks(stage){
  const i = Math.floor(Number(stage));
  return COVER_STAGES[Number.isFinite(i) ? Math.max(0, Math.min(COVER_STAGES.length-1, i)) : 0];
}
export function coverNextStage(stage){
  const i = Math.max(0, Math.floor(Number(stage)) || 0);
  return i+1 < COVER_STAGES.length ? i+1 : null;
}
// czas od startu odsłony do OSTATNIEGO etapu (64×64) — MP: okno „patrz" przed czasem na odpowiedź
export const coverRevealMs = (stepMs = COVER_STEP_MS) => (COVER_STAGES.length-1) * Math.max(0, Number(stepMs) || 0);

/* ===== MP (serwer-autorytet): ETAPY ODSŁONY prowadzone przez serwer, wspólne dla wszystkich (okładka, intro) =====
 * Harmonogram = `offsets[k]` (ms od startu odsłony = playAt + LEAD do początku etapu k; offsets[0] = 0, niemalejące).
 * W stanie gry serwer trzyma RZECZYWISTE starty etapów `stageStarts` (epoch ms): minione są faktyczne, przyszłe —
 * planowane; „+ więcej"/„wyraźniej" (stageShift) przesuwa przyszłe od bieżącej chwili. Etap w chwili t = stageIndexAt
 * (mnożnik „na którym etapie padła odpowiedź" w core/mpReducer liczy się z tych samych startów, więc przesunięcia są
 * uwzględnione). Funkcje offsetowe (stageAt/stageStartsAt) = harmonogram bez przesunięć. */
export function stageAt({ playAt, now, leadMs = MP_INTRO_MS, offsets } = {}){
  return stageIndexAt(stageStartsFrom({ playAt, leadMs, offsets }), now);
}
// epoch ms początku etapu `stage` wg offsetów (null = brak takiego etapu / śmieci)
export function stageStartsAt({ playAt, stage, leadMs = MP_INTRO_MS, offsets } = {}){
  const k = Math.floor(Number(stage)), st = stageStartsFrom({ playAt, leadMs, offsets });
  return Number.isInteger(k) && k >= 0 && k < st.length ? st[k] : null;
}
// starty etapów (epoch ms) z harmonogramu; śmieci → []
export function stageStartsFrom({ playAt, leadMs = MP_INTRO_MS, offsets } = {}){
  const t0 = Number(playAt), offs = Array.isArray(offsets) && offsets.length ? offsets.map(Number) : [0];
  if(!Number.isFinite(t0) || !offs.every(Number.isFinite)) return [];
  const base = t0 + Math.max(0, Number(leadMs) || 0);
  return offs.map(o => base + o);
}
// etap w chwili t: ostatni k ze starts[k] ≤ t (przed startem 0. etapu → 0); bez startów → 0
export function stageIndexAt(starts, t){
  const st = Array.isArray(starts) ? starts.map(Number) : [], x = Number(t);
  if(!Number.isFinite(x)) return 0;
  let k = 0;
  for(let i = 1; i < st.length; i++){ if(Number.isFinite(st[i]) && x >= st[i]) k = i; else break; }
  return k;
}
/* „+ więcej" / „wyraźniej": następny etap (k+1) startuje TERAZ, kolejne przesunięte o tyle samo (odstępy zachowane).
 * null = nie wolno (ostatni etap, bieżący etap jeszcze nie ruszył, następny i tak już trwa, śmieci).
 * → { starts (nowa tablica), stage: k+1, shift (ms, o ile wcześniej) } */
export function stageShift(starts, stage, now){
  const st = Array.isArray(starts) ? starts.map(Number) : [], k = Math.floor(Number(stage)), t = Number(now);
  if(!Number.isInteger(k) || k < 0 || k+1 >= st.length || !Number.isFinite(t) || !st.every(Number.isFinite)) return null;
  if(t < st[k] || st[k+1] <= t) return null;
  const shift = st[k+1] - t;
  return { starts: st.map((x, i) => i > k ? x - shift : x), stage: k+1, shift };
}
// okładka: etap k od k × stepMs po starcie odsłony
export const coverStageOffsets = (stepMs = COVER_STEP_MS) => COVER_STAGES.map((_, k) => k * Math.max(0, Number(stepMs) || 0));
export function mpCoverStageAt(playAt, now, leadMs = MP_INTRO_MS, stepMs = COVER_STEP_MS){
  return stageAt({ playAt, now, leadMs, offsets: coverStageOffsets(stepMs) });
}
export function mpCoverStageStartsAt(playAt, stage, leadMs = MP_INTRO_MS, stepMs = COVER_STEP_MS){
  return stageStartsAt({ playAt, stage, leadMs, offsets: coverStageOffsets(stepMs) });
}
/* MP intro: etap k gra [0, INTRO_STAGES[k]] s zajawki, potem przerwa INTRO_GAP_MS na typ, potem etap k+1 (od początku,
 * dłużej). offsets[k+1] = offsets[k] + INTRO_STAGES[k]·unit + gap. `unitMs` (ms na „sekundę" etapu) — tylko testy serwera. */
export function introStageOffsets(gapMs = INTRO_GAP_MS, unitMs = 1000){
  const g = Math.max(0, Number(gapMs) || 0), u = Math.max(0, Number(unitMs) || 0), out = [0];
  for(let k = 0; k+1 < INTRO_STAGES.length; k++) out.push(out[k] + INTRO_STAGES[k]*u + g);
  return out;
}
// koniec ostatniego etapu (16 s) od startu odsłony — MP: okno „słuchaj" przed czasem na odpowiedź
export function introRevealMs(gapMs = INTRO_GAP_MS, unitMs = 1000){
  const o = introStageOffsets(gapMs, unitMs);
  return o[o.length-1] + INTRO_STAGES[INTRO_STAGES.length-1] * Math.max(0, Number(unitMs) || 0);
}
/* anty-podglądanie: URL obrazu w rozdzielczości ETAPU (klient nie dostaje pełnej okładki w trakcie zgadywania).
 * iTunes (mzstatic): „…/600x600bb.jpg" → „…/16x16bb.jpg"; Deezer (dzcdn): „/images/cover/<hash>/250x250-000000-80-0-0.jpg"
 * → „…/16x16-000000-80-0-0.jpg". Etap przycinany do 16/32/64 — NIGDY pełny. Nieznany format → '' (serwer gra wtedy
 * pytanie jak „muzyka"). Pełna okładka (odsłona) → coverFullUrl: COVER_FULL_PX dla znanych CDN, inaczej oryginał. Tylko https. */
export const COVER_FULL_PX = 600;
const COVER_ITUNES = /^(https:\/\/[a-z0-9.-]*mzstatic\.com\/.+\/)\d+x\d+(\w*)(\.[a-z]+)$/i;
const COVER_DEEZER = /^(https:\/\/[a-z0-9.-]*dzcdn\.net\/images\/cover\/[0-9a-f]+\/)\d+x\d+((?:-[0-9a-z]+)*)(\.[a-z]+)$/i;
function coverSized(art, px){
  const u = String(art || '');
  if(!/^https:\/\//.test(u) || u.length > 500) return null;
  let m = u.match(COVER_ITUNES);
  if(m) return `${m[1]}${px}x${px}${m[2] || 'bb'}${m[3]}`;
  m = u.match(COVER_DEEZER);
  if(m) return `${m[1]}${px}x${px}${m[2]}${m[3]}`;
  return '';
}
export function coverStageUrl(art, stage){ return coverSized(art, coverStageBlocks(stage)) || ''; }
export function coverFullUrl(art){
  const r = coverSized(art, COVER_FULL_PX);
  return r === null ? '' : (r || String(art));
}
// czy okładkę da się odsłaniać etapami bez wycieku (znany CDN)
export const coverStageable = (art) => !!coverStageUrl(art, 0);

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
export const LISTEN_SECS = { lektor:22, music:15, reverse:15, snippet:12, intro:introRevealMs()/1000, abcd:15, year:15, revsnip:12, medley:18, cover:coverRevealMs()/1000, slowmo:18, fastmo:12, timeline:15 };

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

/* ===== P1-2 (przegląd MP 2026-10): semantyka czasu pytania MP =====
 * Dawniej `endsAt = go + timer`, a słuchanie (15–22 s) zjadało czas na odpowiedź. Teraz autorytet liczy:
 *   listenEndsAt = playAt + LEAD (intro, równy start) + listenMs,   endsAt = listenEndsAt + timer.
 * „30 s na odpowiedź" = 30 s PO słuchaniu. Czyste — serwer, host relay i testy liczą tak samo. */
export const MP_ALL_DONE_GRACE_MS = 1500;   // P1-3: wszyscy obecni mają typ/pas → zamknięcie pytania po tej karencji
export function phaseDeadlines({ playAt, leadMs = MP_INTRO_MS, listenMs = 15000, timerS = 0 } = {}){
  const t0 = Number(playAt);
  if(!Number.isFinite(t0)) return { listenEndsAt:null, endsAt:null };
  const lead = Math.max(0, Number(leadMs) || 0), listen = Math.max(0, Number(listenMs) || 0);
  const listenEndsAt = t0 + lead + listen;
  const tm = clampTimer(timerS);
  return { listenEndsAt, endsAt: tm > 0 ? listenEndsAt + tm*1000 : null };
}
/* P0-7: ile ms okna „słuchaj" zostało TEMU klientowi (powrót/odświeżenie w trakcie pytania nie daje pełnych 15 s).
 * nowy serwer → do listenEndsAt; stary (tylko endsAt) → min(listenMs, endsAt−now); bez terminów → pełne okno.
 * Zostało < minMs (5 s) → 0 = od razu „kombinuj" (nie ma sensu odpalać zajawki na 3 s). `now` w czasie SERWERA. */
export const LISTEN_MIN_LEFT_MS = 5000;
export function listenWindowMs({ listenMs, listenEndsAt, endsAt, now, minMs = LISTEN_MIN_LEFT_MS } = {}){
  const full = Math.max(0, Number(listenMs) || 0);
  let rem = full;
  if(Number.isFinite(Number(listenEndsAt)) && listenEndsAt) rem = Number(listenEndsAt) - now;
  else if(Number.isFinite(Number(endsAt)) && endsAt) rem = Math.min(full, Number(endsAt) - now);
  rem = Math.max(0, Math.min(full, rem));
  return rem < minMs ? 0 : Math.round(rem);
}
/* P1-2: przesunięcie zegara klienta względem serwera (anty-skew). Próbka = serverNow − czas odbioru (lokalny);
 * opóźnienie sieci tylko ZANIŻA próbkę, więc najlepsze oszacowanie = maksimum z ostatnich próbek. [] → 0. */
export const CLOCK_SAMPLES_MAX = 8;
export function clockOffset(samples){
  const xs = (Array.isArray(samples) ? samples : []).map(Number).filter(Number.isFinite).slice(-CLOCK_SAMPLES_MAX);
  return xs.length ? Math.max(...xs) : 0;
}
// dopisz próbkę (ring-buffer CLOCK_SAMPLES_MAX); zwraca nową tablicę
export function addClockSample(samples, serverNow, localNow){
  const s = Number(serverNow), l = Number(localNow);
  const arr = Array.isArray(samples) ? samples.slice() : [];
  if(Number.isFinite(s) && s > 0 && Number.isFinite(l)) arr.push(s - l);
  return arr.slice(-CLOCK_SAMPLES_MAX);
}
// zegar w nagłówku: „0:12" (m:ss) — zawsze z minutami, żeby szerokość się nie zmieniała
export function fmtClock(ms){
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}
/* P1-2: JEDEN zegar bieżącej fazy w nagłówku. sub = lokalna pod-faza ('sluchaj'|'kombinuj'); listenEnd (lokalny ms
 * końca okna słuchania; 0 = brak), endsAt (lokalny ms końca pytania; null = bez limitu). Słuchanie → 🎧 do końca okna,
 * potem/„kombinujemy" → 🧠 do końca pytania. low = ostatnie 5 s (czerwień tylko wtedy). null = nic do pokazania. */
export function phaseClock({ sub, listenEnd, endsAt, now }){
  if(sub === 'sluchaj' && listenEnd > now) return { phase:'sluchaj', icon:'🎧', ms: listenEnd - now, low:false };
  if(endsAt && Number.isFinite(Number(endsAt))){
    const ms = Math.max(0, Number(endsAt) - now);
    return { phase:'kombinuj', icon:'🧠', ms, low: ms <= TICK_LAST_S*1000 };
  }
  return null;
}
/* P1-1 (przegląd MP 2026-10): karta pytania — odliczanie 3-2-1 w LEAD liczone od playAt SERWERA (nie od odbioru stanu),
 * więc cyfry i start audio są równe u wszystkich. Lokalny koniec intra = playAt − offset zegara + LEAD, przycięty do
 * [now, now+LEAD] (spóźniony odbiór skraca odliczanie; powrót w trakcie pytania → 0 = bez karty). Bez zegara serwera
 * (stary serwer bez serverNow / relay) → jak dawniej: now + LEAD. LEAD bez zmian (MP_INTRO_MS) — budżet czasu ten sam. */
export const MP_COUNT_STEPS = 3;
export function introEndLocal({ playAt, clockOff = 0, serverClock = false, now, leadMs = MP_INTRO_MS } = {}){
  const lead = Math.max(0, Number(leadMs) || 0), n = Number(now) || 0;
  const t = Number(playAt);
  if(!serverClock || !Number.isFinite(t) || t <= 0) return n + lead;
  const end = t - (Number(clockOff) || 0) + lead;
  return Math.max(n, Math.min(n + lead, end));
}
// cyfra odliczania (3 → 2 → 1) dla pozostałego czasu intra; 0 = start (koniec odliczania)
export function introDigit(remMs, leadMs = MP_INTRO_MS, steps = MP_COUNT_STEPS){
  const r = Number(remMs);
  if(!(r > 0)) return 0;
  const step = Math.max(1, (Number(leadMs) || 0) / steps);
  return Math.min(steps, Math.max(1, Math.ceil(r / step)));
}
/* P1-10: Solo/Drużyny — „Zakończ pytanie" hosta dopiero po połowie czasu pytania (host jest też graczem — nie
 * kończy „w ciemno" przed innymi). Bez limitu czasu → od razu (inaczej AFK zablokowałby stół; P1-3 domyka resztę). */
export function hostEndVisible({ playAt, endsAt, now }){
  const a = Number(playAt), e = Number(endsAt);
  if(!e || !Number.isFinite(e) || !Number.isFinite(a) || e <= a) return true;
  return now >= a + (e - a) / 2;
}
