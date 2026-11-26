import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {chromium} from 'playwright-core'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs')
const {tokenHash}=await import('../server/auth.mjs')
const base=process.env.QA_BASE||'http://127.0.0.1:5183'
if(!/^http:\/\/127\.0\.0\.1:518[34]$/.test(base))throw Error('Local test server required')
const id=randomUUID(),target=randomUUID(),token=randomBytes(32).toString('hex'),email=target+'@example.test'
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{
 for(const [userId,name,address] of [[id,'مدیر آزمایشی',id+'@example.test'],[target,'کاربر آزمایشی',email]])
   await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[userId,name,address,'social-only'])
 await pool.query('INSERT INTO user_admins(user_id) VALUES($1)',[id])
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at,mfa_at) VALUES($1,$2,now()+interval '1 hour',now())",[tokenHash(token),id])
 await pool.query("INSERT INTO staff_mfa(user_id,secret) VALUES($1,'qa-enrolled')",[id])
 for(const width of [1440,390])for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'})
   await context.addCookies([{name:'tradersho_session',value:token,url:base,httpOnly:true,sameSite:'Strict'}])
   await context.addInitScript(value=>localStorage.setItem('tradersho-theme',value),theme)
   const page=await context.newPage()
   await page.goto(base+'/admin/users')
   await page.getByRole('heading',{name:'مدیریت کاربران',exact:true}).waitFor()
   await page.getByPlaceholder('نام یا ایمیل').fill(email)
   await page.getByRole('button',{name:'جستجو',exact:true}).click()
   const row=page.locator('tbody tr').filter({hasText:email})
   await row.getByRole('button',{name:'مدیریت',exact:true}).click()
   await page.getByRole('heading',{name:'جزئیات کاربر'}).waitFor()
   await page.getByLabel('نام و نام خانوادگی',{exact:true}).fill('نام ویرایش‌شده')
   await page.getByRole('button',{name:'ذخیرهٔ تغییرات',exact:true}).click()
   await page.getByText('تغییرات ذخیره شد.',{exact:true}).waitFor()
   assert.equal((await pool.query('SELECT name FROM users WHERE id=$1',[target])).rows[0].name,'نام ویرایش‌شده')
   const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
   assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry))
   const checkbox=await page.getByLabel('مدیریت کاربران',{exact:true}).boundingBox()
   assert.ok(checkbox.width<=22&&checkbox.height<=22,JSON.stringify(checkbox))
   await page.locator('.main-scroll').evaluate(el=>{el.scrollTop=0})
   await page.screenshot({path:join(tmpdir(),'admin-users-'+width+'-'+theme+'.png'),fullPage:true})
   await context.close()
   console.log('PASS admin UI',width,theme)
 }
 const context=await browser.newContext()
 const page=await context.newPage()
 await page.route('**/api/auth/social/providers',route=>route.fulfill({json:{providers:['telegram'],linked:[]}}))
 await page.goto(base+'/auth')
 const button=page.getByRole('link',{name:'ورود با تلگرام',exact:true})
 await button.waitFor()
 assert.equal(await button.locator('svg').count(),1)
 assert.ok((await button.boundingBox()).height>=44)
 await page.screenshot({path:join(tmpdir(),'telegram-button-new.png'),fullPage:true})
 await context.close()
}finally{
 await browser.close()
 await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[[id,target]])
 await pool.query('DELETE FROM admin_user_audit WHERE subject_id=ANY($1::text[])',[[id,target]])
 await pool.end()
}
