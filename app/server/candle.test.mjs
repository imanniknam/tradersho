import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {aggregate,nextCursor,demoBars,validateBars} from './candle-market.mjs'
import {account,command,settle,paperView} from './candle-paper.mjs'
import {drawingsView} from './candle-drawings.mjs'
const time=1735689600
const bar=(open=1.1,high=1.102,low=1.099,close=1.101,i=0)=>({time:time+i*60,open,high,low,close,volume:10})
const order=(s,input,c=0,b=bar())=>command(s,{...input,requestId:randomUUID()},b,c)
test('higher timeframe uses only revealed M1 prefix, preserves O/H/L/C/V',()=>{
 const bars=[bar(1.1,1.102,1.099,1.101),bar(1.101,1.105,1.1,1.104,1),bar(1.104,1.9,1,1.5,2)]
 assert.deepEqual(aggregate(bars,1,'5m'),[{time,open:1.1,high:1.105,low:1.099,close:1.104,volume:20}])
 assert.equal(aggregate(bars,0,'5m')[0].high,1.102)
 assert.throws(()=>aggregate(bars,0,'future'))
})
test('one next candle finishes partial bar, then advances a full next bar',()=>{
 assert.equal(nextCursor(demoBars,10080,'1m'),10081)
 assert.equal(nextCursor(demoBars,10080,'15m'),10094)
 assert.equal(nextCursor(demoBars,10094,'15m'),10109)
 assert.equal(nextCursor(demoBars,demoBars.length-2,'1D'),demoBars.length-1)
})
test('CSV OHLC validation rejects duplicates, high/low errors and six decimals',()=>{
 const rows=demoBars.slice(0,60);assert.equal(validateBars(rows).length,60)
 assert.throws(()=>validateBars([...rows.slice(0,59),rows[58]]))
 assert.throws(()=>validateBars(rows.map((b,i)=>i===2?{...b,high:.1}:b)))
 assert.throws(()=>validateBars(rows.map((b,i)=>i===2?{...b,close:1.123456}:b)))
 assert.throws(()=>validateBars(rows.slice(0,10)))
})
test('paper order fills next M1 open and cents settle server side',()=>{
 let s=order(account('5000'),{action:'open',side:'buy',units:1000})
 assert.equal(s.positions.length,0)
 s=settle(s,bar(1.101,1.103,1.1,1.102,1),1)
 assert.equal(paperView(s,1.102).positions[0].entry,1.101)
 s=order(s,{action:'close',positionId:s.positions[0].id},1,bar(1.101,1.103,1.1,1.102,1))
 s=settle(s,bar(1.104,1.105,1.103,1.104,2),2)
 assert.equal(paperView(s,1.104).balance,'5003.00')
 assert.equal(s.trades[0].reason,'manual')
})
test('short profit, five decimal precision and retry protection',()=>{
 let s=account('5000'),input={action:'open',side:'sell',units:100000,requestId:randomUUID()}
 // insufficient collateral at 1:1
 assert.throws(()=>command(s,input,bar(),0))
 input.units=1000;s=command(s,input,bar(),0)
 assert.deepEqual(command(s,input,bar(),0),s)
 s=settle(s,bar(1.10001,1.101,1.099,1.1,1),1)
 s=order(s,{action:'close',positionId:s.positions[0].id},1)
 s=settle(s,bar(1.09999,1.101,1.099,1.1,2),2)
 assert.equal(paperView(s,1.1).balance,'5000.02')
})
test('SL and TP touching in one M1 bar conservatively takes stop; gap gets open',()=>{
 let s=order(account('5000'),{action:'open',side:'buy',units:1000,stop:1.1,target:1.102},0,bar(1.101,1.102,1.1,1.101))
 s=settle(s,bar(1.101,1.103,1.099,1.102,1),1)
 assert.equal(s.trades[0].reason,'stop');assert.equal(s.trades[0].exit,1.1)
 s=order(account('5000'),{action:'open',side:'buy',units:1000,stop:1.1,target:1.104},0,bar(1.101,1.102,1.1,1.101))
 s=settle(s,bar(1.099,1.103,1.098,1.102,1),1)
 assert.equal(s.trades[0].exit,1.099)
})
test('drawings validate exact anchor count, future, text and price',()=>{
 const d={id:randomUUID(),type:'channel',anchors:[{time,price:1.1},{time:time+60,price:1.11},{time:time+120,price:1.12}],text:'x'.repeat(200)}
 assert.equal(drawingsView([d],time,time+120)[0].text.length,120)
 assert.throws(()=>drawingsView([d],time,time+60))
 assert.throws(()=>drawingsView([{...d,type:'horizontal'}],time,time+120))
 assert.throws(()=>drawingsView([d,d],time,time+120))
})
