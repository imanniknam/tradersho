import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
Object.assign(process.env,{MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',
 SMTP_PASSWORD:'qa-only',MAIL_FROM:'sender@example.test',MAIL_REPLY_TO:'support@example.test',
 MAIL_ENCRYPTION_KEY:'ab'.repeat(32),APP_PUBLIC_URL:'https://panel.example.test'})
const {pool,migrate}=await import('../server/db.mjs')
const {adminUsersRoute}=await import('../server/admin-users.mjs')
const {recoveryRoute}=await import('../server/recovery.mjs')
const {mailConfig,openMail}=await import('../server/mail.mjs')
const {hashPassword,tokenHash}=await import('../server/auth.mjs')
await migrate()
const ids=[randomUUID(),randomUUID(),randomUUID()]
const emails=ids.map(id=>id+'@example.test')
const password=await hashPassword('AdminCheck#2026')
const invoke=async(actor,path,method='GET',input={})=>{
 let result
 try{
 await adminUsersRoute({path:path.split('?')[0],method,user:{id:actor},req:{url:path},res:{},body:async()=>input,
  json:(_,status,body)=>{result={status,body}},fail:(_,status,error)=>{result={status,error}},rateLimit:async()=>false})
 }catch(cause){result={status:cause.status||500,error:cause.message}}
 return result
}
let invitedId
try{
 for(let i=0;i<ids.length;i++)await pool.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",[ids[i],'QA Admin '+i,emails[i],password])
 await pool.query('INSERT INTO user_admins(user_id) VALUES($1)',[ids[0]])
 await pool.query('INSERT INTO support_agents(user_id) VALUES($1)',[ids[1]])
 const endpoint='/api/admin/users'
 assert.equal((await invoke(ids[1],endpoint)).status,403)
 assert.equal((await invoke(ids[2],endpoint)).status,403)
 const listed=await invoke(ids[0],endpoint+'?q='+ids[2])
 assert.equal(listed.body.users.length,1)
 assert.ok(!('password_hash' in listed.body.users[0]))
 assert.equal((await invoke(ids[0],endpoint+'/'+ids[0],'DELETE',{version:0,confirmEmail:emails[0]})).status,400)
 const changes={name:'Edited QA',email:emails[2],status:'active',isAdmin:false,isSupportAgent:true,version:0}
 assert.equal((await invoke(ids[0],endpoint+'/'+ids[2],'PATCH',changes)).status,200)
 assert.equal((await invoke(ids[0],endpoint+'/'+ids[2],'PATCH',changes)).status,409)
 assert.equal((await pool.query('SELECT 1 FROM support_agents WHERE user_id=$1',[ids[2]])).rowCount,1)
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(randomUUID()),ids[2]])
 assert.equal((await invoke(ids[0],endpoint+'/'+ids[2],'PATCH',{...changes,version:1,status:'suspended'})).status,200)
 assert.equal((await pool.query('SELECT 1 FROM sessions WHERE user_id=$1',[ids[2]])).rowCount,0)
 assert.equal((await invoke(ids[0],endpoint+'/'+ids[2]+'/reset-password','POST',{version:2})).status,400)
 assert.equal((await invoke(ids[0],endpoint+'/'+ids[2],'PATCH',{...changes,version:2,status:'active'})).status,200)
 const invite=await invoke(ids[0],endpoint,'POST',{name:'Invited QA',email:randomUUID()+'@example.test'})
 assert.equal(invite.status,201,JSON.stringify(invite))
 invitedId=invite.body.id
 const invited=(await invoke(ids[0],endpoint+'/'+invitedId)).body.user
 assert.equal(invited.status,'invited')
 assert.equal((await invoke(ids[0],endpoint+'/'+invitedId,'PATCH',{...invited,status:'active'})).status,400)
 const job=(await pool.query('SELECT * FROM mail_outbox WHERE user_id=$1',[invitedId])).rows[0]
 assert.equal(job.purpose,'recovery')
 const link=openMail(job.payload,mailConfig().key,job.id).text.match(/#([a-f0-9]{64})/)[1]
 let recoveryResult
 await recoveryRoute({path:'/api/auth/reset-password',method:'POST',req:{},res:{},rateLimit:async()=>false,
 body:async()=>({token:link,password:'FreshAccess#2026',confirmPassword:'FreshAccess#2026'}),
 json:(_,status)=>{recoveryResult=status},fail:(_,status)=>{recoveryResult=status}})
 assert.equal(recoveryResult,200)
 const activated=(await pool.query('SELECT * FROM users WHERE id=$1',[invitedId])).rows[0]
 assert.equal(activated.account_status,'active');assert.ok(activated.email_verified_at);assert.equal(activated.activation_required,false)
 const detail=(await invoke(ids[0],endpoint+'/'+ids[2])).body.user
 assert.equal((await invoke(ids[0],endpoint+'/'+ids[2],'DELETE',{version:detail.version,confirmEmail:'wrong@example.test'})).status,400)
 assert.equal((await invoke(ids[0],endpoint+'/'+ids[2],'DELETE',{version:detail.version,confirmEmail:emails[2]})).status,200)
 assert.equal((await pool.query('SELECT 1 FROM users WHERE id=$1',[ids[2]])).rowCount,0)
 const audit=(await invoke(ids[0],endpoint+'/audit?userId='+ids[2])).body.entries
 assert.ok(audit.some(entry=>entry.action==='delete'))
 console.log('PASS admin isolation, search, version conflicts, self protection, suspension, invitation, activation, delete and audit')
}finally{
 await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[[...ids,...(invitedId?[invitedId]:[])]])
 await pool.query('DELETE FROM admin_user_audit WHERE subject_id=ANY($1::text[])',[[...ids,...(invitedId?[invitedId]:[])]])
 await pool.end()
}
