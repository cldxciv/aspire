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
| `/opt/aspire-web/data/qb-figures/` | Question-bank figures (image files, owned by uid 1000). Not in the database backup; optional `FIGURE_SYNC=1` copies them off-server (see [Question bank](#question-bank-exam-pattern-mock-tests)) |
| `/opt/aspire-web/data/qb-imports/` | Question-bank uploads waiting to be imported (owned by uid 1000). Temporary: deleted when the import is closed, or 14 days after the last activity on it (the import is then closed automatically); never backed up |
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

## Question bank (exam-pattern mock tests)

Being built (22 Oct 2026). Operator guide: `docs/question-bank.md`; decisions D-050 – D-058; owner questions: checklist §18 (QB-1 – QB-17). Before deploying the release that contains it, the owner (or a deploy agent approved for these steps):

1. **Settings** in `/opt/aspire-web/.env` (read at run time; apply with `docker compose up -d`, no rebuild):
   ```sh
   QB_IMPORT_ENABLED=0     # AI imports (PDF / Word) hard off until the owner approves AI import (checklist QB-7); CSV / XLSX template imports still work. Later remove the line, then switch "Import enabled" on in the admin panel
   # optional, defaults shown: QB_IMPORT_DAILY_USD=10  QB_IMPORT_MODEL=claude-opus-5-5  QB_IMPORT_MAX_FILE_MB=9  QB_FIGURE_QUOTA_MB=150  QB_PAPER_GUEST_RETENTION_DAYS=14
   # keep QB_IMPORT_DIR / QB_FIGURE_DIR unset: they default to /data/qb-imports and /data/qb-figures (beside AUTH_DB_PATH)
   ```
   AI import also needs `ANTHROPIC_API_KEY` (the same key Rancho uses). `QB_GENERATION_ENABLED=0` stops new exam-pattern papers without a rollback. Full list: `.env.example`.
2. **Data folders**, owned by the container's user, created before the first start of the release so they never end up owned by root:
   ```sh
   install -d -o 1000 -g 1000 -m 750 /opt/aspire-web/data/qb-imports /opt/aspire-web/data/qb-figures
   ```
3. **nginx upload limit, for the import upload route only** (this site's server block; other sites are untouched). nginx refuses request bodies over 1 MB by default, which blocks most question-paper PDFs; the app itself caps uploads at 9 MB (Next.js buffers at most 10 MB of a body). Only `/api/admin/qb/imports` needs more: figure uploads are 200 KB at most and every other route stays under the current limit. Raising the limit for the whole site would let every public route receive bodies of up to 10 MB, which the app's request proxy may buffer, in a container capped at `mem_limit: 768m` on a shared server; so scope it to this one location. Check first: `grep -n -e client_max_body_size -e 'location' /etc/nginx/sites-available/aspire.thechunkmedia.com`. Then add, inside the `server { … }` block, a location that copies the proxy lines of the existing `location / { … }` block (its `proxy_pass http://127.0.0.1:3011;` and any `proxy_set_header`, `proxy_hide_header` or buffering lines) and adds the limit:
   ```nginx
   location ^~ /api/admin/qb/imports {
       client_max_body_size 10m;
       # copy the proxy_pass / proxy_set_header / proxy_hide_header lines of `location /` here unchanged
       proxy_pass http://127.0.0.1:3011;
   }
   ```
   `nginx -t && systemctl reload nginx`. Leave any existing site-wide value as it is (an earlier note suggested `6m` for Rancho photo questions on `/api/ask`; that, too, is better set in its own location). After the reload, a PDF of a few MB must upload from the admin panel, and a large body sent to any other route must still get 413.
4. **After the deploy, by hand:**
   - open an import's source PDF from the admin panel in Chrome: it must display inline (the route deliberately sends no sandbox CSP, because Chrome's PDF viewer refuses sandboxed documents);
   - check the app log after the first start for the question bank's search-mode line: SQLite full-text search (FTS5) or the slower fallback (`docker compose logs app`). node:sqlite bundles its own SQLite, so this is a check of the Docker image.
5. **Disk and backups** (owner decision, checklist QB-11). Free space today is about 2 GB. A full ten-year bank adds about 120–150 MB of database and 100–200 MB of figures, and each nightly backup grows by about 35 MB, multiplied by the number of local copies (about 26 today). Options in `/opt/aspire-web/backup.env` (nothing changes unless they are set; the values below are examples, the owner chooses):
   ```sh
   # keep fewer copies on this server; the remote keeps KEEP_DAILY / KEEP_WEEKLY / KEEP_MANUAL (14 / 8 / 6)
   KEEP_LOCAL_DAILY=3
   KEEP_LOCAL_WEEKLY=2
   KEEP_LOCAL_MANUAL=3
   # after each backup, also copy the figures folder to $RCLONE_REMOTE/qb-figures (incremental; never deletes on the remote)
   FIGURE_SYNC=1
   # FIGURE_DIR=/opt/aspire-web/data/qb-figures    (default: $DATA_DIR/qb-figures, the host side of the app's QB_FIGURE_DIR)
   ```
   Then `/opt/aspire-web/bin/backup.sh --check` (whole numbers ≥ 1; `FIGURE_SYNC` 0 or 1) and reinstall the script from the release (`install -m 750 /opt/aspire-web/release/deploy/backup.sh /opt/aspire-web/bin/`). A weekly copy is a hard link to a daily copy, so it keeps its data when that daily copy is pruned. When set, `backup-status.json` also carries `localRetention` and `figureSync` (`ok`, `no_folder` or `failed`). A failed figure copy marks the run `failed`, but the database copy is already off-server by then and `lastSuccessAt` is updated. The figure copies are **not encrypted**: they are question-paper images with no personal data.
   - **Restoring figures:** `restore.sh` restores only the database. Bring the figures back with `rclone copy gdrive:aspire-backups/qb-figures /opt/aspire-web/data/qb-figures && chown -R 1000:1000 /opt/aspire-web/data/qb-figures` (use your `RCLONE_REMOTE`). Without `FIGURE_SYNC=1` the figures have no off-server copy.
6. **Rollback:** the question-bank tables are additive (`CREATE TABLE IF NOT EXISTS`), so an earlier image simply leaves them unused. To stop the feature without a rollback: `QB_GENERATION_ENABLED=0` (no new papers) and `QB_IMPORT_ENABLED=0` (no AI imports; CSV / XLSX template imports are not affected by it).

## Page layout (section order on the public pages)

Admin console → Website & content → Page layout (D-084). The tables `page_layout_state` and `page_layout_history` are created on first open; nothing to migrate.

- **After a release:** the first visit to each of the 10 pages may still show the original order once; from then on the published layout shows.
- **Optional warm-up** (removes even that):
  ```sh
  for p in / /about /admissions /programs /results /centres /hostels /resources /contact /tools; do curl -s -o /dev/null https://aspire.thechunkmedia.com$p; curl -s -o /dev/null https://aspire.thechunkmedia.com/hi${p%/}; done
  ```
- **Super admin check:** only an effective super admin can change layouts. Open Users and confirm at least one exists. If there is none (more than one admin and no grants): `cd /opt/aspire-web && docker compose exec app npm run auth:super-admin -- grant <login id>`.
- **Build vs runtime:** the 10 pages are prerendered and then regenerated on the server, so `SHOW_PLACEHOLDER_CONTENT` and `ENQUIRY_STORE` must have the same values at build and at run time.
- **Rollback:** "Reset to the original order" per page, or roll back the release (the tables are then simply unused).

## Integrations key, Meta Lead Ads and the optional sync cron

Lead routing (docs/lead-routing-plan.md §18–§19, D-047). The CRM connects to Meta **directly** (no Zapier, Make or similar). Meta credentials are sealed in the database with a key that lives only in `.env`.

1. **Set the key BEFORE deploying the release that contains lead routing** (CSV import and Meta show "Server key not set" without it, and an erase then writes no suppression):
   ```sh
   # in /opt/aspire-web/.env (root-only, like every secret); never print it, never put it in a backup
   INTEGRATIONS_SECRET=<openssl rand -base64 48>      # opaque, at least 43 characters
   ```
   Keep a copy in the password manager next to the backup key: a restore on a new server needs the **same** key, or the Meta App Secret and token must be entered again (and erase suppressions no longer match). `deploy/backup.sh` uploads only the encrypted database, never `.env`; keep it that way.
2. **Key rotation** (only if the key leaked or on a schedule): move the old value to `INTEGRATIONS_SECRET_PREVIOUS=<old>`, set a new `INTEGRATIONS_SECRET`, `docker compose up -d`. Then a super admin opens *CRM → Settings → Integrations → Meta Lead Ads* and clicks **Re-encrypt with the new key** (the `reseal` action), which re-seals the Meta secrets. Keep `INTEGRATIONS_SECRET_PREVIOUS` set afterwards: CSV import refs and erase suppressions are keyed hashes that are not re-keyed, so without the old key an old sheet could bring back a family erased before the rotation.
3. **Meta webhook:** nothing to do on the server. Meta calls `https://aspire.thechunkmedia.com/api/integrations/meta/webhook` (public, verified by the app-secret signature; exempt from the preview password). The owner's guide is Part 2 of the plan and the checklist on the Integrations page. No nginx change: deliveries are well under the 1 MB default.
4. **Optional loopback cron** (processes waiting Meta leads every 10 minutes even when nobody has the CRM open; install only with the owner's approval, like the other jobs):
   ```sh
   # in .env (at least 32 characters), then docker compose up -d
   INTEGRATIONS_CRON_TOKEN=<openssl rand -hex 32>
   # header file read by cron's curl (mode 600, root only)
   umask 077 && printf 'Authorization: Bearer %s\n' "$(grep '^INTEGRATIONS_CRON_TOKEN=' /opt/aspire-web/.env | cut -d= -f2-)" > /opt/aspire-web/meta-sync.header && chmod 600 /opt/aspire-web/meta-sync.header
   install -m 644 /opt/aspire-web/release/deploy/aspire-web.cron /etc/cron.d/aspire-web
   ```
   The cron line does nothing while the header file is missing or empty. The endpoint answers 404 without the token, refuses anything that came through nginx (an `X-Real-IP` header, or an `X-Forwarded-For` that is not one private or loopback address: Next adds the Docker bridge address itself for a direct call, nginx appends the visitor's public address) or with a non-loopback `Host`, and needs the bearer token. Check: `curl -fsS -m 60 -X POST -H @/opt/aspire-web/meta-sync.header http://127.0.0.1:3011/api/integrations/meta/sync` prints `{"ok":true,…}`. Failed runs are logged to `/var/log/aspire-web-meta-sync.log` (curl's error line only; rotated by `aspire-web.logrotate`). Without the cron, open CRM tabs and the Integrations page still process waiting leads (once a minute at most).
5. **Rollback:** the Meta tables are additive; an earlier image leaves them unused. To stop Meta without a rollback, a super admin switches the integration off on the Integrations page (new ids are then held, not fetched).

### Lead routing release (super admin, areas, 1-hour rule)

- **Before deploying:** `INTEGRATIONS_SECRET` in `.env` (step 1 above). The new tables (`superadmin`, then `crm_intake`) are created automatically at start; they are additive (`crm_leads` is not altered), so a rollback to the previous image simply leaves them unused.
- **Right after deploying:**
  ```sh
  cd /opt/aspire-web && docker compose exec app npm run auth:super-admin -- list
  ```
  With exactly one enabled admin, that admin becomes super admin automatically (the command says so). Otherwise grant one: `docker compose exec app npm run auth:super-admin -- grant <login id>` (an enabled admin account). Until a super admin exists nobody can create or change **staff** logins, areas, calling hours or the import.
- **What changes for staff at once:** routing runs in **areas** mode. Until the super admin adds people to areas (CRM → Settings → Areas & people → "Set up from centre"), new leads still go to counsellors by the old rules, except **free-tool sign-ups with no district, which now wait in "Tool sign-ups"** instead of being auto-assigned (an SA or admin assigns them; or switch CRM → Settings → Areas & people → "How enquiries are routed" to the old rules). New leads from deploy on get a 1-working-hour first-call clock; older leads are not back-filled. Staff now land on Today's calls.
- **No nginx change.** The cron line for the Meta sync is inert until its header file exists (step 4).

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
4. **Retention:** newest 14 daily, 8 weekly, 6 manual copies, locally and on the remote (other files in those folders are never touched). On Google Drive, deleted copies sit in the Drive trash for 30 days first. Optional `KEEP_LOCAL_DAILY` / `KEEP_LOCAL_WEEKLY` / `KEEP_LOCAL_MANUAL` keep a different number on this server only ([Question bank](#question-bank-exam-pattern-mock-tests), step 5).
   - **Optional figure copy** (`FIGURE_SYNC=1`): after retention, the question-bank figures folder is copied to `$RCLONE_REMOTE/qb-figures` (incremental, unencrypted image files, never deletes on the remote).
5. **Status:** writes `data/ops/backup-status.json` (`result`, `lastRunAt`, `lastSuccessAt`, `file`, `sizeBytes`, `sha256`, `dbTables`, `dbUserVersion`, copy counts, `error`; plus `localRetention` and `figureSync` only when those options are set) and `data/ops/backup-last-success` (time of the last verified off-server copy). The admin console's Site status page reads `/data/ops/backup-status.json` and should warn when `result` is `failed` or `lastSuccessAt` is older than 26 hours.

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
   # Optional (question bank): KEEP_LOCAL_DAILY / KEEP_LOCAL_WEEKLY / KEEP_LOCAL_MANUAL (default: the KEEP_* value)
   #   and FIGURE_SYNC=1 (FIGURE_DIR default /opt/aspire-web/data/qb-figures); see "Question bank" above
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
