/* adapters-web/captcha.js — hCaptcha (invisible) tylko do anonimowego logowania.
 * Renderuje ukryty widżet i zwraca świeży, jednorazowy token do
 * signInAnonymously({ options:{ captchaToken } }). Bez klucza/skryptu → null
 * (auth padnie z czytelnym błędem, a gra leci na fallbacku). */
let _widgetId=null, _scriptReady=null;

function loadScript(){
  if(_scriptReady) return _scriptReady;
  _scriptReady=new Promise(resolve=>{
    if(window.hcaptcha) return resolve();
    const s=document.createElement('script');
    s.src='https://js.hcaptcha.com/1/api.js?render=explicit';
    s.async=true; s.defer=true;
    s.onload=()=>resolve();
    s.onerror=()=>resolve();   // brak sieci/skryptu → token null
    document.head.appendChild(s);
  });
  return _scriptReady;
}

// świeży token hCaptcha (invisible) albo null
export async function captchaToken(siteKey){
  if(!siteKey) return null;
  await loadScript();
  if(!window.hcaptcha) return null;
  try{
    if(_widgetId===null){
      let box=document.getElementById('hcaptchaBox');
      if(!box){ box=document.createElement('div'); box.id='hcaptchaBox'; box.style.display='none'; document.body.appendChild(box); }
      _widgetId=window.hcaptcha.render(box, { sitekey:siteKey, size:'invisible' });
    }
    const { response }=await window.hcaptcha.execute(_widgetId, { async:true });
    return response || null;
  }catch(e){ console.warn('[stacja] hCaptcha:', e?.message||e); return null; }
}
