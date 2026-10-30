import test from 'node:test'
import assert from 'node:assert/strict'
process.env.DATABASE_URL||='postgresql://localhost/calendar_qa'
const {calendarSources,validateCalendarBatch,calendarId}=await import('./calendar.mjs')
const today=new Date().toISOString().slice(0,10)
const batch=()=>({generatedAt:new Date().toISOString(),sources:Object.keys(calendarSources).map(provider=>({provider,status:'ok',coverageFrom:today,coverageTo:today})),events:[{provider:'bls',key:'stable',date:today,at:null,timeStatus:'date_only',status:'scheduled',title:'شاخص قیمت',originalTitle:'CPI',sourceUrl:'https://www.bls.gov/schedule/',actual:null,forecast:null,previous:null,impact:null}]})
test('Stable identity, date-only support, no inferred quantities',()=>{const e=validateCalendarBatch(batch()).events[0];assert.equal(e.at,null);assert.equal(e.id,calendarId('bls','stable'));assert.equal(e.forecast,null)})
test('Reject guessed quantities, impact, duplicates, untrusted sources and invalid dates',()=>{
 for(const mutate of [b=>b.events[0].forecast={value:'1',unit:'percent'},b=>b.events[0].impact='high',b=>b.events.push(b.events[0]),b=>b.events[0].sourceUrl='https://bls.gov.evil.example/',b=>b.events[0].date='2026-02-30',b=>b.events[0].timeStatus='known',b=>b.sources.pop(),b=>b.generatedAt='2000-01-01']){const b=batch();mutate(b);assert.throws(()=>validateCalendarBatch(b),{status:400})}
})
test('Actual value requires explicit period, series label and official proof',()=>{let b=batch();Object.assign(b.events[0],{actual:{value:'5.05',unit:'billion',currency:'EUR'},status:'released'});assert.throws(()=>validateCalendarBatch(b));Object.assign(b.events[0],{valuePeriod:'2026-09',valueLabel:'Test series',valueSourceUrl:'https://www.bls.gov/release/'});assert.equal(validateCalendarBatch(b).events[0].actual.value,'5.05')})
