import assert from 'node:assert/strict'
import {mkdir,readFile} from 'node:fs/promises'
import {chromium} from 'playwright-core'
const base=process.env.BASE_URL||'http://127.0.0.1:5183'
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
 const axe=await readFile('node_modules/axe-core/axe.min.js','utf8')
 page.on('pageerror',e=>errors.push(e.message))
 await context.route(base+'/api/**',r=>{
  const path=new URL(r.request().url()).pathname
  if(path==='/api/session')return r.fulfill({json:{user:{id:'calendar-layout-browser-only',name:'آزمون چیدمان',email:null,hasPassword:false,isAdmin:false,isSupportAgent:false,plan:'free',progress:{}}}})
  if(path==='/api/calendar')return r.fulfill({json:{configured:true,serverNow:new Date().toISOString(),events:[],total:0,updatedAt:new Date().toISOString()}})
  if(path==='/api/tools')return r.fulfill({json:{tools:[{id:'chart',status:'active'}]}})
  return r.fulfill({json:{}})
 })
 await mkdir('qa/calendar-layout',{recursive:true})
 for(const width of [390,768,901,1024,1280,1440,1920,2560,5120])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000})
  await page.goto(base+'/panel/tools/calendar')
  await page.locator('.calendar-native').waitFor()
  await page.evaluate(async t=>{document.documentElement.dataset.theme=t;await document.fonts.ready},theme)
  const filters=page.locator('.calendar-filter-panel'),picker=page.locator('.calendar-native .currency-picker')
  if(!await filters.evaluate(n=>n.open))await filters.locator(':scope>summary').click()
  if(!await picker.evaluate(n=>n.open))await picker.locator(':scope>summary').click()
  const choices=picker.locator('.currency-choices'),more=picker.getByRole('button',{name:'بیشتر',exact:true})
  assert.equal(await choices.locator('label:visible').count(),8)
  const boxes=await choices.locator('label:visible,button.currency-more').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,scroll:n.scrollWidth,client:n.clientWidth}}))
  assert.equal(boxes.length,9)
  if(width>=901){
   for(const b of boxes){assert.ok(Math.abs(b.y-boxes[0].y)<1,'Eight currencies and More share a row');assert.ok(Math.abs(b.width-boxes[0].width)<1&&Math.abs(b.height-boxes[0].height)<1,'More has the same size as currencies')}
   assert.ok(boxes[8].right<=boxes[7].x,'More is the final RTL cell')
  }
  for(const b of boxes)assert.ok(b.scroll<=b.client+1,`Currency content overflow at ${width}: ${JSON.stringify(b)}`)
  if(width>1200){
   const search=await page.locator('.calendar-search-control').boundingBox(),from=await page.locator('input[aria-label="از تاریخ میلادی"]').boundingBox(),to=await page.locator('input[aria-label="تا تاریخ میلادی"]').boundingBox(),impact=await page.locator('.calendar-filters>.impact-filter').boundingBox()
   assert.ok(impact.x+impact.width<=to.x&&to.x+to.width<=from.x&&from.x+from.width<=search.x,'Importance is left, date range center, search right')
  }
  await more.click();assert.equal(await choices.locator('label:visible').count(),19)
  await picker.getByRole('checkbox',{name:'CNY',exact:true}).check()
  await picker.getByRole('button',{name:'کمتر',exact:true}).click()
  assert.equal(await choices.locator('label:visible').count(),9,'Selected extra currency remains visible')
  await picker.getByRole('checkbox',{name:'CNY',exact:true}).uncheck()
  assert.equal(await choices.locator('label:visible').count(),8)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No root horizontal overflow')
  await page.evaluate(axe)
  assert.deepEqual(await page.evaluate(async()=>(await window.axe.run(document.querySelector('.calendar-filter-panel'))).violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[])
  if([390,1440,2560].includes(width))await page.screenshot({path:`qa/calendar-layout/${width}-${theme}.png`})
  console.log('PASS calendar filter layout, expansion, selection and accessibility',width,theme)
 }
 assert.deepEqual(errors,[])
}finally{await browser.close()}
