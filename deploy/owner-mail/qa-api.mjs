import pg from '/app/node_modules/pg/lib/index.js';import {hashPassword,tokenHash} from '/app/server/auth.mjs';import {randomBytes,randomUUID} from 'node:crypto';import {totpAt} from '/owner/owner-security.mjs';import assert from 'node:assert/strict';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});const ids=[];const base='http://127.0.0.1:3002/owner-mail/api/';
try{const password=randomBytes(24).toString('hex');let token;
for(const email of [process.env.OWNER_EMAIL,'other-'+randomUUID()+'@example.invalid']){const id=ids.length===0?process.env.OWNER_USER_ID:randomUUID(),t=randomBytes(32).toString('hex');ids.push(id);await pool.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'QA',email,await hashPassword(password)]);await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[tokenHash(t),id]);if(!token)token=t;else{const r=await fetch(base+'status',{headers:{cookie:'tradersho_session='+t}});assert.equal(r.status,403)}}
assert.equal((await fetch(base+'status')).status,401);
const headers={cookie:'tradersho_session='+token,Origin:'https://my.tradersho.com','Content-Type':'application/json'};
const post=async(action,data)=>{const r=await fetch(base+action,{method:'POST',headers,body:JSON.stringify({password,...data})});return {status:r.status,data:await r.json()}};
assert.equal((await fetch(base+'enroll',{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body:'{}'})).status,403);
assert.equal((await post('enroll',{password:'wrong'})).status,403);
const enrolled=await post('enroll',{});assert.equal(enrolled.status,200);const secret=enrolled.data.secret;const c=Math.floor(Date.now()/30000);const code=totpAt(secret,c-1);
assert.equal((await post('confirm',{otp:code})).status,200);assert.equal((await post('list',{otp:code})).status,403);
const listed=await post('list',{otp:totpAt(secret,c)});assert.equal(listed.status,200);assert.ok(Array.isArray(listed.data.accounts));assert.equal((await post('list',{otp:totpAt(secret,c)})).status,403);console.log('Owner scope, session, origin, password, MFA enrollment, listing and OTP replay checks passed');
}finally{for(const id of ids){await pool.query('DELETE FROM mail_owner_audit WHERE user_id=$1',[id]);await pool.query('DELETE FROM mail_owners WHERE user_id=$1',[id]);await pool.query('DELETE FROM users WHERE id=$1',[id])}await pool.end()}
