import pathlib,os,secrets,json,subprocess,re
p=pathlib.Path('/opt/tradersho-owner-mail');p.mkdir(mode=0o755,exist_ok=True);(p/'backups').mkdir(mode=0o700,exist_ok=True)
i=json.loads(subprocess.check_output(['docker','inspect','tradersho-app-1']))[0]
k=p/'owner-key'
if not k.exists():k.write_text(secrets.token_hex(32)+'\n')
os.chown(k,0,1000);k.chmod(0o640)
saved=dict(line.split('=',1) for line in (p/'runtime.env').read_text().splitlines() if '=' in line) if (p/'runtime.env').exists() else {}
owner_email=os.environ.get('OWNER_EMAIL',saved.get('OWNER_EMAIL','')).strip().lower()
assert re.fullmatch(r'[a-z0-9._+-]+@[a-z0-9.-]+',owner_email) and len(owner_email)<=160, 'Set OWNER_EMAIL for the existing authorized account'
uid=subprocess.check_output(['docker','exec','tradersho-db-1','psql','-U','tradersho','-d','tradersho','-Atc',f"SELECT id FROM users WHERE lower(email)='{owner_email}'"]).decode().strip()
assert re.fullmatch('[a-f0-9-]{36}',uid), 'Expected one existing authorized account'
assert not saved.get('OWNER_USER_ID') or saved['OWNER_USER_ID']==uid, 'Owner identity changed; operator review is required, never reassign by email automatically'
private=dict(line.split('=',1) for line in pathlib.Path('/opt/tradersho/.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
password=private.get('OWNER_DATABASE_PASSWORD','')
assert re.fullmatch('[a-f0-9]{64}',password), 'Provision dedicated database roles first'
database='postgresql://tradersho_owner_mail:'+password+'@db:5432/tradersho'
subprocess.run(['docker','exec','-i','tradersho-db-1','psql','-X','-v','ON_ERROR_STOP=1','-U','tradersho','-d','tradersho'],input=f"INSERT INTO owner_mail.authorized_owner(singleton,user_id) VALUES(true,'{uid}') ON CONFLICT(singleton) DO UPDATE SET user_id=EXCLUDED.user_id WHERE authorized_owner.user_id=EXCLUDED.user_id;\nDO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM owner_mail.authorized_owner WHERE user_id='{uid}') THEN RAISE EXCEPTION 'Owner identity mismatch'; END IF; END $$;",text=True,check=True,stdout=subprocess.DEVNULL)
f=p/'runtime.env';f.write_text('OWNER_USER_ID='+uid+'\nDATABASE_URL='+database+'\nOWNER_EMAIL='+owner_email+'\n');f.chmod(0o600)
f=p/'.env';f.write_text('OWNER_IMAGE='+i['Config']['Image']+'\n');f.chmod(0o600)
for name in ['server.mjs','owner-security.mjs','index.html']:os.chmod(p/name,0o644)
print('Private runtime prepared; no credentials printed.')
