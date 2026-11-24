import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {generateKeyPair,exportJWK,SignJWT,jwtVerify} from 'jose'
import {createGoogleKeyResolver,validateGoogleSnapshot,GOOGLE_JWKS_URL} from './google-jwks.mjs'

test('fresh trusted cache verifies real RSA JWTs during an upstream outage and never accepts forgery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'google-jwks-')),file=join(dir,'jwks.json'),pair=await generateKeyPair('RS256')
 let now=Date.now();const key={...await exportJWK(pair.publicKey),kid:'test-key',use:'sig',alg:'RS256'},snapshot={source:GOOGLE_JWKS_URL,fetchedAt:now,expiresAt:now+60000,keys:[key]}
 const options={issuer:'https://accounts.google.com',audience:'qa-client',algorithms:['RS256']}
 const sign=privateKey=>new SignJWT({nonce:'qa-nonce'}).setProtectedHeader({alg:'RS256',kid:key.kid}).setIssuer(options.issuer).setAudience(options.audience).setSubject('qa-user').setIssuedAt().setExpirationTime('1h').sign(privateKey)
 try{
  await writeFile(file,JSON.stringify(snapshot));const resolve=createGoogleKeyResolver({file:()=>file,now:()=>now,fetcher:async()=>new Response('unavailable',{status:403})})
  const token=await sign(pair.privateKey);assert.equal((await jwtVerify(token,resolve,options)).payload.sub,'qa-user')
  await assert.rejects(resolve({alg:'RS256',kid:'new-key-during-outage'},{}),e=>e.code==='GOOGLE_KEYS_UNAVAILABLE')
  await assert.rejects(jwtVerify(token,resolve,{...options,audience:'other-client'}),e=>e.code==='ERR_JWT_CLAIM_VALIDATION_FAILED')
  const attacker=await generateKeyPair('RS256');await assert.rejects(jwtVerify(await sign(attacker.privateKey),resolve,options),e=>e.code==='ERR_JWS_SIGNATURE_VERIFICATION_FAILED')
  // Even the key already cached by jose cannot survive the snapshot's expiry.
  now=snapshot.expiresAt+1;await assert.rejects(jwtVerify(token,resolve,options),/expired/)
  const another=await generateKeyPair('RS256'),remoteKey={...await exportJWK(another.publicKey),kid:'new-google-key',alg:'RS256',use:'sig'}
  const healthy=createGoogleKeyResolver({file:()=>file,fetcher:async()=>Response.json({keys:[remoteKey]})})
  await assert.rejects(jwtVerify(token,healthy,options),e=>e.code==='ERR_JWKS_NO_MATCHING_KEY')
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('public key cache rejects expired, future, foreign, duplicate and private key material',async()=>{
 const now=Date.now(),{publicKey}=await generateKeyPair('RS256'),key={...await exportJWK(publicKey),kid:'qa',alg:'RS256',use:'sig'}
 const data={source:GOOGLE_JWKS_URL,fetchedAt:now,expiresAt:now+3600000,keys:[key]}
 assert.equal(validateGoogleSnapshot(data,now),data)
 for(const change of [{source:'https://attacker.invalid/keys'},{expiresAt:now-1},{fetchedAt:now+31000},{expiresAt:now+7200001},{keys:[key,key]},{keys:[{...key,d:'private-key'}]},{keys:[{...key,alg:'HS256'}]},{keys:[]}])assert.throws(()=>validateGoogleSnapshot({...data,...change},now))
})
