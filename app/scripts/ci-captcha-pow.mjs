import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {solveChallenge} from 'altcha-lib'
import {deriveKey} from 'altcha-lib/algorithms/pbkdf2'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
process.env.CAPTCHA_MODE='pow'
const {pool}=await import('../server/db.mjs'),{issueCaptcha,verifyCaptcha}=await import('../server/captcha.mjs')
const binding=randomBytes(32).toString('hex'),other=randomBytes(32).toString('hex'),ids=[]
async function fresh(){const c=await issueCaptcha(binding);ids.push(c.id);assert.equal(c.kind,'pow');assert.equal(c.image,undefined);const solution=await solveChallenge({challenge:c.challenge,deriveKey});assert.ok(solution);return {id:c.id,answer:Buffer.from(JSON.stringify({challenge:c.challenge,solution})).toString('base64')}}
try{
 const c=await fresh();assert.equal(await verifyCaptcha(c.id,c.answer,other),false)
 assert.equal((await pool.query('SELECT 1 FROM login_captcha WHERE id=$1',[c.id])).rowCount,1)
 const results=await Promise.all([verifyCaptcha(c.id,c.answer,binding),verifyCaptcha(c.id,c.answer,binding)])
 assert.deepEqual(results.sort(),[false,true]);assert.equal(await verifyCaptcha(c.id,c.answer,binding),false)
 const bad=await fresh();assert.equal(await verifyCaptcha(bad.id,'forged',binding),false);assert.equal(await verifyCaptcha(bad.id,bad.answer,binding),false)
 const expired=await fresh();await pool.query("UPDATE login_captcha SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);assert.equal(await verifyCaptcha(expired.id,expired.answer,binding),false)
 console.log('PASS nonnumeric PoW: actual PBKDF2 solve, browser binding, atomic single-use, wrong attempt consumes challenge, expiry')
}finally{await pool.query('DELETE FROM login_captcha WHERE id=ANY($1)',[ids]);await pool.end()}
