import {useEffect,useState} from 'react'
import type {FormEvent} from 'react'
import {Mail,ShieldCheck} from 'lucide-react'
import {api} from './api'
import type {User} from './api'

export default function AccountEmail({user,onUpdate}:{user:User;onUpdate:(user:User)=>void}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[token,setToken]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const [cooldown,setCooldown]=useState(false)
 useEffect(()=>{
   if(!cooldown)return
   const timer=window.setTimeout(()=>setCooldown(false),60000)
   return()=>window.clearTimeout(timer)
 },[cooldown])
 const submit=async(event:FormEvent)=>{
   event.preventDefault();if(busy)return
   setBusy(true);setError('');setMessage('')
   try{
     if(!token){
       const result=await api<{verificationToken:string}>('/account/email/start','POST',{email})
       setToken(result.verificationToken);setCooldown(true)
       setMessage('کد تأیید در صف ارسال است. صندوق ورودی و پوشهٔ هرزنامه را بررسی کنید.')
     }else{
       const result=await api<{user:User}>('/account/email/verify','POST',{verificationToken:token,code})
       onUpdate(result.user);setToken('');setCode('')
     }
   }catch(cause){setError((cause as Error).message)}
   finally{setBusy(false)}
 }
 const resend=async()=>{
   if(busy||cooldown)return
   setBusy(true);setError('')
   try{
     await api('/account/email/resend','POST',{verificationToken:token})
     setCode('');setCooldown(true);setMessage('کد جدید در صف ارسال است.')
   }catch(cause){setError((cause as Error).message)}
   finally{setBusy(false)}
 }
 if(user.email)return <label>ایمیل<div className="account-verified-email"><input value={user.email} disabled dir="ltr"/>{user.emailVerifiedAt&&<small><ShieldCheck size={15}/>تأیید شده</small>}</div></label>
 return <section className="account-email" aria-labelledby="account-email-title"><h3 id="account-email-title"><Mail size={18}/>افزودن ایمیل</h3>
   <form className="stack-form" onSubmit={submit} aria-busy={busy}>
     {!token?<label>ایمیل اختیاری<input type="email" required maxLength={160} autoComplete="email" dir="ltr" disabled={busy} value={email} onChange={event=>setEmail(event.target.value)} placeholder="name@example.com"/></label>
       :<><p className="muted">کد ارسال‌شده به <bdi>{email}</bdi> را وارد کنید.</p><label>کد تأیید ایمیل<input autoFocus inputMode="numeric" autoComplete="one-time-code" required maxLength={6} pattern="[0-9۰-۹٠-٩]{6}" dir="ltr" value={code} disabled={busy} onChange={event=>setCode(event.target.value)}/></label></>}
     {error&&<div className="form-error" role="alert">{error}</div>}
     {message&&<p className="muted" role="status">{message}</p>}
     <div className="account-email-actions"><button className="button secondary" disabled={busy}>{busy?'لطفاً صبر کنید…':token?'تأیید ایمیل':'ارسال کد تأیید'}</button>
       {token&&<><button type="button" className="button secondary" disabled={busy||cooldown} onClick={resend}>{cooldown?'ارسال مجدد پس از یک دقیقه':'ارسال مجدد'}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>{setToken('');setCode('');setError('');setMessage('')}}>تغییر ایمیل</button></>}
     </div>
   </form>
 </section>
}
