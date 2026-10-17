import test from 'node:test'
import assert from 'node:assert/strict'
import {atr,wma,hull,stochastic,cci,vwap,obv,donchian,heikin} from './indicators.ts'
import {parseCsv} from './importCsv.ts'
const bars=Array.from({length:60},(_,i)=>({time:1735689600+i*60,open:1,high:2,low:0.5,close:1,volume:10}))
test('WMA weighted reference, flat Hull and Wilder ATR',()=>{
 assert.equal(wma([{time:1,value:1},{time:2,value:2},{time:3,value:3}],3)[0].value,14/6)
 assert.ok(hull(bars,20).every(p=>Math.abs(p.value-1)<1e-12))
 assert.ok(atr(bars).every(p=>p.value===1.5))
})
test('stochastic, CCI, VWAP, OBV, Donchian and Heikin reference values',()=>{
 assert.equal(stochastic(bars).k[0].value,100/3)
 assert.ok(cci(bars).every(p=>Math.abs(p.value)<1e-10))
 assert.equal(vwap(bars)[0].value,3.5/3)
 assert.ok(obv(bars).every(p=>p.value===0))
 assert.equal(donchian(bars,20)[0].high,2)
 const h=heikin(bars);assert.equal(h[0].close,1.125);assert.equal(h[1].open,1.0625)
 assert.equal(vwap(bars.map(b=>({...b,volume:0}))).length,0)
})
test('new indicators never use future suffix',()=>{
 const sample=bars.map((b,i)=>({...b,close:1+Math.sin(i)*.2}))
 for(const calculate of [(b:typeof bars)=>hull(b,20),atr,cci,vwap,obv]){
   const prefix=calculate(sample.slice(0,40)),full=calculate(sample).filter(p=>p.time<=sample[39].time)
   assert.deepEqual(prefix,full)
 }
})
test('CSV parser requires explicit UTC, complete numeric values and headers',()=>{
 const csv='time,open,high,low,close,volume\n'+bars.map(b=>[new Date(b.time*1000).toISOString(),b.open,b.high,b.low,b.close,b.volume].join(',')).join('\n')
 assert.equal(parseCsv(csv).length,60)
 assert.throws(()=>parseCsv(csv.replaceAll('Z','')))
 assert.throws(()=>parseCsv(csv.replace('1,2,0.5,1,10',',2,0.5,1,10')))
})
