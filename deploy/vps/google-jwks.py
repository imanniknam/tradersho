#!/usr/bin/env python3
"""Fetch public Google signing keys, or receive them over the existing authenticated CI SSH channel."""
import argparse, json, os, re, sys, tempfile, time, urllib.request
from pathlib import Path
SOURCE='https://www.googleapis.com/oauth2/v3/certs'
LIMIT=65536

def validate_snapshot(data, now=None):
    now=int(time.time()*1000) if now is None else now
    if not isinstance(data,dict) or data.get('source')!=SOURCE:
        raise ValueError('Invalid Google key source')
    fetched,expiry=data.get('fetchedAt'),data.get('expiresAt')
    if type(fetched) is not int or type(expiry) is not int or fetched>now+30000 or fetched<now-7200000 or not now<expiry<=fetched+7200000 or expiry<=fetched:
        raise ValueError('Google key snapshot is expired or invalid')
    keys=data.get('keys')
    if not isinstance(keys,list) or not 1<=len(keys)<=10:
        raise ValueError('Invalid key count')
    kids=set()
    for k in keys:
        if not isinstance(k,dict) or set(k)-{'kty','alg','use','kid','n','e'} or k.get('kty')!='RSA' or k.get('alg')!='RS256' or k.get('use')!='sig' or k.get('e')!='AQAB' or not isinstance(k.get('kid'),str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}',k['kid']) or k['kid'] in kids or not isinstance(k.get('n'),str) or not re.fullmatch(r'[A-Za-z0-9_-]{342,1024}',k['n']):
            raise ValueError('Invalid Google public key')
        kids.add(k['kid'])
    return data

def fetch_snapshot():
    with urllib.request.urlopen(SOURCE,timeout=15) as response:
        if response.status!=200 or response.geturl()!=SOURCE or response.headers.get_content_type()!='application/json':
            raise ValueError('Unexpected Google key response')
        raw=response.read(LIMIT+1)
        if len(raw)>LIMIT:raise ValueError('Google key response is too large')
        value=json.loads(raw)
        maxage=re.search(r'(?:^|,)\s*max-age=(\d+)',response.headers.get('Cache-Control',''))
        if not maxage:raise ValueError('Google did not provide a cache lifetime')
        ttl=min(7200,int(maxage[1])-int(response.headers.get('Age','0')))
        if ttl<=0:raise ValueError('Google key response is already expired')
    now=int(time.time()*1000)
    return validate_snapshot({'source':SOURCE,'fetchedAt':now,'expiresAt':now+ttl*1000,'keys':value['keys']},now)

def store_snapshot(data,root=Path('/opt/tradersho')):
    validate_snapshot(data)
    folder=root/'google-jwks'
    if folder.is_symlink():raise ValueError('Key directory must not be a link')
    folder.mkdir(mode=0o755,parents=True,exist_ok=True)
    target=folder/'jwks.json'
    if target.is_symlink():raise ValueError('Key file must not be a link')
    if target.exists() and json.loads(target.read_text()).get('fetchedAt',0)>data['fetchedAt']:
        raise ValueError('Refusing an older Google key snapshot')
    fd,temp=tempfile.mkstemp(prefix='.jwks-',dir=folder)
    try:
        with os.fdopen(fd,'w') as out:
            json.dump(data,out,separators=(',',':'));out.flush();os.fsync(out.fileno());os.fchmod(out.fileno(),0o644)
        os.replace(temp,folder/'jwks.json')
    finally:
        if os.path.exists(temp):os.unlink(temp)
    return folder/'jwks.json'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['fetch','receive']);parser.add_argument('output',nargs='?');args=parser.parse_args()
    if args.command=='fetch':
        if not args.output:parser.error('fetch requires an output file')
        data=fetch_snapshot();Path(args.output).write_text(json.dumps(data,separators=(',',':')))
        print('Fetched official Google public keys:',len(data['keys']),'valid seconds:',(data['expiresAt']-data['fetchedAt'])//1000)
    else:
        if args.output:parser.error('receive does not accept a path')
        raw=sys.stdin.buffer.read(LIMIT+1)
        if len(raw)>LIMIT:raise ValueError('Key upload exceeds limit')
        data=validate_snapshot(json.loads(raw));store_snapshot(data)
        print('Stored official Google public key snapshot:',len(data['keys']))
if __name__=='__main__':main()
