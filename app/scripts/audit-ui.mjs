import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright-core'
import axe from 'axe-core'
const mobile=process.env.MOBILE_AUDIT==='1'
const wide=process.env.WIDE_AUDIT==='1'
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:5183'
if(!base.includes(':5183')||!new URL(process.env.DATABASE_URL||'http://none').pathname.endsWith('_qa'))throw new Error('Use isolated QA server and DATABASE_URL ending _qa')
const {pool}=await import('../server/db.mjs')
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const folder=new URL(mobile?'../qa/mobile/':wide?'../qa/wide/':'../qa/audit/',import.meta.url);await mkdir(folder,{recursive:true})
const failures=[],cases=[],errors=[]
const sizes=wide?[[1280,720],[1440,900],[1920,1080],[2560,1440],[3440,1440],[3840,2160],[5120,1440]]:mobile?[[320,640],[360,740],[375,667],[390,844],[414,896],[430,932],[568,320],[844,390],[768,1024]]:[[320,740],[360,800],[390,844],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080],[640,360]]
const api=async(ctx,path,method='GET',data)=>{const r=await ctx.request.fetch(base+'/api'+path,{method,data});return {status:r.status(),body:await r.json()}}
const capture=async(p,name)=>p.screenshot({path:new URL(name+'.png',folder).pathname,fullPage:false})
async function geometry(p,label,{desktopFit=false}={}){
 await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
 const v=await p.evaluate(()=>({width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight,main:Array.from(document.querySelectorAll('main')).map(el=>({scroll:el.scrollWidth,client:el.clientWidth})),submit:Array.from(document.querySelectorAll('button[type=submit]')).map(el=>({text:el.textContent,bottom:el.getBoundingClientRect().bottom})),clipped:Array.from(document.querySelectorAll('input,textarea,select,button,.auth-card h1')).filter(el=>el.checkVisibility()&&!el.closest('[inert]')).filter(el=>{const r=el.getBoundingClientRect();return r.left<-2||r.right>innerWidth+2}).map(el=>el.outerHTML.slice(0,140))}))
 if(v.docWidth>v.width+2||v.main.some(m=>m.scroll>m.client+2)||v.clipped.length)failures.push({label,type:'overflow',v})
 if(desktopFit&&v.docHeight>v.height+2)failures.push({label,type:'auth-not-fitting',v})
 if(wide){
  const layout=await p.evaluate(()=>{
   const shell=document.querySelector('.app-shell,.auth-wrap,.privacy-page'),r=shell?.getBoundingClientRect(),button=document.querySelector('.logout'),style=button&&getComputedStyle(button),inner=document.querySelector('.main-inner');
   return {shell:r&&{x:r.x,width:r.width,height:r.height},logout:style&&{top:style.paddingTop,bottom:style.paddingBottom,left:style.paddingLeft,right:style.paddingRight},contentWidth:inner?.getBoundingClientRect().width,canvas:document.querySelector('.main-scroll')&&getComputedStyle(document.querySelector('.main-scroll')).backgroundColor}
  })
  if(!layout.shell||Math.abs(layout.shell.x)>1||Math.abs(layout.shell.width-v.width)>2||layout.shell.height<v.height-2||layout.contentWidth>1801||(layout.logout&&(layout.logout.top!==layout.logout.bottom||layout.logout.left!==layout.logout.right)))failures.push({label,type:'wide-layout',layout})
  cases.push({label,type:'wide-layout'})
 }
 if(mobile&&v.width<=600){
  const metrics=await p.evaluate(()=>({
   headings:[...document.querySelectorAll('h1,h2,h3')].filter(e=>e.checkVisibility()).map(e=>({text:e.textContent.slice(0,65),size:parseFloat(getComputedStyle(e).fontSize),tag:e.tagName})),
   inputs:[...document.querySelectorAll('input:not([type=hidden]),textarea,select')].filter(e=>e.checkVisibility()&&!e.closest('[inert]')).map(e=>({size:parseFloat(getComputedStyle(e).fontSize),weight:getComputedStyle(e).fontWeight})),
   targets:[...document.querySelectorAll('.button,.icon-button,.segmented button,.mobile-bottom a,.mobile-bottom button,.user-pill')].filter(e=>e.checkVisibility()&&!e.closest('[inert]')).map(e=>({text:e.textContent||e.getAttribute('aria-label'),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),
   banner:document.querySelector('.home-tools-entry')?.getBoundingClientRect().height
  }))
  if(metrics.headings.some(e=>e.size>24)||metrics.inputs.some(e=>e.size<16||Number(e.weight)>500)||metrics.targets.some(e=>e.w<43.5||e.h<43.5)||(metrics.banner&&metrics.banner>410))failures.push({label,type:'mobile-density-or-touch',metrics})
  cases.push({label,type:'mobile-density',metrics})
 }
 cases.push({label,type:'geometry'})
}
async function access(p,label,context){
 if(!await p.evaluate(()=>!!window.axe))await p.addScriptTag({content:axe.source})
 const results=await p.evaluate(async ({context})=>window.axe.run(context||document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}),{context})
 for(const v of results.violations)failures.push({label,type:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,html:n.html.slice(0,220)}))})
 cases.push({label,type:'axe'})
}
try{
 for(const theme of ['light','dark']){
  const guest=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',...(mobile?{isMobile:true,hasTouch:true}:{})})
  await guest.addInitScript(t=>localStorage.setItem('tradersho-theme',t),theme)
  const p=await guest.newPage();p.on('pageerror',e=>errors.push(e.message))
  await p.goto(base+'/auth');await p.getByRole('tab',{name:'ثبت‌نام',exact:true}).waitFor()
  for(const mode of ['login','signup']){
   await p.getByRole('tab',{name:mode==='login'?'ورود':'ثبت‌نام',exact:true}).click()
   for(const [width,height] of sizes){await p.setViewportSize({width,height});await p.evaluate(()=>document.fonts.ready);await geometry(p,`${theme}-auth-${mode}-${width}x${height}`,{desktopFit:width>=1024&&height>=680});if((wide?[1920,3840]:[390,1280,1440]).includes(width))await capture(p,`${theme}-auth-${mode}-${width}`)}
   await p.setViewportSize({width:1440,height:900});await access(p,`${theme}-auth-${mode}`)
   if(mode==='signup'){await p.getByPlaceholder('رمز عبور قوی').fill('QaSample#2026');await p.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill('QaSample#2026');await access(p,`${theme}-password-met`);await capture(p,`${theme}-password-met`)}
  }
  await p.goto(base+'/privacy');await access(p,`${theme}-privacy`);await geometry(p,`${theme}-privacy`)
  // Inspect the tab interaction model with the keyboard, no real submission.
  await p.goto(base+'/auth');await p.getByRole('tab',{name:'ورود',exact:true}).focus();await p.keyboard.press('ArrowLeft');assert.equal(await p.getByRole('tab',{name:'ثبت‌نام',exact:true}).getAttribute('aria-selected'),'true')
  await guest.close()
  const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',...(mobile?{isMobile:true,hasTouch:true}:{})});await ctx.addInitScript(t=>localStorage.setItem('tradersho-theme',t),theme)
  const signup=await api(ctx,'/auth/signup','POST',{email:`ui-${theme}-${randomUUID().slice(0,8)}@example.test`,password:'UiAudit#2026',confirmPassword:'UiAudit#2026'})
  assert.equal(signup.status,201,JSON.stringify(signup.body));await pool.query('INSERT INTO support_agents(user_id) VALUES($1)',[signup.body.user.id])
  const ticket=await api(ctx,'/tickets','POST',{subject:'بررسی نمایش درخواست پشتیبانی',message:'این پیام برای بررسی چیدمان و خوانایی است.\nمتن طولانی بدون فاصله: '+'x'.repeat(120),category:'technical',priority:'normal',requestId:randomUUID()})
  assert.equal(ticket.status,201)
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message))
  const routes=['/panel','/panel/tools','/panel/tools/chart','/panel/tools/expert','/panel/tools/unknown','/panel/courses','/panel/wallet','/panel/rebate','/panel/account','/panel/support','/panel/support/new','/panel/support/'+ticket.body.id,'/admin/support','/admin/support/'+ticket.body.id]
  for(const route of routes){
   await page.setViewportSize({width:1440,height:900});await page.goto(base+route);await page.locator('main').waitFor();await page.evaluate(()=>document.fonts.ready)
   if(route.includes('/chart'))await page.locator('.tv-host iframe').waitFor({timeout:30000})
   if(route.includes('/support')&&!route.endsWith('/new'))await page.locator('.ticket-list,.conversation').waitFor()
   for(const [width,height] of sizes.filter(([w])=>mobile||wide||[320,390,768,1024,1440].includes(w))){await page.setViewportSize({width,height});await geometry(page,`${theme}-${route}-${width}`)}
   for(const width of (wide?[1920,3840]:[390,1440])){await page.setViewportSize({width,height:900});await access(page,`${theme}-${route}-${width}`);if(mobile||wide||['/panel','/panel/tools','/panel/account','/panel/support/new','/admin/support'].includes(route))await capture(page,`${theme}-${route.replaceAll('/','-')}-${width}`)}
  }
  if(mobile){
   for(const route of ['/panel/support/new','/panel/account','/panel/support/'+ticket.body.id,'/admin/support/'+ticket.body.id]){
    await page.setViewportSize({width:375,height:667});await page.goto(base+route);const submit=page.locator('main button[type=submit],main form button.primary').last();await submit.waitFor();await submit.scrollIntoViewIfNeeded();
    assert.ok(await submit.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&e.contains(hit)}),'Submit obscured by navigation: '+route)
    cases.push({label:theme+'-'+route,type:'mobile-submit-reachable'})
   }
   await page.goto(base+'/panel/tools/chart');const expand=page.getByRole('button',{name:'نمای تمام‌صفحه',exact:true});await expand.waitFor();await expand.tap();const dialog=page.getByRole('dialog',{name:'محیط تحلیل بازار'});await dialog.waitFor();await geometry(page,theme+'-mobile-chart-expanded');assert.ok(await dialog.evaluate(e=>Math.abs(e.getBoundingClientRect().height-innerHeight)<2));await page.getByRole('button',{name:'بازگشت به پنل',exact:true}).tap();await dialog.waitFor({state:'hidden'});cases.push({label:theme,type:'mobile-chart-expand-collapse'})
  }
  // Known regression classes in normal and hovered states.
  await page.setViewportSize({width:1440,height:900})
  for(const route of ['/panel/tools','/panel/tools/expert','/panel/account']){
   await page.goto(base+route);await page.locator('main').waitFor();await page.locator('.lab-loading').waitFor({state:'hidden'}).catch(()=>{})
   for(const selector of ['.breadcrumb a','.back-link','.logout','.nav-link:not(.active)','.button.secondary','.tool-card','.segmented button:not(.active)']){
    const el=page.locator(selector).first();if(await el.isVisible()){await el.hover();await access(page,`${theme}-${route}-hover-${selector}`,selector)}
   }
  }
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/panel')
  assert.equal(await page.locator('.sidebar').getAttribute('inert'),'')
  await page.getByRole('button',{name:'باز کردن منو',exact:true}).click();await page.getByRole('dialog',{name:'فهرست پنل'}).waitFor();await access(page,`${theme}-mobile-navigation`)
  for(let n=0;n<15;n++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement?.closest('.sidebar')))}
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'باز کردن منو',exact:true}).evaluate(el=>el===document.activeElement),true)
  await ctx.close();console.log(`Completed ${theme}: auth, all customer/admin pages, hover, mobile navigation`)
 }
 if(wide){
  const motionContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});const motionPage=await motionContext.newPage();await motionPage.goto(base+'/auth');const pause=motionPage.getByRole('button',{name:'توقف حرکت پس‌زمینه',exact:true});await pause.waitFor();assert.notEqual(await motionPage.locator('.auth-visual').evaluate(e=>getComputedStyle(e,'::before').animationName),'none');await pause.click();assert.equal(await motionPage.locator('.auth-visual').evaluate(e=>getComputedStyle(e,'::before').animationPlayState),'paused');await motionPage.emulateMedia({reducedMotion:'reduce'});assert.equal(await motionPage.locator('.auth-visual').evaluate(e=>getComputedStyle(e,'::before').animationName),'none');assert.equal(await motionPage.locator('.auth-motion-toggle').isVisible(),false);cases.push({type:'motion-pause-reduced-preference'});await motionContext.close()
 }
 await writeFile(new URL('report.json',folder),JSON.stringify({cases:cases.length,failures,errors},null,2))
 console.log(JSON.stringify({cases:cases.length,failures:failures.length,errors,details:failures.map(f=>({label:f.label,type:f.type,nodes:f.nodes?.map(n=>n.target),v:f.v,metrics:f.metrics}))}))
 assert.equal(failures.length,0,'UI audit failures: see qa/mobile/report.json or qa/audit/report.json');assert.deepEqual(errors,[])
}finally{await browser.close();await pool.end()}
