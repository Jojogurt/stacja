/* core/match.js — model meczu (czysty, zero DOM / Web API).
 * Dane kategorii (`cats`) wstrzykiwane parametrem → moduł nie zna `window`. */
import { shuffle, escapeHtml } from './util.js';

export const QPC=5, CPR=3;   // pytań na kategorię, kategorii na rundę (jak prawdziwy quiz)
export const ALL_MODES=['music','lektor','reverse','snippet'];
export const MODE_LABEL={music:'♪ muzyka', lektor:'🗣 lektor', reverse:'🔄 od tyłu', snippet:'✂️ fragment'};
export const MODE_SHORT={music:'muzyka', lektor:'lektor', reverse:'od tyłu', snippet:'fragment'};
export const MODE_SUB={music:'zajawka', lektor:'czytany tekst', reverse:'wspak', snippet:'2 s'};

// jakie tryby obsługuje kategoria (kompatybilność)
export function modesFor(catKey, cats){
  const c=cats[catKey]; if(!c) return [];
  if(c.kind==='lyrics') return ['lektor'];            // brak audio
  const m=['music','reverse','snippet'];
  if((c.songs||[]).some(s=>s.lyric)) m.push('lektor'); // tekst do lektora (np. hits-now)
  return m;
}

export function catLabel(catKey, cats){ const c=cats[catKey]; return c?(c.range||c.label):catKey; }

// ułóż mecz: rounds × CPR slotów {round,cat,mode} — kompatybilne, bez powtórki kategorii w rundzie
export function buildMatch(catPool, modePool, rounds, cats){
  const catsArr=[...catPool], modes=[...modePool];
  const pairs=[];
  catsArr.forEach(cat=> modesFor(cat,cats).forEach(m=>{ if(modes.includes(m)) pairs.push({cat,mode:m}); }));
  if(!pairs.length) return {error:'Wybrane tryby nie pasują do kategorii — dodaj kategorię audio (muzyka/od tyłu/fragment) albo z tekstem (lektor).'};
  const slots=[];
  for(let r=1;r<=rounds;r++){
    const used=new Set(); let added=0;
    for(const p of shuffle(pairs)){
      if(added>=CPR) break;
      if(used.has(p.cat)) continue;              // różne kategorie w rundzie
      slots.push({round:r, cat:p.cat, mode:p.mode}); used.add(p.cat); added++;
    }
    while(added<CPR){                            // mała pula — dopuść powtórkę kategorii
      const p=shuffle(pairs)[0];
      slots.push({round:r, cat:p.cat, mode:p.mode}); added++;
    }
  }
  return {slots, rounds};
}

// losowa pula kategorii + trybów (do przycisku 🎲) — gwarantuje ≥1 kompatybilną parę
export function randomPools(allKeys, cats){
  let modes=shuffle(ALL_MODES).slice(0, 1+Math.floor(Math.random()*ALL_MODES.length));
  let catsPick=shuffle(allKeys).filter(k=>modesFor(k,cats).some(m=>modes.includes(m))).slice(0, 3+Math.floor(Math.random()*4));
  if(!catsPick.length){ modes=['music']; catsPick=shuffle(allKeys).filter(k=>modesFor(k,cats).includes('music')).slice(0,4); }
  return {cats:catsPick, modes};
}

// nawigacja po meczu (m = {slots, si, qi, rounds})
export function matchSlot(m){ return m && m.slots ? m.slots[m.si] : null; }
export function matchAdvance(m){ m.qi++; if(m.qi>=QPC){ m.qi=0; m.si++; } return m.si < m.slots.length; }
export function matchHeader(m, cats){ const s=matchSlot(m); if(!s) return '';
  return `Runda ${s.round}/${m.rounds} · ${escapeHtml(catLabel(s.cat,cats))} · ${MODE_SHORT[s.mode]||s.mode} · pyt. ${m.qi+1}/${QPC}`; }
