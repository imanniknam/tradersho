import {pool} from './db.mjs'
import {verifyPassword} from './auth.mjs'
import {generateSecret,sealSecret,openSecret,matchTotp} from './totp.mjs'

export const staffMfaHours=12
const key=()=>/^[a-f0-9]{64}$/i.test(process.env.STAFF_MFA_KEY||'')?process.env.STAFF_MFA_KEY:null
// Production never runs staff areas without a second factor; local QA may opt out.
export const staffMfaRequired=()=>Boolean(key())||process.env.NODE_ENV==='production'

export async function migrateStaffMfa(client){
  await client.query(`CREATE TABLE IF NOT EXISTS staff_mfa(
    user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret text, pending text, last_counter bigint NOT NULL DEFAULT -1)`)
}

export async function staffMfaState(userId,tokenDigest){
  if(!staffMfaRequired())return {required:false,verified:true,enrolled:false,configured:false}
  const {rows:[row]}=await pool.query(`SELECT
    EXISTS(SELECT 1 FROM staff_mfa WHERE user_id=$1 AND secret IS NOT NULL) AS enrolled,
    EXISTS(SELECT 1 FROM sessions WHERE token_hash=$2 AND user_id=$1 AND mfa_at>now()-make_interval(hours => $3)) AS verified`,[userId,tokenDigest,staffMfaHours])
  return {required:true,configured:Boolean(key()),enrolled:row.enrolled,verified:Boolean(key())&&row.enrolled&&row.verified}
}

const isStaff=async userId=>(await pool.query('SELECT 1 FROM user_admins WHERE user_id=$1 UNION ALL SELECT 1 FROM support_agents WHERE user_id=$1 LIMIT 1',[userId])).rowCount>0

export async function staffMfaRoute({path,method,user,tokenDigest,req,res,body,json,fail,rateLimit}){
  if(!['/api/admin/mfa/enroll','/api/admin/mfa/verify'].includes(path))return false
  if(method!=='POST'){fail(res,405,'این عملیات مجاز نیست.');return true}
  if(!await isStaff(user.id)){fail(res,403,'دسترسی به پنل مدیریت مجاز نیست.');return true}
  if(!key()){fail(res,503,'احراز دومرحله‌ای روی سرور پیکربندی نشده است.');return true}
  if(await rateLimit(req,res,'staff-mfa',user.id,8))return true
  const input=await body(req)
  if(path.endsWith('/enroll')){
    // Enrolment needs the password: a borrowed session must not choose the second factor.
    if(typeof input.password!=='string'||input.password.length>128||!await verifyPassword(input.password,user.password_hash)){fail(res,403,'رمز عبور نادرست است. حساب بدون رمز ابتدا باید رمز تعیین کند.');return true}
    const secret=generateSecret()
    const saved=await pool.query(`INSERT INTO staff_mfa(user_id,pending) VALUES($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET pending=EXCLUDED.pending WHERE staff_mfa.secret IS NULL`,[user.id,sealSecret(secret,key())])
    if(!saved.rowCount){fail(res,409,'احراز دومرحله‌ای قبلاً فعال شده است. بازنشانی فقط از سرور ممکن است.');return true}
    json(res,200,{secret});return true
  }
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    const row=(await client.query('SELECT * FROM staff_mfa WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0]
    const box=row?.secret||row?.pending
    const counter=box?matchTotp(openSecret(box,key()),input.code):null
    // The counter only moves forward, so a code works once.
    if(counter===null||counter<=Number(row.last_counter)){await client.query('ROLLBACK');fail(res,403,'کد یک‌بارمصرف نادرست یا قبلاً استفاده شده است.');return true}
    await client.query('UPDATE staff_mfa SET secret=COALESCE(secret,pending),pending=NULL,last_counter=$2 WHERE user_id=$1',[user.id,counter])
    await client.query('UPDATE sessions SET mfa_at=now() WHERE token_hash=$1 AND user_id=$2',[tokenDigest,user.id])
    await client.query('COMMIT')
    json(res,200,{ok:true})
  }catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
  return true
}
