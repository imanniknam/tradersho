import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {readFile,mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs'),{tokenHash}=await import('../server/auth.mjs')
const user=randomUUID(),token=randomBytes(32).toString('hex'),base='http://127.0.0.1:5183'
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.newContext({reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8')
try{
 await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Risk QA',user+'@example.test','unusable-qa-hash'])
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token),user])
 await context.addCookies([{name:'tradersho_session',value:token,url:base}]);await mkdir('qa/risk',{recursive:true})
 assert.equal((await context.request.get(base+'/api/tools/risk/access')).status(),200)
 const guest=await browser.newContext();assert.equal((await guest.request.get(base+'/api/tools/risk/access')).status(),401);await guest.close()
 for(const width of [320,390,768,1024,1280,1440,1920,2560,3840])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/tools/risk');await page.locator('.risk-stats').waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme)
  assert.equal(await page.locator('.analysis-rail [aria-current=page]').innerText(),'پنل ریسک');assert.equal(await page.locator('.risk-table-scroll tbody tr').count(),6)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow '+width+' '+theme)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'No outer vertical overflow / blank page tail '+width+' '+theme)
  assert.ok(await page.locator('.risk-input').evaluateAll(nodes=>nodes.every(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1})))
  await page.screenshot({path:`qa/risk/${width}-${theme}.png`,fullPage:false});await page.addScriptTag({content:axe});const topIssues=await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.deepEqual(topIssues,[],'Top of risk panel '+width+' '+theme);
  await page.evaluate(()=>{const main=document.querySelector('.main-scroll');main.scrollTop=main.scrollHeight});await page.waitForTimeout(50)
  assert.ok(await page.evaluate(()=>{const main=document.querySelector('.main-scroll'),end=document.querySelector('.risk-method'),m=main.getBoundingClientRect(),e=end.getBoundingClientRect();return e.bottom<=m.bottom+1&&e.bottom>=m.bottom-150&&document.documentElement.scrollHeight<=innerHeight+1}),'Content ends at the application scroller without a second empty scroll '+width+' '+theme)
  await page.screenshot({path:`qa/risk/${width}-${theme}-bottom.png`,fullPage:false});const issues=await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));assert.deepEqual(issues,[],width+' '+theme)
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/panel/tools/risk');await page.getByLabel('موجودی مبنا',{exact:true}).waitFor()
 assert.ok((await page.locator('.risk-stat').nth(0).innerText()).includes('6.00%'));assert.ok((await page.locator('.risk-stat').nth(2).innerText()).includes('۱۰'))
 assert.equal(await page.locator('.risk-capacity-trades button').count(),11);assert.equal(await page.locator('.risk-capacity-trades .cycle').count(),5);assert.equal(await page.locator('.risk-capacity-trades .cycle-final').count(),1);assert.equal(await page.locator('.risk-capacity-trades .extra').count(),4);assert.equal(await page.locator('.risk-capacity-trades .blocked').count(),1);assert.ok((await page.locator('.risk-worst-case').innerText()).includes('$600.00'));assert.equal(await page.locator('.risk-meter,.risk-stat-meter,.risk-stat-dots').count(),0);
 const riskCells=await page.locator('.risk-table-scroll tbody tr td:nth-child(3)').allTextContents();assert.deepEqual(riskCells,['$56.95','$68.82','$84.64','$105.73','$133.86','$150.00'])
 await page.locator('.risk-bars button').nth(5).click();assert.ok((await page.locator('.risk-stage-detail').innerText()).includes('$0.00'))
 await page.getByLabel('سقف افت مجاز',{exact:true}).fill('5');assert.ok((await page.locator('.risk-limit h3').innerText()).includes('بیشتر'));assert.ok((await page.locator('.risk-stat').nth(2).innerText()).includes('۵'))
 await page.locator('.risk-bars button').nth(5).click();assert.ok(await page.locator('.risk-stage-status.blocked').isVisible())
 await page.getByLabel('موجودی مبنا',{exact:true}).fill('');await page.getByRole('heading',{name:'ابتدا ورودی‌ها را کامل کنید'}).waitFor();assert.equal(await page.locator('.risk-stat').count(),0);assert.equal(await page.getByLabel('موجودی مبنا',{exact:true}).getAttribute('aria-invalid'),'true')
 await page.getByLabel('موجودی مبنا',{exact:true}).fill('۱۰٬۰۰۰');await page.locator('.risk-stats').waitFor()
 await page.getByLabel('تعداد مراحل چرخه',{exact:true}).fill('2.5');assert.equal(await page.locator('.risk-stat').count(),0)
 await page.getByRole('button',{name:'بازنشانی تنظیمات ریسک'}).click();await page.getByLabel('ریسک پایه',{exact:true}).fill('0.01');await page.getByLabel('تعداد مراحل چرخه',{exact:true}).fill('2');await page.getByLabel('نسبت سود به ریسک',{exact:true}).fill('100');await page.getByLabel('سقف افت مجاز',{exact:true}).fill('100');assert.ok(await page.locator('.risk-capacity-trades button').count()<24);await page.locator('.risk-capacity-trades button').last().click();assert.ok(await page.locator('.risk-stage-status.blocked').isVisible())
 await page.getByRole('button',{name:'بازنشانی تنظیمات ریسک'}).click();await page.getByLabel('تعداد مراحل چرخه',{exact:true}).fill('20');await page.locator('.risk-bars button').nth(19).click();assert.ok((await page.locator('.risk-stage-id').innerText()).includes('T20'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),'20-stage chart scrolls internally');
 await page.getByRole('button',{name:'بازنشانی تنظیمات ریسک'}).click();await page.getByLabel('توزیع یکنواخت‌تر',{exact:false}).check();assert.ok((await page.locator('.risk-table-scroll tbody tr').first().innerText()).includes('0.51%'));await page.getByLabel('تمرکز روی معاملات اول',{exact:false}).check();assert.ok((await page.locator('.risk-table-scroll tbody tr').first().innerText()).includes('0.64%'))
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/panel/tools/risk');await page.getByRole('group',{name:'دسترسی سریع برنامهٔ ریسک'}).getByRole('button',{name:'مرز توقف',exact:false}).click();assert.ok(await page.locator('.risk-capacity').evaluate(n=>{const r=n.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}));assert.equal(await page.evaluate(()=>window.scrollY),0);await page.screenshot({path:'qa/risk/mobile-capacity.png'});await page.locator('.risk-stage-detail').scrollIntoViewIfNeeded();await page.screenshot({path:'qa/risk/mobile-stage.png'});
 await page.getByRole('button',{name:'بازنشانی تنظیمات ریسک'}).click();await page.getByRole('button',{name:'کپی برنامهٔ ریسک',exact:false}).click();assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes('T6'))
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'CSV چرخه',exact:true}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),'Tradersho-Risk-Cycle.csv');await download.saveAs('qa/risk/cycle.csv');const csv=await readFile('qa/risk/cycle.csv','utf8');assert.ok(csv.includes('56.95'));assert.ok(csv.includes('balanced'))
 assert.deepEqual(errors,[]);console.log('PASS risk: 18 viewport/theme renders, reference amounts, stage exploration, ceiling violation, invalid-state removal, local digits, profiles, uncapped capacity, clipboard/CSV, role/session access and axe')
}finally{await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end();await browser.close()}
