import {readFile} from 'node:fs/promises'
import {createRemoteJWKSet,customFetch} from 'jose'
export class GoogleKeysUnavailableError extends Error {constructor(){super('Google signing keys unavailable or expired');this.code='GOOGLE_KEYS_UNAVAILABLE'}}
export const GOOGLE_JWKS_URL='https://www.googleapis.com/oauth2/v3/certs'
export function validateGoogleSnapshot(data,now=Date.now()){
 if(!data||data.source!==GOOGLE_JWKS_URL||!Number.isSafeInteger(data.fetchedAt)||!Number.isSafeInteger(data.expiresAt)||
  data.fetchedAt>now+30000||data.fetchedAt<now-7200000||data.expiresAt<=now||data.expiresAt<=data.fetchedAt||data.expiresAt>data.fetchedAt+7200000||
  !Array.isArray(data.keys)||data.keys.length<1||data.keys.length>10)throw Error('Google key snapshot is invalid or expired')
 const kids=new Set()
 for(const k of data.keys){
  if(!k||k.kty!=='RSA'||k.alg!=='RS256'||k.use!=='sig'||typeof k.kid!=='string'||! /^[A-Za-z0-9_.-]{1,128}$/.test(k.kid)||kids.has(k.kid)||
   typeof k.n!=='string'||! /^[A-Za-z0-9_-]{342,1024}$/.test(k.n)||k.e!=='AQAB'||Object.keys(k).some(key=>!['kty','alg','use','kid','n','e'].includes(key)))throw Error('Invalid Google public signing key')
  kids.add(k.kid)
 }
 return data
}
export function createGoogleKeyResolver({file=()=>process.env.GOOGLE_JWKS_FILE,fetcher=(...args)=>fetch(...args),now=()=>Date.now()}={}){
 let snapshotExpiresAt=0,usingSnapshot=false
 const remote=createRemoteJWKSet(new URL(GOOGLE_JWKS_URL),{[customFetch]:async(url,options)=>{
  let response
  try{response=await fetcher(url,options)}catch{}
  if(response?.status===200){snapshotExpiresAt=0;usingSnapshot=false;return response}
  try{
   const path=file();if(!path)throw Error('No key snapshot')
   const raw=await readFile(path);if(raw.length>65536)throw Error('Google key snapshot is too large')
   const snapshot=validateGoogleSnapshot(JSON.parse(raw.toString('utf8')),now());snapshotExpiresAt=snapshot.expiresAt;usingSnapshot=true
   return new Response(JSON.stringify({keys:snapshot.keys}),{status:200,headers:{'Content-Type':'application/json'}})
  }catch{throw new GoogleKeysUnavailableError()}
 }})
 return async(header,token)=>{
  // A key retained in jose's memory may never outlive the trusted snapshot's expiry.
  if(snapshotExpiresAt&&now()>=snapshotExpiresAt)await remote.reload()
  try{return await remote(header,token)}catch(error){if(usingSnapshot&&error.code==='ERR_JWKS_NO_MATCHING_KEY')throw new GoogleKeysUnavailableError();throw error}
 }
}
