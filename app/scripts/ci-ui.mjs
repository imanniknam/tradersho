import assert from 'node:assert/strict'
import {randomUUID,createHmac} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('A dedicated _qa database is required')
const {pool}=await import('../server/db.mjs'),base='http://127.0.0.1:5183',email=`ci-ui-${randomUUID()}@example.test`
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const page=await browser.newPage({reducedMotion:'reduce'}),axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),errors=[]
await page.context().route('**/fonts/**',r=>r.abort())
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(base+'/auth');await page.getByRole('tab',{name:'ثبت‌نام',exact:true}).click();await page.getByPlaceholder('name@example.com').fill(email);await page.getByPlaceholder('رمز عبور قوی').fill('UiRelease#2026');await page.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill('UiRelease#2026');await page.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await page.waitForURL(base+'/panel')
 const guest=await browser.newContext({reducedMotion:'reduce'}),loginPage=await guest.newPage()
 await guest.route('**/fonts/**',r=>r.abort())
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  await loginPage.setViewportSize({width,height:720});await loginPage.goto(base+'/auth');await loginPage.getByAltText('تصویر کد امنیتی پنج‌رقمی').waitFor();await loginPage.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350)
  assert.ok(await loginPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  if(width===1440)assert.ok(await loginPage.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),'CAPTCHA desktop login must fit at 720px height')
  await loginPage.addScriptTag({content:axe});assert.deepEqual(await loginPage.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))),[])
 }
 await guest.close()
 await page.context().request.post(base+'/api/auth/logout')
 await page.goto(base+'/auth');await page.getByAltText('تصویر کد امنیتی پنج‌رقمی').waitFor()
 await page.getByPlaceholder('name@example.com').fill(email);await page.getByPlaceholder('رمز عبور',{exact:true}).fill('UiRelease#2026')
 await page.getByLabel('کد امنیتی',{exact:true}).fill('00000');await page.getByRole('button',{name:'ورود به پنل',exact:true}).click();await page.getByRole('alert').waitFor()
 await page.waitForFunction(()=>document.querySelector('.captcha-refresh')?.disabled===false)
 const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/captcha')&&r.status()===200)
 await page.getByRole('button',{name:'دریافت کد امنیتی جدید'}).click();const cap=await (await response).json()
 const answerHash=createHmac('sha256',process.env.CAPTCHA_SECRET).update(cap.id+':12345').digest('hex')
 await pool.query('UPDATE login_captcha SET answer_hash=$1 WHERE id=$2',[answerHash,cap.id])
 await page.getByLabel('کد امنیتی',{exact:true}).fill('12345');await page.getByRole('button',{name:'ورود به پنل',exact:true}).click();await page.waitForURL(base+'/panel')
 for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const path of ['/panel','/panel/tools','/panel/support','/panel/support/new','/panel/account','/forgot-password']){
  await page.setViewportSize({width,height:900});await page.goto(base+path);await page.locator('h1').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${theme} ${path}`)
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))),[],`${width} ${theme} ${path}`)
 }
 assert.deepEqual(errors,[]);console.log('PASS: registration through browser, 36 desktop/mobile page/theme combinations, overflow and axe serious/critical checks. CI uses the published fallback font; private brand fonts are mounted on the VPS.')
}finally{await pool.query('DELETE FROM users WHERE email=$1',[email]);await pool.end();await browser.close()}
