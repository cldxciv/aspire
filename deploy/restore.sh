#!/usr/bin/env bash
# Aspire website: restore test and restore of the encrypted database backups made by backup.sh
# (deploy/README.md → Backups).
#
#   restore.sh list                     list the copies on the remote and on this server
#   restore.sh test  [SOURCE]           monthly restore test: fetch, decrypt, unzip, integrity_check and
#                                       row counts next to the live database. The live database is untouched.
#   restore.sh apply SOURCE [--yes]     replace the live database with SOURCE (stops the app for a moment;
#                                       the current database is kept beside it, unencrypted, until you delete it)
#
# SOURCE: latest (newest daily copy on the remote; the default for `test`)
#         daily/<file> | weekly/<file> | manual/<file>   a copy on the remote
#         local:daily/<file> (or weekly/, manual/)       a copy in this server's backup folder
#         /path/to/<file>                                any downloaded copy
# Options: --identity FILE   the age SECRET key (default $AGE_IDENTITY_FILE). Keep it out of the server:
#                            paste it into /dev/shm/aspire-backup-key.txt for the test, then delete it.
#          --yes             apply without typing RESTORE
# Settings: the same $BACKUP_CONFIG as backup.sh (default /opt/aspire-web/backup.env).
set -Eeuo pipefail
umask 077
export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; }

ACTION="${1-}"
[ $# -gt 0 ] && shift
SOURCE=""
YES=0
IDENTITY_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --identity) IDENTITY_ARG="${2-}"; shift 2 || { echo "--identity needs a file" >&2; exit 64; } ;;
    --yes) YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
    *) [ -z "$SOURCE" ] || { echo "Only one SOURCE, please" >&2; exit 64; }; SOURCE="$1"; shift ;;
  esac
done
case "$ACTION" in
  list|test|apply) ;;
  -h|--help|"") usage; exit 0 ;;
  *) echo "Unknown action: $ACTION (list, test or apply)" >&2; exit 64 ;;
esac

BACKUP_CONFIG="${BACKUP_CONFIG:-/opt/aspire-web/backup.env}"
if [ -f "$BACKUP_CONFIG" ]; then
  # shellcheck source=/dev/null
  . "$BACKUP_CONFIG"
fi
APP_DIR="${APP_DIR:-/opt/aspire-web}"
APP_SERVICE="${APP_SERVICE:-app}"
DATA_DIR="${DATA_DIR:-$APP_DIR/data}"
CONTAINER_DATA_DIR="${CONTAINER_DATA_DIR:-/data}"
DB_NAME="${DB_NAME:-aspire.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups/encrypted}"
OPS_DIR="${OPS_DIR:-$DATA_DIR/ops}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
OPENSSL_KEY_FILE="${OPENSSL_KEY_FILE:-$APP_DIR/backup.key}"
OPENSSL_ITER=600000                                   # same value as backup.sh
AGE_IDENTITY_FILE="${IDENTITY_ARG:-${AGE_IDENTITY_FILE:-}}"
MIN_FREE_MB="${MIN_FREE_MB:-300}"
LOCK_FILE="${LOCK_FILE:-/run/lock/aspire-web-backup.lock}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-120}"

DAILY_RE='^aspire-[0-9]{4}-[0-9]{2}-[0-9]{2}\.sqlite\.gz\.(age|enc)$'
WEEKLY_RE='^aspire-[0-9]{4}-W[0-9]{2}\.sqlite\.gz\.(age|enc)$'
MANUAL_RE='^aspire-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+\.sqlite\.gz\.(age|enc)$'

STEP="start"
ERROR=""
WORK=""
STATUS_ENABLED=0
FILE_NAME=""
SIZE_BYTES=""
DB_TABLES=""
DB_VERSION=""
FROM=""

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { printf '%s [aspire-restore] %s\n' "$(now)" "$*"; }
fail() { ERROR="$*"; log "ERROR: $*" >&2; exit 1; }
step() { STEP="$*"; log "$*"; }
json_str() {
  if [ -z "${1-}" ]; then printf 'null'; return; fi
  printf '"%s"' "$(printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')"
}
json_num() { if [ -n "${1-}" ]; then printf '%s' "$1"; else printf 'null'; fi; }

write_test_status() { # result: ok | failed. Read by the admin console as /data/ops/restore-test.json.
  local result="$1" last_success="" tmp="$OPS_DIR/.restore-test.json.tmp"
  [ -f "$OPS_DIR/restore-test-last-success" ] && last_success=$(head -n 1 "$OPS_DIR/restore-test-last-success")
  {
    printf '{\n'
    printf '  "schema": 1,\n'
    printf '  "result": %s,\n' "$(json_str "$result")"
    printf '  "testedAt": %s,\n' "$(json_str "$(now)")"
    printf '  "lastSuccessAt": %s,\n' "$(json_str "$last_success")"
    printf '  "from": %s,\n' "$(json_str "$FROM")"
    printf '  "file": %s,\n' "$(json_str "$FILE_NAME")"
    printf '  "sizeBytes": %s,\n' "$(json_num "$SIZE_BYTES")"
    printf '  "dbTables": %s,\n' "$(json_num "$DB_TABLES")"
    printf '  "dbUserVersion": %s,\n' "$(json_num "$DB_VERSION")"
    printf '  "error": %s\n' "$(json_str "$ERROR")"
    printf '}\n'
  } > "$tmp"
  chmod 644 "$tmp"
  mv -f "$tmp" "$OPS_DIR/restore-test.json"
}

on_exit() {
  local rc=$?
  trap - EXIT
  # The work folder holds the decrypted database: never leave it behind.
  [ -n "$WORK" ] && rm -rf "$WORK"
  if [ "$rc" -ne 0 ]; then
    [ -n "$ERROR" ] || ERROR="step \"$STEP\" failed (exit $rc)"
    log "FAILED: $ERROR" >&2
    if [ "$STATUS_ENABLED" = 1 ]; then write_test_status failed || true; fi
  fi
  if [ -n "$AGE_IDENTITY_FILE" ] && [ -f "$AGE_IDENTITY_FILE" ]; then
    log "reminder: delete the secret key file when you are done: shred -u $AGE_IDENTITY_FILE"
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'ERROR="interrupted"; exit 130' INT TERM

compose() { (cd "$APP_DIR" && docker compose "$@"); }
app_running() { [ -n "$(compose ps --status running -q "$APP_SERVICE" 2>/dev/null)" ]; }
# Run a command in the app container: `exec` while it runs; otherwise a one-off container from the
# release image, but only if that image exists (a missing image would start a 2.6 GB build).
in_app() {
  local envs=() image
  while [ "$1" != "--" ]; do envs+=(-e "$1"); shift; done
  shift
  if app_running; then
    compose exec -T "${envs[@]}" "$APP_SERVICE" "$@"
    return
  fi
  image=$(compose config --images 2>/dev/null | head -n 1)
  if [ -z "$image" ] || ! docker image inspect "$image" > /dev/null 2>&1; then
    echo "the app is not running and its image (${image:-unknown}) is not on this server" >&2
    return 1
  fi
  echo "the app is not running: checking in a one-off container ($image)" >&2
  compose run --rm --no-deps -T "${envs[@]}" "$APP_SERVICE" "$@"
}
list_remote() { rclone lsf --files-only "$1/" 2>/dev/null | grep -E "$2" | sort || true; }

# ---- list -----------------------------------------------------------------------------------------
if [ "$ACTION" = list ]; then
  for sub in daily weekly manual; do
    if [ -n "$RCLONE_REMOTE" ]; then
      echo "== remote $RCLONE_REMOTE/$sub"
      rclone lsl "$RCLONE_REMOTE/$sub/" 2>/dev/null | sort -k4 || echo "   (none)"
    fi
    echo "== local $BACKUP_DIR/$sub"
    ls -l "$BACKUP_DIR/$sub" 2>/dev/null | tail -n +2 || echo "   (none)"
  done
  exit 0
fi

# ---- test / apply ---------------------------------------------------------------------------------
[ "$ACTION" = test ] && SOURCE="${SOURCE:-latest}"
[ -n "$SOURCE" ] || fail "apply needs a SOURCE (e.g. latest, daily/aspire-2026-10-21.sqlite.gz.age); see --help"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9> "$LOCK_FILE"
flock -n 9 || { ERROR="a backup or restore is running; try again in a few minutes"; exit 75; }

[ -d "$DATA_DIR" ] || fail "DATA_DIR $DATA_DIR does not exist"
mkdir -p "$OPS_DIR"
chmod 755 "$OPS_DIR"
[ "$ACTION" = test ] && STATUS_ENABLED=1
LIVE_DB="$DATA_DIR/$DB_NAME"
[ -f "$APP_DIR/docker-compose.yml" ] || fail "no docker-compose.yml in $APP_DIR"
for tool in docker gzip flock awk; do command -v "$tool" > /dev/null || fail "missing tool: $tool"; done

step "finding $SOURCE"
remote_path=""
local_path=""
case "$SOURCE" in
  latest)
    [ -n "$RCLONE_REMOTE" ] || fail "RCLONE_REMOTE is not set"
    FILE_NAME=$(list_remote "$RCLONE_REMOTE/daily" "$DAILY_RE" | tail -n 1)
    [ -n "$FILE_NAME" ] || fail "no daily copy found in $RCLONE_REMOTE/daily"
    remote_path="$RCLONE_REMOTE/daily/$FILE_NAME"
    FROM="remote" ;;
  daily/*|weekly/*|manual/*|local:daily/*|local:weekly/*|local:manual/*)
    rel="${SOURCE#local:}"
    sub="${rel%%/*}"
    FILE_NAME="${rel#*/}"
    case "$sub" in daily) re="$DAILY_RE" ;; weekly) re="$WEEKLY_RE" ;; *) re="$MANUAL_RE" ;; esac
    printf '%s' "$FILE_NAME" | grep -Eq "$re" || fail "'$FILE_NAME' is not a backup file name for $sub/ (see: restore.sh list)"
    if [ "$SOURCE" = "$rel" ]; then
      [ -n "$RCLONE_REMOTE" ] || fail "RCLONE_REMOTE is not set"
      remote_path="$RCLONE_REMOTE/$rel"
      FROM="remote"
    else
      local_path="$BACKUP_DIR/$rel"
      FROM="local"
    fi ;;
  *)
    [ -f "$SOURCE" ] || fail "no such file: $SOURCE"
    local_path="$SOURCE"
    FILE_NAME=$(basename "$SOURCE")
    FROM="file" ;;
esac
case "$FILE_NAME" in
  *.sqlite.gz.age)
    command -v age > /dev/null || fail "missing tool: age (apt install age)"
    [ -n "$AGE_IDENTITY_FILE" ] || fail "age copies need the SECRET key: --identity FILE (e.g. /dev/shm/aspire-backup-key.txt)"
    [ -f "$AGE_IDENTITY_FILE" ] || fail "secret key file not found: $AGE_IDENTITY_FILE"
    grep -q 'AGE-SECRET-KEY-1' "$AGE_IDENTITY_FILE" || fail "$AGE_IDENTITY_FILE holds no AGE-SECRET-KEY-1... line" ;;
  *.sqlite.gz.enc)
    command -v openssl > /dev/null || fail "missing tool: openssl"
    [ -s "$OPENSSL_KEY_FILE" ] || fail "openssl key file not found: $OPENSSL_KEY_FILE" ;;
  *) fail "unknown backup type: $FILE_NAME (expected .sqlite.gz.age or .sqlite.gz.enc)" ;;
esac
decrypt() { # stdin → stdout
  case "$FILE_NAME" in
    *.age) age -d -i "$AGE_IDENTITY_FILE" ;;
    *.enc) openssl enc -d -aes-256-cbc -pbkdf2 -iter "$OPENSSL_ITER" -pass "file:$OPENSSL_KEY_FILE" ;;
  esac
}

# The work folder sits in the data volume so the app container (user `node`) can open the copy.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORK="$DATA_DIR/.restore-tmp"
rm -rf "$WORK"
mkdir -p "$WORK"
DATA_OWNER=$(stat -c %u:%g "$DATA_DIR")

if [ -n "$remote_path" ]; then
  step "downloading $remote_path"
  command -v rclone > /dev/null || fail "missing tool: rclone"
  rclone copyto --retries 3 -q "$remote_path" "$WORK/$FILE_NAME" || fail "rclone could not download $remote_path"
  local_path="$WORK/$FILE_NAME"
fi
[ -s "$local_path" ] || fail "$local_path is missing or empty"
SIZE_BYTES=$(stat -c %s "$local_path")
free_kb=$(df -Pk "$DATA_DIR" | awk 'NR == 2 { print $4 }')
need_kb=$(( SIZE_BYTES * 12 / 1024 + MIN_FREE_MB * 1024 ))
[ "$free_kb" -ge "$need_kb" ] || fail "not enough free disk on $DATA_DIR: $(( free_kb / 1024 )) MB free, need about $(( need_kb / 1024 )) MB"

step "decrypting and unzipping $FILE_NAME ($SIZE_BYTES bytes)"
RESTORED="$WORK/restored.sqlite"
decrypt < "$local_path" | gzip -dc > "$RESTORED" || fail "could not decrypt/unzip $FILE_NAME (wrong key, or a damaged file)"
[ -s "$RESTORED" ] || fail "the decrypted database is empty"
if [ "$local_path" = "$WORK/$FILE_NAME" ]; then rm -f "$local_path"; fi   # the downloaded encrypted copy
chown -R "$DATA_OWNER" "$WORK"
chmod 700 "$WORK"
chmod 600 "$RESTORED"

step "checking the restored copy inside the app container"
# shellcheck disable=SC2016  # JavaScript, not shell
VERIFY_JS='
const { DatabaseSync } = require("node:sqlite");
function summary(file, readOnly) {
  const db = new DatabaseSync(file, { readOnly });
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = ? AND name NOT LIKE ? ORDER BY name").all("table", "sqlite_%").map((row) => row.name);
    const rows = {};
    for (const table of tables) rows[table] = db.prepare(`SELECT count(*) AS n FROM "${table.replaceAll("\"", "\"\"")}"`).get().n;
    const check = readOnly ? null : db.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]);
    return { userVersion: db.prepare("PRAGMA user_version").get().user_version, rows, check };
  } finally {
    db.close();
  }
}
try {
  const restored = summary(process.env.ASPIRE_RESTORED, false);
  let live = null;
  try { live = summary(process.env.ASPIRE_DB, true); } catch (error) { console.log(`(live database not readable: ${error.message})`); }
  const names = [...new Set([...Object.keys(restored.rows), ...Object.keys(live?.rows ?? {})])].sort();
  console.log(`${"table".padEnd(28)}${"backup".padStart(10)}${"live now".padStart(10)}`);
  for (const name of names) {
    console.log(`${name.padEnd(28)}${String(restored.rows[name] ?? "-").padStart(10)}${String(live?.rows[name] ?? "-").padStart(10)}`);
  }
  const ok = restored.check.length === 1 && restored.check[0] === "ok";
  console.log(`integrity_check: ${ok ? "ok" : restored.check.slice(0, 5).join("; ")}`);
  console.log(`user_version: backup ${restored.userVersion}, live ${live ? live.userVersion : "-"}`);
  console.log(`SUMMARY ok=${ok ? 1 : 0} tables=${Object.keys(restored.rows).length} userVersion=${restored.userVersion} liveUserVersion=${live ? live.userVersion : -1}`);
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(`check failed: ${error.message}`);
  process.exitCode = 1;
}
'
report=$(in_app "ASPIRE_RESTORED=$CONTAINER_DATA_DIR/.restore-tmp/restored.sqlite" "ASPIRE_DB=$CONTAINER_DATA_DIR/$DB_NAME" \
  -- node -e "$VERIFY_JS") || { printf '%s\n' "${report-}"; fail "the restored copy failed its check (see above)"; }
printf '%s\n' "$report" | grep -v '^SUMMARY '
summary_line=$(printf '%s\n' "$report" | grep '^SUMMARY ' || true)
DB_TABLES=$(printf '%s' "$summary_line" | sed -n 's/.* tables=\([0-9]*\).*/\1/p')
DB_VERSION=$(printf '%s' "$summary_line" | sed -n 's/.* userVersion=\([0-9]*\).*/\1/p')
live_version=$(printf '%s' "$summary_line" | sed -n 's/.* liveUserVersion=\(-\{0,1\}[0-9]*\).*/\1/p')
if [ -z "$DB_TABLES" ] || [ "$DB_TABLES" -eq 0 ]; then fail "the restored copy has no tables"; fi

if [ "$ACTION" = test ]; then
  now > "$OPS_DIR/.restore-test-last-success.tmp"
  chmod 644 "$OPS_DIR/.restore-test-last-success.tmp"
  mv -f "$OPS_DIR/.restore-test-last-success.tmp" "$OPS_DIR/restore-test-last-success"
  write_test_status ok
  log "RESTORE TEST PASSED: $FROM copy $FILE_NAME decrypts, unzips and passes integrity_check ($DB_TABLES tables). The live database was not touched."
  exit 0
fi

# ---- apply ----------------------------------------------------------------------------------------
if [ -n "$live_version" ] && [ "$live_version" -ge 0 ] && [ -n "$DB_VERSION" ] && [ "$DB_VERSION" -gt "$live_version" ]; then
  log "WARNING: this copy has a NEWER schema (user_version $DB_VERSION) than the live database ($live_version)."
  log "         It may come from a later release than the one running now; roll the app forward first if so."
fi
if [ "$YES" != 1 ]; then
  printf 'This replaces the LIVE database %s with %s.\nThe app stops for a moment. Type RESTORE to continue: ' "$LIVE_DB" "$FILE_NAME"
  read -r answer || answer=""
  [ "$answer" = RESTORE ] || fail "not confirmed; nothing changed"
fi

step "stopping the app"
compose stop "$APP_SERVICE"
ASIDE="$LIVE_DB.before-restore-$STAMP"
step "keeping the current database as $(basename "$ASIDE")"
REF="$RESTORED"
if [ -f "$LIVE_DB" ]; then
  REF="$ASIDE"
  for suffix in "" -wal -shm; do
    [ -e "$LIVE_DB$suffix" ] && mv "$LIVE_DB$suffix" "$ASIDE$suffix"
  done
fi
step "putting the restored copy in place"
cp "$RESTORED" "$LIVE_DB.restoring"
chown --reference="$REF" "$LIVE_DB.restoring"
chmod --reference="$REF" "$LIVE_DB.restoring"
mv -f "$LIVE_DB.restoring" "$LIVE_DB"

step "starting the app"
compose up -d "$APP_SERVICE"
container=$(compose ps -q "$APP_SERVICE")
health="starting"
for _ in $(seq 1 "$(( HEALTH_WAIT_SECONDS / 5 ))"); do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo unknown)
  [ "$health" = healthy ] && break
  sleep 5
done
if [ "$health" != healthy ]; then
  log "The app is not healthy after ${HEALTH_WAIT_SECONDS}s (state: $health). To go back to the previous database:"
  log "  cd $APP_DIR && docker compose stop $APP_SERVICE && mv $ASIDE $LIVE_DB && docker compose up -d $APP_SERVICE"
  fail "app not healthy after the restore"
fi
log "RESTORED $FILE_NAME. The app is healthy. Sign in and check the CRM, users and audit log."
if [ "$REF" = "$ASIDE" ]; then
  log "The previous database is at $ASIDE (NOT encrypted, personal data): delete it once you are sure (shred -u $ASIDE*)."
fi
log "Run backup.sh now so tonight's copy is not the first one after the restore."
