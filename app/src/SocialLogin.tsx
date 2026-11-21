import { useEffect, useState } from 'react'
import { api } from './api'

const labels = { google: 'گوگل', telegram: 'تلگرام' }
type Provider = keyof typeof labels

export function SocialLogin({ link = false }: { link?: boolean }) {
  const [data, setData] = useState<{providers: Provider[]; linked: Provider[]}>({providers:[],linked:[]})
  useEffect(() => {
    let active = true
    api<typeof data>('/auth/social/providers').then(result => {
      if (active) setData(result)
    }).catch(() => {})
    return () => { active = false }
  }, [])
  if (!data.providers.length) return null
  return <div className="social-actions" aria-label={link?'روش‌های ورود متصل':'روش‌های دیگر ورود'}>
    {data.providers.map(provider => {
      const href = '/api/auth/social/'+provider+'/start'
      if (!link) return <a key={provider} className="button secondary" href={href}>ورود با {labels[provider]}</a>
      if (data.linked.includes(provider)) return <span key={provider}>{labels[provider]} متصل است</span>
      return <form key={provider} action={href} method="post">
        <button className="button secondary" type="submit">اتصال {labels[provider]}</button>
      </form>
    })}
  </div>
}
