/* server/lib/oauth.js — weryfikacja ID-tokenów Google/Apple (Sign in with …).
 * Klient (GIS / Sign in with Apple JS) dostaje ID-token (JWT RS256); Worker weryfikuje
 * podpis kluczami publicznymi providera (JWKS) + iss/aud/exp. ŻADNYCH sekretów —
 * `aud` (Client ID / Services ID) jest publiczny, podany w env. Zwraca {sub, email}. */

const JWKS = { google:'https://www.googleapis.com/oauth2/v3/certs', apple:'https://appleid.apple.com/auth/keys' };
const ISS  = { google:['https://accounts.google.com','accounts.google.com'], apple:['https://appleid.apple.com'] };

const _cache = {};   // provider → { time, keys:{ kid: CryptoKey } }

function b64urlBytes(s){ const pad=String(s).replace(/-/g,'+').replace(/_/g,'/'); return Uint8Array.from(atob(pad), c=>c.charCodeAt(0)); }
function b64urlJson(s){ return JSON.parse(new TextDecoder().decode(b64urlBytes(s))); }

async function keyFor(provider, kid){
  const c=_cache[provider];
  if(c && c.keys[kid] && (Date.now()-c.time) < 3600_000) return c.keys[kid];
  const r=await fetch(JWKS[provider]); if(!r.ok) throw new Error('jwks '+r.status);
  const { keys }=await r.json();
  const map={};
  for(const jwk of (keys||[])){
    try{ map[jwk.kid]=await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']); }catch(_e){}
  }
  _cache[provider]={ time:Date.now(), keys:map };
  return map[kid];
}

// zwróć {sub, email} albo null. `audience` = Google Client ID lub Apple Services ID.
export async function verifyIdToken(provider, token, audience){
  if(!JWKS[provider] || !token || !audience) return null;
  const parts=String(token).split('.'); if(parts.length!==3) return null;
  let header, payload;
  try{ header=b64urlJson(parts[0]); payload=b64urlJson(parts[1]); }catch{ return null; }
  let key; try{ key=await keyFor(provider, header.kid); }catch{ return null; }
  if(!key) return null;
  let ok=false;
  try{ ok=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'}, key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0]+'.'+parts[1])); }catch{ return null; }
  if(!ok) return null;
  if(!(ISS[provider]||[]).includes(payload.iss)) return null;
  const aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(!aud.includes(audience)) return null;
  if(payload.exp && Math.floor(Date.now()/1000) > payload.exp) return null;
  if(!payload.sub) return null;
  return { sub:String(payload.sub), email: payload.email || null };
}
