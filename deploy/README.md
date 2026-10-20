# Deploying to the VPS (aspire.thechunkmedia.com)

The server (Debian 13, shared with other sites) runs this app in Docker so it can use Node 24 without touching the host's Node 20 apps. nginx on the host terminates TLS and proxies `aspire.thechunkmedia.com` to `127.0.0.1:3011`.

Nothing on the shared server is changed without the owner's approval: every server step below is run by the owner, or by a deploy agent the owner has approved for that step.

## Layout on the server

| Path | What |
|---|---|
| `/opt/aspire-web/docker-compose.yml` | Copy of `deploy/docker-compose.yml` |
| `/opt/aspire-web/.env` | Settings, mode 600, never committed (see below) |
| `/opt/aspire-web/release/` | Source of the deployed commit (`git archive`) — the Docker build context |
| `/opt/aspire-web/data/` | Auth database `aspire.sqlite` (owned by uid 1000) — backed up nightly (see [Backups](#backups)) |
| `/opt/aspire-web/data/ops/` | Status files written by the ops scripts; the app reads them as `/data/ops/*.json` |
| `/opt/aspire-web/bin/` | Installed copies of `deploy/*.sh` (cron runs these, not `release/`, which is replaced on every release) |
| `/opt/aspire-web/backup.env` | Backup settings, mode 600, never committed (no secret with age: only the public key) |
| `/opt/aspire-web/backup-recipients.txt` | The backup **public** key (`age1…`). The secret key is only in the owner's password manager |
| `/opt/aspire-web/backups/encrypted/` | Local encrypted copies (`daily/`, `weekly/`, `manual/`), mode 700 — short-term; the real copies are off-server |
| `/opt/aspire-web/backups/*.sqlite` | Older **unencrypted** pre-release copies made by hand (delete once encrypted backups work, see below) |
| `/etc/nginx/sites-available/aspire.thechunkmedia.com` | Server block; `proxy_pass http://127.0.0.1:3011;` (+ a temporary [manifest hotfix](#temporary-nginx-manifest-hotfix)) |
| `/etc/cron.d/aspire-web` | Nightly backup and disk check |

`.env` keys: `NEXT_PUBLIC_SITE_URL=https://aspire.thechunkmedia.com`, `TRUSTED_PROXY_HOPS=1` (nginx appends to `X-Forwarded-For`), optional `PREVIEW_ACCESS_PASSWORD` (browser password prompt on every page; remove the line and restart to open the site), `RELEASE=<commit>`, `SHOW_PLACEHOLDER_CONTENT` (`true` = demo mode: DEMO data and result cards visible — used at build **and** run time, so rebuild after changing it; unset/`false` = production, demo data hidden).

Result cards (D-031) live only on the server in `/opt/aspire-web/result-cards/` (mounted read-only). Re-create locally with `node scripts/import-result-cards.mjs`, then copy: `tar -C private/result-cards -cf - . | ssh root@69.62.76.109 "mkdir -p /opt/aspire-web/result-cards && tar -x -C /opt/aspire-web/result-cards"`.

**Current mode (owner decision 2026-10-20):** demo mode, **no password** — 715 students' result cards and names are publicly reachable (noindex) before Aspire has confirmed consent (checklist RC-1). Switch back to production by setting `SHOW_PLACEHOLDER_CONTENT=false` and rebuilding.

## Release

The disk is the bottleneck (about 95% full; a build peaks at about 2.6 GB). Follow the checklist in order.

1. **CI is green** for the commit (GitHub → Actions → CI). It runs the typecheck, lint, tests and the same `next build` the server will run.
2. **Disk:** `/opt/aspire-web/bin/disk-check.sh` — needs 3 GB free. If not, run `prune-images.sh` (dry run, show the owner) and `docker builder prune -f` first.
3. **Backup first:** `/opt/aspire-web/bin/backup.sh --label pre-<commit>` (encrypted, uploaded, kept under `manual/`).
4. **Upload the source** (from the repo, on your machine):
   ```sh
   git archive --format=tar <commit> | ssh root@69.62.76.109 "rm -rf /opt/aspire-web/release && mkdir -p /opt/aspire-web/release && tar -x -C /opt/aspire-web/release"
   ```
5. **Build with the low-disk watchdog** (below), then `docker compose up -d` and `docker compose ps` (healthy). Check that the server's other sites still answer 200.
6. **Clean up:** `docker builder prune -f`, then `/opt/aspire-web/bin/prune-images.sh` (dry run; `--apply` once the owner agrees) so only the current and one rollback image remain.
7. **If `deploy/*.sh` or `deploy/aspire-web.cron` changed** in this release, reinstall them: `install -m 750 /opt/aspire-web/release/deploy/*.sh /opt/aspire-web/bin/` (and the cron file as in [setup step 8](#one-time-setup-owner-or-a-deploy-agent-with-approval)).
8. **Manifest hotfix:** if this release ships the Rancho PWA (`src/app/manifest.ts` with `id: "/rancho"`, `start_url: "/rancho"`), **remove the nginx manifest hotfix in the same release** ([steps](#temporary-nginx-manifest-hotfix)). Until then, leave it in place.

### Low-disk build watchdog

Run the build in the background and stop it if free space falls under 300 MB, so a build can never fill the shared disk; a failed or stopped build puts `RELEASE` back.

```sh
cd /opt/aspire-web
PREV=$(sed -n 's/^RELEASE=//p' .env)
sed -i "s/^RELEASE=.*/RELEASE=<commit>/" .env
docker compose build > /tmp/aspire-build.log 2>&1 &
BUILD_PID=$!
while kill -0 "$BUILD_PID" 2>/dev/null; do
  FREE_MB=$(df -Pm /var/lib/docker | awk 'NR == 2 { print $4 }')
  if [ "$FREE_MB" -lt 300 ]; then
    echo "Only ${FREE_MB} MB free: stopping the build"
    kill "$BUILD_PID"
    break
  fi
  sleep 5
done
if wait "$BUILD_PID"; then
  echo "Build OK"
  docker compose up -d && docker compose ps
else
  echo "Build failed or was stopped (see /tmp/aspire-build.log): back to RELEASE=$PREV"
  sed -i "s/^RELEASE=.*/RELEASE=$PREV/" .env
fi
docker builder prune -f   # always: frees 1-2 GB of build cache
```

### Temporary nginx manifest hotfix (removed)

From 20 to 21 October 2026 nginx served a hand-written Rancho manifest from `/var/www/aspire-hotfix/`. It was removed when release 806a938 shipped its own `src/app/manifest.ts` (config backups in `/opt/aspire-web/nginx-backup/`). `/var/www/aspire-hotfix` can be deleted.

## Contact form before tool results (lead gate)

The form is built in and reads its settings from `.env` on every request (no rebuild). Owner decision (21 Oct 2026): **on now, required, with the honest sample-data note**. Settings:

```sh
LEAD_GATE=required                       # off | optional | required
LEAD_GATE_SECRET=<openssl rand -hex 32>  # >= 32 chars; without it production keeps the gate OFF; changing it re-asks every browser
LEAD_GATE_SINCE=<ISO switch-on time, e.g. 2026-10-21T18:00:00+05:30>   # mock attempts started earlier are never gated
# keep ENQUIRY_STORE empty or crm (off forces the gate off); keep SHOW_PLACEHOLDER_CONTENT=true while sample data shows (the form then says so)
# optional, defaults shown: LEAD_GATE_RECORD_USE=all  LEAD_GATE_ASSIGN=auto  LEAD_GATE_MAX_NEW_LEADS_PER_HOUR=300
```

Apply: `cd /opt/aspire-web && docker compose up -d` (recreate). Check: `curl -s https://aspire.thechunkmedia.com/api/lead-gate` returns `"mode":"required"` and `"sample":true`. Roll back: set `LEAD_GATE=off` (or `optional`) and recreate. Never print the secret; it lives only in the root-only `.env`.

## First admin (once)

```sh
cd /opt/aspire-web && docker compose exec app npm run auth:create-admin -- --login-id <id> --name "<name>"
```
It prompts for the password (hidden). Never run `auth:seed` on the server.

## Roll back

Previous images stay tagged `aspire-web:<commit>`: set `RELEASE=<previous commit>` in `.env` and `docker compose up -d`. `prune-images.sh` always keeps one rollback image (the newest other one, or the one named with `--rollback <tag>`).
The pre-M4 demo (`/opt/aspire-demo`, port 3010) was stopped, not deleted: point nginx back to `127.0.0.1:3010`, `cd /opt/aspire-demo && docker compose up -d`, `nginx -t && systemctl reload nginx`. Its image `aspire-web:demo` is kept by `prune-images.sh` (`KEEP_TAGS`).

## Backups

Owner decision 3 (2026-10-21): a nightly encrypted copy of the database to a cloud folder the owner owns (Google Drive through rclone), 14 daily and 8 weekly copies, the key in the owner's password manager, a restore test once a month.

### How it works

`deploy/backup.sh` (cron, every night):

1. **Snapshot:** `docker compose exec -T app node -e "…VACUUM INTO…"` makes a consistent copy of `/data/aspire.sqlite` inside the running container (node:sqlite; a plain file copy of a WAL database is not safe) and runs `PRAGMA integrity_check` on it. If the app is not running, the backup fails and says so.
2. **Encrypt:** gzip, then [age](https://age-encryption.org) to the owner's **public** key (`backup-recipients.txt`). The server can make backups but cannot read them: only the secret key in the password manager can. (Fallback: `ENCRYPTION=openssl`, AES-256 with a key file on the server, `backup.key`, mode 600; the same key must also be in the password manager. age is preferred.) The unencrypted snapshot is deleted at once, also on failure.
3. **Upload:** rclone copies it to `$RCLONE_REMOTE` (`daily/aspire-YYYY-MM-DD.sqlite.gz.age`; the first copy of each ISO week also goes to `weekly/aspire-YYYY-Www…`; `--label` copies go to `manual/`) and checks the size there. Dates are UTC.
4. **Retention:** newest 14 daily, 8 weekly, 6 manual copies, locally and on the remote (other files in those folders are never touched). On Google Drive, deleted copies sit in the Drive trash for 30 days first.
5. **Status:** writes `data/ops/backup-status.json` (`result`, `lastRunAt`, `lastSuccessAt`, `file`, `sizeBytes`, `sha256`, `dbTables`, `dbUserVersion`, copy counts, `error`) and `data/ops/backup-last-success` (time of the last verified off-server copy). The admin console's Site status page reads `/data/ops/backup-status.json` and should warn when `result` is `failed` or `lastSuccessAt` is older than 26 hours.

Any failure prints a clear `ERROR:` line in the log, records `"result": "failed"` with the error, and exits non-zero. Runs never overlap (a lock in `/run/lock`), and a run stops before it would leave less than 300 MB free.

`deploy/restore.sh test` is the monthly restore test, `restore.sh apply` a real restore (below). `deploy/disk-check.sh --status` writes `data/ops/disk-status.json` the same way.

### One-time setup (owner, or a deploy agent with approval)

1. **Install the tools** (about 70 MB): `apt-get install -y age rclone`
2. **Install the scripts** (from a release that contains them):
   ```sh
   install -d -m 755 /opt/aspire-web/bin
   install -m 750 /opt/aspire-web/release/deploy/*.sh /opt/aspire-web/bin/
   ```
3. **Make the key on the owner's PC, not on the server** (so the secret key never touches the server):
   - Install age: `winget install --id FiloSottile.age` (or the Windows zip from github.com/FiloSottile/age/releases).
   - `age-keygen -o aspire-backup-key.txt` prints `Public key: age1…`.
   - Save the **whole file** (it contains `AGE-SECRET-KEY-1…`) in the password manager as "Aspire backup key (age)", then delete the file. Optionally keep a second copy offline (printed, in a safe). Without this key no backup can ever be read.
   - Put only the public key on the server: `echo 'age1…' > /opt/aspire-web/backup-recipients.txt && chmod 644 /opt/aspire-web/backup-recipients.txt`
4. **Connect rclone to the owner's Google Drive** (headless server):
   - On the server: `rclone config` → `n` (new remote) → name `gdrive` → storage `drive` → client_id and client_secret empty → scope **`drive.file`** (rclone can then see only the files it creates, never the rest of the Drive) → root_folder_id and service_account_file empty → advanced config `n` → auto config **`n`**.
   - rclone prints an `rclone authorize "drive" "…"` command. The owner runs it on their PC (`winget install Rclone.Rclone`), signs in with the Google account that should own the backups, and pastes the token back. Shared drive: `n`. Keep the remote.
   - `rclone mkdir gdrive:aspire-backups && rclone lsd gdrive:` (the token lives in `/root/.config/rclone/rclone.conf`, mode 600; it is a secret, never commit it).
   - If you use your own Google client ID instead, publish its OAuth consent screen ("In production"); a "Testing" app's token expires after 7 days and the uploads stop.
5. **Settings** in `/opt/aspire-web/backup.env` (mode 600):
   ```sh
   RCLONE_REMOTE=gdrive:aspire-backups
   ENCRYPTION=age
   AGE_RECIPIENTS_FILE=/opt/aspire-web/backup-recipients.txt
   # Defaults: KEEP_DAILY=14 KEEP_WEEKLY=8 KEEP_MANUAL=6 MIN_FREE_MB=300 BACKUP_DIR=/opt/aspire-web/backups/encrypted
   ```
6. **Check, then the first backup:**
   ```sh
   /opt/aspire-web/bin/backup.sh --check     # tools, key, remote and app container; backs nothing up
   /opt/aspire-web/bin/backup.sh             # first real backup
   cat /opt/aspire-web/data/ops/backup-status.json
   ```
7. **First restore test** (see [Monthly restore test](#monthly-restore-test)). The sprint is only done when this passes once.
8. **Cron and log rotation** (`deploy/aspire-web.cron`: backup at 21:30 server time, which is 03:00 IST when the server clock is UTC — check with `timedatectl`; disk check every 6 hours):
   ```sh
   install -m 644 /opt/aspire-web/release/deploy/aspire-web.cron /etc/cron.d/aspire-web
   install -m 644 /opt/aspire-web/release/deploy/aspire-web.logrotate /etc/logrotate.d/aspire-web
   ```
   The next morning, check `tail /var/log/aspire-web-backup.log` and `backup-status.json`.
9. **Old unencrypted copies:** once the first encrypted backup and restore test have passed, and with the owner's OK, delete `/opt/aspire-web/backups/*.sqlite` (plain copies with personal data). From now on use `backup.sh --label pre-<commit>` before releases instead.

### Monthly restore test

First working day of each month (put it in the calendar). It proves that the **off-server** copy can be read with the key from the password manager. The live database is not touched.

The owner pastes the secret key in their own SSH session (never through a chat or an agent). `/dev/shm` is memory, not disk:

```sh
(umask 077; cat > /dev/shm/aspire-backup-key.txt)    # paste the key from the password manager, Enter, then Ctrl-D
/opt/aspire-web/bin/restore.sh test --identity /dev/shm/aspire-backup-key.txt
shred -u /dev/shm/aspire-backup-key.txt
```

It downloads the newest daily copy from Google Drive, decrypts and unzips it, runs `PRAGMA integrity_check` inside the app container and prints each table's row count in the backup next to the live database. Pass = `RESTORE TEST PASSED` and counts close to the live ones (the backup is up to a day old). The result is recorded in `data/ops/restore-test.json` (`result`, `testedAt`, `lastSuccessAt`, `file`, `error`); the console should warn when the last pass is older than 35 days. A failure is an incident: check `/var/log/aspire-web-backup.log`, run `backup.sh` by hand and test again.

Other copies: `restore.sh list`, then e.g. `restore.sh test weekly/aspire-2026-W43.sqlite.gz.age --identity …`.

Disaster drill (optional, once a year): download a copy from Google Drive to the PC and open it there: `age -d -i aspire-backup-key.txt aspire-….sqlite.gz.age > aspire.sqlite.gz`, unzip it (7-Zip), open it with DB Browser for SQLite. This proves recovery even if the server is gone.

### Restoring for real

Only with the owner's decision (it replaces the live data, and everything written since that copy is lost):

```sh
(umask 077; cat > /dev/shm/aspire-backup-key.txt)    # owner pastes the key
/opt/aspire-web/bin/restore.sh apply daily/aspire-2026-10-21.sqlite.gz.age --identity /dev/shm/aspire-backup-key.txt
shred -u /dev/shm/aspire-backup-key.txt
/opt/aspire-web/bin/backup.sh
```

`apply` checks the copy first (as in the test), asks you to type `RESTORE`, stops the app, keeps the current database beside it as `data/aspire.sqlite.before-restore-<time>` (with its `-wal`/`-shm`), puts the restored copy in place with the same owner and mode, starts the app and waits until it is healthy. If it is not healthy, it prints the command that puts the previous database back. Delete the `before-restore` files once all is well (they are not encrypted). On a new server, deploy the release first, then run `apply` (or put the decrypted file at `data/aspire.sqlite`, owned by uid 1000, before the first start).

## Disk hygiene

- **Check:** `/opt/aspire-web/bin/disk-check.sh` shows free space on the disks holding `/opt/aspire-web` and Docker's data, `docker system df` and the `aspire-web` images, and exits 1 under 3 GB free (`WARN_GB`). Cron runs it every 6 hours with `--quiet --status`.
- **Images: keep the current release and one rollback, nothing else.** `/opt/aspire-web/bin/prune-images.sh` is a dry run that lists KEEP/REMOVE; `--apply` removes the listed `aspire-web` images with `docker rmi` (never `-f`). It always keeps `aspire-web:$RELEASE`, one rollback image (the newest other one, or `--rollback <tag>`), `KEEP_TAGS` (default `demo`) and any image a container uses. It never touches other sites' images. The owner approves the dry-run list before `--apply`.
- **Build cache:** `docker builder prune -f` after every build (the watchdog does it).
- **Untagged images** (`<none>`, left when the same tag is rebuilt) are not removed by the script, because on this shared server they cannot be told apart from other sites' images; remove them by ID with the owner's OK.

## CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every push and pull request to `main`, `develop` and `feature/**` (docs-only changes are skipped), on Node 24 with the npm cache:

1. `npm ci`, `next typegen` (generates `next-env.d.ts` and the route types), `tsc --noEmit`, `eslint .`, the full `vitest run`;
2. `next build` with `SHOW_PLACEHOLDER_CONTENT=true` and `NEXT_PUBLIC_SITE_URL=https://aspire.thechunkmedia.com` (as the server builds today), with `.next/cache` cached;
3. a check that `.next/prerender-manifest.json` exists, parses, lists prerendered routes and still contains the key pages (`EXPECTED_PRERENDERED` in the workflow: home, about and tools in both languages), so a page that silently turns fully dynamic fails CI. The manifest is kept as a run artifact for 14 days.

No secrets are needed: the build never reads `ANTHROPIC_API_KEY` or the server's `.env`. A run takes roughly 8–12 minutes of the private repo's Actions minutes. A second job, **Docker image builds (no push)**, runs only when started by hand (Actions → CI → Run workflow → tick "Also build the production Docker image"); it proves the `Dockerfile` builds and pushes nothing.

### Later: build the image in CI and pull it on the VPS (design note, not set up)

Today every release is built on the server, which needs about 2.6 GB of free disk at the peak and the shared single CPU for several minutes. Instead:

1. A workflow (on a `release-*` tag, or by hand) builds the image for `linux/amd64` with the **same build args the server uses** (`NEXT_PUBLIC_SITE_URL`, and `SHOW_PLACEHOLDER_CONTENT` — these are baked into the static pages, so demo and production are different images; keep the `-demo` tag suffix) and pushes `ghcr.io/cldxciv/aspire-web:<commit>[-demo]` to GitHub's container registry using the workflow's own `GITHUB_TOKEN` (`permissions: packages: write`). No new secret in GitHub.
2. The package stays private. The VPS logs in once: `docker login ghcr.io -u <github user>` with a token that has only `read:packages`; it is stored in `/root/.docker/config.json` on the server (never in the repo).
3. `docker-compose.yml` uses `image: ghcr.io/cldxciv/aspire-web:${RELEASE}` (keeping `build:` as a fallback), and a release becomes `sed RELEASE` → `docker compose pull` → `docker compose up -d`. No `release/` source upload, no build cache and no 2.6 GB peak: the server only stores the new image layers (about 1.1 GB), and `prune-images.sh` still keeps two images (its `IMAGE_REPO` setting would become `ghcr.io/cldxciv/aspire-web`).
4. Result cards, `.env` and `data/` stay on the server exactly as now; the image contains no secrets.

A registry-free alternative is to upload `docker save | gzip` as a run artifact and `docker load` it on the server, but that also needs a token on the server and is clumsier than a registry pull.
