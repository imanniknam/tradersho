import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose'
import {exchangeGoogleCode,GOOGLE_TOKEN_URL,GOOGLE_USERINFO_URL} from './google-code.mjs'
import {GoogleKeysUnavailableError} from './google-jwks.mjs'
const pair=await generateKeyPair('RS256'),attacker=await generateKeyPair('RS256'),jwk={...await exportJWK(pair.publicKey),kid:'qa',use:'sig',alg:'RS256'},resolver=createLocalJWKSet({keys:[jwk]})
const time=Date.now(),seconds=Math.floor(time/1000),access='qa-google-access-token',hash=createHash('sha256').update(access).digest().subarray(0,16).toString('base64url')
const base={iss:'https://accounts.google.com',aud:'qa-client',sub:'google-subject',nonce:'qa-nonce',iat:seconds,exp:seconds+3600,email:'qa@example.test',email_verified:true,name:'Google QA',at_hash:hash}
async function attempt({claims={},header={},signer=pair.privateKey,keyResolver=async()=>{throw new GoogleKeysUnavailableError()},profile={},tokens={},tokenStatus=200,profileStatus=200,fetchError}={}){
 const token=await new SignJWT({...base,...claims}).setProtectedHeader({alg:'RS256',kid:'qa',...header}).sign(signer),calls=[]
 const result=exchangeGoogleCode({clientId:'qa-client',secret:'qa-secret',callback:'https://panel.example.test/api/auth/social/google/callback',code:'qa-code',verifier:'qa-verifier',nonce:'qa-nonce',keyResolver,now:()=>time,fetcher:async(url,options)=>{
  calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');if(fetchError)throw fetchError
  if(url===GOOGLE_TOKEN_URL){assert.equal(options.method,'POST');assert.equal(options.body.get('code'),'qa-code');assert.equal(options.body.get('code_verifier'),'qa-verifier');assert.equal(options.body.get('client_secret'),'qa-secret');return Response.json({id_token:token,access_token:access,token_type:'Bearer',...tokens},{status:tokenStatus})}
  assert.equal(url,GOOGLE_USERINFO_URL);assert.equal(options.headers.Authorization,'Bearer '+access);assert.equal(options.body,undefined);return Response.json({sub:base.sub,email:base.email,email_verified:true,name:'UserInfo QA',...profile},{status:profileStatus})
 }})
 return {result,calls}
}
test('Google key outage uses only authenticated code exchange and matching official UserInfo',async()=>{
 const {result,calls}=await attempt();assert.equal((await result).name,'UserInfo QA');assert.deepEqual(calls,[GOOGLE_TOKEN_URL,GOOGLE_USERINFO_URL])
 const signed=await attempt({keyResolver:resolver});assert.equal((await signed.result).name,'Google QA');assert.deepEqual(signed.calls,[GOOGLE_TOKEN_URL])
})
test('available-key signature failures and healthy unknown keys never use UserInfo',async()=>{
 for(const options of [{signer:attacker.privateKey,keyResolver:resolver},{header:{kid:'unknown'},keyResolver:resolver}]){const {result,calls}=await attempt(options);await assert.rejects(result);assert.deepEqual(calls,[GOOGLE_TOKEN_URL])}
})
test('outage path rejects recipient, issuer, nonce, time, subject and access-token substitution',async()=>{
 for(const options of [
  ...[{aud:'other-client'},{aud:['qa-client','other-client']},{iss:'https://attacker.invalid'},{azp:'other-client'},{nonce:'other-nonce'},{iat:seconds+60},{iat:seconds-601},{exp:seconds},{sub:''},{at_hash:'incorrect'}].map(claims=>({claims})),
  {tokens:{id_token:'not-a-google-token'}},{tokens:{id_token:Buffer.from(JSON.stringify({alg:'none',kid:'qa'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(base)).toString('base64url')+'.'+'a'.repeat(342)}},{tokens:{access_token:''}},{tokens:{access_token:'bad\r\nheader'}},{tokens:{token_type:'Other'}},
  {profile:{sub:'other-subject'}},{profile:{email:'other@example.test'}},{profile:{email_verified:false}},
  {tokenStatus:400},{profileStatus:401},{fetchError:Error('TLS validation failed')}
 ]){const {result}=await attempt(options);await assert.rejects(result)}
})
