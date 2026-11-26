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

For recovery and agent-reply notifications, set the SMTP variables documented in app/README.md in root-only `/opt/tradersho/.env`; Compose forwards them to the app. `APP_PUBLIC_URL` is derived from the panel domain. TLS and certificate verification are mandatory. Keep `MAIL_ENCRYPTION_KEY` stable while jobs are pending. The legacy HTTPS recovery adapter remains supported with SMTP disabled. After environment edits, recreate app using the same release/deploy script.

Reference: [Docker startup readiness](https://docs.docker.com/compose/how-tos/startup-order/), [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/).

## Internal authentication CAPTCHA

VPS login and registration require a self-hosted, nonnumeric ALTCHA proof-of-work challenge (`CAPTCHA_MODE=pow`), verified in PostgreSQL on the server. Configure a random `CAPTCHA_SECRET` of at least 32 characters; bootstrap generates it outside Git. Challenges expire after three minutes, are HMAC-hashed at rest, allow one attempt and cannot be replayed in parallel. The browser solves a signed PBKDF2/SHA-256 challenge in two Web Workers after a checkbox click. No image code, external CAPTCHA account, third-party requests, or shared user data are required. Server verification uses signed-key HMAC checks instead of an attacker-controlled expensive KDF. The legacy image mode remains available only as an explicit configuration choice (`internal`); it is never an automatic fallback. Missing, wrong and expired answers block login and registration; a fresh challenge follows an unsuccessful authentication request. Challenge generation, login and registration are rate-limited. Proof-of-work raises the computation cost of scripted attempts; it does not prove that a person is human or replace password/session/rate-limit controls. The Persian checkbox is keyboard operable; failures/expiry require a new challenge, and submission stays disabled until a proof exists. Test slow or low-power devices before increasing the fixed challenge difficulty.

The app can run without CAPTCHA when `CAPTCHA_MODE` is unset (legacy/local environments); the VPS Compose explicitly enables PoW and requires the secret. CI explicitly enables it with an isolated, non-production test secret. Tests seed known challenge hashes only in their dedicated `_qa` database; no answer/debug endpoint exists in production.



News ingestion is retired. Scheduled workflow and public read/import routes are removed (HTTP 410); historical database tables are retained. Native calendar data integration is pending a separately selected raw-data source. No calendar feed/API key is currently required or configured.

### دریافت نتایج تقویم
انتشار، collector تأییدشده را از image به `/opt/tradersho/calendar-collector.py` منتقل و `tradersho-calendar.timer` را فعال می‌کند. زمان‌بند هر۶۰ثانیه روز جاری تهران را دریافت می‌کند؛ Python3 و curl روی میزبان لازم‌اند. `CALENDAR_INGEST_TOKEN` از فایل خصوصی `/opt/tradersho/.env` خوانده می‌شود. وضعیت: `systemctl status tradersho-calendar.timer` و `journalctl -u tradersho-calendar.service`؛ از چاپ EnvironmentFile خودداری کنید. غیرفعال‌سازی: `systemctl disable --now tradersho-calendar.timer`. خطای منبع cache موفق قبلی را حفظ می‌کند. GitHub دریافت ساعتی پنجرهٔ وسیع را ادامه می‌دهد.

## Google public signing key cache

The VPS may receive HTTP 403 from Google's public JWKS host while its token endpoint remains reachable. The server keeps full RSA/issuer/audience/expiry/nonce verification. A fresh public-key snapshot, obtained only from `https://www.googleapis.com/oauth2/v3/certs` over verified TLS, can serve the key resolver during this upstream outage. A healthy 200 response from Google always takes precedence; a healthy key set without a matching kid never falls back to an older set. The snapshot follows Google's Cache-Control lifetime, capped at two hours, including keys already in jose's memory. Expired, foreign, oversized, duplicate, private or non-RSA key data fails closed.

Install `deploy/vps/google-jwks.py` as root-only `/opt/tradersho/google-jwks.py` and the reviewed receiver update as `/usr/local/sbin/tradersho-receive` without changing SSH identities. Besides its existing immutable deploy protocol, the forced receiver accepts exactly `google-jwks`, bounded to 64 KiB and one fixed public file. No path argument or shell access is added. The snapshot is atomically replaced in `/opt/tradersho/google-jwks/jwks.json`, mounted read-only in the app. It contains no OAuth client secret or user data.

`.github/workflows/google-jwks.yml` refreshes it hourly and after successful application deployments using the existing production deployment identity and pinned host key. A manual dispatch refreshes keys alone. A failed collection/upload preserves the existing file, whose expiry still applies; authentication cannot silently accept stale keys. Verify a fresh snapshot after initial setup and monitor the independent workflow. The private Google client ID/secret stay only in `/opt/tradersho/.env`.

## Security upgrade prepared on 26 November 2026 (operator installation required)

This section supersedes the older shared-superuser and uploaded-root-script instructions above. These changes are prepared locally; they have not been installed on the VPS. Do not merge/push main as a substitute for the operator steps: main still triggers deployment.

1. Make and verify a database/configuration backup. Keep the existing `MAIL_ENCRYPTION_KEY`, owner-key and all MFA state. Review `database-roles.sql` and run `provision-database.py` beside it on the existing server. It generates and preserves independent hex passwords in the root-only `/opt/tradersho/.env`, moves existing mail-owner state into `owner_mail`, and removes superuser privileges from the two runtime identities. Panel owns/migrates only its public tables; owner-mail reads only private views of the designated owner and that owner’s sessions and writes its private MFA/throttle/audit tables. It is service isolation, not protection from a PostgreSQL administrator or a compromised panel's own account/MFA data. On a fresh database, bootstrap the reviewed panel schema first in a separate operator session.
2. Prepare and manually install the reviewed owner-mail service (`server.mjs`, `prepare.py`, `backup.sh`) before changing the panel. `prepare.py` reads the existing private `OWNER_EMAIL` or an explicitly supplied one; it must not choose a new owner. It uses only the dedicated owner-mail database password. Restart/verify this service with its independent runtime URL. It requires the `__Host-tradersho_session` cookie and rejects suspended accounts. The new private schema is included in its backup; keep the full database backup too. Schema/role provisioning and the owner-service switch need a short coordinated maintenance window.
3. Install root-owned mode-700 `/opt/tradersho/approved`, containing manually reviewed copies of `compose.yaml`, `Caddyfile`, `deploy.sh`, `backup.sh`, and `app/scripts/collect-persianfx.py` named `calendar-collector.py`. Install `validate-image.py` at `/opt/tradersho/validate-image.py` and `receive.sh` at `/usr/local/sbin/tradersho-receive` (root owned, mode 700). Only the operator can update this configuration. Preload the reviewed PostgreSQL/Caddy images; CI now transfers only the application image. The receiver rejects config/script bundle members, normalizes image metadata to the single requested application tag, and cannot replace database/proxy tags. Calendar source also comes from approved configuration, not an uploaded app image. Existing release metadata must match the approved files to redeploy that SHA; use a new release or review the old snapshot manually.
4. Generate a separate SSH identity with `restrict,command="/usr/local/sbin/tradersho-receive-google-jwks"`, install `receive-google-jwks.sh` at that path, and store its private key as GitHub `GOOGLE_JWKS_SSH_KEY`. Keep the existing pinned host key. The deployment key no longer accepts `google-jwks`, and the signing-key key cannot deploy. Configure/install both sides together so refresh does not stop. No new key was generated or uploaded by this local change.
5. Verify `APP_DATABASE_PASSWORD` is present before deploying the reviewed app. Compose refuses to fall back to the database superuser. Check app health, calendar service/timer, both MFA flows, recovery delivery and staff enrollment immediately after a separately authorized release. Before first staff enrollment, a stolen password can still enroll the attacker's authenticator; coordinate enrollment with designated staff. The SMTP worker does not guarantee Inbox placement.

CI is still trusted to supply application code, which can access that application's secrets/data. This change removes uploaded host scripts/configuration and base-image replacement from the receiver protocol; it does not turn application deployment into an untrusted operation. Repository privacy, branch/environment protections, separate management hostname and encrypted off-host backup remain independent operator/account work. No production settings, secrets, DNS, repository visibility or branch rules were changed here.

Local validation covers SQL permissions/migration, the real owner service against a fake broker, malicious archive fixtures and script syntax. Docker daemon was unavailable on the development machine, so a full Docker image-load/Compose deployment and real systemd installation were not run. These remain operator pre-release checks; the receiver/normalizer protocol must be installed together with the workflow change.
