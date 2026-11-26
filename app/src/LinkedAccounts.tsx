import {useCallback,useEffect,useState} from 'react'
import type {FormEvent} from 'react'
import SocialIcon from './SocialIcon'
import {api} from './api'

const labels={google:'گوگل',telegram:'تلگرام'}
type Provider=keyof typeof labels

// Linking or removing a sign-in method asks for the password first, so a borrowed
// session cannot plant a way back in. Owners can always see and remove what is linked.
export default function LinkedAccounts({hasPassword}:{hasPassword:boolean}){
  const [data,setData]=useState<{providers:Provider[];linked:Provider[]}>({providers:[],linked:[]})
  const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const load=useCallback(()=>api<typeof data>('/auth/social/providers').then(setData).catch(()=>{}),[])
  useEffect(()=>{void load()},[load])
  const shown=[...new Set([...data.linked,...data.providers])]
  if(!shown.length)return null
  const prove=async()=>{
    if(!hasPassword)return
    if(!password)throw Error('برای تغییر روش‌های ورود، رمز عبور فعلی را وارد کنید.')
    await api('/account/reauth','POST',{password})
  }
  const run=async(task:()=>Promise<void>)=>{
    if(busy)return
    setBusy(true);setError('');setMessage('')
    try{await task()}catch(cause){setError((cause as Error).message)}
    finally{setBusy(false)}
  }
  const link=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    const form=event.currentTarget
    void run(async()=>{await prove();form.submit()})
  }
  const unlink=(provider:Provider)=>run(async()=>{
    await prove();await api('/account/identities','DELETE',{provider});setPassword('');await load()
    setMessage('اتصال قطع شد و نشست‌های دیگر خارج شدند.')
  })
  return <section className="stack-form" aria-label="روش‌های ورود متصل">
    <h3>روش‌های ورود متصل</h3>
    {hasPassword&&<label>رمز عبور فعلی برای تغییر اتصال‌ها<input type="password" dir="ltr" autoComplete="current-password" maxLength={128} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)}/></label>}
    <div className="social-actions">{shown.map(provider=>data.linked.includes(provider)
      ?<button key={provider} type="button" className={'social-login-button social-'+provider} disabled={busy} onClick={()=>void unlink(provider)}><SocialIcon provider={provider}/><span>قطع اتصال {labels[provider]}</span></button>
      :<form key={provider} action={'/api/auth/social/'+provider+'/start'} method="post" onSubmit={link}><button className={'social-login-button social-'+provider} type="submit" disabled={busy}><SocialIcon provider={provider}/><span>اتصال {labels[provider]}</span></button></form>)}</div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {message&&<p className="form-success" role="status">{message}</p>}
  </section>
}
