#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/opt/tradersho-mail
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$root/backups"
exec 9>"$root/backup.lock"
flock -w 120 9
archive="$root/backups/mail-$stamp.tar.gz"
work=$(mktemp -d "$root/.backup-state-XXXXXX")
trap 'rm -rf "$work"' EXIT
extras=()
if [[ -d /opt/tradersho-webmail/config ]]; then
    mkdir -p "$work/webmail/db"
    cp -a /opt/tradersho-webmail/config "$work/webmail/"
    cp /opt/tradersho-webmail/compose.yaml "$work/webmail/"
    python3 - "$work/webmail/db" <<'PY'
import sqlite3, sys
from pathlib import Path
for source in Path('/opt/tradersho-webmail/db').glob('*.db'):
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src:
        with sqlite3.connect(Path(sys.argv[1]) / source.name) as dst:
            src.backup(dst)
PY
    docker cp tradersho-proxy-1:/data/sites/mail.caddy "$work/webmail/mail.caddy"
    extras+=(-C "$work" webmail)
fi
if [[ -d /opt/tradersho-dns/config ]]; then
    mkdir -p "$work/dns"
    cp -a /opt/tradersho-dns/config /opt/tradersho-dns/compose.yaml "$work/dns/"
    extras+=(-C "$work" dns)
fi
ready=0
for attempt in 1 2 3; do
    if tar --warning=no-file-changed -C "$root" -czf "$archive.partial" config data state tls compose.yaml image.env "${extras[@]}"; then ready=1; break; else status=$?; fi
    [[ "$status" == 1 ]] || exit "$status"
    printf 'Mail changed during backup; retrying snapshot (%s/3).\n' "$attempt" >&2
done
[[ "$ready" == 1 ]] || { echo 'No stable mail backup obtained.' >&2; exit 1; }
mv "$archive.partial" "$archive"
sha256sum "$archive" > "$archive.sha256"
chmod 600 "$archive" "$archive.sha256"
printf 'Mail backup complete: %s\n' "$archive"
