# Independent mail, DNS and webmail operations

Production roots are `/opt/tradersho-mail`, `/opt/tradersho-dns` and
`/opt/tradersho-webmail`. These templates contain no account passwords, private
keys or production DNS zone. Restore those from a verified private backup; never
commit them. Do not run the main VPS bootstrap against this existing server.

Mail uses the official Docker Mailserver v17.0.0 digest in `image.env.example`.
Webmail uses official Roundcube 1.7.6, pinned in `../webmail/compose.yaml`.
BIND is pinned in `../dns/compose.yaml`. Review vendor security updates and move
the pins deliberately; version pins do not install future security fixes.

## Access

The canonical webmail URL is `https://mx.tradersho.com`. Use the full mailbox
address and its existing password. IMAP is TLS on 993; SMTP is STARTTLS on 587
or implicit TLS on 465. The hostname must match the certificate. Old Netafraz
server names in desktop/mobile clients need updating.

Roundcube uses authenticated IMAP/SMTP and a persistent SQLite database for
preferences, contacts and sessions. Mail remains in DMS Maildirs. The private
`config/session.key` must be 24 random characters, readable by container UID 33;
the config directory must be traversable by that UID. Do not enable its installer
or password-management plugins without a separately designed account workflow.

The external Docker network `tradersho_wordpress_proxy` is shared with Caddy.
Webmail has no public host port. `../webmail/mail.caddy` lives in the existing
Caddy persistent volume as `/data/sites/mail.caddy`, imported by the normal
panel Caddyfile. Preserve that volume across panel deployments. Preserve the
WordPress project and network: AR/KU sites were not included in this migration.

## Start/recreate without touching the application databases

From each root, validate `docker compose config -q` first. For mail, also pass
`--env-file image.env` to compose. Start only the intended project/service.
Do not flush Docker, UFW or nftables rules, and do not replace the running panel
release with a stale frontend image.

For a panel SMTP hostname change, back up `/opt/tradersho/.env`, preserve its
queue encryption key and credentials, and recreate **app only** from the current
release using both `.env` and its `image.env`. For WordPress, its SMTP JSON is a
single-file bind mount: an atomic replacement requires `--force-recreate web`.
Recreating only the web service preserves the database and uploads.

## Backup and TLS

Install `backup.sh`, `tls-sync.sh` and `install-timers.sh` in the mail root with
mode 700. Run `install-timers.sh` after webmail is installed so the backup unit
includes SQLite's journal directory in its narrowly scoped ReadWritePaths.

The backup timer runs daily at 01:15 UTC plus up to ten minutes. Archives and
their SHA256 sidecars are private. They contain mail config/data/state/TLS,
a consistent online SQLite snapshot and webmail config/key, plus DNS config.
The script retries only tar's changed-file status, and fails on other errors.
Socket files are intentionally omitted by tar. Keep a verified encrypted/private
copy off the VPS as well; local VPS snapshots alone do not cover host loss.

Before restoring, verify the checksum, inspect/extract into a private staging
directory and check SQLite with `PRAGMA integrity_check`. Stop the affected
services before replacing their state; restore Maildir ownership to 5000:5000
and webmail permissions for UID 33. Preserve the original state as rollback data.
Never overlay a source-host backup over newer VPS mail; merge missing messages
by content hash instead.

`tls-sync.sh` copies only the mx certificate from Caddy, validates hostname,
expiry and certificate/key correspondence, then reloads Postfix and Dovecot.
Its six-hour timer and Caddy's certificate renewal must remain enabled.

## DNS and transition routing

The authoritative-only BIND config expects the private production zone at
`config/zones/tradersho.com.db`. Validate with `named-checkconf -z` before a
reload/restart. Preserve every existing verification record and the AR/KU host
records. Register glue before selecting private nameservers at the registrar.
Both nameservers currently share one VPS/IP; they are not independent replicas.

Canonical MX is `10 mx.tradersho.com.`. Old DNS was updated too. On the old host,
the existing three canonical addresses forward to the corresponding address at
`legacy-inbound.tradersho.com`. That subdomain has an MX pointing to mx, and DMS
aliases map back to each original mailbox. This avoids local-domain forwarding
loops and catches messages using stale DNS or the remaining old-host sites.
Keep this compatibility route until those uses have been audited; removing the
old host is a separate migration for AR/KU, not part of the email/DNS change.

Acceptance checks should cover real TLS/AUTH, rejected unauthenticated external
relay, one authorized delivery in each direction, webmail login/logout, public
UDP/TCP authoritative DNS, parent glue/delegation, HTTPS health, and an actual
systemd backup plus SQLite integrity. SMTP acceptance alone is not Inbox proof.
