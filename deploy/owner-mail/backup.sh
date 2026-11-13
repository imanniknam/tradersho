#!/bin/sh
set -eu
umask 077
root=/opt/tradersho-owner-mail
mkdir -p "$root/snapshots"
work=$(mktemp -d "$root/snapshots/.work.XXXXXX")
trap 'rm -rf "$work"' EXIT
name=owner-mail-$(date -u +%Y%m%dT%H%M%SZ).tar.gz
docker exec tradersho-db-1 pg_dump -U tradersho -d tradersho --table=mail_owners --table=mail_owner_audit > "$work/owner-state.sql"
tar -czf "$root/snapshots/$name" -C /opt/tradersho-owner-mail --exclude=./snapshots --exclude=./backups . -C "$work" owner-state.sql
gzip -t "$root/snapshots/$name"
cd "$root/snapshots"
sha256sum "$name" > "$name.sha256"
printf '%s\n' "$name"
