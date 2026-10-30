import nodemailer from 'nodemailer'
import {tokenHash} from './auth.mjs'
import {randomBytes, createCipheriv, createDecipheriv} from 'node:crypto'

export const mailAddress=v=>typeof v==='string'&&/^[^\s<>@(),;:"\\]+@[^\s<>@(),;:"\\]+\.[^\s<>@(),;:"\\]+$/.test(v)
export function mailConfig(env=process.env) {
  if(env.MAIL_TRANSPORT!=='smtp')return null
  const port=Number(env.SMTP_PORT||587), interval=Number(env.MAIL_INTERVAL_MS||5000)
  if(!env.SMTP_HOST||!mailAddress(env.SMTP_USER)||!env.SMTP_PASSWORD||!mailAddress(env.MAIL_FROM)||!mailAddress(env.MAIL_REPLY_TO)||![465,587].includes(port)||!Number.isInteger(interval)||interval<1000||interval>60000||!/^[a-f0-9]{64}$/i.test(env.MAIL_ENCRYPTION_KEY||''))throw Error('Invalid SMTP configuration')
  const base=new URL(env.APP_PUBLIC_URL)
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw Error('Invalid mail origin')
  return {host:env.SMTP_HOST,port,user:env.SMTP_USER,password:env.SMTP_PASSWORD,from:env.MAIL_FROM,replyTo:env.MAIL_REPLY_TO,key:Buffer.from(env.MAIL_ENCRYPTION_KEY,'hex'),base,interval}
}
export function sealMail(payload,key,id){
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv)
  cipher.setAAD(Buffer.from(id))
  const data=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()])
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')
}
export function openMail(value,key,id){
  const b=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12))
  cipher.setAAD(Buffer.from(id));cipher.setAuthTag(b.subarray(12,28))
  return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8'))
}
export async function migrateMail(client){
  await client.query(`CREATE TABLE IF NOT EXISTS mail_outbox (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK(purpose IN ('recovery','support_reply')),
    recovery_hash text REFERENCES password_recovery(token_hash) ON DELETE CASCADE,
    message_id text REFERENCES support_messages(id) ON DELETE CASCADE,
    payload text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
    attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
    last_error varchar(40)
  ); CREATE INDEX IF NOT EXISTS mail_outbox_pending ON mail_outbox(next_attempt_at) WHERE status='pending';
  CREATE TABLE IF NOT EXISTS mail_dispatch_clock (id integer PRIMARY KEY CHECK(id=1), next_at timestamptz NOT NULL);
  INSERT INTO mail_dispatch_clock VALUES(1,now()) ON CONFLICT DO NOTHING;`)
}
export async function enqueueMail(client,{id,userId,purpose,to,subject,text,recoveryHash=null,messageId=null}){
  const config=mailConfig()
  if(!config)return false
  if(!mailAddress(to)){console.warn('Mail recipient invalid');return false}
  await client.query(`INSERT INTO mail_outbox(id,user_id,purpose,recovery_hash,message_id,payload,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,now()+CASE WHEN $3='recovery' THEN interval '14 minutes' ELSE interval '24 hours' END)
    ON CONFLICT(id) DO NOTHING`,[id,userId,purpose,recoveryHash,messageId,sealMail({to,subject,text},config.key,id)])
  return true
}
export function supportReplyMail(base,ticketId){
  return {subject:'پاسخ جدید پشتیبانی تریدر شو',text:`کارشناس پشتیبانی به تیکت شما پاسخ داده است.\nبرای مشاهدهٔ پاسخ و ادامهٔ گفتگو وارد پنل شوید:\n${new URL('/panel/support/'+ticketId,base).href}\n\nاین پیام خودکار است؛ لطفاً پاسخ تیکت را در پنل ثبت کنید.`}
}
export function createMailer(config){
  return nodemailer.createTransport({host:config.host,port:config.port,secure:config.port===465,requireTLS:true,
    tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},auth:{user:config.user,pass:config.password},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
    disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false})
}
export function retryMail(error,attempts){return attempts<5&&!(error.responseCode>=500&&error.responseCode<600)&&error.code!=='EAUTH'}

// One database-wide worker, including across overlapping deployments. SMTP acceptance
// is at-least-once: a process crash after acceptance can repeat the stable Message-ID.
export async function dispatchMail(pool,config,transport){
  const client=await pool.connect();let locked=false
  try{
    locked=(await client.query('SELECT pg_try_advisory_lock(734901,32) AS locked')).rows[0].locked
    if(!locked)return false
    await client.query(`DELETE FROM mail_outbox WHERE created_at<now()-interval '7 days';
      UPDATE mail_outbox SET status='failed',payload=NULL,last_error='expired' WHERE status='pending' AND expires_at<=now();`)
    if(!(await client.query('SELECT 1 FROM mail_dispatch_clock WHERE id=1 AND next_at<=now()')).rowCount)return false
    const row=(await client.query(`SELECT o.* FROM mail_outbox o WHERE status='pending' AND next_attempt_at<=now()
      ORDER BY CASE WHEN purpose='recovery' THEN 0 ELSE 1 END,created_at,id LIMIT 1`)).rows[0]
    if(!row)return false
    // Password changes invalidate recovery before sending, not only before redemption.
    if(row.recovery_hash&&!(await client.query(`SELECT 1 FROM password_recovery r JOIN users u ON u.id=r.user_id
      WHERE r.token_hash=$1 AND r.expires_at>now() AND r.password_version=$2`,[row.recovery_hash,
      tokenHash((await client.query('SELECT password_hash FROM users WHERE id=$1',[row.user_id])).rows[0]?.password_hash||'')])).rowCount){
      await client.query('DELETE FROM password_recovery WHERE token_hash=$1',[row.recovery_hash]);return false
    }
    await client.query("UPDATE mail_dispatch_clock SET next_at=now()+($1::int*interval '1 millisecond') WHERE id=1",[config.interval])
    try{
      const payload=openMail(row.payload,config.key,row.id)
      if(!mailAddress(payload.to))throw Object.assign(Error('Invalid recipient'),{responseCode:550})
      const result=await transport.sendMail({...payload,from:{name:'Tradersho | تریدر شو',address:config.from},replyTo:config.replyTo,
        to:{address:payload.to},envelope:{from:config.from,to:[payload.to]},
        messageId:`<${row.id}@${config.from.split('@')[1]}>`})
      if(!result.accepted?.length)throw Object.assign(Error('Recipient rejected'),{responseCode:550})
      await client.query("UPDATE mail_outbox SET status='sent',payload=NULL,sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[row.id])
    }catch(error){
      const attempts=row.attempts+1,retry=retryMail(error,attempts)
      await client.query(`UPDATE mail_outbox SET attempts=$2,status=$3,payload=CASE WHEN $3='failed' THEN NULL ELSE payload END,
        last_error=$4,next_attempt_at=now()+($5::int*interval '1 second') WHERE id=$1`,[row.id,attempts,retry?'pending':'failed',retry?'temporary_delivery_failure':'delivery_failed',Math.min(600,30*2**(attempts-1))])
      console.warn('Mail delivery '+(retry?'retry scheduled':'failed')+' ('+row.purpose+')')
      if(!retry&&row.recovery_hash)await client.query('DELETE FROM password_recovery WHERE token_hash=$1',[row.recovery_hash])
    }
    return true
  }finally{try{if(locked)await client.query('SELECT pg_advisory_unlock(734901,32)')}finally{client.release()}}
}
export function startMailWorker(pool){
  const config=mailConfig();if(!config)return ()=>{}
  const transport=createMailer(config);let stopped=false,running=false,timer
  const tick=async()=>{
    if(stopped||running)return
    running=true
    try{await dispatchMail(pool,config,transport)}catch{console.warn('Mail worker unavailable')}
    finally{running=false;if(!stopped){timer=setTimeout(tick,1000);timer.unref()}}
  }
  void tick()
  return async()=>{stopped=true;clearTimeout(timer);while(running)await new Promise(resolve=>setTimeout(resolve,50));transport.close()}
}
