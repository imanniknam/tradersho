import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {exportJWK,generateKeyPair,SignJWT} from 'jose'
import {tokenHash} from '../server/auth.mjs'

if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
Object.assign(process.env,{APP_PUBLIC_URL:'https://panel.example.test',
 SIGNUP_EMAIL_VERIFICATION:'1',MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'qa-only',MAIL_FROM:'sender@example.test',MAIL_REPLY_TO:'support@example.test',MAIL_ENCRYPTION_KEY:'ab'.repeat(32),
 GOOGLE_OIDC_CLIENT_ID:'qa-google',GOOGLE_OIDC_CLIENT_SECRET:'qa-only',
 TELEGRAM_OIDC_CLIENT_ID:'qa-telegram',TELEGRAM_OIDC_CLIENT_SECRET:'qa-only'})
const {pool,migrate}=await import('../server/db.mjs')
const {socialRoute}=await import('../server/social-auth.mjs')
await migrate()
const {publicKey,privateKey}=await generateKeyPair('RS256')
const jwk={...await exportJWK(publicKey),kid:'qa',alg:'RS256',use:'sig'}
const keyDir=await mkdtemp(join(tmpdir(),'social-google-keys-'));process.env.GOOGLE_JWKS_FILE=join(keyDir,'jwks.json')
await writeFile(process.env.GOOGLE_JWKS_FILE,JSON.stringify({source:'https://www.googleapis.com/oauth2/v3/certs',fetchedAt:Date.now(),expiresAt:Date.now()+3600000,keys:[jwk]}))
const id=randomUUID(),session='a'.repeat(64),newSubject=randomUUID(),newEmail='google-signup-'+randomUUID()+'@example.test',sessionIds=new Set([id]);let registrationId
let claims={}
globalThis.fetch=async (request,options)=>{
 const url=new URL(request)
 if(url.hostname==='www.googleapis.com')return new Response('upstream blocked',{status:403})
 if(url.pathname.endsWith('jwks.json'))return Response.json({keys:[jwk]})
 assert.ok(['oauth2.googleapis.com','oauth.telegram.org'].includes(url.hostname))
 assert.equal(options.body.get('code'),'qa-code')
 assert.match(options.body.get('code_verifier'),/^[\w-]{43}$/)
 const token=await new SignJWT({nonce:claims.nonce,email:claims.email,email_verified:claims.emailVerified,name:'Google signup QA'}).setProtectedHeader({alg:'RS256',kid:'qa'})
   .setIssuer(claims.issuer).setAudience(claims.audience).setSubject(claims.subject).setIssuedAt().setExpirationTime('5m').sign(privateKey)
 return Response.json({id_token:token})
}
const call=async(path,{method='GET',query='',cookies={},user=null,input={}}={})=>{
 let result
 await socialRoute({path:'/api/auth/social/'+path,method,req:{url:'/api/auth/social/'+path+query},res:{},
  json:(_,status,body)=>{result={status,body}},fail:(_,status,error)=>{result={status,error}},
  body:async()=>input,cookies:()=>cookies,sessionUser:async()=>user,rateLimit:async()=>false,
  createSession:async(_,userId)=>{assert.ok(sessionIds.has(userId));return 'qa_session=created'},
  redirect:(location,headers)=>{result={location,headers}}})
 return result
}
const start=async (provider,link=false)=>{
 const result=await call(provider+'/start',link?{method:'POST',user:{id},cookies:{tradersho_session:session}}:{})
 const authorization=new URL(result.location)
 const ticket=result.headers[0].match(/^tradersho_social_flow=([^;]+)/)[1]
 const state=authorization.searchParams.get('state')
 assert.equal(authorization.searchParams.get('code_challenge_method'),'S256')
 assert.match(result.headers[0],/HttpOnly; SameSite=Lax/)
 claims={issuer:provider==='google'?'https://accounts.google.com':'https://oauth.telegram.org',
   subject:id,audience:'qa-'+provider,nonce:authorization.searchParams.get('nonce')}
 return (providedState=state)=>call(provider+'/callback',{query:'?code=qa-code&state='+providedState,cookies:{tradersho_social_flow:ticket}})
}
try{
 await pool.query("INSERT INTO users(id,name,email,password_hash) VALUES ($1,'Social QA',$2,'social-only')",[id,id+'@example.test'])
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",[tokenHash(session),id])
 for(const provider of ['google','telegram']){
   const link=await start(provider,true)
   assert.equal((await link('a'.repeat(43))).location,'/auth?social=failed')
   assert.equal((await link()).location,'/panel/account?social=linked')
   assert.equal((await link()).location,'/auth?social=failed')
   const signIn=await start(provider)
   assert.ok((await signIn()).headers.includes('qa_session=created'))
   const forged=await start(provider)
   claims.audience='another-application'
   assert.equal((await forged()).location,'/auth?social=failed')
 }
 // Exercise a new Google account through signed callback, email confirmation and the next login.
 const newFlow=await start('google');claims.subject=newSubject;claims.email=newEmail;claims.emailVerified=true
 const pending=await newFlow();assert.equal(pending.location,'/auth?social=register')
 const ticket=pending.headers.find(v=>v.startsWith('tradersho_social_registration=')).match(/^tradersho_social_registration=([^;]+)/)[1]
 assert.equal((await call('register',{cookies:{tradersho_social_registration:ticket}})).body.email,newEmail)
 const started=await call('register',{method:'POST',cookies:{tradersho_social_registration:ticket},input:{email:newEmail}});assert.equal(started.status,202)
 const verificationToken=started.body.verificationToken;registrationId=tokenHash(verificationToken)
 assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1',[newEmail])).rowCount,0)
 const {openMail,mailConfig}=await import('../server/mail.mjs'),{verifyRegistration}=await import('../server/registration.mjs')
 const job=(await pool.query("SELECT * FROM mail_outbox WHERE registration_id=$1 AND status='pending'",[registrationId])).rows[0]
 const code=openMail(job.payload,mailConfig().key,job.id).text.match(/\b\d{6}\b/)[0]
 let verified
 await verifyRegistration({path:'/api/auth/signup/verify',input:{verificationToken,code},rateLimit:async()=>false,fail:(_,status,error)=>{verified={status,error}},json:(_,status,body)=>{verified={status,body}},login:account=>{verified={status:201,account}}})
 assert.equal(verified.status,201);assert.ok(verified.account.email_verified_at);sessionIds.add(verified.account.id)
 assert.equal((await pool.query("SELECT user_id FROM social_identities WHERE provider='google' AND subject=$1",[newSubject])).rows[0].user_id,verified.account.id)
 const returning=await start('google');claims.subject=newSubject
 assert.ok((await returning()).headers.includes('qa_session=created'))
 const {body}=await call('providers',{user:{id}})
 assert.deepEqual(body.linked.sort(),['google','telegram'])
 console.log('PASS Google cached-key outage: signed callback, new signup, email confirmation and returning session; Telegram linking/login preserved')
}finally{
 if(registrationId){await pool.query('DELETE FROM mail_outbox WHERE registration_id=$1',[registrationId]);await pool.query('DELETE FROM pending_registrations WHERE id=$1',[registrationId])}
 await pool.query('DELETE FROM users WHERE email=$1',[newEmail])
 await pool.query('DELETE FROM social_registrations WHERE subject=$1',[newSubject])
 await rm(keyDir,{recursive:true,force:true})
 await pool.query('DELETE FROM users WHERE id=$1',[id])
 await pool.end()
}
