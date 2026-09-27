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

DOMAINS=(pitchmyweb.in www.pitchmyweb.in api.pitchmyweb.in preview.pitchmyweb.in)
CERT_DOMAIN_ARGS=()
SITE_NAME=pitchmyweb
REPO_CONF="$(dirname "$0")/../nginx/pitchmyweb.conf"

step() { echo; echo "--- $* ---"; }

step "nginx site"
apt-get install -y -qq nginx python3-certbot-nginx

# The instance's own public address, read from IMDSv2. Needed twice: for the
# DNS check further down, and first for the trusted-proxy list below.
TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)"
MY_IP="$(curl -fsS -H "X-aws-ec2-metadata-token: ${TOKEN}" \
  http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
[[ "$MY_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || MY_IP=""
echo "this instance: ${MY_IP:-unknown}"

# pitchmyweb.conf takes the client address from X-Forwarded-For only when the
# request comes from an address it trusts (see the comment there). Loopback is
# trusted in the file itself; this adds the instance's public IP, which is
# where the web app's /api proxy arrives from when API_URL is
# https://api.pitchmyweb.in rather than loopback.
TRUSTED_PROXIES=/etc/nginx/pitchmyweb-trusted-proxies.conf
if [ -n "$MY_IP" ]; then
  echo "set_real_ip_from ${MY_IP};" > "$TRUSTED_PROXIES"
else
  rm -f "$TRUSTED_PROXIES"
  case "${API_URL:-}" in
    ""|http://127.0.0.1*|http://localhost*) ;;
    *)
      # The proxied /api requests would then all appear to come from this
      # instance, and every dashboard user would share one rate-limit bucket.
      echo "Refusing to install the nginx site: this instance's public IP is unknown" >&2
      echo "while API_URL=${API_URL} routes the web app's /api calls back through nginx." >&2
      echo "Point API_URL at http://127.0.0.1:4000, or re-run once IMDS answers." >&2
      exit 1
      ;;
  esac
fi

# Behind Cloudflare's proxy every request reaches nginx from a Cloudflare edge
# address, with the visitor at the end of X-Forwarded-For. pitchmyweb.conf
# only takes the visitor from an address it trusts, so the edge ranges go in
# a second trusted-proxies file (its include matches both). Without them every
# visitor shares a handful of edge addresses, and with them one rate limit on
# sign-in, sign-up and checkout.
#
# Read from Cloudflare's published list each deploy. The copy below is the
# fallback for a deploy that cannot reach it, and a failed fetch never replaces
# a file that is already there.
CF_TRUSTED=/etc/nginx/pitchmyweb-trusted-proxies-cloudflare.conf
CF_FALLBACK="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32"
CF_RANGES="$(curl -fsS --max-time 10 https://api.cloudflare.com/client/v4/ips 2>/dev/null | python3 -c '
import ipaddress, json, sys
result = json.load(sys.stdin)["result"]
ranges = [str(ipaddress.ip_network(r)) for r in result["ipv4_cidrs"] + result["ipv6_cidrs"]]
if len(ranges) < 10:
    sys.exit("implausibly short list")
print(" ".join(ranges))
' 2>/dev/null || true)"
if [ -n "$CF_RANGES" ]; then
  echo "cloudflare ranges: fetched ($(echo "$CF_RANGES" | wc -w))"
elif [ -s "$CF_TRUSTED" ]; then
  echo "cloudflare ranges: fetch failed, keeping ${CF_TRUSTED}"
  CF_RANGES="$(awk '{print $2}' "$CF_TRUSTED" | tr -d ';' | tr '\n' ' ')"
else
  echo "cloudflare ranges: fetch failed, using the built-in list"
  CF_RANGES="$CF_FALLBACK"
fi
for range in $CF_RANGES; do echo "set_real_ip_from ${range};"; done > "${CF_TRUSTED}.tmp"
mv "${CF_TRUSTED}.tmp" "$CF_TRUSTED"

# True when every address given is inside a Cloudflare edge range, i.e. the
# hostname is proxied (orange cloud) rather than pointed somewhere else.
behind_cloudflare() {
  python3 - "$CF_RANGES" "$@" <<'PY'
import ipaddress, sys
ranges = [ipaddress.ip_network(r) for r in sys.argv[1].split()]
addresses = [ipaddress.ip_address(a) for a in sys.argv[2:]]
sys.exit(0 if addresses and all(any(a in r for r in ranges) for a in addresses) else 1)
PY
}

# Copied, not symlinked: certbot edits this file in place to add the TLS
# server blocks, and a symlink would have it writing into the git working tree.
install -m 644 "$REPO_CONF" "/etc/nginx/sites-available/${SITE_NAME}"
ln -sf "/etc/nginx/sites-available/${SITE_NAME}" "/etc/nginx/sites-enabled/${SITE_NAME}"

# The stock default site also answers on :80 and would win for any hostname we
# do not explicitly match.
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx

# The file just installed is plain :80 (certbot adds the TLS blocks), so
# reloading it on its own would take HTTPS down until certbot runs below — and
# certbot is skipped when the DNS check or CERTBOT_EMAIL fails, which left the
# site on HTTP only. When a certificate already exists, put it straight back:
# `certbot install` only edits the nginx config (no Let's Encrypt request, so
# no rate limit), and the site is on HTTPS again before anything else runs.
CERT_NAME=pitchmyweb.in
if [ -d "/etc/letsencrypt/live/${CERT_NAME}" ]; then
  step "re-apply existing certificate"
  certbot install --nginx --cert-name "$CERT_NAME" --redirect --non-interactive \
    || { echo "::error::could not re-apply the TLS certificate to nginx" >&2; exit 1; }
fi
nginx -t
systemctl reload nginx

step "dns check"
ready=1
for d in "${DOMAINS[@]}"; do
  resolved="$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if [ -z "$resolved" ]; then
    echo "  $d -> no A record"
    ready=0
  elif [ -n "$MY_IP" ] && echo "$resolved" | grep -qw "$MY_IP"; then
    echo "  $d -> $resolved OK"
    CERT_DOMAIN_ARGS+=(-d "$d")
  elif behind_cloudflare $resolved; then
    # Proxied (orange cloud): Cloudflare answers with its own edge addresses
    # and forwards the HTTP-01 challenge here like any other request.
    # `certbot renew --dry-run` is the proof that it arrives.
    echo "  $d -> $resolved (Cloudflare proxy) OK"
    CERT_DOMAIN_ARGS+=(-d "$d")
  elif [ -n "$MY_IP" ]; then
    echo "  $d -> $resolved (not this instance, not Cloudflare)"
    ready=0
  else
    echo "  $d -> $resolved OK"
    CERT_DOMAIN_ARGS+=(-d "$d")
  fi
done

if [ "$ready" -ne 1 ]; then
  echo
  echo "Skipping certbot: every hostname must resolve to ${MY_IP:-this instance}, or to"
  echo "Cloudflare's proxy in front of it, first. Run infrastructure/cloudflare/sync-dns.sh."
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
