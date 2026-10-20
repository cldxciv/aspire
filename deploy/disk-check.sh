#!/usr/bin/env bash
# Aspire website: free-disk check for the shared VPS (deploy/README.md → Disk hygiene).
#
#   disk-check.sh            report free space on the disks holding /opt/aspire-web and Docker's data,
#                            Docker's usage and the aspire-web images; exit 1 when any has under WARN_GB free
#   disk-check.sh --quiet    print nothing unless space is low (for cron)
#   disk-check.sh --status   also write data/ops/disk-status.json (for the admin console's Site status page)
#
# WARN_GB defaults to 3: a release build peaks at about 2.6 GB, so do not start one below that.
# Read-only apart from the --status file: it never deletes anything (see prune-images.sh).
set -euo pipefail
export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

QUIET=0
STATUS=0
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --status) STATUS=1 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 64 ;;
  esac
done

APP_DIR="${APP_DIR:-/opt/aspire-web}"
OPS_DIR="${OPS_DIR:-$APP_DIR/data/ops}"
WARN_GB="${WARN_GB:-3}"
case "$WARN_GB" in ''|*[!0-9]*) echo "WARN_GB must be a whole number of GB" >&2; exit 64 ;; esac
warn_kb=$(( WARN_GB * 1024 * 1024 ))

docker_root=""
if command -v docker > /dev/null; then
  docker_root=$(docker info --format '{{.DockerRootDir}}' 2> /dev/null || true)
fi
paths=("$APP_DIR")
[ -n "$docker_root" ] && paths+=("$docker_root")

low=0
lines=()
fs_json=()
seen=" "
for path in "${paths[@]}"; do
  [ -e "$path" ] || continue
  # df -P: Filesystem 1024-blocks Used Available Capacity Mounted-on
  read -r fs size_kb _ avail_kb pct mount < <(df -Pk "$path" | awk 'NR == 2')
  case "$seen" in *" $fs "*) continue ;; esac
  seen="$seen$fs "
  state=OK
  if [ "$avail_kb" -lt "$warn_kb" ]; then state=LOW; low=1; fi
  lines+=("$(printf '%-5s %-22s %8s MB free of %8s MB (%s used)  [%s]' "$state" "$mount" "$(( avail_kb / 1024 ))" "$(( size_kb / 1024 ))" "$pct" "$path")")
  fs_json+=("$(printf '{ "mount": "%s", "freeBytes": %s, "sizeBytes": %s }' "$mount" "$(( avail_kb * 1024 ))" "$(( size_kb * 1024 ))")")
done

if [ "$STATUS" = 1 ] && [ -d "$(dirname "$OPS_DIR")" ]; then
  mkdir -p "$OPS_DIR"
  chmod 755 "$OPS_DIR"
  joined=$(IFS=,; printf '%s' "${fs_json[*]-}")
  ok=true
  [ "$low" = 0 ] || ok=false
  printf '{\n  "schema": 1,\n  "checkedAt": "%s",\n  "warnBelowBytes": %s,\n  "ok": %s,\n  "filesystems": [%s]\n}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(( warn_kb * 1024 ))" "$ok" "$joined" > "$OPS_DIR/.disk-status.json.tmp"
  chmod 644 "$OPS_DIR/.disk-status.json.tmp"
  mv -f "$OPS_DIR/.disk-status.json.tmp" "$OPS_DIR/disk-status.json"
fi

if [ "$QUIET" = 1 ] && [ "$low" = 0 ]; then exit 0; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) disk check (warn under ${WARN_GB} GB free)"
printf '  %s\n' "${lines[@]}"
if [ "$QUIET" = 0 ] && [ -n "$docker_root" ]; then
  echo
  echo "Docker usage:"
  docker system df 2> /dev/null | sed 's/^/  /' || true
  echo
  echo "aspire-web images (keep the current release and one rollback):"
  docker image ls aspire-web --format '  {{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' 2> /dev/null || true
fi
if [ "$low" = 1 ]; then
  echo
  echo "WARNING: under ${WARN_GB} GB free. Do not start a release build (it peaks at about 2.6 GB). To free space:"
  echo "  1. deploy/prune-images.sh (dry run), then --apply once the owner agrees: keeps the current + one rollback image"
  echo "  2. docker builder prune -f   (build cache; frees 1-2 GB after a build)"
  echo "  3. look for old files in /opt/aspire-web/backups and /opt/aspire-web/release-*.tar.gz"
  exit 1
fi
exit 0
