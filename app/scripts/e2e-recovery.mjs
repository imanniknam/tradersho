import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {readFile,mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('QA database required')
const {pool,migrate}=await import('../server/db.mjs')
const {tokenHash}=await import('../server/auth.mjs')
const {recoveryRoute}=await import('../server/recovery.mjs')
await migrate()
// Isolate only recovery IP counters in the explicitly guarded QA database.
await pool.query('DELETE FROM auth_throttle WHERE key_hash=ANY($1::text[])',[['127.0.0.1','::1','::ffff:127.0.0.1'].flatMap(ip=>['recovery-reset','recovery-ip'].map(scope=>tokenHash(scope+':'+ip)))])
await mkdir('qa/recovery',{recursive:true})
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8')
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const ctx=await browser.newContext(),base='http://127.0.0.1:5183',password='Secure#Demo2026',email='recovery-'+randomUUID()+'@example.test'
const req=async(path,data)=>{const r=await ctx.request.post(base+'/api'+path,{data});return {status:r.status(),body:await r.json()}}
let user
try{
 user=(await req('/auth/signup',{email,password,confirmPassword:password})).body.user;assert.ok(user.id)
 assert.equal((await req('/auth/forgot-password',{email})).status,503)
 const original=globalThis.fetch;let sent
 process.env.RECOVERY_EMAIL_URL='https://mailer.example.test/send';process.env.RECOVERY_EMAIL_SECRET='test-secret';process.env.APP_PUBLIC_URL=base
 globalThis.fetch=async(url,options)=>{sent=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer test-secret');return {ok:true}}
 async function recover(address){let result;await recoveryRoute({path:'/api/auth/forgot-password',method:'POST',req:{},res:{},body:async()=>({email:address}),json:(_,status,body)=>result={status,body},fail:()=>assert.fail('Unexpected failure'),rateLimit:async()=>false});return result}
 const recovery=await recover(email);assert.equal(recovery.status,202)
 const token=sent.text.match(/#([a-f0-9]{64})/)[1]
 assert.equal(JSON.stringify(recovery).includes(token),false)
 assert.equal((await pool.query('SELECT token_hash FROM password_recovery WHERE user_id=$1',[user.id])).rows[0].token_hash,tokenHash(token))
 assert.deepEqual(await recover('unknown-'+randomUUID()+'@example.test'),recovery);globalThis.fetch=original
 assert.equal((await req('/auth/reset-password',{token,password:'weak',confirmPassword:'weak'})).status,400)
 assert.equal((await req('/auth/reset-password',{token,password,confirmPassword:'Different#2026'})).status,400)
 const page=await ctx.newPage()
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/forgot-password');await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.addScriptTag({content:axe});const violations=await page.evaluate(async()=> (await window.axe.run()).violations.filter(v=>['serious','critical'].includes(v.impact)));assert.deepEqual(violations.map(v=>v.id),[])
  await page.getByLabel('ایمیل',{exact:true}).fill('view-'+randomUUID()+'@example.test');await page.getByRole('button',{name:'ارسال لینک بازیابی'}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/فعال نشده|تلاش/)
  await page.screenshot({path:`qa/recovery/${theme}-${width}.png`,fullPage:true})
 }

 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:720});await page.goto(base+'/reset-password#'+token);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.waitForFunction(()=>location.hash==='')
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)),[])
  await page.getByRole('button',{name:'ذخیرهٔ رمز جدید'}).scrollIntoViewIfNeeded();assert.ok(await page.getByRole('button',{name:'ذخیرهٔ رمز جدید'}).isVisible())
 }
 await page.goto(base+'/reset-password#'+token);await page.getByLabel('رمز عبور جدید',{exact:true}).fill('NewSecure#2027');await page.getByLabel('تکرار رمز عبور جدید').fill('NewSecure#2027');await page.getByRole('button',{name:'ذخیرهٔ رمز جدید'}).click();await page.getByRole('status').waitFor();assert.match(await page.getByRole('status').innerText(),/تغییر کرد/)
 await page.getByRole('link',{name:'بازگشت به ورود'}).last().click();await page.getByRole('heading',{name:'ورود به حساب کاربری'}).waitFor()
 assert.equal((await ctx.request.get(base+'/api/session')).status(),401)
 assert.equal((await req('/auth/reset-password',{token,password,confirmPassword:password})).status,400)
 assert.equal((await req('/auth/login',{email,password})).status,401)
 assert.equal((await req('/auth/login',{email,password:'NewSecure#2027'})).status,200)
 const current=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[user.id])).rows[0]
 for(const expired of [true,false]){
  const t=randomBytes(32).toString('hex');await pool.query("INSERT INTO password_recovery VALUES($1,$2,$3,now()+($4::int * interval '1 minute'))",[tokenHash(t),user.id,expired?tokenHash(current.password_hash):'stale-version',expired?-1:15]);assert.equal((await req('/auth/reset-password',{token:t,password,confirmPassword:password})).status,400)
 }
 const concurrent=randomBytes(32).toString('hex');await pool.query("INSERT INTO password_recovery VALUES($1,$2,$3,now()+interval '15 minutes')",[tokenHash(concurrent),user.id,tokenHash(current.password_hash)])
 const attempts=await Promise.all([1,2].map(()=>req('/auth/reset-password',{token:concurrent,password:'Concurrent#2028',confirmPassword:'Concurrent#2028'})))
 assert.deepEqual(attempts.map(v=>v.status).sort(),[200,400])
 console.log('PASS recovery: disabled email, adapter, hash storage, uniform responses, strong password/confirmation, browser reset, old password rejection, token reuse/expiry/version rejection, session revocation, four widths/both themes.')
}finally{if(user)await pool.query('DELETE FROM users WHERE id=$1',[user.id]);await browser.close();await pool.end()}
