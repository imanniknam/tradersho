#!/usr/bin/env python3
"""Prepare a private, isolated main-site restore. Does not change DNS or proxy."""
from pathlib import Path
import tarfile, secrets, re, os
root=Path('/opt/tradersho-wordpress')
stage=root/'staging'
html=stage/'html'
if html.exists(): raise SystemExit('Refusing to overwrite an existing restore')
html.mkdir(parents=True)
with tarfile.open(root/'backups/main-20261108.tar.gz') as archive:
    prefix='domains/tradersho.com/public_html/'
    for m in archive:
        if m.name== 'backup/safetra3_new.sql':
            (stage/'source.sql').write_bytes(archive.extractfile(m).read())
        elif m.name.startswith(prefix):
            rel=Path(m.name[len(prefix):])
            if rel.is_absolute() or '..' in rel.parts: raise SystemExit('Unsafe member')
            target=html/rel
            if m.isdir(): target.mkdir(parents=True, exist_ok=True)
            elif m.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.extractfile(m).read())
                target.chmod(0o644)
            elif m.issym() or m.islnk(): raise SystemExit('Link requires manual review: '+m.name)
wp=html/'wp-config.php'
(root/'backups/wp-config-original.php').write_bytes(wp.read_bytes())
(root/'backups/wp-config-original.php').chmod(0o600)
pw=secrets.token_hex(32)
rpw=secrets.token_hex(32)
env=stage/'.env'
env.write_text(f'WP_DB_PASSWORD={pw}\nWP_DB_ROOT_PASSWORD={rpw}\n')
env.chmod(0o600)
s=wp.read_text()
for key,value in [('DB_NAME','wordpress'),('DB_USER','wordpress'),('DB_PASSWORD',pw),('DB_HOST','db')]:
    s,n=re.subn(r"define\(\s*['\"]"+key+r"['\"]\s*,.*?\);",lambda _: f"define( '{key}', '{value}' );",s,count=1)
    if n!=1: raise SystemExit('Missing DB constant '+key)
s=s.replace("define( 'WP_CACHE', true )", "define( 'WP_CACHE', false )")
s=s.replace("require_once ABSPATH . 'wp-settings.php';", "define('DISABLE_WP_CRON', true);\nif (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') { $_SERVER['HTTPS'] = 'on'; }\nrequire_once ABSPATH . 'wp-settings.php';")
wp.write_text(s)
ht=html/'.htaccess'
ht.write_text(ht.read_text().replace('RewriteCond %{HTTPS} off', 'RewriteCond %{HTTPS} off\nRewriteCond %{HTTP:X-Forwarded-Proto} !https [NC]'))
wp.chmod(0o640)
mu=html/'wp-content/mu-plugins'
mu.mkdir(exist_ok=True)
(mu/'tradersho-migration-staging.php').write_text("<?php\n// Staging only: never send mail or execute scheduled jobs from this copied site.\nadd_filter('pre_wp_mail', '__return_true', PHP_INT_MAX);\n")
for p in html.rglob('*'):
    if p.is_dir(): p.chmod(0o755)
    os.chown(p,33,33)
os.chown(html,33,33)
print('Isolated main-site files and source SQL prepared; secrets kept private.')
