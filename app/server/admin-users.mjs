import {randomBytes,randomUUID} from 'node:crypto'
import {pool} from './db.mjs'
import {hashPassword,tokenHash} from './auth.mjs'
import {mailAddress,mailConfig,enqueueMail} from './mail.mjs'

export async function migrateAdminUsers(client){
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','invited','suspended'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_required boolean NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_version integer NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS user_admins(user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS admin_user_audit(
      id bigserial PRIMARY KEY, actor_id text REFERENCES users(id) ON DELETE SET NULL,
      subject_id text NOT NULL, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_user_audit_created ON admin_user_audit(created_at DESC,id DESC);`)
}
export const isUserAdmin=async(userId,db=pool)=>(await db.query('SELECT 1 FROM user_admins WHERE user_id=$1',[userId])).rowCount>0
const error=(status,message)=>Object.assign(Error(message),{status})
const fields=`u.id,u.name,u.email,u.account_status AS status,u.admin_version AS version,u.created_at AS "createdAt",
 u.email_verified_at AS "emailVerifiedAt",
 EXISTS(SELECT 1 FROM user_admins a WHERE a.user_id=u.id) AS "isAdmin",
 EXISTS(SELECT 1 FROM support_agents a WHERE a.user_id=u.id) AS "isSupportAgent",
 (SELECT count(*)::int FROM sessions s WHERE s.user_id=u.id AND s.expires_at>now()) AS "sessionCount",
 ARRAY(SELECT provider FROM social_identities i WHERE i.user_id=u.id ORDER BY provider) AS providers`
const audit=(db,actor,subject,action,details={})=>db.query(
 'INSERT INTO admin_user_audit(actor_id,subject_id,action,details) VALUES ($1,$2,$3,$4)',
 [actor,subject,action,JSON.stringify(details)])
const validName=name=>typeof name==='string'&&name.trim().length>=2&&name.trim().length<=80&&!/[\x00-\x1f]/.test(name)
const validEmail=email=>typeof email==='string'&&email.length<=160&&mailAddress(email)
async function sendAccessLink(db,user,invite){
 const smtp=mailConfig()
 if(!smtp)throw error(503,'ارسال ایمیل در دسترس نیست.')
 const token=randomBytes(32).toString('hex')
 await db.query('DELETE FROM password_recovery WHERE user_id=$1',[user.id])
 await db.query("INSERT INTO password_recovery(token_hash,user_id,password_version,expires_at) VALUES ($1,$2,$3,now()+interval '15 minutes')",[tokenHash(token),user.id,tokenHash(user.password_hash)])
 const link=new URL('/reset-password',smtp.base)
 link.hash=token
 const queued=await enqueueMail(db,{id:'recovery-'+tokenHash(token),userId:user.id,purpose:'recovery',to:user.email,
   subject:invite?'دعوت به پنل تریدر شو':'بازیابی رمز عبور تریدر شو',
   text:`برای ${invite?'تأیید ایمیل و فعال‌سازی حساب':'تعیین رمز جدید'} از لینک زیر استفاده کنید. اعتبار لینک ۱۵ دقیقه است.\n${link.href}\nاگر این درخواست از شما نیست، آن را نادیده بگیرید.`,
   recoveryHash:tokenHash(token)})
 if(!queued)throw error(503,'ارسال ایمیل در دسترس نیست.')
}
async function transaction(actor,operation){
 const db=await pool.connect()
 try{
   await db.query('BEGIN')
   // Serialize role changes and recheck the actor inside the same transaction.
   await db.query('SELECT pg_advisory_xact_lock(734901,91)')
   if(!await isUserAdmin(actor,db))throw error(403,'دسترسی مدیریت کاربران مجاز نیست.')
   const result=await operation(db)
   await db.query('COMMIT')
   return result
 }catch(cause){await db.query('ROLLBACK');throw cause}
 finally{db.release()}
}
export async function adminUsersRoute({path,method,user,req,res,body,json,fail,rateLimit}){
 if(!path.startsWith('/api/admin/users'))return false
 if(!await isUserAdmin(user.id)){fail(res,403,'دسترسی مدیریت کاربران مجاز نیست.');return true}
 const url=new URL(req.url,'http://localhost')
 if(method==='GET'&&path==='/api/admin/users'){
   const query=(url.searchParams.get('q')||'').trim(),status=url.searchParams.get('status')||'all',role=url.searchParams.get('role')||'all'
   const page=Number(url.searchParams.get('page')||1)
   if(query.length>160||!Number.isInteger(page)||page<1||page>10000||!['all','active','invited','suspended'].includes(status)||!['all','admin','support','user'].includes(role))
     throw error(400,'فیلتر نامعتبر است.')
   const where=`($1='' OR position(lower($1) in lower(u.name||' '||COALESCE(u.email,'')))>0)
    AND ($2='all' OR u.account_status=$2)
    AND ($3='all' OR ($3='admin' AND EXISTS(SELECT 1 FROM user_admins a WHERE a.user_id=u.id))
      OR ($3='support' AND EXISTS(SELECT 1 FROM support_agents a WHERE a.user_id=u.id))
      OR ($3='user' AND NOT EXISTS(SELECT 1 FROM user_admins a WHERE a.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM support_agents a WHERE a.user_id=u.id)))`
   const result=await pool.query(`SELECT ${fields},count(*) OVER()::int AS total FROM users u WHERE ${where}
     ORDER BY u.created_at DESC,u.id LIMIT 25 OFFSET $4`,[query,status,role,(page-1)*25])
   const summary=(await pool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE account_status='active')::int AS active,
    count(*) FILTER(WHERE account_status='suspended')::int AS suspended,count(*) FILTER(WHERE account_status='invited')::int AS invited FROM users`)).rows[0]
   json(res,200,{users:result.rows,total:result.rows[0]?.total||0,page,pageSize:25,summary})
   return true
 }
 if(method==='GET'&&path==='/api/admin/users/audit'){
   const subject=url.searchParams.get('userId')||''
   const rows=await pool.query(`SELECT a.id,a.action,a.subject_id AS "subjectId",a.details,a.created_at AS "createdAt",
     COALESCE(u.name,'حساب حذف‌شده') AS "actorName" FROM admin_user_audit a LEFT JOIN users u ON u.id=a.actor_id
     WHERE ($1='' OR a.subject_id=$1) ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,[subject])
   json(res,200,{entries:rows.rows});return true
 }
 const match=path.match(/^\/api\/admin\/users\/([a-f0-9-]{36})(?:\/(sessions|reset-password|identities))?$/)
 if(method==='GET'&&match){
   const id=match[1],section=match[2]
   const found=await pool.query(`SELECT ${fields} FROM users u WHERE u.id=$1`,[id])
   if(!found.rowCount)throw error(404,'کاربر پیدا نشد.')
   if(section==='sessions'){
     const sessions=await pool.query(`SELECT left(token_hash,16) AS id,created_at AS "createdAt",expires_at AS "expiresAt"
       FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC`,[id])
     json(res,200,{sessions:sessions.rows});return true
   }
   if(section)throw error(405,'این عملیات مجاز نیست.')
   const counts=(await pool.query(`SELECT (SELECT count(*)::int FROM support_tickets WHERE user_id=$1) AS tickets,
      (SELECT count(*)::int FROM risk_setups WHERE user_id=$1) AS "riskSetups"`,[id])).rows[0]
   json(res,200,{user:found.rows[0],counts});return true
 }
 if(await rateLimit(req,res,'admin-users',user.id,80))return true
 if(method==='POST'&&match?.[2]==='reset-password'&&await rateLimit(req,res,'admin-reset',match[1],3))return true
 const input=await body(req)
 try{
   if(path==='/api/admin/users'&&method==='POST'){
     if(!validName(input.name)||!validEmail(input.email))throw error(400,'نام و ایمیل معتبر وارد کنید.')
     const result=await transaction(user.id,async db=>{
       const target=(await db.query(`INSERT INTO users(id,name,email,password_hash,account_status,activation_required)
         VALUES ($1,$2,$3,$4,'invited',true) RETURNING *`,[randomUUID(),input.name.trim(),input.email.trim().toLowerCase(),await hashPassword(randomBytes(32).toString('hex'))])).rows[0]
       await sendAccessLink(db,target,true)
       await audit(db,user.id,target.id,'invite')
       return {id:target.id}
     })
     json(res,201,result);return true
   }
   if(!match)throw error(404,'مسیر پیدا نشد.')
   const [,id,section]=match
   await transaction(user.id,async db=>{
     const target=(await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0]
     if(!target)throw error(404,'کاربر پیدا نشد.')
     if(!Number.isInteger(input.version)||input.version!==target.admin_version)throw error(409,'اطلاعات کاربر تغییر کرده است. صفحه را تازه کنید.')
     const targetAdmin=await isUserAdmin(id,db)
     const removesAdmin=(method==='DELETE'&&!section)||(method==='PATCH'&&(input.isAdmin===false||input.status==='suspended'))
     if(removesAdmin&&targetAdmin){
       if(id===user.id)throw error(400,'حذف، تعلیق یا لغو نقش مدیرِ حساب فعلی مجاز نیست.')
       if((await db.query("SELECT 1 FROM user_admins a JOIN users u ON u.id=a.user_id WHERE a.user_id<>$1 AND u.account_status='active'",[id])).rowCount===0)
         throw error(400,'حداقل یک مدیر فعال باید باقی بماند.')
     }
     if(method==='DELETE'&&!section){
       if(input.confirmEmail!==(target.email||target.id))throw error(400,'ایمیل کاربر را برای تأیید حذف وارد کنید.')
       await audit(db,user.id,id,'delete',{email:target.email})
       await db.query('DELETE FROM support_messages WHERE author_id=$1',[id])
       await db.query('DELETE FROM social_auth_flows WHERE link_user=$1',[id])
       await db.query('DELETE FROM pending_registrations WHERE lower(email)=$1',[target.email])
       await db.query('DELETE FROM users WHERE id=$1',[id])
       return
     }
     if(method==='DELETE'&&section==='sessions'){
       if(input.sessionId!==undefined&&!/^[a-f0-9]{16}$/.test(input.sessionId))throw error(400,'شناسه نشست معتبر نیست.')
       await db.query("DELETE FROM sessions WHERE user_id=$1 AND ($2::text IS NULL OR left(token_hash,16)=$2)",[id,input.sessionId??null])
       await audit(db,user.id,id,'revoke_sessions')
     }else if(method==='POST'&&section==='reset-password'){
       if(!target.email)throw error(400,'این حساب ایمیلی ثبت نکرده است.')
       if(target.account_status==='suspended')throw error(400,'برای حساب تعلیق‌شده ایمیل بازیابی ارسال نمی‌شود.')
       await sendAccessLink(db,target,target.account_status==='invited')
       await audit(db,user.id,id,'send_access_link')
     }else if(method==='DELETE'&&section==='identities'){
       if(!['google','telegram'].includes(input.provider))throw error(400,'روش ورود نامعتبر است.')
       if(!target.password_hash.startsWith('scrypt$'))throw error(400,'ابتدا ایمیل حساب را تأیید و با لینک بازیابی، رمز عبور تنظیم کنید.')
       await db.query('DELETE FROM social_identities WHERE user_id=$1 AND provider=$2',[id,input.provider])
       await db.query('DELETE FROM sessions WHERE user_id=$1',[id])
       await audit(db,user.id,id,'unlink_identity',{provider:input.provider})
     }else if(method==='PATCH'&&!section){
       if(!validName(input.name)||!(input.email===null||input.email===''||validEmail(input.email))||!['active','invited','suspended'].includes(input.status)
          ||typeof input.isAdmin!=='boolean'||typeof input.isSupportAgent!=='boolean')throw error(400,'اطلاعات کاربر معتبر نیست.')
       const email=typeof input.email==='string'&&input.email.trim()?input.email.trim().toLowerCase():null,changedEmail=email!==target.email
       if(changedEmail&&!email)throw error(400,'حذف ایمیل ثبت‌شده از این فرم مجاز نیست.')
       if(id===user.id&&changedEmail)throw error(400,'ایمیل مدیر فعلی را از این فرم تغییر ندهید.')
       if(target.activation_required&&input.status==='active')throw error(400,'فعال‌سازی حساب دعوت‌شده با تأیید ایمیل انجام می‌شود.')
       if(input.status==='invited'&&!target.activation_required&&!changedEmail)throw error(400,'برای دعوت دوباره از ارسال لینک استفاده کنید.')
       const status=changedEmail&&input.status!=='suspended'?'invited':input.status
       if(input.isAdmin&&status!=='active')throw error(400,'مدیر باید حساب فعال داشته باشد.')
       await db.query(`UPDATE users SET name=$2,email=$3,account_status=$4,email_verified_at=CASE WHEN $5 THEN NULL ELSE email_verified_at END,activation_required=CASE WHEN $5 THEN true ELSE activation_required END,
         updated_at=now() WHERE id=$1`,[id,input.name.trim(),email,status,changedEmail])
       for(const [table,enabled] of [['user_admins',input.isAdmin],['support_agents',input.isSupportAgent]]){
         if(enabled)await db.query(`INSERT INTO ${table}(user_id) VALUES($1) ON CONFLICT DO NOTHING`,[id])
         else await db.query(`DELETE FROM ${table} WHERE user_id=$1`,[id])
       }
       if(changedEmail||status!==target.account_status||targetAdmin!==input.isAdmin){
         await db.query('DELETE FROM sessions WHERE user_id=$1',[id])
         await db.query('DELETE FROM social_auth_flows WHERE link_user=$1',[id])
         await db.query('DELETE FROM password_recovery WHERE user_id=$1',[id])
       }
       if(changedEmail&&status!=='suspended')await sendAccessLink(db,{...target,email},true)
       await audit(db,user.id,id,'update',{status,isAdmin:input.isAdmin,isSupportAgent:input.isSupportAgent,emailChanged:changedEmail})
     }else throw error(405,'این عملیات مجاز نیست.')
     await db.query('UPDATE users SET admin_version=admin_version+1 WHERE id=$1',[id])
   })
   json(res,200,{ok:true});return true
 }catch(cause){
   if(cause.code==='23505'){fail(res,409,'این ایمیل یا روش ورود قبلاً ثبت شده است.');return true}
   throw cause
 }
}
