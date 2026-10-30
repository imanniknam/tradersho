import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated _qa database required')
const {pool}=await import('../server/db.mjs'),{tokenHash}=await import('../server/auth.mjs'),{calendarSources}=await import('../server/calendar.mjs')
const base='http://127.0.0.1:5183',token=process.env.CALENDAR_INGEST_TOKEN,user=randomUUID(),session=randomBytes(32).toString('hex'),today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'})
async function req(path,method='GET',data,auth=true,machine=false){const r=await fetch(base+'/api'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(auth?{Cookie:'tradersho_session='+session}:{}),...(machine?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()}}
const batch=()=>({generatedAt:new Date().toISOString(),sources:Object.keys(calendarSources).map(provider=>({provider,status:'ok',coverageFrom:today,coverageTo:today})),events:Array.from({length:111},(_,n)=>({provider:'bls',key:'qa-'+n,date:today,at:null,timeStatus:'date_only',status:'scheduled',title:'QA event '+n,originalTitle:'QA '+n,sourceUrl:'https://www.bls.gov/schedule/'}))})
try{
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Calendar QA',user+'@example.test','qa-unusable-password-hash'])
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(session),user])
 assert.equal((await req('/calendar','GET',undefined,false)).status,401)
 assert.equal((await req('/integrations/calendar','POST',batch(),false)).status,401)
 assert.equal((await req('/integrations/calendar','POST',batch(),false,true)).status,200)
 const r=await req('/calendar?from='+today+'&to='+today);assert.equal(r.status,200);assert.equal(r.body.total,111);assert.equal(r.body.events.length,100);assert.equal(r.body.events[0].at,null)
 assert.equal((await req('/calendar?from='+today+'&to='+today+'&page=2')).body.events.length,11)
 assert.equal((await req('/calendar?from='+today+'&to='+today+'&q=event%20110')).body.total,1)
 assert.equal((await req('/calendar?from='+today+'&to='+today+'&currency=EUR')).body.total,0)
 for(const query of ['from=invalid','from=2026-02-30','page=0','currency=HACK','from=2025-01-01&to=2027-01-01'])assert.equal((await req('/calendar?'+query)).status,400)
 const failed=batch();failed.events=[];
 failed.sources.find(s=>s.provider==='bls').status='error'
 assert.equal((await req('/integrations/calendar','POST',failed,false,true)).status,200)
 assert.equal((await req('/calendar?from='+today+'&to='+today)).body.total,111,'upstream failure preserves cached rows')
 const replaced=batch();replaced.events=[{...replaced.events[0],status:'cancelled'}];await req('/integrations/calendar','POST',replaced,false,true)
 const after=(await req('/calendar?from='+today+'&to='+today)).body;assert.equal(after.total,1);assert.equal(after.events[0].status,'cancelled')
 const bad=batch();bad.events[0].sourceUrl='https://evil.example/';assert.equal((await req('/integrations/calendar','POST',bad,false,true)).status,400)
 const stale=batch();stale.generatedAt=new Date(Date.now()-3600000).toISOString();await req('/integrations/calendar','POST',stale,false,true);assert.equal((await req('/calendar?from='+today+'&to='+today)).body.total,1)
 console.log('PASS calendar: authentication, machine token, validation, pagination/search/currency, date-only, failed-source retention, cancellation/removal, stale-batch rejection')
}finally{await pool.query("DELETE FROM economic_calendar_events WHERE payload->>'key' LIKE 'qa-%' OR payload->>'originalTitle' LIKE 'QA %'");await pool.query('DELETE FROM economic_calendar_sources');await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end()}
