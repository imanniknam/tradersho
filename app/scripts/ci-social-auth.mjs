import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {exportJWK,generateKeyPair,SignJWT} from 'jose'
import {tokenHash} from '../server/auth.mjs'

if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
Object.assign(process.env,{APP_PUBLIC_URL:'https://panel.example.test',
 GOOGLE_OIDC_CLIENT_ID:'qa-google',GOOGLE_OIDC_CLIENT_SECRET:'qa-only',
 TELEGRAM_OIDC_CLIENT_ID:'qa-telegram',TELEGRAM_OIDC_CLIENT_SECRET:'qa-only'})
const {pool,migrate}=await import('../server/db.mjs')
const {socialRoute}=await import('../server/social-auth.mjs')
await migrate()
const {publicKey,privateKey}=await generateKeyPair('RS256')
const jwk={...await exportJWK(publicKey),kid:'qa',alg:'RS256',use:'sig'}
const id=randomUUID(),session='a'.repeat(64)
let claims={}
globalThis.fetch=async (request,options)=>{
 const url=new URL(request)
 if(url.pathname.endsWith('certs')||url.pathname.endsWith('jwks.json'))return Response.json({keys:[jwk]})
 assert.ok(['oauth2.googleapis.com','oauth.telegram.org'].includes(url.hostname))
 assert.equal(options.body.get('code'),'qa-code')
 assert.match(options.body.get('code_verifier'),/^[\w-]{43}$/)
 const token=await new SignJWT({nonce:claims.nonce}).setProtectedHeader({alg:'RS256',kid:'qa'})
   .setIssuer(claims.issuer).setAudience(claims.audience).setSubject(claims.subject).setIssuedAt().setExpirationTime('5m').sign(privateKey)
 return Response.json({id_token:token})
}
const call=async(path,{method='GET',query='',cookies={},user=null}={})=>{
 let result
 await socialRoute({path:'/api/auth/social/'+path,method,req:{url:'/api/auth/social/'+path+query},res:{},
  json:(_,status,body)=>{result={status,body}},fail:(_,status,error)=>{result={status,error}},
  cookies:()=>cookies,sessionUser:async()=>user,rateLimit:async()=>false,
  createSession:async(_,userId)=>{assert.equal(userId,id);return 'qa_session=created'},
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
 const {body}=await call('providers',{user:{id}})
 assert.deepEqual(body.linked.sort(),['google','telegram'])
 console.log('Google and Telegram simulated OIDC linking and login passed')
}finally{
 await pool.query('DELETE FROM users WHERE id=$1',[id])
 await pool.end()
}
