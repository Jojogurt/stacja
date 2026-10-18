/* app/matchSetup.js — JEDEN komponent ekranu „Nowy mecz" dla solo (app/solo.js) i hosta MP (app/mp-picker.js).
 * Gotowce („Szybki start") → zwijane „Dostosuj mecz" (kategorie: zakładki grup + wyszukiwarka + siatka kart,
 * wybrane jako chipy; tryby w rodzinach z wyszarzeniem niekompatybilnych; zwijane „Ustawienia meczu") →
 * pasek startu (podsumowanie · 🎲 · ZACZNIJ; na telefonie przyklejony do dołu, na desktopie w prawej kolumnie).
 *
 * Render = string HTML (MP i tak renderuje pokój przez innerHTML); interakcje przez DELEGACJĘ na korzeniu
 * (`data-ms-*`, zero inline JS — klucze kategorii nigdy nie trafiają do onclick). Decyzje (gotowce, filtr,
 * kompatybilność, podsumowania) są czyste w core/matchSetup.js. Kontekst (solo/MP) wstrzykuje: dostępne tryby,
 * dodatkowe ustawienia, akcje startu/kostki i narzędzia zakładki „Twoje". Stan wyboru (`pick`) należy do
 * wołającego i jest mutowany W MIEJSCU (Sety cats/modes nie są podmieniane — żywe referencje w solo/MP). */
import { escapeHtml } from '../core/util.js';
import { ALL_MODES, MATCH_LENGTHS } from '../core/match.js';
import { plPick, togglePick, syncQuizMode, quizGroupKeys } from '../core/picker.js';
import { presetsFor, presetMatches, searchCats, modeStates, modeNote, setupSummary, MODE_REASON } from '../core/matchSetup.js';
import { ERA_KEYS, STYLE_KEYS, READY_KEYS, LYRICS_KEYS, QUIZ_KEYS, ALL_CATS, plLoad } from './catalog.js';
import { lsGet, lsSet } from './dom.js';

/* ---- grupy kategorii (zakładki) — liczone na żywo: quiz dochodzi po starcie, „Twoje" z localStorage ---- */
export function catGroups(){
  return [
    { id:'dekady',     label:'Dekady',     keys:ERA_KEYS },
    { id:'style',      label:'Style',      keys:STYLE_KEYS },
    { id:'playlisty',  label:'Playlisty',  keys:READY_KEYS },
    { id:'teksty',     label:'Teksty',     keys:LYRICS_KEYS, note:'tłumaczenia i zagadki — opis czyta lektor' },
    { id:'wiedza',     label:'Wiedza',     keys:quizGroupKeys(QUIZ_KEYS, ALL_CATS, 'wiedza'), note:'wiedza ogólna — pytania bez dźwięku' },
    { id:'lamiglowki', label:'Łamigłówki', keys:quizGroupKeys(QUIZ_KEYS, ALL_CATS, 'lamiglowki'), note:'muzyczne łamigłówki słowne' },
    { id:'twoje',      label:'Twoje',      keys:Object.keys(plLoad()).filter(k=>ALL_CATS[k]), always:true },
  ].map(g=>({ ...g, keys:g.keys.filter(k=>ALL_CATS[k]) }));
}
const catName = (k)=> (ALL_CATS[k] && ALL_CATS[k].label) || k;
function catSub(k){
  const c=ALL_CATS[k]; if(!c) return '';
  if(c.kind==='quiz') return `${(c.questions||[]).length} pytań`;
  if(c.range) return c.range;
  if(c.desc) return c.desc;
  const n=(c.songs||[]).length;
  return c.kind==='lyrics' ? `${n} tekstów` : `${n} utw.`;
}

/* ---- zachowanie fokusu przy re-renderze innerHTML (klawiatura/wyszukiwarka nie gubią miejsca) ---- */
const FOCUS_ATTRS=['data-ms-cat','data-ms-mode','data-ms-tab','data-ms-preset','data-ms-len','data-ms-toggle','data-ms-act','data-ms-edit','data-ms-remove'];
const cssStr=(v)=>String(v).replace(/["\\]/g, '\\$&');
export function focusKey(root){
  const el=typeof document!=='undefined' ? document.activeElement : null;
  if(!el || !root || !root.contains(el) || el===root) return null;
  let sel=null;
  if(el.id) sel='#'+(typeof CSS!=='undefined' && CSS.escape ? CSS.escape(el.id) : el.id);
  else { const a=FOCUS_ATTRS.find(x=>el.hasAttribute && el.hasAttribute(x)); if(a) sel=`[${a}="${cssStr(el.getAttribute(a))}"]`; }
  if(!sel) return null;
  let s=null, e=null; try{ if(typeof el.selectionStart==='number'){ s=el.selectionStart; e=el.selectionEnd; } }catch(_e){}
  return { sel, s, e };
}
export function restoreFocus(root, fk){
  if(!fk || !root) return;
  let el=null; try{ el=root.querySelector(fk.sel); }catch(_e){ el=null; }
  if(!el || el.disabled) return;
  try{ el.focus({ preventScroll:true }); }catch(_e){ try{ el.focus(); }catch(_e2){} }
  if(fk.s!=null){ try{ el.setSelectionRange(fk.s, fk.e); }catch(_e){} }
}
export function renderPreserving(root, html){ const fk=focusKey(root); root.innerHTML=html; restoreFocus(root, fk); }

const IC={
  chev:'<svg class="ms-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x:'<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  search:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M20 20l-4-4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  dice:'<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.4" fill="currentColor"/></svg>',
};

/* cfg: { ctx:'solo'|'mp', pick:{cats:Set,modes:Set,questions,preset}, available()→tryby, render(), onStart(), onDice(),
 *        onChange?(), settingsHTML?()→string, settingsSummary()→string, twojeHTML?()→string, ownActions?,
 *        onEdit?(k), onRemove?(k), onAct?(act, el), gate?()→{ok:false,text}|null (np. MP: za mało drużyn),
 *        presetEnv?()→{shelf} (dane dla gotowców zależnych od gracza — „Z mojej półki"),
 *        ids?:{start,dice,info}, startLabel? } */
export function createMatchSetup(cfg){
  const ctx=cfg.ctx, pick=cfg.pick;
  const UI_KEY='stacjaSetupUi_'+ctx;
  let saved={}; try{ saved=JSON.parse(lsGet(UI_KEY,'{}'))||{}; }catch(_e){ saved={}; }
  // „Dostosuj mecz" ZWINIĘTE przy każdym wejściu na ekran (zgłoszenie 2026-10-18) — open:null = domyślnie; bez zapamiętywania między wejściami
  const ui={ tab:null, q:'', open:null, settingsOpen:saved.settings===true, error:'' };
  const id=(s)=>`ms-${ctx}-${s}`;
  const avail=()=>{ try{ return cfg.available ? cfg.available() : ALL_MODES; }catch(_e){ return ALL_MODES; } };
  const saveUi=()=>lsSet(UI_KEY, JSON.stringify({ settings:ui.settingsOpen }));

  // env gotowców: kontekst (gotowce z `ctx`) + dane kontekstu (solo: liczba utworów na półce — „Z mojej półki")
  const presetEnv=()=>{ let e={}; try{ e=(cfg.presetEnv && cfg.presetEnv()) || {}; }catch(_e){ e={}; } return { ...e, ctx }; };
  function presets(){ return presetsFor(ALL_CATS, avail(), undefined, presetEnv()); }
  function curPreset(){ return pick.preset ? presets().find(p=>p.id===pick.preset) || null : null; }
  function state(){
    syncQuizMode(pick.cats, pick.modes, ALL_CATS);
    const ms=modeStates({ cats:pick.cats, modes:pick.modes, allCats:ALL_CATS, available:avail() });
    let sum=setupSummary({ cats:pick.cats, active:ms.active, questions:pick.questions, allCats:ALL_CATS });
    if(sum.ok && cfg.gate){ const g=cfg.gate(); if(g) sum={ ok:false, text:g.text }; }
    if(ui.error) sum={ ok:false, text:ui.error };
    return { ms, sum };
  }
  // zmiana wyboru ręcznie → gotowiec odznaczony; błąd startu znika przy każdej zmianie
  function changed(manual=true){ if(manual) pick.preset=null; ui.error=''; if(cfg.onChange) cfg.onChange(); cfg.render(); }

  const api={
    pick, ui,
    groups:catGroups,
    state,
    toggleCat(k){ if(!ALL_CATS[k] && !pick.cats.has(k)) return; togglePick(pick.cats, k); changed(); },
    removeCat(k){ pick.cats.delete(k); changed(); },
    clearCats(){ pick.cats.clear(); changed(); },
    toggleMode(m){
      if(m==='quiz' || !ALL_MODES.includes(m)) return;
      const st=modeStates({ cats:pick.cats, modes:pick.modes, allCats:ALL_CATS, available:avail() });
      const ms=st.families.flatMap(f=>f.modes).find(x=>x.mode===m);
      if(!ms || ms.disabled) return;
      // tryb zaznaczony, ale wyszarzony (zmiana kategorii) nie liczy się — klik na aktywnym = wyłącz
      togglePick(pick.modes, m); changed();
    },
    setQuestions(q){ const L=MATCH_LENGTHS.find(x=>x.q===+q); if(!L) return; pick.questions=L.q; changed(); },
    applyPreset(pid){
      const r=presets().find(p=>p.id===pid); if(!r || r.disabled) return;
      pick.cats.clear(); r.cats.forEach(k=>pick.cats.add(k));
      pick.modes.clear(); r.modes.forEach(m=>pick.modes.add(m));
      pick.questions=r.questions; pick.preset=r.id;
      changed(false);
    },
    // pula z zewnątrz (kostka / zapamiętana pula / import) — Sety mutowane w miejscu
    setPick({ cats, modes, questions, preset=null }={}){
      if(cats){ pick.cats.clear(); cats.forEach(k=>pick.cats.add(k)); }
      if(modes){ pick.modes.clear(); modes.forEach(m=>pick.modes.add(m)); }
      if(questions) pick.questions=questions;
      const r=preset ? presets().find(p=>p.id===preset) : null;
      pick.preset = (r && presetMatches(r, pick.cats, pick.modes, pick.questions)) ? r.id : null;
      ui.error='';
      if(cfg.onChange) cfg.onChange();
      cfg.render();
    },
    setTab(t){ ui.tab=t; ui.q=''; cfg.render(); },
    setSearch(q){ ui.q=String(q||'').slice(0,60); cfg.render(); },
    setOpen(v){ ui.open=!!v; cfg.render(); },
    // nowe wejście na ekran „Nowy mecz" → sekcja wraca do domyślnej (zwinięta; rozwinięta tylko bez poprawnego wyboru)
    resetOpen(){ ui.open=null; },
    flashError(msg){ ui.error=String(msg||''); cfg.render(); },
    presetName(){ const r=curPreset(); return r ? r.name : ''; },
    // szkic dla gości MP (kategorie z etykietami — goście mogą nie mieć tych samych własnych kategorii)
    draft(){
      const { ms }=state(), cats=[...pick.cats];
      return { preset:api.presetName(), cats:cats.slice(0,24).map(k=>({ k, l:catName(k) })), more:Math.max(0,cats.length-24),
        modes:ms.active, questions:pick.questions };
    },
    summary(){ return state().sum; },
    html,
    // delegacja zdarzeń — wołać RAZ na trwałym korzeniu (solo: kontener pickera; MP: #mpStage)
    bind(root){
      if(!root || root.__msBound && root.__msBound[ctx]) return;
      (root.__msBound=root.__msBound||{})[ctx]=true;
      const mine=(el)=>{ const m=el && el.closest && el.closest('.ms'); return !!(m && m.dataset.msCtx===ctx && root.contains(m)); };
      root.addEventListener('click', (e)=>{
        const el=e.target && e.target.closest && e.target.closest('[data-ms-preset],[data-ms-toggle],[data-ms-tab],[data-ms-cat],[data-ms-unpick],[data-ms-mode],[data-ms-len],[data-ms-act],[data-ms-edit],[data-ms-remove]');
        if(!el || !mine(el) || el.disabled) return;
        const d=el.dataset;
        if(d.msPreset!=null) return api.applyPreset(d.msPreset);
        if(d.msToggle==='custom') return api.setOpen(!(ui.open!==false));
        if(d.msToggle==='settings'){ ui.settingsOpen=!ui.settingsOpen; saveUi(); return cfg.render(); }
        if(d.msTab!=null) return api.setTab(d.msTab);
        if(d.msEdit!=null){ ui.tab='twoje'; ui.q=''; cfg.render(); return cfg.onEdit && cfg.onEdit(d.msEdit); }
        if(d.msRemove!=null) return cfg.onRemove && cfg.onRemove(d.msRemove);
        if(d.msCat!=null) return api.toggleCat(d.msCat);
        if(d.msUnpick!=null) return api.removeCat(d.msUnpick);
        if(d.msMode!=null) return api.toggleMode(d.msMode);
        if(d.msLen!=null) return api.setQuestions(d.msLen);
        const act=d.msAct;
        if(act==='clear') return api.clearCats();
        if(act==='search-clear') return api.setSearch('');
        if(act==='dice') return cfg.onDice && cfg.onDice();
        if(act==='start') return cfg.onStart && cfg.onStart();
        if(act && cfg.onAct) return cfg.onAct(act, el);
      });
      root.addEventListener('input', (e)=>{ const el=e.target; if(el && el.hasAttribute && el.hasAttribute('data-ms-search') && mine(el)) api.setSearch(el.value); });
      root.addEventListener('keydown', (e)=>{ const el=e.target; if(e.key==='Escape' && el && el.hasAttribute && el.hasAttribute('data-ms-search') && mine(el) && ui.q){ e.preventDefault(); api.setSearch(''); } });
    },
  };

  function presetsHTML(){
    const list=presets(); if(!list.length) return '';
    const btns=list.map(p=>{ const on=!p.disabled && pick.preset===p.id;
      // nieaktywny gotowiec (np. „Z mojej półki" bez ≥ 8 polubionych): disabled + podpowiedź w podpisie
      const dis=p.disabled ? ` disabled aria-disabled="true" title="${escapeHtml(p.sub)}"` : '';
      return `<button type="button" class="ms-preset${on?' on':''}${p.disabled?' locked':''}" data-ms-preset="${escapeHtml(p.id)}" aria-pressed="${on}"${dis}><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.sub)}</small></button>`; }).join('');
    return `<section class="ms-presets" aria-labelledby="${id('ph')}">
      <div class="ms-h"><h2 id="${id('ph')}">Szybki start</h2><span class="ms-note">jeden tap = gotowy mecz</span></div>
      <div class="ms-preset-grid">${btns}</div></section>`;
  }
  function catCard(k, groupLabel){
    const on=pick.cats.has(k), name=catName(k), sub=(groupLabel?groupLabel+' · ':'')+catSub(k);
    // P2-10: jawna nazwa dostępnościowa (nazwa + zakres/opis) — czytnik ekranu nie składa jej z <b>/<small> w każdym silniku
    const main=`<button type="button" class="ms-cat${on?' on':''}" data-ms-cat="${escapeHtml(k)}" aria-pressed="${on}" aria-label="${escapeHtml(name+(sub?' — '+sub:''))}"><b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small></button>`;
    if(!(cfg.ownActions && String(k).startsWith('pl:'))) return main;
    return `<div class="ms-cat-wrap">${main}<span class="ms-cat-acts">`+
      `<button type="button" class="ms-cat-act" data-ms-edit="${escapeHtml(k)}" aria-label="Edytuj: ${escapeHtml(name)}" title="edytuj">✎</button>`+
      `<button type="button" class="ms-cat-act rm" data-ms-remove="${escapeHtml(k)}" aria-label="Usuń kategorię: ${escapeHtml(name)}" title="usuń">×</button></span></div>`;
  }
  function catsHTML(){
    const groups=catGroups().filter(g=>g.keys.length || g.always);
    if(!ui.tab || !groups.some(g=>g.id===ui.tab)){
      const withSel=groups.find(g=>g.keys.some(k=>pick.cats.has(k)));
      ui.tab=(withSel || groups[0] || { id:'dekady' }).id;
    }
    const n=pick.cats.size;
    const chips=n ? `<div class="ms-chips" role="group" aria-label="Wybrane kategorie">`+
      [...pick.cats].map(k=>`<button type="button" class="ms-chip" data-ms-unpick="${escapeHtml(k)}" aria-label="Usuń: ${escapeHtml(catName(k))}"><span>${escapeHtml(catName(k))}</span>${IC.x}</button>`).join('')+
      (n>1 ? `<button type="button" class="ms-chip-clear" data-ms-act="clear">wyczyść</button>` : '')+`</div>` : '';
    const searching=!!ui.q.trim();
    const tabs=groups.map(g=>{ const on=!searching && g.id===ui.tab, c=g.keys.filter(k=>pick.cats.has(k)).length;
      return `<button type="button" class="ms-tab${on?' on':''}" data-ms-tab="${g.id}" aria-pressed="${on}">${escapeHtml(g.label)}${c?`<span class="ms-tab-n"><span class="sr-only">, wybrane: </span>${c}</span>`:''}</button>`; }).join('');
    const search=`<label class="ms-search" for="${id('q')}">${IC.search}<span class="sr-only">Szukaj kategorii</span>
        <input type="search" id="${id('q')}" data-ms-search value="${escapeHtml(ui.q)}" placeholder="Szukaj kategorii (np. disco, 80)" autocomplete="off" enterkeyhint="search">
        ${searching?`<button type="button" class="ms-search-x" data-ms-act="search-clear" aria-label="Wyczyść wyszukiwanie">${IC.x}</button>`:''}</label>`;
    let body='';
    if(searching){
      const lab=Object.fromEntries(groups.map(g=>[g.id, g.label]));
      const hits=searchCats(groups, ui.q, ALL_CATS);
      body=hits.length ? `<div class="ms-grid" role="group" aria-label="Wyniki wyszukiwania">${hits.map(h=>catCard(h.key, lab[h.group])).join('')}</div>`
        : `<p class="ms-empty">Brak kategorii dla „${escapeHtml(ui.q.trim())}".</p>`;
      body=`<p class="ms-found" role="status">${hits.length} ${plPick(hits.length,'wynik','wyniki','wyników')} we wszystkich grupach</p>`+body;
    } else {
      const g=groups.find(x=>x.id===ui.tab) || { keys:[], label:'' };
      const note=g.note ? `<p class="ms-gnote">${escapeHtml(g.note)}</p>` : '';
      const tools=g.id==='twoje' ? (cfg.twojeHTML ? cfg.twojeHTML() : '') + `<div data-ms-slot="twoje"></div>` : '';
      const grid=g.keys.length ? `<div class="ms-grid" role="group" aria-label="Kategorie: ${escapeHtml(g.label)}">${g.keys.map(k=>catCard(k)).join('')}</div>`
        : (g.id==='twoje' ? `<p class="ms-empty">Nie masz jeszcze własnych kategorii — dodaj nową albo playlistę ze Spotify.</p>` : '');
      body=note+tools+grid;
    }
    return `<section class="ms-panel ms-cats" aria-labelledby="${id('ch')}">
      <div class="ms-h"><h2 id="${id('ch')}">Kategorie</h2><span class="ms-note">${n} ${plPick(n,'wybrana','wybrane','wybranych')}</span></div>
      ${chips}<div class="ms-catbar"><div class="ms-tabs" role="group" aria-label="Grupy kategorii">${tabs}</div>${search}</div>${body}</section>`;
  }
  function modesHTML(ms){
    const fams=ms.families.map(f=>{
      const pills=f.modes.map(m=>{
        if(m.auto) return `<span class="ms-pill auto${m.on?' on':''}" title="włącza się sam z kategorią z Wiedzy lub Łamigłówek">${escapeHtml(m.label)}<small>auto</small></span>`;
        const why=m.reason ? MODE_REASON[m.reason] : '';
        return `<button type="button" class="ms-pill${m.on?' on':''}" data-ms-mode="${m.mode}" aria-pressed="${m.on}"${m.disabled?` disabled title="${escapeHtml(why)}" aria-describedby="${id('mn')}"`:''}>${escapeHtml(m.label)}${m.reason==='solo'?'<small>solo</small>':''}</button>`;
      }).join('');
      return `<div class="ms-fam"><div class="ms-fam-h"><b>${escapeHtml(f.name)}</b><span>${escapeHtml(f.desc)}</span></div><div class="ms-pills">${pills}</div></div>`;
    }).join('');
    const note=modeNote(ms.reasons);
    const k=ms.active.length;
    return `<section class="ms-panel ms-modes" aria-labelledby="${id('mh')}">
      <div class="ms-h"><h2 id="${id('mh')}">Tryby pytań</h2><span class="ms-note">${k} ${plPick(k,'wybrany','wybrane','wybranych')}</span></div>
      ${fams}<p class="ms-mnote" id="${id('mn')}"${note?'':' hidden'}>${escapeHtml(note)}</p></section>`;
  }
  function settingsHTML(){
    const lens=MATCH_LENGTHS.map(L=>{ const on=pick.questions===L.q;
      return `<button type="button" class="ms-len${on?' on':''}" data-ms-len="${L.q}" aria-pressed="${on}"><b>${escapeHtml(L.label)}</b><small>${L.q} pyt.</small></button>`; }).join('');
    const open=!!ui.settingsOpen;
    return `<section class="ms-settings">
      <button type="button" class="ms-set-toggle" data-ms-toggle="settings" aria-expanded="${open}" aria-controls="${id('set')}">
        <span>Ustawienia meczu</span><small>${escapeHtml(cfg.settingsSummary ? cfg.settingsSummary() : '')}</small>${IC.chev}</button>
      <div class="ms-set-body" id="${id('set')}"${open?'':' hidden'}>
        <div class="ms-sub">Długość</div><div class="ms-lens" role="group" aria-label="Długość meczu">${lens}</div>
        ${cfg.settingsHTML ? cfg.settingsHTML() : ''}
      </div></section>`;
  }
  function barHTML(sum){
    const ids=cfg.ids||{};
    return `<div class="ms-bar">
      <div class="ms-sum${sum.ok?'':' err'}"${ids.info?` id="${ids.info}"`:''} role="status" aria-live="polite">${escapeHtml(sum.text)}</div>
      <div class="ms-bar-row">
        <button type="button" class="ms-dice"${ids.dice?` id="${ids.dice}"`:''} data-ms-act="dice" aria-label="Losowy mecz" title="Losowy mecz">${IC.dice}</button>
        <button type="button" class="ms-start"${ids.start?` id="${ids.start}"`:''} data-ms-act="start"${sum.ok?'':' disabled'}>${escapeHtml(cfg.startLabel||'Zacznij mecz')}</button>
      </div></div>`;
  }
  function html(){
    const { ms, sum }=state();
    // domyślnie zwinięte; rozwinięte tylko gdy nie da się zacząć (np. brak kategorii) — inaczej gracz nie widzi, co poprawić
    const open = ui.open==null ? !sum.ok : ui.open!==false;
    return `<div class="ms" data-ms-ctx="${ctx}">
      ${presetsHTML()}
      <button type="button" class="ms-custom-toggle" data-ms-toggle="custom" aria-expanded="${open}" aria-controls="${id('body')}">
        <span>Dostosuj mecz</span><small>${open?'zwiń':'kategorie, tryby, długość'}</small>${IC.chev}</button>
      <div class="ms-body" id="${id('body')}"${open?'':' hidden'}>
        ${catsHTML()}
        <div class="ms-side">${modesHTML(ms)}${settingsHTML()}</div>
      </div>
      ${barHTML(sum)}
    </div>`;
  }
  return api;
}
