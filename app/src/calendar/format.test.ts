import {test} from 'node:test'
import assert from 'node:assert/strict'
import {formatEconomicValue,economicOutcome,eventCountdown} from './format.ts'
test('economic amounts preserve decimals, scale and currency as separate fields',()=>{
 assert.deepEqual(formatEconomicValue({value:'3.012',unit:'million'}),{number:'3.012',unit:'میلیون',currency:''})
 assert.deepEqual(formatEconomicValue({value:'5.05',unit:'billion',currency:'EUR'}),{number:'5.05',unit:'میلیارد',currency:'EUR'})
 assert.equal(formatEconomicValue({value:'-12',unit:'thousand'})?.number,'−12')
 assert.equal(formatEconomicValue({value:'-0.00',unit:'percent'})?.number,'0.00')
 assert.equal(formatEconomicValue({value:'12345678901234567890.010'})?.number,'12,345,678,901,234,567,890.010')
})
test('ambiguous localized values and missing observations never become guessed numbers',()=>{
 for(const value of ['3,012','۱۲','12-','1e6','NaN','2M','1.234.56',''])assert.equal(formatEconomicValue({value}),null)
 assert.equal(formatEconomicValue(null),null)
 assert.equal(formatEconomicValue({value:'0'})?.number,'0')
})

test('actual result colours respect publisher direction, units, exact decimals and unknowns',()=>{
 assert.equal(economicOutcome({value:'4.6',unit:'percent'},{value:'3.8',unit:'percent'},'higher'),'positive')
 assert.equal(economicOutcome({value:'4.6'},{value:'3.8'},'lower'),'negative')
 assert.equal(economicOutcome({value:'0'},{value:'0'},'higher'),'neutral')
 assert.equal(economicOutcome({value:'1',unit:'million'},{value:'1000',unit:'thousand'},'higher'),'neutral')
 assert.equal(economicOutcome({value:'9007199254740993'},{value:'9007199254740992'},'higher'),'positive')
 assert.equal(economicOutcome({value:'-2'},{value:'-1'},'lower'),'positive')
 assert.equal(economicOutcome(null,{value:'0'},'higher'),'neutral')
 assert.equal(economicOutcome({value:'2'},{value:'1'}),'neutral')
 assert.equal(economicOutcome({value:'2',unit:'percent'},{value:'1'},'higher'),'neutral')
})
test('release countdown expires without inventing time for date-only events',()=>{
 const now=Date.parse('2026-11-06T12:00:00Z');assert.equal(eventCountdown('2026-11-06T12:01:02Z',now),'00:01:02');assert.equal(eventCountdown(null,now),null);assert.equal(eventCountdown('2026-11-06T11:59:59Z',now),null)
})
