/* core/tvStage.js — logika sceny TV w trybie salonowym (P1-16 „TV jako scena": host = TV, gracze = telefony-piloty).
 * Czysty rdzeń (bez DOM): link do dołączenia, ranking z ruchem miejsc (animacja na TV), statusy graczy w rosterze,
 * podsumowanie drużyny, przyciski sterowania hosta-TV i skróty klawiszowe (Spacja/Enter = dalej, S = pomiń, Esc = wyjście).
 * Widok w app/mp-tv.js. */
import { standings } from './teams.js';

/* ---------- link „dołącz" (QR + tekst) ---------- */
// Parametry deweloperskie, które telefon musi dostać, by trafić do TEGO samego serwera (lokalny Worker, rollback relay).
const KEEP_PARAMS = ['rooms', 'authority'];
// tvJoinUrl({ origin, pathname, search }, code) → `${origin}${pathname}?[rooms=…&]room=KOD` (kod: A–Z0–9, max 8)
export function tvJoinUrl(loc, code){
  const l = loc || {};
  const base = String(l.origin || '') + String(l.pathname || '/');
  const keep = [];
  String(l.search || '').replace(/^\?/, '').split('&').forEach(kv=>{
    if(!kv) return;
    const k = kv.split('=')[0];
    if(KEEP_PARAMS.includes(k) && !keep.some(x=>x.split('=')[0]===k)) keep.push(kv);
  });
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  keep.push('room=' + c);
  return base + '?' + keep.join('&');
}
// tekst linku na ekranie: bez protokołu i parametrów deweloperskich — „kked.github.io/stacja/?room=K7QX"
export function tvJoinLabel(url){
  const s = String(url || '').replace(/^https?:\/\//, '');
  const [path, q = ''] = s.split('?');
  const room = q.split('&').find(kv=>kv.startsWith('room='));
  return path + (room ? '?' + room : '');
}

/* ---------- ranking z ruchem miejsc ---------- */
/* tvRanking(teams, scores, prevOrder, gained) → wiersze { id, name, color, score, place, gained, move, delta }
 * prevOrder: id-ki w kolejności poprzedniego renderu (do wykrycia awansu/spadku); gained: { id: +N za to pytanie }.
 * move: 'up' | 'down' | null; delta: o ile pozycji (indeks listy, nie miejsce — remisy nie „skaczą"). */
export function tvRanking(teams, scores, prevOrder, gained){
  const st = standings((teams || []).map(t=>({ id:t.id, name:t.name, color:t.color })), scores || {});
  const prev = Array.isArray(prevOrder) ? prevOrder : [];
  const g = gained || {};
  return st.rows.map((r, i)=>{
    const was = prev.indexOf(r.id);
    const delta = was < 0 ? 0 : was - i;
    return { ...r, gained: Math.max(0, Number(g[r.id]) || 0), move: delta > 0 ? 'up' : delta < 0 ? 'down' : null, delta: Math.abs(delta) };
  });
}

/* ---------- status gracza w rosterze TV ---------- */
// phase: 'arming' | 'play' | 'reveal' | inna; roster: wynik core/mpReducer.rosterState (idle/type/ans/sure/pass)
const PLAY_ST = {
  idle: { key:'think', label:'myśli' }, type: { key:'type', label:'pisze…' }, ans: { key:'ans', label:'✓ typ' },
  sure: { key:'sure', label:'🟡 pewniak' }, pass: { key:'pass', label:'✋ pas' },
};
export function tvPlayerStatus({ phase, roster, ready, advanced } = {}){
  if(phase === 'arming') return ready ? { key:'ready', label:'✓ gotów' } : { key:'wait', label:'ładuje…' };
  if(phase === 'reveal') return advanced ? { key:'next', label:'✓ dalej' } : { key:'watch', label:'ogląda' };
  if(phase === 'play') return PLAY_ST[roster] || PLAY_ST.idle;
  return { key:'in', label:'w grze' };
}
// statusy członków → podsumowanie drużyny („2/3 z typem", „wszyscy ✓") — czytelne z kanapy i na telefonie gracza
export function tvTeamSummary(keys, phase){
  const ks = Array.isArray(keys) ? keys : [];
  const n = ks.length;
  if(!n) return { done:0, total:0, all:false, label:'—' };
  const doneKeys = phase === 'arming' ? ['ready'] : phase === 'reveal' ? ['next'] : ['ans', 'sure', 'pass'];
  const done = ks.filter(k=>doneKeys.includes(k)).length;
  const all = done === n;
  const word = phase === 'arming' ? 'gotowych' : phase === 'reveal' ? 'dalej' : 'z typem';
  if(n === 1) return { done, total:1, all, label: all ? (phase === 'play' ? '✓ odpowiedź' : '✓') : (phase === 'play' ? 'myśli' : '…') };
  return { done, total:n, all, label: all ? `✓ wszyscy (${n})` : `${done}/${n} ${word}` };
}

/* ---------- sterowanie hosta-TV ---------- */
/* tvControls(ctx) → { next, skip } — każdy { act, label } albo null. Jeden duży „Dalej" (Spacja/Enter) i „Pomiń" (S).
 * ctx: { scene: 'lobby'|'loading'|'arming'|'count'|'listen'|'answer'|'checking'|'reveal'|'waitnext'|'done'|'error',
 *        canStart, armLimit, comp, last, allDone } */
export function tvControls(ctx = {}){
  const c = ctx || {};
  switch(c.scene){
    case 'lobby':   return { next: c.canStart ? { act:'start', label:'▶ START MECZU' } : { act:'setup', label:'⚙ USTAWIENIA MECZU' }, skip:null };
    case 'arming':  return { next:null, skip: c.armLimit ? { act:'skipArm', label:'Pomiń czekanie' } : null };
    // słuchanie: „dalej" = koniec słuchania na TV (muzyka gra tylko tu) → odpowiadanie; telefony i tak piszą od razu
    case 'listen':  return { next: { act:'goComb', label:'DALEJ — KOMBINUJCIE ›' }, skip:null };
    // odpowiadanie: TV NIE zatwierdza (nie gra) — pytanie zamyka się samo (wszyscy odpowiedzieli / koniec czasu) albo gracz zatwierdza na telefonie
    case 'answer':  return { next:null, skip:null };
    // odsłona: TV przechodzi sama, gdy wszystkie telefony klikną „dalej" — przycisk = „pomiń czekanie" (jeden, bez dubla)
    case 'reveal':  return { next: { act:'advance', label: c.last ? 'WYNIK KOŃCOWY →' : 'DALEJ — POMIŃ CZEKANIE ›' }, skip:null };
    case 'waitnext':return { next: { act:'nextQ', label:'NASTĘPNE PYTANIE ›' }, skip:null };
    case 'done':    return { next: { act:'rematch', label:'Jeszcze raz 🔁' }, skip: { act:'newGame', label:'Zmień ustawienia' } };
    case 'error':   return { next: { act:'retry', label:'Spróbuj ponownie' }, skip:null };
    default:        return { next:null, skip:null };
  }
}
/* tvKeyAction(key, ctx) → akcja ('next' akt z tvControls | 'leave' | 'close' | null).
 * ctx: { controls (z tvControls), dialog (otwarte okno — Esc zamyka), typing (fokus w polu tekstowym — ignoruj),
 *        repeat (auto-powtórzenie klawisza — ignoruj, by przytrzymana spacja nie przeskoczyła 3 ekranów) } */
export function tvKeyAction(key, ctx = {}){
  const c = ctx || {};
  if(c.typing || c.repeat) return null;
  const k = String(key || '');
  if(k === 'Escape' || k === 'Esc') return c.dialog ? 'close' : 'leave';
  if(c.dialog) return null;                       // okno potwierdzenia ma własne przyciski (Tab/Enter natywnie)
  const ctl = c.controls || {};
  if(k === ' ' || k === 'Spacebar' || k === 'Enter') return ctl.next ? ctl.next.act : null;
  if(k === 's' || k === 'S') return ctl.skip ? ctl.skip.act : null;
  return null;
}

/* motyw TV: domyślnie CIEMNY (salon wieczorem, kontrast z kanapy); jawny wybór na TV ('light'|'dark') wygrywa */
export function tvTheme(saved){ return saved === 'light' ? 'light' : 'dark'; }
