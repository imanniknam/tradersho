import { SocialLogin } from './SocialLogin'
import CaptchaField from './CaptchaField'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, ArrowLeft, BookOpen, Eye, EyeOff, Info, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { api } from './api'
import { ThemeToggle } from './theme'
import type { User } from './api'

type Props = { user: User | null; loading: boolean; setUser: (user: User | null) => void; brand: React.ReactNode; mobileBrand: React.ReactNode; spinner: React.ReactNode }
const rules = [
  { label: 'حداقل ۸ کاراکتر', test: (value: string) => [...value].length >= 8 },
  { label: 'حرف کوچک انگلیسی', test: (value: string) => /[a-z]/.test(value) },
  { label: 'حرف بزرگ انگلیسی', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'عدد', test: (value: string) => /[0-9]/.test(value) },
  { label: 'کاراکتر خاص', test: (value: string) => /[^A-Za-z0-9\s]/u.test(value) },
]

export default function AuthScreen({ user, loading, setUser, brand, mobileBrand, spinner }: Props) {
  const navigate = useNavigate()
  const [params,setParams] = useSearchParams()
  const socialRegister = params.get('social') === 'register'
  const [verificationToken,setVerificationToken] = useState('')
  const [code,setCode] = useState('')
  const [delivery,setDelivery] = useState('')
  const [resendAt,setResendAt] = useState(0)
  const [socialReady,setSocialReady] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [name,setName]=useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [captcha,setCaptcha]=useState({captchaId:'',captchaAnswer:''}),[captchaReady,setCaptchaReady]=useState(false),[captchaRevision,setCaptchaRevision]=useState(0)
  const updateCaptcha=useCallback((v:{captchaId:string;captchaAnswer:string})=>setCaptcha(v),[])
  useEffect(() => {
    if (!socialRegister) return
    let active = true
    api<{email:string}>('/auth/social/register').then(result => {
      if (active) { setEmail(result.email); setSocialReady(true) }
    }).catch(cause => { if (active) setError(cause.message) })
    return () => { active = false }
  },[socialRegister])
  useEffect(() => {
    if (!resendAt) return
    const timer = window.setTimeout(() => setResendAt(0),Math.max(0,resendAt-Date.now()))
    return () => window.clearTimeout(timer)
  }, [resendAt])
  const errorRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(error)errorRef.current?.focus()},[error])
  const next = params.get('next')
  const destination = next && /^\/(panel|admin)(\/|$)/.test(next) ? next : '/panel'
  useEffect(() => { if (!loading && user) navigate(destination, { replace: true }) }, [loading, user, destination, navigate])
  const beginVerification = (token: string) => {
    setVerificationToken(token)
    setPassword('')
    setConfirmPassword('')
    setCode('')
    setResendAt(Date.now()+60000)
    setDelivery('کد تأیید در صف ارسال است. صندوق ورودی و پوشهٔ هرزنامه را بررسی کنید.')
  }
  const submitVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (!verificationToken) {
        const data = await api<{verificationToken:string}>('/auth/social/register','POST',{email})
        beginVerification(data.verificationToken)
      } else {
        const data = await api<{user:User}>('/auth/signup/verify','POST',{verificationToken,code})
        setUser(data.user)
        navigate(destination,{replace:true})
      }
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const resend = async () => {
    if (busy || resendAt) return
    setBusy(true)
    setError('')
    try {
      await api('/auth/signup/resend','POST',{verificationToken})
      setCode('')
      setResendAt(Date.now()+60000)
      setDelivery('کد جدید در صف ارسال است.')
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const restart = () => {
    setVerificationToken('')
    setDelivery('')
    setResendAt(0)
    setCode('')
    setError('')
    setSocialReady(false)
    setCaptchaRevision(value=>value+1)
    setParams(previous=>{const next=new URLSearchParams(previous);next.delete('social');return next},{replace:true})
  }
  const verifying = Boolean(verificationToken || socialRegister)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if(busy||!captchaReady)return
    setError('')
    if(mode==='signup'&&name.trim().length<2)return setError('نام و نام خانوادگی خود را وارد کنید.')
    if (mode === 'signup' && rules.some(rule => !rule.test(password))) return setError('رمز عبور باید همهٔ شرایط ذکرشده را داشته باشد.')
    if (mode === 'signup' && password !== confirmPassword) return setError('تکرار رمز عبور با رمز اصلی یکسان نیست.')
    setBusy(true)
    try {
      const data = await api<{ user: User; verificationToken?: string }>(mode === 'login' ? '/auth/login' : '/auth/signup', 'POST', mode === 'login' ? { email, password,...captcha } : { name:name.trim(),email, password, confirmPassword,...captcha })
      if (data.verificationToken) { beginVerification(data.verificationToken); return }
      setUser(data.user)
      navigate(destination, { replace: true })
    } catch (cause) { setError((cause as Error).message);setCaptchaRevision(v=>v+1) }
    finally { setBusy(false) }
  }
  if (loading) return spinner
  return <main className={`auth-wrap auth-${mode}`} id="auth-main">
    <section className="auth-visual" aria-hidden="true">
      <div className="auth-visual-top">{brand}</div>
      <div className="auth-visual-content"><span className="overline">TRADERSHO / MEMBER SPACE</span><h1>به تریدر شو<br/><em>خوش آمدید.</em></h1><p>برای دسترسی به پنل و نمودار تحلیل بازار، وارد حساب خود شوید.</p><div className="auth-stats"><span><ShieldCheck size={20}/> دسترسی امن</span><span><BookOpen size={20}/> مدرسه فارکس</span><span><Activity size={20}/> ابزارهای کاربردی</span></div></div>

    </section>
    <section className="auth-form-side"><div className="auth-form-top"><div className="auth-mobile-brand">{mobileBrand}</div><span className="auth-product-label">پنل کاربری تریدر شو</span><div className="auth-display-controls"><ThemeToggle/></div></div><div className="auth-card">
      {verifying ? <>
        <h1>تأیید ایمیل</h1>
        <p className="muted">{verificationToken?<>کد ۶ رقمی ارسال‌شده به <bdi>{email}</bdi> را وارد کنید.</>:'ایمیل خود را وارد کنید تا کد تأیید را دریافت کنید.'}</p>
        <form className="auth-form" onSubmit={submitVerification} aria-busy={busy}>
          {verificationToken
            ? <label><span>کد تأیید ایمیل</span><div className="input-icon"><Mail size={19}/><input autoFocus required disabled={busy} value={code} onChange={event=>setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} pattern="[0-9۰-۹٠-٩]{6}"/></div></label>
            : <label><span>ایمیل</span><div className="input-icon"><Mail size={19}/><input autoFocus required disabled={busy||!socialReady} type="email" maxLength={160} autoComplete="email" dir="ltr" value={email} onChange={event=>setEmail(event.target.value)}/></div></label>}
          {delivery&&<p className="muted" role="status">{delivery}</p>}
          {error&&<div ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</div>}
          <button className="button primary auth-submit" disabled={busy||(!verificationToken&&!socialReady)}>{busy?'لطفاً صبر کنید…':verificationToken?'تأیید و ورود':'ارسال کد تأیید'}</button>
          <div className="social-actions">
            {verificationToken&&<button type="button" className="button secondary" disabled={busy||Boolean(resendAt)} onClick={resend}>{resendAt?'ارسال مجدد پس از یک دقیقه':'ارسال مجدد کد'}</button>}
            <button type="button" className="button secondary" disabled={busy} onClick={restart}>بازگشت</button>
          </div>
        </form>
      </> : <>
      {params.get('social')==='failed'&&<div className="form-error" role="alert">ورود انجام نشد. دوباره تلاش کنید.</div>}
      <h1>{mode === 'login' ? 'ورود به حساب کاربری' : 'ساخت حساب کاربری'}</h1><p className="muted">{mode === 'login' ? 'ایمیل و رمز عبور خود را وارد کنید.' : 'با ایمیل و یک رمز عبور امن ثبت‌نام کنید.'}</p>
      <div className="auth-tabs" role="tablist" aria-label="ورود یا ثبت‌نام" onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const target=event.key==='Home'?'login':event.key==='End'?'signup':mode==='login'?'signup':'login';setMode(target);setError('');document.getElementById('auth-tab-'+target)?.focus()}}}><button type="button" disabled={busy} role="tab" id="auth-tab-login" aria-selected={mode==='login'} aria-controls="auth-fields" tabIndex={mode==='login'?0:-1} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>ورود</button><button type="button" disabled={busy} role="tab" id="auth-tab-signup" aria-selected={mode==='signup'} aria-controls="auth-fields" tabIndex={mode==='signup'?0:-1} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>ثبت‌نام</button></div>
      <div id="auth-fields" role="tabpanel" aria-labelledby={'auth-tab-'+mode}><form onSubmit={submit} className="auth-form" aria-busy={busy}>
        {mode==='signup'&&<label><span>نام و نام خانوادگی</span><div className="input-icon"><UserRound size={19}/><input disabled={busy} required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="نام و نام خانوادگی"/></div></label>}
        <label><span>ایمیل</span><div className="input-icon"><Mail size={19}/><input disabled={busy} required maxLength={160} inputMode="email" autoCapitalize="none" spellCheck={false} type="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /></div></label>
        <label><span>رمز عبور</span><div className="input-icon"><KeyRound size={19}/><input disabled={busy} required maxLength={128} aria-describedby={mode==='signup'?'password-requirements':undefined} minLength={mode === 'signup' ? 8 : undefined} type={showPass ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} dir="ltr" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'رمز عبور قوی' : 'رمز عبور'} /><button type="button" className="icon-button reveal-pass" onClick={() => setShowPass(!showPass)} aria-pressed={showPass} aria-label={showPass ? 'پنهان کردن رمز' : 'نمایش رمز'}>{showPass ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
        {mode === 'signup' && <><div className="password-rules" id="password-requirements" aria-label="شرایط رمز عبور">{rules.map(rule => <span key={rule.label} className={rule.test(password) ? 'met' : ''}><span aria-hidden="true">{rule.test(password) ? '✓' : '○'}</span>{rule.label}</span>)}</div><label><span className="confirm-label">تکرار رمز عبور{confirmPassword&&<small aria-live="polite" className={password===confirmPassword?'password-match':'password-mismatch'}>{password===confirmPassword?'رمزها یکسان هستند':'رمزها یکسان نیستند'}</small>}</span><div className="input-icon"><KeyRound size={19}/><input disabled={busy} required maxLength={128} type={showPass ? 'text' : 'password'} autoComplete="new-password" dir="ltr" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="رمز عبور را دوباره وارد کنید" /></div></label></>}
        {<CaptchaField key={mode} revision={captchaRevision} disabled={busy} onChange={updateCaptcha} onReady={setCaptchaReady}/>}
        {error && <div ref={errorRef} tabIndex={-1} className="form-error" role="alert"><Info size={17}/>{error}</div>}
        <button type="submit" className="button primary auth-submit" disabled={busy||!captchaReady}>{busy ? 'لطفاً صبر کنید…' : mode === 'login' ? 'ورود به پنل' : 'ایجاد حساب'}<ArrowLeft size={18}/></button>
      </form>{mode==='login'&&<Link className="forgot-link" to="/forgot-password">رمز عبور را فراموش کرده‌اید؟</Link>}</div><SocialLogin mode={mode}/><div className="auth-note"><ShieldCheck size={18}/><span>برای امنیت حساب، از رمز عبور منحصربه‌فرد استفاده کنید.</span></div></>}
    </div><footer className="auth-side-bottom"><Link to="/privacy">حریم خصوصی</Link><span>© ۲۰۲۶ تریدر شو</span></footer></section>
  </main>
}
