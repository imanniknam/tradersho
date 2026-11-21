import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool,migrate}=await import('../server/db.mjs')
const {telegramAccount}=await import('../server/social-auth.mjs')
const {startRegistration,verifyRegistration}=await import('../server/registration.mjs')
const {mailConfig,openMail}=await import('../server/mail.mjs')
const {tokenHash}=await import('../server/auth.mjs')
await migrate()
const subject='qa-'+randomUUID(),email=randomUUID()+'@example.test'
const created=[]
let user
const call=async(verificationToken,code,actor)=>{
 let result
 await verifyRegistration({input:{verificationToken,code},path:'/api/account/email/verify',user:actor,
  req:{},res:{},rateLimit:async()=>false,fail:(_,status,error)=>{result={status,error}},
  json:(_,status,body)=>{result={status,body}},login:account=>{result={status:200,user:account}}})
 return result
}
try{
 delete process.env.MAIL_TRANSPORT
 const results=await Promise.all([telegramAccount({subject,name:'Telegram QA'}),telegramAccount({subject,name:'Telegram QA'})])
 user=results[0];created.push(user.id)
 assert.equal(results[1].id,user.id)
 assert.equal(user.email,null);assert.equal(user.email_verified_at,null);assert.equal(user.account_status,'active')
 assert.equal((await pool.query('SELECT 1 FROM pending_registrations WHERE account_user_id=$1',[user.id])).rowCount,0)
 const other=await telegramAccount({subject:subject+'-other',name:'Other QA'});created.push(other.id)
 assert.equal(other.email,null)
 await pool.query("UPDATE users SET account_status='suspended' WHERE id=$1",[other.id])
 await assert.rejects(()=>telegramAccount({subject:subject+'-other',name:'Other QA'}))
 Object.assign(process.env,{SIGNUP_EMAIL_VERIFICATION:'1',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',
  SMTP_USER:'sender@example.test',SMTP_PASSWORD:'qa-only',MAIL_FROM:'sender@example.test',MAIL_REPLY_TO:'support@example.test',
  MAIL_ENCRYPTION_KEY:'ab'.repeat(32),APP_PUBLIC_URL:'https://panel.example.test'})
 const first=await startRegistration({name:user.name,email,passwordHash:user.password_hash,accountUserId:user.id})
 const second=await startRegistration({name:user.name,email,passwordHash:user.password_hash,accountUserId:user.id})
 assert.equal((await pool.query('SELECT 1 FROM pending_registrations WHERE id=$1',[tokenHash(first.verificationToken)])).rowCount,0)
 const job=(await pool.query("SELECT * FROM mail_outbox WHERE registration_id=$1",[tokenHash(second.verificationToken)])).rows[0]
 const code=openMail(job.payload,mailConfig().key,job.id).text.match(/\b\d{6}\b/)[0]
 assert.equal((await call(second.verificationToken,code,null)).status,400)
 assert.equal((await call(second.verificationToken,code,other)).status,400)
 const verified=await call(second.verificationToken,code,user)
 assert.equal(verified.status,200)
 assert.equal(verified.user.id,user.id);assert.equal(verified.user.email,email);assert.ok(verified.user.email_verified_at)
 assert.equal((await call(second.verificationToken,code,user)).status,400)
 assert.equal((await telegramAccount({subject,name:'Telegram QA'})).id,user.id)
 console.log('PASS direct Telegram creation, concurrent deduplication, suspension and optional owner-bound email verification')
}finally{
 await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[created])
 await pool.end()
}
