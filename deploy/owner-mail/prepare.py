import pathlib,os,secrets,json,subprocess
p=pathlib.Path('/opt/tradersho-owner-mail');p.mkdir(mode=0o755,exist_ok=True);(p/'backups').mkdir(mode=0o700,exist_ok=True)
i=json.loads(subprocess.check_output(['docker','inspect','tradersho-app-1']))[0]
env=dict(x.split('=',1) for x in i['Config']['Env'] if '=' in x)
k=p/'owner-key'
if not k.exists():k.write_text(secrets.token_hex(32)+'\n')
os.chown(k,0,1000);k.chmod(0o640)
uid=subprocess.check_output(['docker','exec','tradersho-db-1','psql','-U','tradersho','-d','tradersho','-Atc',"SELECT id FROM users WHERE lower(email)='keshavarzkamran@gmail.com'"]).decode().strip();assert uid and '\n' not in uid
f=p/'runtime.env';f.write_text('OWNER_USER_ID='+uid+'\n'+'DATABASE_URL='+env['DATABASE_URL']+'\nOWNER_EMAIL=keshavarzkamran@gmail.com\n');f.chmod(0o600)
f=p/'.env';f.write_text('OWNER_IMAGE='+i['Config']['Image']+'\n');f.chmod(0o600)
for name in ['server.mjs','owner-security.mjs','index.html']:os.chmod(p/name,0o644)
print('Private runtime prepared; no credentials printed.')
