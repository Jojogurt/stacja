/* app/lektor.js — synteza mowy (tryb „lektor"): pre-gen audio > Piper (opcjonalny) > głos systemowy.
 * Stan zamknięty w module; wejścia (tekst/url/callback) idą argumentami.
 * Zależy tylko od app/dom.js (status w UI) + Web Speech/Audio. */
import { flash, setIcon, setRing, setState, lsGet, lsSet } from './dom.js';

let plVoice = null;   // głos pl-PL do syntezatora systemowego

function loadVoice(){
  if(!('speechSynthesis' in window)) return;
  const vs=speechSynthesis.getVoices();
  plVoice = vs.find(v=>/pl(-|_)?/i.test(v.lang)) || vs.find(v=>/pol/i.test(v.name)) || null;
}
if('speechSynthesis' in window){ loadVoice(); speechSynthesis.onvoiceschanged=loadVoice; }

export function speak(text){
  if(!('speechSynthesis' in window)){ flash('Ta przeglądarka nie ma syntezatora mowy (lektor niedostępny).'); return; }
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  if(plVoice){ u.voice=plVoice; u.lang=plVoice.lang; } else { u.lang='pl-PL'; }
  u.rate=0.96; u.pitch=0.9;
  const gen=lektorGen;   // 2.1: onend z poprzedniej rundy nie może resetować ikony/statusu nowej
  u.onend=()=>{ if(gen!==lektorGen) return; setIcon('play'); setRing(1); setState('koniec · ↻ powtórz'); };
  // F2a #16: błąd syntezy (Chrome „synthesis-failed", iOS „interrupted", brak głosu) → stan wraca do „odtwórz"
  u.onerror=()=>{ if(gen!==lektorGen) return; setIcon('play'); setRing(0); setState('lektor przerwany · ▶ odtwórz ponownie'); };
  setIcon('pause'); setRing(0); setState('lektor czyta…');
  document.getElementById('knob').classList.add('live');
  speechSynthesis.speak(u);
}
export function stopSpeech(){ if('speechSynthesis' in window) speechSynthesis.cancel(); }

// czy lektor właśnie mówi (pre-gen/Piper audio gra LUB syntezator systemowy czyta)
export function isSpeaking(){
  return (lektorAudio && !lektorAudio.paused) || (window.speechSynthesis && speechSynthesis.speaking);
}

/* ===== kolejność jakości: pre-gen audio > Piper > głos systemowy ===== */
let piperOn = lsGet('stacjaPiper')==='1';   // F2a #11: bez rzucania przy zablokowanym storage
const PIPER_VOICE = 'pl_PL-gosia-medium';
let piperMod=null, piperReady=false, lektorAudio=null, lektorUrl=null;   // lektorUrl: blob Pipera do zwolnienia
// token „pokolenia": każde nowe odtworzenie/stop unieważnia poprzednie. Bez tego
// wolna synteza Piper z poprzedniego pytania kończyła się PO zmianie rundy i czytała
// stary tekst (oraz nakładała się = brzmiało jak zapętlenie).
let lektorGen=0;

export function lektorStop(){ lektorGen++; if(lektorAudio){ lektorAudio.pause(); lektorAudio=null; }
  if(lektorUrl){ try{ URL.revokeObjectURL(lektorUrl); }catch(_e){} lektorUrl=null; }   // 2.3: zwolnij blob także przy stopie w połowie
  stopSpeech(); }

async function piperEnsure(onPct){
  if(!piperMod) piperMod = await import('https://esm.sh/@diffusionstudio/vits-web@1.0.3');
  if(!piperReady){ await piperMod.download(PIPER_VOICE, p=>{ if(onPct&&p.total) onPct(Math.round(p.loaded/p.total*100)); }); piperReady=true; }
  return piperMod;
}

// F2a #16: pre-gen/Piper audio — ikona/status zgodne z REALNYM stanem; koniec/błąd → „odtwórz ponownie"
function playLektorAudio(a, gen, onStatus, label){
  const live=()=>gen===lektorGen && lektorAudio===a;
  a.addEventListener('ended',()=>{ if(!live()) return; lektorAudio=null; setIcon('play'); setRing(1); setState('koniec · ↻ powtórz'); });
  a.addEventListener('error',()=>{ if(!live()) return; lektorAudio=null; setIcon('play'); setRing(0); setState('nagranie lektora niedostępne · ▶ spróbuj ponownie'); });
  setIcon('wait'); setRing(0);
  document.getElementById('knob').classList.add('live');
  const p=a.play();
  (p && p.then ? p : Promise.resolve()).then(()=>{ if(!live()) return; setIcon('pause'); onStatus && onStatus(label); })
    .catch(()=>{ if(!live()) return; setIcon('play'); onStatus && onStatus('stuknij ▶, by odtworzyć'); });
}

// odtwarza lektora RAZ; callback onStatus(tekst) do pokazania postępu w UI.
// Powtórka tylko ręcznie (gałka / przycisk ↻) — tu nie ma żadnej pętli.
export async function lektorPlay(text, ttsUrl, onStatus){
  lektorStop();
  const gen=lektorGen;                          // to odtworzenie; jeśli zmieni się — przerwij
  if(ttsUrl){
    const a=new Audio(ttsUrl); if(gen!==lektorGen) return; lektorAudio=a;
    playLektorAudio(a, gen, onStatus, 'lektor czyta…'); return;
  }
  if(piperOn){
    try{
      onStatus && onStatus('przygotowuję lepszy głos…');
      const mod = await Promise.race([ piperEnsure(p=>{ if(gen===lektorGen) onStatus&&onStatus('pobieram głos… '+p+'%'); }),
        new Promise((_,r)=>setTimeout(()=>r(new Error('load')),120000)) ]);
      if(gen!==lektorGen) return;                // runda się zmieniła w trakcie pobierania
      onStatus && onStatus('lektor czyta (Piper)…');
      const wav = await Promise.race([ mod.predict({text, voiceId:PIPER_VOICE}),
        new Promise((_,r)=>setTimeout(()=>r(new Error('synth')),60000)) ]);
      if(gen!==lektorGen) return;                // synteza skończyła się po zmianie pytania → NIE graj starego
      const url=URL.createObjectURL(wav); lektorUrl=url;
      const a=new Audio(url);
      a.addEventListener('ended',()=>{ if(lektorUrl===url){ URL.revokeObjectURL(url); lektorUrl=null; } });
      lektorAudio=a; playLektorAudio(a, gen, onStatus, 'lektor czyta (Piper)…'); return;
    }catch(e){ if(gen!==lektorGen) return; onStatus && onStatus('Piper niedostępny — głos systemowy'); }
  }
  if(gen!==lektorGen) return;
  onStatus && onStatus('lektor czyta…');
  speak(text);
}

const piperToggleBtn=document.getElementById('piperToggle');
function piperLabel(){ piperToggleBtn.textContent='🎙 lepszy głos: '+(piperOn?'wł. (Piper)':'wył.'); piperToggleBtn.classList.toggle('on',piperOn); }
piperLabel();
piperToggleBtn.onclick=()=>{
  piperOn=!piperOn; lsSet('stacjaPiper', piperOn?'1':'0'); piperLabel();
  if(piperOn){ setState('lepszy głos wł. — pierwsze użycie pobierze ~60 MB (raz)'); piperEnsure(p=>setState('pobieram głos… '+p+'%')).then(()=>setState('lepszy głos gotowy ✓')).catch(()=>{}); }
  else setState('głos systemowy');
};
