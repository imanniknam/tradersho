import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
Object.assign(process.env,{
 SIGNUP_EMAIL_VERIFICATION:'1',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',
 SMTP_USER:'sender@example.test',SMTP_PASSWORD:'qa-only',MAIL_FROM:'sender@example.test',
 MAIL_REPLY_TO:'support@example.test',MAIL_ENCRYPTION_KEY:'ab'.repeat(32),APP_PUBLIC_URL:'https://panel.example.test',
})
const {pool,migrate}=await import('../server/db.mjs')
const {startRegistration,verifyRegistration}=await import('../server/registration.mjs')
const {openMail,mailConfig,dispatchMail}=await import('../server/mail.mjs')
const {tokenHash,hashPassword}=await import('../server/auth.mjs')
await migrate()
const email=`verify-${randomUUID()}@example.test`, config=mailConfig()
const passwordHash=await hashPassword('EmailCode#2026')
const {verificationToken}=await startRegistration({name:'Signup QA',email,passwordHash})
const registration=tokenHash(verificationToken)
const call=async(path,code)=>{
 let result
 await verifyRegistration({path,input:{verificationToken,code},rateLimit:async()=>false,
   fail:(_,status,error)=>{result={status,error}},json:(_,status,body)=>{result={status,body}},
   login:user=>{result={status:201,user}}})
 return result
}
const verify=code=>call('/api/auth/signup/verify',code)
const resend=()=>call('/api/auth/signup/resend')
const job=async()=>(await pool.query("SELECT * FROM mail_outbox WHERE registration_id=$1 AND status='pending'",[registration])).rows[0]
const exists=async()=>(await pool.query('SELECT 1 FROM users WHERE email=$1',[email])).rowCount
try{
 assert.equal(await exists(),0)
 assert.equal((await resend()).status,429)
 const first=await job()
 await pool.query("UPDATE pending_registrations SET issued_at=now()-interval '2 minutes' WHERE id=$1",[registration])
 assert.equal((await resend()).status,202)
 const second=await job()
 assert.notEqual(first.id,second.id)
 assert.equal((await pool.query('SELECT 1 FROM mail_outbox WHERE id=$1',[first.id])).rowCount,0)
 // Exhaust the send quota and verify a suppressed resend keeps the delivered code/job.
 const recipient=tokenHash(config.key.toString('hex')+':recipient:'+email)
 await pool.query("INSERT INTO mail_admissions(id,recipient_hash,purpose) VALUES($1,$2,'signup_verification')",['qa-admission-'+registration,recipient])
 await pool.query("UPDATE pending_registrations SET issued_at=now()-interval '2 minutes' WHERE id=$1",[registration])
 assert.equal((await resend()).status,202)
 assert.equal((await job()).id,second.id)
 const code=openMail(second.payload,config.key,second.id).text.match(/\b\d{6}\b/)[0]
 const wrong=code==='000000'?'111111':'000000'
 assert.equal((await verify(wrong)).status,400)
 assert.equal(await exists(),0)
 await pool.query('UPDATE mail_dispatch_clock SET next_at=now() WHERE id=1')
 let delivered
 await dispatchMail(pool,config,{sendMail:async message=>{delivered=message;return {accepted:message.envelope.to}}})
 assert.equal(delivered.to.address,email)
 assert.ok(delivered.text.includes(code))
 const persian=code.replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])
 const results=await Promise.all([verify(persian),verify(code)])
 assert.deepEqual(results.map(result=>result.status).sort(),[201,400])
 assert.ok(results.find(result=>result.user).user.email_verified_at)
 assert.equal(await exists(),1)
 assert.equal((await verify(code)).status,400)
 console.log('Email verification and encrypted delivery passed')
}finally{
 await pool.query('DELETE FROM mail_admissions WHERE id=$1',['qa-admission-'+registration])
 await pool.query('DELETE FROM pending_registrations WHERE id=$1',[registration])
 await pool.query('DELETE FROM users WHERE email=$1',[email])
 await pool.end()
}
