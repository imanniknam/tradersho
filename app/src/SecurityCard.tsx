import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogOut, ShieldCheck } from 'lucide-react'
import { api } from './api'

export default function SecurityCard({ onLogoutAll }: { onLogoutAll: () => void }) {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(''); setError('')
    if (newPassword !== confirmPassword) return setError('تکرار رمز عبور با رمز جدید یکسان نیست.')
    setBusy(true)
    try {
      await api('/account/password', 'POST', { currentPassword, newPassword, confirmPassword })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setMessage('رمز عبور تغییر کرد و نشست‌های دیگر خارج شدند.')
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  const logoutAll = async () => {
    setBusy(true); setError('')
    try { await api('/account/sessions', 'DELETE'); onLogoutAll(); navigate('/auth', { replace: true }) }
    catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="surface security-surface"><ShieldCheck size={29}/><h3>امنیت حساب</h3><p>رمز عبورتان را تغییر دهید یا همهٔ دستگاه‌های واردشده را خارج کنید.</p>
    <form className="stack-form" onSubmit={submit}>
      <label>رمز عبور فعلی<input required type={show ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}/></label>
      <label>رمز عبور جدید<input required type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)}/></label>
      <small>حداقل ۸ کاراکتر، شامل حرف کوچک و بزرگ انگلیسی، عدد و کاراکتر خاص.</small>
      <label>تکرار رمز عبور جدید<input required type={show ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></label>
      <button type="button" className="security-show" onClick={() => setShow(!show)}>{show ? <EyeOff size={16}/> : <Eye size={16}/>} {show ? 'پنهان کردن رمزها' : 'نمایش رمزها'}</button>
      {error && <div className="form-error" role="alert">{error}</div>}{message && <div className="form-success" role="status">{message}</div>}
      <button className="button primary" disabled={busy}>تغییر رمز عبور</button>
    </form>
    <button className="security-logout" type="button" disabled={busy} onClick={logoutAll}><LogOut size={17}/> خروج از همهٔ دستگاه‌ها</button>
  </div>
}
