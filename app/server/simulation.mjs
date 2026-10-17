import { randomUUID } from 'node:crypto'

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }) }
const roundDivide = (value, divisor) => value < 0n ? -((-value + divisor / 2n) / divisor) : (value + divisor / 2n) / divisor
const ticks = value => BigInt(Math.round(value * 10000))
const notional = (units, value) => roundDivide(BigInt(units) * ticks(value), 100n)
const pnl = (position, value) => roundDivide((ticks(value) - BigInt(position.entryTicks)) * BigInt(position.units) * (position.side === 'buy' ? 1n : -1n), 100n)
const unrealized = (state, value) => state.positions.reduce((sum, p) => sum + pnl(p, value), 0n)
const margin = state => state.positions.reduce((sum, p) => sum + roundDivide(BigInt(p.units) * BigInt(p.entryTicks), 100n), 0n)
const money = cents => {
  const value = BigInt(cents), abs = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`
}

export function initialSimulation(balance = '10000') {
  if (typeof balance !== 'string' || !/^\d{1,8}(\.\d{1,2})?$/.test(balance)) invalid('موجودی اولیه باید یک مبلغ دلاری با حداکثر دو رقم اعشار باشد.')
  const [whole, fraction = ''] = balance.split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents < 10000n || cents > 1_000_000_000n) invalid('موجودی اولیه باید بین ۱۰۰ تا ۱۰٬۰۰۰٬۰۰۰ دلار باشد.')
  return { rules: 'ecb-next-reference-v1', initialCents: String(cents), balanceCents: String(cents), peakEquityCents: String(cents), maxDrawdownBps: 0, positions: [], orders: [], trades: [], commands: [] }
}

export function simulationCommand(previous, input, cursor, value, date) {
  if (!previous) invalid('برای این تمرین، ابتدا یک حساب فرضی بسازید.')
  if (!/^[a-f0-9-]{36}$/i.test(input.requestId || '')) invalid('شناسهٔ درخواست معتبر نیست.')
  if (previous.commands.includes(input.requestId)) return previous
  const state = structuredClone(previous)
  if (input.action === 'open') {
    if (!['buy','sell'].includes(input.side) || !Number.isInteger(input.units) || input.units < 1 || input.units > 1_000_000) invalid('جهت و مقدار معامله معتبر نیست؛ مقدار را به واحد یورو وارد کنید.')
    if (state.orders.filter(o=>o.kind==='open').length >= 100) invalid('این تمرین به سقف ۱۰۰ سفارش ورود رسیده است؛ تمرین تازه بسازید.')
    if (state.positions.length + state.orders.filter(o=>o.kind==='open'&&o.status==='pending').length >= 10) invalid('حداکثر ۱۰ موقعیت هم‌زمان قابل ثبت است.')
    const reserved = state.orders.filter(o=>o.kind==='open'&&o.status==='pending').reduce((sum,o)=>sum+notional(o.units,value),0n)
    if (notional(input.units,value) + reserved + margin(state) > BigInt(state.balanceCents) + unrealized(state,value)) invalid('موجودی آزاد کافی نیست. در این نسخه اهرم وجود ندارد.')
    state.orders.push({ id: randomUUID(), kind: 'open', side: input.side, units: input.units, placedCursor: cursor, placedDate: date, status: 'pending' })
  } else if (input.action === 'close') {
    const position = state.positions.find(p=>p.id===input.positionId)
    if (!position) invalid('موقعیت باز پیدا نشد.')
    if (state.orders.some(o=>o.kind==='close'&&o.positionId===position.id&&o.status==='pending')) invalid('درخواست بستن این موقعیت قبلاً ثبت شده است.')
    if (state.orders.length >= 200) invalid('این تمرین به سقف سفارش رسیده است.')
    state.orders.push({ id: randomUUID(), kind: 'close', positionId: position.id, side: position.side, units: position.units, placedCursor: cursor, placedDate: date, status: 'pending' })
  } else if (input.action === 'cancel') {
    const order = state.orders.find(o=>o.id===input.orderId&&o.status==='pending'&&o.kind==='open')
    if (!order) invalid('سفارش در انتظار پیدا نشد.')
    order.status = 'cancelled'
  } else invalid('عملیات معامله معتبر نیست.')
  state.commands.push(input.requestId)
  return state
}

// Orders submitted after observing day N execute only when N+1 is revealed.
// ECB observations are not OHLC/bid/ask. No intraday stops or invented fills.
export function settleSimulation(previous, cursor, value, date) {
  if (!previous) return null
  const state = structuredClone(previous)
  for (const order of state.orders.filter(o=>o.status==='pending'&&o.placedCursor<cursor)) {
    if (order.kind === 'open') {
      if (notional(order.units,value)+margin(state)>BigInt(state.balanceCents)+unrealized(state,value)) {
        order.status='rejected'; order.reason='موجودی آزاد در نرخ اجرای بعدی کافی نبود.'; continue
      }
      state.positions.push({ id: order.id, side: order.side, units: order.units, entryTicks: Number(ticks(value)), openedDate: date })
    } else {
      const position=state.positions.find(p=>p.id===order.positionId)
      if (!position) { order.status='rejected'; order.reason='موقعیت قبلاً بسته شده است.'; continue }
      const profit=pnl(position,value)
      state.balanceCents=String(BigInt(state.balanceCents)+profit)
      state.trades.push({ ...position, closedDate: date, exitTicks: Number(ticks(value)), profitCents: String(profit) })
      state.positions=state.positions.filter(p=>p.id!==position.id)
    }
    order.status='filled'; order.executionDate=date; order.executionTicks=Number(ticks(value))
  }
  const equity=BigInt(state.balanceCents)+unrealized(state,value)
  const peak=equity>BigInt(state.peakEquityCents)?equity:BigInt(state.peakEquityCents)
  state.peakEquityCents=String(peak)
  state.maxDrawdownBps=Math.max(state.maxDrawdownBps,Number((peak-equity)*10000n/peak))
  return state
}

export function simulationView(state, value) {
  if (!state) return null
  const floating=unrealized(state,value), equity=BigInt(state.balanceCents)+floating
  const reserved=state.orders.filter(o=>o.kind==='open'&&o.status==='pending').reduce((sum,o)=>sum+notional(o.units,value),0n)
  return {
    rules: state.rules, initialBalance: money(state.initialCents), balance: money(state.balanceCents), equity: money(equity),
    unrealized: money(floating), freeMargin: money(equity-margin(state)-reserved),
    positions: state.positions.map(p=>({ id:p.id,side:p.side,units:p.units,entryPrice:p.entryTicks/10000,openedDate:p.openedDate,unrealized:money(pnl(p,value)),closing:state.orders.some(o=>o.positionId===p.id&&o.kind==='close'&&o.status==='pending') })),
    orders: state.orders.slice(-20).reverse().map(o=>({ ...o, executionPrice:o.executionTicks?o.executionTicks/10000:null })),
    trades: state.trades.map(t=>({ id:t.id,side:t.side,units:t.units,entryPrice:t.entryTicks/10000,exitPrice:t.exitTicks/10000,openedDate:t.openedDate,closedDate:t.closedDate,profit:money(t.profitCents) })).reverse(),
    report: { closedTrades:state.trades.length,wins:state.trades.filter(t=>BigInt(t.profitCents)>0n).length,netProfit:money(BigInt(state.balanceCents)-BigInt(state.initialCents)),maxDrawdownPercent:(state.maxDrawdownBps/100).toFixed(2) },
  }
}
