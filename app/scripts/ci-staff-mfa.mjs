import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs')
const {tokenHash,hashPassword}=await import('../server/auth.mjs')
const {totpAt}=await import('../server/totp.mjs')
const base='http://127.0.0.1:5183',id=randomUUID(),password='StaffFactor#2026'
const session=async()=>{const token=randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token),id]);return '__Host-tradersho_session='+token+'; tradersho_session='+token}
const call=async(cookie,path,method='GET',data)=>{const r=await fetch(base+'/api'+path,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:data&&JSON.stringify(data)});return {status:r.status,body:await r.json()}}
try{
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'MFA QA',id+'@example.test',await hashPassword(password)])
 await pool.query('INSERT INTO user_admins VALUES($1)',[id]);await pool.query('INSERT INTO support_agents(user_id) VALUES($1)',[id])
 const first=await session(),second=await session()
 assert.equal((await call(first,'/admin/users')).status,403)
 assert.equal((await call(first,'/admin/support/tickets')).status,403)
 assert.deepEqual((await call(first,'/admin/session')).body.mfa,{required:true,configured:true,enrolled:false,verified:false})
 assert.equal((await call(first,'/admin/mfa/enroll','POST',{password:'wrong'})).status,403)
 const {secret}=(await call(first,'/admin/mfa/enroll','POST',{password})).body
 const stored=(await pool.query('SELECT pending FROM staff_mfa WHERE user_id=$1',[id])).rows[0].pending
 assert.ok(!stored.includes(secret))
 assert.equal((await call(first,'/admin/users')).status,403)
 const counter=Math.floor(Date.now()/30000),code=totpAt(secret,counter)
 assert.equal((await call(first,'/admin/mfa/verify','POST',{code})).status,200)
 assert.equal((await call(first,'/admin/users')).status,200)
 assert.equal((await call(first,'/admin/support/tickets')).status,200)
 // Another session of the same account is still locked and cannot replay the code.
 assert.equal((await call(second,'/admin/users')).status,403)
 assert.equal((await call(second,'/admin/mfa/verify','POST',{code})).status,403)
 assert.equal((await call(second,'/admin/mfa/enroll','POST',{password})).status,409)
 assert.equal((await call(second,'/admin/mfa/verify','POST',{code:totpAt(secret,counter+1)})).status,200)
 await pool.query("UPDATE sessions SET mfa_at=now()-interval '13 hours' WHERE user_id=$1",[id])
 assert.equal((await call(first,'/admin/users')).status,403)

 // Sign-in methods: a live session alone cannot link or unlink.
 await pool.query("INSERT INTO social_identities(provider,subject,user_id) VALUES('telegram',$1,$2)",['qa-'+id,id])
 assert.equal((await call(first,'/account/identities','DELETE',{provider:'telegram'})).status,403)
 assert.equal((await call(first,'/account/reauth','POST',{password:'wrong'})).status,400)
 assert.equal((await call(first,'/account/reauth','POST',{password})).status,200)
 assert.equal((await call(first,'/account/identities','DELETE',{provider:'telegram'})).status,200)
 assert.equal((await pool.query('SELECT 1 FROM social_identities WHERE user_id=$1',[id])).rowCount,0)
 assert.equal((await call(second,'/session')).status,401)
 console.log('PASS staff second factor: enrolment needs password, per-session, single-use codes, 12h expiry; re-auth guarded unlinking revokes other sessions')
}finally{await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
