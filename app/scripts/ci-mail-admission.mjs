import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
Object.assign(process.env,{SIGNUP_EMAIL_VERIFICATION:'1',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'qa-only',MAIL_FROM:'sender@example.test',MAIL_REPLY_TO:'support@example.test',MAIL_ENCRYPTION_KEY:'ab'.repeat(32),APP_PUBLIC_URL:'https://panel.example.test',MAIL_INTERVAL_MS:'60000'})
const {pool,migrate}=await import('../server/db.mjs')
const {enqueueMail}=await import('../server/mail.mjs')
const {startRegistration,verifyRegistration}=await import('../server/registration.mjs')
const {hashPassword,tokenHash}=await import('../server/auth.mjs')
await migrate()
const id=randomUUID(),email=id+'@example.test',prefix='admission-'+id+'-',ledger=[]
const recipient=address=>tokenHash(process.env.MAIL_ENCRYPTION_KEY+':recipient:'+address)
const queue=(key,to,purpose='support_reply')=>{const jobId=prefix+key;ledger.push(jobId);return enqueueMail(pool,{id:jobId,userId:id,purpose,to,subject:'QA',text:'QA'})}
try{
 const passwordHash=await hashPassword('AdmissionTest#2026')
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'Admission QA',email,passwordHash])
 const duplicate=await startRegistration({name:'Other name',email,passwordHash})
 assert.match(duplicate.verificationToken,/^[a-f0-9]{64}$/)
 const resend=async token=>{let status;await verifyRegistration({path:'/api/auth/signup/resend',input:{verificationToken:token},rateLimit:async()=>false,fail:(_,s)=>status=s,json:(_,s)=>status=s});return status}
 assert.equal(await resend(duplicate.verificationToken),429)
 await pool.query("UPDATE pending_registrations SET issued_at=now()-interval '2 minutes' WHERE id=$1",[tokenHash(duplicate.verificationToken)])
 assert.equal(await resend(duplicate.verificationToken),202)
 assert.equal((await pool.query('SELECT 1 FROM mail_outbox WHERE registration_id=$1',[tokenHash(duplicate.verificationToken)])).rowCount,0)
 assert.equal((await pool.query('SELECT 1 FROM pending_registrations WHERE id=$1 AND is_decoy',[tokenHash(duplicate.verificationToken)])).rowCount,1)
 const address='recipient-'+email
 const concurrent=await Promise.all(Array.from({length:16},(_,i)=>queue('parallel-'+i,address,'recovery')))
 assert.equal(concurrent.filter(Boolean).length,3,'Per-address quota is atomic across connections')
 await pool.query('DELETE FROM mail_outbox WHERE user_id=$1',[id])
 assert.equal(await queue('after-delete',address,'recovery'),false,'Replacing jobs must not reset send quota')
 for(let i=0;i<8;i++)assert.equal(await queue('signup-backlog-'+i,`${i}-${email}`,'recovery'),true)
 // Signup budget leaves a reserve for recovery; no real SMTP is used.
 const freshEmail='new-'+email
 const fresh=await startRegistration({name:'New user',email:freshEmail,passwordHash})
 assert.match(fresh.verificationToken,/^[a-f0-9]{64}$/)
 assert.equal((await pool.query('SELECT 1 FROM pending_registrations WHERE id=$1',[tokenHash(fresh.verificationToken)])).rowCount,1)
 for(let i=8;i<12;i++)assert.equal(await queue('reserve-'+i,`${i}-${email}`,'recovery'),true)
 assert.equal(await queue('overflow','overflow-'+email,'recovery'),false)
 // Support has a hard global pending cap, independently of authentication slots.
 for(let i=12;i<100;i++)assert.equal(await queue('support-'+i,`${i}-${email}`),true)
 assert.equal(await queue('total-overflow','last-'+email),false)
 assert.equal(await queue('support-12',`12-${email}`),true,'Idempotent retry does not consume another slot')
 console.log('PASS mail admission: uniform duplicate/full signup, atomic recipient quotas, deletion-resistant ledger, auth reserve, global cap, idempotency; no real mail')
}finally{
 await pool.query('DELETE FROM mail_admissions WHERE id=ANY($1::text[])',[ledger])
 await pool.query('DELETE FROM pending_registrations WHERE email=ANY($1::text[])',[[email,'new-'+email]])
 await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()
}
