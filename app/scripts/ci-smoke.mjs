import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createHmac} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('A dedicated _qa database is required')
const {pool}=await import('../server/db.mjs')
const {tokenHash}=await import('../server/auth.mjs')
const base='http://127.0.0.1:5183',email=`ci-${randomUUID()}@example.test`,password='ReleaseTest#2026'
let cookie='',id
async function request(path,method='GET',data,headers={}){
 const r=await fetch(base+'/api'+path,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,...headers},body:data===undefined?undefined:JSON.stringify(data)})
 const value=r.headers.get('set-cookie');if(value)cookie=value.split(';')[0]
 return {status:r.status,body:await r.json()}
}
try{
 assert.equal((await request('/health')).body.database,'ready')
 assert.equal((await request('/auth/signup','POST',{email,password:'weak',confirmPassword:'weak'})).status,400)
 const challenge=await request('/auth/captcha');assert.equal(challenge.body.enabled,true);assert.match(challenge.body.image,/^data:image\/png;base64,/);assert.equal(challenge.body.answer,undefined)
 assert.equal((await request('/auth/login','POST',{email,password})).status,400)
 assert.equal((await request('/auth/login','POST',{email,password,captchaId:challenge.body.id,captchaAnswer:'wrong'})).status,400)
 const account=await request('/auth/signup','POST',{email,password,confirmPassword:password});assert.equal(account.status,201);id=account.body.user.id
 assert.equal((await request('/session')).body.user.id,id)
 assert.equal((await request('/admin/session')).status,403)
 const ticket=await request('/tickets','POST',{subject:'CI technical chart',message:'A dedicated deployment smoke test ticket.',category:'technical',priority:'normal',requestId:randomUUID()});assert.equal(ticket.status,201)
 assert.equal((await request('/tickets?category=technical&q=technical')).body.total,1)
 assert.equal((await request('/tickets?category=account&q=technical')).body.total,0)
 assert.equal((await request('/auth/forgot-password','POST',{email})).status,503)
 assert.equal((await request('/auth/login','POST',{email,password},{Origin:'https://untrusted.example'})).status,403)
 const token=randomBytes(32).toString('hex'),row=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[id])).rows[0]
 await pool.query("INSERT INTO password_recovery VALUES($1,$2,$3,now()+interval '15 minutes')",[tokenHash(token),id,tokenHash(row.password_hash)])
 assert.equal((await request('/auth/reset-password','POST',{token,password:'ReleaseNew#2027',confirmPassword:'ReleaseNew#2027'})).status,200)
 assert.equal((await request('/session')).status,401)
 assert.equal((await request('/auth/reset-password','POST',{token,password,confirmPassword:password})).status,400)
 const cap=(await request('/auth/captcha')).body
 const answerHash=createHmac('sha256',process.env.CAPTCHA_SECRET).update(cap.id+':12345').digest('hex')
 await pool.query('UPDATE login_captcha SET answer_hash=$1 WHERE id=$2',[answerHash,cap.id])
 assert.equal((await request('/auth/login','POST',{email,password:'ReleaseNew#2027',captchaId:cap.id,captchaAnswer:'۱۲۳۴۵'})).status,200)
 assert.equal((await request('/auth/login','POST',{email,password:'ReleaseNew#2027',captchaId:cap.id,captchaAnswer:'12345'})).status,400)

 console.log('PASS: PostgreSQL health, signup/password policy, session, admin isolation, ticket filters, recovery/reuse/revocation, CSRF.')
}finally{if(id)await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
