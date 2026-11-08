#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=/opt/tradersho
sha=${1:?Expected full Git commit SHA}
[[ $sha =~ ^[a-f0-9]{40}$ ]] || exit 64
release="$root/releases/$sha"
[[ -s "$root/.env" && -d "$release" ]] || exit 66
exec 9>"$root/deploy.lock"
flock -w 600 9
previous=$(readlink -f "$root/current" || true)
compose() { docker compose --project-name tradersho --env-file "$root/.env" --env-file "$1/image.env" -f "$1/compose.yaml" "${@:2}"; }
printf 'APP_IMAGE=tradersho:%s\n' "$sha" > "$release/image.env"
# Keep independent WordPress traffic on a proxy-only network.
docker network inspect tradersho_wordpress_proxy >/dev/null 2>&1 || docker network create tradersho_wordpress_proxy >/dev/null
compose "$release" config --quiet
# Validate proxy configuration before touching the running release.
compose "$release" run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
if [[ -n "$previous" && -f "$previous/image.env" ]]; then
    "$previous/backup.sh"
fi
rollback() {
    status=$?
    trap - ERR
    echo 'Release failed; attempting to restore previous containers.' >&2
    if [[ -n "$previous" && -f "$previous/image.env" ]]; then
        compose "$previous" up -d --wait --wait-timeout 180 || echo 'Rollback requires operator attention.' >&2
    fi
    exit "$status"
}
trap rollback ERR
compose "$release" up -d --wait --wait-timeout 180
curl --fail --silent --show-error --retry 8 --retry-delay 2 --retry-all-errors http://127.0.0.1:8080/api/health
actual=$(curl -fsS http://127.0.0.1:8080/api/health | python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])')
[[ "$actual" == "$sha" ]]
# Smoke the reverse proxy too, without depending on public DNS/ACME availability.
curl --fail --silent --show-error --retry 5 --retry-delay 2 -H 'Host: 109.122.254.172' http://127.0.0.1/api/health
ln -sfn "$release" "$root/current.new"
mv -Tf "$root/current.new" "$root/current"
trap - ERR
printf '\nRelease %s is healthy. Previous: %s\n' "$sha" "$previous"
# Database schema rollback is deliberately not automated. Use additive migrations.

# The daily results collector runs on the VPS instead of depending on GitHub cron latency.
# Python/curl already exist on this host; credentials remain in the private environment file.
docker cp tradersho-app-1:/app/scripts/collect-persianfx.py "$root/calendar-collector.new.py"
chmod 600 "$root/calendar-collector.new.py"
mv -f "$root/calendar-collector.new.py" "$root/calendar-collector.py"
cat > /etc/systemd/system/tradersho-calendar.service <<'UNIT'
[Unit]
Description=Tradersho daily economic calendar refresh
After=network-online.target docker.service
[Service]
Type=oneshot
EnvironmentFile=/opt/tradersho/.env
Environment=CALENDAR_PANEL_URL=https://my.tradersho.com
ExecStart=/usr/bin/python3 /opt/tradersho/calendar-collector.py --past-days 0 --future-days 0
TimeoutStartSec=150
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
UNIT
cat > /etc/systemd/system/tradersho-calendar.timer <<'UNIT'
[Unit]
Description=Refresh today's calendar every minute
[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=1s
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now tradersho-calendar.timer
systemctl start --no-block tradersho-calendar.service
