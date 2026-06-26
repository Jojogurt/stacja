/* test/data.js — walidacja zestawów pytań w data/quiz-*.json (i manifestu).
 * Tanio (samo JSON.parse + sprawdzenia struktury) — odpala się z `npm test`, nie „non stop".
 * Sens: złapać literówkę/niespójność PRZY dodawaniu/edycji kategorii, zanim trafi do gracza.
 *
 * Sprawdza per plik: poprawny kształt (kind:'quiz', label, questions[]), każdy slot ma niepustą
 * listę wariantów, klucze answers ⊆ slotów, brak duplikatów promptów. Dla pytań ABCD: dokładnie
 * 4 opcje A–D, answers.a[0] to litera, a opcja tej litery == answers.a[1] (spójność litera↔opcja). */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (f) => readFileSync(join(DATA, f), 'utf8');

// znormalizuj do porównania litera↔opcja (bez diakrytyków, spacji i znaków — sam rdzeń)
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '');

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) pass++; else { fail++; fails.push(msg); } };

const files = readdirSync(DATA).filter(f => /^quiz-.*\.json$/.test(f) && f !== 'quiz-index.json').sort();

let totalQ = 0, totalMC = 0;
for (const f of files) {
  let j;
  try { j = JSON.parse(read(f)); } catch (e) { ok(false, `${f}: nie-parsowalny JSON — ${e.message}`); continue; }
  ok(j && j.kind === 'quiz', `${f}: kind === 'quiz'`);
  ok(j && typeof j.label === 'string' && j.label.trim(), `${f}: niepuste label`);
  ok(Array.isArray(j.questions) && j.questions.length > 0, `${f}: niepusta tablica questions`);
  if (!Array.isArray(j.questions)) continue;

  const seen = new Set();
  j.questions.forEach((q, i) => {
    const at = `${f} q${i + 1}`;
    totalQ++;
    ok(q && typeof q.prompt === 'string' && q.prompt.trim(), `${at}: niepusty prompt`);
    ok(Array.isArray(q.slots) && q.slots.length > 0, `${at}: ma sloty`);
    const key = norm((q.prompt || '').split('\n')[0]);
    ok(!seen.has(key), `${at}: duplikat pytania`); seen.add(key);
    if (!Array.isArray(q.slots)) return;

    const ans = q.answers || {};
    for (const s of q.slots) {
      ok(s && typeof s.key === 'string' && s.key, `${at}: slot ma key`);
      const a = ans[s.key];
      ok(Array.isArray(a) && a.length > 0 && a.every(x => typeof x === 'string' && x.trim()),
        `${at}: answers[${s && s.key}] = niepusta lista niepustych wariantów`);
    }
    for (const k of Object.keys(ans)) ok(q.slots.some(s => s.key === k), `${at}: answers[${k}] ma odpowiadający slot`);

    // ABCD (multiple-choice): prompt zawiera linie "A) ... D) ..."
    if (/\nA\)/.test(q.prompt)) {
      totalMC++;
      ok(q.slots.length === 1 && q.slots[0].key === 'a', `${at}: ABCD ma pojedynczy slot 'a'`);
      const opts = {};
      q.prompt.split('\n').forEach(l => { const m = l.match(/^([ABCD])\)\s*(.+?)\s*$/); if (m) opts[m[1]] = m[2]; });
      const present = Object.keys(opts).sort().join('');
      // 2–4 opcji, ciągły zestaw od A (A,B[,C[,D]]) — na przyszłość dopuszczone też 3 odpowiedzi
      ok(present.length >= 2 && present === 'ABCD'.slice(0, present.length), `${at}: 2–4 opcje od A (jest: ${present || 'brak'})`);
      const uniq = new Set(Object.values(opts).map(norm));
      ok(uniq.size === Object.keys(opts).length, `${at}: opcje nie są duplikatami`);
      const a = (ans.a || []);
      const letter = a[0];
      ok(/^[ABCD]$/.test(letter), `${at}: answers.a[0] to litera A–D (jest: ${JSON.stringify(letter)})`);
      if (/^[ABCD]$/.test(letter) && opts[letter] != null && a[1] != null) {
        const o = norm(opts[letter]), t = norm(a[1]);
        ok(o === t || o.includes(t) || t.includes(o), `${at}: litera ${letter}="${opts[letter]}" zgodna z odpowiedzią "${a[1]}"`);
      }
    }
  });
}

// manifest: każdy plik z files[] istnieje i jest realnym zestawem quizu
try {
  const idx = JSON.parse(read('quiz-index.json'));
  const list = Array.isArray(idx) ? idx : (idx && idx.files) || [];
  ok(Array.isArray(list) && list.length > 0, 'quiz-index.json: niepusta lista files[]');
  for (const f of list) ok(files.includes(f), `quiz-index.json: „${f}" istnieje w data/`);
} catch (e) { ok(false, `quiz-index.json: ${e.message}`); }

console.log(`data: ${files.length} plików, ${totalQ} pytań (${totalMC} ABCD)`);
if (fail) {
  console.log(`\n❌ ${fail} błędów (z ${pass + fail} sprawdzeń):`);
  for (const m of fails.slice(0, 40)) console.log('  • ' + m);
  if (fails.length > 40) console.log(`  …i ${fails.length - 40} więcej`);
  process.exit(1);
}
console.log(`✅ dane: ${pass} sprawdzeń przeszło, 0 nie przeszło`);
