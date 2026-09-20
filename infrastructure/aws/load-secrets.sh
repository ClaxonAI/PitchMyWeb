#!/usr/bin/env bash
# Materialise the production environment from SSM Parameter Store.
#
#   sudo infrastructure/aws/load-secrets.sh
#   set -a; . /etc/pitchmyweb/env; set +a
#   pm2 start ecosystem.config.cjs
#
# Secrets reach the box over the instance role, never through a file in the
# repo and never through a shell command anyone can read in their history.
# Parameters live under /pitchmyweb/prod/<ENV_VAR_NAME>, so the SSM name is the
# environment variable name and nothing here needs a mapping table.
#
# The instance role needs:
#   ssm:GetParametersByPath  on arn:aws:ssm:<region>:<acct>:parameter/pitchmyweb/prod/*
#   kms:Decrypt              on the key backing the SecureString values
#
# NOTE: apps/web inlines NEXT_PUBLIC_* at BUILD time, so this must be sourced
# before `npm run build`, not merely before pm2 start. Building without it
# produces a bundle with no Clerk key and sign-in fails at runtime with
# everything looking correctly configured.

set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
SSM_PATH="${SSM_PATH:-/pitchmyweb/prod}"
OUT_DIR="/etc/pitchmyweb"
OUT_FILE="${OUT_DIR}/env"
APP_USER="${APP_USER:-pitchmyweb}"

command -v aws >/dev/null || { echo "aws CLI not found" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 not found" >&2; exit 1; }

mkdir -p "$OUT_DIR"

# Write to a private temp file first: creating the real file and filling it
# afterwards leaves a window where it exists world-readable.
TMP="$(mktemp "${OUT_DIR}/.env.XXXXXX")"
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT

echo "Fetching ${SSM_PATH}/* from SSM in ${REGION}…" >&2

# --recursive so nested paths work; the CLI paginates past the 10-item default
# on its own. Values are shell-quoted by python, so keys containing $ ' " or a
# newline cannot break the file or execute anything when it is sourced.
aws ssm get-parameters-by-path \
    --path "$SSM_PATH" \
    --recursive \
    --with-decryption \
    --region "$REGION" \
    --output json \
  | python3 -c '
import json, shlex, sys

params = json.load(sys.stdin).get("Parameters", [])
if not params:
    sys.exit("No parameters found — check the path and the instance role.")

seen = set()
for p in sorted(params, key=lambda x: x["Name"]):
    name = p["Name"].rsplit("/", 1)[-1]
    if not name or name in seen:
        continue
    seen.add(name)
    print(f"{name}={shlex.quote(p['Value'])}")

print(f"# {len(seen)} parameters", file=sys.stderr)
' > "$TMP"

# Values never printed; only the variable names, so this is safe in a boot log.
echo "Loaded: $(cut -d= -f1 < "$TMP" | tr '\n' ' ')" >&2

chown "${APP_USER}:${APP_USER}" "$TMP" 2>/dev/null || true
mv "$TMP" "$OUT_FILE"
trap - EXIT

echo "Wrote ${OUT_FILE} (chmod 600, owner ${APP_USER})" >&2
