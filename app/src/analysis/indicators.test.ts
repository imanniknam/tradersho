import test from 'node:test'
import assert from 'node:assert/strict'
import { bollinger, ema, macd, rsi, sma } from './indicators.ts'
const observations = (values: number[]) => values.map((value, i) => ({ date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), value }))
test('SMA and EMA respect warm-up and a hand-calculated sequence', () => {
  const points = observations([1,2,3,4,5])
  assert.deepEqual(sma(points, 3).map(p => p.value), [2,3,4])
  assert.deepEqual(ema(points, 3).map(p => p.value), [2,3,4])
  assert.deepEqual(ema(points, 6), [])
})
test('Bollinger uses population variance and collapses on constant data', () => {
  const bands = bollinger(observations([1,2,3]), 3, 2)
  assert.ok(Math.abs(bands.upper[0].value - (2 + 2 * Math.sqrt(2/3))) < 1e-12)
  const flat = bollinger(observations(Array(30).fill(1.1)))
  assert.ok(flat.upper.every((p,i) => Math.abs(p.value-flat.lower[i].value) < 1e-12))
})
test('Wilder RSI matches a reference sequence and handles zero gain/loss', () => {
  const values = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28]
  assert.ok(Math.abs(rsi(observations(values))[0].value-70.46413502109705) < 1e-9)
  assert.equal(rsi(observations(Array(20).fill(1)))[0].value,50)
  assert.equal(rsi(observations(Array.from({length:20},(_,i)=>i+1)))[0].value,100)
  assert.equal(rsi(observations(Array.from({length:20},(_,i)=>30-i)))[0].value,0)
})
test('MACD has correct warm-up and is zero for a flat series', () => {
  const result = macd(observations(Array(40).fill(1.2)))
  assert.equal(result.line.length,15)
  assert.equal(result.signal.length,7)
  assert.ok(result.histogram.every(p=>Math.abs(p.value)<1e-12))
})
test('all indicator prefixes are invariant when future observations are appended', () => {
  const prefix = observations(Array.from({length:45},(_,i)=>1+Math.sin(i)/10))
  const full = [...prefix,...observations([9,8,7]).map((p,i)=>({...p,date:`2026-01-0${i+1}`}))]
  for (const fn of [(p: typeof prefix)=>sma(p,20),(p:typeof prefix)=>ema(p,20),rsi,(p:typeof prefix)=>bollinger(p).upper,(p:typeof prefix)=>macd(p).histogram]) {
    const expected=fn(prefix), actual=fn(full).filter(p=>p.time<=prefix.at(-1)!.date)
    assert.deepEqual(actual,expected)
  }
})
