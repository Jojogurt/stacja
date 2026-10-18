/* server/lib/judge.js — „sędzia AI" na Cloudflare Workers AI (binding env.AI, wrangler.toml [ai]).
 * Prompt, parser i twarde reguły są czyste i wspólne z klientem (core/judge.js) — tu tylko wołanie modelu,
 * timeout, cache werdyktów w izolacie i limit wywołań. Każda awaria = null („brak werdyktu") → gra ocenia
 * regułami jak dotąd (sędzia nigdy nie blokuje ani nie psuje oceny). */
import { JUDGE_MODEL, JUDGE_TIMEOUT_MS, JUDGE_LOCK_BUDGET_MS, judgeMessages, parseVerdict, judgeKey, judgeVeto } from '../../core/judge.js';

const CACHE_MAX = 1000;
const cache = new Map();          // klucz (model+pytanie+wzorzec+typ) → true/false albo Promise (wywołanie w locie)
// limit wywołań modelu na izolat (koszt; MP i /api/judge razem): token bucket
const RATE = { rate: 4, burst: 60 };   // ~240/min na izolat, zryw 60 (np. 8 drużyn × 2 sloty naraz)
const bucket = { tokens: RATE.burst, ts: Date.now() };
function allowCall(now = Date.now()){
  bucket.tokens = Math.min(RATE.burst, bucket.tokens + (now - bucket.ts) / 1000 * RATE.rate); bucket.ts = now;
  if(bucket.tokens < 1) return false;
  bucket.tokens -= 1; return true;
}
// testy: czysty stan modułu
export function _resetJudge(){ cache.clear(); bucket.tokens = RATE.burst; bucket.ts = Date.now(); }

// Workers AI: {response:'…'} (llama/mistral) albo OpenAI-owe {choices:[{message:{content}}]} (qwen3)
function textOf(r){
  if(!r) return '';
  if(typeof r === 'string') return r;
  if(typeof r.response === 'string') return r.response;
  const c = r.choices && r.choices[0];
  if(c) return (c.message && typeof c.message.content === 'string' ? c.message.content : '') || c.text || '';
  return '';
}
const withTimeout = (p, ms)=> new Promise((res)=>{
  const t = setTimeout(()=>res(null), ms);
  Promise.resolve(p).then(v=>{ clearTimeout(t); res(v); }, ()=>{ clearTimeout(t); res(null); });
});
function remember(key, v){
  cache.delete(key); cache.set(key, v);
  while(cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/* jeden werdykt: true (TAK) / false (NIE) / null (brak env.AI, timeout, błąd, limit, nieczytelna odpowiedź).
 * req = { question, expected:[warianty], guess, label }. Ten sam klucz w locie → wspólne wywołanie (2 drużyny = 1). */
export async function judgeAnswer(env, req, { timeoutMs = JUDGE_TIMEOUT_MS, model = JUDGE_MODEL } = {}){
  if(!env || !env.AI || typeof env.AI.run !== 'function' || !req) return null;
  const key = judgeKey(model, req);
  if(cache.has(key)){
    const hit = cache.get(key);
    return hit instanceof Promise ? withTimeout(hit, timeoutMs) : hit;
  }
  if(!allowCall()) return null;
  const messages = judgeMessages(req, { noThink: /qwen3/.test(model) });
  const call = (async ()=>{
    try{
      const r = await env.AI.run(model, { messages, temperature: 0, max_tokens: /qwen3/.test(model) ? 16 : 4 });
      const v = parseVerdict(textOf(r));
      return v === true && judgeVeto(req.guess, req.expected) ? false : v;   // twardy weto: zniekształcona forma wzorca
    }catch(_e){ return null; }
  })();
  remember(key, call);
  call.then(v=>{ if(v === null){ if(cache.get(key) === call) cache.delete(key); } else remember(key, v); });
  return withTimeout(call, timeoutMs);
}

/* wiele werdyktów równolegle w ŁĄCZNYM budżecie czasu (lock MP) — kolejność jak reqs; co nie zdążyło → null */
export async function judgeMany(env, reqs, { budgetMs = JUDGE_LOCK_BUDGET_MS, timeoutMs = JUDGE_TIMEOUT_MS } = {}){
  if(!Array.isArray(reqs) || !reqs.length || !env || !env.AI) return (reqs||[]).map(()=>null);
  const out = reqs.map(()=>null);
  const all = Promise.allSettled(reqs.map((r, i)=> judgeAnswer(env, r, { timeoutMs }).then(v=>{ out[i] = v; })));
  await withTimeout(all, budgetMs);
  return out.slice();
}
