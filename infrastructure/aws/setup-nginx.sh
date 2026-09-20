#!/usr/bin/env bash
# Install the nginx site and obtain TLS certificates. Called by bootstrap.sh,
# and safe to run on its own once DNS is pointing at this box:
#
#   sudo CERTBOT_EMAIL=you@example.com bash infrastructure/aws/setup-nginx.sh
#
# Certificates are only attempted when every hostname already resolves to this
# instance. Let's Encrypt applies a rate limit of 5 failed authorisations per
# hostname per hour, so firing certbot at DNS that is not ready yet can lock
# the domain out for an hour — the guard below is what keeps a premature run
# from costing real time.

set -euo pipefail

DOMAINS=(pitchmyweb.in www.pitchmyweb.in api.pitchmyweb.in sites.pitchmyweb.in)
CERT_DOMAIN_ARGS=()
SITE_NAME=pitchmyweb
REPO_CONF="$(dirname "$0")/../nginx/pitchmyweb.conf"

step() { echo; echo "--- $* ---"; }

step "nginx site"
apt-get install -y -qq nginx python3-certbot-nginx

# Copied, not symlinked: certbot edits this file in place to add the TLS
# server blocks, and a symlink would have it writing into the git working tree.
install -m 644 "$REPO_CONF" "/etc/nginx/sites-available/${SITE_NAME}"
ln -sf "/etc/nginx/sites-available/${SITE_NAME}" "/etc/nginx/sites-enabled/${SITE_NAME}"

# The stock default site also answers on :80 and would win for any hostname we
# do not explicitly match.
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

step "dns check"
# The instance's own public address, read from IMDSv2.
TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)"
MY_IP="$(curl -fsS -H "X-aws-ec2-metadata-token: ${TOKEN}" \
  http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
echo "this instance: ${MY_IP:-unknown}"

ready=1
for d in "${DOMAINS[@]}"; do
  resolved="$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if [ -z "$resolved" ]; then
    echo "  $d -> no A record"
    ready=0
  elif [ -n "$MY_IP" ] && ! echo "$resolved" | grep -qw "$MY_IP"; then
    # Cloudflare's proxy answers with its own edge addresses, so a mismatch
    # here usually means the record is orange-clouded rather than wrong.
    echo "  $d -> $resolved (not this instance; proxied or pointed elsewhere)"
    ready=0
  else
    echo "  $d -> $resolved OK"
    CERT_DOMAIN_ARGS+=(-d "$d")
  fi
done

if [ "$ready" -ne 1 ]; then
  echo
  echo "Skipping certbot: every hostname must resolve to ${MY_IP:-this instance} first."
  echo "In Cloudflare add A records for @, www, api and sites pointing at it,"
  echo "set to DNS only (grey cloud) so the HTTP-01 challenge reaches nginx."
  echo "nginx is serving plain HTTP until then; re-run this script afterwards."
  exit 0
fi

step "certificates"
if [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "Skipping certbot: CERTBOT_EMAIL is not set."
  echo "Let's Encrypt sends expiry warnings there; set it in SSM and re-run:"
  echo "  aws ssm put-parameter --name /pitchmyweb/prod/CERTBOT_EMAIL \\"
  echo "    --type String --value you@example.com --region ap-south-1"
  exit 0
fi

# --redirect adds the :80 -> :443 redirect. Re-running is a no-op while the
# existing certificate is still far from expiry, so this stays idempotent.
certbot --nginx \
  "${CERT_DOMAIN_ARGS[@]}" \
  --non-interactive --agree-tos --redirect \
  -m "$CERTBOT_EMAIL"

nginx -t && systemctl reload nginx

step "renewal"
# The packaged timer handles renewal; confirm it is actually enabled rather
# than assuming, since a silent failure here surfaces 90 days later as an
# expired certificate.
systemctl enable --now certbot.timer 2>/dev/null || true
systemctl list-timers certbot.timer --no-pager 2>/dev/null | head -3 || true
certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry" || true
