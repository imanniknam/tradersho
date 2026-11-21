import {useCallback,useEffect,useState} from 'react'
import type {FormEvent} from 'react'
import {ArrowLeft,ArrowRight,Mail,Search,ShieldCheck,UserPlus,Users,X} from 'lucide-react'
import {api} from './api'
import './admin-users.css'

interface ManagedUser {
 id:string;name:string;email:string;status:'active'|'invited'|'suspended';version:number;
 createdAt:string;emailVerifiedAt:string|null;isAdmin:boolean;isSupportAgent:boolean;sessionCount:number;providers:string[]
}
interface AuditEntry {id:string;action:string;actorName:string;subjectId:string;createdAt:string;details:Record<string,unknown>}
interface Session {id:string;createdAt:string;expiresAt:string}
interface Directory {users:ManagedUser[];total:number;pageSize:number;summary:Record<'total'|'active'|'suspended'|'invited',number>}
const statusLabels={active:'فعال',invited:'منتظر تأیید ایمیل',suspended:'تعلیق‌شده'}
const auditLabels:Record<string,string>={invite:'دعوت کاربر',delete:'حذف حساب',update:'ویرایش حساب و نقش‌ها',revoke_sessions:'خروج نشست‌ها',send_access_link:'ارسال لینک ورود و بازیابی',unlink_identity:'قطع اتصال روش ورود'}
const date=(value:string)=>new Date(value).toLocaleString('fa-IR',{dateStyle:'medium',timeStyle:'short'})
const number=(value:number)=>value.toLocaleString('fa-IR')

function UserDetails({id,actorId,onChange,onClose}:{id:string;actorId:string;onChange:()=>void;onClose:()=>void}){
 const [user,setUser]=useState<ManagedUser|null>(null)
 const [counts,setCounts]=useState({tickets:0,riskSetups:0})
 const [sessions,setSessions]=useState<Session[]>([])
 const [audit,setAudit]=useState<AuditEntry[]>([])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const [deleting,setDeleting]=useState(false),[confirmEmail,setConfirmEmail]=useState('')
 const [revision,setRevision]=useState(0)
 useEffect(()=>{
   let active=true
   Promise.all([api<{user:ManagedUser;counts:typeof counts}>('/admin/users/'+id),
     api<{sessions:Session[]}>('/admin/users/'+id+'/sessions'),
     api<{entries:AuditEntry[]}>('/admin/users/audit?userId='+id)]).then(([data,sessionData,auditData])=>{
       if(active){setUser(data.user);setCounts(data.counts);setSessions(sessionData.sessions);setAudit(auditData.entries)}
     }).catch(cause=>{if(active)setError(cause.message)})
   return()=>{active=false}
 },[id,revision])
 const perform=async(path:string,method:string,input:Record<string,unknown>,success:string)=>{
   if(!user||busy)return
   setBusy(true);setError('');setMessage('')
   try{
     await api('/admin/users/'+id+path,method,{...input,version:user.version})
     if(method==='DELETE'&&!path){onChange();onClose();return}
     setMessage(success);setRevision(value=>value+1);onChange()
   }catch(cause){setError((cause as Error).message)}
   finally{setBusy(false)}
 }
 const submit=(event:FormEvent)=>{event.preventDefault();if(user)void perform('','PATCH',{
   name:user.name,email:user.email,status:user.status,isAdmin:user.isAdmin,isSupportAgent:user.isSupportAgent,
 },'تغییرات ذخیره شد.')}
 return <section className="surface admin-user-detail" aria-labelledby="user-detail-title">
   <header><h2 id="user-detail-title">جزئیات کاربر</h2><button className="icon-button" aria-label="بستن جزئیات کاربر" onClick={onClose}><X size={20}/></button></header>
   {error&&<p className="form-error" role="alert">{error}</p>}
   {message&&<p className="form-success" role="status">{message}</p>}
   {!user?<p role="status">در حال دریافت…</p>:<>
     <div className="admin-user-meta"><span>عضویت {date(user.createdAt)}</span><span>{user.emailVerifiedAt?'ایمیل تأیید شده':'تأیید ایمیل ثبت نشده'}</span><span>{number(counts.tickets)} تیکت · {number(counts.riskSetups)} ستاپ ریسک</span></div>
     <form className="stack-form" onSubmit={submit}>
       <fieldset disabled={busy}>
         <label>نام و نام خانوادگی<input required minLength={2} maxLength={80} value={user.name} onChange={event=>setUser({...user,name:event.target.value})}/></label>
         <label>ایمیل<input required type="email" maxLength={160} dir="ltr" value={user.email} disabled={id===actorId} onChange={event=>setUser({...user,email:event.target.value})}/></label>
         <label>وضعیت حساب<select value={user.status} disabled={id===actorId} onChange={event=>setUser({...user,status:event.target.value as ManagedUser['status']})}>
           {Object.entries(statusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}
         </select></label>
         <div className="admin-role-options">
           <label><input type="checkbox" checked={user.isAdmin} disabled={id===actorId} onChange={event=>setUser({...user,isAdmin:event.target.checked})}/>مدیریت کاربران</label>
           <label><input type="checkbox" checked={user.isSupportAgent} onChange={event=>setUser({...user,isSupportAgent:event.target.checked})}/>کارشناس پشتیبانی</label>
         </div>
         <p className="muted">تغییر ایمیل به تأیید آدرس جدید نیاز دارد. حساب دعوت‌شده با لینک ایمیل فعال می‌شود.</p>
         <button className="button primary" disabled={busy}>ذخیرهٔ تغییرات</button>
       </fieldset>
     </form>
     <div className="admin-user-actions"><button className="button secondary" disabled={busy||user.status==='suspended'} onClick={()=>void perform('/reset-password','POST',{},'لینک در صف ارسال ایمیل قرار گرفت.')}><Mail size={17}/>ارسال لینک فعال‌سازی / بازیابی</button></div>
     <section><h3>روش‌های ورود</h3>{!user.providers.length?<p className="muted">ورود با ایمیل و رمز عبور</p>:user.providers.map(provider=><div className="admin-detail-row" key={provider}><span>{provider==='telegram'?'تلگرام':'گوگل'}</span><button className="button secondary" disabled={busy} onClick={()=>void perform('/identities','DELETE',{provider},'روش ورود قطع شد.')}>قطع اتصال</button></div>)}</section>
     <section><header><h3>نشست‌های فعال ({number(sessions.length)})</h3><button className="button secondary" disabled={busy||!sessions.length} onClick={()=>void perform('/sessions','DELETE',{},'نشست‌ها بسته شدند.')}>خروج از همهٔ دستگاه‌ها</button></header>
       {!sessions.length?<p className="muted">نشست فعالی وجود ندارد.</p>:sessions.map(session=><div className="admin-detail-row" key={session.id}><div><strong>ورود {date(session.createdAt)}</strong><small>انقضا {date(session.expiresAt)}</small></div><button className="button secondary" disabled={busy} onClick={()=>void perform('/sessions','DELETE',{sessionId:session.id},'نشست بسته شد.')}>خروج</button></div>)}
     </section>
     <section><h3>تاریخچهٔ مدیریت</h3>{!audit.length?<p className="muted">عملیاتی ثبت نشده است.</p>:<ol className="admin-audit-list">{audit.map(entry=><li key={entry.id}><strong>{auditLabels[entry.action]||entry.action}</strong><span>{entry.actorName} · {date(entry.createdAt)}</span></li>)}</ol>}</section>
     {id!==actorId&&<section className="admin-delete-box"><h3>حذف حساب کاربری</h3><p>حساب، نشست‌ها، تیکت‌ها و ستاپ‌های این کاربر حذف می‌شوند. برای ورود دوباره باید ثبت‌نام کند.</p>
       {!deleting?<button className="button secondary" disabled={busy} onClick={()=>setDeleting(true)}>بررسی حذف حساب</button>:<div className="stack-form"><label>برای تأیید حذف، ایمیل کاربر را وارد کنید<input dir="ltr" type="email" value={confirmEmail} onChange={event=>setConfirmEmail(event.target.value)} autoComplete="off"/></label><div className="admin-user-actions"><button className="button danger" disabled={busy||confirmEmail!==user.email} onClick={()=>void perform('','DELETE',{confirmEmail},'')}>حذف دائمی حساب</button><button className="button secondary" disabled={busy} onClick={()=>setDeleting(false)}>انصراف</button></div></div>}
     </section>}
   </>}
 </section>
}

export default function AdminUsers({actorId}:{actorId:string}){
 const [data,setData]=useState<Directory|null>(null),[query,setQuery]=useState(''),[search,setSearch]=useState('')
 const [status,setStatus]=useState('all'),[role,setRole]=useState('all'),[page,setPage]=useState(1)
 const [selected,setSelected]=useState(''),[revision,setRevision]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 const [inviteOpen,setInviteOpen]=useState(false),[inviteName,setInviteName]=useState(''),[inviteEmail,setInviteEmail]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const refresh=useCallback(()=>setRevision(value=>value+1),[])
 useEffect(()=>{
   let active=true
   setLoading(true);setError('')
   api<Directory>('/admin/users?'+new URLSearchParams({q:search,status,role,page:String(page)})).then(result=>{
     if(active)setData(result)
   }).catch(cause=>{if(active)setError(cause.message)}).finally(()=>{if(active)setLoading(false)})
   return()=>{active=false}
 },[search,status,role,page,revision])
 const invite=async(event:FormEvent)=>{
   event.preventDefault();if(busy)return
   setBusy(true);setError('');setMessage('')
   try{await api('/admin/users','POST',{name:inviteName,email:inviteEmail});setInviteOpen(false);setInviteName('');setInviteEmail('');setMessage('حساب ایجاد شد و لینک فعال‌سازی در صف ایمیل قرار گرفت.');refresh()}
   catch(cause){setError((cause as Error).message)}
   finally{setBusy(false)}
 }
 return <div className="admin-users">
   <div className="page-head"><div><h1>مدیریت کاربران</h1><p className="muted">حساب‌ها، دسترسی‌ها و نشست‌های ورود</p></div><button className="button primary" onClick={()=>setInviteOpen(value=>!value)}><UserPlus size={18}/>دعوت کاربر</button></div>
   {error&&<p className="form-error" role="alert">{error}<button type="button" className="button secondary" onClick={refresh}>تلاش مجدد</button></p>}
   {message&&<p className="form-success" role="status">{message}</p>}
   {data&&<div className="admin-user-summary">{([
     ['total','کل کاربران',Users],['active','فعال',ShieldCheck],['invited','منتظر تأیید',Mail],
   ] as const).map(([key,label,Icon])=><div className="surface" key={key}><Icon size={21}/><span>{label}</span><strong>{number(data.summary[key])}</strong></div>)}</div>}
   {inviteOpen&&<section className="surface admin-invite"><h2>دعوت کاربر جدید</h2><p className="muted">کاربر با لینک ایمیل، آدرس خود را تأیید و رمز شخصی تعیین می‌کند.</p><form className="stack-form" onSubmit={invite}><label>نام و نام خانوادگی<input required minLength={2} maxLength={80} disabled={busy} value={inviteName} onChange={event=>setInviteName(event.target.value)}/></label><label>ایمیل<input required type="email" maxLength={160} dir="ltr" disabled={busy} value={inviteEmail} onChange={event=>setInviteEmail(event.target.value)}/></label><div className="admin-user-actions"><button className="button primary" disabled={busy}>{busy?'در حال ثبت…':'ساخت حساب و ارسال دعوت'}</button><button type="button" className="button secondary" onClick={()=>setInviteOpen(false)} disabled={busy}>انصراف</button></div></form></section>}
   <div className="admin-users-layout">
     <section className="surface admin-directory" aria-label="فهرست کاربران">
       <form className="admin-users-filters" onSubmit={event=>{event.preventDefault();setSearch(query.trim());setPage(1)}}>
         <label className="admin-search"><span>جستجوی نام یا ایمیل</span><div><Search size={18}/><input type="search" value={query} maxLength={160} onChange={event=>setQuery(event.target.value)} placeholder="نام یا ایمیل"/><button type="submit" className="button secondary">جستجو</button></div></label>
         <label>وضعیت<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1)}}><option value="all">همهٔ وضعیت‌ها</option>{Object.entries(statusLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
         <label>نقش<select value={role} onChange={event=>{setRole(event.target.value);setPage(1)}}><option value="all">همهٔ نقش‌ها</option><option value="admin">مدیر</option><option value="support">پشتیبانی</option><option value="user">کاربر</option></select></label>
       </form>
       <div className="admin-table-scroll" aria-busy={loading}><table><caption className="sr-only">فهرست کاربران پنل</caption><thead><tr><th>کاربر</th><th>وضعیت</th><th>نقش</th><th>نشست</th><th>عملیات</th></tr></thead><tbody>{data?.users.map(user=><tr key={user.id} className={selected===user.id?'selected':''}><td><strong>{user.name}</strong><bdi>{user.email}</bdi></td><td><span className={'admin-status status-'+user.status}>{statusLabels[user.status]}</span></td><td>{[user.isAdmin?'مدیر':'',user.isSupportAgent?'پشتیبانی':''].filter(Boolean).join('، ')||'کاربر'}</td><td>{number(user.sessionCount)}</td><td><button className="button secondary" onClick={()=>setSelected(user.id)} aria-expanded={selected===user.id}>مدیریت</button></td></tr>)}</tbody></table></div>
       {loading&&<p role="status" className="muted">در حال دریافت…</p>}
       {data&&!data.users.length&&!loading&&<p className="muted">کاربری با این فیلترها پیدا نشد.</p>}
       <div className="admin-pagination"><span>{number(data?.total||0)} کاربر · صفحهٔ {number(page)}</span><div><button className="icon-button" aria-label="صفحه قبل" disabled={page===1||loading} onClick={()=>setPage(value=>value-1)}><ArrowRight size={18}/></button><button className="icon-button" aria-label="صفحه بعد" disabled={loading||page*25>=(data?.total||0)} onClick={()=>setPage(value=>value+1)}><ArrowLeft size={18}/></button></div></div>
     </section>
     {selected&&<UserDetails key={selected} id={selected} actorId={actorId} onChange={refresh} onClose={()=>setSelected('')}/>}
   </div>
 </div>
}
