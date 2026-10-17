import {randomUUID} from 'node:crypto'
import {invalid} from './candle-market.mjs'
const div=(a,b)=>a<0n?-((-a+b/2n)/b):(a+b/2n)/b
const tick=p=>BigInt(Math.round(p*1e5))
const amount=(q,p)=>div(BigInt(q)*tick(p),1000n)
const profit=(p,price)=>div(BigInt(p.units)*(tick(price)-BigInt(p.entryTicks))*(p.side==='buy'?1n:-1n),1000n)
const margin=s=>s.positions.reduce((a,p)=>a+div(BigInt(p.units)*BigInt(p.entryTicks),1000n),0n)
const floating=(s,p)=>s.positions.reduce((a,x)=>a+profit(x,p),0n)
const money=n=>(Number(n)/100).toFixed(2)
export function account(balance='10000'){
  if(typeof balance!=='string'||!/^\d{1,8}(\.\d{1,2})?$/.test(balance)||Number(balance)<100||Number(balance)>1e7)invalid('سرمایه باید بین ۱۰۰ تا ۱۰٬۰۰۰٬۰۰۰ دلار و حداکثر دو رقم اعشار باشد.')
  const [whole,part='']=balance.split('.'),cents=String(BigInt(whole)*100n+BigInt(part.padEnd(2,'0')))
  return {rules:'m1-next-open-stop-first-v1',initial:cents,balance:cents,peak:cents,drawdown:0,positions:[],orders:[],trades:[],commands:[]}
}
export function command(previous,input,bar,cursor){
  const s=structuredClone(previous)
  if(!/^[a-f\d-]{36}$/i.test(input.requestId||''))invalid('شناسهٔ درخواست معتبر نیست.')
  if(s.commands.includes(input.requestId))return s
  if(input.action==='open'){
    if(!['buy','sell'].includes(input.side)||!Number.isInteger(input.units)||input.units<1||input.units>1e6)invalid('مقدار معامله باید عدد صحیح ۱ تا یک میلیون یورو باشد.')
    if(s.orders.filter(o=>o.kind==='open').length>=100||s.positions.length+s.orders.filter(o=>o.kind==='open'&&o.status==='pending').length>=10)invalid('سقف معاملات این تمرین رسیده است.')
    const stop=input.stop==null?null:input.stop,target=input.target==null?null:input.target
    for(const p of [stop,target])if(p!==null&&(!Number.isFinite(p)||p<=0||p>100||Math.abs(p*1e5-Math.round(p*1e5))>1e-6))invalid('حد ضرر و هدف باید قیمت معتبر با حداکثر پنج رقم اعشار باشند.')
    if((stop!==null&&(input.side==='buy'?stop>=bar.close:stop<=bar.close))||(target!==null&&(input.side==='buy'?target<=bar.close:target>=bar.close)))invalid('حد ضرر و هدف نسبت به جهت معامله و قیمت فعلی معتبر نیستند.')
    const reserved=s.orders.filter(o=>o.kind==='open'&&o.status==='pending').reduce((a,o)=>a+amount(o.units,bar.close),0n)
    if(amount(input.units,bar.close)+margin(s)+reserved>BigInt(s.balance)+floating(s,bar.close))invalid('موجودی آزاد کافی نیست؛ اهرم ۱:۱ است.')
    s.orders.push({id:randomUUID(),kind:'open',side:input.side,units:input.units,stop,target,cursor,status:'pending'})
  }else if(input.action==='close'){
    if(!s.positions.some(p=>p.id===input.positionId)||s.orders.some(o=>o.positionId===input.positionId&&o.status==='pending'))invalid('موقعیت پیدا نشد یا خروج آن قبلاً ثبت شده است.')
    s.orders.push({id:randomUUID(),kind:'close',positionId:input.positionId,cursor,status:'pending'})
  }else if(input.action==='cancel'){
    const order=s.orders.find(o=>o.id===input.orderId&&o.kind==='open'&&o.status==='pending')
    if(!order)invalid('سفارش ورود منتظر پیدا نشد.')
    order.status='cancelled'
  }else invalid('عملیات معتبر نیست.')
  s.commands.push(input.requestId);return s
}
function close(s,p,price,time,reason){
  const gain=profit(p,price);s.balance=String(BigInt(s.balance)+gain)
  s.trades.push({...p,exit:price,closed:time,profit:money(gain),reason});s.positions=s.positions.filter(x=>x.id!==p.id)
}
export function settle(previous,bar,cursor){
  const s=structuredClone(previous)
  for(const o of s.orders.filter(o=>o.status==='pending'&&o.cursor<cursor)){
    if(o.kind==='open'){
      if(amount(o.units,bar.open)+margin(s)>BigInt(s.balance)+floating(s,bar.open)){o.status='rejected';o.reason='موجودی در قیمت بازشدن کندل بعد کافی نبود.';continue}
      s.positions.push({id:o.id,side:o.side,units:o.units,entryTicks:Number(tick(bar.open)),opened:bar.time,stop:o.stop,target:o.target})
    }else{
      const p=s.positions.find(p=>p.id===o.positionId)
      if(p)close(s,p,bar.open,bar.time,'manual')
      else{o.status='rejected';o.reason='موقعیت قبلاً بسته شده است.';continue}
    }
    o.status='filled';o.price=bar.open;o.executed=bar.time
  }
  // Stop first if both touched in the same M1 bar; gap fills use the opening price.
  for(const p of [...s.positions]){
    const buy=p.side==='buy',stop=p.stop!==null&&(buy?bar.low<=p.stop:bar.high>=p.stop),target=p.target!==null&&(buy?bar.high>=p.target:bar.low<=p.target)
    if(stop)close(s,p,buy?Math.min(p.stop,bar.open):Math.max(p.stop,bar.open),bar.time,'stop')
    else if(target)close(s,p,buy?Math.max(p.target,bar.open):Math.min(p.target,bar.open),bar.time,'target')
  }
  const equity=BigInt(s.balance)+floating(s,bar.close),peak=equity>BigInt(s.peak)?equity:BigInt(s.peak)
  s.peak=String(peak);s.drawdown=Math.max(s.drawdown,Number((peak-equity)*10000n/peak))
  return s
}
export function paperView(s,price){
  const unrealized=floating(s,price),equity=BigInt(s.balance)+unrealized,reserved=s.orders.filter(o=>o.kind==='open'&&o.status==='pending').reduce((a,o)=>a+amount(o.units,price),0n)
  return {balance:money(s.balance),initial:money(s.initial),equity:money(equity),unrealized:money(unrealized),free:money(equity-margin(s)-reserved),positions:s.positions.map(p=>({...p,entry:p.entryTicks/1e5,unrealized:money(profit(p,price)),closing:s.orders.some(o=>o.positionId===p.id&&o.status==='pending')})),orders:s.orders.slice(-30).reverse(),trades:s.trades.toReversed(),net:money(BigInt(s.balance)-BigInt(s.initial)),drawdown:(s.drawdown/100).toFixed(2),wins:s.trades.filter(t=>Number(t.profit)>0).length}
}
