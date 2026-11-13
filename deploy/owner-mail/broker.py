import http.server,socketserver,os,json,hmac,hashlib,time,re,subprocess,pathlib,threading
ROOT=pathlib.Path('/opt/tradersho-owner-mail');KEY=(ROOT/'owner-key').read_text().strip().encode();ACCOUNTS=pathlib.Path('/opt/tradersho-mail/config/postfix-accounts.cf');seen={};lock=threading.Lock()
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_POST(self):
  code=400;response={'error':'درخواست معتبر نیست.'}
  try:
   n=int(self.headers.get('Content-Length','0'));assert 0<n<=4096
   raw=self.rfile.read(n);assert hmac.compare_digest(hmac.new(KEY,raw,hashlib.sha256).hexdigest(),self.headers.get('X-Signature',''))
   data=json.loads(raw);assert abs(time.time()*1000-data['time'])<30000
   with lock:
    for k,v in list(seen.items()):
     if v<time.time()-60:del seen[k]
    assert isinstance(data['nonce'],str) and data['nonce'] not in seen
    seen[data['nonce']]=time.time()
    accounts=[line.split('|',1)[0] for line in ACCOUNTS.read_text().splitlines() if '|' in line and not line.startswith('#')]
    action=data['action']
    if action=='list':response={'accounts':accounts};code=200
    else:
     email=data.get('email','');password=data.get('newPassword','')
     assert isinstance(email,str) and re.fullmatch(r'[a-z0-9][a-z0-9._+-]{0,63}@tradersho\.com',email)
     assert isinstance(password,str) and 12<=len(password)<=128 and all(ord(c)>=32 and ord(c)!=127 for c in password)
     assert action in ('create','password')
     if email=='notifications@tradersho.com':raise ValueError('این صندوق برای ارسال خودکار سامانه است؛ تغییر آن باید همراه تنظیمات ارسال انجام شود.')
     if action=='create' and email in accounts:raise ValueError('این صندوق از قبل وجود دارد.')
     if action=='password' and email not in accounts:raise ValueError('صندوق پیدا نشد.')
     backup=ROOT/'backups';backup.mkdir(mode=0o700,exist_ok=True);p=backup/(str(time.time_ns())+'.accounts');p.write_bytes(ACCOUNTS.read_bytes());p.chmod(0o600)
     result=subprocess.run(['docker','exec','-i','tradersho-mail-mailserver-1','setup','email','add' if action=='create' else 'update',email],input=(password+'\n'+password+'\n').encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=25)
     if result.returncode:raise ValueError('سرویس ایمیل عملیات را نپذیرفت؛ تغییری را موفق فرض نکنید.')
     response={'ok':True,'message':'انجام شد؛ اعمال تغییر در سرویس ایمیل ممکن است کمی زمان ببرد.'};code=200
  except ValueError as e:response={'error':str(e) if str(e).startswith(('این صندوق','صندوق پیدا','سرویس ایمیل')) else 'اطلاعات معتبر نیست؛ آدرس tradersho.com و رمز ۱۲ تا ۱۲۸ نویسه وارد کنید.'}
  except Exception:pass
  payload=json.dumps(response).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
class Server(socketserver.UnixStreamServer):pass
sock='/run/tradersho-owner-mail/control.sock';os.makedirs(os.path.dirname(sock),mode=0o750,exist_ok=True)
if os.path.exists(sock):os.unlink(sock)
server=Server(sock,Handler);os.chown(os.path.dirname(sock),0,1000);os.chmod(os.path.dirname(sock),0o750);os.chown(sock,0,1000);os.chmod(sock,0o660);server.serve_forever()
