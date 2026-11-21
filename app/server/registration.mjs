import {createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto'
import {pool} from './db.mjs'
import {tokenHash} from './auth.mjs'
import {enqueueMail,mailConfig} from './mail.mjs'

export const verificationEnabled = () => process.env.SIGNUP_EMAIL_VERIFICATION === '1'
const invalid = (status,message) => Object.assign(new Error(message),{status})
const missing = 'درخواست ثبت‌نام منقضی شده است. دوباره ثبت‌نام کنید.'
const codeHash = (key,id,code) => createHmac('sha256',key).update(id+':'+code).digest()

export async function migrateRegistration(client){
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
    CREATE TABLE IF NOT EXISTS pending_registrations (
      id text PRIMARY KEY, name varchar(80) NOT NULL, email varchar(160) NOT NULL,
      password_hash text NOT NULL, code_hash bytea NOT NULL, expires_at timestamptz NOT NULL,
      issued_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
      provider text, subject text
    );`)
}

async function transaction(operation){
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    const result=await operation(client)
    await client.query('COMMIT')
    return result
  }catch(error){
    await client.query('ROLLBACK')
    throw error
  }finally{client.release()}
}

async function issueCode(client,mail,row,insert){
  const code=String(randomInt(1000000)).padStart(6,'0')
  await insert(codeHash(mail.key,row.id,code))
  await client.query("DELETE FROM mail_outbox WHERE registration_id=$1 AND status='pending'",[row.id])
  const queued=await enqueueMail(client,{
    id:'verification-'+randomUUID(), registrationId:row.id, purpose:'signup_verification',
    to:row.email,subject:'کد تأیید ایمیل تریدر شو',
    text:`کد تأیید ایمیل شما: ${code}\nاین کد ۱۵ دقیقه اعتبار دارد. اگر شما درخواست ثبت‌نام نداده‌اید، این پیام را نادیده بگیرید.`,
  })
  if(!queued)throw invalid(503,'ارسال کد تأیید در دسترس نیست. دوباره تلاش کنید.')
}

export async function startRegistration({name,email,passwordHash,social}){
  const mail=mailConfig()
  if(!mail)throw invalid(503,'ارسال کد تأیید در دسترس نیست. دوباره تلاش کنید.')
  const token=randomBytes(32).toString('hex'),id=tokenHash(token)
  await transaction(async client=>{
    await client.query('DELETE FROM pending_registrations WHERE expires_at<=now()')
    if((await client.query('SELECT 1 FROM users WHERE lower(email)=$1',[email])).rowCount)
      throw invalid(409,'این ایمیل قبلاً ثبت شده است. پس از ورود می‌توانید روش ورود جدید را از حساب کاربری متصل کنید.')
    if(social&&!(await client.query('DELETE FROM social_registrations WHERE ticket=$1 AND expires_at>now()',[social.ticket])).rowCount)
      throw invalid(400,'درخواست ورود منقضی شده است. دوباره وارد شوید.')
    await issueCode(client,mail,{id,email},hash=>client.query(`INSERT INTO pending_registrations
      (id,name,email,password_hash,code_hash,expires_at,provider,subject)
      VALUES ($1,$2,$3,$4,$5,now()+interval '15 minutes',$6,$7)`,
      [id,name,email,passwordHash,hash,social?.provider??null,social?.subject??null]))
  })
  return {verificationToken:token}
}

export async function verifyRegistration({input,res,req,path,rateLimit,fail,json,login}){
  if (!verificationEnabled()) return fail(res,404,'مسیر پیدا نشد.')
  const token=input.verificationToken
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return fail(res,400,missing)
  const resend=path.endsWith('/resend'), id=tokenHash(token)
  if(await rateLimit(req,res,resend?'signup-resend-ip':'signup-verify-ip','',30))return
  if(resend&&await rateLimit(req,res,'signup-resend',id,3))return
  const mail=mailConfig()
  if(!mail)return fail(res,503,'ارسال کد تأیید در دسترس نیست. دوباره تلاش کنید.')
  const code=typeof input.code==='string'?input.code.trim().replace(/[۰-۹٠-٩]/g,n=>String(n.charCodeAt(0)&15)):''
  if(!resend&&!/^\d{6}$/.test(code))return fail(res,400,'کد ۶ رقمی را وارد کنید.')
  let result
  try{
    result=await transaction(async client=>{
      const row=(await client.query(`SELECT *, issued_at > now()-interval '1 minute' AS cooling_down
        FROM pending_registrations WHERE id=$1 AND expires_at>now() FOR UPDATE`,[id])).rows[0]
      if(!row)return {status:400,error:missing}
      if(resend){
        if(row.cooling_down)return {status:429,error:'برای ارسال مجدد، یک دقیقه صبر کنید.'}
        await issueCode(client,mail,row,hash=>client.query(`UPDATE pending_registrations
          SET code_hash=$2,issued_at=now(),expires_at=now()+interval '15 minutes',attempts=0 WHERE id=$1`,[id,hash]))
        return {resent:true}
      }
      if(row.attempts>=5)return {status:429,error:'برای ادامه کد جدید درخواست کنید.'}
      if(!timingSafeEqual(row.code_hash,codeHash(mail.key,id,code))){
        await client.query('UPDATE pending_registrations SET attempts=attempts+1 WHERE id=$1',[id])
        return {status:400,error:'کد تأیید نادرست است.'}
      }
      const {rows:[user]}=await client.query(`INSERT INTO users (id,name,email,password_hash,email_verified_at)
        VALUES ($1,$2,$3,$4,now()) RETURNING *`,[randomUUID(),row.name,row.email,row.password_hash])
      if(row.provider)await client.query('INSERT INTO social_identities(provider,subject,user_id) VALUES ($1,$2,$3)',[row.provider,row.subject,user.id])
      await client.query('DELETE FROM pending_registrations WHERE id=$1',[id])
      return {user}
    })
  }catch(error){
    if(error.code==='23505')return fail(res,409,'این حساب قبلاً ثبت شده است. وارد حساب خود شوید.')
    throw error
  }
  if(result.error)return fail(res,result.status,result.error)
  if(result.resent)return json(res,202,{ok:true})
  return login(result.user)
}
