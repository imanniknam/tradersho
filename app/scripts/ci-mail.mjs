import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
// Never connect to real SMTP: exercise the real transactions with a fake transport.
Object.assign(process.env,{MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_PORT:'587',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'qa-only',MAIL_FROM:'sender@example.test',MAIL_REPLY_TO:'support@example.test',MAIL_ENCRYPTION_KEY:'ab'.repeat(32),APP_PUBLIC_URL:'https://panel.example.test'})
const {pool,migrate}=await import('../server/db.mjs')
const {recoveryRoute}=await import('../server/recovery.mjs')
const {supportRoute}=await import('../server/support.mjs')
const {mailConfig,openMail,enqueueMail,dispatchMail}=await import('../server/mail.mjs')
const {tokenHash,hashPassword,verifyPassword}=await import('../server/auth.mjs')
await migrate()
const ids=[randomUUID(),randomUUID(),randomUUID()],config=mailConfig(),sent=[]
const transport={sendMail:async m=>{sent.push(m);await new Promise(r=>setTimeout(r,40));return {accepted:m.envelope.to}}}
const call=async(route,path,user,input)=>{
 let result
 await route({path,method:'POST',user,req:{},res:{},body:async()=>input,json:(_,status,body)=>result={status,body},fail:(_,status,error)=>result={status,body:{error}},rateLimit:async()=>false})
 return result
}
const dispatch=async(t=transport)=>{await pool.query("UPDATE mail_dispatch_clock SET next_at=now() WHERE id=1");return dispatchMail(pool,config,t)}
try{
 const hash=await hashPassword('MailTest#2026')
 for(const [i,id] of ids.entries())await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'QA Mail',`mail-${i}-${id}@example.test`,hash])
 await pool.query('INSERT INTO support_agents(user_id) VALUES($1)',[ids[1]])
 const owner={id:ids[0]},agent={id:ids[1]},outsider={id:ids[2]},email=`mail-0-${ids[0]}@example.test`
 const recover=address=>call(recoveryRoute,'/api/auth/forgot-password',null,{email:address})
 assert.deepEqual(await recover(email),await recover('unknown-'+randomUUID()+'@example.test'))
 let jobs=(await pool.query('SELECT * FROM mail_outbox WHERE user_id=$1',[owner.id])).rows
 assert.equal(jobs.length,1);const oldHash=jobs[0].recovery_hash
 await recover(email)
 jobs=(await pool.query('SELECT * FROM mail_outbox WHERE user_id=$1',[owner.id])).rows
 assert.equal(jobs.length,1);assert.notEqual(jobs[0].recovery_hash,oldHash)
 const token=openMail(jobs[0].payload,config.key,jobs[0].id).text.match(/#([a-f0-9]{64})/)[1]
 assert.equal(jobs[0].recovery_hash,tokenHash(token));assert.ok(!jobs[0].payload.includes(token))
 await pool.query('UPDATE mail_dispatch_clock SET next_at=now() WHERE id=1')
 await Promise.all([dispatchMail(pool,config,transport),dispatchMail(pool,config,transport)])
 assert.equal(sent.length,1);assert.equal(sent[0].to.address,email);assert.deepEqual(sent[0].envelope.to,[email]);assert.ok(sent[0].text.includes('/reset-password#'+token))
 let job=(await pool.query('SELECT * FROM mail_outbox WHERE id=$1',[jobs[0].id])).rows[0]
 assert.equal(job.status,'sent');assert.equal(job.payload,null)
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[tokenHash(randomUUID()),owner.id])
 const reset={token,password:'ResetMail#2027',confirmPassword:'ResetMail#2027'}
 assert.equal((await call(recoveryRoute,'/api/auth/reset-password',null,reset)).status,200)
 assert.equal((await pool.query('SELECT 1 FROM sessions WHERE user_id=$1',[owner.id])).rowCount,0)
 assert.equal((await call(recoveryRoute,'/api/auth/reset-password',null,reset)).status,400)
 assert.equal(await verifyPassword('ResetMail#2027',(await pool.query('SELECT password_hash FROM users WHERE id=$1',[owner.id])).rows[0].password_hash),true)
 const ticket=(await call(supportRoute,'/api/tickets',owner,{subject:'QA mail ticket',message:'Private initial ticket text.',category:'technical',priority:'normal',requestId:randomUUID()})).body.id
 const reply={message:'Private agent reply not for email.',version:0,requestId:randomUUID()},path='/api/admin/support/tickets/'+ticket+'/messages'
 assert.equal((await call(supportRoute,path,outsider,reply)).status,403)
 assert.equal((await call(supportRoute,path,agent,reply)).status,200)
 assert.equal((await call(supportRoute,path,agent,reply)).status,200)
 assert.equal((await pool.query("SELECT 1 FROM mail_outbox WHERE user_id=$1 AND purpose='support_reply'",[owner.id])).rowCount,1)
 assert.equal((await call(supportRoute,path,agent,{...reply,requestId:randomUUID()})).status,409)
 assert.equal((await call(supportRoute,'/api/tickets/'+ticket+'/messages',owner,{message:'Customer reply',version:1,requestId:randomUUID()})).status,200)
 assert.equal((await call(supportRoute,'/api/admin/support/tickets/'+ticket+'/status',agent,{status:'in_progress',version:2,requestId:randomUUID()})).status,200)
 await dispatch()
 assert.equal(sent.length,2);assert.equal(sent[1].to.address,email)
 assert.ok(sent[1].text.includes('/panel/support/'+ticket));assert.ok(!sent[1].text.includes(reply.message))
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM mail_outbox WHERE user_id=$1 AND purpose='support_reply'",[owner.id])).rows[0].n,1)
 // Temporary failures survive worker restart and clear payload after final failure.
 await enqueueMail(pool,{id:'qa-'+ids[0],userId:owner.id,purpose:'support_reply',to:email,subject:'QA retry',text:'QA retry'})
 await dispatch({sendMail:async()=>{throw Object.assign(Error('Do not log recipient or credentials'),{responseCode:451})}})
 job=(await pool.query('SELECT * FROM mail_outbox WHERE id=$1',['qa-'+ids[0]])).rows[0]
 assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.ok(job.payload)
 await pool.query('UPDATE mail_outbox SET next_attempt_at=now() WHERE id=$1',[job.id]);await dispatch({sendMail:async()=>{throw Object.assign(Error('Permanent'),{responseCode:550})}})
 job=(await pool.query('SELECT * FROM mail_outbox WHERE id=$1',[job.id])).rows[0];assert.equal(job.status,'failed');assert.equal(job.payload,null)
 // Expired and stale recovery jobs must never send.
 await recover(email);await pool.query("UPDATE mail_outbox SET expires_at=now()-interval '1 second' WHERE user_id=$1 AND purpose='recovery'",[owner.id]);await dispatch();assert.equal(sent.length,2)
 await recover(email);await pool.query("UPDATE users SET password_hash='changed-after-request' WHERE id=$1",[owner.id]);await dispatch();assert.equal(sent.length,2)
 assert.equal((await pool.query('SELECT 1 FROM password_recovery WHERE user_id=$1',[owner.id])).rowCount,0)
 console.log('PASS mail: encrypted atomic outbox, uniform recovery, superseded/stale/expired tokens, reset/reuse/session revocation, owner-only agent notifications, duplicate/conflict/customer/status suppression, concurrency, retries and permanent failure. No real email sent.')
}finally{
 await pool.query('DELETE FROM support_tickets WHERE user_id=ANY($1::text[])',[ids])
 await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[ids])
 await pool.end()
}
