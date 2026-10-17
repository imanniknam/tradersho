import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, ArrowLeft, BookOpen, Eye, EyeOff, Info, KeyRound, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from './api'
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
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const next = params.get('next')
  const destination = next?.startsWith('/panel') && !next.startsWith('//') ? next : '/panel'
  useEffect(() => { if (!loading && user) navigate(destination, { replace: true }) }, [loading, user, destination, navigate])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (mode === 'signup' && rules.some(rule => !rule.test(password))) return setError('رمز عبور باید همهٔ شرایط ذکرشده را داشته باشد.')
    if (mode === 'signup' && password !== confirmPassword) return setError('تکرار رمز عبور با رمز اصلی یکسان نیست.')
    setBusy(true)
    try {
      const data = await api<{ user: User }>(mode === 'login' ? '/auth/login' : '/auth/signup', 'POST', mode === 'login' ? { email, password } : { email, password, confirmPassword })
      setUser(data.user)
      navigate(destination, { replace: true })
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  if (loading) return spinner
  return <div className="auth-wrap">
    <section className="auth-visual" aria-hidden="true">
      <div className="auth-visual-top">{brand}<span className="micro-badge"><span className="live-dot" /> مسیر آگاهانهٔ معامله‌گری</span></div>
      <div className="auth-visual-content"><span className="overline">TRADERSHO / MEMBER SPACE</span><h1>مسیر حرفه‌ای شدن،<br/><em>از اینجا شروع می‌شود.</em></h1><p>آموزش، ابزار و خدمات معامله‌گری در فضایی که برای تصمیم‌های سنجیده ساخته شده است.</p><div className="auth-stats"><span><ShieldCheck size={20}/> دسترسی امن</span><span><BookOpen size={20}/> یادگیری گام‌به‌گام</span><span><Activity size={20}/> ابزارهای کاربردی</span></div></div>
      <div className="auth-visual-foot">© ۲۰۲۶ تریدر شو <span>دانش · ابزار · انضباط</span></div>
    </section>
    <section className="auth-form-side"><div className="auth-mobile-brand">{mobileBrand}</div><div className="auth-card">
      <div className="auth-icon"><Sparkles size={25}/></div><span className="eyebrow">به پنل تریدر شو خوش آمدید</span><h2>{mode === 'login' ? 'ورود به حساب کاربری' : 'ساخت حساب کاربری'}</h2><p className="muted">{mode === 'login' ? 'مسیر یادگیری و ابزارهای شما منتظرتان است.' : 'چند قدم تا ساخت فضای شخصی معامله‌گری شما.'}</p>
      <div className="auth-tabs" role="tablist"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>ورود</button><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>ثبت‌نام</button></div>
      <form onSubmit={submit} className="auth-form">
        <label><span>ایمیل</span><div className="input-icon"><Mail size={19}/><input required type="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" /></div></label>
        <label><span>رمز عبور</span><div className="input-icon"><KeyRound size={19}/><input required minLength={mode === 'signup' ? 8 : undefined} type={showPass ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} dir="ltr" value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'رمز عبور قوی' : 'رمز عبور'} /><button type="button" className="icon-button reveal-pass" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'پنهان کردن رمز' : 'نمایش رمز'}>{showPass ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
        {mode === 'signup' && <><div className="password-rules" aria-label="شرایط رمز عبور">{rules.map(rule => <span key={rule.label} className={rule.test(password) ? 'met' : ''}><span aria-hidden="true">{rule.test(password) ? '✓' : '○'}</span>{rule.label}</span>)}</div><label><span>تکرار رمز عبور</span><div className="input-icon"><KeyRound size={19}/><input required type={showPass ? 'text' : 'password'} autoComplete="new-password" dir="ltr" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="رمز عبور را دوباره وارد کنید" /></div></label>{confirmPassword && <span className={password === confirmPassword ? 'password-match' : 'password-mismatch'}>{password === confirmPassword ? 'رمزها یکسان هستند' : 'رمزها یکسان نیستند'}</span>}</>}
        {error && <div className="form-error" role="alert"><Info size={17}/>{error}</div>}
        <button type="submit" className="button primary auth-submit" disabled={busy}>{busy ? 'لطفاً صبر کنید…' : mode === 'login' ? 'ورود به پنل' : 'ایجاد حساب'}<ArrowLeft size={18}/></button>
      </form><div className="auth-note"><ShieldCheck size={18}/><span>رمز عبور شما فقط به‌صورت هش امن در پایگاه‌داده نگهداری می‌شود.</span></div>
    </div><div className="auth-side-bottom">تریدر شو؛ همراه مسیر یادگیری و تصمیم‌گیری شما</div></section>
  </div>
}
