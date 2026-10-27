#!/usr/bin/env bash
# Installed separately by the operator; forced SSH command for the CI key.
set -Eeuo pipefail
umask 077
[[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([a-f0-9]{40})$ ]] || { echo 'Only deploy <full SHA> is allowed.' >&2; exit 64; }
sha=${BASH_REMATCH[1]}
exec 8>/opt/tradersho/receive.lock
flock -w 600 8
root=/opt/tradersho
mkdir -p "$root/releases" "$root/incoming"
work=$(mktemp -d "$root/incoming/upload.XXXXXXXX")
trap 'rm -rf "$work"' EXIT
# Bound uploads to 1 GiB. Pipeline images are normally well below this.
(ulimit -f 2097152; cat > "$work/bundle.tar")
# Reject paths, links and any unexpected bundle members before extraction.
python3 - "$work/bundle.tar" "$work" <<'PY'
import sys,tarfile
allowed={'image.tar.gz','compose.yaml','Caddyfile','deploy.sh','backup.sh'}
with tarfile.open(sys.argv[1]) as archive:
    members=archive.getmembers()
    if len(members)!=len(allowed) or {m.name for m in members}!=allowed or any(not m.isfile() for m in members):
        raise SystemExit('Invalid release bundle')
    archive.extractall(sys.argv[2],filter='data')
PY
# An immutable existing release must never be overwritten, even by rerunning CI.
if [[ -e "$root/releases/$sha" ]]; then
    echo "Release $sha already exists; redeploying the stored release."
else
    docker image load --input "$work/image.tar.gz"
    docker image inspect "tradersho:$sha" > /dev/null
    mkdir "$root/releases/$sha"
    install -m 600 "$work/compose.yaml" "$work/Caddyfile" "$root/releases/$sha/"
    install -m 700 "$work/deploy.sh" "$work/backup.sh" "$root/releases/$sha/"
fi
"$root/releases/$sha/deploy.sh" "$sha"
