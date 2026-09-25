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

# Every command this script runs as the app user goes through one of these
# two helpers, and both pin HOME. Nothing here inherits a usable one: SSM runs
# commands with HOME unset and the outer sudo sets it to /root, so
# `sudo --preserve-env` was handing the app user root's home. Anything that
# caches under ~ then looked in a directory the app user cannot read. That is
# how the recorder and verification workers ended up crash-looping on
#   browserType.launch: Executable doesn't exist at
#   /root/.cache/ms-playwright/chromium_headless_shell-1243/...
# while the browsers sat correctly installed in /home/ubuntu/.cache. pm2
# passes its own environment to the processes it spawns, so a wrong HOME here
# reaches every worker, not just this script.
as_app() { sudo -u "$APP_USER" --preserve-env HOME="/home/$APP_USER" "$@"; }
as_app_path() { sudo -u "$APP_USER" --preserve-env=PATH HOME="/home/$APP_USER" "$@"; }

# Every pm2 call goes through here so its state directory is never left to
# chance. pm2 keeps its daemon state under $HOME/.pm2, and these calls reach
# it through `sudo -u $APP_USER --preserve-env`, which carries the *caller's*
# HOME through rather than the target user's. From a login shell that happens
# to be right. Run from `ssm send-command`, where HOME is unset entirely, and
# pm2 resolved /root/.pm2 instead: permission denied as the app user, and the
# deploy died at the very last step, after the new build had already been
# swapped in but before anything restarted — leaving the box serving the old
# build with no sign anything was wrong. PM2_HOME is explicit and outranks
# HOME, so this talks to the one real daemon however the script was invoked.
app_pm2() { as_app env PM2_HOME="/home/$APP_USER/.pm2" pm2 "$@"; }

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
  # node_modules and build output survive and npm ci stays incremental. The
  # cost of that is deletions: extracting never removes anything, so a file
  # deleted upstream lives on here forever. For a route file that means a
  # deleted endpoint keeps being served — which is how /api/webhooks/razorpay
  # stayed answering after the payment-link code was removed from the repo.
  #
  # So each deploy records exactly which paths it laid down, and the next one
  # removes the ones that are no longer in the tarball. Only files a previous
  # deploy created are ever deleted: anything untracked (node_modules, .next,
  # /etc/pitchmyweb/env, a hand-written .env) was never in a manifest and so
  # is never a candidate. The manifest lives outside APP_DIR so extraction
  # cannot clobber it.
  MANIFEST_DIR=/var/lib/pitchmyweb
  MANIFEST="$MANIFEST_DIR/deployed-files"
  install -d "$MANIFEST_DIR"

  # Regular files only — directory entries would make comm treat a directory
  # that merely changed contents as a deletion.
  tar tzf /tmp/src.tar.gz | grep -v '/$' | LC_ALL=C sort > /tmp/manifest.new

  if [ -s "$MANIFEST" ]; then
    # In the old manifest but not the new tarball = deleted upstream.
    LC_ALL=C comm -23 "$MANIFEST" /tmp/manifest.new > /tmp/manifest.gone
    if [ -s /tmp/manifest.gone ]; then
      echo "removing $(wc -l < /tmp/manifest.gone) file(s) deleted upstream:"
      while IFS= read -r gone; do
        [ -n "$gone" ] || continue
        echo "  - $gone"
        rm -f "$APP_DIR/$gone"
        # Take the directory with it when that file was the last thing in it,
        # so an emptied route directory does not linger.
        rmdir -p --ignore-fail-on-non-empty "$(dirname "$APP_DIR/$gone")" 2>/dev/null || true
      done < /tmp/manifest.gone
    else
      echo "no files deleted upstream since the last deploy"
    fi
  else
    # First deploy after this was added: nothing to compare against, so record
    # the manifest and prune from the next deploy onward. Anything already
    # orphaned by an earlier deploy has to be cleared by hand once.
    echo "no previous manifest — recording one, pruning starts next deploy"
  fi

  tar xzf /tmp/src.tar.gz -C "$APP_DIR"
  chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"
  # Only after a successful extract: a manifest written for a deploy that then
  # failed would make the *next* one delete files this box still serves.
  mv /tmp/manifest.new "$MANIFEST"
  rm -f /tmp/src.tar.gz /tmp/manifest.gone
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
as_app_path npm ci

step "playwright chromium"
# --with-deps pulls the shared libraries headless Chromium needs; they are not
# part of the base image and npm ci does not install them.
as_app_path npx playwright install --with-deps chromium

step "database"
as_app npm run db:generate
as_app npm run db:deploy
# The service price list the AI analysis and pitch steps validate against.
# Inserts only what is missing, so tuned prices survive every deploy; never
# the demo businesses `db:seed` also adds.
as_app npm run db:seed-services

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
  # The previous build's generated route types also have to go. next build
  # writes a stub per route under .next/types, tsconfig includes them, and a
  # route that MOVED upstream leaves a stub importing a source file this
  # release no longer has — so the build fails type-checking a page that is
  # not in it. Moving login/ and register/ under an (auth) group did exactly
  # that. Only types/: the rest of .next is what the running server is still
  # serving until the swap below.
  rm -rf "apps/$app/.next/types"
  as_app env NEXT_DIST_DIR="$BUILD_DIR" npm run build -w "apps/$app"
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
if app_pm2 describe pmw-web >/dev/null 2>&1; then
  app_pm2 reload ecosystem.config.cjs --update-env
else
  app_pm2 start ecosystem.config.cjs
fi
app_pm2 save
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
app_pm2 list

echo
echo "=== bootstrap finished $(date -Is) ==="
