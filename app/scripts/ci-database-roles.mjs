import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
if(!process.env.DATABASE_URL?.endsWith('_qa'))throw Error('Dedicated QA database required')
const admin=new pg.Pool({connectionString:process.env.DATABASE_URL})
const url=role=>{const u=new URL(process.env.DATABASE_URL);u.username=role;u.password='qa-ci-roles-only';return u.href}
const panel=new pg.Pool({connectionString:url('tradersho_panel')}),owner=new pg.Pool({connectionString:url('tradersho_owner_mail')})
const fixture=randomUUID()
try{
 const missing=!(await admin.query("SELECT to_regclass('owner_mail.mail_owners') AS table_name")).rows[0].table_name
 if(missing){
  await admin.query("INSERT INTO public.users(id,name,email,password_hash) VALUES($1,'Role QA',$2,'qa-unused')",[fixture,fixture+'@example.test'])
  await admin.query('CREATE TABLE public.mail_owners(user_id text PRIMARY KEY REFERENCES public.users(id),secret text,pending text,last_counter bigint NOT NULL DEFAULT -1)')
  await admin.query("INSERT INTO public.mail_owners(user_id,secret,last_counter) VALUES($1,'qa-existing-ciphertext',41)",[fixture])
 }
 const sql=await readFile(new URL('../../deploy/vps/database-roles.sql',import.meta.url),'utf8')
 await admin.query(sql)
 // Disposable role passwords are explicit so CI also tests SCRAM-authenticated connections.
 for(const role of ['tradersho_panel','tradersho_owner_mail'])await admin.query(`ALTER ROLE ${role} PASSWORD 'qa-ci-roles-only'`)
 if(missing){
  const row=(await admin.query('SELECT secret,last_counter FROM owner_mail.mail_owners WHERE user_id=$1',[fixture])).rows[0]
  assert.equal(row.secret,'qa-existing-ciphertext');assert.equal(Number(row.last_counter),41)
  assert.equal((await admin.query("SELECT to_regclass('public.mail_owners') AS table_name")).rows[0].table_name,null)
  await admin.query('DELETE FROM owner_mail.mail_owners WHERE user_id=$1',[fixture]);await admin.query('DELETE FROM public.users WHERE id=$1',[fixture])
 }
 const {pool,migrate}=await import('../server/db.mjs')
 // Run all additive migrations with the real non-superuser role.
 pool.options.connectionString=url('tradersho_panel')
 await migrate();await pool.end()
 for(const db of [panel,owner]){
  const {rows:[role]}=await db.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')
  assert.ok(Object.values(role).every(v=>v===false))
 }
 await owner.query('SELECT id,email,password_hash,account_status FROM owner_mail.owner_identity LIMIT 0')
 await owner.query('SELECT token_hash,user_id,expires_at FROM owner_mail.owner_sessions LIMIT 0')
 await owner.query('SELECT * FROM owner_mail.mail_owners LIMIT 0')
 const views=(await admin.query("SELECT reloptions FROM pg_class WHERE oid IN ('owner_mail.owner_identity'::regclass,'owner_mail.owner_sessions'::regclass)")).rows
 assert.ok(views.every(view=>view.reloptions.includes('security_barrier=true')))
 for(const query of ['SELECT * FROM owner_mail.mail_owners','UPDATE owner_mail.mail_owners SET secret=NULL','DELETE FROM owner_mail.mail_owners','UPDATE owner_mail.authorized_owner SET user_id=user_id', 'SET ROLE tradersho_owner_mail','ALTER ROLE tradersho_panel SUPERUSER'])
  await assert.rejects(panel.query(query),error=>error.code==='42501')
 for(const query of ["UPDATE public.users SET password_hash='stolen'",'DELETE FROM public.sessions','CREATE TABLE owner_mail.unexpected(id int)','SELECT * FROM public.users','SELECT id,email,password_hash FROM public.users','SELECT * FROM owner_mail.authorized_owner','UPDATE owner_mail.authorized_owner SET user_id=user_id'])
  await assert.rejects(owner.query(query),error=>error.code==='42501')
 console.log('PASS database roles: full panel bootstrap without superuser; private MFA isolation, owner-only identity/session views, denied cross-service writes and escalation')
}finally{await Promise.all([admin.end(),panel.end(),owner.end()])}
