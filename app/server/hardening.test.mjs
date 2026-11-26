import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {passwordError} from './auth.mjs'
import {inlineScripts,scriptHash} from './csp-hash.mjs'
import {responseSecurityHeaders} from './security.mjs'

test('padded dictionary words are rejected even with every character class',()=>{
  for(const weak of ['Password1!','Passw0rd!','P@ssw0rd','Admin@123','Qwerty@123','Aa123456!','Welcome@2026','!!Letmein99'])assert.ok(passwordError(weak),weak)
  for(const strong of ['Zq7!mellon-Harbor','ReleaseTest#2026','Blue-Lantern-42x','MailTest#2026'])assert.equal(passwordError(strong),null,strong)
})

test('CSP never allows arbitrary inline script',()=>{
  const html='<script>a=1</script><script type="module" src="/x.js"></script><script>\r\nb=2</script>'
  assert.deepEqual(inlineScripts(html),['a=1','\r\nb=2'])
  assert.equal(scriptHash('a\r\nb'),`'sha256-${createHash('sha256').update('a\nb').digest('base64')}'`)
  const scripts=responseSecurityHeaders['Content-Security-Policy'].split('; ').find(d=>d.startsWith('script-src'))
  assert.ok(!scripts.includes('unsafe-'))
  assert.ok(!scripts.includes('tradingview'))
  assert.match(scripts,/'sha256-/)
})
