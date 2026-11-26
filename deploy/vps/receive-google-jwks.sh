#!/usr/bin/env bash
# Separate key: restrict,command="/usr/local/sbin/tradersho-receive-google-jwks"
set -Eeuo pipefail
umask 077
[[ ${SSH_ORIGINAL_COMMAND:-} == google-jwks ]] || exit 64
exec timeout 30s python3 /opt/tradersho/google-jwks.py receive
