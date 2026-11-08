#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/opt/tradersho-wordpress
cd "$root/staging"
exec 9>"$root/backup.lock"
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$root/backups/wordpress-$stamp"
mkdir "$out"
docker compose exec -T db sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump -uroot --single-transaction --routines --triggers wordpress' | gzip > "$out/database.sql.gz"
gzip -t "$out/database.sql.gz"
tar -czf "$out/files.tar.gz" --exclude='./wp-content/cache' -C html .
cp .env "$out/runtime.env"
cp smtp.json "$out/smtp.json"
cp compose.yaml php.ini apache.conf "$out/"
sha256sum "$out/database.sql.gz" "$out/files.tar.gz" > "$out/SHA256SUMS"
printf 'Backup complete: %s\n' "$out"
