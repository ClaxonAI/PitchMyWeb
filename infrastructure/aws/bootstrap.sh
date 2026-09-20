#!/usr/bin/env bash
# Prepare a bare Ubuntu 22.04 box and bring the app up. Safe to re-run: every
# step is idempotent, so this doubles as the redeploy script.
#
#   sudo bash infrastructure/aws/bootstrap.sh
#
# The stock Ubuntu AMI has no node, npm, pm2 or Chromium libraries, so `npm ci`
# fails on a fresh box until this has run.
#
# Progress goes to /var/log/pitchmyweb-bootstrap.log as well as the console,
# which is how you read it back when driving this over SSM send-command.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ClaxonAI/PitchMyWeb.git}"
APP_DIR="${APP_DIR:-/home/ubuntu/PitchMyWeb}"
APP_USER="${APP_USER:-ubuntu}"
NODE_MAJOR="${NODE_MAJOR:-24}"
LOG=/var/log/pitchmyweb-bootstrap.log

exec > >(tee -a "$LOG") 2>&1
echo "=== bootstrap $(date -Is) ==="

step() { echo; echo "--- $* ---"; }

# --- system packages ------------------------------------------------------
step "apt packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git unzip build-essential ca-certificates nginx postgresql-client

step "aws cli"
# The stock Ubuntu image ships no aws CLI, and load-secrets.sh needs one to
# reach Parameter Store. Installed from upstream rather than apt, whose
# package is still v1.
if ! command -v aws >/dev/null; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q -o /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install --update
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi
aws --version

step "node ${NODE_MAJOR}"
# Node 22.9+/24 is required: apps/api's jobs script uses --env-file-if-exists,
# which older releases reject outright rather than ignoring.
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
node -v && npm -v

step "pm2"
command -v pm2 >/dev/null || npm install -g pm2

# --- application ----------------------------------------------------------
step "repository"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all --prune
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard origin/main
else
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

step "secrets from SSM"
bash infrastructure/aws/load-secrets.sh

# Sourced here, before the build. apps/web inlines NEXT_PUBLIC_* at build time,
# so a build that runs without this produces a bundle with no Clerk key —
# sign-in then fails at runtime while every config file looks correct.
set -a
# shellcheck disable=SC1091
. /etc/pitchmyweb/env
set +a

# Fail loudly here rather than letting `next build` fail with a stack trace.
: "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:?not in SSM — next.config.ts refuses to build without it}"
: "${DATABASE_URL:?not in SSM}"
: "${REDIS_URL:?not in SSM}"

step "npm ci"
sudo -u "$APP_USER" --preserve-env=PATH npm ci

step "playwright chromium"
# --with-deps pulls the shared libraries headless Chromium needs; they are not
# part of the base image and npm ci does not install them.
sudo -u "$APP_USER" --preserve-env=PATH npx playwright install --with-deps chromium

step "database"
sudo -u "$APP_USER" --preserve-env npm run db:generate
sudo -u "$APP_USER" --preserve-env npm run db:deploy

step "build"
sudo -u "$APP_USER" --preserve-env npm run build

step "pm2"
# reload when already running so a redeploy does not drop the WhatsApp socket
# any longer than necessary.
if sudo -u "$APP_USER" --preserve-env pm2 describe pmw-web >/dev/null 2>&1; then
  sudo -u "$APP_USER" --preserve-env pm2 reload ecosystem.config.cjs --update-env
else
  sudo -u "$APP_USER" --preserve-env pm2 start ecosystem.config.cjs
fi
sudo -u "$APP_USER" --preserve-env pm2 save
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true

step "nginx + tls"
# After pm2, so the backends are already listening when the redirect to HTTPS
# goes live. Skips certificate issuance rather than failing the bootstrap when
# DNS is not pointing here yet.
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}" bash infrastructure/aws/setup-nginx.sh

step "status"
sudo -u "$APP_USER" --preserve-env pm2 list

echo
echo "=== bootstrap finished $(date -Is) ==="
