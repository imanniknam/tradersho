import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { initialSimulation, simulationCommand, settleSimulation, simulationView } from './simulation.mjs'
const command=(state,input,cursor=0,value=1)=>simulationCommand(state,{...input,requestId:input.requestId||randomUUID()},cursor,value,`2025-01-0${cursor+1}`)
test('long order fills at the next observation and realizes cent-accurate profit',()=>{
  let state=command(initialSimulation('10000'),{action:'open',side:'buy',units:1000})
  assert.equal(state.positions.length,0)
  state=settleSimulation(state,1,1.1,'2025-01-02')
  assert.equal(state.positions[0].entryTicks,11000)
  state=settleSimulation(state,2,1.2,'2025-01-03')
  assert.equal(simulationView(state,1.2).equity,'10100.00')
  state=command(state,{action:'close',positionId:state.positions[0].id},2,1.2)
  assert.equal(state.positions.length,1)
  state=settleSimulation(state,3,1.15,'2025-01-04')
  assert.equal(state.positions.length,0)
  assert.equal(state.balanceCents,'1005000')
  assert.equal(simulationView(state,1.15).report.netProfit,'50.00')
  assert.equal(state.trades.length,1)
})
test('short profits when the reference rate falls; cancellation never fills',()=>{
  let state=command(initialSimulation(),{action:'open',side:'sell',units:1000},0,1.2)
  state=settleSimulation(state,1,1.2,'2025-01-02')
  assert.equal(simulationView(state,1.1).unrealized,'100.00')
  const cancelled=command(initialSimulation(),{action:'open',side:'buy',units:50})
  const cancelledState=command(cancelled,{action:'cancel',orderId:cancelled.orders[0].id})
  assert.equal(settleSimulation(cancelledState,1,1.1,'2025-01-02').positions.length,0)
})
test('a repeated command and repeated settlement cannot execute twice',()=>{
  const requestId=randomUUID(),input={action:'open',side:'buy',units:10,requestId}
  let state=command(initialSimulation(),input)
  assert.equal(command(state,input).orders.length,1)
  state=settleSimulation(state,1,1.1,'2025-01-02')
  assert.equal(settleSimulation(state,1,1.1,'2025-01-02').positions.length,1)
})
test('insufficient funds, negative/fractional units and invalid amounts are rejected',()=>{
  for(const balance of ['99','10000001','NaN','100.001','-100',1000])assert.throws(()=>initialSimulation(balance))
  for(const units of [-1,0,1.5,1_000_001])assert.throws(()=>command(initialSimulation(),{action:'open',side:'buy',units}))
  assert.throws(()=>command(initialSimulation('100'),{action:'open',side:'buy',units:200}))
  let state=command(initialSimulation('100'),{action:'open',side:'buy',units:90})
  state=settleSimulation(state,1,1.2,'2025-01-02')
  assert.equal(state.orders[0].status,'rejected')
  assert.equal(state.balanceCents,'10000')
})
test('paper account never trusts a client-supplied balance or result',()=>{
  const state=command(initialSimulation('100.25'),{action:'open',side:'buy',units:1,balanceCents:'99999999',profit:999999})
  assert.equal(state.balanceCents,'10025')
  assert.equal(state.trades.length,0)
  const filled=settleSimulation(state,1,1.0001,'2025-01-02')
  assert.equal(simulationView(filled,.9951).unrealized,'-0.01')
})
