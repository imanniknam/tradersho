// Real owner service + restricted DB role; fake local broker, never a real mailbox.
import assert from 'node:assert/strict'
import pg from 'pg'
import {mkdtemp,readFile,writeFile,copyFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import http from 'node:http'
import {createHmac,randomBytes,randomUUID} from 'node:crypto'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const {pool}=await import('../server/db.mjs'),{hashPassword,tokenHash}=await import('../server/auth.mjs')
const {totpAt}=await import('../../deploy/owner-mail/owner-security.mjs')
const folder=await mkdtemp(join(tmpdir(),'tradersho-owner-qa-')),id=randomUUID(),other=randomUUID(),password='آزمون-'+randomBytes(16).toString('hex'),key=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex'),foreign=randomBytes(32).toString('hex')
const savedOwner=(await pool.query('SELECT user_id FROM owner_mail.authorized_owner')).rows[0]?.user_id
const socket=join(folder,'broker.sock'),base='http://127.0.0.1:5184/owner-mail/api/'
let child,broker,ownerPool,errors=''
try{
 for(const uid of [id,other])await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[uid,'Owner QA',uid+'@example.test',await hashPassword(password)])
 for(const [uid,t] of [[id,token],[other,foreign]])await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(t),uid])
 await pool.query('INSERT INTO owner_mail.authorized_owner(singleton,user_id) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET user_id=EXCLUDED.user_id',[id])
 await writeFile(join(folder,'owner-key'),key,{mode:0o600})
 let source=await readFile(new URL('../../deploy/owner-mail/server.mjs',import.meta.url),'utf8')
 source=source.replace("'/app/node_modules/pg/lib/index.js'",JSON.stringify(fileURLToPath(new URL('../node_modules/pg/lib/index.js',import.meta.url)))).replace("'/app/server/auth.mjs'",JSON.stringify(fileURLToPath(new URL('../server/auth.mjs',import.meta.url)))).replace("'/run/secrets/owner-key'",JSON.stringify(join(folder,'owner-key'))).replace("'/run/broker/control.sock'",JSON.stringify(socket)).replace("server.listen(3002,'0.0.0.0')","server.listen(5184,'127.0.0.1')")
 await writeFile(join(folder,'server.mjs'),source)
 for(const name of ['owner-security.mjs','index.html'])await copyFile(new URL('../../deploy/owner-mail/'+name,import.meta.url),join(folder,name))
 broker=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part
  assert.equal(req.headers['x-signature'],createHmac('sha256',key).update(raw).digest('hex'));assert.equal(JSON.parse(raw).action,'list')
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({accounts:[]}))})
 broker.listen(socket);await once(broker,'listening')
 const url=new URL(process.env.DATABASE_URL);url.username='tradersho_owner_mail';url.password='qa-ci-roles-only'
 ownerPool=new pg.Pool({connectionString:url.href})
 assert.deepEqual((await ownerPool.query('SELECT id FROM owner_mail.owner_identity')).rows.map(r=>r.id),[id])
 assert.deepEqual((await ownerPool.query('SELECT user_id FROM owner_mail.owner_sessions')).rows.map(r=>r.user_id),[id])
 await assert.rejects(ownerPool.query('SELECT password_hash FROM public.users'),e=>e.code==='42501')
 child=spawn(process.execPath,[join(folder,'server.mjs')],{env:{...process.env,DATABASE_URL:url.href,OWNER_USER_ID:id,OWNER_EMAIL:id+'@example.test'},stdio:['ignore','pipe','pipe']})
 child.stderr.on('data',c=>errors+=c)
 const headers={cookie:'__Host-tradersho_session='+token,Origin:'https://my.tradersho.com','Content-Type':'application/json'}
 const post=async(action,data)=>{const r=await fetch(base+action,{method:'POST',headers,body:JSON.stringify({password,...data})});return {status:r.status,body:await r.json()}}
 let ready=false
 for(let n=0;n<80;n++){try{if((await fetch(base+'status')).status===401){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50))}
 assert.ok(ready,errors)
 assert.equal((await fetch(base+'status',{headers:{cookie:'tradersho_session='+token}})).status,401)
 assert.equal((await fetch(base+'status',{headers:{cookie:'__Host-tradersho_session='+foreign}})).status,403)
 assert.equal((await fetch(base+'status',{headers})).status,200)
 await pool.query("UPDATE users SET account_status='suspended' WHERE id=$1",[id])
 assert.equal((await fetch(base+'status',{headers})).status,403)
 await pool.query("UPDATE users SET account_status='active' WHERE id=$1",[id])
 assert.equal((await fetch(base+'enroll',{method:'POST',headers:{...headers,Origin:'https://invalid.example'},body:'{}'})).status,403)
 assert.equal((await post('enroll',{password:'wrong'})).status,403)
 const enroll=await post('enroll',{});assert.equal(enroll.status,200)
 const secret=enroll.body.secret,counter=Math.floor(Date.now()/30000)
 const state=(await pool.query('SELECT pending FROM owner_mail.mail_owners WHERE user_id=$1',[id])).rows[0]
 assert.ok(!state.pending.includes(secret))
 assert.equal((await post('confirm',{otp:totpAt(secret,counter-1)})).status,200)
 assert.equal((await post('list',{otp:totpAt(secret,counter-1)})).status,403)
 assert.equal((await post('list',{otp:totpAt(secret,counter)})).status,200)
 assert.equal((await post('list',{otp:totpAt(secret,counter)})).status,403)
 assert.equal((await pool.query('SELECT 1 FROM owner_mail.mail_owner_audit WHERE user_id=$1 AND success',[id])).rowCount,1)
 console.log('PASS owner mail local: restricted real service, __Host-only cookie, owner/suspension/origin/password gates, private MFA, replay, signed fake broker and audit; no real mailbox')
}finally{
 if(child&&child.exitCode===null){const done=once(child,'exit');child.kill();await done}
 if(ownerPool)await ownerPool.end()
 if(broker)await new Promise(r=>broker.close(r))
 await pool.query('DELETE FROM owner_mail.mail_owner_audit WHERE user_id=ANY($1::text[])',[[id,other]])
 await pool.query('DELETE FROM owner_mail.mail_owners WHERE user_id=ANY($1::text[])',[[id,other]])
 if(savedOwner)await pool.query('UPDATE owner_mail.authorized_owner SET user_id=$1',[savedOwner]);else await pool.query('DELETE FROM owner_mail.authorized_owner')
 await pool.query('DELETE FROM users WHERE id=ANY($1::text[])',[[id,other]])
 await pool.end();await rm(folder,{recursive:true,force:true})
}
