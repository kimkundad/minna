#!/usr/bin/env bash
# Deploy Minna on the production server.
#
#   cd /srv/minna
#   bash deploy.sh 2026-10-10-01    # the tag build-push.ps1 printed
#   bash deploy.sh                  # whatever is already in .env, again
#
# Rolling back is the same command with an older tag. Every tag stays in the
# registry, so there is always something to go back to.
#
# Schema changes are not applied here. `drizzle-kit push` cannot run against
# this database (DigitalOcean sets sql_require_primary_key = ON), so each one
# is a hand-written idempotent script under api/scripts/add-*.mts, run from a
# developer's machine against the production DATABASE_URL *before* deploying
# the release that needs it. They are written to be safe to run twice.

set -euo pipefail

cd "$(dirname "$0")"

export REGISTRY="${REGISTRY:-ghcr.io/kimkundad}"
export API_IMAGE="$REGISTRY/minna-api"
export WEB_IMAGE="$REGISTRY/minna-web"

# The tag is remembered, so a bare `deploy.sh` redeploys what is running
# rather than guessing. `latest` is deliberately not a thing here: a moving
# tag makes "what is deployed" unanswerable.
TAG_FILE=.deployed-tag
if [[ $# -ge 1 ]]; then
  TAG="$1"
elif [[ -f "$TAG_FILE" ]]; then
  TAG="$(cat "$TAG_FILE")"
  echo "No tag given; reusing $TAG"
else
  echo "No tag given and none recorded. Pass the tag build-push.ps1 printed:" >&2
  echo "  bash deploy.sh 2026-10-10-01" >&2
  exit 1
fi
export IMAGE_TAG="$TAG"

if [[ ! -f .env ]]; then
  echo "No .env here. Copy .env.prod.example to .env and fill it in." >&2
  exit 1
fi

# The project name is stated rather than left to compose, which would take it
# from the directory — `/srv/minna` gives `minna`, which is also the name the
# old Laravel site's containers were started under. Sharing a project name
# means sharing a fate: compose treats anything in the project that is not in
# this file as an orphan.
COMPOSE="docker compose -p minna-v2 -f docker-compose.prod.yml"

echo "Pulling $TAG"
$COMPOSE pull

# Which commit this actually is. Without it, a tag is only a date, and six
# weeks later nobody can say what went out.
REVISION="$(docker image inspect "${API_IMAGE}:${TAG}" \
  --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
[[ -n "$REVISION" ]] && echo "  commit ${REVISION:0:7}"

echo "Starting containers"
# No `--remove-orphans`. It deletes every container in the project that is not
# in this file, which on the first run took the old Laravel site — running,
# serving, and started under the same project name — off the server. A deploy
# should never be able to remove something it did not create. Containers this
# stack no longer needs are removed by name, by hand, by somebody who has
# looked at them.
$COMPOSE up -d

# Written only after the pull and the start have both worked, so a failed
# deploy does not leave the file claiming a release that never came up.
echo "$TAG" > "$TAG_FILE"

# A container that is up is not the same as an API that can reach its
# database. The image declares a healthcheck; this waits for it to pass
# rather than reporting success and leaving somebody to find out from a user.
echo -n "Waiting for the API"
for _ in $(seq 1 30); do
  state="$(docker inspect --format '{{ .State.Health.Status }}' minna-api 2>/dev/null || echo starting)"
  if [[ "$state" == healthy ]]; then
    echo " — healthy"
    break
  fi
  if [[ "$state" == unhealthy ]]; then
    echo " — unhealthy"
    echo "Last lines from the API:" >&2
    docker logs --tail 40 minna-api >&2
    exit 1
  fi
  echo -n .
  sleep 2
done

if [[ "${state:-}" != healthy ]]; then
  echo " — still not healthy after 60s"
  docker logs --tail 40 minna-api >&2
  exit 1
fi

echo
$COMPOSE ps

# ---------------------------------------------------------------------------
# Old releases, cleared out.
#
# Each tag keeps about 62 MB of layers of its own — the rest is shared with
# every other tag — so they are cheap but not free, and nothing was ever
# removing them. Sixteen had piled up by the time anybody looked.
#
# Only minna-api and minna-web, and only by exact tag. `docker image prune -a`
# is not an option here: this server also runs jaga, plusexploration, a PHP
# site and redis, and their rollback tags are nobody's to delete from a script
# that was asked to deploy something else.
#
# KEEP releases stay, newest first, and the tag just deployed always stays
# whatever its age. Five is three more than a rollback has ever needed.
# `KEEP=0 bash deploy.sh …` turns the whole thing off.
KEEP="${KEEP:-5}"
if [[ "$KEEP" -gt 0 ]]; then
  echo
  echo "Keeping the newest $KEEP releases"
  for repo in "$API_IMAGE" "$WEB_IMAGE"; do
    # Newest first, by when the image was created rather than by tag, so a
    # rebuild of an older date does not sort itself into the past.
    mapfile -t tags < <(
      docker images "$repo" --format '{{.CreatedAt}}\t{{.Tag}}' |
        sort -r |
        cut -f2 |
        grep -v '^<none>$' || true
    )
    # Guarded, because slicing an empty array trips `set -u` on older bash.
    (( ${#tags[@]} > KEEP )) || continue
    for old in "${tags[@]:$KEEP}"; do
      [[ "$old" == "$TAG" ]] && continue
      # A tag still in use by a container cannot be removed, and docker says
      # so rather than doing it. That is the right answer, so it is not an
      # error here — this is tidying, and the deploy has already succeeded.
      if docker rmi "$repo:$old" >/dev/null 2>&1; then
        echo "  removed $repo:$old"
      else
        echo "  kept    $repo:$old (in use)"
      fi
    done
  done
  # Layers no longer referenced by any tag. Untagged and dangling only, which
  # is what the removals above leave behind; it cannot touch another
  # project's tagged images.
  docker image prune -f >/dev/null 2>&1 || true
fi

echo
echo "Deployed $TAG"
echo "  https://minna.learnsbuy.com"
echo "  https://minna-admin.learnsbuy.com"
