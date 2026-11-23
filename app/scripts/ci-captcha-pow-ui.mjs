import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomUUID,randomInt} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const base='http://127.0.0.1:5184',email='pow-'+randomUUID()+'@example.test',errors=[],violations=[]
const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,CAPTCHA_MODE:'pow',CAPTCHA_SECRET:'qa-only-captcha-secret-for-isolated-ci',PORT:'5184',HOST:'127.0.0.1',APP_PUBLIC_URL:base,NODE_ENV:'production'},stdio:['ignore','ignore','pipe']})
let serverErrors='';server.stderr.on('data',v=>serverErrors+=v)
let browser,page
const {pool}=await import('../server/db.mjs')
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{};await new Promise(r=>setTimeout(r,200))}
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
 const context=await browser.newContext({reducedMotion:'reduce',extraHTTPHeaders:{'CF-Connecting-IP':`198.18.${randomInt(256)}.${randomInt(1,255)}`}});page=await context.newPage()
 await context.route(base+'/api/auth/social/providers',route=>route.fulfill({json:{providers:['google','telegram'],linked:[]}}))
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>{console.error('CSP violation: '+e.violatedDirective)}));page.on('console',m=>{if(m.text().startsWith('CSP violation:'))violations.push(m.text())})
 await mkdir('qa/captcha-pow',{recursive:true})
 for(const width of [320,390,901,1440])for(const theme of ['light','dark'])for(const mode of ['login','signup']){
  await page.setViewportSize({width,height:width<1001?844:720});await page.goto(base+'/auth');if(mode==='signup')await page.getByRole('tab',{name:'ثبت‌نام',exact:true}).click();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  await page.locator('altcha-widget').getByRole('checkbox').waitFor()
  assert.equal(await page.locator('.captcha-row input').count(),0)
  assert.equal(await page.getByRole('button',{name:mode==='login'?'ورود به پنل':'ایجاد حساب',exact:true}).isDisabled(),true)
  assert.equal(await page.locator('.social-login-button').count(),2)
  for(const provider of ['گوگل','تلگرام'])assert.equal(await page.getByRole('link',{name:(mode==='signup'?'ثبت‌نام':'ورود')+' با '+provider,exact:true}).count(),1)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  if(width>=1001)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),'Desktop '+mode+' fits at 720px with both Google and Telegram')
  await page.screenshot({path:`qa/captcha-pow/${width}-${theme}-${mode}.png`,fullPage:true})
 }
 await page.getByRole('tab',{name:'ثبت‌نام',exact:true}).click()
 await page.getByPlaceholder('نام و نام خانوادگی',{exact:true}).fill('Proof QA')
 await page.getByPlaceholder('name@example.com').fill(email)
 await page.getByPlaceholder('رمز عبور قوی').fill('PowSignup#2026Strong')
 await page.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill('PowSignup#2026Strong')
 const started=Date.now();await page.locator('altcha-widget').getByText('من ربات نیستم',{exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('altcha-widget')?.getState()==='verified',{},{timeout:45000})
 const solveDuration=Date.now()-started;assert.ok(solveDuration<45000)
 const proof=await page.evaluate(()=>document.querySelector('altcha-widget input[name=altcha]')?.value)
 assert.ok(proof&&proof.length>100)
 await page.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await page.waitForURL(base+'/panel')
 const replay=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email,password:'PowSignup#2026Strong',captchaId:JSON.parse(Buffer.from(proof,'base64').toString()).challenge.parameters.data.challengeId,captchaAnswer:proof}})
 assert.equal(replay.status(),400)
 // Expiry clears an already solved proof and blocks submission; refresh never reuses it.
 await page.route(base+'/api/auth/captcha',async route=>{const response=await route.fetch();const data=await response.json();await route.fulfill({response,json:{...data,expiresIn:8}})})
 await context.clearCookies({name:'tradersho_session'});await page.goto(base+'/auth');await page.locator('altcha-widget').getByRole('checkbox').focus();await page.keyboard.press('Space')
 await page.waitForFunction(()=>document.querySelector('altcha-widget')?.getState()==='verified',{},{timeout:45000})
 await page.getByRole('alert').filter({hasText:'منقضی'}).waitFor({timeout:12000});assert.equal(await page.getByRole('button',{name:'ورود به پنل',exact:true}).isDisabled(),true)
 await page.getByRole('button',{name:'دریافت کد امنیتی جدید',exact:true}).click();await page.locator('altcha-widget').getByRole('checkbox').waitFor();assert.equal(await page.getByRole('button',{name:'ورود به پنل',exact:true}).isDisabled(),true)
 assert.deepEqual(errors,[]);assert.deepEqual(violations,[])
 console.log('PASS actual nonnumeric widget: 16 layouts, blocked submit before proof, real worker solve + signup + replay rejection, keyboard, expiry and refresh; solve ms',solveDuration)
}catch(error){console.error('Browser errors:',errors);console.error('Form errors:',await page?.locator('.form-error').allTextContents());await page?.screenshot({path:'qa/captcha-pow/failure.png',fullPage:true});throw error}finally{
 await browser?.close();await pool.query('DELETE FROM users WHERE email=$1',[email]);await pool.end();server.kill('SIGTERM')
 if(serverErrors)console.log('QA server diagnostics:',serverErrors.slice(-1200))
}
