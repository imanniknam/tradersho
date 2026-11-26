import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {inlineScripts,scriptHash} from './csp-hash.mjs'
import {telegramWidgetPage} from './telegram-widget.mjs'

const built=name=>{try{return readFileSync(new URL('../dist/'+name,import.meta.url),'utf8')}catch{return ''}}
// Only the exact inline scripts we ship may run. index.html and the Telegram page are
// hashed here; vite writes the hashes of the expert simulator (a srcdoc frame, which
// inherits this policy) to csp-hashes.json.
const scriptHashes=[...new Set([
  ...[built('index.html'),telegramWidgetPage('bot','https://invalid.example/')].flatMap(inlineScripts).map(scriptHash),
  ...JSON.parse(built('csp-hashes.json')||'[]'),
])].join(' ')

export const responseSecurityHeaders={
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // Official widgets and React style attributes still need inline styles.
  'Content-Security-Policy':"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self' "+scriptHashes+" https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tradingview.com https://telegram.org https://*.telegram.org; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://*.tradingview-widget.com https://*.tradingview.com https://tradingview.com https://flicker.finance https://oauth.telegram.org; worker-src 'self' blob:; form-action 'self' https://oauth.telegram.org https://accounts.google.com",
  ...(process.env.NODE_ENV==='production'&&process.env.APP_PUBLIC_URL?.startsWith('https://')?{'Strict-Transport-Security':'max-age=31536000'}:{}),
}

// Bound expensive password work independently of per-account/IP throttles.
export function workLimiter({concurrency=2,waiting=8}={}) {
  let active=0
  const queue=[]
  const run=async task=>{
    if(active>=concurrency){
      if(queue.length>=waiting)throw Object.assign(new Error('سرور مشغول است؛ کمی بعد دوباره تلاش کنید.'),{status:503})
      await new Promise(resolve=>queue.push(resolve))
    }else active++
    try{return await task()}
    finally{const next=queue.shift();if(next)next();else active--}
  }
  return run
}

export function allowedOrigin(req,publicUrl=process.env.APP_PUBLIC_URL){
  if(!req.headers.origin)return true
  try{
    const origin=new URL(req.headers.origin)
    if(publicUrl)return origin.origin===new URL(publicUrl).origin
    const host=String(req.headers.host||'')
    const local=h=>['localhost','127.0.0.1','[::1]'].includes(h)
    if(local(origin.hostname)&&local(new URL('http://'+host).hostname))return true
    return origin.protocol==='https:'&&origin.host===host
  }catch{return false}
}

export const browserBindingHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
  ?createHash('sha256').update(value).digest('hex'):null

export const sessionCookieName=req=>secureCookie(req)?'__Host-tradersho_session':'tradersho_session'

export function secureCookie(req){
  if(process.env.NODE_ENV!=='production')return false
  if(process.env.APP_PUBLIC_URL)return new URL(process.env.APP_PUBLIC_URL).protocol==='https:'
  return !['localhost','127.0.0.1'].includes(String(req.headers.host||'').split(':')[0])
}
