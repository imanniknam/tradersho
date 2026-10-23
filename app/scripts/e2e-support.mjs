import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:5183'
if(!base.includes(':5183')||!new URL(process.env.DATABASE_URL||'http://none').pathname.endsWith('_qa'))throw new Error('Requires QA server :5183 and explicit DATABASE_URL ending _qa')
const {pool,migrate}=await import('../server/db.mjs')
assert.match((await pool.query('SELECT current_database() AS db')).rows[0].db,/_qa$/)
await mkdir(new URL('../qa/',import.meta.url),{recursive:true})
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const customer=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),other=await browser.newContext(),staff=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
const page=await customer.newPage(),desk=await staff.newPage(),errors=[]
for(const p of [page,desk])p.on('pageerror',e=>errors.push(e.message))
const password='SupportDemo#2026',suffix=randomUUID().slice(0,8),email='customer-'+suffix+'@example.test'
const request=async(ctx,path,method='GET',data)=>{const r=await ctx.request.fetch(base+'/api'+path,{method,data});return {status:r.status(),body:await r.json()}}
const shot=async(name,p=page)=>p.screenshot({path:new URL('../qa/support-'+name+'.png',import.meta.url).pathname,fullPage:true})
const overflow=async(p=page)=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2&&[...document.querySelectorAll('main')].every(e=>e.scrollWidth<=e.clientWidth+2)))
try{
 await page.goto(base+'/auth');await page.getByRole('tab',{name:'ثبت‌نام',exact:true}).click();await page.getByPlaceholder('name@example.com').fill(email);await page.getByPlaceholder('رمز عبور قوی').fill(password);await page.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill(password);await page.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await page.waitForURL(base+'/panel')
 const user=(await request(customer,'/session')).body.user
 assert.equal(user.isSupportAgent,false)
 assert.equal((await request(customer,'/admin/session')).status,403)
 await page.goto(base+'/admin/support');await page.getByRole('heading',{name:'دسترسی به پنل مدیریت مجاز نیست'}).waitFor()
 await page.goto(base+'/panel');assert.equal(await page.getByRole('link',{name:'میز پشتیبانی',exact:true}).count(),0)
 const agent=(await request(staff,'/auth/signup','POST',{email:'agent-'+suffix+'@example.test',password,confirmPassword:password})).body.user
 await request(other,'/auth/signup','POST',{email:'other-'+suffix+'@example.test',password,confirmPassword:password,isSupportAgent:true,role:'admin'})
 assert.equal((await request(other,'/session')).body.user.isSupportAgent,false)
 assert.equal((await request(customer,'/admin/support/tickets')).status,403)
 await pool.query('INSERT INTO support_agents(user_id) VALUES($1)',[agent.id])
 assert.equal((await request(staff,'/admin/session')).status,200)
 const adminLoginContext=await browser.newContext();const adminLoginPage=await adminLoginContext.newPage()
 assert.equal((await request(adminLoginContext,'/admin/session')).status,401)
 await adminLoginPage.goto(base+'/admin/support');await adminLoginPage.waitForURL(/\/auth\?next=/)
 await adminLoginPage.getByPlaceholder('name@example.com').fill('agent-'+suffix+'@example.test');await adminLoginPage.getByPlaceholder('رمز عبور',{exact:true}).fill(password);await adminLoginPage.getByRole('button',{name:'ورود به پنل',exact:true}).click();await adminLoginPage.waitForURL(base+'/admin/support');await adminLoginPage.getByRole('heading',{name:'میز پشتیبانی',exact:true}).waitFor();await adminLoginContext.close()
 await desk.goto(base+'/panel');assert.equal(await desk.getByRole('link',{name:'میز پشتیبانی',exact:true}).count(),0)
 await page.goto(base+'/panel/support/new');await page.getByLabel('موضوع',{exact:true}).fill('مشکل نمایش نمودار طلا');await page.getByLabel('دسته‌بندی').selectOption('technical');await page.getByLabel('اولویت',{exact:true}).selectOption('high');await page.getByLabel('شرح درخواست').fill('در نسخه موبایل برای بررسی نمودار راهنمایی می‌خواهم.');await page.getByRole('button',{name:'ثبت تیکت',exact:true}).click();await page.waitForURL(/\/support\/[a-f0-9-]{36}$/)
 const id=new URL(page.url()).pathname.split('/').pop()
 let conversation=(await request(customer,'/tickets/'+id)).body
 assert.equal(conversation.messages.length,1)
 // Schema bootstrap can run repeatedly without duplicating the opening message.
 await migrate();await migrate();assert.equal((await request(customer,'/tickets/'+id)).body.messages.length,1)
 for(const path of ['/tickets/'+id,'/tickets/'+id+'/messages','/tickets/'+id+'/status']){const method=path.endsWith(id)?'GET':'POST';assert.equal((await request(other,path,method,{version:0,message:'بدون دسترسی',status:'closed',requestId:randomUUID()})).status,404)}
 assert.equal((await request(other,'/admin/support/tickets/'+id)).status,403)
 assert.equal((await request(customer,'/tickets','POST',{subject:'ab',message:'short',category:'bad',priority:'bad',requestId:randomUUID()})).status,400)
 const replayPayload={subject:'بررسی ارسال تکراری',message:'این پیام برای آزمون تکرار درخواست است.',category:'general',priority:'normal',requestId:randomUUID()}
 const [r1,r2]=await Promise.all([request(customer,'/tickets','POST',replayPayload),request(customer,'/tickets','POST',replayPayload)])
 assert.equal(r1.body.id,r2.body.id);assert.equal((await request(customer,'/tickets/'+r1.body.id)).body.messages.length,1)
 assert.equal((await request(customer,'/tickets','POST',{...replayPayload,subject:'موضوع عوض شده'})).status,409)
 await desk.goto(base+'/admin/support');await desk.getByRole('heading',{name:'میز پشتیبانی',exact:true}).waitFor();await desk.getByRole('link',{name:/مشکل نمایش نمودار طلا/}).click();await desk.getByLabel('پاسخ شما').fill('لطفاً نمودار را از گزینهٔ نمای تمام‌صفحه باز کنید.');await desk.getByRole('button',{name:'ارسال پاسخ',exact:true}).click();await desk.getByText('لطفاً نمودار را از گزینهٔ نمای تمام‌صفحه باز کنید.',{exact:true}).waitFor();await shot('staff-desktop',desk)
 await page.getByRole('button',{name:'بررسی پاسخ‌ها',exact:true}).click();await page.getByText('لطفاً نمودار را از گزینهٔ نمای تمام‌صفحه باز کنید.',{exact:true}).waitFor()
 await page.getByLabel('پاسخ شما').fill('ممنون، بررسی می‌کنم. <script>window.bad=true</script>');await page.getByRole('button',{name:'ارسال پاسخ',exact:true}).click();await page.getByText('ممنون، بررسی می‌کنم. <script>window.bad=true</script>',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>Object.hasOwn(window,'bad')),false)
 conversation=(await request(customer,'/tickets/'+id)).body
 const payload={message:'پیام آزمایش تکرار پاسخ',version:conversation.ticket.version,requestId:randomUUID()}
 assert.equal((await request(customer,'/tickets/'+id+'/messages','POST',payload)).status,200)
 assert.equal((await request(customer,'/tickets/'+id+'/messages','POST',payload)).status,200)
 const conflict=await request(customer,'/tickets/'+id+'/messages','POST',{...payload,requestId:randomUUID()});assert.equal(conflict.status,409)
 await page.reload();await page.getByRole('button',{name:'بستن تیکت',exact:true}).click();await page.getByRole('button',{name:'بازگشایی تیکت',exact:true}).waitFor()
 conversation=(await request(customer,'/tickets/'+id)).body
 assert.equal((await request(customer,'/tickets/'+id+'/messages','POST',{message:'پیام به تیکت بسته',version:conversation.ticket.version,requestId:randomUUID()})).status,409)
 await page.getByRole('button',{name:'بازگشایی تیکت',exact:true}).click();await page.getByLabel('پاسخ شما').waitFor();await shot('conversation-desktop')
 await desk.reload();await desk.getByLabel('وضعیت تیکت').selectOption('in_progress');await desk.getByRole('button',{name:'ذخیره وضعیت',exact:true}).click();await desk.getByText('در حال بررسی',{exact:true}).first().waitFor()
 await page.goto(base+'/panel/support');await page.getByRole('heading',{name:'پشتیبانی و تیکت‌ها'}).waitFor();await page.getByLabel('وضعیت',{exact:true}).selectOption('in_progress');await page.getByRole('link',{name:/مشکل نمایش نمودار طلا/}).waitFor();await shot('list-desktop')
 // Numbered pagination, metadata and records remain strictly owner-scoped.
 for(let n=0;n<26;n++)await pool.query('INSERT INTO support_tickets(id,user_id,subject,message) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,'QA pagination '+n,'پیام دادهٔ تست صفحه‌بندی'])
 const paged=await request(customer,'/tickets?page=2');assert.equal(paged.body.tickets.length,3);assert.equal(paged.body.total,28)
 assert.equal((await request(other,'/tickets')).body.summary.total,0)
 const searchPath='/tickets?q='+encodeURIComponent('مشکل نمایش')+'&category=technical&status=in_progress'
 assert.equal((await request(customer,searchPath)).body.total,1)
 assert.equal((await request(other,searchPath)).body.total,0)
 assert.equal((await request(customer,'/tickets?q=%25')).body.total,0)
 assert.equal((await request(customer,'/tickets?category=invalid')).status,400)
 await page.getByLabel('وضعیت',{exact:true}).selectOption('all')
 await page.getByLabel('جستجو در موضوع تیکت‌ها').fill('مشکل نمایش')
 await page.getByLabel('فیلتر موضوعی').selectOption('technical')
 await page.getByRole('link',{name:/مشکل نمایش نمودار طلا/}).waitFor()
 await page.getByLabel('فیلتر موضوعی').selectOption('account')
 await page.getByRole('heading',{name:'تیکتی با این فیلترها پیدا نشد'}).waitFor()

 for(const width of [360,390,768,1440]){
  await page.setViewportSize({width,height:900});await desk.setViewportSize({width,height:900})
  for(const path of ['/panel','/panel/tools','/panel/support','/panel/support/new','/panel/support/'+id,'/panel/account']){await page.goto(base+path);await page.locator('main').waitFor();await overflow();if(width===390)await shot('mobile-'+path.split('/').pop())}
  await desk.goto(base+'/admin/support');await desk.getByRole('heading',{name:'میز پشتیبانی',exact:true}).waitFor();await overflow(desk);if(width===390){await shot('staff-mobile',desk);await desk.goto(base+'/admin/support/'+id);await desk.getByLabel('پاسخ شما').waitFor();await overflow(desk);await shot('staff-conversation-mobile',desk)}
 }
 await page.goto(base+'/panel');await page.evaluate(()=>document.fonts.ready)
 assert.equal(await page.evaluate(()=>document.fonts.check('16px "Yekan Bakh"')),true)
 assert.match(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily),/Yekan Bakh/)
 assert.ok(await page.evaluate(()=>performance.getEntriesByType('resource').some(e=>e.name.includes('YekanBakhFaNum-Regular.woff'))))
 assert.equal(await page.locator('main a[href^="/panel/tools"]').count(),1)
 await shot('dashboard-desktop')
 await page.getByRole('button',{name:'فعال کردن حالت تیره'}).click();await shot('dashboard-dark')
 assert.deepEqual(errors,[])
 console.log('PASS: support customer/staff UI, migration repeat and historical opening messages, owner isolation, no self-promotion, duplicate create/reply, status conflicts, staff replies, close/reopen, validation, XSS text rendering, pagination, Yekan Bakh real font, single tool gateway, responsive 360/390/768/1440. No runtime errors.')
}finally{await browser.close();await pool.end()}
