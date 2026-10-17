import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Info, Wallet } from 'lucide-react'

export interface SimulationView {
  initialBalance:string; balance:string; equity:string; unrealized:string; freeMargin:string;
  positions:{id:string;side:'buy'|'sell';units:number;entryPrice:number;openedDate:string;unrealized:string;closing:boolean}[];
  orders:{id:string;kind:'open'|'close';side:'buy'|'sell';units:number;status:string;placedDate:string;executionDate?:string;reason?:string}[];
  trades:{id:string;side:'buy'|'sell';units:number;entryPrice:number;exitPrice:number;openedDate:string;closedDate:string;profit:string}[];
  report:{closedTrades:number;wins:number;netProfit:string;maxDrawdownPercent:string};
}
const usd = (value:string) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value))
export default function BacktestPanel({ simulation, hasNext, busy, initialBalance, command }: {
  simulation:SimulationView|null;hasNext:boolean;busy:boolean;initialBalance:string;
  command:(input:Record<string,unknown>)=>Promise<void>;
}) {
  const [side,setSide]=useState<'buy'|'sell'>('buy')
  const [units,setUnits]=useState('1000')
  if(!simulation)return <section className="surface backtest-panel"><h2>حساب تمرینی</h2><p>برای این تمرین هنوز موجودی فرضی تعیین نشده است. موجودی اولیه را در تنظیمات تمرین وارد کنید.</p><button className="button primary" disabled={busy||!hasNext} onClick={()=>void command({action:'initialize',initialBalance})}>ساخت حساب فرضی</button></section>
  const pending=simulation.orders.filter(o=>o.status==='pending')
  const invalid=!/^\d+$/.test(units)||Number(units)<1||Number(units)>1_000_000
  return <section className="surface backtest-panel" aria-label="بک‌تست و معاملات فرضی">
    <div className="backtest-heading"><div><span className="eyebrow">PAPER ACCOUNT / REPLAY</span><h2>تمرین تصمیم، با سرمایهٔ فرضی</h2></div><span className="badge badge-muted"><Wallet size={13}/> حساب تمرینی</span></div>
    <div className="simulation-metrics">{[['موجودی','balance',simulation.balance],['ارزش کل حساب','equity',simulation.equity],['سود و زیان باز','unrealized',simulation.unrealized],['موجودی آزاد','free-margin',simulation.freeMargin]].map(([label,id,value])=><div key={id}><span>{label}</span><strong data-testid={`sim-${id}`} dir="ltr">{usd(value)}</strong></div>)}</div>
    <div className="simulation-rule"><Info size={16}/><p>ثبت سفارش اکنون، اجرا در <strong>نرخ مرجع روز انتشار بعدی</strong>. «روز بعد» یا پخش Replay را بزنید تا سفارش اجرا شود. این حساب بدون اهرم، اسپرد و کارمزد است؛ نتیجهٔ آن بک‌تست دقیق بروکر یا درون‌روزی محسوب نمی‌شود.</p></div>
    <div className="simulation-ticket"><div className="trade-direction" aria-label="جهت معامله"><button className={side==='buy'?'active buy':''} aria-pressed={side==='buy'} onClick={()=>setSide('buy')}><ArrowUpRight size={17}/> خرید</button><button className={side==='sell'?'active sell':''} aria-pressed={side==='sell'} onClick={()=>setSide('sell')}><ArrowDownLeft size={17}/> فروش</button></div><label>مقدار معامله (یورو)<input type="number" min={1} max={1_000_000} step={1} value={units} onChange={e=>setUnits(e.target.value)} dir="ltr"/></label><button className="button primary" disabled={busy||!hasNext||invalid} onClick={()=>void command({action:'open',side,units:Number(units)})}>{side==='buy'?'ثبت خرید فرضی':'ثبت فروش فرضی'}</button></div>
    {!hasNext&&<p className="inline-hint">بازهٔ داده تمام شده است؛ برای معاملهٔ تازه، تمرین جدید بسازید. موقعیت‌های باز با آخرین نرخ ارزش‌گذاری شده‌اند.</p>}
    {pending.length>0&&<div className="pending-orders"><h3>در انتظار روز بعد</h3>{pending.map(order=><div key={order.id}><span>{order.kind==='close'?'بستن موقعیت':order.side==='buy'?'خرید':'فروش'} · {order.units.toLocaleString('fa-IR')} یورو</span>{order.kind==='open'&&<button disabled={busy} onClick={()=>void command({action:'cancel',orderId:order.id})}>لغو سفارش</button>}</div>)}</div>}
    <h3>موقعیت‌های باز <span>({simulation.positions.length})</span></h3>
    {simulation.positions.length?<div className="simulation-table-wrap"><table className="simulation-table"><thead><tr><th>جهت / مقدار</th><th>ورود</th><th>سود و زیان باز</th><th>عملیات</th></tr></thead><tbody>{simulation.positions.map(position=><tr key={position.id}><td>{position.side==='buy'?'خرید':'فروش'} · {position.units.toLocaleString('fa-IR')} EUR</td><td dir="ltr">{position.entryPrice.toFixed(4)}</td><td dir="ltr" className={Number(position.unrealized)>=0?'positive':'negative'}>{usd(position.unrealized)}</td><td><button className="simulation-close" disabled={busy||!hasNext||position.closing} onClick={()=>void command({action:'close',positionId:position.id})}>{position.closing?'در انتظار بسته‌شدن':'بستن موقعیت'}</button></td></tr>)}</tbody></table></div>:<p className="simulation-empty">موقعیت بازی ندارید. سفارش تازه پس از رفتن به روز بعد اجرا می‌شود.</p>}
    <div className="simulation-report"><span>سرمایهٔ اولیه <b dir="ltr">{usd(simulation.initialBalance)}</b></span><span>معاملات بسته‌شده <b>{simulation.report.closedTrades}</b></span><span>نتیجهٔ بسته‌شده <b dir="ltr">{usd(simulation.report.netProfit)}</b></span><span>بیشترین افت روزانه <b dir="ltr">{simulation.report.maxDrawdownPercent}%</b></span></div>
    <h3>معاملات بسته‌شده</h3>{simulation.trades.length?<div className="simulation-table-wrap"><table className="simulation-table"><thead><tr><th>معامله</th><th>ورود / خروج</th><th>تاریخ بسته‌شدن</th><th>نتیجه</th></tr></thead><tbody>{simulation.trades.map(trade=><tr key={trade.id}><td>{trade.side==='buy'?'خرید':'فروش'} · {trade.units} EUR</td><td dir="ltr">{trade.entryPrice.toFixed(4)} → {trade.exitPrice.toFixed(4)}</td><td dir="ltr">{trade.closedDate}</td><td dir="ltr" className={Number(trade.profit)>=0?'positive':'negative'}>{usd(trade.profit)}</td></tr>)}</tbody></table></div>:<p className="simulation-empty">هنوز معامله‌ای بسته نشده است.</p>}
    {simulation.orders.some(o=>o.status==='rejected')&&<div className="simulation-rejections">{simulation.orders.filter(o=>o.status==='rejected').map(o=><p key={o.id}>سفارش اجرا نشد: {o.reason}</p>)}</div>}
  </section>
}
