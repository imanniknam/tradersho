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
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ورود با تلگرام | تریدر شو</title>
  <script>try{document.documentElement.dataset.theme=localStorage.getItem('tradersho-theme')==='dark'?'dark':'light'}catch{}</script>
  <style>
    @font-face{font-family:YekanBakh;src:url('/fonts/YekanBakhFaNum-Regular.woff') format('woff');font-weight:400;font-display:swap}
    @font-face{font-family:YekanBakh;src:url('/fonts/YekanBakhFaNum-Bold.woff') format('woff');font-weight:700;font-display:swap}
    *{box-sizing:border-box}
    :root{color-scheme:light;--bg:#f7f7fd;--surface:#fff;--ink:#102039;--muted:#65728a;--line:#e6e8f2;--accent:#605f9e;--icon-bg:#eaf6ff}
    [data-theme=dark]{color-scheme:dark;--bg:#111214;--surface:#1b1c20;--ink:#f2f1f7;--muted:#b2b1c0;--line:#33343d;--accent:#b6a0ed;--icon-bg:#203847}
    body{font-family:YekanBakh,Tahoma,sans-serif;margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:28px 18px;background:radial-gradient(ellipse at 50% 0%,#7956d90a,transparent 65%),var(--bg);color:var(--ink)}
    main{width:min(100%,440px);background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:32px;text-align:center;box-shadow:0 12px 44px #10142c07}
    .brand{display:block;margin:0 auto 30px;width:128px;height:auto}
    .brand-dark{display:none}
    [data-theme=dark] .brand-light{display:none}
    [data-theme=dark] .brand-dark{display:block}
    .telegram-mark{display:grid;place-items:center;width:62px;height:62px;margin:0 auto 18px;background:var(--icon-bg);border-radius:20px;color:#229ed9}
    h1{font-size:25px;line-height:1.6;margin:0 0 8px;font-weight:700}
    p{font-size:14px;line-height:1.9;margin:0;color:var(--muted)}
    .widget{display:flex;justify-content:center;align-items:center;min-height:58px;margin:24px 0 18px;color-scheme:light;background:transparent}
    .widget iframe{display:block;border:0!important;max-width:100%;border-radius:24px;overflow:hidden;color-scheme:light;background:transparent}
    details{font-size:12px;line-height:1.9;color:var(--muted)}
    summary{cursor:pointer;display:inline-block;padding:7px}
    details p{font-size:12px;margin:8px 0 0}
    .back{display:flex;justify-content:center;align-items:center;gap:7px;min-height:44px;border-top:1px solid var(--line);margin-top:24px;padding-top:18px;color:var(--accent);font-size:13px;text-decoration:none}
    .back:hover{color:var(--ink)}
    a:focus-visible,summary:focus-visible{outline:3px solid #a89bdd;outline-offset:5px;border-radius:6px}
    @media(max-width:400px){main{padding:26px 18px;border-radius:20px}h1{font-size:23px}.brand{margin-bottom:24px}}
    @media(max-height:600px){body{padding-block:16px}main{padding-block:24px}.brand{margin-bottom:18px}.telegram-mark{margin-bottom:12px}.widget{margin-block:16px}}
  </style>
</head>
<body>
  <main aria-labelledby="login-title">
    <img class="brand brand-light" src="/assets/logo-purple.png" alt="Tradersho">
    <img class="brand brand-dark" src="/assets/logo-white.png" alt="Tradersho">
    <div class="telegram-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="30" height="30"><path fill="currentColor" d="M21.4 3.2 18.2 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L17.7 6c.4-.4-.1-.6-.6-.3L5.6 13 1.8 11.8c-1.2-.4-1.2-1.2.3-1.8L20 3.1c.8-.3 1.5.2 1.4.1Z"/></svg>
    </div>
    <h1 id="login-title">ورود با تلگرام</h1>
    <p>برای ادامه، حساب تلگرام خود را تأیید کنید.</p>
    <div class="widget">
      <script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${escape(username)}" data-size="large" data-userpic="false" data-radius="22" data-auth-url="${escape(callback)}"></script>
    </div>
    <details><summary>دکمه باز نمی‌شود؟</summary><p>اتصال به تلگرام و مجوز بازشدن پنجره‌های بازشو را در مرورگر بررسی کنید.</p></details>
    <a class="back" href="/auth"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m13 6 6 6-6 6M19 12H5"/></svg>بازگشت به ورود</a>
  </main>
</body>
</html>`
}
