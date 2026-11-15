import test from 'node:test'
import assert from 'node:assert/strict'
import {classifyFlickerWidget,createFlickerStatus} from './flicker-status.mjs'
const unavailable="<p>Fear &amp; Greed Index isn&#x27;t available for Gold Ounce.</p>"
test('Only the explicit visible provider message means no gold index',()=>{
 assert.equal(classifyFlickerWidget(unavailable),'unavailable')
 assert.equal(classifyFlickerWidget('<script>'+unavailable+'</script><p>Fear &amp; Greed Index 32 Fear</p>'),'unknown')
 assert.equal(classifyFlickerWidget('<p>Fear &amp; Greed Index isn&#x27;t available for Bitcoin.</p>'),'unknown')
 assert.equal(classifyFlickerWidget('<p>Gateway temporarily unavailable</p>'),'unknown')
})
test('Provider checks coalesce/cache, and explicit retry refreshes after cooldown',async()=>{
 let clock=100000,calls=0,html=unavailable;const read=createFlickerStatus({now:()=>clock,request:async()=>{calls++;return new Response(html)}})
 const values=await Promise.all([read(),read(),read()]);assert.equal(calls,1);assert.equal(values[0].availability,'unavailable');assert.deepEqual(await read(true),values[0]);assert.equal(calls,1)
 clock+=16000;html='<p>Fear &amp; Greed Index 42 Neutral</p>';assert.equal((await read(true)).availability,'unknown');assert.equal(calls,2)
})
test('Network/errors and oversized responses cannot turn into an invented score/status',async()=>{
 for(const request of [async()=>{throw Error('Offline')},async()=>new Response('error',{status:503}),async()=>new Response('x'.repeat(524289)+unavailable)]){
  const status=await createFlickerStatus({request})();assert.equal(status.availability,'unknown');assert.ok(!('score' in status));assert.ok(!('price' in status))
 }
})
