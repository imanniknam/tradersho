import { randomUUID } from 'node:crypto'
import { pool } from './db.mjs'
import { market, points, initialCursor, replayView } from './market.mjs'
import { validateDrawings } from './drawings.mjs'
import { initialSimulation, settleSimulation, simulationCommand } from './simulation.mjs'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export async function replayRoute({ path, method, user, req, res, body, json, fail, rateLimit }) {
  if (path === '/api/market/catalog' && method === 'GET') {
    json(res, 200, { dataset: market }); return true
  }
  if (path === '/api/replay/session' && method === 'GET') {
    const { rows } = await pool.query('SELECT * FROM reference_replay_sessions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [user.id])
    json(res, 200, { session: rows[0] ? replayView(rows[0]) : null }); return true
  }
  if (path === '/api/replay/session' && method === 'POST') {
    if (await rateLimit(req, res, 'replay-create', user.id, 30)) return true
    const input = await body(req)
    const cursor = initialCursor(input.startDate)
    const simulation = initialSimulation(input.initialBalance ?? '10000')
    const { rows } = await pool.query('INSERT INTO reference_replay_sessions (id, user_id, dataset_id, start_cursor, cursor, simulation) VALUES ($1,$2,$3,$4,$4,$5) RETURNING *', [randomUUID(), user.id, market.id, cursor, JSON.stringify(simulation)])
    json(res, 201, { session: replayView(rows[0]) }); return true
  }
  const match = path.match(/^\/api\/replay\/session\/([a-f0-9-]+)(\/advance|\/drawings|\/simulation)?$/i)
  if (!match) return false
  if (!uuid.test(match[1])) { fail(res, 404, 'تمرین پیدا نشد.'); return true }
  if (!match[2] && method === 'GET') {
    const { rows } = await pool.query('SELECT * FROM reference_replay_sessions WHERE id = $1 AND user_id = $2', [match[1], user.id])
    if (!rows[0]) fail(res, 404, 'تمرین پیدا نشد.')
    else json(res, 200, { session: replayView(rows[0]) })
    return true
  }
  if (match[2] === '/simulation' && method === 'POST') {
    const input = await body(req)
    if (!Number.isInteger(input.version) || input.version < 0) { fail(res, 400, 'نسخهٔ تمرین معتبر نیست.'); return true }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('SELECT * FROM reference_replay_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [match[1], user.id])
      const row = rows[0]
      if (!row) { await client.query('ROLLBACK'); fail(res, 404, 'تمرین پیدا نشد.'); return true }
      if (row.dataset_id !== market.id) throw Object.assign(new Error('نسخهٔ داده معتبر نیست.'), { status: 409 })
      if (row.simulation?.commands.includes(input.requestId)) { await client.query('COMMIT'); json(res, 200, { session: replayView(row) }); return true }
      if (row.version !== input.version) { await client.query('ROLLBACK'); fail(res, 409, 'وضعیت تمرین تغییر کرده است؛ دوباره تلاش کنید.'); return true }
      if (row.cursor >= points.length - 1) throw Object.assign(new Error('بازهٔ تمرین تمام شده است؛ تمرین جدید بسازید.'), { status: 400 })
      let simulation
      if (!row.simulation && input.action === 'initialize') simulation = initialSimulation(input.initialBalance)
      else simulation = simulationCommand(row.simulation, input, row.cursor, points[row.cursor].value, points[row.cursor].date)
      const result = await client.query('UPDATE reference_replay_sessions SET simulation=$2, version=version+1, updated_at=now() WHERE id=$1 RETURNING *', [row.id, JSON.stringify(simulation)])
      const session=replayView(result.rows[0])
      await client.query('COMMIT'); json(res, 200, { session }); return true
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }
  if (match[2] === '/drawings' && method === 'PUT') {
    const input = await body(req)
    if (!Number.isInteger(input.drawingVersion) || input.drawingVersion < 0) {
      fail(res, 400, 'نسخهٔ ترسیم معتبر نیست.'); return true
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('SELECT * FROM reference_replay_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [match[1], user.id])
      const row = rows[0]
      if (!row) { await client.query('ROLLBACK'); fail(res, 404, 'تمرین پیدا نشد.'); return true }
      if (row.drawing_version !== input.drawingVersion) { await client.query('ROLLBACK'); fail(res, 409, 'ترسیم‌ها در تب دیگری تغییر کرده‌اند.'); return true }
      if (row.dataset_id !== market.id) throw Object.assign(new Error('نسخهٔ داده معتبر نیست.'), { status: 409 })
      const drawings = validateDrawings(input.drawings, row.cursor)
      const result = await client.query('UPDATE reference_replay_sessions SET drawings = $2, drawing_version = drawing_version + 1, updated_at = now() WHERE id = $1 RETURNING *', [row.id, JSON.stringify(drawings)])
      const session = replayView(result.rows[0])
      await client.query('COMMIT'); json(res, 200, { session }); return true
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }
  if (match[2] === '/advance' && method === 'POST') {
    const input = await body(req)
    if (!Number.isInteger(input.version) || input.version < 0 || !uuid.test(String(input.requestId))) {
      fail(res, 400, 'درخواست پیشروی معتبر نیست.'); return true
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('SELECT * FROM reference_replay_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE', [match[1], user.id])
      let row = rows[0]
      if (!row) { await client.query('ROLLBACK'); fail(res, 404, 'تمرین پیدا نشد.'); return true }
      // A retry of the last completed command is safe. Older retries fail their
      // version check; simultaneous tabs cannot move the cursor twice.
      if (row.last_request_id !== input.requestId) {
        if (row.version !== input.version) { await client.query('ROLLBACK'); fail(res, 409, 'تمرین در تب دیگری تغییر کرده است. وضعیت دوباره دریافت شد.'); return true }
        if (row.dataset_id !== market.id) throw Object.assign(new Error('نسخهٔ داده معتبر نیست.'), { status: 409 })
        if (row.cursor < points.length - 1) {
          const nextCursor=row.cursor+1
          const simulation=settleSimulation(row.simulation, nextCursor, points[nextCursor].value, points[nextCursor].date)
          const result = await client.query('UPDATE reference_replay_sessions SET cursor = cursor + 1, version = version + 1, last_request_id = $2, simulation=$3, updated_at = now() WHERE id = $1 RETURNING *', [row.id, input.requestId, JSON.stringify(simulation)])
          row = result.rows[0]
        }
      }
      const session = replayView(row)
      await client.query('COMMIT')
      json(res, 200, { session }); return true
    } catch (error) {
      await client.query('ROLLBACK'); throw error
    } finally { client.release() }
  }
  return false
}
