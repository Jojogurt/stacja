/* app/catEditor.js — EDYTOR własnych kategorii (B-MVP, bez backendu).
 * Wyszukaj w iTunes → koszyk utworów → zapis jako kategoria „Twoje" w localStorage.
 * Plus eksport/import JSON (udostępnianie bez serwera). Dane od użytkownika → escape WSZĘDZIE.
 * Powiązanie z pickerem solo (odświeżenie ticków) przez initCatEditor({onSaved}). */
import { searchTracks } from '../adapters-web/itunesRepository.js';
import { plLoad, plSave, plMerge } from './catalog.js';
import { norm } from '../core/scoring.js';
import { escapeHtml } from '../core/util.js';
import { LYRIC_MAX, clipLyric, lyricLeaks } from '../core/lyricCheck.js';
import { translatorSupported, translateToPolish } from '../adapters-web/translator.js';

const MIN_TRACKS = 10;     // mniej psuje mecz przy QPC=5 + anty-powtórkach
const MAX_TRACKS = 100;
const $ = (id)=>document.getElementById(id);

let onSaved = ()=>{};      // callback do solo.js (odśwież ticki + dodaj do puli)
let cart = [];             // [{trackId,title,artist,preview,art,year,lyric?}] — lyric = przekład dla lektora (bez oryginału)
let lyricIdx = -1;         // indeks utworu w koszyku, którego tekst edytujemy (-1 = zamknięte)
let editKey = null;        // gdy edytujemy istniejącą kategorię (pl:xxxx), inaczej null
let audio = null;          // element odsłuchu (jeden, współdzielony w edytorze)
let playingUrl = null;
let searchSeq = 0;         // token wyszukiwania — porzuć wyniki starego zapytania

const dedupKey = (t)=> norm(t.title)+'|'+norm(t.artist);

export function initCatEditor(opts={}){
  if(opts.onSaved) onSaved = opts.onSaved;
  const newBtn=$('catNew'); if(!newBtn) return;   // brak DOM (np. test bez tego ekranu) → nic
  newBtn.onclick = ()=> openEditor(null);
  $('catSearchGo').onclick = doSearch;
  $('catSearchIn').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doSearch(); } });
  $('catSave').onclick = save;
  $('catCancel').onclick = closeEditor;
  $('catExport').onclick = exportJson;
  $('catImport').onclick = importJson;
  initLyricEditor();
}

// otwórz edytor: pusty (nowa) albo z załadowaną kategorią (edycja)
export function openEditor(key){
  editKey = key || null;
  const pls = plLoad();
  const cat = editKey ? pls[editKey] : null;
  cart = cat ? (cat.songs||[]).map(s=>({ trackId:s.trackId, title:s.title, artist:s.artist, preview:s.preview, art:s.art, year:s.year, lyric:clipLyric(s.lyric) })) : [];
  $('catName').value = cat ? (cat.label||'') : '';
  $('catSearchIn').value=''; $('catResults').innerHTML=''; setStatus('');
  renderCart();
  $('catPanel').classList.add('show');
  $('catTitle').textContent = editKey ? 'Edytuj kategorię' : 'Nowa kategoria';
  $('catName').focus();
}
function closeEditor(){ stopPreview(); closeLyric(); $('catPanel').classList.remove('show'); cart=[]; editKey=null; }

function setStatus(msg, kind){ const s=$('catStatus'); if(!s) return; s.textContent=msg||''; s.className='pl-status'+(kind?' '+kind:''); }

async function doSearch(){
  const term=$('catSearchIn').value.trim();
  if(!term){ setStatus('Wpisz tytuł lub wykonawcę.', 'err'); return; }
  const seq=++searchSeq;
  setStatus('szukam…');
  let rows=[];
  try{ rows = await searchTracks(term, window.STACJA_CONFIG||{}); }
  catch(e){ if(seq!==searchSeq) return; setStatus('Nie udało się wyszukać — spróbuj ponownie.', 'err'); return; }
  if(seq!==searchSeq) return;   // starsze zapytanie — porzuć (najświeższe wygrywa)
  renderResults(rows);
  setStatus(rows.length? '' : 'Brak wyników z zajawką — zmień frazę.', rows.length?'':'err');
}

function renderResults(rows){
  const el=$('catResults');
  el.innerHTML = rows.map((t,i)=>{
    const inCart = cart.some(c=>dedupKey(c)===dedupKey(t));
    const art = /^https?:\/\//.test(t.art||'') ? `<img src="${escapeHtml(t.art)}" referrerpolicy="no-referrer" alt="">` : '<span class="ce-ph"></span>';
    return `<div class="ce-row" data-i="${i}">
      ${art}
      <span class="ce-meta"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.artist)}${t.year?' · '+escapeHtml(t.year):''}</small></span>
      <button class="ce-prev" data-i="${i}" aria-label="Posłuchaj">▶</button>
      <button class="ce-add${inCart?' in':''}" data-i="${i}" aria-label="${inCart?'W koszyku':'Dodaj'}">${inCart?'✓':'+'}</button>
    </div>`;
  }).join('');
  el.querySelectorAll('.ce-prev').forEach(b=> b.onclick=()=> togglePreview(rows[+b.dataset.i]));
  el.querySelectorAll('.ce-add').forEach(b=> b.onclick=()=>{ addToCart(rows[+b.dataset.i]); renderResults(rows); });
}

function addToCart(t){
  if(!t || !t.preview) return;                          // bez zajawki = bezużyteczny
  if(cart.length>=MAX_TRACKS){ setStatus(`Maksymalnie ${MAX_TRACKS} utworów.`, 'err'); return; }
  if(cart.some(c=>dedupKey(c)===dedupKey(t))) return;   // dedup po tytuł+wykonawca
  cart.push({ trackId:t.trackId, title:t.title, artist:t.artist, preview:t.preview, art:t.art, year:t.year });
  renderCart();
}
function removeFromCart(i){ if(i===lyricIdx) closeLyric(); else if(i<lyricIdx) lyricIdx--; cart.splice(i,1); renderCart(); }

function renderCart(){
  const el=$('catCart'); if(!el) return;
  const ok = cart.length>=MIN_TRACKS;
  $('catCount').textContent = `${cart.length} / min ${MIN_TRACKS}`;
  $('catCount').className = 'ce-count'+(ok?' ok':'');
  $('catSave').disabled = !ok;
  el.innerHTML = cart.map((c,i)=>`<span class="ce-chip"><b>${escapeHtml(c.title)}</b> <span>· ${escapeHtml(c.artist)}</span><button class="ce-ly${c.lyric?' on':''}" data-ly="${i}" title="tekst do lektora" aria-label="Tekst do lektora">${c.lyric?'📝':'+📝'}</button><button data-i="${i}" aria-label="Usuń">×</button></span>`).join('')
    || '<span class="ce-empty">koszyk pusty — wyszukaj i dodaj utwory</span>';
  el.querySelectorAll('button[data-i]').forEach(b=> b.onclick=()=> removeFromCart(+b.dataset.i));
  el.querySelectorAll('button[data-ly]').forEach(b=> b.onclick=()=> openLyric(+b.dataset.ly));
}

/* ——— odsłuch (jeden element; toggle; nowy klik zatrzymuje poprzedni) ——— */
function ensureAudio(){ if(!audio){ audio=new Audio(); audio.addEventListener('ended', ()=>{ playingUrl=null; markPrev(); }); } return audio; }
function stopPreview(){ if(audio){ try{ audio.pause(); }catch(_e){} } playingUrl=null; markPrev(); }
function togglePreview(t){
  const a=ensureAudio();
  if(playingUrl===t.preview){ stopPreview(); return; }
  try{ a.pause(); }catch(_e){}
  a.src=t.preview; playingUrl=t.preview;
  a.play().catch(()=>{ playingUrl=null; markPrev(); });
  markPrev();
}
function markPrev(){ document.querySelectorAll('#catResults .ce-prev').forEach(b=> b.textContent = '▶'); }

function save(){
  const name=$('catName').value.trim().slice(0,60);
  if(!name){ setStatus('Nadaj nazwę kategorii.', 'err'); $('catName').focus(); return; }
  if(cart.length<MIN_TRACKS){ setStatus(`Dodaj min. ${MIN_TRACKS} utworów.`, 'err'); return; }
  const songs = cart.map(c=>({ title:String(c.title).slice(0,120), artist:String(c.artist).slice(0,120), preview:c.preview, trackId:c.trackId, art:c.art, year:c.year, ...(c.lyric ? { lyric:clipLyric(c.lyric) } : {}) }));
  const pls=plLoad();
  const key = editKey || ('pl:'+Math.random().toString(36).slice(2,8));
  pls[key] = { label:name, songs, kind:'playlist' };
  plSave(pls); plMerge();
  onSaved(key, editKey ? 'edit' : 'new');
  setStatus(`✓ „${name}" — ${songs.length} utw. zapisana.`, 'ok');
  closeEditor();
}

/* ——— eksport / import JSON (udostępnianie bez backendu) ——— */
function exportJson(){
  const name=$('catName').value.trim() || 'kategoria';
  const payload={ name, tracks:cart.map(c=>({ title:c.title, artist:c.artist, trackId:c.trackId, preview:c.preview, ...(c.lyric ? { lyric:c.lyric } : {}) })) };
  const json=JSON.stringify(payload);
  try{ navigator.clipboard?.writeText(json); setStatus('✓ JSON skopiowany do schowka.', 'ok'); }
  catch(_e){ setStatus(json, ''); }
}
function importJson(){
  const raw=window.prompt('Wklej JSON kategorii:'); if(!raw) return;
  let d; try{ d=JSON.parse(raw); }catch(_e){ setStatus('To nie jest poprawny JSON.', 'err'); return; }
  const tracks=Array.isArray(d&&d.tracks)?d.tracks:(Array.isArray(d&&d.songs)?d.songs:null);
  if(!tracks){ setStatus('Brak listy utworów w JSON.', 'err'); return; }
  const seen=new Set(cart.map(dedupKey));
  let added=0;
  for(const t of tracks){
    const row={ trackId:t.trackId, title:String(t.title||'').slice(0,120), artist:String(t.artist||'').slice(0,120), preview:t.preview, art:t.art, year:t.year, lyric:clipLyric(t.lyric) };
    if(!row.title || !row.artist) continue;
    const k=dedupKey(row); if(seen.has(k)) continue;
    seen.add(k); cart.push(row); added++;
    if(cart.length>=MAX_TRACKS) break;
  }
  if(d && d.name && !$('catName').value.trim()) $('catName').value=String(d.name).slice(0,60);
  renderCart();
  setStatus(added? `✓ Zaimportowano ${added} utw. (bez zajawek odśwież wyszukiwarką).` : 'Nic nowego do dodania.', added?'ok':'err');
}

/* ——— tekst do lektora (przekład; oryginał NIE jest zapisywany) ———
 * Wszystko lokalnie: tłumaczy wbudowany tłumacz przeglądarki, zapis tylko w localStorage.
 * Eksport JSON świadomie zawiera przekłady (udostępnianie na własną odpowiedzialność). */
function initLyricEditor(){
  const box=$('catLyric'); if(!box) return;
  const sup=translatorSupported();
  $('catLyTr').hidden=!sup;
  $('catLyOrigWrap').hidden=!sup;
  $('catLyNoTr').hidden=sup;
  $('catLyTr').onclick=doTranslate;
  $('catLyOut').addEventListener('input', updateLyricMeta);
  $('catLyOk').onclick=()=>{ const c=cart[lyricIdx]; if(c){ c.lyric=clipLyric($('catLyOut').value); } closeLyric(); renderCart(); };
  $('catLyClear').onclick=()=>{ const c=cart[lyricIdx]; if(c) delete c.lyric; closeLyric(); renderCart(); };
  $('catLyCancel').onclick=closeLyric;
}
function openLyric(i){
  const c=cart[i]; const box=$('catLyric'); if(!c || !box) return;
  lyricIdx=i;
  $('catLyFor').textContent=`${c.title} · ${c.artist}`;
  $('catLyOrig').value=''; $('catLyOut').value=c.lyric||''; $('catLyOut').maxLength=LYRIC_MAX;
  $('catLyErr').textContent='';
  updateLyricMeta();
  box.hidden=false; $('catLyOut').focus();
}
function closeLyric(){ lyricIdx=-1; const box=$('catLyric'); if(box){ box.hidden=true; $('catLyOrig').value=''; } }
function updateLyricMeta(){
  const c=cart[lyricIdx]; if(!c) return;
  const v=$('catLyOut').value;
  $('catLyCount').textContent=`${v.length} / ${LYRIC_MAX}`;
  const leaks=lyricLeaks(v, c.title, c.artist);
  $('catLyWarn').textContent = leaks.length
    ? `Uwaga: przekład zawiera ${leaks.includes('title')&&leaks.includes('artist')?'tytuł i wykonawcę':(leaks.includes('title')?'tytuł':'wykonawcę')} — gracze będą mieli za łatwo.`
    : '';
}
async function doTranslate(){
  const btn=$('catLyTr'); const src=$('catLyOrig').value;
  $('catLyErr').textContent=''; btn.disabled=true; btn.textContent='Tłumaczę…';
  try{ const out=await translateToPolish(src); $('catLyOut').value=clipLyric(out); updateLyricMeta(); }
  catch(e){ $('catLyErr').textContent=(e&&e.message)||'Tłumaczenie nie powiodło się.'; }
  finally{ btn.disabled=false; btn.textContent='Przetłumacz na polski'; }
}
