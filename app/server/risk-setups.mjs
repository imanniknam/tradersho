import {pool} from './db.mjs'
const limits={balance:[1,100000000],maxLoss:[.1,100],baseRisk:[.01,100],rr:[.1,100],cycleLength:[2,20]}
export function validRiskSetup(value){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===6&&Object.entries(limits).every(([k,[min,max]])=>typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>=min&&value[k]<=max&&(k!=='cycleLength'||Number.isInteger(value[k])))&&['uniform','balanced','early'].includes(value.distribution)}
export async function migrateRiskSetups(client){await client.query(`CREATE TABLE IF NOT EXISTS risk_setups(id uuid PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,name varchar(60) NOT NULL,input jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS risk_setups_owner ON risk_setups(user_id,updated_at DESC); CREATE UNIQUE INDEX IF NOT EXISTS risk_setups_owner_name ON risk_setups(user_id,lower(name));`)}
const columns='id,name,input,updated_at AS "updatedAt"'
export async function riskSetupsRoute({path,method,user,req,res,body,json,fail,rateLimit}){
 if(path!=='/api/risk/setups'&&!path.startsWith('/api/risk/setups/'))return false
 if(path==='/api/risk/setups'&&method==='GET'){const {rows}=await pool.query(`SELECT ${columns} FROM risk_setups WHERE user_id=$1 ORDER BY updated_at DESC,id`,[user.id]);json(res,200,{setups:rows});return true}
 const id=path.slice('/api/risk/setups/'.length)
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)||!['PUT','DELETE'].includes(method)){fail(res,404,'ستاپ پیدا نشد.');return true}
 if(await rateLimit(req,res,'risk-setup-write',user.id,60))return true
 if(method==='DELETE'){const result=await pool.query('DELETE FROM risk_setups WHERE id=$1 AND user_id=$2',[id,user.id]);if(!result.rowCount)fail(res,404,'ستاپ پیدا نشد.');else json(res,200,{ok:true});return true}
 const value=await body(req),name=typeof value.name==='string'?value.name.trim():''
 if(!name||name.length>60||/[\u0000-\u001f\u007f]/.test(name)||!validRiskSetup(value.input)){fail(res,400,'نام و تنظیمات ستاپ باید معتبر باشند.');return true}
 const client=await pool.connect()
 try{
  await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id])
  const existing=await client.query('SELECT user_id FROM risk_setups WHERE id=$1',[id])
  if(existing.rowCount&&existing.rows[0].user_id!==user.id){await client.query('ROLLBACK');fail(res,404,'ستاپ پیدا نشد.');return true}
  if(!existing.rowCount&&(await client.query('SELECT count(*)::int AS n FROM risk_setups WHERE user_id=$1',[user.id])).rows[0].n>=50){await client.query('ROLLBACK');fail(res,409,'حداکثر ۵۰ ستاپ می‌توانید ذخیره کنید.');return true}
  const result=await client.query(`INSERT INTO risk_setups(id,user_id,name,input) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,input=EXCLUDED.input,updated_at=now() WHERE risk_setups.user_id=$2 RETURNING ${columns}`,[id,user.id,name,value.input])
  if(!result.rowCount){await client.query('ROLLBACK');fail(res,404,'ستاپ پیدا نشد.');return true}
  await client.query('COMMIT');json(res,200,{setup:result.rows[0]})
 }catch(e){await client.query('ROLLBACK');if(e.code==='23505')fail(res,409,'ستاپی با این نام دارید؛ نام دیگری وارد کنید.');else throw e}finally{client.release()}
 return true
}
