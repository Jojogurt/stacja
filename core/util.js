/* core/util.js — czyste pomocnicze (zero DOM / Web API) */

// Fisher–Yates; nie mutuje wejścia.
export function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

export function escapeHtml(s){
  // 5.1: escapuj też apostrof (') — bez tego wartości wstrzykiwane w atrybuty w '…' potrafiły uciec
  // F1: String() — liczba/obiekt z sieci nie rzuca (falsy → '' jak dotąd)
  return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* F1 (#2) — walidatory wartości z sieci wstawianych w atrybuty (style=/id=) i w stan gry.
 * Wspólne dla serwera (sanityzacja przy `start`) i klienta (render) — jedno źródło reguł. */
export const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;        // tylko kolor hex (bez `red" onmouseover=…`)
export const SLOT_KEY_RE = /^[a-z0-9_]{1,12}$/;       // klucz slotu odpowiedzi (trafia do id="mpProp_<key>")
// kolor z sieci → ten sam, gdy to poprawny hex; inaczej `fallback` (np. teamColor(i))
export function safeColor(c, fallback){ return (typeof c==='string' && COLOR_RE.test(c)) ? c : fallback; }
export function isSlotKey(k){ return typeof k==='string' && SLOT_KEY_RE.test(k); }
// liczba z sieci → bezpieczny tekst do HTML (NaN/obiekt/string z HTML → '0')
export function num(v){ const x=Number(v); return Number.isFinite(x) ? String(x) : '0'; }
// tekst z sieci → string przycięty do `max` (obiekt/liczba nie przejdą jako „nie-string")
export function clipText(v, max){ return (typeof v==='string' ? v : (typeof v==='number' ? String(v) : '')).trim().slice(0, max); }
