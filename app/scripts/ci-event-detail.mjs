import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {mkdir,readFile} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs'),{tokenHash}=await import('../server/auth.mjs'),base='http://127.0.0.1:5183',user=randomUUID(),token=randomBytes(32).toString('hex')
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage(),errors=[],axe=await readFile('node_modules/axe-core/axe.min.js','utf8')
page.on('pageerror',e=>errors.push(e.message));await mkdir('qa/event-detail',{recursive:true})
const now=new Date(),at=new Date(+now+3600000).toISOString(),event={id:'a'.repeat(64),title:'عنوان کامل و طولانی رویداد اقتصادی برای بررسی نمایش تمام اطلاعات بدون بریدگی در پنجره',originalTitle:'Complete economic release title without truncation',country:'US',currency:'USD',impact:'high',date:new Date(at).toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'}),at,status:'scheduled',actual:null,forecast:{value:'3.5',unit:'percent'},previous:{value:'0',unit:'million',currency:'USD'},revised:{value:'2.9',unit:'percent'},referencePeriod:'دورهٔ اعلام‌شده توسط ناشر',sourceUrl:'https://persianfx.com/'}
let calls=0,previewEvents=[event]
try{
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Event QA',user+'@example.test','unusable-qa-hash']);await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token),user]);await context.addCookies([{name:'tradersho_session',value:token,url:base}])
 await context.route('**/api/calendar?**',r=>r.fulfill({json:{configured:true,serverNow:now.toISOString(),events:previewEvents,total:previewEvents.length,updatedAt:now.toISOString()}}))
 await context.route('**/api/calendar/events/**',r=>{calls++;return r.fulfill({status:503,json:{error:'Unexpected detail request'}})})

 await context.route('**/api/market/gold-sentiment/status**',r=>r.fulfill({json:{availability:'unknown',checkedAt:new Date().toISOString()}}))
 await context.route('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',r=>r.fulfill({contentType:'application/javascript',body:"window.__chartMounts=(window.__chartMounts||0)+1"}))
 // The nearest release is emphasized until pointer/keyboard focus moves to another row.
 previewEvents=[event,{...event,id:'b'.repeat(64),title:'رویداد دوم'},{...event,id:'c'.repeat(64),title:'رویداد سوم'}]
 for(const width of [390,1440,2560])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.mouse.move(0,0);await page.goto(base+'/panel/tools');await page.locator('.calendar-preview-event').first().waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  if(width>1200){const handle=page.getByRole('button',{name:'تغییر اندازهٔ تقویم از پایین',exact:true});for(let i=0;i<5;i++)await handle.press('Shift+ArrowDown');await page.waitForFunction(()=>document.querySelectorAll('.calendar-preview-event').length===3)}
  const rows=page.locator('.calendar-preview-event'),colors=()=>rows.evaluateAll(ns=>ns.map(n=>getComputedStyle(n).backgroundColor));const initial=await colors(),tint=initial[0];assert.notEqual(tint,initial[1]);assert.equal(initial[1],initial[2]);
  await rows.nth(1).hover();assert.deepEqual(await colors(),[initial[1],tint,initial[1]]);
  await rows.nth(2).hover();assert.deepEqual(await colors(),[initial[1],initial[1],tint]);
  await page.mouse.move(0,0);assert.deepEqual(await colors(),initial);
  await rows.nth(1).focus();await page.keyboard.press('Tab');assert.deepEqual(await colors(),[initial[1],initial[1],tint]);
 }
 previewEvents=[event]
 for(const width of [320,390,768,1440,2560])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/tools');await page.locator('.calendar-preview-event').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  const url=page.url(),row=page.locator('.calendar-preview-event');await row.click();await row.press('Enter');await row.press('Space');assert.equal(page.url(),url);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await row.getAttribute('aria-haspopup'),null);assert.equal(await row.evaluate(n=>n.tagName),'DIV');assert.equal(await page.evaluate(()=>window.__chartMounts),1)
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[])
  if(width===390||width===1440)await page.screenshot({path:`qa/event-detail/${width}-${theme}.png`})
  await page.getByRole('link',{name:/مشاهدهٔ تقویم/}).click();await page.locator('.calendar-event-title').waitFor();assert.equal(await page.locator('.calendar-event-title a').count(),0);await page.locator('.event-title-text').click();assert.equal(new URL(page.url()).pathname,'/panel/tools/calendar');assert.equal(await page.getByRole('dialog').count(),0);assert.ok(await page.getByRole('link',{name:'PersianFX',exact:true}).isVisible())

 }
 assert.equal(calls,0);assert.deepEqual(errors,[])
 console.log('PASS calendar rows: nearest/hover/keyboard emphasis preserved; click/Enter/Space open no detail or navigation; full calendar titles are plain text with separate publisher credit; chart preserved; 10 sizes/themes with axe')

}finally{await browser.close();await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end()}
