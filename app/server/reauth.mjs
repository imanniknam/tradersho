import {pool} from './db.mjs'
export const recentAuthMinutes=10
// Changing how an account can be opened needs fresh proof of ownership, not just a
// live cookie. Password accounts re-enter the password; password-less accounts must
// have signed in moments ago.
export async function hasRecentAuth(tokenDigest,db=pool){
  return (await db.query(`SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND
    CASE WHEN u.password_hash LIKE 'scrypt$%' OR position(':' in u.password_hash)>0
      THEN s.reauth_at ELSE s.created_at END > now()-make_interval(mins => $2)`,[tokenDigest,recentAuthMinutes])).rowCount>0
}
