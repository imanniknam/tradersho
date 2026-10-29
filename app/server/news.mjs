import {timingSafeEqual} from 'node:crypto'
import {pool} from './db.mjs'
import {validateNewsBatch,newsProviders,newsCategories,sourceNames} from './news-data.mjs'
export async function migrateNews(client){await client.query(`
 CREATE TABLE IF NOT EXISTS market_news(id text PRIMARY KEY,provider text NOT NULL,url text NOT NULL,domain text NOT NULL,title_original text NOT NULL,title_fa text,category text NOT NULL,translation text NOT NULL,published_at timestamptz,detected_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS market_news_date ON market_news((COALESCE(published_at,detected_at)) DESC);
 CREATE TABLE IF NOT EXISTS market_news_sources(provider text PRIMARY KEY,last_attempt timestamptz NOT NULL,last_success timestamptz,status text NOT NULL,error text);
 CREATE TABLE IF NOT EXISTS news_translation_usage(day date PRIMARY KEY,characters integer NOT NULL DEFAULT 0);
 `)}
function authorized(req){const expected=process.env.NEWS_INGEST_TOKEN||'',actual=String(req.headers.authorization||'');if(expected.length<32||actual.length!==expected.length+7||!actual.startsWith('Bearer '))return false;const a=Buffer.from(actual.slice(7)),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
export async function newsIntegration({path,method,req,res,body,json,fail,rateLimit}){
 if(!path.startsWith('/api/integrations/news'))return false
 if(!authorized(req)){fail(res,401,'دسترسی به دریافت خبر مجاز نیست.');return true}
 if(await rateLimit(req,res,'news-ingest','',100))return true
 if(path==='/api/integrations/news/state'&&method==='GET'){
  const rows=await pool.query('SELECT id,title_original AS "originalTitle",title_fa AS "titleFa",translation FROM market_news ORDER BY received_at DESC LIMIT 500')
  const usage=await pool.query('SELECT characters FROM news_translation_usage WHERE day=CURRENT_DATE')
  json(res,200,{known:rows.rows,translationCharacters:usage.rows[0]?.characters||0});return true
 }
 if(path!=='/api/integrations/news'||method!=='POST'){fail(res,404,'مسیر پیدا نشد.');return true}
 const input=await body(req,512000),batch=validateNewsBatch(input)
 const chars=Number(input.translationCharacters||0);if(!Number.isInteger(chars)||chars<0||chars>5000){fail(res,400,'سهمیهٔ ترجمه معتبر نیست.');return true}
 const client=await pool.connect()
 try{await client.query('BEGIN')
  for(const v of batch.items)await client.query(`INSERT INTO market_news(id,provider,url,domain,title_original,title_fa,category,translation,published_at,detected_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   ON CONFLICT(id) DO UPDATE SET title_original=excluded.title_original,title_fa=CASE WHEN excluded.title_fa IS NOT NULL THEN excluded.title_fa WHEN market_news.title_original=excluded.title_original THEN market_news.title_fa ELSE NULL END,translation=CASE WHEN excluded.title_fa IS NOT NULL THEN excluded.translation WHEN market_news.title_original=excluded.title_original THEN market_news.translation ELSE 'pending' END,category=excluded.category,received_at=now() WHERE market_news.received_at<=$11`,[v.id,v.provider,v.url,v.domain,v.title,v.fa,v.category,v.translation,v.published,v.detected,batch.at])
  for(const v of batch.sources)await client.query(`INSERT INTO market_news_sources(provider,last_attempt,last_success,status,error) VALUES($1,$2,CASE WHEN $3!='error' THEN $2::timestamptz END,$3,$4)
   ON CONFLICT(provider) DO UPDATE SET last_attempt=excluded.last_attempt,last_success=COALESCE(excluded.last_success,market_news_sources.last_success),status=excluded.status,error=excluded.error WHERE market_news_sources.last_attempt<=excluded.last_attempt`,[v.provider,batch.at,v.status,v.error])
  await client.query('INSERT INTO news_translation_usage VALUES(CURRENT_DATE,$1) ON CONFLICT(day) DO UPDATE SET characters=GREATEST(news_translation_usage.characters,excluded.characters)',[chars])
  await client.query("DELETE FROM market_news WHERE COALESCE(published_at,detected_at)<now()-interval '90 days'")
  await client.query('COMMIT');json(res,200,{ok:true,accepted:batch.items.length})
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 return true
}
export async function newsRoute({path,method,req,res,json,fail}){
 if(path!=='/api/news')return false
 if(method!=='GET'){fail(res,405,'این عملیات مجاز نیست.');return true}
 const u=new URL(req.url,'http://localhost'),q=(u.searchParams.get('q')||'').trim(),category=u.searchParams.get('category')||'all',provider=u.searchParams.get('source')||'all',days=Number(u.searchParams.get('days')||30),page=Number(u.searchParams.get('page')||1)
 if(q.length>100||!['all',...newsCategories].includes(category)||!['all',...newsProviders].includes(provider)||![1,7,30].includes(days)||!Number.isInteger(page)||page<1||page>200){fail(res,400,'فیلتر خبر معتبر نیست.');return true}
 const where=`title_fa IS NOT NULL AND COALESCE(published_at,detected_at)>=now()-($1::int*interval '1 day') AND ($2='all' OR category=$2) AND ($3='all' OR provider=$3) AND ($4='' OR position(lower($4) in lower(title_fa||' '||title_original))>0)`
 const args=[days,category,provider,q]
 const rows=await pool.query(`SELECT id,provider,url,domain,title_fa AS title,title_original AS "originalTitle",category,translation,published_at AS "publishedAt",detected_at AS "detectedAt" FROM market_news WHERE ${where} ORDER BY COALESCE(published_at,detected_at) DESC,id LIMIT 20 OFFSET $5`,[...args,(page-1)*20])
 const total=await pool.query(`SELECT count(*)::int AS count FROM market_news WHERE ${where}`,args)
 const states=await pool.query('SELECT provider,last_attempt AS "lastAttempt",last_success AS "lastSuccess",status,error FROM market_news_sources')
 const sources=newsProviders.map(provider=>({provider,name:sourceNames[provider],...states.rows.find(v=>v.provider===provider)}))
 const successful=sources.map(v=>v.lastSuccess).filter(Boolean).sort((a,b)=>new Date(a)-new Date(b)),updatedAt=successful.at(-1)||null
 json(res,200,{items:rows.rows,total:total.rows[0].count,page,sources,updatedAt,stale:!updatedAt||Date.now()-new Date(updatedAt).getTime()>3*3600000});return true
}
