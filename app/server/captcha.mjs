import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto'
import {pool} from './db.mjs'
import {makeCaptcha} from './captcha-image.mjs'
export const captchaEnabled=()=>process.env.CAPTCHA_MODE==='internal'
const digest=(id,answer)=>createHmac('sha256',process.env.CAPTCHA_SECRET).update(id+':'+answer).digest('hex')
export async function migrateCaptcha(client){await client.query('CREATE TABLE IF NOT EXISTS login_captcha(id text PRIMARY KEY,answer_hash text NOT NULL,expires_at timestamptz NOT NULL); CREATE INDEX IF NOT EXISTS login_captcha_expiry ON login_captcha(expires_at);')}
export async function issueCaptcha(){
 const id=randomUUID(),{answer,png}=makeCaptcha()
 await pool.query('DELETE FROM login_captcha WHERE expires_at<now()')
 await pool.query("INSERT INTO login_captcha VALUES($1,$2,now()+interval '3 minutes')",[id,digest(id,answer)])
 return {enabled:true,id,image:'data:image/png;base64,'+png.toString('base64'),expiresIn:180}
}
export async function verifyCaptcha(id,answer){
 if(!captchaEnabled())return true
 if(typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))return false
 // One attempt, even for incorrect or expired answers. Safe against parallel replay.
 const row=(await pool.query('DELETE FROM login_captcha WHERE id=$1 RETURNING answer_hash,expires_at',[id])).rows[0]
 if(!row||new Date(row.expires_at)<=new Date()||typeof answer!=='string')return false
 const normalized=answer.trim().replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632))
 if(!/^\d{5}$/.test(normalized))return false
 return timingSafeEqual(Buffer.from(row.answer_hash,'hex'),Buffer.from(digest(id,normalized),'hex'))
}
