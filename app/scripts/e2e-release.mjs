import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright-core'
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:5183'
if(!base.includes(':5183'))throw new Error('Use QA server on 5183 with isolated QA database')
await mkdir(new URL('../qa/',import.meta.url),{recursive:true})
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
const page=await context.newPage(),errors=[]
page.on('pageerror',e=>errors.push(e.message))
const email=`release-${randomUUID().slice(0,8)}@example.test`,password='DemoStrong#2026'
const shot=async name=>page.screenshot({path:new URL(`../qa/release-${name}.png`,import.meta.url).pathname,fullPage:true})
const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2 && [...document.querySelectorAll('main')].every(el=>el.scrollWidth<=el.clientWidth+2)))
const api=async(path,method='GET',data)=>{const r=await context.request.fetch(base+'/api'+path,{method,data});return {status:r.status(),body:await r.json()}}
try{
 assert.equal((await api('/health')).body.database,'ready')
 await page.goto(base+'/panel/tools/chart');await page.waitForURL(/\/auth\?next=/)
 assert.equal(await page.locator('html').getAttribute('data-theme'),'light')
 await shot('login-light')
 await page.getByRole('button',{name:'فعال کردن حالت تیره'}).click()
 await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark')
 await page.getByRole('button',{name:'فعال کردن حالت روشن'}).click()
 await page.getByRole('button',{name:'ثبت‌نام',exact:true}).click()
 await page.getByPlaceholder('name@example.com').fill(email)
 await page.getByPlaceholder('رمز عبور قوی').fill(password)
 await page.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill(password)
 await page.getByRole('button',{name:'ایجاد حساب',exact:true}).click()
 await page.waitForURL(base+'/panel/tools/chart')
 await page.locator('iframe[title="نمودار تحلیل بازار TradingView"]').waitFor({timeout:30000})
 await page.frameLocator('.tv-host iframe').getByText('Gold',{exact:false}).first().waitFor({timeout:30000})
 const frame=page.locator('.tv-host iframe')
 console.log('Official widget iframe:',await frame.getAttribute('src'))
 // Network availability is reported separately from embedding correctness.
 await page.waitForTimeout(7000)
 console.log('Widget frames:',await Promise.all(page.frames().filter(f=>f!==page.mainFrame()).map(async f=>({url:f.url().slice(0,180),text:(await f.locator('body').innerText().catch(()=>'' )).slice(0,700)}))))
 await shot('chart-light')
 await page.getByRole('button',{name:'نمای تمام‌صفحه'}).click()
 assert.equal(await page.locator('.tv-expanded').count(),1)
 await overflow();await shot('chart-fullscreen')
 await page.keyboard.press('Escape');assert.equal(await page.locator('.tv-expanded').count(),0)
 const tools=await api('/tools');assert.equal(tools.body.tools.find(t=>t.id==='chart').status,'active');assert.deepEqual(tools.body.tools.map(t=>t.id),['chart','expert']);assert.equal(tools.body.tools.find(t=>t.id==='expert').status,'coming_soon')
 assert.equal((await api('/tools/calculator/access')).status,404)
 for(const path of ['/tools/expert/access','/candles/datasets','/replay/session'])assert.equal((await api(path)).status,409)
 for(const path of ['/rebates'])assert.equal((await api(path,'POST',{})).status,409)
 assert.equal((await api('/auth/signup','POST',{email,password,confirmPassword:password})).status,409)
 assert.equal((await api('/auth/signup','POST',{email:'weak-'+email,password:'weak',confirmPassword:'weak'})).status,400)
 await page.goto(base+'/panel');await page.getByRole('heading',{name:/خوش آمدید/}).waitFor()
 assert.equal(await page.locator('main a[href^="/panel/tools"]').count(),1)
 assert.ok(!(await page.locator('main').innerText()).includes('میانبر'))
 await shot('dashboard-light')
 await page.getByRole('button',{name:'فعال کردن حالت تیره'}).click();await shot('dashboard-dark');await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark')
 await page.getByRole('button',{name:'فعال کردن حالت روشن'}).click()
 for(const path of ['courses','courses/basics','wallet','rebate','tools/expert']){await page.goto(base+'/panel/'+path);await page.getByRole('heading',{name:/در حال آماده‌سازی است/}).waitFor();assert.ok(!(await page.locator('main').innerText()).includes('دوره'))}
 await page.goto(base+'/panel/account');await page.getByRole('heading',{name:'امنیت حساب'}).waitFor();await shot('account-light')
 const nameField=page.getByLabel('نام و نام خانوادگی');await nameField.fill('کاربر تست');await page.getByRole('button',{name:'ذخیرهٔ تغییرات'}).click();await page.getByRole('status').waitFor()
 for(const width of [360,390,768,1440]){
  await page.setViewportSize({width,height:900})
  for(const path of ['','tools','account','support','support/new','tools/chart']){await page.goto(base+'/panel'+(path?'/'+path:''));await page.locator('main').waitFor();await overflow()}
  if(width===390){await page.frameLocator('.tv-host iframe').getByText('Gold',{exact:false}).first().waitFor({timeout:30000});await page.waitForTimeout(1500);await shot('chart-mobile');await page.getByRole('button',{name:'نمای تمام‌صفحه'}).click();await overflow();await page.waitForTimeout(1500);await shot('chart-mobile-fullscreen');await page.keyboard.press('Escape');await page.goto(base+'/panel');await shot('dashboard-mobile');await page.getByRole('button',{name:'باز کردن منو'}).click();await page.getByRole('navigation',{name:'ناوبری اصلی'}).getByRole('link',{name:/مدرسه فارکس/}).click();await page.getByRole('heading',{name:'مدرسه فارکس',exact:true}).waitFor()}
 }
 await page.goto(base+'/panel/tools/chart')
 await context.route('https://s3.tradingview.com/**',route=>route.abort())
 await page.getByRole('button',{name:'بارگذاری دوباره نمودار'}).click();await page.getByRole('alert').filter({hasText:'اتصال به TradingView برقرار نشد'}).waitFor()
 await context.unroute('https://s3.tradingview.com/**')
 await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await page.locator('.tv-host iframe').waitFor()
 await page.getByRole('button',{name:'خروج از حساب',exact:true}).click();await page.waitForURL(base+'/auth')
 assert.equal((await api('/session')).status,401)
 for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});await overflow();if(width===390)await shot('login-mobile')}
 await page.getByPlaceholder('name@example.com').fill(email);await page.getByPlaceholder('رمز عبور', {exact:true}).fill(password);await page.getByRole('button',{name:'ورود به پنل'}).click();await page.waitForURL(url=>url.pathname.startsWith('/panel'))
 assert.deepEqual(errors,[])
 console.log('PASS: registration/login, strong password, session, dashboard with single tools gateway, theme persistence, official iframe, focus fullscreen/Escape, readiness server controls, navigation, mobile 360/390/768/1440, network failure/retry, profile, logout. No runtime errors.')
}finally{await browser.close()}
