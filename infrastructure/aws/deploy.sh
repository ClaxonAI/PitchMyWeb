#!/usr/bin/env bash
# Deploy the checked-out commit to the production server. Run by
# .github/workflows/deploy.yml after CI passes on main; also works from any
# shell with AWS credentials (bash infrastructure/aws/deploy.sh).
#
# The same steps as deploy.ps1:
#   1. Wait for any deploy already running on the server (two at once share
#      one folder and break each other's build).
#   2. Package HEAD with `git archive` and upload it to S3 under its commit.
#   3. Start bootstrap.sh from that package exactly once and follow it to the
#      end; on failure print the end of the deploy log.
#   4. Check the site answers.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
BUCKET="${DEPLOY_BUCKET:-pitchmyweb-prod-recordings-claxonai}"
SITE_URL="${SITE_URL:-https://pitchmyweb.in/}"
TIMEOUT_MINUTES="${DEPLOY_TIMEOUT_MINUTES:-60}"
POLL_SECONDS="${DEPLOY_POLL_SECONDS:-20}"

say() { echo "[$(date -u +%H:%M:%S)] $*"; }
fail() { echo "::error::$*" >&2; echo "FAILED: $*" >&2; exit 1; }
aws_() { aws --region "$REGION" "$@"; }

instances=$(aws_ ec2 describe-instances \
  --filters "Name=tag:Name,Values=pitchmyweb-app" "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[].InstanceId" --output text)
read -r -a ids <<<"$instances"
[ "${#ids[@]}" -eq 1 ] || fail "expected one running instance tagged Name=pitchmyweb-app, found: ${instances:-none}"
instance="${ids[0]}"
say "server: $instance"

status_of() {
  aws_ ssm get-command-invocation --instance-id "$instance" --command-id "$1" \
    --query Status --output text 2>/dev/null || echo Pending # not registered yet
}

# Follows a command until it ends; prints its final status.
wait_for() {
  local id="$1" what="$2" deadline=$(($(date +%s) + TIMEOUT_MINUTES * 60)) last="" state
  while [ "$(date +%s)" -lt "$deadline" ]; do
    state=$(status_of "$id")
    if [ "$state" != "$last" ]; then say "$what: $state" >&2; last="$state"; fi
    case "$state" in Success | Failed | Cancelled | TimedOut | Cancelling) echo "$state"; return 0 ;; esac
    sleep "$POLL_SECONDS"
  done
  echo TimedOut
}

# Runs shell lines on the server and waits; prints the command id.
run_remote() {
  local comment="$1"; shift
  local params id
  params=$(jq -cn --args '{commands: $ARGS.positional}' "$@")
  id=$(aws_ ssm send-command --instance-ids "$instance" --document-name AWS-RunShellScript \
    --timeout-seconds "$((TIMEOUT_MINUTES * 60))" --comment "$comment" \
    --parameters "$params" --query Command.CommandId --output text)
  echo "$id"
}

show_log() {
  local id
  id=$(run_remote "pitchmyweb status" \
    "echo '--- deploy log (last 150 lines) ---'" \
    "tail -n 150 /var/log/pitchmyweb-bootstrap.log 2>/dev/null || echo 'no deploy log yet'" \
    "echo; echo '--- memory ---'; free -m" \
    "echo; echo '--- processes ---'; sudo -u ubuntu env PM2_HOME=/home/ubuntu/.pm2 HOME=/home/ubuntu pm2 list --no-color 2>/dev/null || echo 'pm2 not running'")
  wait_for "$id" "reading server state" >/dev/null
  aws_ ssm get-command-invocation --instance-id "$instance" --command-id "$id" \
    --query StandardOutputContent --output text
}

# 1. Never overlap a deploy that is already running.
running=$(aws_ ssm list-commands --instance-id "$instance" --filters "key=Status,value=InProgress" \
  --query "Commands[?DocumentName=='AWS-RunShellScript'].CommandId" --output text)
for id in $running; do
  say "another command ($id) is still running on the server; waiting for it first"
  wait_for "$id" "earlier command" >/dev/null
done

# 2. Package and upload, under the commit so a later upload never replaces
# the package a running deploy is reading.
sha=$(git rev-parse --short=12 HEAD)
say "deploying: $(git log -1 --format='%h %s')"
tarball=$(mktemp --suffix=.tar.gz)
git archive --format=tar.gz -o "$tarball" HEAD
source_s3="s3://$BUCKET/deploy/$sha.tar.gz"
say "uploading $(du -h "$tarball" | cut -f1) to $source_s3"
aws_ s3 cp "$tarball" "$source_s3" --only-show-errors
rm -f "$tarball"

# 3. Run bootstrap.sh from the new package, not the copy already on the
# server: bootstrap unpacks the new source over itself, and bash keeps reading
# the old file, so the old script would run this deploy.
deploy_id=$(run_remote "pitchmyweb deploy $sha" \
  "set -e" \
  "rm -rf /tmp/pmw-boot && mkdir -p /tmp/pmw-boot" \
  "aws s3 cp '$source_s3' /tmp/pmw-boot/src.tar.gz --region '$REGION' --only-show-errors" \
  "tar xzf /tmp/pmw-boot/src.tar.gz -C /tmp/pmw-boot infrastructure/aws/bootstrap.sh" \
  "SOURCE_S3='$source_s3' bash /tmp/pmw-boot/infrastructure/aws/bootstrap.sh")
say "deploy started ($deploy_id); a full deploy takes about 10-15 minutes"
result=$(wait_for "$deploy_id" "deploy")
if [ "$result" != "Success" ]; then
  say "deploy ended as $result; the end of the deploy log:"
  show_log || true
  fail "deploy $result. The site keeps serving the previous build (a failed build is never swapped in)."
fi
say "deploy finished"

# 4. Is the site up?
for _ in $(seq 1 12); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L "$SITE_URL" || true)" = "200" ]; then
    say "$SITE_URL answers 200"
    exit 0
  fi
  sleep 15
done
show_log || true
fail "$SITE_URL did not answer 200 within 3 minutes of the deploy"
