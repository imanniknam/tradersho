import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {randomBytes,randomUUID} from 'node:crypto'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('QA database required')
const {pool}=await import('../server/db.mjs'),{tokenHash}=await import('../server/auth.mjs')
const base='http://127.0.0.1:5183',user=randomUUID(),token=randomBytes(32).toString('hex')
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true})
try{
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Calendar QA',user+'@example.test','qa-unusable'])
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token),user])
 const batch=JSON.parse(await fs.readFile('/tmp/tradersho-persianfx-batch.json','utf8'))
 const r=await fetch(base+'/api/integrations/calendar',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.CALENDAR_INGEST_TOKEN},body:JSON.stringify(batch)});assert.equal(r.status,200)
 const context=await browser.newContext();await context.addCookies([{name:'tradersho_session',value:token,url:base}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const width of [320,390,1440,2560])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/tools/calendar');await page.locator('.native-calendar-table tbody tr').first().waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(!(await page.locator('tbody').innerText()).includes('Invalid Date'))
  await page.locator('#calendar-sources summary').click();assert.equal(await page.locator('#calendar-sources li').count(),1)
  await page.evaluate(()=>{document.querySelectorAll('*').forEach(n=>{if(n.scrollTop)n.scrollTop=0});window.scrollTo(0,0)});await page.waitForTimeout(1000);await page.screenshot({path:`qa/tools/calendar-persianfx-${width}-${theme}.png`})
 }
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/calendar?')&&r.status()===200),page.getByRole('button',{name:'۳۰ روز آینده',exact:true}).click()])
 await Promise.all([page.waitForResponse(r=>r.url().includes('currency=JPY')&&r.status()===200),page.getByLabel('ارز مرتبط',{exact:true}).selectOption('JPY')])
 await page.locator('tbody tr').first().waitFor();assert.ok((await page.locator('.event-currency').allTextContents()).every(t=>t==='JPY'))
 await page.getByRole('searchbox',{name:'جستجوی رویداد'}).fill('no-match-qa-123');await page.getByRole('heading',{name:'رویدادی با این فیلترها پیدا نشد'}).waitFor()
 await page.getByLabel('ارز مرتبط',{exact:true}).selectOption('all')
 await page.getByRole('searchbox',{name:'جستجوی رویداد'}).fill('')
 await page.getByRole('group',{name:'اهمیت رویداد',exact:true}).getByRole('button',{name:'کم',exact:true}).click()
 await Promise.all([page.waitForResponse(r=>new URL(r.url()).searchParams.get('impact')==='high'&&r.status()===200),page.getByRole('group',{name:'اهمیت رویداد',exact:true}).getByRole('button',{name:'متوسط',exact:true}).click()])
 await page.locator('tbody tr').first().waitFor();assert.ok((await page.locator('.event-impact').allTextContents()).every(t=>t==='زیاد'))
 const composite=batch.events.find(e=>e.actual?.components)
 if(composite){
  await page.getByRole('group',{name:'اهمیت رویداد',exact:true}).getByRole('button',{name:'همه',exact:true}).click()
  await page.getByLabel('از تاریخ میلادی',{exact:true}).fill(composite.date)
  await page.getByLabel('تا تاریخ میلادی',{exact:true}).fill(composite.date)
  await page.locator('.economic-composite').first().waitFor();assert.ok((await page.locator('.economic-composite').first().innerText()).includes('|'))
 }
 await page.goto(base+'/panel');const school=page.getByRole('link',{name:'ورود به مدرسه فارکس'});await school.waitFor();assert.ok(await school.evaluate(n=>n.classList.contains('primary')));assert.equal(await school.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(84, 58, 255)');assert.equal(await school.getAttribute('href'),'https://tradersho.com/school')
 assert.deepEqual(errors,[]);console.log('PASS real data: 8 real-data viewport/theme renders, PersianFX source, currency/search filtering, no overflow/invalid dates/runtime errors')
}finally{await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end();await browser.close()}
