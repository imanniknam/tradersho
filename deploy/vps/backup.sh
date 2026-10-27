#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/opt/tradersho
release=$(readlink -f "$root/current")
[[ -f "$release/image.env" ]]
mkdir -p "$root/backups"
backup="$root/backups/tradersho-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
trap 'rm -f "$backup.partial"' EXIT
docker compose --project-name tradersho --env-file "$root/.env" --env-file "$release/image.env" -f "$release/compose.yaml" exec -T db pg_dump -U tradersho -d tradersho -Fc < /dev/null > "$backup.partial"
[[ -s "$backup.partial" ]]
mv "$backup.partial" "$backup"
# Check that PostgreSQL can read the archive directory before reporting success.
docker compose --project-name tradersho --env-file "$root/.env" --env-file "$release/image.env" -f "$release/compose.yaml" exec -T db pg_restore --list < "$backup" > /dev/null
find "$root/backups" -name 'tradersho-*.dump' -type f -mtime +14 -delete
printf 'Backup ready: %s\n' "$backup"
