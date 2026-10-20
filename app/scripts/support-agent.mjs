// Privileged deployment CLI. Never exposed as an HTTP endpoint or signup field.
import {pool} from '../server/db.mjs'
const [action,email]=process.argv.slice(2)
try{
 if(!['grant','revoke'].includes(action)||!email)throw new Error('Usage: node scripts/support-agent.mjs grant|revoke existing-user@example.com')
 const {rows}=await pool.query('SELECT id FROM users WHERE lower(email)=$1',[email.trim().toLowerCase()])
 if(!rows.length)throw new Error('Register this account first; no account was modified.')
 if(action==='grant')await pool.query('INSERT INTO support_agents(user_id) VALUES($1) ON CONFLICT DO NOTHING',[rows[0].id])
 else await pool.query('DELETE FROM support_agents WHERE user_id=$1',[rows[0].id])
 console.log(action==='grant'?'Support access granted.':'Support access revoked.')
}catch(error){console.error(error.message);process.exitCode=1}finally{await pool.end()}
