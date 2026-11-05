import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated _qa database required')
const {pool}=await import('../server/db.mjs'),{tokenHash}=await import('../server/auth.mjs'),{calendarSources}=await import('../server/calendar.mjs')
const base='http://127.0.0.1:5183',token=process.env.CALENDAR_INGEST_TOKEN,user=randomUUID(),session=randomBytes(32).toString('hex'),today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'})
async function req(path,method='GET',data,auth=true,machine=false){const r=await fetch(base+'/api'+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(auth?{Cookie:'tradersho_session='+session}:{}),...(machine?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json()}}
const batch=()=>({generatedAt:new Date().toISOString(),sources:['persianfx'].map(provider=>({provider,status:'ok',coverageFrom:today,coverageTo:today})),events:Array.from({length:111},(_,n)=>({provider:'persianfx',country:'US',currency:'USD',impact:'high',key:'qa-'+n,date:today,at:null,timeStatus:'date_only',status:'scheduled',title:'QA event '+n,originalTitle:'QA '+n,sourceUrl:'https://persianfx.com/'}))})
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
 assert.equal((await req('/calendar?from='+today+'&to='+today+'&impact=high')).body.total,111)
 assert.equal((await req('/calendar?from='+today+'&to='+today+'&impact=low')).body.total,0)
 for(const query of ['from=invalid','from=2026-02-30','page=0','currency=HACK','impact=guessed','from=2025-01-01&to=2027-01-01'])assert.equal((await req('/calendar?'+query)).status,400)
 const mixed=batch();mixed.events=mixed.events.slice(0,4).map((e,n)=>({...e,impact:['high','medium','low',null][n]}));await req('/integrations/calendar','POST',mixed,false,true)
 assert.equal((await req('/calendar?from='+today+'&to='+today+'&impact=high,medium')).body.total,2)
 assert.equal((await req('/calendar?from='+today+'&to='+today+'&impact=none')).body.total,0)
 for(const impact of ['high,guessed','high,high','high,medium,low,extra'])assert.equal((await req('/calendar?impact='+impact)).status,400)
 await req('/integrations/calendar','POST',batch(),false,true)
 const failed=batch();failed.events=[];
 failed.sources.find(s=>s.provider==='persianfx').status='error'
 assert.equal((await req('/integrations/calendar','POST',failed,false,true)).status,200)
 assert.equal((await req('/calendar?from='+today+'&to='+today)).body.total,111,'upstream failure preserves cached rows')
 const replaced=batch();replaced.events=[{...replaced.events[0],status:'cancelled'}];await req('/integrations/calendar','POST',replaced,false,true)
 const after=(await req('/calendar?from='+today+'&to='+today)).body;assert.equal(after.total,1);assert.equal(after.events[0].status,'cancelled')
 const upcoming=batch();upcoming.events=[-60,60,120,180].map((minutes,n)=>({...upcoming.events[n],key:'qa-timed-'+n,at:new Date(Date.now()+minutes*60000).toISOString(),date:new Date(Date.now()+minutes*60000).toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'}),timeStatus:'known'}));upcoming.events.push({...upcoming.events[1],key:'qa-cancelled',status:'cancelled'});upcoming.sources.forEach(s=>{s.coverageFrom=new Date(Date.now()-86400000).toISOString().slice(0,10);s.coverageTo=new Date(Date.now()+86400000).toISOString().slice(0,10)});
 assert.equal((await req('/integrations/calendar','POST',upcoming,false,true)).status,200)
 const next=(await req('/calendar?upcoming=1&q=QA')).body.events;assert.equal(next.length,2);assert.deepEqual(next.map(e=>e.originalTitle),['QA 1','QA 2']);assert.ok(next.every(e=>Date.parse(e.at)>Date.now()))
 const expanded=(await req('/calendar?upcoming=1&limit=50&q=QA')).body.events;assert.equal(expanded.length,3);assert.ok(expanded.every(e=>Date.parse(e.at)>Date.now()&&e.status==='scheduled'))
 for(const limit of ['0','51','oops','2.5'])assert.equal((await req('/calendar?upcoming=1&limit='+limit)).status,400)
 await req('/integrations/calendar','POST',{...replaced,generatedAt:new Date().toISOString()},false,true)
 const bad=batch();bad.events[0].sourceUrl='https://evil.example/';assert.equal((await req('/integrations/calendar','POST',bad,false,true)).status,400)
 const stale=batch();stale.generatedAt=new Date(Date.now()-3600000).toISOString();await req('/integrations/calendar','POST',stale,false,true);assert.equal((await req('/calendar?from='+today+'&to='+today)).body.total,1)
 console.log('PASS calendar: authentication, machine token, validation, pagination/search/currency, date-only, failed-source retention, cancellation/removal, stale-batch rejection')
}finally{await pool.query("DELETE FROM economic_calendar_events WHERE payload->>'key' LIKE 'qa-%' OR payload->>'originalTitle' LIKE 'QA %'");await pool.query('DELETE FROM economic_calendar_sources');await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end()}
