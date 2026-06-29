/* core/chatFeed.js — czysty feed czatu MP (zero DOM / sieci).
 * Stan: {log, seenProp, seenPass}. Operacje dopisują wpisy i pilnują dedupu +
 * limitu ring-buffera. Render (innerHTML) i efekty (clear „pisze") zostają w app.js. */
import { slotsFor } from './mpReducer.js';

export const FEED_CAP = 60;   // maks. wpisów w feedzie (ring-buffer)

export function createFeed(){
  return { log: [], seenProp: new Set(), seenPass: new Set(), seenSure: new Set() };
}

export function resetFeed(feed){
  feed.log.length = 0; feed.seenProp.clear(); feed.seenPass.clear(); feed.seenSure.clear();
  return feed;
}

function cap(log){ if(log.length > FEED_CAP) log.splice(0, log.length - FEED_CAP); }

// własna / cudza wiadomość czatu
export function pushChat(feed, byName, text, mine){
  feed.log.push({ kind: 'chat', byName, text, mine: !!mine });
  cap(feed.log);
  return feed;
}

/* Zaksięguj NOWE typy i pasy ze stanu gry (host-authority) do feedu — w kolejności napływu.
 * Czyta bucket MOJEJ drużyny (teamId) — izolacja: nie widzę typów/pewniaków cudzych drużyn.
 * coop → teamId='all' (bez zmian zachowania). Zwraca {added, clearTyping[]}: added → czy doszły
 * wpisy (do re-renderu), clearTyping → id graczy, dla których zdjąć „pisze…" (ich typ dotarł). */
export function ingestFeed(feed, g, meId, teamId){
  const clearTyping = [];
  if(!g) return { added: false, clearTyping };
  const bkt = (g.byTeam && teamId && g.byTeam[teamId]) || {};
  const slots = g.answerSlots || slotsFor();
  const label = (k) => { const s = slots.find(x => x.key === k); return s ? s.label : k; };
  let added = false;
  (bkt.proposals || []).forEach(p => {
    const key = p.aid || p.id;   // dedup po aid akcji (kopia optymistyczna i autorytatywna mają to samo aid)
    if(feed.seenProp.has(key)) return;
    feed.seenProp.add(key);
    clearTyping.push(p.by);
    const chips = Object.keys(p.values || {}).map(k => ({ slot: label(k), key: k, val: p.values[k] }));
    feed.log.push({ kind: 'typ', byName: p.byName, chips, values: p.values, mine: p.by === meId });
    added = true;
  });
  (bkt.sure || []).forEach(sp => {   // pewniak = per-gracz toggle (bucket drużyny), nie właściwość typu
    if(feed.seenSure.has(sp.id)) return;
    feed.seenSure.add(sp.id);
    feed.log.push({ kind: 'sys', cls: 'sure', text: `${sp.name || 'gracz'} ustawił(a) 🟡 PEWNIAK` });
    added = true;
  });
  (bkt.passed || []).forEach(pp => {
    if(feed.seenPass.has(pp.id)) return;
    feed.seenPass.add(pp.id);
    feed.log.push({ kind: 'sys', cls: 'pass', text: `${pp.name || 'gracz'} spasował(a) ✋` });
    added = true;
  });
  cap(feed.log);
  return { added, clearTyping };
}
