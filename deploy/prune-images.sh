#!/usr/bin/env bash
# Aspire website: keep only the current release image and ONE rollback image (deploy/README.md → Disk hygiene).
#
#   prune-images.sh                  dry run: lists what is kept and what would be removed
#   prune-images.sh --apply          removes the listed images (docker rmi, never -f)
#   prune-images.sh --rollback TAG   keep aspire-web:TAG as the rollback instead of the newest other image
#
# Always kept: aspire-web:$RELEASE from /opt/aspire-web/.env (current), the rollback image (by default
# the newest other aspire-web image), tags in KEEP_TAGS (default "demo", the old pre-M4 demo stack)
# and any image a container (running or stopped) was created from. Only aspire-web images are
# touched: other sites' images on this shared server never are. Show the dry run to the owner first.
set -euo pipefail
export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

APPLY=0
ROLLBACK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --rollback) ROLLBACK="${2-}"; shift 2 || { echo "--rollback needs a tag" >&2; exit 64; } ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 64 ;;
  esac
done

APP_DIR="${APP_DIR:-/opt/aspire-web}"
REPO="${IMAGE_REPO:-aspire-web}"
KEEP_TAGS=" ${KEEP_TAGS:-demo} "

die() { echo "ERROR: $*" >&2; exit 1; }

[ -f "$APP_DIR/.env" ] || die "$APP_DIR/.env not found"
current=$(sed -n 's/^RELEASE=//p' "$APP_DIR/.env" | tail -n 1 | tr -d "\"' \r")
[ -n "$current" ] || die "no RELEASE= line in $APP_DIR/.env"
docker image inspect "$REPO:$current" > /dev/null 2>&1 || die "the current image $REPO:$current is not on this server: refusing to prune"
if [ -n "$ROLLBACK" ]; then
  docker image inspect "$REPO:$ROLLBACK" > /dev/null 2>&1 || die "rollback image $REPO:$ROLLBACK not found"
fi

# Newest first: "created|tag|size". Untagged (<none>) images are not listed by tag and are left alone.
mapfile -t images < <(docker image ls "$REPO" --format '{{.CreatedAt}}|{{.Tag}}|{{.Size}}' | grep -v '|<none>|' | sort -r)

remove=()
echo "$REPO images (newest first):"
for row in "${images[@]}"; do
  IFS='|' read -r created tag size <<< "$row"
  reason=""
  if [ "$tag" = "$current" ]; then
    reason="current release (RELEASE in .env)"
  elif [ -n "$ROLLBACK" ] && [ "$tag" = "$ROLLBACK" ]; then
    reason="rollback (chosen)"
  elif [ -z "$ROLLBACK" ] && [[ "$KEEP_TAGS" != *" $tag "* ]]; then
    ROLLBACK="$tag"
    reason="rollback (newest other image)"
  elif [[ "$KEEP_TAGS" == *" $tag "* ]]; then
    reason="in KEEP_TAGS"
  elif [ -n "$(docker ps -a -q --filter "ancestor=$REPO:$tag")" ]; then
    reason="used by a container"
  fi
  if [ -n "$reason" ]; then
    printf '  KEEP    %-28s %9s  %s  - %s\n' "$tag" "$size" "$created" "$reason"
  else
    printf '  REMOVE  %-28s %9s  %s\n' "$tag" "$size" "$created"
    remove+=("$tag")
  fi
done

if [ "${#remove[@]}" -eq 0 ]; then
  echo "Nothing to remove."
  exit 0
fi
if [ "$APPLY" = 0 ]; then
  echo
  echo "Dry run: nothing removed. After the owner agrees, run again with --apply, then: docker builder prune -f"
  exit 0
fi
for tag in "${remove[@]}"; do
  echo "docker rmi $REPO:$tag"
  docker rmi "$REPO:$tag" || echo "  (could not remove $REPO:$tag; left in place)" >&2
done
echo
echo "Done. Also free the build cache: docker builder prune -f"
df -h "$APP_DIR" | sed 's/^/  /'
