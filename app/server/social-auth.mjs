import {exchangeGoogleCode} from './google-code.mjs'
import {createGoogleKeyResolver} from './google-jwks.mjs'
import {verifyTelegramWidget,telegramWidgetPage} from './telegram-widget.mjs'
import {responseSecurityHeaders} from './security.mjs'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {createRemoteJWKSet,jwtVerify} from 'jose'
import {pool} from './db.mjs'
import {tokenHash} from './auth.mjs'
import {mailAddress,mailConfig} from './mail.mjs'
import {startRegistration,verificationEnabled} from './registration.mjs'

const providers={
  google:{
    issuer:'https://accounts.google.com',auth:'https://accounts.google.com/o/oauth2/v2/auth',
    token:'https://oauth2.googleapis.com/token',jwks:'https://www.googleapis.com/oauth2/v3/certs',scope:'openid profile email',
  },
  telegram:{
    issuer:'https://oauth.telegram.org',auth:'https://oauth.telegram.org/auth',token:'https://oauth.telegram.org/token',
    jwks:'https://oauth.telegram.org/.well-known/jwks.json',scope:'openid profile',basic:true,
  },
}
const keys=Object.fromEntries(Object.entries(providers).map(([name,provider])=>[name,name==='google'?createGoogleKeyResolver():createRemoteJWKSet(new URL(provider.jwks))]))
const random=()=>randomBytes(32).toString('base64url')
const validTicket=value=>typeof value==='string'&&/^[\w-]{43}$/.test(value)
const errorRedirect='/auth?social=failed'
const cookie=(name,value,age)=>name+'='+value+'; HttpOnly; SameSite=Lax; Path=/api/auth/social; Max-Age='+age+
  (process.env.NODE_ENV==='production'&&new URL(process.env.APP_PUBLIC_URL).protocol==='https:'?'; Secure':'')
const emailFrom=value=>typeof value==='string'?value.trim().toLowerCase():''
const usableEmail=email=>email.length<=160&&mailAddress(email)
const nameFrom=value=>typeof value==='string'&&value.trim().length>=2?value.trim().slice(0,80):'کاربر تریدر شو'

function config(name){
  const provider=providers[name]
  if(!provider||!Object.hasOwn(providers,name))return null
  const prefix=name.toUpperCase()+'_OIDC_'
  const clientId=process.env[prefix+'CLIENT_ID'], secret=process.env[prefix+'CLIENT_SECRET']
  const widget=name==='telegram'&&!clientId&&/^\d+:[\w-]{30,}$/.test(process.env.TELEGRAM_BOT_TOKEN||'')&&/^[A-Za-z0-9_]{5,32}$/.test(process.env.TELEGRAM_BOT_USERNAME||'')
  if((!widget&&(!clientId||!secret))||!process.env.APP_PUBLIC_URL)return null
  const origin=new URL(process.env.APP_PUBLIC_URL)
  if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('Invalid OIDC origin')
  return {...provider,widget,clientId,secret,callback:new URL('/api/auth/social/'+name+'/callback',origin).href}
}

export async function migrateSocialAuth(client){
  await client.query(`CREATE TABLE IF NOT EXISTS social_identities (
    provider text NOT NULL CHECK(provider IN ('google','telegram')), subject text NOT NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(provider,subject), UNIQUE(user_id,provider)
  );
  CREATE TABLE IF NOT EXISTS social_auth_flows (
    ticket text PRIMARY KEY, provider text NOT NULL, state_hash text NOT NULL,
    verifier text NOT NULL, nonce text NOT NULL, link_user text, session_hash text,
    expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
  );
  CREATE TABLE IF NOT EXISTS social_registrations (
    ticket text PRIMARY KEY, provider text NOT NULL, subject text NOT NULL,
    name text NOT NULL, email text NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes'
  );`)
}


export async function telegramAccount(identity){
  const db=await pool.connect()
  try{
    await db.query('BEGIN')
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['telegram:'+identity.subject])
    let account=(await db.query("SELECT u.* FROM social_identities i JOIN users u ON u.id=i.user_id WHERE i.provider='telegram' AND i.subject=$1",[identity.subject])).rows[0]
    if(!account){
      account=(await db.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,NULL,'social-only') RETURNING *",[randomUUID(),identity.name])).rows[0]
      await db.query("INSERT INTO social_identities(provider,subject,user_id) VALUES('telegram',$1,$2)",[identity.subject,account.id])
    }
    if(account.account_status!=='active')throw Error('Account unavailable')
    await db.query('COMMIT')
    return account
  }catch(cause){await db.query('ROLLBACK');throw cause}
  finally{db.release()}
}

async function exchange(provider,oidc,flow,code){
  if(provider==='google'){const payload=await exchangeGoogleCode({clientId:oidc.clientId,secret:oidc.secret,callback:oidc.callback,code,verifier:flow.verifier,nonce:flow.nonce,keyResolver:keys.google});return {subject:payload.sub,name:nameFrom(payload.name),email:payload.email_verified===true?emailFrom(payload.email):''}}
  const form=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:oidc.callback,
    client_id:oidc.clientId,code_verifier:flow.verifier})
  const headers={'Content-Type':'application/x-www-form-urlencoded'}
  if(oidc.basic)headers.Authorization='Basic '+Buffer.from(oidc.clientId+':'+oidc.secret).toString('base64')
  else form.set('client_secret',oidc.secret)
  const response=await fetch(oidc.token,{method:'POST',headers,body:form,redirect:'error',signal:AbortSignal.timeout(8000)})
  if(!response.ok)throw Error('Token exchange failed')
  const {id_token:token}=await response.json()
  const {payload}=await jwtVerify(token,keys[provider],{
    issuer:provider==='google'?[oidc.issuer,'accounts.google.com']:oidc.issuer,
    audience:oidc.clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub'],maxTokenAge:'10 minutes',
  })
  if((provider==='google'||payload.nonce!==undefined)&&payload.nonce!==flow.nonce)throw Error('Invalid nonce')
  if((Array.isArray(payload.aud)&&payload.aud.length>1||payload.azp!==undefined)&&payload.azp!==oidc.clientId)throw Error('Invalid authorized party')
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>255)throw Error('Invalid subject')
  return {subject:payload.sub,name:nameFrom(payload.name),email:payload.email_verified===true?emailFrom(payload.email):''}
}

export async function socialRoute({path,method,req,res,body,json,fail,rateLimit,cookies,sessionUser,createSession,redirect}){
  if(!path.startsWith('/api/auth/social/'))return false
  if(path==='/api/auth/social/providers'&&method==='GET'){
    const available=Object.keys(providers).filter(name=>config(name))
    const user=available.length&&await sessionUser(req)
    const linked=user?(await pool.query('SELECT provider FROM social_identities WHERE user_id=$1',[user.id])).rows.map(row=>row.provider):[]
    json(res,200,{providers:available,linked})
    return true
  }
  if(path==='/api/auth/social/register'&&['GET','POST'].includes(method)){
    const ticket=cookies(req).tradersho_social_registration
    const registration=validTicket(ticket)&&(await pool.query('SELECT * FROM social_registrations WHERE ticket=$1 AND expires_at>now()',[tokenHash(ticket)])).rows[0]
    if(!registration||!verificationEnabled()||!mailConfig()){fail(res,400,'درخواست ورود منقضی شده است. دوباره وارد شوید.');return true}
    if(method==='GET'){json(res,200,{email:registration.email});return true}
    const input=await body(req)
    const email=emailFrom(input.email)
    if(!usableEmail(email)){fail(res,400,'ایمیل معتبر وارد کنید.');return true}
    if(await rateLimit(req,res,'social-registration-ip','',15)||await rateLimit(req,res,'signup',email,5))return true
    const data=await startRegistration({name:registration.name,email,passwordHash:'social-only',
      social:{provider:registration.provider,subject:registration.subject,ticket:tokenHash(ticket)}})
    json(res,202,data,{'Set-Cookie':cookie('tradersho_social_registration','',0)})
    return true
  }
  const match=path.match(/^\/api\/auth\/social\/(google|telegram)\/(start|callback)$/)
  if(!match||(method!=='GET'&&method!=='POST')){fail(res,404,'مسیر پیدا نشد.');return true}
  const [,provider,action]=match,oidc=config(provider)
  if(!oidc){fail(res,404,'این روش ورود فعال نیست.');return true}
  const url=new URL(req.url,'http://localhost')
  if(action==='start'){
    const link=method==='POST'
    if(await rateLimit(req,res,'social-start','',40))return true
    const user=link&&await sessionUser(req)
    if(link&&!user){fail(res,401,'برای اتصال ابتدا وارد حساب شوید.');return true}
    const ticket=random(),state=random(),verifier=random(),nonce=random()
    await pool.query('DELETE FROM social_auth_flows WHERE expires_at<=now()')
    await pool.query(`INSERT INTO social_auth_flows(ticket,provider,state_hash,verifier,nonce,link_user,session_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,[tokenHash(ticket),provider,tokenHash(state),verifier,nonce,
      user?user.id:null,user?tokenHash(cookies(req).tradersho_session):null])
    if(oidc.widget){
      const callback=new URL(oidc.callback)
      callback.searchParams.set('state',state)
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
        ...responseSecurityHeaders,'Referrer-Policy':'no-referrer',
        'Set-Cookie':cookie('tradersho_social_flow',ticket,600)})
      res.end(telegramWidgetPage(process.env.TELEGRAM_BOT_USERNAME,callback.href))
      return true
    }
    const target=new URL(oidc.auth)
    target.search=new URLSearchParams({client_id:oidc.clientId,redirect_uri:oidc.callback,response_type:'code',
      scope:oidc.scope,state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method:'S256'}).toString()
    redirect(target.href,[cookie('tradersho_social_flow',ticket,600)])
    return true
  }
  if(method!=='GET'){fail(res,405,'این عملیات مجاز نیست.');return true}
  const ticket=cookies(req).tradersho_social_flow,state=url.searchParams.get('state'),code=url.searchParams.get('code')
  const headers=[cookie('tradersho_social_flow','',0)]
  if(!validTicket(ticket)||!validTicket(state)){redirect(errorRedirect,headers);return true}
  const flow=(await pool.query(`DELETE FROM social_auth_flows WHERE ticket=$1 AND provider=$2 AND state_hash=$3
    AND expires_at>now() RETURNING *`,[tokenHash(ticket),provider,tokenHash(state)])).rows[0]
  if(!flow){redirect(errorRedirect,headers);return true}
  const failed=flow.link_user?'/panel/account?social=failed':errorRedirect
  if(!oidc.widget&&(!code||code.length>4096)){redirect(failed,headers);return true}
  try{
    const identity=oidc.widget?verifyTelegramWidget(url.searchParams,process.env.TELEGRAM_BOT_TOKEN):await exchange(provider,oidc,flow,code)
    if(flow.link_user){
      const inserted=await pool.query(`INSERT INTO social_identities(provider,subject,user_id)
        SELECT $1,$2,user_id FROM sessions WHERE user_id=$3 AND token_hash=$4 AND expires_at>now() AND EXISTS(SELECT 1 FROM users u WHERE u.id=$3 AND u.account_status='active')
        ON CONFLICT DO NOTHING RETURNING user_id`,[provider,identity.subject,flow.link_user,flow.session_hash])
      const existing=inserted.rowCount||await pool.query(`SELECT 1 FROM social_identities i JOIN sessions s ON s.user_id=i.user_id
        WHERE i.provider=$1 AND i.subject=$2 AND i.user_id=$3 AND s.token_hash=$4 AND s.expires_at>now()`,[provider,identity.subject,flow.link_user,flow.session_hash])
      redirect(inserted.rowCount||existing.rowCount?'/panel/account?social=linked':failed,headers)
      return true
    }
    const {rows:[account]}=await pool.query('SELECT i.user_id,u.account_status FROM social_identities i JOIN users u ON u.id=i.user_id WHERE provider=$1 AND subject=$2',[provider,identity.subject])
    if(account&&account.account_status!=='active'){redirect(errorRedirect,headers);return true}
    if(account){redirect('/auth',[...headers,await createSession(req,account.user_id)]);return true}
    if(provider==='telegram'){
      const created=await telegramAccount(identity)
      redirect('/auth',[...headers,await createSession(req,created.id)])
      return true
    }
    if(!verificationEnabled()||!mailConfig()){redirect(errorRedirect,headers);return true}
    const registration=random()
    await pool.query('DELETE FROM social_registrations WHERE expires_at<=now()')
    await pool.query('INSERT INTO social_registrations(ticket,provider,subject,name,email) VALUES ($1,$2,$3,$4,$5)',
      [tokenHash(registration),provider,identity.subject,identity.name,usableEmail(identity.email)?identity.email:''])
    redirect('/auth?social=register',[...headers,cookie('tradersho_social_registration',registration,900)])
  }catch(error){
    console.error(JSON.stringify({event:'social_auth_failed',provider,code:['GOOGLE_KEYS_UNAVAILABLE','ERR_JWS_SIGNATURE_VERIFICATION_FAILED','ERR_JWT_EXPIRED','ERR_JWT_CLAIM_VALIDATION_FAILED','ERR_JWKS_NO_MATCHING_KEY'].includes(error?.code)?error.code:'SOCIAL_AUTH_VALIDATION_FAILED'}))
    redirect(failed,headers)
  }
  return true
}
