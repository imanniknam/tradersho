#!/usr/bin/env bash
set -Eeuo pipefail
for task in backup tls-sync; do
write_paths=/opt/tradersho-mail
if [[ "$task" == backup && -d /opt/tradersho-webmail/db ]]; then
    # SQLite's online backup needs its normal journal/locking directory.
    write_paths+=' /opt/tradersho-webmail/db'
fi
cat > "/etc/systemd/system/tradersho-mail-$task.service" <<UNIT
[Unit]
Description=Tradersho independent mail $task
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/opt/tradersho-mail/$task.sh
TimeoutStartSec=300
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$write_paths
UNIT
done
cat > /etc/systemd/system/tradersho-mail-backup.timer <<'UNIT'
[Unit]
Description=Daily Tradersho mail backup
[Timer]
OnCalendar=*-*-* 01:15:00 UTC
RandomizedDelaySec=600
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/tradersho-mail-tls-sync.timer <<'UNIT'
[Unit]
Description=Synchronize renewed Tradersho mail TLS certificates
[Timer]
OnBootSec=2min
OnUnitActiveSec=6h
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now tradersho-mail-backup.timer tradersho-mail-tls-sync.timer
