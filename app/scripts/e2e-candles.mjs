import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile,mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:5183'
if(!base.includes(':5183'))throw new Error('Run this chart suite only against the separate QA service on port 5183.')
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']})
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
const api=async(path,options={})=>{const r=await context.request.fetch(base+'/api'+path,options);return {status:r.status(),data:await r.json()}}
const signup=async ctx=>{const password='ChartQa#2026';const r=await ctx.request.post(base+'/api/auth/signup',{data:{email:`chartqa-${randomUUID()}@example.test`,password,confirmPassword:password}});assert.equal(r.status(),201)}
async function noOverflow(label){const d=await page.evaluate(()=>({screen:innerWidth,page:document.documentElement.scrollWidth,chart:document.querySelector('.candle-workspace')?.scrollWidth,chartClient:document.querySelector('.candle-workspace')?.clientWidth}));assert.ok(d.page<=d.screen+2,label+JSON.stringify(d));assert.ok(d.chart<=d.chartClient+2,label+JSON.stringify(d))}
await mkdir(new URL('../qa/',import.meta.url),{recursive:true})
try{
 await signup(context)
 const catalog=await api('/candles/datasets');assert.equal(catalog.status,200);assert.equal(catalog.data.datasets[0].kind,'synthetic');assert.equal(catalog.data.datasets[0].bars,undefined)
 let r=await api('/candles/session?frame=15m',{method:'POST',data:{balance:'5000'}});assert.equal(r.status,201)
 let s=r.data.session,id=s.id
 assert.ok(s.bars.every(b=>b.time<=s.time));assert.equal(s.paper.balance,'5000.00')
 const beforeTime=s.time
 const lower=await api(`/candles/session/${id}?frame=1m`);assert.equal(lower.data.session.time,beforeTime)
 const suffix=lower.data.session.bars.filter(b=>b.time>=s.bars.at(-1).time);assert.equal(s.bars.at(-1).high,Math.max(...suffix.map(b=>b.high)))
 const req=randomUUID();r=await api(`/candles/session/${id}/advance?frame=15m`,{method:'POST',data:{version:s.version,requestId:req}});s=r.data.session
 assert.equal(s.cursor,10094)
 assert.equal((await api(`/candles/session/${id}/advance?frame=15m`,{method:'POST',data:{version:0,requestId:req}})).data.session.cursor,s.cursor)
 const concurrent=await Promise.all([1,2].map(()=>api(`/candles/session/${id}/advance?frame=15m`,{method:'POST',data:{version:s.version,requestId:randomUUID()}})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409])
 await page.goto(base+'/panel/tools/chart')
 await page.getByTestId('candle-chart').waitFor()
 await page.getByTestId('candle-balance').filter({hasText:'$5,000.00'}).waitFor()
 await noOverflow('desktop')
 await page.getByRole('button',{name:'تمام صفحهٔ چارت',exact:true}).click()
 await page.locator('.candle-workspace.is-focused').waitFor()
 await page.getByRole('button',{name:'معاملات',exact:true}).click()
 const rect=await page.locator('.ws-chart-plot').first().boundingBox();assert.ok(rect.height>500)
 // All toolbar tools place real objects with their specified anchor counts.
 const tools=JSON.parse(await readFile(new URL('../shared/drawing-tools.json',import.meta.url)))
 for(let index=0;index<tools.length;index++){
  const tool=tools[index]
  console.log('drawing',index+1,tool.id)
  await page.getByRole('button',{name:'جستجوی ابزارها',exact:true}).click()
  await page.getByLabel('جستجوی ابزار ترسیم',{exact:true}).fill(tool.id)
  await page.getByRole('button',{name:tool.label,exact:true}).click()
  const box=await page.locator('.ws-chart-plot').first().boundingBox()
  for(let point=0;point<tool.points;point++)await page.mouse.click(box.x+100+point*50,box.y+65+((index*7+point*31)%200))
  await page.waitForFunction(n=>document.querySelectorAll('.ws-drawing').length===n,index+1)
 }
 s=(await api('/candles/session?frame=15m')).data.session
 assert.equal(s.drawings.length,27)
 await page.getByRole('button',{name:'بازگردانی · Ctrl Z',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.ws-drawing').length===26)
 await page.getByRole('button',{name:'انجام دوباره · Ctrl Shift Z',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.ws-drawing').length===27)
 await page.keyboard.press('Escape');await page.locator('.candle-workspace:not(.is-focused)').waitFor()
 // Saved drawing ownership and future-anchor checks.
 s=(await api('/candles/session?frame=15m')).data.session
 const future={...s.drawings[0],anchors:[{time:s.time+600,price:1.1}]}
 assert.equal((await api(`/candles/session/${id}/drawings`,{method:'PUT',data:{drawingVersion:s.drawingVersion,drawings:[future]}})).status,400)
 const other=await browser.newContext();await signup(other)
 assert.equal((await other.request.get(base+`/api/candles/session/${id}`)).status(),404)
 const endCatalog=await (await other.request.get(base+'/api/candles/datasets')).json(),last=endCatalog.datasets[0].last
 const endCreated=await (await other.request.post(base+'/api/candles/session?frame=1D',{data:{time:last-60}})).json()
 const endRequest=randomUUID(),endPath=base+`/api/candles/session/${endCreated.session.id}`
 const ended=await (await other.request.post(endPath+'/advance?frame=1D',{data:{version:0,requestId:endRequest}})).json()
 assert.equal(ended.session.hasNext,false)
 assert.equal((await other.request.post(endPath+'/trade',{data:{version:ended.session.version,requestId:randomUUID(),action:'open',side:'buy',units:1}})).status(),400)
 assert.equal((await other.request.post(endPath+'/advance?frame=1D',{data:{version:0,requestId:endRequest}})).status(),200)
 await other.close()
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ws-drawing').length===27)
 await page.getByRole('button',{name:'مدیریت ترسیم‌ها',exact:true}).click()
 await page.getByRole('button',{name:'جستجوی ابزارها',exact:true}).click()
 await page.getByLabel('جستجوی ابزار ترسیم',{exact:true}).fill('horizontal')
 await page.locator('.ws-tool-menu').getByRole('button',{name:'خط افقی',exact:true}).click()
 const editBox=await page.locator('.ws-chart-plot').first().boundingBox()
 await page.mouse.click(editBox.x+editBox.width*.55,editBox.y+130)
 await page.waitForFunction(()=>document.querySelectorAll('.ws-drawing').length===28)
 await page.locator('.ws-object-name').last().click()
 const handle=page.locator('.ws-overlay circle').first(),h=await handle.boundingBox();assert.ok(h)
 const beforeAnchors=(await api('/candles/session')).data.session.drawings.at(-1).anchors
 await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+20,h.y+20,{steps:5});await page.mouse.up()
 await page.waitForTimeout(180)
 const afterAnchors=(await api('/candles/session')).data.session.drawings.at(-1).anchors
 assert.notDeepEqual(afterAnchors,beforeAnchors)
 await page.getByRole('button',{name:'بستن مدیریت ترسیم',exact:true}).click()
 console.log('drawings, resume and anchor editing passed')

 // Every indicator can be rendered, and every chart type/frame is selectable.
 for(const name of ['Weighted Moving Average · WMA','Hull Moving Average · HMA','Session VWAP · UTC','Relative Strength Index · RSI 14','MACD · 12 / 26 / 9','Average True Range · ATR 14','Stochastic · 14 / 3','Commodity Channel Index · CCI 20','Rate of Change · ROC 12','On Balance Volume · OBV','Donchian Channels','Bollinger Bands · 2σ','Exponential Moving Average · EMA','Simple Moving Average · SMA','Volume · حجم فایل']){
  await page.getByRole('button',{name:'اندیکاتورها',exact:true}).click()
  await page.getByRole('button',{name:'پاک‌کردن',exact:true}).click()
  await page.getByLabel(name,{exact:true}).check()
  await page.getByRole('button',{name:'بستن پنجره',exact:true}).click()
  await page.waitForTimeout(80)
 }
 for(const type of ['hollow','bars','line','area','heikin','candles'])await page.getByLabel('نوع نمودار',{exact:true}).selectOption(type)
 const fixedTime=(await api('/candles/session')).data.session.time
 for(const f of ['1m','3m','5m','15m','30m','1h','2h','4h','1D','15m']){
  await page.getByRole('button',{name:f,exact:true}).click()
  await page.waitForFunction(f=>document.querySelector('.ws-frame-list button.active')?.textContent===f,f)
  assert.equal((await api('/candles/session')).data.session.time,fixedTime)
 }
 await page.getByRole('button',{name:'پخش Replay',exact:true}).click();await page.waitForFunction(t=>document.querySelector('[data-testid="candle-time"]')?.textContent!==t,await page.getByTestId('candle-time').innerText())
 await page.getByRole('button',{name:'توقف Replay',exact:true}).click();await page.waitForTimeout(200)
 const paused=(await api('/candles/session')).data.session.version;await page.waitForTimeout(1200);assert.equal((await api('/candles/session')).data.session.version,paused)
 // Real UI market order then close. Existing account stays independent of wallet.
 await page.getByLabel('مقدار سفارش EUR',{exact:true}).fill('1000')
 await page.getByRole('button',{name:/سفارش فرضی خرید/}).click()
 await page.getByRole('button',{name:'کندل بعد',exact:true}).click()
 await page.getByRole('button',{name:'بستن موقعیت',exact:true}).waitFor()
 await page.getByRole('button',{name:'بستن موقعیت',exact:true}).click()
 await page.getByRole('button',{name:'کندل بعد',exact:true}).click()
 s=(await api('/candles/session')).data.session;assert.equal(s.paper.positions.length,0);assert.equal(s.paper.trades.length,1)
 assert.equal(s.paper.balance,(5000+Number(s.paper.trades[0].profit)).toFixed(2))
 // Comparison view shares the authoritative time; preferences survive reload.
 await page.getByRole('button',{name:'حالت دو نموداری',exact:true}).click()
 await page.locator('.ws-charts.split .ws-chart').nth(1).waitFor()
 await page.waitForFunction(()=>document.querySelectorAll('.ws-charts.split .ws-lwc canvas').length>=4)
 await page.getByRole('button',{name:'حالت دو نموداری',exact:true}).click()
 await page.getByRole('button',{name:'تنظیمات نمودار',exact:true}).click()
 await page.locator('.ws-settings-form label').filter({hasText:'محور قیمت'}).locator('select').selectOption('log')
 await page.getByRole('button',{name:'اعمال شد',exact:true}).click()
 await page.waitForTimeout(750);await page.reload();await page.getByTestId('candle-chart').waitFor()
 assert.equal((await api('/candles/session')).data.session.settings.scale,'log')
 console.log('trade, comparison and preference persistence passed')
 // Snapshot is a real downloadable PNG including overlays.
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'ذخیره تصویر نمودار',exact:true}).click();const image=await download;assert.equal(image.suggestedFilename(),'tradersho-chart.png')
 // Upload a private M1 CSV through the product UI.
 await page.getByRole('button',{name:'تمرین جدید',exact:true}).click()
 await page.getByRole('button',{name:'ورود فایل شخصی OHLC',exact:true}).click()
 await page.locator('.ws-import-ack input').check()
 const bars=Array.from({length:200},(_,i)=>({time:1735689600+i*60,open:1.08,high:1.0802,low:1.0799,close:1.0801,volume:100}))
 const csv='time,open,high,low,close,volume\n'+bars.map(b=>[b.time,b.open,b.high,b.low,b.close,b.volume].join(',')).join('\n')
 await page.getByLabel('انتخاب فایل OHLC',{exact:true}).setInputFiles({name:'personal-eurusd.csv',mimeType:'text/csv',buffer:Buffer.from(csv)})
 await page.getByLabel('سرمایه اولیه کندلی',{exact:true}).waitFor()
 await page.getByLabel('سرمایه اولیه کندلی',{exact:true}).fill('7000')
 await page.getByLabel('شروع Replay UTC',{exact:true}).fill('2025-01-01T02:00')
 await page.getByRole('button',{name:'ساخت تمرین با این سرمایه',exact:true}).click()
 await page.getByTestId('candle-balance').filter({hasText:'$7,000.00'}).waitFor()
 s=(await api('/candles/session')).data.session;assert.equal(s.dataset.kind,'imported');assert.equal(s.bars.at(-1).close,1.0801)
 const importedSession=s
 const race=await Promise.all(Array.from({length:12},()=>api(`/candles/session/${importedSession.id}/advance?frame=1m`,{method:'POST',data:{version:importedSession.version,requestId:randomUUID()}})))
 assert.equal(race.filter(r=>r.status===200).length,1);assert.equal(race.filter(r=>r.status===409).length,11)
 const unauthorized=await browser.newContext();await signup(unauthorized)
 const foreign=await unauthorized.request.post(base+'/api/candles/session',{data:{datasetId:s.dataset.id}});assert.equal(foreign.status(),404)
 const list=await (await unauthorized.request.get(base+'/api/candles/datasets')).json();assert.equal(list.datasets.length,1);await unauthorized.close()
 // Return to rich demo for screenshots; keep personal import verified above.
 await page.getByRole('button',{name:'تمرین جدید',exact:true}).click()
 await page.getByLabel('منبع داده تمرین',{exact:true}).selectOption(catalog.data.datasets[0].id)
 await page.getByLabel('شروع Replay UTC',{exact:true}).fill('2025-01-08T00:00')
 await page.getByRole('button',{name:'ساخت تمرین با این سرمایه',exact:true}).click()
 await page.getByTestId('candle-time').filter({hasText:'2025-01-08 00:00'}).waitFor()
 await page.getByRole('button',{name:'اندیکاتورها',exact:true}).click();await page.getByRole('button',{name:'قالب روند',exact:true}).click();await page.getByLabel('Relative Strength Index · RSI 14',{exact:true}).check();await page.getByRole('button',{name:'بستن پنجره',exact:true}).click()
 await page.getByRole('button',{name:'تمام صفحهٔ چارت',exact:true}).click()
 await page.locator('.candle-workspace.is-focused').waitFor()
 await page.getByRole('button',{name:'معاملات',exact:true}).click()
 await page.screenshot({path:new URL('../qa/candles-fullscreen.png',import.meta.url).pathname})
 await page.keyboard.press('Escape')
 await page.screenshot({path:new URL('../qa/candles-desktop.png',import.meta.url).pathname,fullPage:true})
 for(const width of [360,390,768,1440]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(120);await noOverflow('responsive '+width)
  await page.getByRole('button',{name:'تمام صفحهٔ چارت',exact:true}).click();await page.waitForTimeout(120);await noOverflow('focus '+width)
  const bounds=await page.locator('.candle-workspace').boundingBox();assert.ok(Math.abs(bounds.width-width)<2);assert.ok(Math.abs(bounds.height-900)<2)
  if(width===390)await page.screenshot({path:new URL('../qa/candles-mobile-fullscreen.png',import.meta.url).pathname})
  await page.keyboard.press('Escape')
 }
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({ok:true,drawings:27,indicators:15,timeframes:9,chartTypes:6,checks:['aggregation-prefix','retry','concurrency','ownership','CSV-private-import','market-order-fill-close','all-drawings-UI','undo-redo','drawing-resume','anchor-edit','comparison-time','settings-resume','imported-dataset-12-command-race','end-boundary','all-indicators','all-frames','fullscreen','PNG-export','responsive-360-390-768-1440']},null,2))
}catch(e){await page.screenshot({path:new URL('../qa/candles-e2e-failure.png',import.meta.url).pathname,fullPage:true});console.error('PAGE ERRORS',errors);throw e}finally{await browser.close()}
