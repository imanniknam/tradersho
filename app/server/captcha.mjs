import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto'
import {pool} from './db.mjs'
import {makeCaptcha} from './captcha-image.mjs'
import {makePowChallenge,verifyPowPayload} from './captcha-pow.mjs'
import {browserBindingHash} from './security.mjs'
export const captchaEnabled=()=>['internal','pow'].includes(process.env.CAPTCHA_MODE)
const digest=(id,answer)=>createHmac('sha256',process.env.CAPTCHA_SECRET).update(id+':'+answer).digest('hex')
export async function migrateCaptcha(client){await client.query('CREATE TABLE IF NOT EXISTS login_captcha(id text PRIMARY KEY,answer_hash text NOT NULL,expires_at timestamptz NOT NULL); ALTER TABLE login_captcha ADD COLUMN IF NOT EXISTS browser_hash text; CREATE INDEX IF NOT EXISTS login_captcha_expiry ON login_captcha(expires_at);')}
export async function issueCaptcha(binding){
 const browserHash=browserBindingHash(binding)
 if(!browserHash)throw Error('CAPTCHA browser binding required')
 const id=randomUUID()
 const proof=process.env.CAPTCHA_MODE==='pow'?await makePowChallenge(id,process.env.CAPTCHA_SECRET):null
 const raster=proof?null:makeCaptcha()
 await pool.query('DELETE FROM login_captcha WHERE expires_at<now()')
 await pool.query("INSERT INTO login_captcha(id,answer_hash,expires_at,browser_hash) VALUES($1,$2,now()+interval '3 minutes',$3)",[id,proof?proof.signature:digest(id,raster.answer),browserHash])
 return proof?{enabled:true,kind:'pow',id,challenge:proof,expiresIn:180}:{enabled:true,kind:'image',id,image:'data:image/png;base64,'+raster.png.toString('base64'),expiresIn:180}
}
export async function verifyCaptcha(id,answer,binding){
 if(!captchaEnabled())return true
 const browserHash=browserBindingHash(binding)
 if(!browserHash||typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id))return false
 // One attempt, even for incorrect or expired answers. Safe against parallel replay.
 const row=(await pool.query('DELETE FROM login_captcha WHERE id=$1 AND browser_hash=$2 RETURNING answer_hash,expires_at',[id,browserHash])).rows[0]
 if(!row||new Date(row.expires_at)<=new Date()||typeof answer!=='string')return false
 if(process.env.CAPTCHA_MODE==='pow')return verifyPowPayload(answer,id,row.answer_hash,process.env.CAPTCHA_SECRET)
 const normalized=answer.trim().replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632))
 if(!/^\d{6}$/.test(normalized))return false
 return timingSafeEqual(Buffer.from(row.answer_hash,'hex'),Buffer.from(digest(id,normalized),'hex'))
}
