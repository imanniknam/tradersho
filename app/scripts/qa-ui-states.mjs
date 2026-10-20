import assert from 'node:assert/strict'
import {writeFile,mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
import axe from 'axe-core'
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:5183'
if(!base.includes(':5183'))throw new Error('QA server only')
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),results=[]
await mkdir(new URL('../qa/audit/',import.meta.url),{recursive:true})
try{
 for(const theme of ['light','dark']){
  const ctx=await b.newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'})
  await ctx.addInitScript(t=>localStorage.setItem('tradersho-theme',t),theme)
  const p=await ctx.newPage()
  await p.goto(base+'/auth');await p.getByRole('tab',{name:'ثبت‌نام',exact:true}).click();await p.getByPlaceholder('name@example.com').fill('qa-ui-state@example.test');await p.getByPlaceholder('رمز عبور قوی').fill('SampleQa#2026');await p.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill('Mismatch#2026');await p.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await p.getByRole('alert').waitFor();assert.match(await p.getByRole('alert').innerText(),/یکسان/);assert.equal(await p.getByRole('alert').evaluate(e=>e===document.activeElement),true)
  await p.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill('SampleQa#2026')
  await ctx.route('**/api/auth/signup',r=>r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'این ایمیل قبلاً ثبت شده است.'})}))
  await p.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await p.getByRole('alert').filter({hasText:'این ایمیل قبلاً ثبت شده است.'}).waitFor()
  const fit=await p.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,submit:document.querySelector('.auth-submit').getBoundingClientRect().bottom,footer:document.querySelector('.auth-side-bottom').getBoundingClientRect().bottom}))
  results.push({label:theme+'-signup-error-desktop',...fit})
  await p.addScriptTag({content:axe.source});const a=await p.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(a.violations.map(v=>v.id),[])
  await p.screenshot({path:new URL(`../qa/audit/${theme}-signup-error.png`,import.meta.url).pathname})
  assert.ok(fit.scroll<=fit.height+2,JSON.stringify(fit))
  await p.getByRole('button',{name:'نمایش رمز',exact:true}).click();assert.equal(await p.getByPlaceholder('رمز عبور قوی').getAttribute('type'),'text');await p.getByRole('button',{name:'پنهان کردن رمز',exact:true}).click();assert.equal(await p.getByPlaceholder('رمز عبور قوی').getAttribute('type'),'password')
  await p.setViewportSize({width:390,height:400});await p.getByPlaceholder('رمز عبور را دوباره وارد کنید').focus();await p.getByRole('button',{name:'ایجاد حساب',exact:true}).scrollIntoViewIfNeeded();assert.equal(await p.getByRole('button',{name:'ایجاد حساب',exact:true}).isVisible(),true)
  await ctx.route('**/fonts/**',r=>r.abort());await p.setViewportSize({width:1280,height:720});await p.reload();await p.getByRole('tab',{name:'ثبت‌نام',exact:true}).click();assert.ok(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2))
  await ctx.close()
 }
 const ui=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),q=await ui.newPage()
 const user={id:'qa-ui-only',name:'کاربر آزمون',email:'qa-ui@example.test',isSupportAgent:true,plan:'free',progress:{},createdAt:new Date().toISOString()}
 await ui.route('**/api/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user})}))
 await ui.route('**/api/account',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'ذخیرهٔ اطلاعات ممکن نشد.'})}))
 await q.goto(base+'/panel/account');await q.getByLabel('نام و نام خانوادگی').fill('نام جدید');await q.getByRole('button',{name:'ذخیرهٔ تغییرات',exact:true}).click();assert.equal(await q.getByRole('alert').getAttribute('class'),'form-error')
 let catalogAttempt=0
 await ui.route('**/api/tools',r=>r.fulfill({status:++catalogAttempt===1?503:200,contentType:'application/json',body:JSON.stringify(catalogAttempt===1?{error:'دریافت ابزارها ممکن نیست.'}:{tools:[{id:'chart',status:'active',label:'فعال'},{id:'expert',status:'coming_soon',label:'به‌زودی'}]})}))
 await q.goto(base+'/panel/tools');await q.getByRole('alert').waitFor();await q.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await q.locator('.tool-card').first().waitFor();await q.getByRole('button',{name:'آمادهٔ استفاده',exact:true}).click();assert.equal(await q.locator('.tool-card').count(),1);await q.getByLabel('جستجو در ابزارها').fill('وجود ندارد');await q.getByRole('heading',{name:'ابزاری پیدا نشد'}).waitFor();await q.getByRole('button',{name:'نمایش همه'}).click();assert.equal(await q.locator('.tool-card').count(),2)
 let adminAttempt=0
 await ui.route('**/api/admin/session',r=>r.fulfill({status:++adminAttempt===1?503:200,contentType:'application/json',body:JSON.stringify(adminAttempt===1?{error:'ارتباط با مدیریت برقرار نشد.'}:{allowed:true})}))
 await ui.route('**/api/admin/support/tickets?**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({tickets:[],summary:{total:0,active:0,answered:0},total:0,page:1})}))
 await q.goto(base+'/admin/support');await q.getByRole('heading',{name:'دریافت پنل مدیریت ممکن نشد'}).waitFor();await q.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await q.getByRole('heading',{name:'میز پشتیبانی',exact:true}).waitFor()
 await ui.route('**/api/tickets',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'ثبت تیکت انجام نشد.'})}))
 await q.goto(base+'/panel/support/new');await q.getByLabel('موضوع',{exact:true}).fill('متن فرم حفظ شود');await q.getByLabel('شرح درخواست').fill('این شرح درخواست باید پس از خطای شبکه باقی بماند.');await q.getByRole('button',{name:'ثبت تیکت',exact:true}).click();await q.getByRole('alert').waitFor();assert.equal(await q.getByLabel('موضوع',{exact:true}).inputValue(),'متن فرم حفظ شود');assert.equal(await q.getByLabel('شرح درخواست').inputValue(),'این شرح درخواست باید پس از خطای شبکه باقی بماند.');await ui.close()
 console.log('PASS: account error tone, tools retry/filter/search reset, admin network error/retry, support draft retention.')
 console.log(JSON.stringify(results));console.log('PASS: mismatch/server-error focus and contrast, desktop fit with error, reveal/hide, short keyboard viewport, fallback font.')
}finally{await b.close()}
