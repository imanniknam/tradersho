import { createHash } from 'node:crypto'
export const frames = Object.freeze({ '1m':1, '3m':3, '5m':5, '15m':15, '30m':30, '1h':60, '2h':120, '4h':240, '1D':1440 })
export const invalid = message => { throw Object.assign(new Error(message), {status:400}) }
export const fingerprint = bars => createHash('sha256').update(JSON.stringify(bars)).digest('hex')
// Deterministic UI/practice fixture, explicitly NOT historical market data.
function fixture() {
  let seed=73129, close=1.085
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const round=n=>Number(n.toFixed(5)), bars=[]
  for(let i=0;i<43200;i++){
    const open=close, wave=Math.sin(i/181)*.000018+Math.sin(i/1403)*.000012
    close=round(Math.max(.6,open+(random()-.5)*.00028+wave))
    bars.push({time:Date.UTC(2025,0,1)/1000+i*60,open,high:round(Math.max(open,close)+random()*.00018),low:round(Math.min(open,close)-random()*.00018),close,volume:Math.round(30+random()*500)})
  }
  return bars
}
export const demoBars=fixture()
export const demoDataset={id:`demo-eurusd-m1-v1-${fingerprint(demoBars).slice(0,12)}`,name:'EUR/USD · دموی مصنوعی',symbol:'EUR/USD',kind:'synthetic',source:'دادهٔ مصنوعی ثابت برای آزمایش رابط؛ تاریخچهٔ بازار نیست.',bars:demoBars}
export function validateBars(value) {
  if(!Array.isArray(value)||value.length<51||value.length>30000)invalid('فایل باید بین ۵۱ و ۳۰٬۰۰۰ کندل یک‌دقیقه‌ای داشته باشد.')
  let previous=0
  return value.map(row=>{
    if(!row||!Number.isInteger(row.time)||row.time%60||row.time<946684800||row.time>4102444800||row.time<=previous)invalid('زمان‌ها باید UTC، مرتب، یکتا و در ابتدای دقیقه باشند.')
    previous=row.time
    const {time,open,high,low,close}=row,volume=row.volume??0
    if(![open,high,low,close,volume].every(Number.isFinite)||low<=0||high>100||low>Math.min(open,close)||high<Math.max(open,close)||volume<0||volume>1e15)invalid('OHLC نامعتبر است؛ این نسخه فقط EUR/USD با قیمت مثبت تا ۱۰۰ را می‌پذیرد.')
    for(const price of [open,high,low,close])if(Math.abs(price*1e5-Math.round(price*1e5))>1e-6)invalid('قیمت‌های EUR/USD باید حداکثر پنج رقم اعشار داشته باشند.')
    return {time,open,high,low,close,volume}
  })
}
export function aggregate(bars,cursor,frame) {
  if(!Object.hasOwn(frames,frame))invalid('تایم‌فریم معتبر نیست.')
  const seconds=frames[frame]*60, output=[]
  // Aggregate only the revealed prefix; partial higher bars never see future H/L/C/V.
  for(let i=0;i<=cursor;i++){
    const b=bars[i],time=Math.floor(b.time/seconds)*seconds,last=output.at(-1)
    if(last?.time===time){last.high=Math.max(last.high,b.high);last.low=Math.min(last.low,b.low);last.close=b.close;last.volume+=b.volume}
    else output.push({...b,time})
  }
  return output
}
export function nextCursor(bars,cursor,frame) {
  if(!Object.hasOwn(frames,frame))invalid('تایم‌فریم معتبر نیست.')
  const boundary=(Math.floor((bars[cursor].time+60)/(frames[frame]*60))+1)*frames[frame]*60
  let next=cursor+1
  while(next<bars.length&&bars[next].time<boundary)next++
  return Math.min(bars.length-1,Math.max(cursor+1,next-1))
}
export function metadata(dataset){return {id:dataset.id,name:dataset.name,symbol:dataset.symbol,kind:dataset.kind,source:dataset.source,total:dataset.bars.length,first:dataset.bars[0].time,last:dataset.bars.at(-1).time,frames:Object.keys(frames)}}
