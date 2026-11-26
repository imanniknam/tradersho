import {useState} from 'react'
import type {FormEvent} from 'react'
import {Link} from 'react-router-dom'
import {ShieldCheck} from 'lucide-react'
import {api} from './api'

export interface MfaState {required:boolean;configured:boolean;enrolled:boolean;verified:boolean}

export default function StaffMfa({state,onVerified}:{state:MfaState;onVerified:()=>void}){
  const [password,setPassword]=useState(''),[secret,setSecret]=useState(''),[code,setCode]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const enrolling=!state.enrolled&&!secret
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(busy)return
    setBusy(true);setError('')
    try{
      if(enrolling){setSecret((await api<{secret:string}>('/admin/mfa/enroll','POST',{password})).secret);setPassword('')}
      else{await api('/admin/mfa/verify','POST',{code});onVerified()}
    }catch(cause){setError((cause as Error).message)}
    finally{setBusy(false)}
  }
  return <div className="splash"><ShieldCheck size={34}/><h1>احراز دومرحله‌ای</h1>
    {!state.configured?<p role="alert">احراز دومرحله‌ای روی سرور پیکربندی نشده است. با مدیر سرور هماهنگ کنید.</p>:
    <form className="stack-form" onSubmit={submit} aria-busy={busy}>
      {enrolling?<><p>برای ورود به پنل مدیریت، رمز عبور خود را وارد کنید تا کلید فعال‌سازی ساخته شود.</p><label>رمز عبور<input required type="password" dir="ltr" autoComplete="current-password" maxLength={128} disabled={busy} value={password} onChange={event=>setPassword(event.target.value)}/></label></>
      :<>{secret&&<><p>این کلید را به‌صورت دستی در برنامهٔ Authenticator اضافه کنید و خصوصی نگه دارید.</p><code dir="ltr" data-testid="mfa-secret" style={{userSelect:'all',wordBreak:'break-all'}}>{secret}</code></>}
        <label>کد ۶ رقمی برنامه<input required autoFocus dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" disabled={busy} value={code} onChange={event=>setCode(event.target.value)}/></label></>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <button className="button primary" disabled={busy}>{busy?'لطفاً صبر کنید…':enrolling?'دریافت کلید':'تأیید'}</button>
    </form>}
    <Link className="back-link" to="/panel">بازگشت به پنل کاربری</Link></div>
}
