import test from 'node:test'
import assert from 'node:assert/strict'
import {allowedOrigin,browserBindingHash,workLimiter,secureCookie} from './security.mjs'
import {makeCaptcha} from './captcha-image.mjs'

test('request origin comes from configuration, never forwarded client headers',()=>{
 const req=(origin,extra={})=>({headers:{host:'panel.example.test',origin,...extra}})
 assert.equal(allowedOrigin(req('https://panel.example.test'),'https://panel.example.test'),true)
 for(const origin of ['http://panel.example.test','https://sibling.example.test','https://attacker.invalid','null','https://panel.example.test:444'])
  assert.equal(allowedOrigin(req(origin,{'x-forwarded-host':new URL(origin==='null'?'https://attacker.invalid':origin).host}),'https://panel.example.test'),false)
 assert.equal(allowedOrigin(req('https://attacker.invalid',{'x-forwarded-host':'attacker.invalid'}),undefined),false)
 assert.equal(allowedOrigin({headers:{host:'127.0.0.1:5183',origin:'http://localhost:5173'}},undefined),true)
 assert.equal(browserBindingHash('a'.repeat(64))?.length,64)
 assert.equal(browserBindingHash('not-a-browser-token'),null)
})
test('secure production cookies do not trust a forged localhost Host header',()=>{
 const old={NODE_ENV:process.env.NODE_ENV,APP_PUBLIC_URL:process.env.APP_PUBLIC_URL}
 try{process.env.NODE_ENV='production';process.env.APP_PUBLIC_URL='https://panel.example.test';assert.equal(secureCookie({headers:{host:'localhost'}}),true)}
 finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
})
test('password work is bounded and a failed task releases the queued request',async()=>{
 const run=workLimiter({concurrency:1,waiting:1}),order=[]
 let release;const gate=new Promise(resolve=>release=resolve)
 const first=assert.rejects(run(async()=>{order.push('first');await gate;throw Error('failed password work')}),/failed password work/)
 const second=run(async()=>{order.push('second');return 'done'})
 await assert.rejects(run(async()=>order.push('overflow')),e=>e.status===503)
 assert.deepEqual(order,['first']);release();await first;assert.equal(await second,'done');assert.deepEqual(order,['first','second'])
 assert.equal(await run(async()=>42),42)
})
test('captcha raster has six digits and a fixed, small PNG without text chunks',()=>{
 for(let n=0;n<10;n++){
  const {answer,png}=makeCaptcha();assert.match(answer,/^\d{6}$/);assert.equal(png.readUInt32BE(16),190);assert.equal(png.readUInt32BE(20),64)
  const chunks=[];for(let offset=8;offset<png.length;){chunks.push(png.toString('ascii',offset+4,offset+8));offset+=png.readUInt32BE(offset)+12}assert.deepEqual(chunks,['IHDR','IDAT','IEND'])
 }
})

test('nonnumeric proof is signed, bounded, expires and rejects forged KDF parameters',async()=>{
 const {makePowChallenge,verifyPowPayload}=await import('./captcha-pow.mjs')
 const {solveChallenge}=await import('altcha-lib'),{deriveKey}=await import('altcha-lib/algorithms/pbkdf2')
 const secret='unit-only-captcha-secret-not-production',id='unit-proof'
 const challenge=await makePowChallenge(id,secret),solution=await solveChallenge({challenge,deriveKey})
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64'),valid={challenge,solution}
 assert.equal(await verifyPowPayload(encode(valid),id,challenge.signature,secret),true)
 assert.equal(await verifyPowPayload(encode(valid),'other',challenge.signature,secret),false)
 assert.equal(await verifyPowPayload(encode(valid),id,challenge.signature,'wrong-secret'),false)
 for(const changed of [{cost:1},{cost:1e12},{algorithm:'SCRYPT'},{keySignature:null},{expiresAt:1}]){
  assert.equal(await verifyPowPayload(encode({...valid,challenge:{...challenge,parameters:{...challenge.parameters,...changed}}}),id,challenge.signature,secret),false)
 }
 for(const answer of ['','{}','0'.repeat(8193),encode({test:true}),encode({...valid,solution:{counter:0,derivedKey:'0'.repeat(64)}})])assert.equal(await verifyPowPayload(answer,id,challenge.signature,secret),false)
})
