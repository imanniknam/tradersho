import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32(bytes) {
  let value=0,bits=0,out=''
  for (const byte of bytes) {
    value=(value<<8)|byte;bits+=8
    while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5}
  }
  if(bits)out+=alphabet[(value<<(5-bits))&31]
  return out
}
export function fromBase32(text) {
  if(typeof text!=='string'||!/^[A-Z2-7]+$/.test(text)||text.length>128)throw new Error('Invalid base32 secret')
  let value=0,bits=0,out=[]
  for(const c of text){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}
  return Buffer.from(out)
}
export function generateSecret(){return base32(randomBytes(20))}
export function totpAt(secret, counter) {
  if(!Number.isSafeInteger(counter)||counter<0)throw new Error('Invalid counter')
  const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(counter))
  const digest=createHmac('sha1',fromBase32(secret)).update(message).digest(), offset=digest[digest.length-1]&15
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
}
export function matchTotp(secret, code, now=Date.now()) {
  if(typeof code!=='string'||!/^\d{6}$/.test(code))return null
  const c=Math.floor(now/30000), supplied=Buffer.from(code)
  for(const n of [c-1,c,c+1])if(n>=0&&timingSafeEqual(Buffer.from(totpAt(secret,n)),supplied))return n
  return null
}
function key(raw){if(!/^[a-f0-9]{64}$/i.test(raw||''))throw new Error('Owner MFA key missing');return Buffer.from(raw,'hex')}
export function sealSecret(secret, rawKey) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(rawKey),iv)
  const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()])
  return [iv,cipher.getAuthTag(),ciphertext].map(x=>x.toString('base64url')).join('.')
}
export function openSecret(box, rawKey) {
  const parts=String(box).split('.');if(parts.length!==3)throw new Error('Invalid owner MFA secret')
  const [iv,tag,ciphertext]=parts.map(x=>Buffer.from(x,'base64url'))
  if(iv.length!==12||tag.length!==16)throw new Error('Invalid owner MFA secret')
  const decipher=createDecipheriv('aes-256-gcm',key(rawKey),iv);decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8')
}
