import {createHash,createHmac,timingSafeEqual} from 'node:crypto'

export function verifyTelegramWidget(params,token,now=Date.now()){
  const data=new Map()
  for(const [key,value] of params){
    if(data.has(key)||!['state','id','first_name','last_name','username','photo_url','auth_date','hash'].includes(key))
      throw Error('Invalid Telegram fields')
    data.set(key,value)
  }
  const hash=data.get('hash'),date=Number(data.get('auth_date'))
  if(!/^[a-f0-9]{64}$/.test(hash||'')||!/^\d{1,20}$/.test(data.get('id')||'')||
    !Number.isSafeInteger(date)||date>now/1000+30||date<now/1000-300)throw Error('Invalid Telegram authorization')
  data.delete('hash')
  data.delete('state')
  const check=[...data].sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,value])=>key+'='+value).join('\n')
  const secret=createHash('sha256').update(token).digest()
  const expected=createHmac('sha256',secret).update(check).digest()
  if(!timingSafeEqual(expected,Buffer.from(hash,'hex')))throw Error('Invalid Telegram signature')
  return {subject:data.get('id'),name:[data.get('first_name'),data.get('last_name')].filter(Boolean).join(' ').slice(0,80)||'کاربر تریدر شو',email:''}
}

const escape=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
export function telegramWidgetPage(username,callback){
  return `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ورود با تلگرام | تریدر شو</title><style>body{font-family:Tahoma,sans-serif;background:#f5f5ff;color:#283044;display:grid;place-items:center;min-height:95vh;margin:0}main{padding:32px;max-width:360px;text-align:center;background:white;border-radius:20px}p{line-height:1.9}a{color:#543aff}</style><main><h1>ورود با تلگرام</h1><p>با دکمهٔ زیر هویت تلگرام خود را تأیید کنید.</p><script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${escape(username)}" data-size="large" data-userpic="false" data-auth-url="${escape(callback)}"></script><p>در صورت بازنشدن پنجره، مسدودکنندهٔ پنجره‌های بازشو را برای این سایت بررسی کنید.</p><a href="/auth">بازگشت به ورود</a></main></html>`
}
