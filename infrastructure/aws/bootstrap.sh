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

REGION="${AWS_REGION:-ap-south-1}"
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

step "rds ca bundle"
# RDS enforces TLS (rds.force_ssl=1) and presents a certificate from Amazon's
# own CA, which is not in Node's trust store — so a driver that verifies gets
# "self-signed certificate in certificate chain". Prisma's migration engine
# and psql negotiate their own way and are unaffected, which is why migrations
# succeed while every worker on the pg driver adapter fails.
# NODE_EXTRA_CA_CERTS points at this file; see docs/production-setup.md.
if [ ! -s /etc/ssl/certs/rds-ca.pem ]; then
  curl -fsSL "https://truststore.pki.rds.amazonaws.com/${REGION}/${REGION}-bundle.pem" \
    -o /etc/ssl/certs/rds-ca.pem
  chmod 644 /etc/ssl/certs/rds-ca.pem
fi
echo "rds ca: $(grep -c 'BEGIN CERTIFICATE' /etc/ssl/certs/rds-ca.pem) certificates"

# --- application ----------------------------------------------------------
step "source"
# Two ways in. SOURCE_S3 ships a `git archive` tarball through the bucket and
# is what this deployment uses: the repository belongs to a different GitHub
# account than the one operating it, and fine-grained tokens only reach repos
# their creator owns, so the box has no usable clone credential — only its
# instance role. Cloning stays supported for when one exists.
if [ -n "${SOURCE_S3:-}" ]; then
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  aws s3 cp "$SOURCE_S3" /tmp/src.tar.gz --region "$REGION"
  # Extracted over whatever is there: the tarball holds tracked files only, so
  # node_modules and build output survive and npm ci stays incremental.
  tar xzf /tmp/src.tar.gz -C "$APP_DIR"
  chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"
  rm -f /tmp/src.tar.gz
elif [ -d "$APP_DIR/.git" ]; then
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
# Built into a staging directory and swapped in, never over the live one.
# `next start` reads chunk files from disk as it serves them, so rebuilding in
# place deletes chunks the running server is still handing out: anyone with
# the page already open gets "Application error: a client-side exception has
# occurred", and Server Action IDs from the previous build stop resolving —
# for the whole three minutes a build takes, not just an instant.
#
# All three are built before any are swapped, so a failure in the last one
# leaves the currently-serving build untouched rather than half-replaced.
BUILD_DIR=.next-build
for app in web api sites; do
  rm -rf "apps/$app/$BUILD_DIR"
  sudo -u "$APP_USER" --preserve-env NEXT_DIST_DIR="$BUILD_DIR" npm run build -w "apps/$app"
done

step "swap in the new build"
for app in web api sites; do
  rm -rf "apps/$app/.next-previous"
  # A rename, so it is atomic and the running process keeps serving from the
  # old inode until pm2 restarts it.
  [ -d "apps/$app/.next" ] && mv "apps/$app/.next" "apps/$app/.next-previous"
  mv "apps/$app/$BUILD_DIR" "apps/$app/.next"
  chown -R "${APP_USER}:${APP_USER}" "apps/$app/.next"
done

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

# Only once the new build is being served: until pm2 has restarted, the old
# processes are still reading from these inodes.
for app in web api sites; do
  rm -rf "apps/$app/.next-previous"
done

step "nginx + tls"
# After pm2, so the backends are already listening when the redirect to HTTPS
# goes live. Skips certificate issuance rather than failing the bootstrap when
# DNS is not pointing here yet.
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}" bash infrastructure/aws/setup-nginx.sh

step "status"
sudo -u "$APP_USER" --preserve-env pm2 list

echo
echo "=== bootstrap finished $(date -Is) ==="
