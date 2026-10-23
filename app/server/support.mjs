import { randomUUID } from 'node:crypto'
import { pool } from './db.mjs'
export async function migrateSupport(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS support_agents (user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category varchar(20) NOT NULL DEFAULT 'general';
    ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority varchar(10) NOT NULL DEFAULT 'normal';
    ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
    ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS request_id uuid;
    ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
    ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check CHECK (status IN ('open','in_progress','answered','closed'));
    CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_request ON support_tickets(user_id,request_id) WHERE request_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS support_messages (
      id text PRIMARY KEY, ticket_id text NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      author_id text NOT NULL REFERENCES users(id), author_role varchar(10) NOT NULL CHECK(author_role IN ('user','agent')),
      body varchar(5000) NOT NULL, request_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(ticket_id,request_id)
    );
    CREATE INDEX IF NOT EXISTS support_messages_ticket ON support_messages(ticket_id,created_at,id);
    INSERT INTO support_messages(id,ticket_id,author_id,author_role,body,created_at)
      SELECT 'initial-'||t.id,t.id,t.user_id,'user',t.message,t.created_at FROM support_tickets t WHERE NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id=t.id)
      ON CONFLICT(id) DO NOTHING;
    CREATE INDEX IF NOT EXISTS support_ticket_queue ON support_tickets(status,updated_at DESC);
  `)
}
const uuid = v => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const validText=(v,min,max)=> typeof v==='string' && v.trim().length>=min && v.trim().length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
const statuses=['open','in_progress','answered','closed']
const ticketColumns=`t.id,t.subject,t.status,t.category,t.priority,t.version,t.created_at AS "createdAt",t.updated_at AS "updatedAt",u.name AS "ownerName",u.email AS "ownerEmail"`
export async function supportRoute({path,method,user,req,res,body,json,fail,rateLimit}) {
  const agentPath=path.startsWith('/api/admin/support/')
  if(path!=='/api/tickets' && !path.startsWith('/api/tickets/') && !agentPath)return false
  const isAgent=(await pool.query('SELECT 1 FROM support_agents WHERE user_id=$1',[user.id])).rowCount>0
  if(agentPath&&!isAgent){fail(res,403,'دسترسی به صف پشتیبانی مجاز نیست.');return true}
  const list=path==='/api/tickets'||path==='/api/admin/support/tickets'
  if(list&&method==='GET'){
    const url=new URL(req.url,'http://localhost'),status=url.searchParams.get('status')||'all'
    if(status!=='all'&&!statuses.includes(status)){fail(res,400,'وضعیت نامعتبر است.');return true}
    const category=url.searchParams.get('category')||'all',query=(url.searchParams.get('q')||'').trim()
    if(!['all','general','technical','account'].includes(category)||query.length>100){fail(res,400,'فیلتر نامعتبر است.');return true}
    const page=Math.max(1,Math.min(200,Number(url.searchParams.get('page'))||1))
    if(!Number.isInteger(page)){fail(res,400,'صفحه نامعتبر است.');return true}
    const owner=agentPath?null:user.id
    const where=`($1::text IS NULL OR t.user_id=$1) AND ($2::text='all' OR t.status=$2) AND ($3::text='all' OR t.category=$3) AND ($4::text='' OR position(lower($4) in lower(t.subject))>0)`
    const {rows}=await pool.query(`SELECT ${ticketColumns},(SELECT count(*)::int FROM support_messages m WHERE m.ticket_id=t.id) AS "messageCount" FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE ${where} ORDER BY t.updated_at DESC,t.id LIMIT 25 OFFSET $5`,[owner,status,category,query,(page-1)*25])
    const count=await pool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE t.status!='closed')::int AS active,count(*) FILTER(WHERE t.status='answered')::int AS answered FROM support_tickets t WHERE ($1::text IS NULL OR t.user_id=$1)`,[owner])
    const filtered=await pool.query(`SELECT count(*)::int AS total FROM support_tickets t WHERE ${where}`,[owner,status,category,query])
    json(res,200,{tickets:rows,summary:count.rows[0],total:filtered.rows[0].total,page});return true
  }
  if(path==='/api/tickets'&&method==='POST'){
    const input=await body(req)
    if(!validText(input.subject,3,100)||!validText(input.message,10,2000)||!['general','technical','account'].includes(input.category)||!['low','normal','high'].includes(input.priority)||!uuid(input.requestId)){fail(res,400,'موضوع (۳ تا ۱۰۰ نویسه)، پیام (۱۰ تا ۲۰۰۰ نویسه)، دسته و اولویت معتبر را وارد کنید.');return true}
    if(await rateLimit(req,res,'ticket-create',user.id,10))return true
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      const result=await client.query(`INSERT INTO support_tickets(id,user_id,subject,message,category,priority,request_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,request_id) WHERE request_id IS NOT NULL DO NOTHING RETURNING id`,[randomUUID(),user.id,input.subject.trim(),input.message.trim(),input.category,input.priority,input.requestId])
      let id=result.rows[0]?.id
      if(id)await client.query(`INSERT INTO support_messages(id,ticket_id,author_id,author_role,body,request_id) VALUES($1,$2,$3,'user',$4,$5)`,[randomUUID(),id,user.id,input.message.trim(),input.requestId])
      else { const previous=(await client.query('SELECT * FROM support_tickets WHERE user_id=$1 AND request_id=$2',[user.id,input.requestId])).rows[0]; if(previous.subject!==input.subject.trim()||previous.message!==input.message.trim()||previous.category!==input.category||previous.priority!==input.priority)throw Object.assign(new Error('شناسهٔ درخواست قبلاً استفاده شده است.'),{status:409});id=previous.id }
      await client.query('COMMIT');json(res,result.rowCount?201:200,{id})
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    return true
  }
  const match=path.match(/^\/api\/(?:admin\/support\/)?tickets\/([a-f0-9-]{36})(?:\/(messages|status))?$/i)
  if(!match){fail(res,404,'مسیر پشتیبانی پیدا نشد.');return true}
  const [,id,action]=match
  if(!action&&method==='GET'){
    const {rows}=await pool.query(`SELECT ${ticketColumns} FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=$1 AND ($2::boolean OR t.user_id=$3)`,[id,agentPath,user.id])
    if(!rows.length){fail(res,404,'تیکت پیدا نشد.');return true}
    const messages=await pool.query(`SELECT m.id,m.body,m.author_role AS "authorRole",u.name AS "authorName",m.created_at AS "createdAt" FROM support_messages m JOIN users u ON u.id=m.author_id WHERE ticket_id=$1 ORDER BY m.created_at,m.id LIMIT 501`,[id])
    json(res,200,{ticket:rows[0],messages:messages.rows});return true
  }
  if((action==='messages'||action==='status')&&method==='POST'){
    const input=await body(req)
    if(!Number.isInteger(input.version)||input.version<0||!uuid(input.requestId)){fail(res,400,'نسخه یا شناسهٔ درخواست نامعتبر است.');return true}
    if(action==='messages'&&!validText(input.message,1,5000)){fail(res,400,'پیام باید بین ۱ تا ۵۰۰۰ نویسه باشد.');return true}
    if(action==='status'&&!(agentPath?statuses:['open','closed']).includes(input.status)){fail(res,400,'وضعیت نامعتبر است.');return true}
    if(await rateLimit(req,res,'ticket-update',user.id,60))return true
    const client=await pool.connect()
    try{
      await client.query('BEGIN')
      const {rows}=await client.query('SELECT * FROM support_tickets WHERE id=$1 AND ($2::boolean OR user_id=$3) FOR UPDATE',[id,agentPath,user.id])
      const ticket=rows[0]
      if(!ticket){await client.query('ROLLBACK');fail(res,404,'تیکت پیدا نشد.');return true}
      if(action==='messages'){
        const previous=await client.query('SELECT author_id,body FROM support_messages WHERE ticket_id=$1 AND request_id=$2',[id,input.requestId])
        if(previous.rowCount){await client.query('ROLLBACK');if(previous.rows[0].author_id!==user.id||previous.rows[0].body!==input.message.trim())fail(res,409,'شناسهٔ درخواست قبلاً استفاده شده است.');else json(res,200,{ok:true});return true}
      }
      if(ticket.version!==input.version){await client.query('ROLLBACK');fail(res,409,'این گفتگو تغییر کرده است؛ آن را تازه کنید و دوباره تلاش کنید.');return true}
      if(action==='messages'&&ticket.status==='closed'){await client.query('ROLLBACK');fail(res,409,'برای ارسال پیام ابتدا تیکت را بازگشایی کنید.');return true}
      if(action==='messages'){
        const count=await client.query('SELECT count(*)::int AS n FROM support_messages WHERE ticket_id=$1',[id])
        if(count.rows[0].n>=500){await client.query('ROLLBACK');fail(res,409,'این گفتگو به سقف پیام رسیده است؛ تیکت جدید ایجاد کنید.');return true}
        await client.query('INSERT INTO support_messages(id,ticket_id,author_id,author_role,body,request_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,user.id,agentPath?'agent':'user',input.message.trim(),input.requestId])
      }
      const nextStatus=action==='status'?input.status:agentPath?'answered':'open'
      await client.query('UPDATE support_tickets SET status=$1,version=version+1,updated_at=now() WHERE id=$2',[nextStatus,id])
      await client.query('COMMIT');json(res,200,{ok:true})
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    return true
  }
  fail(res,405,'این عملیات مجاز نیست.');return true
}
