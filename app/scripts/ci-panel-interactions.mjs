import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {randomUUID,randomBytes} from 'node:crypto'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs'),{tokenHash}=await import('../server/auth.mjs')
const base='http://127.0.0.1:5183',user=randomUUID(),token=randomBytes(32).toString('hex'),errors=[],checks=[]
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const context=await browser.newContext(),page=await context.newPage()
page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await mkdir('qa/interactions',{recursive:true})
const settled=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
const sample=()=>page.evaluate(async()=>{const samples=[];for(let i=0;i<36;i++){await new Promise(requestAnimationFrame);samples.push(['.expert-chart-workbench','.expert-native-desk'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100)}))}return new Set(samples.slice(-12).map(s=>JSON.stringify(s))).size})
async function clickNative(loc){
 await loc.evaluate(n=>{if(n.closest('.more-content'))n.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})})
 const rect=()=>loc.evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,iw:innerWidth}})
 let r=await rect(),host=await page.locator('.expert-native-desk iframe').boundingBox()
 await page.locator('.main-scroll').evaluate((n,dy)=>n.scrollTo({top:n.scrollTop+dy,behavior:'instant'}),host.y+r.y*host.width/r.iw-page.viewportSize().height*.5);await settled()
 r=await rect();host=await page.locator('.expert-native-desk iframe').boundingBox();const x=host.x+r.x*host.width/r.iw,y=host.y+r.y*host.width/r.iw
 assert.ok(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.expert-native-desk'),{x,y}),'Control must be unobstructed')
 await page.mouse.click(x,y);await settled()
}
try{
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Panel QA',user+'@example.test','unusable-qa-hash'])
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token),user])
 await context.addCookies([{name:'tradersho_session',value:token,url:base}])
 // Test native commits without a scaled frame: a blur must not consume the next click.
 const nativePage=await context.newPage();nativePage.on('pageerror',e=>errors.push(e.message))
 const html=(await readFile('src/expert/simulator.html','utf8')).replace('/* SHARED_DEMO_MARKET */',(await readFile('src/expert/demo-market.mjs','utf8')).replace(/^export /gm,''))
 await nativePage.setViewportSize({width:1400,height:1000});await nativePage.setContent('<iframe title="Native QA" style="width:1200px;height:930px;border:0"></iframe>')
 await nativePage.locator('iframe').evaluate((n,h)=>n.srcdoc=h,html)
 const f=nativePage.frames().find(f=>f!==nativePage.mainFrame())||await new Promise(resolve=>nativePage.once('frameattached',resolve))
 await f.locator('#tabs button').first().waitFor();await f.getByRole('tab',{name:/Manage/}).click()
 await f.locator('[data-action=colors]').click();await f.locator('[data-source-hex]').fill('#123abc');await f.locator('[data-action=source-color-apply]').click()
 assert.equal(await f.locator('#native-popup').count(),0,'HEX then Apply works on the first click');assert.equal(await f.evaluate(()=>state.colors.tp),'#123abc')
 await f.locator('[data-action=colors]').click();await f.locator('[data-source-hex]').fill('#abc');await f.locator('[data-action=source-color-apply]').click()
 assert.equal(await f.locator('#native-popup').count(),1,'Invalid HEX stays open');assert.equal(await f.locator('[data-source-hex]').getAttribute('aria-invalid'),'true')
 await f.locator('[data-source-hex]').fill('#abcdef');await f.locator('[data-action=source-color-cancel]').click();assert.equal(await f.locator('#native-popup').count(),0,'Cancel works immediately after HEX edit');assert.equal(await f.evaluate(()=>state.colors.tp),'#123abc')
 await nativePage.evaluate(()=>{window.__sizes=[];addEventListener('message',e=>{if(e.data?.type==='tradersho-expert-size')window.__sizes.push(e.data)})})
 await f.locator('[data-action=settings]').click();await nativePage.waitForTimeout(80)
 const sizes=await nativePage.evaluate(()=>window.__sizes);assert.ok(sizes.length>=1&&sizes.length<=2);assert.ok(sizes.every(s=>s.width===840&&s.height===473),'Only final geometry is published, never transient layout '+JSON.stringify(sizes))
 await f.locator('[data-page=Presets]').click();await f.locator('[data-source-select=selected]').selectOption('0');await f.locator('[data-action=source-preset-default]').click();await f.locator('[data-source-select=selected]').selectOption('1');await f.locator('[data-action=source-preset-delete]').click();assert.equal(await f.locator('[data-source-select=startup]').inputValue(),'0','Deleting another preset preserves startup default')
 await f.locator('[data-action=source-preset-new]').click();await f.locator('[data-section=trail] summary').click();await f.locator('[data-source-toggle=trail]').check();await f.locator('[data-source-field=trailStart]').fill('');await f.locator('[data-action=source-preset-save]').click();assert.equal(await f.locator('[data-source-field=name]').count(),1,'Empty numeric draft is not coerced to zero and saved')
 await f.locator('[data-source-field=trailStart]').fill('500');await f.locator('[data-source-field=name]').fill('Interactive QA');await f.locator('[data-action=source-preset-save]').click();assert.equal(await f.locator('[data-source-field=name]').count(),0)
 await f.locator('[data-action=settings-back]').click();await f.locator('[data-action=scale-up]').click();await nativePage.keyboard.press('Space');assert.equal(await f.evaluate(()=>state.scale),120,'Rerender preserves button focus for repeated keyboard activation')
 await f.getByRole('tab',{name:/Setup/}).click();await nativePage.keyboard.press('ArrowRight');assert.equal(await f.evaluate(()=>state.tab),'portfolio','A clicked tab retains keyboard navigation')
 await nativePage.close();checks.push('native-first-click-HEX-invalid-Cancel-preset-default-empty-input-final-size');console.log('PASS',checks.at(-1))
 // Whole-page scaling, rapid transitions, keyboard focus and pinned guide positions.
 for(const width of [390,768,1366,2560])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/tools/expert');await page.waitForFunction(()=>document.querySelector('.expert-academy-intro button')?.disabled===false);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  const native=page.frameLocator('.expert-native-desk iframe'),send=(key,tab='manage')=>page.locator('.expert-native-desk iframe').evaluate((n,d)=>n.contentWindow.postMessage({type:'tradersho-expert-command',action:'topic',...d},'*'),{key,tab})
  await send('general');await native.locator('.more-layout').waitFor();await settled();assert.equal(await sample(),1,'Settings settles without ongoing layout jitter '+width)
  await clickNative(native.locator('[data-action=settings-back]'));await clickNative(native.getByRole('tab',{name:/Manage/}));await clickNative(native.locator('[data-action=colors]'));await native.locator('[data-source-hex]').fill('#2468aa');await clickNative(native.locator('[data-action=source-color-apply]'));if(await native.locator('#native-popup').count()){console.log('FAILED APPLY',width,await native.locator('[data-action=source-color-apply]').evaluate(n=>{const r=n.getBoundingClientRect();return {r:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML,scroll:[scrollX,scrollY],value:document.querySelector('[data-source-hex]').value,invalid:[...document.querySelectorAll('[aria-invalid=true]')].map(n=>n.outerHTML)}}));await page.screenshot({path:'qa/interactions/failed-apply.png'})};assert.equal(await native.locator('#native-popup').count(),0,'Scaled Apply remains clickable '+width)
  await settled();assert.equal(await sample(),1,'Popup closes without size oscillation '+width)
  if(width>=1366){
   await page.locator('.expert-help-window').first().getByRole('button',{name:'سنجاق‌کردن راهنما',exact:true}).click();const title=await page.locator('.expert-help-window').first().getAttribute('aria-label'),guide=page.getByRole('article',{name:title,exact:true})
   const before=await guide.evaluate(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}))
   await clickNative(native.getByRole('tab',{name:/Setup/}));await clickNative(native.locator('[data-action=add-tp]'));await clickNative(native.locator('[data-action=atr]'))
   const after=await guide.evaluate(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}));assert.deepEqual(after,before,'Opening rows does not rearrange pinned guides');await page.locator('.expert-chart-workbench').scrollIntoViewIfNeeded();const h=await guide.locator('header').boundingBox(),canvas=await page.locator('.expert-chart-workbench').boundingBox();await page.mouse.move(h.x+h.width*.58,h.y+20);await page.mouse.down();await page.mouse.move(h.x+h.width*.58,Math.min(page.viewportSize().height-24,canvas.y+canvas.height-30),{steps:8});await page.mouse.up();await settled();const moved=await guide.boundingBox();assert.ok(moved.y+moved.height<=canvas.y+canvas.height-8,'Dragged guide remains readable inside the workbench')
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1));await page.locator('.expert-lab').screenshot({path:`qa/interactions/expert-${width}-${theme}.png`});console.log('PASS stable expert',width,theme)
 }
 checks.push('8-expert-viewport-theme-transition-and-stability-cases')
 // Fixed market time keeps the test valid across Tehran/UTC midnight.
 const now=new Date('2026-11-13T09:00:00Z'),day='2026-11-13',events=Array.from({length:125},(_,i)=>({id:'audit-'+i,title:'رویداد آزمایشی '+i,originalTitle:i%2?'JPY Unemployment Rate':'US Employment Change NFP',country:i%2?'JP':'US',currency:i%2?'JPY':'USD',impact:['high','medium','low'][i%3],date:day,at:new Date(+now+(i+1)*60000).toISOString(),status:'scheduled',actual:{value:'0',unit:'percent'},forecast:{value:'1',unit:'percent'},previous:{value:'-0.5',unit:'percent'},favorableDirection:'higher',sourceUrl:'https://persianfx.com/'}))
 let failure=false,held=[],holdPreview=false,actual='0'
 await context.route('**/api/calendar?**',async r=>{const u=new URL(r.request().url()),p=u.searchParams;if(p.has('upcoming')&&holdPreview){held.push(r);return}if(failure){await r.fulfill({status:503,json:{error:'QA transient failure'}});return}let rows=events.filter(e=>(!p.get('q')||(e.title+' '+e.originalTitle+' '+e.currency).toLowerCase().includes(p.get('q').toLowerCase()))&&(p.get('currency')==='all'||p.get('currency')?.split(',').includes(e.currency))&&(p.get('impact')==='all'||p.get('impact')?.split(',').includes(e.impact)));const total=rows.length;rows=p.has('upcoming')?rows.slice(0,50):rows.slice((Number(p.get('page'))-1)*100,Number(p.get('page'))*100);await r.fulfill({json:{configured:true,events:rows.map(e=>({...e,actual:{...e.actual,value:actual}})),total,serverNow:now.toISOString(),updatedAt:now.toISOString(),sources:[]}})})
 await context.route('https://flicker.finance/**',r=>r.fulfill({contentType:'text/html',body:'<title>Gold QA</title>'}))
 for(const width of [390,768,1366,2560]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/tools/calendar');await page.locator('tbody tr').first().waitFor();assert.equal(await page.locator('tbody tr').count(),100)
  await page.getByRole('button',{name:'بعدی',exact:true}).click();await page.waitForFunction(()=>document.querySelector('tbody tr')?.textContent.includes('رویداد آزمایشی 100'));assert.equal(await page.locator('tbody tr').count(),25)
  await page.getByRole('button',{name:'قبلی',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===100)
  if(await page.locator('.calendar-filter-panel').getAttribute('open')===null)await page.locator('.calendar-filter-panel>summary').click()
  await page.getByRole('searchbox',{name:'جستجوی رویداد',exact:true}).fill('jpy');await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===62);assert.equal(await page.locator('tbody .calendar-event-country').getByText('USD',{exact:true}).count(),0)
  await page.getByRole('button',{name:'پاک‌کردن جستجو',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===100)
  failure=true;await page.getByRole('button',{name:'بررسی به‌روزرسانی تقویم',exact:true}).click();await page.locator('.calendar-refresh-error').waitFor();assert.equal(await page.locator('tbody tr').count(),100,'Transient refresh failure preserves the current table')
  failure=false;actual='2';await page.locator('.calendar-refresh-error button').click();await page.waitForFunction(()=>!document.querySelector('.calendar-refresh-error'));assert.equal(await page.locator('td.outcome-positive').count(),100,'Retry refreshes result values and colours')
  await page.screenshot({path:`qa/interactions/calendar-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS calendar pagination/search/failure/retry',width)
 }
 checks.push('calendar-pagination-search-4-widths-refresh-failure-retry-and-zero')
 await page.setViewportSize({width:1366,height:900});await page.goto(base+'/panel/tools');await page.locator('.calendar-preview-event').first().waitFor()
 const picker=page.locator('.preview-filters .currency-picker');await picker.locator('summary').click();await picker.getByRole('checkbox',{name:'JPY',exact:true}).focus();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.preview-filters .currency-picker').open);assert.equal(await picker.getAttribute('open'),null);assert.ok(await picker.locator('summary').evaluate(n=>n===document.activeElement))
 await picker.locator('summary').click();await page.locator('.analysis-heading h1').click();await page.waitForFunction(()=>!document.querySelector('.preview-filters .currency-picker').open);assert.equal(await picker.getAttribute('open'),null,'Click outside dismisses preview currency panel')
 failure=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForFunction(()=>document.querySelector('.calendar-preview-card .context-caption').textContent.includes('آخرین داده'));assert.ok(await page.locator('.calendar-preview-event').count()>0,'Background failure does not empty preview');failure=false
 holdPreview=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(100);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(100);assert.equal(held.length,2)
 const response=title=>({json:{events:[{...events[0],title}],total:1,serverNow:now.toISOString()}});await held[1].fulfill(response('جدیدترین نتیجه'));await page.getByText('جدیدترین نتیجه',{exact:true}).waitFor();await held[0].fulfill(response('پاسخ قدیمی'));await settled();assert.equal(await page.getByText('پاسخ قدیمی',{exact:true}).count(),0,'Slow old response cannot overwrite newer data');holdPreview=false
 checks.push('preview-dismiss-keyboard-stale-data-out-of-order-refresh');console.log('PASS',checks.at(-1))
 // Clipboard is asynchronous: editing the plan invalidates pending success feedback.
 await page.goto(base+'/panel/tools/risk');await page.locator('.risk-stats').waitFor();await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(r=>window.__resolveCopy=r)}})})
 await page.getByRole('button',{name:'کپی برنامهٔ ریسک',exact:true}).click();await page.locator('#risk-balance').fill('20000');await page.evaluate(()=>window.__resolveCopy());await settled();assert.equal(await page.getByRole('button',{name:'برنامه کپی شد',exact:true}).count(),0,'Cannot claim the edited plan was copied by an older request')
 for(const [key,value] of [['balance',''],['baseRisk','0'],['rr','0'],['maxLoss','101'],['cycleLength','2.5']]){await page.getByRole('button',{name:'بازنشانی تنظیمات ریسک به پیش‌فرض',exact:true}).click();await page.locator('#risk-'+key).fill(value);assert.equal(await page.locator('.risk-stat').count(),0);assert.equal(await page.locator('#risk-'+key).getAttribute('aria-invalid'),'true')}
 await page.getByRole('button',{name:'بازنشانی تنظیمات ریسک به پیش‌فرض',exact:true}).click();assert.equal(await page.locator('.risk-table-scroll tbody tr').count(),6);checks.push('risk-copy-race-each-invalid-field-reset')
 assert.deepEqual(errors,[]);await writeFile('qa/interactions/report.json',JSON.stringify({checks,errors},null,2));console.log('PASS strict interaction audit',checks)
}finally{await browser.close();await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end()}
