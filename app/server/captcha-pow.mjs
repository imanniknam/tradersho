import {createHmac,randomInt,timingSafeEqual} from 'node:crypto'
import {createChallenge,verifySolution} from 'altcha-lib'
import {deriveKey} from 'altcha-lib/algorithms/pbkdf2'

const keySecret=secret=>createHmac('sha256',secret).update('tradersho/captcha/pow/key/v1').digest('hex')
export async function makePowChallenge(id,secret){
 return createChallenge({algorithm:'PBKDF2/SHA-256',cost:1500,counter:randomInt(2000,4001),deriveKey,
  expiresAt:new Date(Date.now()+180000),data:{challengeId:id},
  hmacSignatureSecret:secret,hmacKeySignatureSecret:keySecret(secret)})
}
export async function verifyPowPayload(answer,id,signature,secret){
 if(typeof answer!=='string'||answer.length>8192||! /^[A-Za-z0-9+/]+={0,2}$/.test(answer))return false
 try{
  const {challenge,solution}=JSON.parse(Buffer.from(answer,'base64').toString('utf8'))
  if(typeof challenge?.signature!=='string'||! /^[a-f0-9]{64}$/.test(challenge.signature)||
    typeof signature!=='string'||! /^[a-f0-9]{64}$/.test(signature)||
    !timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(challenge.signature,'hex'))||
    challenge.parameters?.data?.challengeId!==id||challenge.parameters.algorithm!=='PBKDF2/SHA-256'||
    challenge.parameters.cost!==1500||typeof challenge.parameters.keySignature!=='string'||
    ! /^[a-f0-9]{64}$/.test(challenge.parameters.keySignature)||
    typeof solution?.derivedKey!=='string'||! /^[a-f0-9]{64}$/.test(solution.derivedKey))return false
  // The signed key makes verification HMAC-only; attacker-controlled KDF work never runs here.
  return (await verifySolution({challenge,solution,deriveKey:()=>{throw Error('Unexpected KDF verification')},
    hmacSignatureSecret:secret,hmacKeySignatureSecret:keySecret(secret)})).verified===true
 }catch{return false}
}
