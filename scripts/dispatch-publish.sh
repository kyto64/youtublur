#!/usr/bin/env bash
# Start publish.yml for a tag that was just pushed with GITHUB_TOKEN.
# Tag pushes made with GITHUB_TOKEN do not trigger workflows, so the daily
# patch release calls this after git push. DRY_RUN=1 prints the dispatch and
# does not call GitHub. This script never uploads to a store.

set -euo pipefail

TAG="${TAG:?TAG is required}"

if ! [[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "refusing to dispatch publish.yml for unexpected tag: ${TAG}" >&2
  exit 1
fi

if [ -n "${RELEASE_PUSH_TOKEN:-}" ]; then
  echo "RELEASE_PUSH_TOKEN is set; tag push should trigger publish.yml. Not dispatching."
  exit 0
fi

echo "Dispatching publish.yml for tag ${TAG} (workflow ref master, build_from_tag=true)"

if [ "${DRY_RUN:-}" = "1" ]; then
  echo "dry-run: gh workflow run publish.yml --ref master -f tag=${TAG} -f build_from_tag=true"
  exit 0
fi

attempts="${DISPATCH_TAG_ATTEMPTS:-5}"
wait_seconds="${DISPATCH_TAG_RETRY_SECONDS:-2}"
attempt=1
tag_visible=0
while [ "${attempt}" -le "${attempts}" ]; do
  if gh api "repos/${GITHUB_REPOSITORY:?}/git/ref/tags/${TAG}" --jq .ref >/dev/null 2>&1; then
    tag_visible=1
    break
  fi
  if [ "${attempt}" -eq "${attempts}" ]; then
    break
  fi
  sleep "${wait_seconds}"
  attempt=$((attempt + 1))
done

if [ "${tag_visible}" -ne 1 ]; then
  echo "tag ${TAG} is not on origin; refusing to dispatch publish.yml" >&2
  exit 1
fi

gh workflow run publish.yml \
  --ref master \
  -f "tag=${TAG}" \
  -f build_from_tag=true
