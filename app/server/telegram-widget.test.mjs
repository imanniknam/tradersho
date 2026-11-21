import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash,createHmac} from 'node:crypto'
import {verifyTelegramWidget,telegramWidgetPage} from './telegram-widget.mjs'

test('Telegram signature, age, duplicate fields and mutation are checked',()=>{
 const token='12345:qa-only-token',now=Date.now()
 const values={auth_date:String(Math.floor(now/1000)),first_name:'QA',id:'12345'}
 const check=Object.entries(values).map(([k,v])=>k+'='+v).join('\n')
 const hash=createHmac('sha256',createHash('sha256').update(token).digest()).update(check).digest('hex')
 const params=new URLSearchParams({...values,hash,state:'local-state'})
 assert.equal(verifyTelegramWidget(params,token,now).subject,'12345')
 assert.throws(()=>verifyTelegramWidget(params,'other-token',now))
 assert.throws(()=>verifyTelegramWidget(params,token,now+301000))
 params.set('first_name','Changed')
 assert.throws(()=>verifyTelegramWidget(params,token,now))
 params.set('first_name','QA')
 params.append('id','12345')
 assert.throws(()=>verifyTelegramWidget(params,token,now))
})
test('Widget uses escaped callback and requests no messaging permission',()=>{
 const html=telegramWidgetPage('TradershoLoginBot','https://panel.example.test/callback?state=x&next=y')
 assert.ok(html.includes('state=x&amp;next=y'))
 assert.ok(!html.includes('data-request-access'))
 assert.ok(html.includes('data-telegram-login="TradershoLoginBot"'))
})
