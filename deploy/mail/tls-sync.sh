#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/opt/tradersho-mail
exec 9>"$root/tls-sync.lock"
flock -w 60 9
work=$(mktemp -d "$root/.tls-sync-XXXXXX")
trap 'rm -rf "$work"' EXIT
source=/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/mx.tradersho.com
docker cp "tradersho-proxy-1:$source/mx.tradersho.com.crt" "$work/fullchain.pem"
docker cp "tradersho-proxy-1:$source/mx.tradersho.com.key" "$work/privkey.pem"
openssl x509 -in "$work/fullchain.pem" -noout -checkend 86400 >/dev/null
openssl x509 -in "$work/fullchain.pem" -noout -checkhost mx.tradersho.com >/dev/null
cert_key=$(openssl x509 -in "$work/fullchain.pem" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)
private_key=$(openssl pkey -in "$work/privkey.pem" -pubout -outform DER | sha256sum | cut -d' ' -f1)
[[ "$cert_key" == "$private_key" ]]
if cmp -s "$work/fullchain.pem" "$root/tls/fullchain.pem" && cmp -s "$work/privkey.pem" "$root/tls/privkey.pem"; then exit 0; fi
install -m 600 "$work/privkey.pem" "$root/tls/privkey.pem"
install -m 600 "$work/fullchain.pem" "$root/tls/fullchain.pem"
docker exec tradersho-mail-mailserver-1 postfix reload
docker exec tradersho-mail-mailserver-1 doveadm reload
printf 'Mail TLS certificate synchronized and services reloaded.\n'
