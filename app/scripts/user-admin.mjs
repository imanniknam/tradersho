import {pool} from '../server/db.mjs'
const [action,email]=process.argv.slice(2)
const db=await pool.connect()
try{
 if(!['grant','revoke'].includes(action)||!email)throw Error('Usage: node scripts/user-admin.mjs grant|revoke existing-user@example.com')
 await db.query('BEGIN')
 await db.query('SELECT pg_advisory_xact_lock(734901,91)')
 const user=(await db.query("SELECT id FROM users WHERE lower(email)=$1 AND account_status='active' FOR UPDATE",[email.toLowerCase().trim()])).rows[0]
 if(!user)throw Error('An active existing account is required')
 if(action==='grant')await db.query('INSERT INTO user_admins(user_id) VALUES ($1) ON CONFLICT DO NOTHING',[user.id])
 else{
  if(!(await db.query("SELECT 1 FROM user_admins a JOIN users u ON u.id=a.user_id WHERE a.user_id<>$1 AND u.account_status='active'",[user.id])).rowCount)throw Error('At least one active administrator must remain')
  await db.query('DELETE FROM user_admins WHERE user_id=$1',[user.id])
 }
 await db.query("INSERT INTO admin_user_audit(subject_id,action,details) VALUES($1,$2,'{\"source\":\"server-cli\"}')",[user.id,action==='grant'?'grant_admin':'revoke_admin'])
 await db.query('COMMIT')
 console.log('Administrator role updated')
}catch(cause){await db.query('ROLLBACK');console.error(cause.message);process.exitCode=1}
finally{db.release();await pool.end()}
