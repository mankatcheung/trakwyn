#!/usr/bin/env bash
# Copies each image in infra/base-images.txt into the base-images Artifact
# Registry repo and checks the copy kept the pinned digest (JEF-406).
#
#   mirror-base-images.sh <pin-file> <destination-repo>   copy and verify
#   mirror-base-images.sh --list <pin-file> <destination-repo>
#                                    print "<source> <digest> <destination>" only
#
# <destination-repo> is e.g. europe-west1-docker.pkg.dev/<project>/base-images.
# The caller has already logged in to it. Sources are pulled anonymously.
#
# MIRROR_ATTEMPTS (default 5) and MIRROR_RETRY_DELAY (seconds, default 30,
# multiplied by the attempt number) govern the retry around each copy.
set -euo pipefail

attempts="${MIRROR_ATTEMPTS:-5}"
retry_delay="${MIRROR_RETRY_DELAY:-30}"

list_only=false
if [[ "${1:-}" == "--list" ]]; then
  list_only=true
  shift
fi

pin_file="${1:?usage: mirror-base-images.sh [--list] <pin-file> <destination-repo>}"
dest_repo="${2:?usage: mirror-base-images.sh [--list] <pin-file> <destination-repo>}"
dest_repo="${dest_repo%/}"

# Prints "<source-with-tag> <digest> <destination-with-tag>" per pin, and
# fails on a line it cannot read, so a typo cannot silently skip an image.
parse() {
  local line ref digest source name
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(echo "$line" | tr -d '[:space:]')"
    [[ -z "$line" ]] && continue
    if [[ ! "$line" =~ ^([^@]+:[^@:/]+)@(sha256:[a-f0-9]{64})$ ]]; then
      echo "error: unreadable pin '$line' in $pin_file (want <source>:<tag>@sha256:<64 hex>)" >&2
      return 1
    fi
    ref="${BASH_REMATCH[1]}"
    digest="${BASH_REMATCH[2]}"
    source="$ref"
    name="${ref##*/}"
    echo "$source $digest $dest_repo/$name"
  done <"$pin_file"
}

pins="$(parse)"
if [[ -z "$pins" ]]; then
  echo "error: no pins found in $pin_file" >&2
  exit 1
fi

if $list_only; then
  echo "$pins"
  exit 0
fi

# A multi-platform image is one manifest per platform plus their layers, all
# fetched at once from a registry that rate-limits anonymous clients by IP, so
# a first attempt can get `429 Too Many Requests` partway (it did, for
# postgres). Blobs already pushed are skipped on the next attempt, so each one
# gets further than the last.
copy_with_retry() {
  local base="$1" digest="$2" dest="$3" attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if docker buildx imagetools create --tag "$dest" "$base@$digest"; then
      return 0
    fi
    if ((attempt < attempts)); then
      echo "::warning::copy of $dest failed (attempt $attempt of $attempts); retrying in $((retry_delay * attempt))s"
      sleep $((retry_delay * attempt))
    fi
  done
  return 1
}

failed=0
while read -r source digest dest; do
  echo "::group::$source -> $dest"
  # Copy by digest, not by tag, so a tag that moved upstream since the pin
  # was written cannot change what is mirrored. The tag on the destination is
  # only a label for humans and for Renovate-free pulls.
  base="${source%:*}"
  copied=""
  if copy_with_retry "$base" "$digest" "$dest"; then
    copied="$(docker buildx imagetools inspect "$dest" --format '{{.Manifest.Digest}}')"
  fi
  if [[ "$copied" != "$digest" ]]; then
    echo "::error::$dest is ${copied:-not copied}, pinned $digest"
    failed=1
  else
    echo "ok: $dest @ $digest"
  fi
  echo "::endgroup::"
done <<<"$pins"

exit "$failed"
