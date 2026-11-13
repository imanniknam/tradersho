import pathlib,secrets,http.client,socket,json,hmac,hashlib,time,imaplib,subprocess
key=pathlib.Path('/opt/tradersho-owner-mail/owner-key').read_text().strip().encode()
class C(http.client.HTTPConnection):
 def connect(self):self.sock=socket.socket(socket.AF_UNIX);self.sock.connect('/run/tradersho-owner-mail/control.sock')
def request(action,**kw):
 data=json.dumps(dict(action=action,time=time.time()*1000,nonce=secrets.token_hex(24),**kw)).encode();c=C('localhost');c.request('POST','/',data,{'X-Signature':hmac.new(key,data,hashlib.sha256).hexdigest()});r=c.getresponse();v=json.loads(r.read());c.close();return r.status,v
email='qa-owner-'+secrets.token_hex(5)+'@tradersho.com';created=False
try:
 status,v=request('list');assert status==200 and isinstance(v['accounts'],list);print('Authenticated account listing passed',flush=True)
 status,v=request('create',email=email,newPassword=secrets.token_urlsafe(24));assert status==200,v;created=True;print('Disposable mailbox creation passed',flush=True)
 password=secrets.token_urlsafe(24);status,v=request('password',email=email,newPassword=password);assert status==200,v
 # Give the official changedetector time to reload account data before a single real login.
 time.sleep(40)
 with imaplib.IMAP4_SSL('mx.tradersho.com',993) as imap:assert imap.login(email,password)[0]=='OK';imap.logout()
 print('Password update and real TLS IMAP login passed',flush=True)
finally:
 if created:
  r=subprocess.run(['docker','exec','tradersho-mail-mailserver-1','setup','email','del','-y',email],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);assert r.returncode==0;print('Disposable mailbox removed',flush=True)
