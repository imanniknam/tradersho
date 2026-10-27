# Tradersho VPS deployment

Target: Ubuntu 24.04 / amd64, `109.122.254.172`, canonical origin `https://my.tradersho.com`.

## Architecture

Docker Compose runs Node 24 (API + React static build, non-root, read-only root filesystem), PostgreSQL 17 with a persistent named volume, and Caddy 2 with persistent certificates. Only 80/443 are public. Application diagnostics bind `127.0.0.1:8080`; PostgreSQL has no host port. Caddy overwrites forwarded client headers; `TRUST_PROXY=1` is enabled only in this configuration. Keep direct app access private.

Brand font binaries are deliberately excluded from the image and Git; install the four licensed WOFF files in `/opt/tradersho/brand-fonts` with directory mode 755 and file mode 644. Compose mounts them read-only at `/app/dist/fonts`.

## Initial setup

1. Add DNS `A my.tradersho.com -> 109.122.254.172`. Remove stale AAAA records. If using Cloudflare, start with DNS-only; enable proxy later with Full (strict) TLS.
2. Inspect and run `bootstrap.sh` as root on a fresh Ubuntu 24.04 VPS. It installs Docker from its official apt repository, generates a hex PostgreSQL password, prepares private directories, enables 22/80/443 and installs a daily backup timer. It does not alter SSH authentication.
3. Keep `/opt/tradersho/.env` private (mode 600), based on `.env.example`. Never change `POSTGRES_PASSWORD` alone after initialization: changing the env file does not rotate the existing DB role password.
4. Install `receive.sh` as `/usr/local/sbin/tradersho-receive` (mode 700). Generate a dedicated ed25519 key for CI and add its public key to root's `authorized_keys` prefixed with:
   `restrict,command="/usr/local/sbin/tradersho-receive" `
   This key accepts only `deploy <40-char commit SHA>`, no interactive shell/forwarding. Deployment runs trusted release scripts as root: write access to main/Actions must be restricted to trusted maintainers.
5. GitHub repository secrets: `VPS_SSH_KEY` (dedicated CI private key), `VPS_KNOWN_HOSTS` (verified ed25519 host key). Variables: `VPS_HOST=109.122.254.172`, `VPS_PORT=22`. The setup key used from the operator's Mac must not be used in CI. Pin the server host key; never disable strict host verification.
6. Push main or run **Test and deploy VPS** manually. The `production` environment can additionally require reviewers if the owner wants manual release approval.

## Delivery pipeline

PRs run Node 24 build, 21 unit tests, real PostgreSQL API tests and desktop/mobile browser checks against a separate `_qa` database. Main does the same, then builds an immutable `tradersho:<commit SHA>` image. GitHub sends the image and an allowlisted release bundle over SSH; no public image registry, deploy password or private fonts are required. The receiver rejects links/paths/unexpected files. Releases live at `/opt/tradersho/releases/<SHA>`.

Before replacing an existing release, deployment takes a database backup. Compose waits for DB/application health. Both the application and HTTP reverse-proxy health are checked, including commit version. On failure, the script attempts to restore the previous release's containers. The `current` symlink changes only after success. A single-server replacement may briefly interrupt requests; this is not a zero-downtime blue/green rollout. Release scripts never automatically delete database volumes.

Caddy gets a trusted TLS certificate once DNS and public 80/443 are correct. HTTP IP requests redirect to the canonical HTTPS hostname, except the non-sensitive `/api/health` endpoint. Do not submit credentials over plain HTTP. Before DNS is ready, use an SSH tunnel to `127.0.0.1:8080` for private preview; the deployment can be healthy while HTTPS issuance is still pending.

## Operations

```bash
cd /opt/tradersho/current
docker compose --env-file /opt/tradersho/.env --env-file image.env ps
docker compose --env-file /opt/tradersho/.env --env-file image.env logs --tail 100 app proxy
/opt/tradersho/current/backup.sh
systemctl list-timers tradersho-backup.timer
# Roll back to a known previously healthy Git SHA:
/opt/tradersho/releases/FULL_PREVIOUS_SHA/deploy.sh FULL_PREVIOUS_SHA
```

Logs rotate (3 x 10 MB per service). Daily custom-format `pg_dump` backups are checked with `pg_restore --list` and retained 14 days under `/opt/tradersho/backups` (root only). This is local backup, not disaster recovery: add encrypted off-host storage before relying on production data. Test restore in a separate database periodically.

Application rollback does not reverse database migrations. Keep schema changes backward-compatible/additive. For destructive migrations, plan a manual maintenance/restore procedure. Never run `docker compose down -v` against production. Restore only into a new isolated database first; stop writes before any deliberate production restore.

Fresh VPS databases do not automatically contain Render/local accounts or tickets. Migrating those requires a separately supplied PostgreSQL dump; this deployment never silently copies or replaces existing user data. There is no default administrator. Grant the support role only for a user explicitly designated by the owner:

```bash
docker compose --env-file /opt/tradersho/.env --env-file image.env exec app node scripts/support-agent.mjs grant APPROVED_EMAIL
```

Recovery email remains disabled until `RECOVERY_EMAIL_URL` and `RECOVERY_EMAIL_SECRET` are set to an authenticated HTTPS email adapter. `APP_PUBLIC_URL` is derived from the panel domain. After environment edits, recreate app using the same release/deploy script.

Reference: [Docker startup readiness](https://docs.docker.com/compose/how-tos/startup-order/), [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/).

## Internal authentication CAPTCHA

VPS login and registration require a five-digit raster PNG CAPTCHA (`CAPTCHA_MODE=internal`), verified in PostgreSQL on the server. Configure a random `CAPTCHA_SECRET` of at least 32 characters; bootstrap generates it outside Git. Challenges expire after three minutes, are HMAC-hashed at rest, allow one attempt and cannot be replayed in parallel. Persian/Arabic digits are accepted. Missing, wrong and expired answers block login and registration; a fresh challenge follows an unsuccessful authentication request. Challenge generation, login and registration are rate-limited. This is an additional bot deterrent, not a substitute for password/session/rate-limit controls or a guarantee against OCR. The current visual challenge supports refresh and labeled keyboard input but has no audio alternative; add an accessible external provider or audio challenge before claiming full accessibility.

The app can run without CAPTCHA when `CAPTCHA_MODE` is unset (legacy/local environments); the VPS Compose explicitly enables it and requires the secret. CI explicitly enables it with an isolated, non-production test secret. Tests seed known challenge hashes only in their dedicated `_qa` database; no answer/debug endpoint exists in production.
