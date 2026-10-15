#!/usr/bin/env bash
# Prints the mirrored, digest-pinned reference for one base image (JEF-407):
#
#   base-image-ref.sh node europe-west1-docker.pkg.dev/<project>/base-images
#   -> europe-west1-docker.pkg.dev/<project>/base-images/node:24-slim@sha256:...
#
# infra/base-images.txt is the one place the version lives. CI builds and
# runs the image the mirror workflow copied, so a bump is one edit there.
set -euo pipefail

name="${1:?usage: base-image-ref.sh <name> <destination-repo>}"
dest_repo="${2:?usage: base-image-ref.sh <name> <destination-repo>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ref="$("$here/mirror-base-images.sh" --list "$here/../../infra/base-images.txt" "$dest_repo" |
  awk -v suffix="/$name:" 'index($3, suffix) { print $3 "@" $2 }')"

if [[ -z "$ref" || "$ref" == *$'\n'* ]]; then
  echo "error: want exactly one pin named '$name' in infra/base-images.txt" >&2
  exit 1
fi
echo "$ref"
