/* adapters-web/translator.js — cienki adapter do WBUDOWANEGO tłumacza przeglądarki
 * (Chrome Translator API + LanguageDetector). Tłumaczenie dzieje się lokalnie w przeglądarce —
 * żadnych zewnętrznych serwisów, tekst nie opuszcza urządzenia. Zależy tylko od `self`. */

const TARGET = 'pl';

export function translatorSupported(){
  return typeof self!=='undefined' && !!self.Translator && typeof self.Translator.create==='function';
}

/* wykryj język źródła (LanguageDetector, jeśli jest), inaczej 'en' */
async function detectLang(text){
  try{
    if(self.LanguageDetector && typeof self.LanguageDetector.create==='function'){
      const det=await self.LanguageDetector.create();
      const res=await det.detect(text);
      const top=res && res[0];
      if(top && top.detectedLanguage && top.detectedLanguage!=='und' && (top.confidence==null || top.confidence>=0.3)) return top.detectedLanguage;
    }
  }catch(_e){ /* detektor niedostępny → domyślnie angielski */ }
  return 'en';
}

/* przetłumacz na polski → string; rzuca Error z czytelnym komunikatem po polsku */
export async function translateToPolish(text){
  const src=String(text||'').trim();
  if(!src) throw new Error('Wklej najpierw tekst oryginału.');
  if(!translatorSupported()) throw new Error('Twoja przeglądarka nie tłumaczy — wpisz przekład ręcznie.');
  const sourceLanguage=await detectLang(src);
  if(sourceLanguage===TARGET) return src;   // już po polsku
  let av='unavailable';
  try{ av=await self.Translator.availability({ sourceLanguage, targetLanguage:TARGET }); }
  catch(_e){ throw new Error('Nie udało się sprawdzić dostępności tłumacza.'); }
  if(av==='unavailable') throw new Error(`Tłumacz nie obsługuje pary ${sourceLanguage} → pl. Wpisz przekład ręcznie.`);
  let tr;
  try{ tr=await self.Translator.create({ sourceLanguage, targetLanguage:TARGET }); }
  catch(_e){ throw new Error('Nie udało się uruchomić tłumacza (model językowy mógł się nie pobrać).'); }
  try{
    const out=await tr.translate(src);
    if(!out) throw new Error('empty');
    return String(out);
  }catch(_e){ throw new Error('Tłumaczenie nie powiodło się — spróbuj ponownie albo wpisz ręcznie.'); }
  finally{ try{ tr.destroy&&tr.destroy(); }catch(_e){} }
}
