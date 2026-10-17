import {randomUUID} from 'node:crypto'
import {pool} from './db.mjs'
import {demoDataset,frames,metadata,aggregate,nextCursor,validateBars,fingerprint,invalid} from './candle-market.mjs'
import {account,command,settle,paperView} from './candle-paper.mjs'
import {drawingsView} from './candle-drawings.mjs'
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
async function datasetFor(id,user,db=pool){
  if(id===demoDataset.id)return demoDataset
  const {rows}=await db.query('SELECT * FROM candle_datasets WHERE id=$1 AND user_id=$2',[id,user])
  if(!rows[0])throw Object.assign(new Error('دادهٔ این تمرین پیدا نشد.'),{status:404})
  return rows[0]
}
function view(row,dataset,frame){return {id:row.id,dataset:metadata(dataset),cursor:row.cursor,startCursor:row.start_cursor,time:dataset.bars[row.cursor].time,hasNext:row.cursor<dataset.bars.length-1,version:row.version,drawingVersion:row.drawing_version,drawings:row.drawings,settings:row.settings,frame,bars:aggregate(dataset.bars,row.cursor,frame),paper:paperView(row.paper,dataset.bars[row.cursor].close)}}
export async function candleRoute({path,method,user,req,res,body,json,fail,rateLimit}){
  if(!path.startsWith('/api/candles/'))return false
  const frame=new URL(req.url,'http://localhost').searchParams.get('frame')||'15m'
  if(!Object.hasOwn(frames,frame))invalid('تایم‌فریم معتبر نیست.')
  if(path==='/api/candles/datasets'&&method==='GET'){
    const {rows}=await pool.query('SELECT id,name,symbol,kind,source,jsonb_array_length(bars) AS total,bars->0->>\'time\' AS first,bars->-1->>\'time\' AS last FROM candle_datasets WHERE user_id=$1 ORDER BY created_at DESC',[user.id])
    json(res,200,{datasets:[metadata(demoDataset),...rows.map(r=>({...r,first:Number(r.first),last:Number(r.last),frames:Object.keys(frames)}))]});return true
  }
  if(path==='/api/candles/datasets'&&method==='POST'){
    if(await rateLimit(req,res,'candle-import',user.id,10))return true
    const input=await body(req,6_000_000)
    if(input.acknowledged!==true)invalid('نوع داده و اجازهٔ استفادهٔ شخصی از فایل را تأیید کنید.')
    const {rows:count}=await pool.query('SELECT count(*) FROM candle_datasets WHERE user_id=$1',[user.id])
    if(Number(count[0].count)>=5)invalid('حداکثر پنج فایل برای هر حساب در این نسخه قابل ورود است.')
    const bars=validateBars(input.bars),id=`csv-${user.id}-${fingerprint(bars).slice(0,20)}`
    const dataset={id,name:String(input.name||'EUR/USD · فایل شخصی').slice(0,80),symbol:'EUR/USD',kind:'imported',source:'فایل OHLC شخصی کاربر؛ صحت، timezone و مجوز منبع به‌صورت مستقل تأیید نشده است.',bars}
    await pool.query('INSERT INTO candle_datasets (id,user_id,name,symbol,kind,source,bars) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING',[id,user.id,dataset.name,dataset.symbol,dataset.kind,dataset.source,JSON.stringify(bars)])
    json(res,201,{dataset:metadata(dataset)});return true
  }
  if(path==='/api/candles/session'&&method==='GET'){
    const {rows}=await pool.query('SELECT * FROM candle_replay_sessions WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[user.id])
    json(res,200,{session:rows[0]?view(rows[0],await datasetFor(rows[0].dataset_id,user.id),frame):null});return true
  }
  if(path==='/api/candles/session'&&method==='POST'){
    if(await rateLimit(req,res,'candle-create',user.id,30))return true
    const input=await body(req),d=await datasetFor(input.datasetId||demoDataset.id,user.id)
    let cursor=input.time==null?Math.min(10080,d.bars.length-2):d.bars.findIndex(b=>b.time>=input.time)
    if(!Number.isInteger(cursor)||cursor<49||cursor>=d.bars.length-1)invalid('تاریخ شروع باید پس از ۵۰ کندل اول و قبل از پایان داده باشد.')
    const {rows}=await pool.query('INSERT INTO candle_replay_sessions (id,user_id,dataset_id,start_cursor,cursor,paper) VALUES ($1,$2,$3,$4,$4,$5) RETURNING *',[randomUUID(),user.id,d.id,cursor,JSON.stringify(account(input.balance??'10000'))])
    json(res,201,{session:view(rows[0],d,frame)});return true
  }
  const match=path.match(/^\/api\/candles\/session\/([a-f\d-]+)(\/advance|\/drawings|\/trade|\/settings)?$/i)
  if(!match||!uuid.test(match[1])){fail(res,404,'مسیر چارت پیدا نشد.');return true}
  if(!match[2]&&method==='GET'){
    const {rows}=await pool.query('SELECT * FROM candle_replay_sessions WHERE id=$1 AND user_id=$2',[match[1],user.id])
    if(!rows[0])fail(res,404,'تمرین پیدا نشد.');else json(res,200,{session:view(rows[0],await datasetFor(rows[0].dataset_id,user.id),frame)})
    return true
  }
  if(!['/advance','/drawings','/trade','/settings'].includes(match[2])||method!==(match[2]==='/drawings'||match[2]==='/settings'?'PUT':'POST')){fail(res,405,'عملیات مجاز نیست.');return true}
  const input=await body(req,150000),client=await pool.connect()
  try{
    await client.query('BEGIN')
    const {rows}=await client.query('SELECT * FROM candle_replay_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE',[match[1],user.id])
    let row=rows[0]
    if(!row){await client.query('ROLLBACK');fail(res,404,'تمرین پیدا نشد.');return true}
    const d=await datasetFor(row.dataset_id,user.id,client),action=match[2]
    if(action==='/drawings'){
      if(row.drawing_version!==input.drawingVersion)throw Object.assign(new Error('ترسیم در تب دیگری تغییر کرده است؛ وضعیت تازه دریافت شد.'),{status:409})
      const drawings=drawingsView(input.drawings,d.bars[0].time,d.bars[row.cursor].time)
      row=(await client.query('UPDATE candle_replay_sessions SET drawings=$2,drawing_version=drawing_version+1,updated_at=now() WHERE id=$1 RETURNING *',[row.id,JSON.stringify(drawings)])).rows[0]
    }else if(action==='/settings'){
      // Small preference document, never trusted as trading/permission state.
      if(!input.settings||typeof input.settings!=='object'||JSON.stringify(input.settings).length>8000)invalid('تنظیمات معتبر نیست.')
      row=(await client.query('UPDATE candle_replay_sessions SET settings=$2,updated_at=now() WHERE id=$1 RETURNING *',[row.id,JSON.stringify(input.settings)])).rows[0]
    }else{
      if(!uuid.test(input.requestId||'')||!Number.isInteger(input.version))invalid('نسخه و شناسهٔ درخواست معتبر نیست.')
      const repeated=action==='/advance'?row.last_request_id===input.requestId:row.paper.commands.includes(input.requestId)
      if(!repeated){
        if(row.version!==input.version)throw Object.assign(new Error('تمرین در تب دیگری تغییر کرده است؛ دوباره تلاش کنید.'),{status:409})
        if(row.cursor>=d.bars.length-1)invalid('تمرین به پایان داده رسیده است.')
        let paper=row.paper,cursor=row.cursor
        if(action==='/advance'){
          const end=nextCursor(d.bars,cursor,frame)
          for(let i=cursor+1;i<=end;i++)paper=settle(paper,d.bars[i],i)
          cursor=end
        }else paper=command(paper,input,d.bars[cursor],cursor)
        row=(await client.query('UPDATE candle_replay_sessions SET cursor=$2,paper=$3,version=version+1,last_request_id=$4,updated_at=now() WHERE id=$1 RETURNING *',[row.id,cursor,JSON.stringify(paper),action==='/advance'?input.requestId:row.last_request_id])).rows[0]
      }
    }
    const session=view(row,d,frame);await client.query('COMMIT');json(res,200,{session});return true
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
