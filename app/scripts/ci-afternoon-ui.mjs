import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs'),{tokenHash}=await import('../server/auth.mjs')
const base='http://127.0.0.1:5183',user=randomUUID(),token=randomBytes(32).toString('hex'),errors=[]
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),ctx=await browser.newContext({reducedMotion:'reduce'}),page=await ctx.newPage()
page.on('pageerror',e=>errors.push(e.message));await mkdir('qa/afternoon',{recursive:true})
try{
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'آزمون نام خانوادگی',user+'@example.test','unusable-qa-hash']);await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token),user]);await ctx.addCookies([{name:'tradersho_session',value:token,url:base}])
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'}),tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'})
 const events=[{id:'today',date:day,title:'امروز آزمایشی',at:new Date(Date.now()+60000).toISOString()},{id:'tomorrow',date:tomorrow,title:'فردا آزمایشی',at:new Date(Date.now()+86400000).toISOString()}].map(e=>({...e,country:'US',currency:'USD',status:'scheduled',impact:'high',sourceUrl:'https://persianfx.com/'}))
 await ctx.route('**/api/calendar?**',r=>r.fulfill({json:{configured:true,events,sources:[{provider:'persianfx',name:'PersianFX',url:'https://persianfx.com/',count:2,lastSuccess:new Date().toISOString()}],total:2,serverNow:new Date().toISOString(),updatedAt:new Date().toISOString()}}))
 await ctx.route('https://flicker.finance/**',r=>r.fulfill({contentType:'text/html',body:'<title>QA</title>'}))
 await page.setViewportSize({width:1440,height:900});await page.goto(base+'/panel/tools/calendar');await page.getByText('امروز آزمایشی',{exact:true}).waitFor()
 await page.getByRole('button',{name:'پاک‌کردن انتخاب‌ها',exact:true}).click();await page.getByRole('checkbox',{name:'USD',exact:true}).check();await page.getByRole('button',{name:'تأیید و بستن',exact:true}).click()
 await page.getByRole('navigation',{name:'ابزارهای تحلیل'}).getByRole('link',{name:'اکسپرت',exact:true}).click();await page.getByRole('navigation',{name:'ابزارهای تحلیل'}).getByRole('link',{name:'تقویم',exact:true}).click();if(await page.locator('.currency-picker').getAttribute('open')===null)await page.locator('.currency-picker>summary').click();assert.equal(await page.locator('.currency-filter input:checked').count(),1);assert.ok(await page.getByRole('checkbox',{name:'USD',exact:true}).isChecked())
 await page.reload();await page.locator('.currency-picker>summary').waitFor();assert.equal(await page.locator('.currency-filter input:checked').count(),1)
 for(const width of [390,1024,1366,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:`qa/afternoon/calendar-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const rows=await page.locator('tbody tr').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));assert.notEqual(rows[0],rows[1]);assert.equal(await page.locator('#calendar-sources').count(),1)}
 await page.setViewportSize({width:1440,height:900});const request=page.waitForRequest(r=>r.url().includes('/api/calendar?')&&new URL(r.url()).searchParams.get('today')==='1');await page.goto(base+'/panel/tools');await request;await page.getByText('امروز آزمایشی',{exact:true}).waitFor();assert.equal(await page.getByText('فردا آزمایشی',{exact:true}).count(),0)
 await page.goto(base+'/panel');await page.getByRole('heading',{name:'سلام آزمون نام خانوادگی، خوش آمدید',exact:true}).waitFor()
 await page.goto(base+'/panel/tools/risk');await page.locator('#risk-baseRisk').fill('0.1');await page.locator('#risk-maxLoss').fill('100');await page.locator('#risk-cycleLength').fill('6');await page.locator('.risk-path-gap').waitFor()
 assert.equal(await page.locator('.risk-quick-nav').count(),0);assert.equal(await page.locator('small.risk-field-help').count(),5)
 const path=await page.locator('.risk-capacity-trades').evaluate(n=>({overflow:getComputedStyle(n).overflowX,tops:[...n.querySelectorAll('button,.risk-path-gap')].map(n=>n.getBoundingClientRect().top)}));assert.equal(path.overflow,'auto');assert.ok(Math.max(...path.tops)-Math.min(...path.tops)<2)
 const heights=await page.locator('.risk-table-scroll tbody tr').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));assert.ok(Math.max(...heights)-Math.min(...heights)<1,'Break-even caption must not make its row taller')
 await page.screenshot({path:'qa/afternoon/risk-desktop.png',fullPage:true})
 const native=page.frameLocator('.expert-native-desk iframe');await page.goto(base+'/panel/tools/expert');await page.waitForFunction(()=>document.querySelector('.expert-academy-intro button')?.disabled===false)
 await native.getByRole('tab',{name:/Manage/}).click();await native.locator('[data-action=settings]').click();assert.equal(await native.locator('.more-layout').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ')[0]),'160px')
 await native.locator('[data-action=settings-page][data-page=Presets]').click();await native.locator('[data-action=source-preset-new]').click();await native.locator('.source-section').first().locator('summary').click();assert.equal(await native.locator('.section-atr .source-three-fields').count(),1)
 await page.screenshot({path:'qa/afternoon/expert-preset.png',fullPage:true});await native.locator('.source-section').last().locator('summary').click();await native.locator('[data-source-toggle=trail]').check();await native.locator('[data-action=source-preset-trail-method][data-method=ATR]').click();assert.ok(await native.locator('.section-trail').getByLabel('Multiplier',{exact:true}).isVisible());await page.screenshot({path:'qa/afternoon/expert-trail.png',fullPage:true})
 assert.ok(await page.locator('.expert-platform-logo').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).backgroundColor==='rgba(0, 0, 0, 0)')))
 assert.deepEqual(errors,[]);console.log('PASS afternoon calendar: per-user filter navigation/reload, day bands, four responsive sizes, today-only preview, personal welcome, uniform risk rows/inline path and native settings/preset layout')
}finally{await browser.close();await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end()}
