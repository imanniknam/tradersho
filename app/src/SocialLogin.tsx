import SocialIcon from './SocialIcon'
import { useEffect, useState } from 'react'
import { api } from './api'

const labels = { google: 'گوگل', telegram: 'تلگرام' }
type Provider = keyof typeof labels

export function SocialLogin({ mode = 'login' }: { mode?: 'login' | 'signup' }) {
  const [data, setData] = useState<{providers: Provider[]; linked: Provider[]}>({providers:[],linked:[]})
  useEffect(() => {
    let active = true
    api<typeof data>('/auth/social/providers').then(result => {
      if (active) setData(result)
    }).catch(() => {})
    return () => { active = false }
  }, [])
  if (!data.providers.length) return null
  return <div className="social-actions" aria-label="روش‌های دیگر ورود">
    {data.providers.map(provider => {
      const href = '/api/auth/social/'+provider+'/start'
      return <a key={provider} className={'social-login-button social-'+provider} href={href}><SocialIcon provider={provider}/><span>{mode==='signup'?'ثبت‌نام':'ورود'} با {labels[provider]}</span></a>
    })}
  </div>
}
