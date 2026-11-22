import {adminUsersRoute,isUserAdmin} from './admin-users.mjs'
import {allowedOrigin,browserBindingHash,secureCookie,responseSecurityHeaders} from './security.mjs'
import {startRegistration,verificationEnabled,verifyRegistration} from './registration.mjs'
import {socialRoute} from './social-auth.mjs'
import {getFlickerStatus} from './flicker-status.mjs'
import {riskSetupsRoute} from './risk-setups.mjs'
import {mailAddress,mailConfig,startMailWorker} from './mail.mjs'
import {calendarIntegration,calendarRoute} from './calendar.mjs'
import {captchaEnabled,issueCaptcha,verifyCaptcha} from './captcha.mjs'
import {recoveryRoute} from './recovery.mjs'
import { supportRoute } from './support.mjs'
import http from 'node:http'
import {isIP} from 'node:net'
import { randomBytes, randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, migrate } from './db.mjs'
import { replayRoute } from './replay.mjs'
import { candleRoute } from './candle-replay.mjs'
import { toolCatalog, subscriptionsEnabled, coursesPublished } from './catalog.mjs'
import { hashPassword, verifyPassword, passwordError, tokenHash } from './auth.mjs'

if(captchaEnabled()&&(!process.env.CAPTCHA_SECRET||process.env.CAPTCHA_SECRET.length<32))throw new Error('CAPTCHA_SECRET must contain at least 32 characters')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '0.0.0.0'
const sessionAge = 3 * 24 * 60 * 60
const courseLengths = { basics: 8, risk: 6, psychology: 5 }
const securityHeaders = responseSecurityHeaders
const json = (res, status, data, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...securityHeaders, ...headers })
  res.end(JSON.stringify(data))
}
const fail = (res, status, message) => json(res, status, { error: message })
const body = async (req, limit = 16384) => {
  req.setEncoding('utf8')
  let input = ''
  for await (const chunk of req) {
    input += chunk
    if (Buffer.byteLength(input) > limit) throw Object.assign(new Error('درخواست بیش از حد بزرگ است.'), { status: 413 })
  }
  try {
    const parsed = JSON.parse(input || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid object')
    return parsed
  }
  catch { throw Object.assign(new Error('فرمت درخواست معتبر نیست.'), { status: 400 }) }
}
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(value => {
  const i = value.indexOf('=')
  return [value.slice(0, i).trim(), value.slice(i + 1).trim()]
}))
const digest = tokenHash
const setCookie = (req, token, age) => {
  return 'tradersho_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + age + (secureCookie(req) ? '; Secure' : '')
}
const clientAddress = req => {
  const direct = String(req.socket.remoteAddress || '')
  // Enabled only behind the VPS proxy, which overwrites this header.
  if(process.env.TRUST_PROXY==='1'){const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();if(isIP(forwarded))return forwarded}
  const cloudflare = req.headers['cf-connecting-ip']
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(direct) && typeof cloudflare === 'string' ? cloudflare : direct
}
const throttleKey = (req, action, account = '') => digest(`${action}:${account || clientAddress(req)}`)
const rateLimit = async (req, res, action, account = '', limit = 10) => {
  const key = throttleKey(req, action, account)
  const { rows } = await pool.query(`INSERT INTO auth_throttle (key_hash, attempts, expires_at) VALUES ($1, 1, now() + interval '15 minutes')
    ON CONFLICT (key_hash) DO UPDATE SET attempts = CASE WHEN auth_throttle.expires_at < now() THEN 1 ELSE auth_throttle.attempts + 1 END,
    expires_at = CASE WHEN auth_throttle.expires_at < now() THEN now() + interval '15 minutes' ELSE auth_throttle.expires_at END
    RETURNING attempts`, [key])
  if (rows[0].attempts <= limit) return false
  fail(res, 429, 'تعداد تلاش‌ها زیاد است. ۱۵ دقیقهٔ دیگر دوباره تلاش کنید.')
  return true
}
const activePlan = async userId => {
  const { rows } = await pool.query("SELECT plan_code FROM subscriptions WHERE user_id = $1 AND status = 'active' AND starts_at <= now() AND ends_at > now() ORDER BY ends_at DESC LIMIT 1", [userId])
  return rows[0]?.plan_code || 'free'
}
const publicUser = async user => {
  const {rows:[access]}=await pool.query(`SELECT
    EXISTS(SELECT 1 FROM user_admins WHERE user_id=$1) AS "isAdmin",
    EXISTS(SELECT 1 FROM support_agents WHERE user_id=$1) AS "isSupportAgent",
    COALESCE((SELECT plan_code FROM subscriptions WHERE user_id=$1 AND status='active' AND starts_at<=now() AND ends_at>now() ORDER BY ends_at DESC LIMIT 1),'free') AS plan,
    COALESCE((SELECT jsonb_object_agg(course_id,completed_lessons) FROM course_progress WHERE user_id=$1),'{}'::jsonb) AS progress`,[user.id])
  return { ...access, hasPassword:user.password_hash.startsWith('scrypt$')||user.password_hash.includes(':'), id: user.id, name: user.name, email: user.email, emailVerifiedAt:user.email_verified_at, createdAt: user.created_at }
}
const sessionUser = async req => {
  const token = cookies(req).tradersho_session
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const { rows } = await pool.query("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND u.account_status='active' AND s.created_at + make_interval(secs => $2) > now()", [digest(token), sessionAge])
  return rows[0] || null
}
const insertSession = (db, token, userId) => db.query(
  'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))',
  [digest(token), userId, sessionAge],
)
const createSession = async (req, userId) => {
  const token = randomBytes(32).toString('hex')
  await pool.query('DELETE FROM sessions WHERE expires_at <= now()')
  await insertSession(pool, token, userId)
  return setCookie(req, token, sessionAge)
}
const sameOrigin = allowedOrigin
const mime = { '.pdf': 'application/pdf', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' }
const staticFile = async (path, req, res) => {
  if(!['GET','HEAD'].includes(req.method||'GET'))return json(res,405,{error:'این عملیات مجاز نیست.'},{Allow:'GET, HEAD'})
  const dist = join(root, 'dist')
  let file = join(dist, path === '/' ? 'index.html' : path)
  if (!file.startsWith(dist + '/') && file !== join(dist, 'index.html')) return fail(res, 403, 'مسیر نامعتبر است.')
  try { if (!(await stat(file)).isFile()) file = join(dist, 'index.html') } catch { file = join(dist, 'index.html') }
  try {
    const info=await stat(file),etag=`W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
    const immutable=/\/assets\/[^/]+-[\w-]{8,}\.(?:js|css|woff2?)$/.test(file)
    const headers={...securityHeaders,'Content-Type':mime[extname(file)]||'application/octet-stream',ETag:etag,
      'Cache-Control':file.endsWith('index.html')?'no-cache':immutable?'public, max-age=31536000, immutable':'public, max-age=86400'}
    if(String(req.headers['if-none-match']||'').split(',').some(value=>value.trim()===etag||value.trim()==='*')){res.writeHead(304,headers);res.end();return}
    const ranged=['.zip','.pdf'].includes(extname(file))
    if(ranged)headers['Accept-Ranges']='bytes'
    let start=0,end=info.size-1,status=200
    const range=req.headers.range
    if(ranged&&range&&!req.headers['if-range']){
      const match=/^bytes=(\d*)-(\d*)$/.exec(range)
      if(match&&(match[1]||match[2])){
        if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]))}
        else start=Math.max(0,info.size-Number(match[2]))
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`});res.end();return}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`
      }
    }
    headers['Content-Length']=Math.max(0,end-start+1)
    res.writeHead(status,headers)
    if(req.method==='HEAD'||!info.size){res.end();return}
    await pipeline(createReadStream(file,{start,end}),res)
  } catch {
    if(res.headersSent){res.destroy();return}
    fail(res,404,'فایل در دسترس نیست.')
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://' + (req.headers.host || 'localhost')).pathname
    if (!path.startsWith('/api/')) return await staticFile(path, req, res)
    const method = req.method || 'GET'
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && (req.headers['sec-fetch-site'] === 'cross-site' || !sameOrigin(req))) return fail(res, 403, 'مبدأ درخواست مجاز نیست.')
    if (path === '/api/health' && method === 'GET') {
      await pool.query('SELECT 1')
      return json(res, 200, { ok: true, database: 'ready', version: process.env.APP_VERSION || 'development' })
    }
    if(path==='/api/auth/captcha'&&method==='GET'){
      if(!captchaEnabled())return json(res,200,{enabled:false})
      if(await rateLimit(req,res,'captcha-ip','',60))return
      const previous=cookies(req).tradersho_captcha,binding=browserBindingHash(previous)?previous:randomBytes(32).toString('hex')
      return json(res,200,await issueCaptcha(binding),{'Set-Cookie':'tradersho_captcha='+binding+'; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=900'+(secureCookie(req)?'; Secure':'')})
    }
    if(await calendarIntegration({path,method,req,res,body,json,fail,rateLimit}))return
    if(path.startsWith('/api/integrations/news'))return fail(res,410,'بخش خبرها حذف شده است.')
    if(await recoveryRoute({path,method,req,res,body,json,fail,rateLimit}))return
    const login=async (user,status=200)=>json(res,status,{user:await publicUser(user)},{'Set-Cookie':await createSession(req,user.id)})
    const redirect=(location,setCookies)=>{
      res.writeHead(303,{...securityHeaders,'Referrer-Policy':'no-referrer','Cache-Control':'no-store',Location:location,'Set-Cookie':setCookies})
      res.end()
    }
    if(await socialRoute({path,method,req,res,body,json,fail,rateLimit,cookies,sessionUser,createSession,redirect}))return
    if(method==='POST'&&['/api/auth/signup/verify','/api/auth/signup/resend'].includes(path))
      return await verifyRegistration({input:await body(req),path,req,res,rateLimit,fail,json,login:user=>login(user,201)})
    if (path === '/api/auth/signup' && method === 'POST') {
      const input = await body(req)
      const name = typeof input.name === 'string' && input.name.trim().length >= 2 ? input.name.trim().slice(0, 80) : 'کاربر تریدر شو'
      const email = typeof input.email==='string' ? input.email.trim().toLowerCase() : ''
      const password = input.password
      if (email.length>160 || !mailAddress(email)) return fail(res, 400, 'ایمیل معتبر نیست.')
      if (await rateLimit(req, res, 'signup-ip', '', 15)) return
      if (await rateLimit(req, res, 'signup', email, 10)) return
      const invalidPassword = passwordError(password, { email, name })
      if (invalidPassword) return fail(res, 400, invalidPassword)
      if (password !== input.confirmPassword) return fail(res, 400, 'تکرار رمز عبور با رمز اصلی یکسان نیست.')
      if(!await verifyCaptcha(input.captchaId,input.captchaAnswer,cookies(req).tradersho_captcha))return fail(res,400,'کد امنیتی نادرست یا منقضی است. کد جدید را وارد کنید.')
      const passwordHash=await hashPassword(password)
      if(verificationEnabled())return json(res,202,await startRegistration({name,email,passwordHash}))
      const id = randomUUID()
      try {
        const { rows } = await pool.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING *', [id, name, email, passwordHash])
        return await login(rows[0],201)
      } catch (error) {
        if (error.code === '23505') return fail(res, 409, 'این ایمیل قبلاً ثبت شده است.')
        throw error
      }
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const input = await body(req)
      const email = String(input.email || '').trim().toLowerCase()
      if (email.length > 160 || typeof input.password !== 'string' || input.password.length > 128) return fail(res, 401, 'ایمیل یا رمز عبور نادرست است.')
      if (await rateLimit(req, res, 'login-ip', '', 30)) return
      if (await rateLimit(req, res, 'login', email, 10)) return
      if(!await verifyCaptcha(input.captchaId,input.captchaAnswer,cookies(req).tradersho_captcha))return fail(res,400,'کد امنیتی نادرست یا منقضی است. کد جدید را وارد کنید.')
      const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email])
      const user = rows[0]
      if (!user || user.account_status!=='active' || !await verifyPassword(input.password, user.password_hash)) return fail(res, 401, 'ایمیل یا رمز عبور نادرست است.')
      if (!user.password_hash.startsWith('scrypt$')) await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [await hashPassword(input.password), user.id])
      await pool.query('DELETE FROM auth_throttle WHERE key_hash = $1', [throttleKey(req, 'login', email)])
      return json(res, 200, { user: await publicUser(user) }, { 'Set-Cookie': await createSession(req, user.id) })
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      const token = cookies(req).tradersho_session
      if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)])
      return json(res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, '', 0) })
    }
    const user = await sessionUser(req)
    if (!user) return fail(res, 401, 'برای ادامه وارد حساب خود شوید.')
    if(path==='/api/account/email/start'&&method==='POST'){
      if(user.email)return fail(res,409,'این حساب قبلاً ایمیل دارد.')
      const input=await body(req),email=typeof input.email==='string'?input.email.trim().toLowerCase():''
      if(email.length>160||!mailAddress(email))return fail(res,400,'ایمیل معتبر وارد کنید.')
      if(await rateLimit(req,res,'account-email',user.id,5)||await rateLimit(req,res,'signup',email,5))return
      return json(res,202,await startRegistration({name:user.name,email,passwordHash:user.password_hash,accountUserId:user.id}))
    }
    if(['/api/account/email/verify','/api/account/email/resend'].includes(path)&&method==='POST')
      return await verifyRegistration({input:await body(req),path,req,res,rateLimit,fail,json,user,
        login:async updated=>json(res,200,{user:await publicUser(updated)})})
    if(await adminUsersRoute({path,method,user,req,res,body,json,fail,rateLimit}))return
    if(path==='/api/news')return fail(res,410,'بخش خبرها حذف شده است.')
    if(await riskSetupsRoute({path,method,user,req,res,body,json,fail,rateLimit}))return
    if(await calendarRoute({path,method,req,res,json,fail}))return
    if(path==='/api/market/gold-sentiment/status'&&method==='GET'){if(await rateLimit(req,res,'gold-status',user.id,60))return;return json(res,200,await getFlickerStatus(new URL(req.url,'http://localhost').searchParams.get('refresh')==='1'))}
    if (path === '/api/session' && method === 'GET') return json(res, 200, { user: await publicUser(user) })
    if (path === '/api/admin/session' && method === 'GET') {
      const agent=await pool.query('SELECT 1 FROM support_agents WHERE user_id=$1',[user.id])
      const administrator=await isUserAdmin(user.id)
      return agent.rowCount||administrator ? json(res,200,{allowed:true,isAdmin:administrator,isSupportAgent:agent.rowCount>0}) : fail(res,403,'دسترسی به پنل مدیریت مجاز نیست.')
    }
    if (path === '/api/tools' && method === 'GET') return json(res, 200, { tools: toolCatalog })
    if (!subscriptionsEnabled && ['/api/subscription', '/api/plan-interest'].includes(path)) return fail(res, 409, 'بخش اشتراک فعلاً فعال نیست.')
    if (path.startsWith('/api/candles/') || path.startsWith('/api/replay/') || path.startsWith('/api/market/')) return fail(res, 409, 'محیط قبلی فعلاً در نسخهٔ اولیه فعال نیست.')
    if (method !== 'GET' && path === '/api/rebates') return fail(res, 409, 'این بخش فعلاً در حال آماده‌سازی است.')
    if (await candleRoute({ path, method, user, req, res, body, json, fail, rateLimit })) return
    if (await replayRoute({ path, method, user, req, res, body, json, fail, rateLimit })) return

    if (path === '/api/account/password' && method === 'POST') {
      if (await rateLimit(req, res, 'password-change', user.id, 5)) return
      const input = await body(req)
      if (typeof input.currentPassword !== 'string' || !await verifyPassword(input.currentPassword, user.password_hash)) return fail(res, 400, 'رمز عبور فعلی نادرست است.')
      const invalidPassword = passwordError(input.newPassword, { email: user.email||'', name: user.name })
      if (invalidPassword) return fail(res, 400, invalidPassword)
      if (input.newPassword !== input.confirmPassword) return fail(res, 400, 'تکرار رمز عبور با رمز جدید یکسان نیست.')
      if (await verifyPassword(input.newPassword, user.password_hash)) return fail(res, 400, 'رمز جدید باید با رمز فعلی متفاوت باشد.')
      const nextHash = await hashPassword(input.newPassword)
      const token = randomBytes(32).toString('hex')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [nextHash, user.id])
        await client.query('DELETE FROM sessions WHERE user_id = $1', [user.id])
        await insertSession(client, token, user.id)
        await client.query('COMMIT')
      } catch (error) { await client.query('ROLLBACK'); throw error }
      finally { client.release() }
      return json(res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, token, sessionAge) })
    }
    if (path === '/api/account/sessions' && method === 'DELETE') {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id])
      return json(res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, '', 0) })
    }
    if (path === '/api/account' && method === 'PATCH') {
      const input = await body(req)
      const name = String(input.name || '').trim().slice(0, 80)
      if (name.length < 2) return fail(res, 400, 'نام باید حداقل دو نویسه باشد.')
      const { rows } = await pool.query('UPDATE users SET name = $1, admin_version=admin_version+1, updated_at = now() WHERE id = $2 RETURNING *', [name, user.id])
      return json(res, 200, { user: await publicUser(rows[0]) })
    }
    if (await supportRoute({path,method,user,req,res,body,json,fail,rateLimit})) return
    if (path === '/api/rebates' && method === 'GET') {
      const { rows } = await pool.query('SELECT id, broker, account, status, created_at AS "createdAt" FROM rebate_requests WHERE user_id = $1 ORDER BY created_at DESC', [user.id])
      return json(res, 200, { requests: rows })
    }
    if (path === '/api/rebates' && method === 'POST') {
      const input = await body(req)
      const broker = String(input.broker || '').trim().slice(0, 80)
      const account = String(input.account || '').trim().slice(0, 80)
      if (broker.length < 2 || account.length < 3) return fail(res, 400, 'نام بروکر و شمارهٔ حساب را کامل وارد کنید.')
      const { rows } = await pool.query('INSERT INTO rebate_requests (id, user_id, broker, account) VALUES ($1, $2, $3, $4) RETURNING id, broker, account, status, created_at AS "createdAt"', [randomUUID(), user.id, broker, account])
      return json(res, 201, { request: rows[0] })
    }
    if (path === '/api/plan-interest' && method === 'POST') {
      const input = await body(req)
      const plan = String(input.plan || '')
      if (!['pro', 'plus'].includes(plan)) return fail(res, 400, 'طرح نامعتبر است.')
      await pool.query('INSERT INTO plan_interests (id, user_id, plan_code) VALUES ($1, $2, $3) ON CONFLICT (user_id, plan_code) DO NOTHING', [randomUUID(), user.id, plan])
      return json(res, 201, { ok: true })
    }
    if (path === '/api/subscription' && method === 'GET') return json(res, 200, { plan: await activePlan(user.id) })
    if (path === '/api/wallet' && method === 'GET') {
      const { rows: balances } = await pool.query("SELECT COALESCE(SUM(amount_irr), 0)::text AS balance FROM wallet_transactions WHERE user_id = $1 AND status = 'settled'", [user.id])
      const { rows } = await pool.query('SELECT id, amount_irr::text AS amount, kind, status, description, created_at AS "createdAt" FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [user.id])
      return json(res, 200, { balance: balances[0].balance, transactions: rows })
    }
    const course = path.match(/^\/api\/courses\/(basics|risk|psychology)\/advance$/)
    if (course && method === 'POST') {
      if (!coursesPublished) return fail(res, 409, 'محتوای این دوره هنوز منتشر نشده است.')
      const id = course[1]
      await pool.query('INSERT INTO course_progress (user_id, course_id, completed_lessons) VALUES ($1, $2, 1) ON CONFLICT (user_id, course_id) DO UPDATE SET completed_lessons = LEAST($3, course_progress.completed_lessons + 1), updated_at = now()', [user.id, id, courseLengths[id]])
      return json(res, 200, { user: await publicUser(user) })
    }
    const access = path.match(/^\/api\/tools\/([a-z-]+)\/access$/)
    if (access && method === 'GET') {
      const toolId = access[1]
      const tool = toolCatalog.find(item => item.id === toolId)
      if (!tool) return fail(res, 404, 'ابزار پیدا نشد.')
      if (tool.status === 'coming_soon' || tool.status === 'maintenance') return fail(res, 409, 'این ابزار در حال آماده‌سازی است.')
      return json(res, 200, { allowed: true, status: tool.status })
    }
    return fail(res, 404, 'مسیر پیدا نشد.')
  } catch (error) {
    if (error.status && error.status < 500) return fail(res, error.status, error.message)
    if (error.status===503) return json(res,503,{error:'سرور موقتاً مشغول یا در دسترس نیست؛ کمی بعد دوباره تلاش کنید.'},{'Retry-After':'5'})
    console.error(error)
    return fail(res, 500, 'خطای داخلی سرور رخ داد.')
  }
})
server.headersTimeout=15_000
server.requestTimeout=30_000
server.keepAliveTimeout=5_000
server.maxRequestsPerSocket=1000
server.maxConnections=256

if(!mailConfig()&&verificationEnabled())throw Error('Email verification requires SMTP')
await migrate()
const stopMailWorker=startMailWorker(pool)
server.listen(port, host, () => console.log('Tradersho API listening on http://' + host + ':' + port))
const shutdown = () => { void stopMailWorker().then(()=>server.close(() => pool.end())) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
