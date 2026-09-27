#!/usr/bin/env bash
# Point the app hostnames at the instance through Cloudflare's proxy, and take
# every Clerk record off it.
#
#   export CLOUDFLARE_API_TOKEN=...        # never pass this as an argument
#   bash infrastructure/cloudflare/sync-dns.sh                      # dry run, default
#   bash infrastructure/cloudflare/sync-dns.sh --apply              # make the changes
#   bash infrastructure/cloudflare/sync-dns.sh --apply --dns-only   # app records grey-clouded
#
# The token needs Zone:DNS:Edit on pitchmyweb.in and nothing more. Read from
# the environment so it stays out of shell history and out of any transcript.
#
# Dry run by default because this rewrites live DNS for a real domain.
#
#   Clerk records  DNS only, permanently. Clerk validates them with a DNS
#                  check and serves the Frontend API under its own
#                  certificate. Behind Cloudflare's proxy the answer is an
#                  edge address and Cloudflare terminates TLS, so the
#                  handshake breaks at sign-in even though the dashboard
#                  still reports the record verified.
#
#   App records    Proxied (orange cloud). That is what puts the WAF, the rate
#                  limit, DDoS protection and Access (the only way into
#                  /admin) in front of the site; grey-clouded, none of them
#                  sees a request. Before the first --apply:
#                    - the release on the box must trust Cloudflare's
#                      addresses (setup-nginx.sh writes them), or every
#                      visitor shares an edge address and one rate limit;
#                    - configure.sh must have run: SSL Full (strict), and
#                      Always Use HTTPS off so certbot's HTTP-01 challenge
#                      still reaches nginx on port 80 (Let's Encrypt allows
#                      only 5 failed authorisations per hostname per hour).
#                  The full order is in docs/production-setup.md, "Cloudflare".
#
#   --dns-only puts the app records back on the instance directly, e.g. to
#   rule Cloudflare out while debugging. Once origin_cloudflare_only is set in
#   Terraform the security group admits only Cloudflare, so undo that first or
#   the site goes dark.

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-pitchmyweb.in}"
TARGET_IP="${TARGET_IP:-13.207.140.42}"
API="https://api.cloudflare.com/client/v4"

APPLY=0
PROXIED=true
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --dns-only) PROXIED=false ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

: "${CLOUDFLARE_API_TOKEN:?set it in your shell: export CLOUDFLARE_API_TOKEN=...}"
command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

cf() { curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" "$@"; }

ZONE_ID="$(cf "${API}/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')"
[ -n "$ZONE_ID" ] || { echo "zone ${ZONE_NAME} not found, or the token cannot see it" >&2; exit 1; }

[ "$APPLY" -eq 1 ] && echo "APPLYING to ${ZONE_NAME}" || echo "DRY RUN on ${ZONE_NAME} (re-run with --apply)"
echo

records="$(cf "${API}/zones/${ZONE_ID}/dns_records?per_page=200")"

# --- app hostnames: A -> instance, proxied unless --dns-only ---------------
for host in "$ZONE_NAME" "www.${ZONE_NAME}" "api.${ZONE_NAME}" "preview.${ZONE_NAME}"; do
  existing="$(echo "$records" | jq -r --arg n "$host" '.result[] | select(.name==$n) | "\(.id) \(.type) \(.content) \(.proxied)"' | head -1)"
  read -r id type content proxied <<<"${existing:-}"

  if [ -n "${id:-}" ] && [ "$type" = "A" ] && [ "$content" = "$TARGET_IP" ] && [ "$proxied" = "$PROXIED" ]; then
    echo "ok      ${host} -> A ${TARGET_IP} (proxied=${PROXIED})"
    continue
  fi

  body="$(jq -nc --arg n "$host" --arg c "$TARGET_IP" --argjson p "$PROXIED" '{type:"A",name:$n,content:$c,ttl:1,proxied:$p}')"
  if [ -n "${id:-}" ]; then
    echo "update  ${host}: ${type} ${content} proxied=${proxied} -> A ${TARGET_IP} proxied=${PROXIED}"
    [ "$APPLY" -eq 1 ] && cf -X PUT "${API}/zones/${ZONE_ID}/dns_records/${id}" --data "$body" >/dev/null
  else
    echo "create  ${host}: A ${TARGET_IP} proxied=${PROXIED}"
    [ "$APPLY" -eq 1 ] && cf -X POST "${API}/zones/${ZONE_ID}/dns_records" --data "$body" >/dev/null
  fi
done

echo

# --- Clerk records: unproxy, leave the targets alone -----------------------
# Only the proxied flag is touched. Clerk generates the CNAME targets per
# instance, so rewriting content here risks replacing a correct value with a
# guessed one.
echo "$records" | jq -r --arg z "$ZONE_NAME" '
  .result[]
  | select(.type=="CNAME")
  | select(.name | test("^(clerk|accounts|clkmail|clk[0-9]*\\._domainkey)\\."))
  | "\(.id) \(.name) \(.proxied) \(.content)"' |
while read -r id name proxied content; do
  if [ "$proxied" = "false" ]; then
    echo "ok      ${name} -> ${content} (DNS only)"
  else
    echo "unproxy ${name} -> ${content}"
    if [ "$APPLY" -eq 1 ]; then
      body="$(jq -nc --arg n "$name" --arg c "$content" '{type:"CNAME",name:$n,content:$c,ttl:1,proxied:false}')"
      cf -X PUT "${API}/zones/${ZONE_ID}/dns_records/${id}" --data "$body" >/dev/null
    fi
  fi
done

echo
[ "$APPLY" -eq 1 ] && echo "Done. Verify: curl -sI https://${ZONE_NAME}/ | grep -i cf-ray" \
                   || echo "Nothing changed. Re-run with --apply to make these changes."
