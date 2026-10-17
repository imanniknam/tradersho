import { readFile } from 'node:fs/promises'
import { pool, migrate } from '../server/db.mjs'

const path = process.argv[2]
if (!path) throw new Error('Usage: DATABASE_URL=... node scripts/import-json.mjs /path/to/data.json')
const source = JSON.parse(await readFile(path, 'utf8'))
await migrate()
const client = await pool.connect()
try {
  await client.query('BEGIN')
  for (const user of source.users || []) {
    await client.query('INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [user.id, user.name, user.email, user.passwordHash, user.createdAt])
    for (const [courseId, completed] of Object.entries(user.progress || {})) {
      await client.query('INSERT INTO course_progress (user_id, course_id, completed_lessons) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [user.id, courseId, completed])
    }
  }
  for (const ticket of source.tickets || []) {
    await client.query('INSERT INTO support_tickets (id, user_id, subject, message, status, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [ticket.id, ticket.userId, ticket.subject, ticket.message, ticket.status || 'open', ticket.createdAt])
  }
  for (const request of source.rebates || []) {
    await client.query('INSERT INTO rebate_requests (id, user_id, broker, account, status, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [request.id, request.userId, request.broker, request.account, request.status || 'pending', request.createdAt])
  }
  for (const interest of source.interests || []) {
    await client.query('INSERT INTO plan_interests (id, user_id, plan_code, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [interest.id, interest.userId, interest.plan, interest.createdAt])
  }
  await client.query('COMMIT')
  console.log(JSON.stringify({ importedUsers: (source.users || []).length, importedTickets: (source.tickets || []).length, importedRebates: (source.rebates || []).length }))
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
