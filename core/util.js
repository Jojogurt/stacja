/* core/util.js — czyste pomocnicze (zero DOM / Web API) */

// Fisher–Yates; nie mutuje wejścia.
export function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

export function escapeHtml(s){
  return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
