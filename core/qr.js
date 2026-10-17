/* core/qr.js — własny enkoder kodów QR (P1-16 „TV jako scena": QR do dołączenia na lobby i w rogu TV).
 * Czysty rdzeń: bez DOM / Web API / zależności — tekst → macierz modułów (+ ścieżka SVG jako string).
 * Zakres celowo wąski: tryb BAJTOWY (UTF-8), korekcja M, wersje 1–10 (do 213 bajtów — link do pokoju ma ~30–70).
 * Algorytm wg ISO/IEC 18004: kodowanie → Reed-Solomon GF(256) → przeplot bloków → wzorce funkcyjne → zygzak danych
 * → wybór maski (kary N1–N4) → informacja o formacie (BCH 15,5) i wersji (BCH 18,6; od v7).
 * Test: test/run.js dekoduje wynik NIEZALEŻNYM dekoderem (z weryfikacją syndromów RS) i porównuje z referencją
 * wygenerowaną przez CoreImage (CIQRCodeGenerator, macOS). */

// tablice dla korekcji M, indeks = wersja: [kodowe słowa EC na blok, [[liczba bloków, słowa danych w bloku], …]]
const EC_M = [null,
  [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
  [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]],
];
// środki wzorców wyrównania (v1 — brak)
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const QR_MAX_VERSION = 10;
const ECL_M_BITS = 0;   // bity poziomu korekcji w informacji o formacie: L=01, M=00, Q=11, H=10

/* ---------- GF(256), wielomian 0x11D ---------- */
const EXP = new Array(512), LOG = new Array(256);
(()=>{ let x = 1; for(let i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if(x & 0x100) x ^= 0x11D; } for(let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b)=> (a && b) ? EXP[LOG[a] + LOG[b]] : 0;
// wielomian generatora stopnia n: ∏ (x − α^i), i = 0..n−1 (współczynniki od najwyższej potęgi, bez wiodącej 1)
function rsGenerator(n){
  let g = [1];
  for(let i = 0; i < n; i++){
    const next = new Array(g.length + 1).fill(0);
    for(let j = 0; j < g.length; j++){ next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
    g = next;
  }
  return g.slice(1);
}
export function rsEncode(data, n){
  const gen = rsGenerator(n), rem = new Array(n).fill(0);
  for(const d of data){
    const f = d ^ rem.shift(); rem.push(0);
    for(let i = 0; i < n; i++) rem[i] ^= gmul(gen[i], f);
  }
  return rem;
}

/* ---------- UTF-8 bez TextEncoder (rdzeń bez Web API) ---------- */
export function utf8Bytes(str){
  const out = [];
  for(const ch of String(str)){
    const c = ch.codePointAt(0);
    if(c < 0x80) out.push(c);
    else if(c < 0x800) out.push(0xC0 | c >> 6, 0x80 | c & 63);
    else if(c < 0x10000) out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    else out.push(0xF0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
  }
  return out;
}

export const qrSize = (v)=> 17 + 4 * v;
const dataCodewords = (v)=> EC_M[v][1].reduce((s, [n, k])=> s + n * k, 0);
// pojemność w bajtach (tryb bajtowy, M): 4 bity trybu + licznik 8 (v1–9) / 16 (v10) bitów
export function qrCapacity(v){ return Math.floor((dataCodewords(v) * 8 - 4 - (v < 10 ? 8 : 16)) / 8); }

/* ---------- strumień bitów → słowa kodowe (dane + EC, przeplot) ---------- */
function buildCodewords(bytes, v){
  const bits = [];
  const put = (val, len)=>{ for(let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, v < 10 ? 8 : 16);
  for(const b of bytes) put(b, 8);
  const cap = dataCodewords(v) * 8;
  put(0, Math.min(4, cap - bits.length));        // terminator
  while(bits.length % 8) bits.push(0);
  const data = [];
  for(let i = 0; i < bits.length; i += 8){ let b = 0; for(let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
  for(let pad = 0xEC; data.length < cap / 8; pad ^= 0xEC ^ 0x11) data.push(pad);
  // bloki (krótsze najpierw), EC per blok, przeplot: dane kolumnami, potem EC kolumnami
  const [ecLen, groups] = EC_M[v];
  const blocks = []; let k = 0;
  for(const [n, len] of groups) for(let i = 0; i < n; i++){ const d = data.slice(k, k + len); k += len; blocks.push({ d, e: rsEncode(d, ecLen) }); }
  const out = [], maxD = Math.max(...blocks.map(b=>b.d.length));
  for(let i = 0; i < maxD; i++) for(const b of blocks) if(i < b.d.length) out.push(b.d[i]);
  for(let i = 0; i < ecLen; i++) for(const b of blocks) out.push(b.e[i]);
  return out;
}

/* ---------- BCH: format (15,5) i wersja (18,6) ---------- */
export function formatBits(mask, ecl = ECL_M_BITS){
  const d = (ecl << 3) | mask; let r = d;
  for(let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((d << 10) | r) ^ 0x5412;
}
export function versionBits(v){
  let r = v;
  for(let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
  return (v << 12) | r;
}

const MASKS = [
  (r, c)=> (r + c) % 2 === 0, (r)=> r % 2 === 0, (r, c)=> c % 3 === 0, (r, c)=> (r + c) % 3 === 0,
  (r, c)=> (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c)=> (r * c) % 2 + (r * c) % 3 === 0,
  (r, c)=> ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c)=> ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

/* ---------- szablon: wzorce funkcyjne (bez danych i formatu) ---------- */
function template(v){
  const n = qrSize(v);
  const m = Array.from({ length: n }, ()=> new Array(n).fill(0));
  const fn = Array.from({ length: n }, ()=> new Array(n).fill(false));
  const set = (r, c, dark)=>{ if(r >= 0 && c >= 0 && r < n && c < n){ m[r][c] = dark ? 1 : 0; fn[r][c] = true; } };
  // wzorce wyszukiwania 7×7 + separator (pierścień jasny wokół)
  for(const [R, C] of [[0, 0], [0, n - 7], [n - 7, 0]])
    for(let dr = -1; dr <= 7; dr++) for(let dc = -1; dc <= 7; dc++){
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      set(R + dr, C + dc, ring !== 2 && ring !== 4);
    }
  // linie synchronizacji
  for(let i = 8; i < n - 8; i++){ set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // wyrównanie (pomijamy te, które nachodzą na wzorce wyszukiwania)
  const al = ALIGN[v];
  for(const r of al) for(const c of al){
    if((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
    for(let dr = -2; dr <= 2; dr++) for(let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  // rezerwacja obszarów formatu (wypełniane później) + ciemny moduł
  for(let i = 0; i < 9; i++) if(i !== 6){ set(8, i, false); set(i, 8, false); }   // (6,8)/(8,6) = synchronizacja
  for(let i = 0; i < 8; i++){ set(8, n - 1 - i, false); set(n - 1 - i, 8, false); }
  set(n - 8, 8, true);
  // informacja o wersji (v ≥ 7): bloki 6×3 przy wzorcach prawym-górnym i lewym-dolnym
  if(v >= 7){
    const vb = versionBits(v);
    for(let i = 0; i < 18; i++){ const bit = (vb >>> i) & 1, a = n - 11 + i % 3, b = Math.floor(i / 3); set(b, a, bit); set(a, b, bit); }
  }
  return { n, m, fn };
}
function drawFormat(m, n, mask){
  const f = formatBits(mask), bit = (i)=> (f >>> i) & 1;
  // kopia 1 — wokół lewego-górnego wzorca
  for(let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
  for(let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
  // kopia 2 — przy prawym-górnym i lewym-dolnym
  for(let i = 0; i < 8; i++) m[8][n - 1 - i] = bit(i);
  for(let i = 8; i < 15; i++) m[n - 15 + i][8] = bit(i);
  m[n - 8][8] = 1;
}
// zygzak: pary kolumn od prawej, naprzemiennie w górę i w dół; kolumna 6 (synchronizacja) pominięta
function drawData(m, fn, n, cw){
  let i = 0; const total = cw.length * 8;
  for(let right = n - 1; right >= 1; right -= 2){
    if(right === 6) right = 5;
    const up = ((right + 1) & 2) === 0;
    for(let vert = 0; vert < n; vert++) for(let j = 0; j < 2; j++){
      const c = right - j, r = up ? n - 1 - vert : vert;
      if(fn[r][c]) continue;
      m[r][c] = i < total ? (cw[i >> 3] >>> (7 - (i & 7))) & 1 : 0;   // bity resztowe = 0
      i++;
    }
  }
}
function applyMask(m, fn, n, k){ const f = MASKS[k]; for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) if(!fn[r][c] && f(r, c)) m[r][c] ^= 1; }

/* ---------- kara maski (N1 serie ≥5, N2 bloki 2×2, N3 wzorzec 1:1:3:1:1 z 4 jasnymi, N4 proporcja ciemnych) ---------- */
export function qrPenalty(m){
  const n = m.length; let p = 0;
  const line = (get)=>{
    let run = 1;
    for(let i = 1; i <= n; i++){
      if(i < n && get(i) === get(i - 1)) run++;
      else { if(run >= 5) p += 3 + run - 5; run = 1; }
    }
    // N3: 1011101 z czterema jasnymi z jednej strony (poza macierzą = jasne, jak strefa ciszy)
    const at = (i)=> (i < 0 || i >= n) ? 0 : get(i);
    for(let i = -4; i < n; i++){
      const core = at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6);
      if(!core) continue;
      const before = !at(i - 1) && !at(i - 2) && !at(i - 3) && !at(i - 4);
      const after = !at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10);
      if(before || after) p += 40;
    }
  };
  for(let r = 0; r < n; r++) line((i)=> m[r][i]);
  for(let c = 0; c < n; c++) line((i)=> m[i][c]);
  for(let r = 0; r < n - 1; r++) for(let c = 0; c < n - 1; c++){
    const v = m[r][c]; if(v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
  }
  let dark = 0; for(const row of m) for(const x of row) dark += x;
  p += 10 * Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5);
  return p;
}

/* qrEncode(text, { minVersion, mask }) → { version, size, mask, modules: number[][] (1 = ciemny) } albo null (za długi).
 * mask (0–7) wymusza maskę (testy porównawcze z referencją); domyślnie najniższa kara. */
export function qrEncode(text, { minVersion = 1, mask = null } = {}){
  const bytes = utf8Bytes(text);
  let v = Math.max(1, Math.min(QR_MAX_VERSION, Number(minVersion) || 1));
  while(v <= QR_MAX_VERSION && qrCapacity(v) < bytes.length) v++;
  if(v > QR_MAX_VERSION) return null;
  const cw = buildCodewords(bytes, v);
  const { n, m: base, fn } = template(v);
  drawData(base, fn, n, cw);
  let best = null;
  const masks = Number.isInteger(mask) && mask >= 0 && mask < 8 ? [mask] : [0, 1, 2, 3, 4, 5, 6, 7];
  for(const k of masks){
    const m = base.map(row=> row.slice());
    applyMask(m, fn, n, k); drawFormat(m, n, k);
    const pen = masks.length > 1 ? qrPenalty(m) : 0;
    if(!best || pen < best.pen) best = { pen, k, m };
  }
  return { version: v, size: n, mask: best.k, modules: best.m };
}

/* ścieżka SVG (jeden <path>, moduł = 1 jednostka, strefa ciszy `margin`) — poziome odcinki łączone w prostokąty.
 * Zwraca { d, dim } — wołający składa <svg viewBox="0 0 dim dim"><path d="…"/></svg> (shape-rendering crispEdges). */
export function qrSvgPath(qr, margin = 4){
  if(!qr || !qr.modules) return { d: '', dim: 0 };
  const n = qr.size, parts = [];
  for(let r = 0; r < n; r++){
    let c = 0;
    while(c < n){
      if(!qr.modules[r][c]){ c++; continue; }
      let e = c; while(e < n && qr.modules[r][e]) e++;
      parts.push(`M${c + margin} ${r + margin}h${e - c}v1h${c - e}z`);
      c = e;
    }
  }
  return { d: parts.join(''), dim: n + 2 * margin };
}
