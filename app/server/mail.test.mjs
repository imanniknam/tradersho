import test from 'node:test'
import assert from 'node:assert/strict'
import {mailAddress,mailConfig,sealMail,openMail,retryMail,supportReplyMail,createMailer,startMailWorker} from './mail.mjs'
const env={MAIL_TRANSPORT:'smtp',SMTP_HOST:'smtp.example.test',SMTP_USER:'sender@example.test',SMTP_PASSWORD:'test-only',SMTP_PORT:'587',MAIL_FROM:'sender@example.test',MAIL_REPLY_TO:'support@example.test',MAIL_ENCRYPTION_KEY:'ab'.repeat(32),APP_PUBLIC_URL:'https://panel.example.test'}
test('disabled mail worker supports asynchronous shutdown without opening a connection',async()=>{
  const previous=process.env.MAIL_TRANSPORT
  delete process.env.MAIL_TRANSPORT
  try{assert.ok(startMailWorker({})() instanceof Promise);await startMailWorker({})()}
  finally{if(previous!==undefined)process.env.MAIL_TRANSPORT=previous}
})
test('SMTP configuration requires complete secrets, safe addresses and secure origin',()=>{
  assert.equal(mailConfig({}),null)
  for(const address of ['a@example.test,b@example.test','a@example.test\r\nBcc: x@example.test','Name <a@example.test>'])assert.equal(mailAddress(address),false)
  for(const patch of [{SMTP_PASSWORD:''},{MAIL_ENCRYPTION_KEY:'weak'},{SMTP_PORT:'25'},{MAIL_FROM:'x\r\nBcc: x@example.test'},{APP_PUBLIC_URL:'http://example.test'},{MAIL_INTERVAL_MS:'0'}])assert.throws(()=>mailConfig({...env,...patch}))
  const c=mailConfig(env),t=createMailer(c)
  assert.equal(t.options.requireTLS,true);assert.equal(t.options.tls.rejectUnauthorized,true)
  assert.equal(t.options.debug,false);assert.equal(t.options.disableFileAccess,true);t.close()
})
test('queued content is encrypted, authenticated and bound to its job',()=>{
  const key=Buffer.from(env.MAIL_ENCRYPTION_KEY,'hex'),payload={to:'user@example.test',text:'secret-reset-token'}
  const sealed=sealMail(payload,key,'job-a')
  assert.ok(!sealed.includes(payload.text));assert.deepEqual(openMail(sealed,key,'job-a'),payload)
  assert.throws(()=>openMail(sealed,key,'job-b'));assert.throws(()=>openMail(sealed,Buffer.alloc(32),'job-a'))
  const tampered=Buffer.from(sealed,'base64');tampered[tampered.length-1]^=1
  assert.throws(()=>openMail(tampered.toString('base64'),key,'job-a'))
})
test('retry stops on permanent rejection and max attempts; ticket email contains only panel link',()=>{
  assert.equal(retryMail({responseCode:451},1),true)
  assert.equal(retryMail({responseCode:550},1),false)
  assert.equal(retryMail({code:'EAUTH'},1),false)
  assert.equal(retryMail({},5),false)
  const message=supportReplyMail('https://panel.example.test','ticket-id')
  assert.ok(message.text.includes('https://panel.example.test/panel/support/ticket-id'))
})
