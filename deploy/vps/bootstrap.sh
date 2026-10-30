#!/usr/bin/env bash
# Run as root on a fresh Ubuntu VPS. Does not change SSH login policy.
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo 'Expected Ubuntu 24.04.' >&2; exit 1; }
if ! command -v docker >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl python3 ufw
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$(dpkg --print-architecture)" "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
install -d -m 700 /opt/tradersho /opt/tradersho/backups /opt/tradersho/releases /opt/tradersho/incoming
install -d -m 755 /opt/tradersho/brand-fonts
if [[ ! -f /opt/tradersho/.env ]]; then
    umask 077
    printf 'POSTGRES_PASSWORD=%s\nPANEL_DOMAIN=my.tradersho.com\nSERVER_IP=109.122.254.172\nDEPLOY_ROOT=/opt/tradersho\nRECOVERY_EMAIL_URL=\nRECOVERY_EMAIL_SECRET=\n' "$(openssl rand -hex 32)" > /opt/tradersho/.env
fi
if ! grep -q '^CAPTCHA_SECRET=' /opt/tradersho/.env; then printf 'CAPTCHA_SECRET=%s\n' "$(openssl rand -hex 32)" >> /opt/tradersho/.env; fi
# Only the proxy is publicly published; DB has no published port, app binds loopback.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
cat > /etc/systemd/system/tradersho-backup.service <<'UNIT'
[Unit]
Description=Tradersho PostgreSQL backup
Requires=docker.service
After=docker.service
[Service]
Type=oneshot
ExecStart=/opt/tradersho/current/backup.sh
UNIT
cat > /etc/systemd/system/tradersho-backup.timer <<'UNIT'
[Unit]
Description=Daily Tradersho database backup
[Timer]
OnCalendar=*-*-* 03:20:00 UTC
RandomizedDelaySec=600
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now tradersho-backup.timer
docker version --format '{{.Server.Version}}'
docker compose version
