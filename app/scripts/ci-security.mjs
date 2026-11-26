import assert from 'node:assert/strict'
import {createHmac,randomUUID} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs')
const base='http://127.0.0.1:5183',email='security-'+randomUUID()+'@example.test',ids=[]
const challenge=async()=>{
 const response=await fetch(base+'/api/auth/captcha'),body=await response.json()
 assert.equal(response.status,200);assert.equal(body.answer,undefined)
 const cookie=response.headers.get('set-cookie').split(';')[0]
 assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/api\/auth;/)
 ids.push(body.id)
 await pool.query('UPDATE login_captcha SET answer_hash=$1 WHERE id=$2',[createHmac('sha256',process.env.CAPTCHA_SECRET).update(body.id+':123456').digest('hex'),body.id])
 return {...body,cookie}
}
const login=(cap,cookie=cap.cookie,answer='123456')=>fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({email,password:'WrongPassword#2026',captchaId:cap.id,captchaAnswer:answer})})
try{
 // Requests without a solved CAPTCHA must not consume this address's login allowance.
 for(let i=0;i<12;i++)assert.equal((await login({id:'junk',cookie:''})).status,400)
 const a=await challenge(),b=await challenge()
 // A different browser cannot solve or consume the owner's challenge.
 assert.equal((await login(a,b.cookie)).status,400)
 assert.equal((await pool.query('SELECT 1 FROM login_captcha WHERE id=$1',[a.id])).rowCount,1)
 assert.equal((await login(a)).status,401)
 assert.equal((await login(a)).status,400)
 const race=await challenge(),results=await Promise.all([login(race),login(race)])
 assert.deepEqual(results.map(r=>r.status).sort(),[400,401])
 const wrong=await challenge();assert.equal((await login(wrong,wrong.cookie,'000000')).status,400);assert.equal((await login(wrong)).status,400)
 const expired=await challenge();await pool.query("UPDATE login_captcha SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);assert.equal((await login(expired)).status,400)
 assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{Origin:'https://attacker.invalid','X-Forwarded-Host':'attacker.invalid','Sec-Fetch-Site':'same-site'}})).status,403)
 assert.equal((await fetch(base+'/api/admin/users')).status,401)
 const home=await fetch(base+'/'),html=await home.text()
 assert.match(home.headers.get('content-security-policy'),/object-src 'none'/)
 assert.doesNotMatch(home.headers.get('content-security-policy').match(/script-src[^;]*/)[0],/unsafe-/)
 const forgot=await fetch(base+'/api/auth/forgot-password',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email})})
 assert.ok([400,503].includes(forgot.status),'forgot-password must not send mail without CAPTCHA')
 assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/)
 assert.equal(home.headers.get('x-content-type-options'),'nosniff')
 const script=html.match(/src="([^\"]+\.js)"/)[1]
 const asset=await fetch(base+script);assert.match(asset.headers.get('cache-control'),/immutable/);await asset.arrayBuffer()
 const revalidated=await fetch(base+'/',{headers:{'If-None-Match':home.headers.get('etag')}});assert.equal(revalidated.status,304);assert.equal((await revalidated.arrayBuffer()).byteLength,0)
 const file='/downloads/Tradersho-Money-Manager-v2.14-MT5.zip',download=await fetch(base+file),bytes=Buffer.from(await download.arrayBuffer())
 const head=await fetch(base+file,{method:'HEAD'});assert.equal(Number(head.headers.get('content-length')),bytes.length);assert.equal((await head.arrayBuffer()).byteLength,0)
 for(const [range,expected] of [['bytes=0-127',bytes.subarray(0,128)],['bytes=-32',bytes.subarray(-32)]]){const part=await fetch(base+file,{headers:{Range:range}});assert.equal(part.status,206);assert.deepEqual(Buffer.from(await part.arrayBuffer()),expected)}
 assert.equal((await fetch(base+file,{headers:{Range:'bytes='+bytes.length+'-'}})).status,416)
 assert.equal((await fetch(base+'/',{method:'POST'})).status,405)
 assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"incomplete"'})).status,400)
 assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'x'.repeat(17000)})})).status,413)
 console.log('PASS security: browser-bound CAPTCHA, concurrent replay, one wrong attempt, expiry, forged proxy origin, admin isolation, headers, JSON/body bounds; main asset',script)
}finally{await pool.query('DELETE FROM login_captcha WHERE id=ANY($1)',[ids]);await pool.end()}
