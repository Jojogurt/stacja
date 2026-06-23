// auth.js — tożsamość bez Supabase: device-UUID podpisany tokenem (HS256, HMAC-SHA256).
// Worker GENERUJE id (klient nie może podstawić cudzego) i podpisuje sekretem TOKEN_SECRET.
const enc = new TextEncoder();

function b64urlBytes(bytes){
  let s=''; for(const b of new Uint8Array(bytes)) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
const b64urlStr = (str)=> btoa(unescape(encodeURIComponent(str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function fromB64url(str){
  const pad = str.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(pad), c=>c.charCodeAt(0));
}

async function key(secret){
  return crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
}

export async function signToken(secret, payload){
  const data = b64urlStr(JSON.stringify({alg:'HS256',typ:'JWT'})) + '.' + b64urlStr(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(data));
  return data + '.' + b64urlBytes(sig);
}

// zwraca payload {sub, iat, exp?} albo null, gdy podpis nie pasuje LUB token wygasł (S2)
export async function verifyToken(secret, token){
  if(!token) return null;
  const parts = String(token).split('.');
  if(parts.length !== 3) return null;
  const data = parts[0] + '.' + parts[1];
  let ok=false;
  try{ ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(parts[2]), enc.encode(data)); }catch(e){ return null; }
  if(!ok) return null;
  let payload;
  try{ payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))); }catch(e){ return null; }
  // S2: odrzuć wygasłe (tokeny bez exp — stare — przechodzą dla kompat wstecz)
  if(payload && payload.exp && Math.floor(Date.now()/1000) > payload.exp) return null;
  return payload;
}

export const newId = () => crypto.randomUUID();
export const friendCode = () => crypto.randomUUID().replace(/-/g,'').slice(0,6).toUpperCase();
