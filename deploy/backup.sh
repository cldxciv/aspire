#!/usr/bin/env bash
# Aspire website: encrypted off-server backup of the SQLite database (deploy/README.md → Backups).
#
#   backup.sh                      nightly run (cron): daily copy, plus the weekly copy for this ISO week
#   backup.sh --label pre-<commit> one-off copy kept under manual/ (e.g. before a release)
#   backup.sh --check              check the settings, tools, key and remote; back nothing up
#   backup.sh --help
#
# What a run does:
#   1. `VACUUM INTO` a snapshot inside the running app container (node:sqlite). A plain copy of a
#      WAL database is not safe. The snapshot passes `PRAGMA integrity_check` before it is used.
#   2. gzip + encrypt it (age to a public key by default; openssl AES-256 as a fallback).
#      The plain snapshot is deleted straight away, on success or failure.
#   3. Upload it with rclone to $RCLONE_REMOTE (daily/, weekly/, manual/) and check the size there.
#   4. Keep the newest 14 daily, 8 weekly and 6 manual copies, locally and on the remote.
#   5. Write data/ops/backup-status.json (the admin console reads /data/ops/backup-status.json).
# Any failure: a clear log line, result "failed" in the status file, exit code non-zero.
#
# Settings come from the environment or from $BACKUP_CONFIG (default /opt/aspire-web/backup.env,
# root-only). Nothing secret lives in the repo: with age the server only holds the PUBLIC key.
set -Eeuo pipefail
umask 077
export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

MODE=nightly
LABEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="${2-}"; MODE=manual; shift 2 || { echo "--label needs a value" >&2; exit 64; } ;;
    --check) MODE=check; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done
if [ "$MODE" = manual ] && ! printf '%s' "$LABEL" | grep -Eq '^[A-Za-z0-9._-]{1,40}$'; then
  echo "--label: 1-40 characters from A-Z a-z 0-9 . _ -" >&2
  exit 64
fi

# ---- settings ---------------------------------------------------------------------------------
BACKUP_CONFIG="${BACKUP_CONFIG:-/opt/aspire-web/backup.env}"
if [ -f "$BACKUP_CONFIG" ]; then
  # shellcheck source=/dev/null
  . "$BACKUP_CONFIG"
fi
APP_DIR="${APP_DIR:-/opt/aspire-web}"                    # docker-compose.yml + .env live here
APP_SERVICE="${APP_SERVICE:-app}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"                     # mounted at $CONTAINER_DATA_DIR
CONTAINER_DATA_DIR="${CONTAINER_DATA_DIR:-/data}"
DB_NAME="${DB_NAME:-aspire.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups/encrypted}"   # local copies (same disk: short-term only)
OPS_DIR="${OPS_DIR:-$DATA_DIR/ops}"                      # status files the app can read
RCLONE_REMOTE="${RCLONE_REMOTE:-}"                       # e.g. gdrive:aspire-backups (required)
ENCRYPTION="${ENCRYPTION:-age}"                          # age | openssl
AGE_RECIPIENTS_FILE="${AGE_RECIPIENTS_FILE:-$APP_DIR/backup-recipients.txt}"
OPENSSL_KEY_FILE="${OPENSSL_KEY_FILE:-$APP_DIR/backup.key}"
OPENSSL_ITER=600000                                      # restore.sh must use the same value
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MANUAL="${KEEP_MANUAL:-6}"
MIN_FREE_MB="${MIN_FREE_MB:-300}"                        # never fill the shared disk below this
LOCK_FILE="${LOCK_FILE:-/run/lock/aspire-web-backup.lock}"

DAILY_RE='^aspire-[0-9]{4}-[0-9]{2}-[0-9]{2}\.sqlite\.gz\.(age|enc)$'
WEEKLY_RE='^aspire-[0-9]{4}-W[0-9]{2}\.sqlite\.gz\.(age|enc)$'
MANUAL_RE='^aspire-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+\.sqlite\.gz\.(age|enc)$'

# ---- helpers ----------------------------------------------------------------------------------
STARTED=$(date -u +%s)
STEP="start"
ERROR=""
STATUS_ENABLED=0
SNAP_HOST=""
PART=""
FILE_NAME=""
SIZE_BYTES=""
SHA256=""
DB_TABLES=""
DB_VERSION=""
COUNTS=""

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s [aspire-backup] %s\n' "$(now)" "$*"; }
fail() { ERROR="$*"; log "ERROR: $*" >&2; exit 1; }
step() { STEP="$*"; log "$*"; }

# JSON string (or null when empty): control characters dropped, \ and " escaped.
json_str() {
  if [ -z "${1-}" ]; then printf 'null'; return; fi
  printf '"%s"' "$(printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')"
}
json_num() { if [ -n "${1-}" ]; then printf '%s' "$1"; else printf 'null'; fi; }

write_status() { # result: ok | failed
  local result="$1" last_success="" tmp
  [ -f "$OPS_DIR/backup-last-success" ] && last_success=$(head -n 1 "$OPS_DIR/backup-last-success")
  tmp="$OPS_DIR/.backup-status.json.tmp"
  {
    printf '{\n'
    printf '  "schema": 1,\n'
    printf '  "result": %s,\n' "$(json_str "$result")"
    printf '  "kind": %s,\n' "$(json_str "$MODE")"
    printf '  "lastRunAt": %s,\n' "$(json_str "$(now)")"
    printf '  "lastSuccessAt": %s,\n' "$(json_str "$last_success")"
    printf '  "durationSeconds": %s,\n' "$(( $(date -u +%s) - STARTED ))"
    printf '  "file": %s,\n' "$(json_str "$FILE_NAME")"
    printf '  "sizeBytes": %s,\n' "$(json_num "$SIZE_BYTES")"
    printf '  "sha256": %s,\n' "$(json_str "$SHA256")"
    printf '  "dbTables": %s,\n' "$(json_num "$DB_TABLES")"
    printf '  "dbUserVersion": %s,\n' "$(json_num "$DB_VERSION")"
    printf '  "encryption": %s,\n' "$(json_str "$ENCRYPTION")"
    printf '  "remote": %s,\n' "$(json_str "$RCLONE_REMOTE")"
    printf '  "retention": { "daily": %s, "weekly": %s, "manual": %s },\n' "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MANUAL"
    printf '  "copies": %s,\n' "${COUNTS:-null}"
    printf '  "error": %s\n' "$(json_str "$ERROR")"
    printf '}\n'
  } > "$tmp"
  chmod 644 "$tmp"
  mv -f "$tmp" "$OPS_DIR/backup-status.json"
}

on_exit() {
  local rc=$?
  trap - EXIT
  # Never leave a plain (unencrypted) snapshot or a half-written file behind.
  [ -n "$SNAP_HOST" ] && rm -f "$SNAP_HOST" "$SNAP_HOST-journal" "$SNAP_HOST-wal" "$SNAP_HOST-shm"
  [ -n "$PART" ] && rm -f "$PART"
  if [ "$rc" -ne 0 ]; then
    [ -n "$ERROR" ] || ERROR="step \"$STEP\" failed (exit $rc)"
    log "FAILED: $ERROR" >&2
    if [ "$STATUS_ENABLED" = 1 ]; then write_status failed || log "could not write the status file" >&2; fi
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'ERROR="interrupted"; exit 130' INT TERM

compose() { (cd "$APP_DIR" && docker compose "$@"); }

app_running() { [ -n "$(compose ps --status running -q "$APP_SERVICE" 2>/dev/null)" ]; }

# Run a command in the running app container (same /data volume, user `node`).
# Usage: in_app VAR=value ... -- command args. No `docker compose run` fallback on purpose: with a
# missing image it would start a 2.6 GB build on the shared disk.
in_app() {
  local envs=()
  while [ "$1" != "--" ]; do envs+=(-e "$1"); shift; done
  shift
  app_running || fail "the app container is not running (cd $APP_DIR && docker compose up -d), then run this again"
  compose exec -T "${envs[@]}" "$APP_SERVICE" "$@"
}

encrypt() { # stdin → stdout
  case "$ENCRYPTION" in
    age) age -R "$AGE_RECIPIENTS_FILE" ;;
    openssl) openssl enc -aes-256-cbc -salt -pbkdf2 -iter "$OPENSSL_ITER" -pass "file:$OPENSSL_KEY_FILE" ;;
  esac
}

# Names (one per line) of the files in a local or remote folder that match a pattern, oldest first.
list_local() { [ -d "$1" ] || return 0; find "$1" -maxdepth 1 -type f -printf '%f\n' | grep -E "$2" | sort || true; }
list_remote() { rclone lsf --files-only "$1/" 2>/dev/null | grep -E "$2" | sort || true; }
# All but the newest $1 lines of stdin.
all_but_newest() { awk -v keep="$1" '{ line[NR] = $0 } END { for (i = 1; i <= NR - keep; i++) print line[i] }'; }

prune() { # folder (daily|weekly|manual), pattern, keep
  local sub="$1" re="$2" keep="$3" name
  for name in $(list_local "$BACKUP_DIR/$sub" "$re" | all_but_newest "$keep"); do
    log "retention: delete local $sub/$name"
    rm -f "$BACKUP_DIR/$sub/$name"
  done
  for name in $(list_remote "$RCLONE_REMOTE/$sub" "$re" | all_but_newest "$keep"); do
    log "retention: delete remote $sub/$name"
    rclone deletefile "$RCLONE_REMOTE/$sub/$name"
  done
}

upload() { # local file, remote folder (daily|weekly|manual)
  local file="$1" sub="$2" name remote_size local_size
  name=$(basename "$file")
  rclone copyto --retries 3 --low-level-retries 10 -q "$file" "$RCLONE_REMOTE/$sub/$name" \
    || fail "rclone could not upload $sub/$name to $RCLONE_REMOTE (network, quota or an expired token: rclone config reconnect)"
  remote_size=$(rclone lsf --format s "$RCLONE_REMOTE/$sub/$name" 2>/dev/null || true)
  local_size=$(stat -c %s "$file")
  [ "$remote_size" = "$local_size" ] || fail "upload check failed for $sub/$name (local $local_size bytes, remote '${remote_size:-missing}')"
  log "uploaded $sub/$name ($local_size bytes)"
}

# Snapshot + check inside the container (runs as the image's `node` user). Prints one JSON line.
# shellcheck disable=SC2016  # JavaScript, not shell: nothing to expand
SNAPSHOT_JS='
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const src = process.env.ASPIRE_DB;
const out = process.env.ASPIRE_SNAPSHOT;
try {
  if (!fs.existsSync(src)) throw new Error(`database not found: ${src}`);
  fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
  fs.rmSync(out, { force: true });
  const db = new DatabaseSync(src);
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    db.prepare("VACUUM INTO ?").run(out);
  } finally {
    db.close();
  }
  fs.chmodSync(out, 0o600);
  const copy = new DatabaseSync(out);
  try {
    const problems = copy.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]);
    if (problems.length !== 1 || problems[0] !== "ok") throw new Error(`integrity_check: ${problems.slice(0, 5).join("; ")}`);
    const tables = copy.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type = ?").get("table").n;
    const userVersion = copy.prepare("PRAGMA user_version").get().user_version;
    console.log(JSON.stringify({ tables, userVersion }));
  } finally {
    copy.close();
  }
} catch (error) {
  console.error(`snapshot failed: ${error.message}`);
  process.exitCode = 1;
}
'

# ---- run ----------------------------------------------------------------------------------------
case "$ENCRYPTION" in
  age) EXT=age ;;
  openssl) EXT=enc ;;
  *) fail "ENCRYPTION must be age or openssl (got '$ENCRYPTION')" ;;
esac

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9> "$LOCK_FILE"
flock -n 9 || { ERROR="another backup is still running; nothing done"; exit 75; }

[ -d "$DATA_DIR" ] || fail "DATA_DIR $DATA_DIR does not exist"
mkdir -p "$OPS_DIR"
chmod 755 "$OPS_DIR"
[ "$MODE" = check ] || STATUS_ENABLED=1

step "checking settings and tools"
for tool in docker rclone gzip sha256sum flock awk; do
  command -v "$tool" > /dev/null || fail "missing tool: $tool"
done
command -v "$ENCRYPTION" > /dev/null || fail "missing tool: $ENCRYPTION (apt install $ENCRYPTION)"
[ -n "$RCLONE_REMOTE" ] || fail "RCLONE_REMOTE is not set (e.g. gdrive:aspire-backups in $BACKUP_CONFIG)"
case "$RCLONE_REMOTE" in *:*) ;; *) fail "RCLONE_REMOTE must be an rclone remote such as gdrive:aspire-backups (got '$RCLONE_REMOTE')" ;; esac
for n in "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MANUAL" "$MIN_FREE_MB"; do
  case "$n" in ''|*[!0-9]*) fail "KEEP_* and MIN_FREE_MB must be whole numbers" ;; esac
done
if [ "$KEEP_DAILY" -lt 1 ] || [ "$KEEP_WEEKLY" -lt 1 ] || [ "$KEEP_MANUAL" -lt 1 ]; then
  fail "KEEP_* must be at least 1"
fi
if [ "$ENCRYPTION" = age ]; then
  [ -s "$AGE_RECIPIENTS_FILE" ] || fail "age public key file $AGE_RECIPIENTS_FILE is missing or empty"
  grep -Eq '^age1[0-9a-z]+$' "$AGE_RECIPIENTS_FILE" || fail "$AGE_RECIPIENTS_FILE must hold age public keys (age1...), one per line"
  if grep -q 'AGE-SECRET-KEY' "$AGE_RECIPIENTS_FILE"; then
    fail "$AGE_RECIPIENTS_FILE contains a SECRET key: only the public key (age1...) belongs on the server"
  fi
else
  [ -s "$OPENSSL_KEY_FILE" ] || fail "openssl key file $OPENSSL_KEY_FILE is missing or empty"
  [ "$(stat -c %a "$OPENSSL_KEY_FILE")" = 600 ] || fail "$OPENSSL_KEY_FILE must be mode 600 (chmod 600 $OPENSSL_KEY_FILE)"
fi
[ -f "$APP_DIR/docker-compose.yml" ] || fail "no docker-compose.yml in $APP_DIR"
DB_HOST="$DATA_DIR/$DB_NAME"
[ -f "$DB_HOST" ] || fail "database $DB_HOST not found"

if [ "$MODE" = check ]; then
  step "checking the remote $RCLONE_REMOTE"
  rclone mkdir "$RCLONE_REMOTE" || fail "rclone cannot reach $RCLONE_REMOTE (run: rclone config)"
  rclone lsf --dirs-only "$RCLONE_REMOTE/" > /dev/null || fail "rclone cannot list $RCLONE_REMOTE"
  printf 'aspire backup check %s\n' "$(now)" | encrypt > /dev/null || fail "$ENCRYPTION could not encrypt with the configured key"
  app_running || fail "the app container is not running: backups need it (docker compose up -d)"
  log "OK: settings, tools, key, remote and app container are ready"
  exit 0
fi

step "checking free disk space"
db_bytes=$(stat -c %s "$DB_HOST")
[ -f "$DB_HOST-wal" ] && db_bytes=$(( db_bytes + $(stat -c %s "$DB_HOST-wal") ))
need_kb=$(( db_bytes * 2 / 1024 + MIN_FREE_MB * 1024 ))
for dir in "$DATA_DIR" "$(dirname "$BACKUP_DIR")"; do
  [ -d "$dir" ] || continue
  free_kb=$(df -Pk "$dir" | awk 'NR == 2 { print $4 }')
  [ "$free_kb" -ge "$need_kb" ] || fail "not enough free disk on $dir: $(( free_kb / 1024 )) MB free, need $(( need_kb / 1024 )) MB (database $(( db_bytes / 1024 / 1024 )) MB + ${MIN_FREE_MB} MB reserve)"
done

DAY=$(date -u +%Y-%m-%d)
WEEK=$(date -u +%G-W%V)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
if [ "$MODE" = manual ]; then
  SUB=manual
  FILE_NAME="aspire-$STAMP-$LABEL.sqlite.gz.$EXT"
else
  SUB=daily
  FILE_NAME="aspire-$DAY.sqlite.gz.$EXT"
fi
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/manual"
chmod 700 "$BACKUP_DIR" "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/manual"

# Leftovers of an interrupted run (plain database copies): this run holds the lock, so none is in use.
if [ -d "$DATA_DIR/.backup-tmp" ]; then
  find "$DATA_DIR/.backup-tmp" -maxdepth 1 -type f -name 'aspire-*' -delete
fi

step "snapshot (VACUUM INTO) inside the app container"
app_running || fail "the app container is not running (cd $APP_DIR && docker compose up -d), then run this again"
SNAP_HOST="$DATA_DIR/.backup-tmp/aspire-$STAMP.sqlite"
summary=$(in_app "ASPIRE_DB=$CONTAINER_DATA_DIR/$DB_NAME" "ASPIRE_SNAPSHOT=$CONTAINER_DATA_DIR/.backup-tmp/aspire-$STAMP.sqlite" -- node -e "$SNAPSHOT_JS") \
  || fail "the snapshot failed inside the container (see the lines above)"
[ -s "$SNAP_HOST" ] || fail "the snapshot $SNAP_HOST was not created"
DB_TABLES=$(printf '%s' "$summary" | sed -n 's/.*"tables":\([0-9]*\).*/\1/p')
DB_VERSION=$(printf '%s' "$summary" | sed -n 's/.*"userVersion":\([0-9]*\).*/\1/p')
log "snapshot OK: $(stat -c %s "$SNAP_HOST") bytes, ${DB_TABLES:-?} tables, user_version ${DB_VERSION:-?}, integrity_check ok"

step "compress and encrypt ($ENCRYPTION)"
OUT="$BACKUP_DIR/$SUB/$FILE_NAME"
PART="$OUT.part"
gzip -c -9 "$SNAP_HOST" | encrypt > "$PART"
rm -f "$SNAP_HOST"
SNAP_HOST=""
[ -s "$PART" ] || fail "the encrypted file is empty"
mv -f "$PART" "$OUT"
PART=""
SIZE_BYTES=$(stat -c %s "$OUT")
SHA256=$(sha256sum "$OUT" | awk '{ print $1 }')
log "wrote $SUB/$FILE_NAME ($SIZE_BYTES bytes, sha256 $SHA256)"

WEEKLY_OUT=""
if [ "$MODE" = nightly ]; then
  WEEKLY_OUT="$BACKUP_DIR/weekly/aspire-$WEEK.sqlite.gz.$EXT"
  if [ ! -e "$WEEKLY_OUT" ]; then
    # First backup of this ISO week becomes the weekly copy (a hard link: no extra disk).
    ln "$OUT" "$WEEKLY_OUT" 2> /dev/null || cp -p "$OUT" "$WEEKLY_OUT"
    log "weekly copy: weekly/$(basename "$WEEKLY_OUT")"
  fi
fi

step "upload to $RCLONE_REMOTE"
upload "$OUT" "$SUB"
# Re-sent every night until it is there; rclone skips it when the remote copy is identical.
if [ -n "$WEEKLY_OUT" ]; then upload "$WEEKLY_OUT" weekly; fi
# A verified off-server copy exists from here on, even if the clean-up below fails.
now > "$OPS_DIR/.backup-last-success.tmp"
chmod 644 "$OPS_DIR/.backup-last-success.tmp"
mv -f "$OPS_DIR/.backup-last-success.tmp" "$OPS_DIR/backup-last-success"

step "retention (daily $KEEP_DAILY, weekly $KEEP_WEEKLY, manual $KEEP_MANUAL)"
prune daily "$DAILY_RE" "$KEEP_DAILY"
prune weekly "$WEEKLY_RE" "$KEEP_WEEKLY"
prune manual "$MANUAL_RE" "$KEEP_MANUAL"
count() { wc -l | tr -d ' '; }
COUNTS=$(printf '{ "localDaily": %s, "localWeekly": %s, "localManual": %s, "remoteDaily": %s, "remoteWeekly": %s, "remoteManual": %s }' \
  "$(list_local "$BACKUP_DIR/daily" "$DAILY_RE" | count)" \
  "$(list_local "$BACKUP_DIR/weekly" "$WEEKLY_RE" | count)" \
  "$(list_local "$BACKUP_DIR/manual" "$MANUAL_RE" | count)" \
  "$(list_remote "$RCLONE_REMOTE/daily" "$DAILY_RE" | count)" \
  "$(list_remote "$RCLONE_REMOTE/weekly" "$WEEKLY_RE" | count)" \
  "$(list_remote "$RCLONE_REMOTE/manual" "$MANUAL_RE" | count)")

write_status ok
log "done in $(( $(date -u +%s) - STARTED ))s: $SUB/$FILE_NAME → $RCLONE_REMOTE; copies $COUNTS"
