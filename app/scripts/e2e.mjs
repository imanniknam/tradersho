import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const email = 'e2e-' + randomUUID().slice(0, 8) + '@example.test'
const password = 'E2eStrong#2026'
const screenshots = new URL('../qa/', import.meta.url)
await mkdir(screenshots, { recursive: true })
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
const errors = []
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))

async function api(path, options = {}) {
  const response = await context.request.fetch(base + '/api' + path, options)
  const data = await response.json()
  return { response, data }
}
async function noOverflow(label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth, main: document.querySelector('main')?.scrollWidth, mainWidth: document.querySelector('main')?.clientWidth }))
  assert.ok(dimensions.page <= dimensions.width + 2, label + ' has horizontal overflow: ' + JSON.stringify(dimensions))
  if (dimensions.main && dimensions.mainWidth) assert.ok(dimensions.main <= dimensions.mainWidth + 2, label + ' main overflow: ' + JSON.stringify(dimensions))
}

try {
  const health = await api('/health')
  assert.equal(health.response.status(), 200)
  assert.equal(health.data.database, 'ready')

  await page.goto(base + '/panel/tools/calculator')
  await page.waitForURL(/\/auth\?next=/)
  await page.getByRole('button', { name: 'ثبت‌نام' }).click()
  await page.getByPlaceholder('name@example.com').fill(email)
  await page.getByPlaceholder('رمز عبور قوی').fill(password)
  await page.getByPlaceholder('رمز عبور را دوباره وارد کنید').fill(password)
  await page.getByRole('button', { name: 'ایجاد حساب' }).click()
  await page.waitForURL(base + '/panel/tools/calculator')
  await page.getByText('0.50 lot').waitFor()
  await noOverflow('calculator desktop')
  await page.screenshot({ path: new URL('e2e-desktop.png', screenshots).pathname, fullPage: true })

  const duplicate = await api('/auth/signup', { method: 'POST', data: { email, password, confirmPassword: password } })
  assert.equal(duplicate.response.status(), 409)
  const mismatch = await api('/auth/signup', { method: 'POST', data: { name: 'کاربر تست', email: 'mismatch-' + randomUUID() + '@example.test', password, confirmPassword: 'different' } })
  assert.equal(mismatch.response.status(), 400)
  const weak = await api('/auth/signup', { method: 'POST', data: { name: 'کاربر تست', email: 'weak-' + randomUUID() + '@example.test', password: 'alllowercase', confirmPassword: 'alllowercase' } })
  assert.equal(weak.response.status(), 400)
  const session = await api('/session')
  assert.equal(session.data.user.email, email)
  assert.equal(session.data.user.plan, 'free')
  const free = await api('/tools/calculator/access')
  const premium = await api('/tools/journal/access')
  assert.equal(free.response.status(), 200)
  assert.equal(premium.response.status(), 409)

  await page.goto(base + '/panel/courses/basics')
  await page.getByRole('heading', { name: 'محتوای این دوره در حال آماده‌سازی است' }).waitFor()
  assert.equal((await api('/courses/basics/advance', { method: 'POST' })).response.status(), 409)
  assert.equal((await api('/plan-interest', { method: 'POST', data: { plan: 'pro' } })).response.status(), 409)
  await page.goto(base + '/panel/subscription')
  await page.waitForURL(base + '/panel')
  assert.equal(await page.locator('a[href="/panel/subscription"]').count(), 0)
  assert.equal(await page.locator('.revised-hero').count(), 1)
  await page.screenshot({ path: new URL('dashboard-revised-desktop.png', screenshots).pathname, fullPage: true })

  // Replay commands are authoritative, owned, versioned and expose only a prefix.
  assert.equal((await api('/replay/session')).data.session, null)
  const market = (await api('/market/catalog')).data.dataset
  assert.equal(market.points, undefined)
  assert.equal(market.totalPoints, 255)
  assert.equal((await api('/replay/session', { method: 'POST', data: { startDate: '2025-01-01' } })).response.status(), 400)
  const created = await api('/replay/session', { method: 'POST', data: {} })
  assert.equal(created.response.status(), 201)
  const replayId = created.data.session.id
  assert.equal(created.data.session.points.length, 20)
  assert.ok(created.data.session.points.every(p => p.date <= created.data.session.currentDate))
  const requestId = randomUUID()
  const firstAdvance = await api(`/replay/session/${replayId}/advance`, { method: 'POST', data: { version: 0, requestId, cursor: 254, steps: 999 } })
  assert.equal(firstAdvance.data.session.cursor, 20)
  const retried = await api(`/replay/session/${replayId}/advance`, { method: 'POST', data: { version: 0, requestId } })
  assert.equal(retried.data.session.cursor, 20)
  const concurrent = await Promise.all([1,2].map(() => api(`/replay/session/${replayId}/advance`, { method: 'POST', data: { version: 1, requestId: randomUUID() } })))
  assert.deepEqual(concurrent.map(r => r.response.status()).sort(), [200,409])
  const currentReplay = (await api(`/replay/session/${replayId}`)).data.session
  assert.equal(currentReplay.cursor, 21)
  assert.equal(currentReplay.points.length, 22)
  assert.equal(currentReplay.points.at(-1).date, currentReplay.currentDate)
  assert.equal((await api(`/replay/session/${replayId}/advance`, { method: 'POST', data: { version: -1, requestId: randomUUID() } })).response.status(), 400)

  await page.goto(base + '/panel/tools/chart?view=reference')
  await page.getByTestId('replay-date').filter({ hasText: currentReplay.currentDate }).waitFor()
  await page.getByLabel('روز بعد', { exact: true }).click()
  await page.waitForFunction(date => document.querySelector('[data-testid="replay-date"]')?.textContent !== date, currentReplay.currentDate)
  const savedDate = await page.getByTestId('replay-date').innerText()
  await page.reload()
  await page.getByTestId('replay-date').filter({ hasText: savedDate }).waitFor()
  await page.getByLabel('EMA 20', { exact: true }).check()
  await page.getByLabel('پخش خودکار', { exact: true }).click()
  await page.waitForFunction(date => document.querySelector('[data-testid="replay-date"]')?.textContent !== date, savedDate)
  await page.getByLabel('توقف پخش', { exact: true }).click()
  // Let an already submitted single step finish; paused playback must stay put.
  await page.waitForTimeout(350)
  const pausedVersion = (await api(`/replay/session/${replayId}`)).data.session.version
  await page.waitForTimeout(1300)
  assert.equal((await api(`/replay/session/${replayId}`)).data.session.version, pausedVersion)
  await page.getByLabel('سرمایهٔ اولیهٔ تمرین جدید (دلار)', { exact: true }).fill('5000')
  await page.getByLabel('شروع از تاریخ', { exact: true }).fill('2025-06-02')
  await page.getByRole('button', { name: 'تمرین جدید از این تاریخ' }).click()
  await page.getByTestId('replay-date').filter({hasText:'2025-06-02'}).waitFor()
  await page.getByTestId('sim-balance').filter({hasText:'$5,000.00'}).waitFor()
  const practiceId = (await api('/replay/session')).data.session.id
  for (const name of ['خط افقی','خط عمودی','خط روند','پرتو','مستطیل','فیبوناچی','اندازه‌گیری']) {
    const before=(await api(`/replay/session/${practiceId}`)).data.session.drawings.length
    await page.getByRole('button',{name,exact:true}).click()
    await page.locator('.analysis-canvas').click({position:{x:140+before*8,y:110+before*3}})
    if (!['خط افقی','خط عمودی'].includes(name)) {
      await page.locator('.drawing-hint').filter({hasText:'نقطهٔ دوم'}).waitFor()
      await page.locator('.analysis-canvas').click({position:{x:290,y:160}})
    }
    try { await page.locator(`svg[aria-label="${before+1} ترسیم ذخیره‌شده"]`).waitFor({timeout:6000}) } catch (error) { console.log('drawing failure',name,await page.locator('.drawing-hint').innerText(), await page.locator('[role="alert"]').allTextContents(),(await api(`/replay/session/${practiceId}`)).data.session.drawings);throw error }
  }
  await page.getByRole('button',{name:'نشانگر',exact:true}).click()
  const drawingState=(await api(`/replay/session/${practiceId}`)).data.session
  assert.equal(drawingState.drawings.length,7)
  const futureDrawing={id:randomUUID(),type:'horizontal',anchors:[{date:market.lastDate,value:1.1}]}
  assert.equal((await api(`/replay/session/${practiceId}/drawings`,{method:'PUT',data:{drawingVersion:drawingState.drawingVersion,drawings:[futureDrawing]}})).response.status(),400)
  assert.equal((await api(`/replay/session/${practiceId}/drawings`,{method:'PUT',data:{drawingVersion:0,drawings:[]}})).response.status(),409)
  await page.reload()
  await page.locator('svg[aria-label="7 ترسیم ذخیره‌شده"]').waitFor()
  for(const label of ['EMA 20','SMA 20','Bollinger 20,2','RSI 14','MACD 12,26,9'])await page.getByLabel(label,{exact:true}).check()
  assert.equal(await page.locator('.analysis-chart-host').evaluate(el=>el.clientHeight),600)

  await page.getByLabel('مقدار معامله (یورو)',{exact:true}).fill('1000')
  await page.getByRole('button',{name:'ثبت خرید فرضی',exact:true}).click()
  await page.getByRole('heading',{name:'در انتظار روز بعد'}).waitFor()
  assert.equal((await api(`/replay/session/${practiceId}`)).data.session.simulation.positions.length,0)
  await page.getByLabel('روز بعد',{exact:true}).click()
  await page.getByRole('button',{name:'بستن موقعیت',exact:true}).waitFor()
  const filled=(await api(`/replay/session/${practiceId}`)).data.session
  assert.equal(filled.simulation.balance,'5000.00')
  assert.equal(filled.simulation.positions.length,1)
  assert.notEqual(filled.simulation.positions[0].openedDate,'2025-06-02')
  const entryPrice=filled.simulation.positions[0].entryPrice
  await page.getByLabel('روز بعد',{exact:true}).click()
  await page.waitForFunction(date=>document.querySelector('[data-testid="replay-date"]')?.textContent!==date,filled.currentDate)
  await page.getByRole('button',{name:'بستن موقعیت',exact:true}).click()
  await page.getByRole('button',{name:'در انتظار بسته‌شدن',exact:true}).waitFor()
  await page.getByLabel('روز بعد',{exact:true}).click()
  await page.getByText('موقعیت بازی ندارید. سفارش تازه پس از رفتن به روز بعد اجرا می‌شود.',{exact:true}).waitFor()
  const closed=(await api(`/replay/session/${practiceId}`)).data.session
  assert.equal(closed.simulation.positions.length,0)
  assert.equal(closed.simulation.trades.length,1)
  const expectedProfit=Math.round((closed.points.at(-1).value-entryPrice)*1000*100)/100
  assert.equal(Number(closed.simulation.balance),5000+expectedProfit)
  await page.reload()
  await page.getByTestId('sim-balance').filter({hasText:new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(5000+expectedProfit)}).waitFor()
  assert.equal((await api(`/replay/session/${practiceId}`)).data.session.simulation.trades.length,1)
  await page.getByRole('button',{name:'فروش',exact:true}).click()
  await page.getByRole('button',{name:'ثبت فروش فرضی',exact:true}).click()
  await page.getByRole('button',{name:'لغو سفارش',exact:true}).click()
  await page.getByRole('heading',{name:'در انتظار روز بعد'}).waitFor({state:'hidden'})
  assert.equal((await api(`/replay/session/${practiceId}`)).data.session.simulation.orders[0].status,'cancelled')
  for(const label of ['EMA 20','SMA 20','Bollinger 20,2','RSI 14','MACD 12,26,9'])await page.getByLabel(label,{exact:true}).check()
  for (const width of [1440,768,390,360]) {
    await page.setViewportSize({ width, height: width > 900 ? 1000 : 844 })
    await noOverflow('reference replay ' + width)
    await page.screenshot({ path: new URL(`replay-${width}.png`, screenshots).pathname, fullPage: true })
  }
  await page.setViewportSize({ width:1440,height:1000 })
  await page.locator('.backtest-panel').scrollIntoViewIfNeeded()
  await page.screenshot({path:new URL('backtest-desktop.png',screenshots).pathname})
  await page.setViewportSize({width:390,height:844})
  await page.getByTestId('sim-balance').scrollIntoViewIfNeeded()
  await noOverflow('paper account mobile')
  await page.screenshot({path:new URL('backtest-mobile.png',screenshots).pathname})
  await page.setViewportSize({width:1440,height:900})
  await page.goto(base + '/panel/support')
  await page.getByPlaceholder('مثلاً راهنمایی دربارهٔ ابزارها').fill('آزمون پشتیبانی')
  await page.getByPlaceholder('موضوع را با جزئیات کافی توضیح دهید...').fill('این پیام برای بررسی ذخیره‌سازی درخواست پشتیبانی است.')
  await page.getByRole('button', { name: /ثبت درخواست/ }).click()
  await page.getByText('آزمون پشتیبانی').waitFor()
  await page.reload()
  await page.getByText('آزمون پشتیبانی').waitFor()

  await page.goto(base + '/panel/rebate')
  await page.getByPlaceholder('نام بروکر').fill('بروکر آزمایشی')
  await page.getByPlaceholder('شمارهٔ حساب').fill('12345678')
  await page.getByRole('button', { name: /ثبت درخواست بررسی/ }).click()
  await page.getByText('بروکر آزمایشی').waitFor()
  const rebates = await api('/rebates')
  assert.equal(rebates.data.requests.length, 1)

  await page.goto(base + '/panel/wallet')
  await page.getByRole('heading', { name: 'کیف پول' }).waitFor()
  await page.waitForFunction(() => /[۰0]/.test(document.querySelector('.wallet-balance strong')?.textContent || ''))
  assert.match((await page.locator('.wallet-balance strong').textContent()) || '', /[۰0]/)
  const wallet = await api('/wallet')
  assert.equal(wallet.data.balance, '0')
  assert.deepEqual(wallet.data.transactions, [])

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(base + '/panel/tools/journal')
  await page.getByRole('heading', { name: 'ژورنال معاملاتی در حال آماده‌سازی است' }).waitFor()
  await noOverflow('premium tool mobile')
  await page.screenshot({ path: new URL('e2e-mobile.png', screenshots).pathname, fullPage: true })
  await page.getByRole('navigation', { name: 'جابه‌جایی ابزارها' }).getByRole('link', { name: /ماشین‌حساب ریسک/ }).click()
  await page.waitForURL(base + '/panel/tools/calculator')
  await noOverflow('calculator mobile')
  await page.getByRole('button', { name: 'بازگشت به صفحهٔ قبل' }).click()
  await page.waitForURL(base + '/panel/tools/journal')

  await api('/auth/logout', { method: 'POST' })
  assert.equal((await api('/session')).response.status(), 401)
  await page.goto(base + '/auth')
  await noOverflow('auth mobile')
  await page.getByRole('button', { name: 'ثبت‌نام' }).click()
  await noOverflow('signup mobile')
  await page.screenshot({ path: new URL('e2e-signup-mobile.png', screenshots).pathname, fullPage: true })
  await page.getByRole('button', { name: 'ورود' }).click()
  await page.getByPlaceholder('name@example.com').fill(email)
  await page.getByPlaceholder('رمز عبور').fill(password)
  await page.getByRole('button', { name: 'ورود به پنل' }).click()
  await page.waitForURL(base + '/panel')
  assert.equal((await api('/session')).data.user.progress.basics || 0, 0)

  await page.goto(base + '/panel/account')
  await page.getByLabel('رمز عبور فعلی').fill(password)
  await page.getByLabel('رمز عبور جدید', { exact: true }).fill('ChangedStrong#2026')
  await page.getByLabel('تکرار رمز عبور جدید').fill('ChangedStrong#2026')
  await page.getByRole('button', { name: 'تغییر رمز عبور' }).click()
  await page.getByText('رمز عبور تغییر کرد و نشست‌های دیگر خارج شدند.').waitFor()
  await api('/auth/logout', { method: 'POST' })
  const oldPassword = await api('/auth/login', { method: 'POST', data: { email, password } })
  assert.equal(oldPassword.response.status(), 401)
  const newPassword = await api('/auth/login', { method: 'POST', data: { email, password: 'ChangedStrong#2026' } })
  assert.equal(newPassword.response.status(), 200)

  const second = await browser.newContext()
  const secondSignup = await second.request.post(base + '/api/auth/signup', { data: { name: 'کاربر دوم', email: 'second-' + randomUUID().slice(0, 8) + '@example.test', password, confirmPassword: password } })
  assert.equal(secondSignup.status(), 201)
  const secondTickets = await second.request.get(base + '/api/tickets')
  assert.deepEqual((await secondTickets.json()).tickets, [])
  assert.equal((await second.request.get(base + `/api/replay/session/${replayId}`)).status(), 404)
  assert.equal((await second.request.post(base + `/api/replay/session/${replayId}/advance`, { data: { version: 0, requestId: randomUUID() } })).status(), 404)
  assert.equal((await second.request.get(base + '/api/replay/session').then(r => r.json())).session, null)
  const ending = await api('/replay/session', { method: 'POST', data: { startDate: market.startDates.at(-1) } })
  const endId = ending.data.session.id
  const endStep = await api(`/replay/session/${endId}/advance`, { method: 'POST', data: { version: 0, requestId: randomUUID() } })
  assert.equal(endStep.data.session.hasNext, false)
  const afterEnd = await api(`/replay/session/${endId}/advance`, { method: 'POST', data: { version: endStep.data.session.version, requestId: randomUUID() } })
  assert.equal(afterEnd.data.session.cursor, market.totalPoints - 1)
  assert.equal((await second.request.post(base + `/api/replay/session/${practiceId}/simulation`, { data:{version:0,action:'open',side:'buy',units:1,requestId:randomUUID()} })).status(),404)
  await second.close()
  assert.equal((await api('/account/sessions', { method: 'DELETE' })).response.status(), 200)
  assert.equal((await api('/session')).response.status(), 401)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ ok: true, scenarios: ['signup', 'confirm password', 'weak password rejection', 'duplicate email', 'login/logout', 'password change', 'logout all sessions', 'session', 'unpublished course blocked', 'subscription removed', 'replay prefix', 'replay idempotency', 'concurrent replay', 'replay resume', 'seven drawing tools', 'drawing persistence', 'future drawing rejection', 'five indicators', 'paper account capital', 'next-day fill', 'profit settlement', 'order cancellation', 'autoplay/pause', 'end boundary', 'support persistence', 'rebate', 'wallet', 'tool access', 'multi-user isolation', 'desktop/mobile navigation', 'mobile signup'], screenshots: screenshots.pathname }, null, 2))
} catch (error) {
  await page.screenshot({path:new URL('e2e-failure.png',screenshots).pathname,fullPage:true}); throw error
} finally {
  await context.close()
  await browser.close()
}
