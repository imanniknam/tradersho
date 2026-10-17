import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { simulationView } from './simulation.mjs'

const dataset = JSON.parse(await readFile(new URL('./datasets/ecb-eurusd-2025.json', import.meta.url), 'utf8'))
export const points = dataset.points
if (points.length < 50 || points.some((p, i) => !/^2025-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(p.value) || p.value <= 0 || (i > 0 && points[i - 1].date >= p.date))) {
  throw new Error('Invalid ECB reference-rate snapshot')
}

const checksum = createHash('sha256').update(JSON.stringify(points)).digest('hex')
export const market = Object.freeze({
  ...Object.fromEntries(Object.entries(dataset).filter(([key]) => key !== 'points')),
  id: `${dataset.id}-${checksum.slice(0, 12)}`,
  checksum,
  firstDate: points[0].date,
  lastDate: points.at(-1).date,
  totalPoints: points.length,
  // Dates are metadata; future rates are never part of this response.
  startDates: points.slice(19, -1).map(p => p.date),
  limitations: ['daily_reference_only', 'no_ohlc', 'no_live', 'no_broker_execution', 'reference_simulation_only'],
})

export function initialCursor(date) {
  const index = date === undefined ? 19 : points.findIndex(p => p.date === date)
  if (index < 19 || index >= points.length - 1) {
    throw Object.assign(new Error('یک روز انتشار معتبر از بازهٔ قابل شروع انتخاب کنید.'), { status: 400 })
  }
  return index
}

export function replayView(row) {
  if (row.dataset_id !== market.id) throw Object.assign(new Error('نسخهٔ دادهٔ این تمرین در دسترس نیست.'), { status: 409 })
  return {
    id: row.id, datasetId: row.dataset_id, startCursor: row.start_cursor,
    cursor: row.cursor, version: row.version,
    startDate: points[row.start_cursor].date, currentDate: points[row.cursor].date,
    hasNext: row.cursor < points.length - 1,
    drawings: row.drawings || [], drawingVersion: row.drawing_version || 0,
    simulation: simulationView(row.simulation, points[row.cursor].value),
    points: points.slice(0, row.cursor + 1), updatedAt: row.updated_at,
  }
}
