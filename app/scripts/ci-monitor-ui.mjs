import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs'),{tokenHash}=await import('../server/auth.mjs')
const base='http://127.0.0.1:5183',id=randomUUID(),token=randomBytes(32).toString('hex'),errors=[],results=[]
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage()
page.on('pageerror',e=>errors.push(e.message));await mkdir('qa/monitors',{recursive:true})
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
try{
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'Monitor QA',id+'@example.test','unusable-qa-hash']);await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token),id]);await context.addCookies([{name:'tradersho_session',value:token,url:base}])
 const now=Date.now(),day=new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'}),events=Array.from({length:100},(_,i)=>({id:'monitor-'+i,title:'شاخص اقتصادی برای بررسی نمایشگر بزرگ '+i,originalTitle:'US Employment Change NFP '+i,date:day,at:new Date(now+(i+1)*60000).toISOString(),currency:'USD',country:'US',impact:['high','medium','low'][i%3],status:'scheduled',actual:{value:'0',unit:'percent'},forecast:{value:'1',unit:'percent'},previous:{value:'-0.5',unit:'percent'},sourceUrl:'https://persianfx.com/'}))
 await context.route('**/api/calendar?**',r=>r.fulfill({json:{configured:true,serverNow:new Date(now).toISOString(),events:new URL(r.request().url()).searchParams.has('upcoming')?events.slice(0,50):events,total:100,updatedAt:new Date(now).toISOString(),sources:[]}}))
 await context.route('https://flicker.finance/**',r=>r.fulfill({contentType:'text/html',body:'<title>Gold monitor QA</title><script>parent.postMessage({type:"flicker-widget:resize",height:280},"*")</script>'}))
 await context.route('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',r=>r.fulfill({contentType:'application/javascript',body:`{const s=document.currentScript,f=document.createElement('iframe');f.title='TradingView monitor QA';f.style='width:100%;height:100%;border:0';f.srcdoc='<title>Chart QA</title>';s.parentElement.querySelector('.tradingview-widget-container__widget').append(f)}`}))
 for(const [width,height] of [[1920,1080],[2560,1440],[3440,1440],[3840,2160],[5120,1440],[5120,2880]])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height});await context.addInitScript(t=>{if(window===top)localStorage.setItem('tradersho-theme',t)},theme)
  for(const tool of ['market','calendar','risk','expert']){
   await page.goto(base+'/panel/tools'+(tool==='market'?'':'/'+tool));await page.locator('.analysis-heading h1').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
   if(tool==='market'){
    await page.locator('.calendar-preview-event').first().waitFor();await page.locator('.tv-host iframe').waitFor();await settle()
    const fit=await page.evaluate(()=>{const scroll=document.querySelector('.main-scroll'),chart=document.querySelector('.tv-chart').getBoundingClientRect(),cards=[...document.querySelectorAll('.analysis-context>section')].map(n=>n.getBoundingClientRect());return {scroll:scroll.scrollHeight,client:scroll.clientHeight,bottom:chart.bottom,context:cards.at(-1).bottom,rows:document.querySelectorAll('.calendar-preview-event').length}})
    assert.ok(fit.scroll<=fit.client+2&&Math.abs(fit.bottom-fit.context)<2&&fit.bottom<=height+1,JSON.stringify({width,height,fit}));assert.ok(fit.rows>2)
   }else if(tool==='calendar'){
    await page.locator('tbody tr').first().waitFor();assert.ok(await page.locator('.calendar-native').evaluate(n=>n.getBoundingClientRect().width<=2200),'Readable calendar width on wide screens');await page.locator('.main-scroll').evaluate(n=>n.scrollTop=1400);await settle()
    const sticky=await page.evaluate(()=>({command:document.querySelector('.calendar-command').getBoundingClientRect().bottom,head:document.querySelector('thead th').getBoundingClientRect().top}));assert.ok(Math.abs(sticky.command-sticky.head)<3,'Sticky table header stays beneath command bar '+JSON.stringify(sticky))
   }else if(tool==='risk'){
    await page.locator('.risk-stats').waitFor();await page.locator('#risk-cycleLength').fill('20');await page.locator('.risk-table-scroll tbody tr').last().waitFor();assert.equal(await page.locator('.risk-table-scroll tbody tr').count(),20)
    await page.locator('.risk-bars button').nth(19).click();assert.ok((await page.locator('.risk-stage-id').innerText()).includes('T20'))
   }else{
    await page.waitForFunction(()=>document.querySelector('.expert-academy-intro button')?.disabled===false);const native=page.frameLocator('.expert-native-desk iframe');await native.getByRole('tab',{name:/Manage/}).click();await native.locator('[data-action=settings]').click();await native.locator('.more-layout').waitFor();await settle()
    const fit=await native.locator('#expert').evaluate(n=>({width:n.offsetWidth,height:n.offsetHeight,viewport:innerWidth,scroll:n.querySelector('.more-content').scrollWidth,client:n.querySelector('.more-content').clientWidth}));assert.equal(fit.width,840);assert.equal(fit.height,473);assert.ok(fit.width<=fit.viewport&&fit.scroll<=fit.client+1)
    await page.locator('.expert-lab').scrollIntoViewIfNeeded()
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),'No outer overflow '+tool+' '+width+'x'+height)
   await page.screenshot({path:`qa/monitors/${tool}-${width}x${height}-${theme}.png`});results.push({tool,width,height,theme})
  }
  console.log('PASS monitor',width,height,theme)
 }
 assert.deepEqual(errors,[]);await writeFile('qa/monitors/report.json',JSON.stringify({results,errors},null,2));console.log('PASS 48 monitor page/theme/size cases, 20-stage risk, sticky calendar, expert settings and market alignment')
}finally{await browser.close();await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end()}
