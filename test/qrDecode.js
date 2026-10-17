/* test/qrDecode.js — NIEZALEŻNY prosty dekoder QR do testów core/qr.js (P1-16).
 * Celowo napisany osobno od enkodera (własne tablice, BCH przez dzielenie wielomianów, syndromy RS zamiast
 * kodowania): czyta format (maska + poziom), mapę obszarów funkcyjnych, zygzak bitów, zdejmuje maskę,
 * rozplata bloki, SPRAWDZA syndromy Reed-Solomona (każdy blok musi mieć zerowe) i parsuje segment bajtowy.
 * Zakres: wersje 1–10, korekcja M (to, co produkuje enkoder). Zwraca { text, version, mask, ecl } albo rzuca błąd. */

const TOTAL_CW = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const M_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const M_EC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const ALIGN_POS = { 1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30], 6:[6,34], 7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50] };

// reszta z dzielenia wielomianów nad GF(2) (bity jako liczba)
function polyMod(value, gen){
  const gl = gen.toString(2).length;
  let v = value;
  while(v.toString(2).length >= gl) v ^= gen << (v.toString(2).length - gl);
  return v;
}
const formatWord = (data5)=> ((data5 << 10) | polyMod(data5 << 10, 0b10100110111)) ^ 0b101010000010010;
const hamming = (a, b)=>{ let x = a ^ b, c = 0; while(x){ c += x & 1; x >>>= 1; } return c; };

// GF(256) do syndromów
const EXP = [], LOG = [];
{ let x = 1; for(let i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x = (x << 1) ^ (x & 0x80 ? 0x11D : 0); x &= 0xFF; } }
const mul = (a, b)=> (a === 0 || b === 0) ? 0 : EXP[(LOG[a] + LOG[b]) % 255];
function syndromesZero(block, ecLen){
  for(let i = 0; i < ecLen; i++){
    let s = 0; const a = EXP[i];
    for(const c of block) s = mul(s, a) ^ c;   // Horner: wartość wielomianu w α^i
    if(s !== 0) return false;
  }
  return true;
}

const MASK_FN = [
  (i, j)=> (i + j) % 2 === 0, (i)=> i % 2 === 0, (i, j)=> j % 3 === 0, (i, j)=> (i + j) % 3 === 0,
  (i, j)=> ((i >> 1) + Math.floor(j / 3)) % 2 === 0, (i, j)=> ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j)=> (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j)=> (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

export function qrDecode(mat){
  const n = mat.length;
  if(!n || mat.some(r=> r.length !== n)) throw new Error('macierz nie jest kwadratowa');
  const version = (n - 17) / 4;
  if(!Number.isInteger(version) || version < 1 || version > 10) throw new Error('nieobsługiwany rozmiar '+n);
  const g = (r, c)=> mat[r][c] ? 1 : 0;
  // format: kopia 1 (bity 14→0 wzdłuż wiersza 8 i kolumny 8 przy lewym-górnym wzorcu), kopia 2 (prawy-górny/lewy-dolny)
  const seq1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const seq2 = [];
  for(let k = 0; k < 7; k++) seq2.push([n - 1 - k, 8]);
  for(let k = 0; k < 8; k++) seq2.push([8, n - 8 + k]);
  const read = (seq)=> seq.reduce((acc, [r, c])=> (acc << 1) | g(r, c), 0);
  const cand = [read(seq1), read(seq2)];
  let best = null;
  for(let d = 0; d < 32; d++){ const w = formatWord(d); for(const x of cand){ const h = hamming(w, x); if(!best || h < best.h) best = { h, d }; } }
  if(best.h > 3) throw new Error('nieczytelny format');
  const ecl = best.d >> 3, mask = best.d & 7;
  if(ecl !== 0) throw new Error('dekoder testowy obsługuje tylko korekcję M (ecl='+ecl+')');
  // mapa modułów funkcyjnych
  const isF = Array.from({ length: n }, ()=> new Array(n).fill(false));
  const mark = (r0, c0, h, w)=>{ for(let r = r0; r < r0 + h; r++) for(let c = c0; c < c0 + w; c++) if(r >= 0 && c >= 0 && r < n && c < n) isF[r][c] = true; };
  mark(0, 0, 9, 9); mark(0, n - 8, 9, 8); mark(n - 8, 0, 8, 9);   // wzorce + separatory + format
  const ap = ALIGN_POS[version];   // wyrównanie PRZED synchronizacją (środek na linii 6 nie jest „zajęty")
  for(const r of ap) for(const c of ap){ if(isF[r][c]) continue; mark(r - 2, c - 2, 5, 5); }
  mark(6, 0, 1, n); mark(0, 6, n, 1);                               // synchronizacja
  if(version >= 7){ mark(0, n - 11, 6, 3); mark(n - 11, 0, 3, 6); }
  // zygzak
  const bits = [];
  let upward = true;
  for(let col = n - 1; col > 0; col -= 2){
    if(col === 6) col--;
    for(let k = 0; k < n; k++){
      const r = upward ? n - 1 - k : k;
      for(const c of [col, col - 1]){
        if(isF[r][c]) continue;
        bits.push(g(r, c) ^ (MASK_FN[mask](r, c) ? 1 : 0));
      }
    }
    upward = !upward;
  }
  const total = TOTAL_CW[version];
  if(Math.floor(bits.length / 8) !== total) throw new Error('zła liczba słów kodowych: '+bits.length);
  const cw = [];
  for(let i = 0; i < total; i++){ let b = 0; for(let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j]; cw.push(b); }
  // rozplot bloków
  const nb = M_BLOCKS[version], ec = M_EC[version], dataTotal = total - nb * ec;
  const shortLen = Math.floor(dataTotal / nb), longCount = dataTotal % nb;
  const blocks = Array.from({ length: nb }, (_, i)=> ({ len: shortLen + (i >= nb - longCount ? 1 : 0), d: [], e: [] }));
  let p = 0;
  for(let i = 0; i < shortLen + 1; i++) for(const b of blocks) if(i < b.len) b.d.push(cw[p++]);
  for(let i = 0; i < ec; i++) for(const b of blocks) b.e.push(cw[p++]);
  for(const b of blocks) if(!syndromesZero([...b.d, ...b.e], ec)) throw new Error('błąd Reed-Solomona w bloku');
  // parsowanie: tryb bajtowy
  const data = blocks.flatMap(b=> b.d);
  const bs = data.flatMap(b=> [7,6,5,4,3,2,1,0].map(k=> (b >> k) & 1));
  let q = 0; const take = (len)=>{ let v = 0; for(let i = 0; i < len; i++) v = (v << 1) | bs[q++]; return v; };
  const modeInd = take(4);
  if(modeInd !== 4) throw new Error('oczekiwano trybu bajtowego, jest '+modeInd);
  const count = take(version < 10 ? 8 : 16);
  const bytes = []; for(let i = 0; i < count; i++) bytes.push(take(8));
  return { text: Buffer.from(bytes).toString('utf8'), version, mask, ecl };
}
// macierz z wierszy hex (wektory referencyjne CoreImage w test/run.js)
export function matrixFromHex(n, rows){
  return rows.map(h=> [...h].flatMap(ch=> parseInt(ch, 16).toString(2).padStart(4, '0').split('').map(Number)).slice(0, n));
}
