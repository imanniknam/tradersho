import {chromium} from 'playwright-core'
import {createHmac,randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('QA only')
const {pool}=await import('../server/db.mjs'),base='http://127.0.0.1:5183',email=`calendar-${randomUUID()}@example.test`,password='Calendar#2026'
const b=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),ctx=await b.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),p=await ctx.newPage();let user
try{
 const cap=await(await ctx.request.get(base+'/api/auth/captcha')).json();await pool.query('UPDATE login_captcha SET answer_hash=$1 WHERE id=$2',[createHmac('sha256',process.env.CAPTCHA_SECRET).update(cap.id+':12345').digest('hex'),cap.id]);const r=await ctx.request.post(base+'/api/auth/signup',{data:{email,password,confirmPassword:password,captchaId:cap.id,captchaAnswer:'12345'}});user=(await r.json()).user;if(!user)throw Error('QA account setup failed')
 const failed=[];p.on('response',r=>{if(r.status()>=400)failed.push({status:r.status(),url:r.url()})});p.on('pageerror',e=>failed.push({error:e.message}));const responses=[];p.on('response',r=>{if(r.url().includes('/widgets/economic-calendar'))responses.push({status:r.status(),url:r.url()})})
 await p.goto(base+'/panel/market?tab=calendar');await p.locator('.calendar-frame').waitFor();await p.waitForFunction(()=>!document.querySelector('.calendar-loading'),{},{timeout:35000});await p.waitForTimeout(12000);await mkdir('qa/market',{recursive:true});await p.screenshot({path:'qa/market/calendar-live-desktop.png',fullPage:true});console.log(JSON.stringify({responses,failed,error:await p.getByRole('alert').allTextContents(),frames:p.frames().map(f=>f.url())}));const f=p.frames().find(f=>f.url().includes('/widgets/economic-calendar'));if(f)console.log((await f.locator('body').innerText()).slice(0,1800))
}finally{if(user)await pool.query('DELETE FROM users WHERE id=$1',[user.id]);await b.close();await pool.end()}
