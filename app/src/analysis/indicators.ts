export interface Observation { date: string; value: number }
export interface IndicatorPoint { time: string; value: number }

export function sma(points: Observation[], period: number): IndicatorPoint[] {
  const output: IndicatorPoint[] = []
  let sum = 0
  points.forEach((point, index) => {
    sum += point.value
    if (index >= period) sum -= points[index - period].value
    if (index >= period - 1) output.push({ time: point.date, value: sum / period })
  })
  return output
}

// SMA-seeded EMA. No invented values during the warm-up period.
export function ema(points: Observation[], period: number): IndicatorPoint[] {
  if (points.length < period) return []
  const alpha = 2 / (period + 1)
  let value = points.slice(0, period).reduce((sum, p) => sum + p.value, 0) / period
  const output = [{ time: points[period - 1].date, value }]
  for (let i = period; i < points.length; i++) {
    value += alpha * (points[i].value - value)
    output.push({ time: points[i].date, value })
  }
  return output
}

export function bollinger(points: Observation[], period = 20, deviations = 2) {
  const middle = sma(points, period)
  const upper: IndicatorPoint[] = [], lower: IndicatorPoint[] = []
  middle.forEach((point, index) => {
    const window = points.slice(index, index + period)
    const variance = window.reduce((sum, p) => sum + (p.value - point.value) ** 2, 0) / period
    const offset = deviations * Math.sqrt(variance)
    upper.push({ time: point.time, value: point.value + offset })
    lower.push({ time: point.time, value: point.value - offset })
  })
  return { middle, upper, lower }
}

export function rsi(points: Observation[], period = 14): IndicatorPoint[] {
  if (points.length <= period) return []
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) {
    const delta = points[i].value - points[i - 1].value
    gain += Math.max(0, delta) / period; loss += Math.max(0, -delta) / period
  }
  const level = () => loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss)
  const output = [{ time: points[period].date, value: level() }]
  for (let i = period + 1; i < points.length; i++) {
    const delta = points[i].value - points[i - 1].value
    gain = (gain * (period - 1) + Math.max(0, delta)) / period
    loss = (loss * (period - 1) + Math.max(0, -delta)) / period
    output.push({ time: points[i].date, value: level() })
  }
  return output
}

export function macd(points: Observation[]) {
  const fast = new Map(ema(points, 12).map(p => [p.time, p.value]))
  const line = ema(points, 26).map(p => ({ time: p.time, value: fast.get(p.time)! - p.value }))
  const signal = ema(line.map(p => ({ date: p.time, value: p.value })), 9)
  const signals = new Map(signal.map(p => [p.time, p.value]))
  const histogram = line.filter(p => signals.has(p.time)).map(p => ({ time: p.time, value: p.value - signals.get(p.time)! }))
  return { line, signal, histogram }
}
