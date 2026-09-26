#!/usr/bin/env bash
# Put the previous release's build back and restart onto it. Run on the
# server as root when a deploy went out broken:
#
#   sudo bash /home/ubuntu/PitchMyWeb/infrastructure/aws/rollback.sh
#
# bootstrap.sh keeps the replaced build as .next-previous in each app. This
# swaps the two (so running it again rolls forward) and reloads PM2. It does
# not undo database migrations: they are additive by rule, so the previous
# code runs against the newer schema. For data, RDS point-in-time restore
# (7 days) is the backstop.
set -euo pipefail
APP_DIR="${APP_DIR:-/home/ubuntu/PitchMyWeb}"
APP_USER="${APP_USER:-ubuntu}"
cd "$APP_DIR"
for app in web api sites; do
  [ -d "apps/$app/.next-previous" ] || { echo "no previous build for apps/$app; nothing to roll back to" >&2; exit 1; }
done
for app in web api sites; do
  mv "apps/$app/.next" "apps/$app/.next-rollback"
  mv "apps/$app/.next-previous" "apps/$app/.next"
  mv "apps/$app/.next-rollback" "apps/$app/.next-previous"
done
sudo -u "$APP_USER" env PM2_HOME="/home/$APP_USER/.pm2" pm2 reload ecosystem.config.cjs
echo "Rolled back. The build that was live is now apps/*/.next-previous (run again to restore it)."
