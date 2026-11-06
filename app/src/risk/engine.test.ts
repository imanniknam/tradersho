import {test} from 'node:test'
import assert from 'node:assert/strict'
import {calculateRisk,defaults,parseNumber,stageAt,validateInput,profiles} from './engine.ts'
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`)
test('spec v1.2 primary reference: all unrounded stage outputs and capacity',()=>{
 const p=calculateRisk(defaults)
 const rows=[[.56953125,0,1.70859375,1.70859375,.56953125],[.68818359,.56953125,2.06455078,1.49501953,1.25771484],[.84638672,1.25771484,2.53916016,1.28144531,2.10410156],[1.05732422,2.10410156,3.17197266,1.06787109,3.16142578],[1.33857422,3.16142578,4.01572266,.85429687,4.5],[1.5,4.5,4.5,0,6]]
 p.stages.forEach((s,i)=>[s.risk,s.priorLoss,s.tpProfit,s.netAtTp,s.cumulativeLoss].forEach((v,j)=>close(v,rows[i][j])))
 close(p.budget,6);close(p.finalRisk,1.5);close(p.scale,1.70859375);assert.equal(p.capacity,10);assert.equal(p.crossingTrade,11)
 assert.deepEqual(p.stages.map(s=>(defaults.balance*s.risk/100).toFixed(2)),['56.95','68.82','84.64','105.73','133.86','150.00'])
})
test('secondary reference and insufficient-budget reference',()=>{
 const p=calculateRisk({...defaults,cycleLength:5,rr:2,maxLoss:10})
 const risks=[.49382716,.65843621,.90534979,1.27572016,1.66666667];p.stages.forEach((s,i)=>close(s.risk,risks[i]));assert.equal(p.capacity,8);assert.equal(p.crossingTrade,9)
 const limited=calculateRisk({...defaults,maxLoss:5});assert.equal(limited.capacity,5);assert.equal(limited.crossingTrade,6);assert.equal(limited.fullCycleFits,false)
})
test('all profile and boundary combinations preserve budgets, recovery and allowed capacity',()=>{
 for(const distribution of ['uniform','balanced','early'] as const)for(const cycleLength of [2,6,20])for(const rr of [.1,3,100])for(const maxLoss of [.1,5,100]){
  const p=calculateRisk({...defaults,distribution,cycleLength,rr,maxLoss});close(p.stages.reduce((a,s)=>a+s.risk,0),p.budget);close(p.stages.at(-1)!.netAtTp,0)
  p.stages.forEach(s=>{close(s.tpProfit-s.priorLoss,s.netAtTp);assert.ok(s.risk>0)});p.stages.slice(0,-1).forEach((s,i)=>close(s.netAtTp/p.stages[0].netAtTp,cycleLength===2?1:1-i/(cycleLength-2)*(1-profiles[distribution].ratio)))
  assert.ok(p.usedLoss<=maxLoss+1e-7);assert.ok(stageAt(p,p.crossingTrade).cumulativeLoss>maxLoss-1e-7)
 }
 const p=calculateRisk({...defaults,baseRisk:.01,cycleLength:2,rr:100,maxLoss:100});assert.ok(p.capacity>100);assert.ok(p.capacity>100000);assert.equal(stageAt(p,p.crossingTrade).number,p.crossingTrade)
})
test('numeric parsing accepts local digits without coercing empty, ambiguous or nonfinite input',()=>{
 assert.equal(parseNumber('۱۰٬۰۰۰'),10000);assert.equal(parseNumber('۰٫۵'),.5);assert.equal(parseNumber('١٢'),12)
 for(const raw of ['', ' ', '12,34','Infinity','1e2','-1','0x10'])assert.ok(Number.isNaN(parseNumber(raw)))
 for(const input of [{...defaults,balance:NaN},{...defaults,rr:0},{...defaults,cycleLength:2.5}]){assert.ok(Object.keys(validateInput(input)).length);assert.throws(()=>calculateRisk(input))}
})
