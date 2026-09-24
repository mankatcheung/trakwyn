#!/usr/bin/env bash
# Adds a Secret Manager version for each sensitive value in an env file —
# step 3 of README.md. Everything else in that file (CORS_ORIGIN, the OAuth
# client IDs...) is not secret and belongs in terraform.tfvars instead.
# DATABASE_URL is a secret: a Postgres URL embeds its password (JEF-342).
#
#   ./load-secrets.sh ../../apps/api/.env.production            # dry run
#   ./load-secrets.sh ../../apps/api/.env.production --apply    # upload
#
# The dry run reports what it would upload, what is missing and what is
# still a placeholder, and never prints a secret value. Values are piped to
# gcloud, so they stay out of the process list and the shell history.
#
# Re-running is safe: each upload adds a new version and Cloud Run reads
# `latest`. Existing instances keep the value they started with, so roll out
# a new revision afterwards (README.md, "Day two").
set -euo pipefail

# Env var -> secret id. The ids match secrets.tf (lower-kebab-case).
SECRET_KEYS=(
  JWT_SECRET
  JWT_REFRESH_SECRET
  TOTP_ENCRYPTION_KEY
  LLM_API_KEY_ENCRYPTION_KEY
  DATABASE_URL
  UPSTASH_REDIS_REST_TOKEN
  BLOB_PUBLIC_READ_WRITE_TOKEN
  BREVO_API_KEY
  CRON_SECRET
  DIGEST_ADMIN_SECRET
  GOOGLE_OAUTH_CLIENT_SECRET
  GITHUB_OAUTH_CLIENT_SECRET
  VAPID_PRIVATE_KEY
  AXIOM_TOKEN
)

ENV_FILE="${1:-}"
MODE="${2:-}"

if [ -z "$ENV_FILE" ] || [ ! -f "$ENV_FILE" ]; then
  echo "usage: $0 <env-file> [--apply]" >&2
  exit 2
fi
if [ -n "$MODE" ] && [ "$MODE" != "--apply" ]; then
  echo "error: unknown argument '$MODE' (only --apply)" >&2
  exit 2
fi

# The value of KEY in the env file: last assignment wins, surrounding quotes
# and a trailing CR removed. Never echoed.
read_value() {
  local key="$1"
  sed -n "s/^[[:space:]]*\(export[[:space:]][[:space:]]*\)\{0,1\}${key}=//p" "$ENV_FILE" |
    tail -n 1 |
    tr -d '\r' |
    sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

secret_id() {
  printf '%s' "$1" | tr '[:upper:]_' '[:lower:]-'
}

missing=0
placeholder=0
ready=0
uploaded=0

echo "env file: $ENV_FILE"
if [ "$MODE" = "--apply" ]; then
  echo "mode:     apply (adding secret versions)"
else
  echo "mode:     dry run — pass --apply to upload"
fi
echo

for key in "${SECRET_KEYS[@]}"; do
  id="$(secret_id "$key")"
  value="$(read_value "$key" || true)"

  if [ -z "$value" ]; then
    printf '  %-30s MISSING      set it in the env file, or drop %s from secret_env_vars\n' "$id" "$key"
    missing=$((missing + 1))
    continue
  fi

  case "$value" in
    *change-me* | *changeme* | *your-* | *REPLACE*)
      printf '  %-30s PLACEHOLDER  refusing a value that was never set properly\n' "$id"
      placeholder=$((placeholder + 1))
      continue
      ;;
  esac

  if [ "$MODE" != "--apply" ]; then
    printf '  %-30s ready        %s characters\n' "$id" "${#value}"
    ready=$((ready + 1))
    continue
  fi

  if ! gcloud secrets describe "$id" >/dev/null 2>&1; then
    printf '  %-30s NO SECRET    run the targeted terraform apply first (README step 2)\n' "$id"
    missing=$((missing + 1))
    continue
  fi

  version="$(printf '%s' "$value" | gcloud secrets versions add "$id" --data-file=- --format='value(name)')"
  printf '  %-30s uploaded     version %s\n' "$id" "${version##*/}"
  uploaded=$((uploaded + 1))
done

echo
if [ "$MODE" = "--apply" ]; then
  echo "uploaded $uploaded of ${#SECRET_KEYS[@]}"
else
  echo "$ready of ${#SECRET_KEYS[@]} ready to upload"
fi
[ "$missing" -gt 0 ] && echo "missing:     $missing"
[ "$placeholder" -gt 0 ] && echo "placeholder: $placeholder"

if [ "$missing" -gt 0 ] || [ "$placeholder" -gt 0 ]; then
  echo
  echo "Cloud Run will not start a revision whose secret has no version."
  exit 1
fi
exit 0
