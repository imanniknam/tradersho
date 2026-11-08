#!/usr/bin/env python3
"""Guest smoke checks against a private TLS preview; does not write site data."""
import subprocess, re, urllib.parse, json
base=['curl','--silent','--show-error','--fail','--resolve','tradersho.com:8443:127.0.0.1','-H','Host: tradersho.com']
def get(path):
    return subprocess.check_output(base+['https://tradersho.com:8443'+urllib.parse.quote(path,safe='/%:?=&')])
pages=['/','/school/','/brokers/','/blog/forex-terms/','/wp-login.php','/wp-json/']
assets=set()
for p in pages:
    data=get(p).decode(errors='replace')
    assert not re.search(r'Fatal error|Uncaught (Error|Exception)|Error establishing a database',data),p
    for u in re.findall(r'(?:src|href)=["\']([^"\']+)',data):
        u=urllib.parse.urlsplit(u.replace('&amp;','&'))
        if u.netloc in ('','tradersho.com','www.tradersho.com') and u.path.startswith(('/wp-content/','/wp-includes/')):
            if re.search(r'\.(css|js|woff2?|png|jpe?g|webp|svg|pdf)$',u.path,re.I): assets.add(u.path)
    print('OK page',p)
for p in sorted(assets):
    get(p)
print('OK local assets',len(assets))
print('No accounts, comments, forms or emails created.')
