import assert from 'node:assert/strict'
import {randomUUID,createHmac} from 'node:crypto'
import {readFile,mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('A dedicated _qa database is required')
const {pool}=await import('../server/db.mjs'),base='http://127.0.0.1:5183',email=`ci-ui-${randomUUID()}@example.test`
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const page=await browser.newPage({reducedMotion:'reduce'}),axe=await readFile('node_modules/axe-core/axe.min.js','utf8'),errors=[]
if(!process.env.QA_BRAND_FONTS)await page.context().route('**/fonts/**',r=>r.abort())
await page.context().route('https://flicker.finance/embed/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><title>QA gold widget</title></head><body>Gold Ounce · XAU — widget QA fixture</body></html>'}))
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(base+'/auth');await page.getByRole('tab',{name:'ثبت‌نام',exact:true}).click();await page.getByPlaceholder('نام و نام خانوادگی',{exact:true}).fill('آزمون کاربر');await page.getByPlaceholder('name@example.com').fill(email);await page.getByPlaceholder('رمز عبور قوی').fill('UiRelease#2026');await page.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill('UiRelease#2026');await page.getByAltText('تصویر کد امنیتی پنج‌رقمی').waitFor();await page.getByLabel('کد امنیتی',{exact:true}).fill('00000');await page.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await page.getByRole('alert').waitFor()
 await page.waitForFunction(()=>document.querySelector('.captcha-refresh')?.disabled===false)
 const signupResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/captcha')&&r.status()===200)
 await page.getByRole('button',{name:'دریافت کد امنیتی جدید'}).click();const signupCap=await (await signupResponse).json()
 await pool.query('UPDATE login_captcha SET answer_hash=$1 WHERE id=$2',[createHmac('sha256',process.env.CAPTCHA_SECRET).update(signupCap.id+':12345').digest('hex'),signupCap.id])
 await page.getByLabel('کد امنیتی',{exact:true}).fill('12345');await page.getByRole('button',{name:'ایجاد حساب',exact:true}).click();await page.waitForURL(base+'/panel')
 // A responsive child reports its natural height, like the hosted Flicker widget.
 // Height-dependent parent zoom makes its width cross this wrapping threshold forever.
 await page.context().route('https://flicker.finance/embed/**',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><head><title>Responsive gold widget QA</title><style>body{margin:0}main{box-sizing:border-box;padding:16px}</style></head><body><main>Gold sentiment responsive fixture</main><script>const content=document.querySelector('main');function layout(){content.style.height=(innerWidth<470?280:260)+'px'}layout();addEventListener('resize',layout);new ResizeObserver(()=>parent.postMessage({type:'flicker-widget:resize',height:Math.ceil(document.body.getBoundingClientRect().height)},'*')).observe(document.body);</script></body></html>`}))
 for(const [width,height] of [[1280,720],[1366,768],[1440,900],[390,844]]){
  await page.setViewportSize({width,height});await page.goto(base+'/panel/tools',{waitUntil:'domcontentloaded'});const widget=page.locator('.flicker-card iframe');await widget.waitFor();await widget.scrollIntoViewIfNeeded();await widget.contentFrame().getByText('Gold sentiment responsive fixture').waitFor();await page.waitForTimeout(500)
  const samples=[];for(let i=0;i<15;i++){samples.push(await widget.evaluate(n=>{const r=n.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y}}));await page.waitForTimeout(100)}
  for(const k of ['w','h','x','y'])assert.ok(Math.max(...samples.map(s=>s[k]))-Math.min(...samples.map(s=>s[k]))<1,'Gold widget must settle without resizing or shaking: '+JSON.stringify({width,height,k,samples}))
  const contentSize=await widget.contentFrame().locator('body').evaluate(()=>({scroll:document.documentElement.scrollHeight,client:document.documentElement.clientHeight,viewport:innerHeight}));assert.ok(contentSize.scroll<=contentSize.client+1,'The widget must have room for its full content without a vertical scrollbar: '+JSON.stringify({width,height,...contentSize}))
 }
 await page.setViewportSize({width:1440,height:900});await page.clock.install({time:new Date()});await page.goto(base+'/panel/tools');await page.locator('.flicker-card iframe').waitFor();const widgetBefore=await page.locator('.flicker-card iframe').getAttribute('src');const chartBefore=await page.locator('.tv-host iframe').getAttribute('src');await page.clock.runFor(300001);await page.waitForFunction(old=>document.querySelector('.flicker-card iframe')?.getAttribute('src')!==old,widgetBefore);assert.equal(await page.locator('.tv-host iframe').getAttribute('src'),chartBefore,'Widget refresh preserves the chart');await page.clock.setSystemTime(new Date());await page.clock.resume()
 await page.context().unroute('https://flicker.finance/embed/**')
 await page.context().route('https://flicker.finance/embed/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><title>QA gold widget</title></head><body>Gold Ounce · XAU — widget QA fixture</body></html>'}))
 const guest=await browser.newContext({reducedMotion:'reduce'}),loginPage=await guest.newPage()
 if(!process.env.QA_BRAND_FONTS)await guest.route('**/fonts/**',r=>r.abort())
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
 const ticketResponse=await page.context().request.post(base+'/api/tickets',{headers:{Origin:base},data:{subject:'بررسی چیدمان درخواست با عنوان فارسی طولانی برای تست رابط',message:'این درخواست صرفاً دادهٔ آزمون رابط در پایگاه QA است و اطلاعات واقعی کاربر ندارد.',category:'technical',priority:'normal',requestId:randomUUID()}});assert.equal(ticketResponse.status(),201);const auditTicket=await ticketResponse.json()
 await mkdir('qa/panel',{recursive:true})
 for(const width of [320,390,768,1024,1280,1440,1920,2560,3840])for(const theme of ['light','dark'])for(const path of ['/panel','/panel/tools','/panel/market','/panel/support','/panel/support/new','/panel/support/'+auditTicket.id,'/panel/account','/panel/wallet','/panel/rebate','/forgot-password','/privacy']){
  await page.setViewportSize({width,height:900});await page.goto(base+path);await page.locator('h1,.coming-soon h2').first().waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${theme} ${path}`)
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))),[],`${width} ${theme} ${path}`)
  if(process.env.QA_BRAND_FONTS){await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.fonts.check('16px "Yekan Bakh"')),'Brand font loaded')}
  if(path.startsWith('/panel'))assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'No outer page tail '+width+' '+theme+' '+path)
  const spills=await page.evaluate(()=>[...document.querySelectorAll('.main-inner input:not([type=checkbox]),.main-inner select,.main-inner textarea,.calendar-search-box,.currency-filter')].filter(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return r.width>0&&(r.left<p.left-2||r.right>p.right+2)}).map(n=>({tag:n.tagName,cls:n.className,label:n.getAttribute('aria-label')})));assert.deepEqual(spills,[],`Control alignment ${width} ${theme} ${path}`)
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('select:not([multiple])')].filter(n=>n.getBoundingClientRect().width>0).every(n=>{const s=getComputedStyle(n);return s.appearance==='none'&&s.backgroundImage!=='none'&&s.backgroundPositionX==='12px'&&parseFloat(s.paddingInlineEnd)>=36})),'Select arrows have a consistent inset')
  await page.screenshot({path:`qa/panel/${path.replaceAll('/','-')}-${width}-${theme}.png`})
 }
 await mkdir('qa/tools',{recursive:true})
 for(const width of [320,390,768,1024,1440,2560])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel');await page.locator('.home-tools-copy').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(200)
  const separated=await page.evaluate(()=>{const a=document.querySelector('.market-pulse').getBoundingClientRect(),b=document.querySelector('.home-tools-copy').getBoundingClientRect();return a.right+8<=b.left||a.bottom+8<=b.top})
  assert.ok(separated,`Banner artwork must not overlap text: ${width} ${theme}`)
  await page.locator('.home-tools-entry').screenshot({path:`qa/tools/banner-${width}-${theme}.png`})
 }
 await page.context().route('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',r=>r.fulfill({contentType:'application/javascript',body:`{const script=document.currentScript;const cfg=JSON.parse(script.textContent);window.__chartConfig=cfg;const frame=document.createElement('iframe');frame.title='نمودار تحلیل بازار TradingView';frame.style='width:100%;height:100%;border:0';frame.srcdoc='<html><body style="background:#f5f5fa;font:16px Arial">XAUUSD · 1h · QA widget</body></html>';script.parentElement.querySelector('.tradingview-widget-container__widget').append(frame)}`}))
 for(const width of [320,390,768,1024,1440,1920,2560,3440,3840])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/panel/tools');await page.locator('.tv-host iframe').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(150)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.ok((await page.locator('.flicker-card iframe').getAttribute('src')).startsWith('https://flicker.finance/embed/en/xau/fear-greed?'));assert.equal(await page.locator('.analysis-context > section').count(),2);assert.ok(await page.locator('.preview-filters .currency-picker>summary').isVisible(),'Multi-currency preview picker is visible')
  assert.ok(await page.evaluate(()=>{const cards=document.querySelectorAll('.analysis-context > section');return cards[1].getBoundingClientRect().top>=cards[0].getBoundingClientRect().bottom}),'Gold sentiment stays beneath calendar')
  assert.equal(await page.evaluate(()=>window.__chartConfig.symbol),'OANDA:XAUUSD');assert.equal(await page.evaluate(()=>window.__chartConfig.interval),'60')
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[])
  await page.screenshot({path:`qa/tools/workspace-${width}-${theme}.png`,fullPage:true})
  await page.getByRole('button',{name:'نمای تمام‌صفحه',exact:true}).click();await page.getByRole('dialog',{name:'محیط تحلیل بازار'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.tv-expanded').count(),0)
  const railBefore=await page.locator('.analysis-rail').boundingBox()
  await page.getByRole('navigation',{name:'ابزارهای تحلیل'}).getByRole('link',{name:'پنل ریسک'}).click();await page.locator('.risk-stats').waitFor();assert.equal(await page.locator('.tv-host').count(),0)
  if(width>=1201){const railAfter=await page.locator('.analysis-rail').boundingBox();assert.ok(Math.abs(railBefore.height-railAfter.height)<2&&Math.abs(railBefore.width-railAfter.width)<2&&Math.abs(railBefore.x-railAfter.x)<2&&Math.abs(railBefore.y-railAfter.y)<2,'Tool rail must keep its size across tabs')}
  await page.getByRole('navigation',{name:'ابزارهای تحلیل'}).getByRole('link',{name:'نمای بازار',exact:true}).click();await page.locator('.tv-host iframe').waitFor()
 }
 for(const width of [390,1440,3840])for(const theme of ['light','dark'])for(const tool of ['journal','compass','scenario','widgets']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/tools/'+tool);await page.locator('.coming-soon h2').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  assert.equal(await page.locator('.analysis-rail [aria-current=page]').getAttribute('href'),'/panel/tools/'+tool);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.getByText('به‌زودی',{exact:true}).last().isVisible())
 }
 await page.context().route('**/api/calendar?**',r=>r.fulfill({json:{configured:true,events:Array.from({length:50},(_,n)=>({id:'preview-long-'+n,originalTitle:'US Non-Farm Employment Change NFP',title:'عنوان طولانی رویداد اقتصادی برای بررسی چیدمان و نمایش در تقویم '.repeat(6),country:'US',currency:'USD',impact:'high',date:new Date().toISOString().slice(0,10),at:new Date(Date.now()+n*60000).toISOString(),status:'scheduled'}))}}))
 for(const [width,height] of [[1280,720],[1366,768],[1440,900],[1920,1080],[2560,1440],[3440,1440],[3840,2160]])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height});await page.goto(base+'/panel/tools');await page.locator('.tv-host iframe').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  const fit=await page.evaluate(()=>{const host=document.querySelector('.main-scroll'),chart=document.querySelector('.tv-chart').getBoundingClientRect(),cards=[...document.querySelectorAll('.analysis-context>section')].map(n=>n.getBoundingClientRect());return {scroll:host.scrollHeight,client:host.clientHeight,chartBottom:chart.bottom,cardsBottom:Math.max(...cards.map(r=>r.bottom)),height:innerHeight}})
  assert.ok(fit.scroll<=fit.client+2,JSON.stringify(fit));assert.ok(fit.chartBottom<=height&&fit.cardsBottom<=height,JSON.stringify(fit));assert.ok(Math.abs(fit.cardsBottom-fit.chartBottom)<2,'Context cards must align with chart: '+JSON.stringify(fit))
  const previewCount=await page.locator('.calendar-preview-event').count();assert.ok(previewCount>=1&&previewCount<=50);if(height>=1080)assert.ok(previewCount>2,'Tall screens display more than two upcoming events')
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.analysis-center .surface')].every(n=>{const s=getComputedStyle(n);return s.animationName==='none'&&s.backgroundImage==='none'})),'Data panels have no animated purple background')
  const previewFits=await page.evaluate(()=>{const region=document.querySelector('.calendar-preview').getBoundingClientRect();return [...document.querySelectorAll('.calendar-preview-event')].every(n=>{const r=n.getBoundingClientRect();return r.top>=region.top-1&&r.bottom<=region.bottom+1})});assert.ok(previewFits,'All preview rows fit their region '+JSON.stringify({width,height,layout:await page.evaluate(()=>[...document.querySelectorAll('.calendar-preview,.calendar-preview-event,.flicker-card')].map(n=>({c:n.className,h:n.clientHeight,t:n.getBoundingClientRect().top,b:n.getBoundingClientRect().bottom})))}))
  const columnsFit=await page.evaluate(()=>[...document.querySelectorAll('.calendar-preview-event')].every(n=>{const time=n.querySelector('time').getBoundingClientRect(),country=n.querySelector('.event-country').getBoundingClientRect(),title=n.querySelector('.preview-event-title').getBoundingClientRect(),impact=n.querySelector('.preview-impact').getBoundingClientRect();return title.width>=100&&impact.right<=title.left+1&&title.right<=country.left+1&&country.right<=time.left+1}));assert.ok(columnsFit,'Time, currency/flag, title and importance remain separate on each preview row')
  await page.screenshot({path:`qa/tools/calendar-preview-${width}x${height}-${theme}.png`})
  assert.equal(await page.locator('.flicker-guide summary').count(),0);assert.ok(await page.getByText('ترس شدید',{exact:true}).isVisible())
 }
 await page.locator('.preview-filters .currency-picker>summary').click();const previewPicker=page.locator('.preview-filters .currency-picker');assert.equal(await previewPicker.getByRole('checkbox',{name:'CNY',exact:true}).isChecked(),false);assert.equal(await previewPicker.locator('input:checked').count(),8);await previewPicker.getByRole('button',{name:'پاک‌کردن انتخاب‌ها',exact:true}).click();await previewPicker.getByRole('checkbox',{name:'USD',exact:true}).check();await Promise.all([page.waitForResponse(r=>new URL(r.url()).searchParams.get('currency')==='USD,EUR'),previewPicker.getByRole('checkbox',{name:'EUR',exact:true}).check()]);await previewPicker.getByRole('button',{name:'تأیید و بستن',exact:true}).click();assert.equal(await previewPicker.getAttribute('open'),null);assert.ok(await page.locator('.preview-filters .impact-filter').evaluate(n=>{const widths=[...n.querySelectorAll('.impact-choice')].map(b=>b.getBoundingClientRect().width);return Math.max(...widths)-Math.min(...widths)<1}),'Impact choices have equal widths');await Promise.all([page.waitForResponse(r=>new URL(r.url()).searchParams.get('impact')==='high,medium'),page.getByRole('group',{name:'اهمیت پیش‌نمایش'}).getByRole('button',{name:'کم',exact:true}).click()]);assert.ok(await page.getByRole('group',{name:'اهمیت پیش‌نمایش'}).getByRole('button',{name:'زیاد',exact:true}).getAttribute('aria-pressed')==='true');assert.equal(await page.getByRole('group',{name:'اهمیت پیش‌نمایش'}).getByRole('button',{name:'کم',exact:true}).getAttribute('aria-pressed'),'false');assert.ok(await page.locator('.preview-event-title small').first().isVisible());assert.equal(await page.locator('.calendar-preview-event .country-flag').count(),0)
 await page.context().route('**/api/calendar?**',r=>{const now=Date.now();return r.fulfill({json:{configured:true,serverNow:new Date(now).toISOString(),total:6,events:[
  {id:'past',title:'رویداد گذشته QA',currency:'USD',country:'US',at:new Date(now-60000).toISOString(),date:new Date(now).toISOString().slice(0,10),status:'scheduled'},
  {id:'cancel',title:'رویداد لغوشده QA',currency:'USD',country:'US',at:new Date(now+60000).toISOString(),date:new Date(now).toISOString().slice(0,10),status:'cancelled'},
  {id:'released',title:'رویداد منتشرشده QA',currency:'USD',country:'US',at:new Date(now+60000).toISOString(),date:new Date(now).toISOString().slice(0,10),status:'released'},
  {id:'untimed',title:'رویداد بدون ساعت QA',currency:'USD',country:'US',at:null,date:new Date(now).toISOString().slice(0,10),status:'scheduled'},
  {id:'soon',title:'رویداد نزدیک QA',currency:'USD',country:'US',at:new Date(now+5000).toISOString(),date:new Date(now).toISOString().slice(0,10),status:'scheduled'},
  {id:'future',title:'رویداد آینده QA',currency:'USD',country:'US',at:new Date(now+600000).toISOString(),date:new Date(now).toISOString().slice(0,10),status:'scheduled'}]}})})
 await page.goto(base+'/panel/tools');await page.getByText('رویداد نزدیک QA',{exact:true}).waitFor();assert.equal(await page.locator('.calendar-preview-event').count(),2)
 await page.waitForFunction(()=>![...document.querySelectorAll('.calendar-preview-event')].some(n=>n.textContent.includes('رویداد نزدیک QA')),{},{timeout:8000});assert.equal(await page.locator('.calendar-preview-event').count(),1);assert.ok(await page.getByText('رویداد آینده QA',{exact:true}).isVisible())
 await page.context().unroute('**/api/calendar?**')
 assert.equal((await page.context().request.get(base+'/api/news')).status(),410)
 assert.equal((await page.context().request.get(base+'/api/calendar')).status(),200)
 await page.context().route('**/api/calendar**',r=>r.fulfill({json:{configured:true,updatedAt:new Date().toISOString(),sources:[{provider:'persianfx',name:'PersianFX',url:'https://persianfx.com/',count:30,status:'ok',lastSuccess:new Date().toISOString()}],events:Array.from({length:30},(_,n)=>({id:'calendar-qa-'+n,title:'رویداد آزمایشی '+n,originalTitle:'US Economic Release '+n,at:new Date(Date.now()+n*60000).toISOString(),country:'US',currency:'USD',impact:'high',actual:{value:'5.05',currency:'EUR',unit:'billion'},forecast:n===1||n===2?{value:'6',unit:'billion',currency:'EUR'}:{value:'-12',unit:'thousand'},favorableDirection:n===1?'higher':n===2?'lower':null,previous:null,sourceUrl:'https://www.bls.gov/schedule/'}))}}))
 await page.goto(base+'/panel/tools/calendar');await page.getByRole('link',{name:'رویداد آزمایشی 0',exact:true}).waitFor()
 assert.ok(await page.locator('tbody tr').nth(1).locator('td.outcome-negative').isVisible());assert.ok(await page.locator('tbody tr').nth(2).locator('td.outcome-positive').isVisible());assert.ok(await page.locator('.event-countdown').count()>0,'Timed upcoming releases show a countdown')
 await page.getByRole('button',{name:'منبع داده',exact:true}).click();assert.equal(await page.locator('#calendar-sources').getAttribute('open'),'');assert.ok(await page.locator('#calendar-sources a').isVisible())
 assert.equal(await page.getByRole('checkbox',{name:'CNY',exact:true}).isChecked(),false);assert.equal(await page.locator('.currency-filter input:checked').count(),8)
 await page.getByRole('button',{name:'پاک‌کردن انتخاب‌ها',exact:true}).click();await page.getByRole('checkbox',{name:'USD',exact:true}).check()
 await Promise.all([page.waitForResponse(r=>new URL(r.url()).searchParams.get('currency')==='USD,EUR'),page.getByRole('checkbox',{name:'EUR',exact:true}).check()]);assert.equal(await page.getByRole('checkbox',{name:'JPY',exact:true}).isChecked(),false)
 await page.getByRole('button',{name:'تأیید و بستن',exact:true}).click();assert.equal(await page.locator('.calendar-native .currency-picker').getAttribute('open'),null);await page.locator('.calendar-native .currency-picker>summary').click()
 await page.getByRole('searchbox',{name:'جستجوی رویداد'}).fill('us');await page.getByRole('searchbox',{name:'جستجوی رویداد'}).focus()
 assert.ok(await page.locator('.calendar-search-box').evaluate(n=>{const s=getComputedStyle(n),i=getComputedStyle(n.querySelector('input'));return s.outlineWidth==='2px'&&s.outlineOffset==='-1px'&&i.outlineStyle==='none'}),'Search has one focus ring around the complete control')
 await page.getByRole('button',{name:'پاک‌کردن جستجو',exact:true}).click();assert.equal(await page.getByRole('searchbox',{name:'جستجوی رویداد'}).inputValue(),'')
 for(const width of [320,390,768,1024,1440,1920,2560,3440,3840])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/tools/calendar');await page.getByRole('link',{name:'رویداد آزمایشی 0',exact:true}).waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.equal(await page.getByRole('navigation',{name:'ابزارهای تحلیل'}).getByRole('link',{name:'اخبار',exact:true}).count(),0)
  assert.equal(await page.locator('.side-nav a[href="https://tradersho.com/school"]').count(),1)
  assert.equal(await page.locator('.side-nav a[href="/panel/market"]').count(),0)
  assert.equal(await page.locator('.economic-amount bdi').first().innerText(),'EUR 5.05');assert.equal(await page.locator('.amount-unit').first().innerText(),'میلیارد')
  assert.equal(await page.locator('.calendar-event-country .country-flag').count(),30)
  const stacked=await page.evaluate(()=>{const row=document.querySelector('.event-titles'),fa=row.querySelector('a').getBoundingClientRect(),en=row.querySelector('.event-original').getBoundingClientRect(),meta=document.querySelector('.calendar-event-meta');return en.top>=fa.bottom-1&&meta.querySelector('.event-status').getBoundingClientRect().top>=meta.querySelector('.event-impact').getBoundingClientRect().bottom-1});assert.ok(stacked,'Titles and importance/status retain two-line hierarchy')
  assert.ok(await page.locator('.country-flag').first().evaluate(n=>n.tagName==='IMG'&&n.complete&&n.naturalWidth>0),'Flag SVG loads without emoji fallback')
  assert.ok(await page.getByRole('button',{name:'بررسی به‌روزرسانی تقویم'}).evaluate(n=>getComputedStyle(n).backgroundColor==='rgb(84, 58, 255)'))
  await page.evaluate(()=>{const host=document.querySelector('.main-scroll'),head=document.querySelector('.native-calendar-table thead');host.scrollTop+=head.getBoundingClientRect().top-host.getBoundingClientRect().top+120});await page.waitForTimeout(150)
  const pinned=await page.evaluate(()=>{const bar=document.querySelector('.calendar-command').getBoundingClientRect(),host=document.querySelector('.main-scroll').getBoundingClientRect();return Math.abs(bar.top-host.top)<3})
  assert.ok(pinned,`Calendar command remains sticky at ${width} ${theme}`)
  if(width<=900)assert.ok(await page.evaluate(()=>{const rail=document.querySelector('.analysis-rail').getBoundingClientRect(),link=document.querySelector('.analysis-rail .selected').getBoundingClientRect();return link.left>=rail.left-1&&link.right<=rail.right+1}),'Active tool remains visible on the mobile rail')
  if(width>=1100)assert.ok(await page.evaluate(()=>Math.abs(document.querySelector('.native-calendar-table thead th').getBoundingClientRect().top-document.querySelector('.calendar-command').getBoundingClientRect().bottom)<4),'Desktop table headings stay below command bar')
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[])
  await page.screenshot({path:`qa/tools/calendar-native-${width}-${theme}.png`})
 }
 assert.deepEqual(errors,[]);console.log('PASS: registration through browser, 198 dashboard/support/account/privacy/calendar page/theme combinations, overflow and axe serious/critical checks; 12 banner separation checks; 18 tool-workspace sizes/themes with fullscreen, navigation and coming-soon checks; 18 native-calendar variants with sticky controls, unit isolation and school/news routing checks; 14 desktop viewport-fit checks with long calendar titles and an always-visible Persian guide; upcoming-only preview expiration, flat backgrounds and four responsive iframe stability/scrollbar regression cases. CI uses the published fallback font; private brand fonts are mounted on the VPS.')
}finally{await pool.query('DELETE FROM support_tickets WHERE user_id IN (SELECT id FROM users WHERE email=$1)',[email]);await pool.query('DELETE FROM users WHERE email=$1',[email]);await pool.end();await browser.close()}
