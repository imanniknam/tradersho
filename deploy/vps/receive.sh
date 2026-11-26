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
timeout 300s head -c 1073741825 > "$work/bundle.tar"
[[ $(stat -c %s "$work/bundle.tar") -le 1073741824 ]] || exit 65
# Reject paths, links and any unexpected bundle members before extraction.
# Bound validator memory/time as well as upload size; it parses attacker-supplied metadata.
(ulimit -v 524288; timeout 120s python3 /opt/tradersho/validate-image.py extract "$work/bundle.tar" "$work")
# Normalize to one application tag; omit all sender-supplied OCI/tag indexes.
(ulimit -v 524288; timeout 120s python3 /opt/tradersho/validate-image.py normalize "$work/image.tar.gz" "$work/validated-image.tar" "$sha")
approved="$root/approved"
for file in compose.yaml Caddyfile deploy.sh backup.sh calendar-collector.py; do
    [[ -f "$approved/$file" && ! -L "$approved/$file" ]] || { echo 'Operator-approved configuration required.' >&2; exit 66; }
done
# An immutable existing release must never be overwritten, even by rerunning CI.
if [[ -e "$root/releases/$sha" ]]; then
    for file in compose.yaml Caddyfile deploy.sh backup.sh; do
        cmp -s "$approved/$file" "$root/releases/$sha/$file" || { echo 'Stored release configuration needs operator review.' >&2; exit 66; }
    done
    echo "Release $sha already exists; redeploying the approved stored release."
else
    docker image load --input "$work/validated-image.tar"
    docker image inspect "tradersho:$sha" > /dev/null
    mkdir "$root/releases/$sha"
    install -m 600 "$approved/compose.yaml" "$approved/Caddyfile" "$root/releases/$sha/"
    install -m 700 "$approved/deploy.sh" "$approved/backup.sh" "$root/releases/$sha/"
fi
"$approved/deploy.sh" "$sha"
