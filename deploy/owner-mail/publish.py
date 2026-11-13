import subprocess,json,pathlib,shutil,datetime
mounts=json.loads(subprocess.check_output(['docker','inspect','tradersho-proxy-1']))[0]['Mounts'];p=pathlib.Path(next(m['Source'] for m in mounts if m['Destination']=='/etc/caddy/Caddyfile'))
old='''    reverse_proxy app:3001 {
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-For {remote_host}
    }'''
new='''    @ownerMail path /owner-mail /owner-mail/*
    handle @ownerMail {
        reverse_proxy owner-mail:3002
    }
    handle {
        reverse_proxy app:3001 {
            header_up X-Forwarded-Host {host}
            header_up X-Forwarded-For {remote_host}
        }
    }'''
s=p.read_text();assert old in s and '@ownerMail' not in s
backup=pathlib.Path('/opt/tradersho-owner-mail/backups/Caddyfile-before');shutil.copyfile(p,backup);backup.chmod(0o600)
p.write_text(s.replace(old,new,1))
try:
 subprocess.run(['docker','exec','tradersho-proxy-1','caddy','validate','--config','/etc/caddy/Caddyfile'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['docker','exec','tradersho-proxy-1','caddy','reload','--config','/etc/caddy/Caddyfile'],check=True,stdout=subprocess.DEVNULL)
except Exception:
 p.write_text(s);subprocess.run(['docker','exec','tradersho-proxy-1','caddy','reload','--config','/etc/caddy/Caddyfile'],stdout=subprocess.DEVNULL);raise
print('Owner mail route published with validated proxy configuration')
