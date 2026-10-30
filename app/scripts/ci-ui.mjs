import assert from 'node:assert/strict'
import {randomUUID,createHmac} from 'node:crypto'
import {readFile,mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('A dedicated _qa database is required')
const {pool}=await import('../server/db.mjs'),base='http://127.0.0.1:5183',email=`ci-ui-${randomUUID()}@example.test`
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const page=await browser.newPage({reducedMotion:'reduce'}),axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),errors=[]
await page.context().route('**/fonts/**',r=>r.abort())
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(base+'/auth');await page.getByRole('tab',{name:'ثبت‌نام',exact:true}).click();await page.getByPlaceholder('name@example.com').fill(email);await page.getByPlaceholder('رمز عبور قوی').fill('UiRelease#2026');await page.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill('UiRelease#2026');await page.getByAltText('تصویر کد امنیتی پنج‌رقمی').waitFor();await page.getByLabel('کد امنیتی',{exact:true}).fill('00000');await page.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await page.getByRole('alert').waitFor()
 await page.waitForFunction(()=>document.querySelector('.captcha-refresh')?.disabled===false)
 const signupResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/captcha')&&r.status()===200)
 await page.getByRole('button',{name:'دریافت کد امنیتی جدید'}).click();const signupCap=await (await signupResponse).json()
 await pool.query('UPDATE login_captcha SET answer_hash=$1 WHERE id=$2',[createHmac('sha256',process.env.CAPTCHA_SECRET).update(signupCap.id+':12345').digest('hex'),signupCap.id])
 await page.getByLabel('کد امنیتی',{exact:true}).fill('12345');await page.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await page.waitForURL(base+'/panel')
 const guest=await browser.newContext({reducedMotion:'reduce'}),loginPage=await guest.newPage()
 await guest.route('**/fonts/**',r=>r.abort())
 for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const mode of ['login','signup']){
  await loginPage.setViewportSize({width,height:720});await loginPage.goto(base+'/auth');if(mode==='signup')await loginPage.getByRole('tab',{name:'ثبت‌نام',exact:true}).click();await loginPage.getByAltText('تصویر کد امنیتی پنج‌رقمی').waitFor();await loginPage.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350)
  assert.ok(await loginPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  if(width===1440)assert.ok(await loginPage.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),'CAPTCHA desktop authentication must fit at 720px height')
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
 for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const path of ['/panel','/panel/tools','/panel/market','/panel/support','/panel/support/new','/panel/account','/forgot-password']){
  await page.setViewportSize({width,height:900});await page.goto(base+path);await page.locator('h1').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${theme} ${path}`)
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))),[],`${width} ${theme} ${path}`)
 }
 await mkdir('qa/tools',{recursive:true})
 for(const width of [320,390,768,1024,1440,2560])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel');await page.locator('.home-tools-copy').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(200)
  const separated=await page.evaluate(()=>{const a=document.querySelector('.market-pulse').getBoundingClientRect(),b=document.querySelector('.home-tools-copy').getBoundingClientRect();return a.right+8<=b.left||a.bottom+8<=b.top})
  assert.ok(separated,`Banner artwork must not overlap text: ${width} ${theme}`)
  await page.locator('.home-tools-entry').screenshot({path:`qa/tools/banner-${width}-${theme}.png`})
 }
 await page.context().route('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',r=>r.fulfill({contentType:'application/javascript',body:`{const script=document.currentScript;const cfg=JSON.parse(script.textContent);window.__chartConfig=cfg;const frame=document.createElement('iframe');frame.title='نمودار تحلیل بازار TradingView';frame.style='width:100%;height:100%;border:0';frame.srcdoc='<html><body style="background:#f5f5fa;font:16px Arial">XAUUSD · 1h · QA widget</body></html>';script.parentElement.querySelector('.tradingview-widget-container__widget').append(frame)}`}))
 for(const width of [320,390,768,1440,2560])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/panel/tools');await page.locator('.tv-host iframe').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(150)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.equal(await page.evaluate(()=>window.__chartConfig.symbol),'OANDA:XAUUSD');assert.equal(await page.evaluate(()=>window.__chartConfig.interval),'60')
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[])
  await page.screenshot({path:`qa/tools/workspace-${width}-${theme}.png`,fullPage:true})
  await page.getByRole('button',{name:'نمای تمام‌صفحه',exact:true}).click();await page.getByRole('dialog',{name:'محیط تحلیل بازار'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.tv-expanded').count(),0)
  await page.getByRole('navigation',{name:'ابزارهای تحلیل'}).getByRole('link',{name:'پنل ریسک'}).click();await page.getByRole('heading',{name:'پنل ریسک در حال آماده‌سازی است'}).waitFor();assert.equal(await page.locator('.tv-host').count(),0)
  await page.getByRole('link',{name:'بازگشت به نمای بازار',exact:true}).click();await page.locator('.tv-host iframe').waitFor()
 }
 assert.equal((await page.context().request.get(base+'/api/news')).status(),410)
 assert.equal((await page.context().request.get(base+'/api/calendar')).status(),200)
 await page.context().route('**/api/calendar',r=>r.fulfill({json:{configured:true,updatedAt:new Date().toISOString(),events:Array.from({length:30},(_,n)=>({id:'calendar-qa-'+n,title:'رویداد آزمایشی '+n,at:new Date(Date.now()+n*60000).toISOString(),country:'US',currency:'USD',impact:'high',actual:{value:'5.05',currency:'EUR',unit:'billion'},forecast:{value:'-12',unit:'thousand'},previous:null,sourceUrl:'https://www.bls.gov/schedule/'}))}}))
 for(const width of [320,390,768,1440,2560])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/tools/calendar');await page.getByRole('link',{name:'رویداد آزمایشی 0',exact:true}).waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.equal(await page.getByRole('navigation',{name:'ابزارهای تحلیل'}).getByRole('link',{name:'اخبار',exact:true}).count(),0)
  assert.equal(await page.locator('.side-nav a[href="https://tradersho.com/school"]').count(),1)
  assert.equal(await page.locator('.side-nav a[href="/panel/market"]').count(),0)
  assert.equal(await page.locator('.economic-amount bdi').first().innerText(),'EUR 5.05');assert.equal(await page.locator('.amount-unit').first().innerText(),'میلیارد')
  await page.evaluate(()=>document.querySelector('.main-scroll').scrollTop=700);await page.waitForTimeout(150)
  const pinned=await page.evaluate(()=>{const bar=document.querySelector('.calendar-command').getBoundingClientRect(),host=document.querySelector('.main-scroll').getBoundingClientRect();return Math.abs(bar.top-host.top)<3})
  assert.ok(pinned,`Calendar command remains sticky at ${width} ${theme}`)
  if(width>=1100)assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('.native-calendar-table thead th').getBoundingClientRect().top-document.querySelector('.calendar-command').getBoundingClientRect().bottom)<4),'Desktop table headings stay below command bar')
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[])
  await page.screenshot({path:`qa/tools/calendar-native-${width}-${theme}.png`})
 }
 assert.deepEqual(errors,[]);console.log('PASS: registration through browser, 42 desktop/mobile page/theme combinations, overflow and axe serious/critical checks; 12 banner separation checks; 10 tool-workspace sizes/themes with fullscreen, navigation and coming-soon checks; 10 native-calendar variants with sticky controls, unit isolation and school/news routing checks. CI uses the published fallback font; private brand fonts are mounted on the VPS.')
}finally{await pool.query('DELETE FROM users WHERE email=$1',[email]);await pool.end();await browser.close()}
