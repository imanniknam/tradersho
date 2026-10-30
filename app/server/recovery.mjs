import {mailConfig,enqueueMail} from './mail.mjs'
import {randomBytes} from 'node:crypto'
import {pool} from './db.mjs'
import {tokenHash,hashPassword,passwordError} from './auth.mjs'
export async function migrateRecovery(client){await client.query(`CREATE TABLE IF NOT EXISTS password_recovery(token_hash text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,password_version text NOT NULL,expires_at timestamptz NOT NULL); CREATE INDEX IF NOT EXISTS recovery_user ON password_recovery(user_id);`)}
export async function recoveryRoute({path,method,req,res,body,json,fail,rateLimit}){
 if(!['/api/auth/forgot-password','/api/auth/reset-password'].includes(path))return false
 if(method!=='POST'){fail(res,405,'این عملیات مجاز نیست.');return true}
 const input=await body(req)
 if(path.endsWith('/forgot-password')){
  const email=String(input.email||'').trim().toLowerCase()
  if(email.length>160||!/^\S+@\S+\.\S+$/.test(email)){fail(res,400,'ایمیل معتبر وارد کنید.');return true}
  if(await rateLimit(req,res,'recovery-ip','',30)||await rateLimit(req,res,'recovery',email,5))return true
  const smtp=mailConfig(),endpoint=process.env.RECOVERY_EMAIL_URL,origin=process.env.APP_PUBLIC_URL,secret=process.env.RECOVERY_EMAIL_SECRET
  if(!smtp&&(!endpoint||!origin||!secret)){fail(res,503,'ارسال ایمیل بازیابی هنوز فعال نشده است. لطفاً بعداً دوباره تلاش کنید.');return true}
  const delivery=smtp?null:new URL(endpoint),base=new URL(origin)
  if((delivery&&delivery.protocol!=='https:')||(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname))))throw new Error('Invalid recovery configuration')
  const client=await pool.connect();let token,user
  try{await client.query('BEGIN');user=(await client.query('SELECT id,password_hash FROM users WHERE lower(email)=$1 FOR UPDATE',[email])).rows[0];await client.query('DELETE FROM password_recovery WHERE expires_at<now()');if(user){token=randomBytes(32).toString('hex');await client.query('DELETE FROM password_recovery WHERE user_id=$1',[user.id]);await client.query("INSERT INTO password_recovery VALUES($1,$2,$3,now()+interval '15 minutes')",[tokenHash(token),user.id,tokenHash(user.password_hash)]);if(smtp){const link=new URL('/reset-password',base);link.hash=token;await enqueueMail(client,{id:'recovery-'+tokenHash(token),userId:user.id,purpose:'recovery',to:email,subject:'بازیابی رمز عبور تریدر شو',text:`برای تعیین رمز جدید از لینک زیر استفاده کنید. اعتبار لینک ۱۵ دقیقه است.\n${link.href}\nاگر این درخواست از شما نیست، آن را نادیده بگیرید.`,recoveryHash:tokenHash(token)})}}await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  // Dispatch outside the response path so mail-provider latency cannot reveal account existence.
  if(user&&!smtp){const link=new URL('/reset-password',base);link.hash=token;void deliverRecovery(delivery,secret,email,link.href,token)}
  json(res,202,{ok:true,message:'اگر حسابی با این ایمیل وجود داشته باشد، لینک بازیابی برای آن ارسال می‌شود.'});return true
 }
 if(await rateLimit(req,res,'recovery-reset','',15))return true
 if(typeof input.token!=='string'||!/[a-f0-9]{64}/.test(input.token)||input.token.length!==64){fail(res,400,'لینک بازیابی نامعتبر یا منقضی است.');return true}
 const invalid=passwordError(input.password)
 if(invalid||input.password!==input.confirmPassword){fail(res,400,invalid||'تکرار رمز عبور یکسان نیست.');return true}
 const client=await pool.connect()
 try{await client.query('BEGIN');const candidate=(await client.query('SELECT user_id FROM password_recovery WHERE token_hash=$1',[tokenHash(input.token)])).rows[0];if(!candidate){await client.query('ROLLBACK');fail(res,400,'لینک بازیابی نامعتبر یا منقضی است.');return true}
 const user=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[candidate.user_id])).rows[0]
 const row=(await client.query('SELECT * FROM password_recovery WHERE token_hash=$1 AND expires_at>now()',[tokenHash(input.token)])).rows[0]
 if(!row||row.password_version!==tokenHash(user.password_hash)){await client.query('ROLLBACK');fail(res,400,'لینک بازیابی نامعتبر یا منقضی است.');return true}
 const error=passwordError(input.password,{email:user.email,name:user.name});if(error){await client.query('ROLLBACK');fail(res,400,error);return true}
 await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2',[await hashPassword(input.password),user.id]);await client.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);await client.query('DELETE FROM password_recovery WHERE user_id=$1',[user.id]);await client.query('COMMIT');json(res,200,{ok:true})
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 return true
}

async function deliverRecovery(endpoint,secret,email,link,token){
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify({to:email,subject:'بازیابی رمز عبور تریدر شو',text:`برای تعیین رمز جدید از لینک زیر استفاده کنید. اعتبار لینک ۱۵ دقیقه است.\n${link}\nاگر این درخواست از شما نیست، آن را نادیده بگیرید.`}),signal:AbortSignal.timeout(10000)})
  if(!response.ok)throw new Error('delivery failed')
 }catch{
  try{await pool.query('DELETE FROM password_recovery WHERE token_hash=$1',[tokenHash(token)])}catch{console.warn('Recovery cleanup failed')}
  console.warn('Recovery email delivery failed')
 }
}
