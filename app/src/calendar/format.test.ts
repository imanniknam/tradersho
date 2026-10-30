import {test} from 'node:test'
import assert from 'node:assert/strict'
import {formatEconomicValue} from './format.ts'
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
