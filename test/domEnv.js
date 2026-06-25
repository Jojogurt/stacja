/* test/domEnv.js — bootstrap środowiska DOM dla testów integracyjnych (jsdom).
 * Ładuje prawdziwy index.html + dane (window.CATEGORIES), zaślepia Web API
 * (Audio/AudioContext/speechSynthesis/fetch/matchMedia) i importuje app.js.
 * Cel: SIATKA BEZPIECZEŃSTWA pod refaktor — łapie regresje ładowania i kluczowych ścieżek. */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

// domyślna zaślepka iTunes — echo'uje zapytanego wykonawcę (`term`), by pickTrack zaliczył dopasowanie
export function itunesResults(url=''){
  let artist='Test Artist';
  try{ const q=new URL(url, 'https://x/').searchParams.get('term'); if(q) artist=q; }catch(_e){}
  return { results: [
    { trackName:'Test Song', artistName:artist, previewUrl:'https://x/preview.m4a',
      collectionName:'Test Album', releaseDate:'1985-01-01', artworkUrl100:'https://x/art.jpg' },
  ]};
}

class FakeAudio {
  constructor(src){ this.src=src||''; this.paused=true; this.ended=false; this.currentTime=0;
    this.duration=30; this.preload=''; this._ev={}; }
  addEventListener(t,fn){ (this._ev[t]=this._ev[t]||[]).push(fn); }
  removeEventListener(t,fn){ this._ev[t]=(this._ev[t]||[]).filter(f=>f!==fn); }
  emit(t){ (this._ev[t]||[]).forEach(f=>f({})); }
  play(){ this.paused=false; return Promise.resolve(); }
  pause(){ this.paused=true; }
}
class FakeAudioContext {
  constructor(){ this.state='running'; }
  resume(){ this.state='running'; return Promise.resolve(); }
}

/* Fake WebSocket — emuluje minimum protokołu DO (authority/relay), by mpEnterRoom dojechał
 * do renderu lobby: po otwarciu na 'hello'/'track' odsyła presence z hostId = ten klient.
 * Pętli gry NIE symuluje — testy wstrzykują stan ręcznie przez instancję (`pushState`). */
const wsInstances = [];   // rejestr utworzonych kanałów (test pobiera aktywny i emituje stan)
class FakeWebSocket {
  constructor(url){
    this.url=String(url); this.readyState=0;
    let id='', name=''; try{ const q=new URL(this.url.replace(/^ws/,'http')).searchParams; id=q.get('id')||''; name=q.get('name')||''; }catch(_e){}
    this._id=id; this._name=name;
    wsInstances.push(this);
    setTimeout(()=>{ this.readyState=1; this.onopen && this.onopen({}); }, 0);
  }
  send(data){
    let m; try{ m=JSON.parse(data); }catch(_e){ return; }
    if(m.t==='track' && m.name) this._name=m.name;
    if(m.t==='hello' || m.t==='track'){
      // jeden członek = ten klient, host = on (hostId===myId → mpHost=true w trybie authority)
      setTimeout(()=>this._emit({ t:'presence', members:[{id:this._id, name:this._name||'host'}], hostId:this._id }), 0);
    }
  }
  _emit(obj){ this.onmessage && this.onmessage({ data: JSON.stringify(obj) }); }
  pushState(game){ this._emit({ t:'state', game }); }   // wstrzyknij autorytatywny stan gry (faza play/reveal)
  close(){ this.readyState=3; this.onclose && this.onclose({}); }
}
FakeWebSocket.OPEN=1; FakeWebSocket.CLOSED=3;

function installGlobals(window){
  // app.js używa „gołych" referencji (document/location/...) → muszą być na globalThis
  for(const k of ['window','document','location','navigator','localStorage','fetch','WebSocket',
    'speechSynthesis','SpeechSynthesisUtterance','matchMedia','Audio','AudioContext','webkitAudioContext','URL','getComputedStyle']){
    try{ Object.defineProperty(globalThis, k, { value: window[k], configurable:true, writable:true }); }
    catch(_e){ try{ globalThis[k]=window[k]; }catch(_e2){} }
  }
}

export async function bootApp({ fetchImpl, serverAuthority=false, roomsBase='' } = {}){
  const dom = new JSDOM(read('index.html'), {
    url: 'https://stacja.test/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;

  // —— zaślepki Web API (zanim app.js się załaduje) ——
  window.STACJA_CONFIG = { roomsBase, serverAuthority, googleClientId:'', appleServicesId:'' };
  window.WebSocket = FakeWebSocket;
  window.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  window.AudioContext = window.webkitAudioContext = FakeAudioContext;
  window.Audio = FakeAudio;
  window.speechSynthesis = { getVoices:()=>[], speak(){}, cancel(){}, onvoiceschanged:null, speaking:false };
  window.SpeechSynthesisUtterance = class { constructor(t){ this.text=t; } };
  window.URL.createObjectURL = () => 'blob:fake'; window.URL.revokeObjectURL = () => {};
  try{ Object.defineProperty(window.navigator,'clipboard',{ value:{ writeText:()=>Promise.resolve() }, configurable:true }); }catch(_e){}
  const calls = [];
  window.fetch = (url, opts) => {
    calls.push(String(url));
    if(fetchImpl) return fetchImpl(String(url), opts);
    return Promise.resolve({ ok:true, status:200, json:()=>Promise.resolve(itunesResults(String(url))) });
  };

  installGlobals(window);

  // —— dane kategorii (window.CATEGORIES) — skrypty globalne, uruchom w kontekście okna ——
  for(const f of ['categories.js','lyrics.js','playlists.js','questions.js']){
    window.eval(read(f));
  }

  // —— załaduj aplikację (świeży moduł co boot dzięki cache-busterowi) ——
  const mod = await import('../app.js?boot=' + Math.random().toString(36).slice(2));

  return { dom, window, document: window.document, mod, fetchCalls: calls, wsInstances };
}

// helpery asercji DOM
export const $ = (window, id) => window.document.getElementById(id);
export const txt = (window, id) => { const e=$(window,id); return e ? e.textContent.trim() : null; };
export const click = (window, id) => { const e=$(window,id); if(!e) throw new Error('brak #'+id); e.click(); };
