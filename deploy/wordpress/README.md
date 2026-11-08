# Main WordPress site on the panel VPS

This stack is independent of the React/PostgreSQL panel. Root-only runtime directory:
`/opt/tradersho-wordpress/staging` (the directory name is retained after cutover).
Only the main `tradersho.com` installation is in scope. Arabic/Kurdish sites, DNS hosting,
and Netafraz mailboxes remain on Netafraz. Do not cancel that service as part of this migration.

MariaDB 10.11 has its own data directory and no published port. Apache/PHP 8.3 binds
only `127.0.0.1:8081`; Caddy reaches it on `tradersho_wordpress_proxy`, a separate network
shared by the proxy and WordPress web container. The panel application and PostgreSQL
are not members of this network. Main-site files and existing account hashes/session
keys are restored; database credentials are generated privately on the VPS.

`prepare.py` is a one-time restore helper for the approved 2026-11-08 archive.
It refuses to overwrite a previous restore. Staging disables cron, caching and outgoing
mail. Remove the staging mu-plugin only after final database synchronization, SMTP
verification and cutover preparation. Re-enable WP_CACHE and use a dedicated systemd
cron trigger before serving public traffic. Do not import over a live, writable database.

`mail.php` is installed as an mu-plugin to use the existing organizational SMTP service.
SMTP values are read from the private, read-only `smtp.json` mount, readable only by root and the PHP runtime group. TLS validation stays enabled.
No message is sent as part of connection testing. Credentials and certificate private
keys must never enter Git or public document roots.

Persistent Caddy site snippets live in `/data/sites/*.caddy`, inside its existing data
volume, and are imported by the panel's versioned Caddyfile. This prevents future panel
releases from removing the website route. Validate both the release Caddyfile and the
site snippet before reload. Keep the prior snippet and source hosting for rollback.

Operations:

```sh
cd /opt/tradersho-wordpress/staging
docker compose ps
docker compose logs --tail 50 web
/opt/tradersho-wordpress/backup.sh
```

Backups are root-only and include a consistent SQL dump, website files and runtime
configuration. They are local backups; this does not configure an off-server backup
service or automatically migrate the Netafraz email service. Retention cleanup is manual.
For restore testing, use another empty database/directory, never the live volume.
