import test from 'node:test'
import assert from 'node:assert/strict'
import {base32,fromBase32,totpAt,matchTotp,sealSecret,openSecret} from './owner-security.mjs'
test('RFC 6238 SHA-1 vector and time-window validation',()=>{
 const secret=base32(Buffer.from('12345678901234567890'))
 assert.equal(fromBase32(secret).toString(),'12345678901234567890')
 assert.equal(totpAt(secret,1),'287082')
 assert.equal(matchTotp(secret,'287082',59000),1)
 assert.equal(matchTotp(secret,'287082',120000),null)
 assert.equal(matchTotp(secret,'bad',59000),null)
})
test('encrypted MFA secrets authenticate their ciphertext and key',()=>{
 const k='ab'.repeat(32),box=sealSecret('JBSWY3DPEHPK3PXP',k)
 assert.equal(openSecret(box,k),'JBSWY3DPEHPK3PXP')
 assert.throws(()=>openSecret(box,'cd'.repeat(32)))
 assert.throws(()=>openSecret(box+'x',k))
})
