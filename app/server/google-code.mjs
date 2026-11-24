import {createHash,timingSafeEqual} from 'node:crypto'
import {decodeJwt,decodeProtectedHeader,jwtVerify} from 'jose'
import {GoogleKeysUnavailableError} from './google-jwks.mjs'
export const GOOGLE_TOKEN_URL='https://oauth2.googleapis.com/token'
export const GOOGLE_USERINFO_URL='https://openidconnect.googleapis.com/v1/userinfo'
const requestOptions={redirect:'error',credentials:'omit',cache:'no-store'}
async function googleJson(response){
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Google endpoint rejected the request')
 const reader=response.body.getReader(),parts=[];let size=0
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('Google response too large');parts.push(Buffer.from(value))}}finally{await reader.cancel().catch(()=>{})}
 return JSON.parse(Buffer.concat(parts).toString('utf8'))
}
function codeClaims(token,clientId,nonce,now){
 if(typeof token!=='string'||token.length>16384||! /^[\w-]+\.[\w-]+\.[\w-]{342,1024}$/.test(token))throw Error('Invalid Google ID token')
 const header=decodeProtectedHeader(token),p=decodeJwt(token),seconds=Math.floor(now/1000)
 if(header.alg!=='RS256'||typeof header.kid!=='string'||! /^[\w.-]{1,128}$/.test(header.kid)||header.crit||header.jku||header.jwk||header.x5u)throw Error('Invalid Google token header')
 const audience=Array.isArray(p.aud)?p.aud:[p.aud]
 if(!['https://accounts.google.com','accounts.google.com'].includes(p.iss)||audience.length!==1||audience[0]!==clientId||p.azp!==undefined&&p.azp!==clientId)throw Error('Invalid Google token recipient')
 if(!Number.isSafeInteger(p.exp)||!Number.isSafeInteger(p.iat)||p.exp<=seconds||p.iat>seconds||seconds-p.iat>600||p.exp<=p.iat)throw Error('Expired or invalid Google token time')
 if(typeof nonce!=='string'||!nonce||p.nonce!==nonce||typeof p.sub!=='string'||!p.sub||p.sub.length>255)throw Error('Invalid Google token binding')
 return p
}
// Only this server-to-server authorization-code exchange may use OIDC Core 3.1.3.7's
// authenticated TLS token response validation. No browser-supplied token is accepted.
export async function exchangeGoogleCode({clientId,secret,callback,code,verifier,nonce,keyResolver,fetcher=(...args)=>fetch(...args),now=()=>Date.now()}){
 const tokens=await googleJson(await fetcher(GOOGLE_TOKEN_URL,{...requestOptions,method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,client_secret:secret,redirect_uri:callback,code,code_verifier:verifier})}))
 const claims=codeClaims(tokens.id_token,clientId,nonce,now())
 try{
  return (await jwtVerify(tokens.id_token,keyResolver,{issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub'],maxTokenAge:'10 minutes',currentDate:new Date(now())})).payload
 }catch(error){if(!(error instanceof GoogleKeysUnavailableError))throw error}
 // An invalid signature or an unknown key in a healthy JWKS response never reaches here.
 const access=tokens.access_token
 if(tokens.token_type?.toLowerCase()!=='bearer'||typeof access!=='string'||! /^[\x21-\x7e]{1,8192}$/.test(access))throw Error('Invalid Google access token')
 if(claims.at_hash!==undefined){const expected=createHash('sha256').update(access,'ascii').digest().subarray(0,16).toString('base64url'),a=Buffer.from(String(claims.at_hash)),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))throw Error('Google access token binding mismatch')}
 const profile=await googleJson(await fetcher(GOOGLE_USERINFO_URL,{...requestOptions,signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+access,Accept:'application/json'}}))
 if(profile.sub!==claims.sub||typeof profile.sub!=='string'||claims.email!==undefined&&profile.email!==claims.email||claims.email_verified!==undefined&&profile.email_verified!==claims.email_verified)throw Error('Google UserInfo identity mismatch')
 return {...claims,name:profile.name,email:profile.email,email_verified:profile.email_verified===true}
}
