import assert from 'node:assert/strict'
import {randomUUID,createHmac} from 'node:crypto'
import {chromium} from 'playwright-core'
import {readFile,mkdir} from 'node:fs/promises'
import {articleId} from '../server/news-data.mjs'
if(!process.env.DATABASE_URL?.endsWith('_qa')||!process.env.NEWS_INGEST_TOKEN)throw Error('Explicit QA database and ingest token required')
const {pool}=await import('../server/db.mjs'),base='http://127.0.0.1:5183',marker=randomUUID(),email=`news-${marker}@example.test`,password='NewsQa#2026'
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),ctx=await browser.newContext({reducedMotion:'reduce'}),page=await ctx.newPage(),axe=await readFile('node_modules/axe-core/axe.min.js','utf8')
const req=async(path,method='GET',data,token)=>{const r=await ctx.request.fetch(base+'/api'+path,{method,data,headers:token?{Authorization:'Bearer '+token}:{}});return {status:r.status(),body:await r.json()}}
let user;const items=Array.from({length:23},(_,n)=>({provider:'gdelt',url:`https://news.example.org/${marker}/${n}`,originalTitle:`QA ${marker} ${n}`,titleFa:n===0?'آزمون خبر طلا <script>window.bad=true</script>':'آزمون خبر اقتصادی '+n,category:n===0?'gold':'macro',translation:'native',publishedAt:new Date(Date.now()-n*60000).toISOString(),detectedAt:new Date().toISOString()}))
try{
 await mkdir('qa/market',{recursive:true})
 assert.equal((await req('/news')).status,401)
 assert.equal((await req('/integrations/news/state')).status,401)
 const cap=(await req('/auth/captcha')).body
 if(cap.enabled)await pool.query('UPDATE login_captcha SET answer_hash=$1 WHERE id=$2',[createHmac('sha256',process.env.CAPTCHA_SECRET).update(cap.id+':12345').digest('hex'),cap.id])
 const account=await req('/auth/signup','POST',{email,password,confirmPassword:password,...(cap.enabled?{captchaId:cap.id,captchaAnswer:'12345'}:{})});assert.equal(account.status,201);user=account.body.user
 assert.equal((await req('/integrations/news/state')).status,401)
 const payload={generatedAt:new Date().toISOString(),items,sources:['gdelt','fed','bls'].map(provider=>({provider,status:provider==='gdelt'?'ok':'error',error:'blocked'}))}
 assert.equal((await req('/integrations/news','POST',payload,'wrong')).status,401)
 assert.equal((await req('/integrations/news','POST',payload,process.env.NEWS_INGEST_TOKEN)).status,200)
 assert.equal((await req('/integrations/news','POST',payload,process.env.NEWS_INGEST_TOKEN)).status,200)
 assert.equal((await req('/news?q='+marker)).body.total,23)
 assert.equal((await req('/news?category=gold&q=آزمون')).body.total,1)
 assert.equal((await req('/news?q=%25')).body.total,0)
 assert.equal((await req('/news?category=bad')).status,400)
 assert.equal((await req('/news?page=2&q='+marker)).body.items.length,3)
 const invalid={...payload,items:[{...items[0],url:'javascript:alert(1)'}]};assert.equal((await req('/integrations/news','POST',invalid,process.env.NEWS_INGEST_TOKEN)).status,400)
 const failed={generatedAt:new Date().toISOString(),items:[],sources:['gdelt','fed','bls'].map(provider=>({provider,status:'error',error:'timeout'}))};await req('/integrations/news','POST',failed,process.env.NEWS_INGEST_TOKEN);assert.equal((await req('/news?q='+marker)).body.total,23)
 await ctx.route('https://www.cashbackforex.com/fa/widgets/economic-calendar?**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<html lang="fa" dir="rtl"><h1>تقویم نمونهٔ QA</h1><p>رویداد · واقعی · پیش‌بینی · قبلی</p><script>parent.postMessage({type:"resize",data:{targetHeight:800}},"'+base+'")</script></html>'}))
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/panel/market');await page.getByRole('link',{name:/آزمون خبر طلا/,exact:false}).first().waitFor();await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.evaluate(()=>window.bad),undefined)
  await page.addScriptTag({content:axe});assert.deepEqual(await page.evaluate(async()=>(await window.axe.run()).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[])
  if([390,1440].includes(width))await page.screenshot({path:`qa/market/news-${width}-${theme}.png`,fullPage:true})
  await page.getByLabel('موضوع خبر').selectOption('gold');await page.waitForFunction(()=>document.querySelectorAll('.news-card').length===1)
  await page.getByRole('link',{name:'تقویم اقتصادی',exact:true}).click();await page.frameLocator('iframe[title="تقویم اقتصادی فارسی CashbackForex"]').getByText('تقویم نمونهٔ QA').waitFor();await page.getByText('در حال دریافت تقویم اقتصادی…').waitFor({state:'hidden'})
  const src=await page.locator('.calendar-frame').getAttribute('src');assert.ok(src.includes('/fa/widgets/economic-calendar'));assert.ok(src.includes('DefaultTheme='));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 }
 console.log('PASS news: ingest authorization, authenticated read, validation, dedupe, literal search, category/pagination, preserve cache on upstream failure, XSS rendering, mobile/desktop both themes, iframe ready/origin handshake and axe.')
}finally{await pool.query('DELETE FROM market_news WHERE id=ANY($1::text[])',[items.map(v=>articleId(v.url,v.publishedAt))]);if(user)await pool.query('DELETE FROM users WHERE id=$1',[user.id]);await pool.end();await browser.close()}
