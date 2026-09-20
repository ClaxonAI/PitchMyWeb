#!/usr/bin/env bash
# Point the app hostnames at the instance and take every Clerk record off the
# Cloudflare proxy.
#
#   export CLOUDFLARE_API_TOKEN=...        # never pass this as an argument
#   bash infrastructure/cloudflare/sync-dns.sh            # dry run, default
#   bash infrastructure/cloudflare/sync-dns.sh --apply    # make the changes
#
# The token needs Zone:DNS:Edit on pitchmyweb.in and nothing more. Read from
# the environment so it stays out of shell history and out of any transcript.
#
# Dry run by default because this rewrites live DNS for a real domain.
#
# Why everything ends up grey-clouded:
#
#   Clerk records  Clerk validates them with a DNS check and serves the
#                  Frontend API under its own certificate. Behind Cloudflare's
#                  proxy the answer is an edge address and Cloudflare
#                  terminates TLS, so the handshake breaks at sign-in even
#                  though the dashboard still reports the record verified.
#
#   App records    certbot's HTTP-01 challenge has to reach nginx on port 80.
#                  Proxied it does not arrive, and Let's Encrypt allows only 5
#                  failed authorisations per hostname per hour.
#
# The proxy can go back on for the app records afterwards, with SSL set to
# Full (strict). Clerk's records must stay DNS only permanently.

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-pitchmyweb.in}"
TARGET_IP="${TARGET_IP:-13.207.140.42}"
API="https://api.cloudflare.com/client/v4"

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

: "${CLOUDFLARE_API_TOKEN:?set it in your shell: export CLOUDFLARE_API_TOKEN=...}"
command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

cf() { curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" "$@"; }

ZONE_ID="$(cf "${API}/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')"
[ -n "$ZONE_ID" ] || { echo "zone ${ZONE_NAME} not found, or the token cannot see it" >&2; exit 1; }

[ "$APPLY" -eq 1 ] && echo "APPLYING to ${ZONE_NAME}" || echo "DRY RUN on ${ZONE_NAME} (re-run with --apply)"
echo

records="$(cf "${API}/zones/${ZONE_ID}/dns_records?per_page=200")"

# --- app hostnames: A -> instance, unproxied -------------------------------
for host in "$ZONE_NAME" "www.${ZONE_NAME}" "api.${ZONE_NAME}" "sites.${ZONE_NAME}"; do
  existing="$(echo "$records" | jq -r --arg n "$host" '.result[] | select(.name==$n) | "\(.id) \(.type) \(.content) \(.proxied)"' | head -1)"
  read -r id type content proxied <<<"${existing:-}"

  if [ -n "${id:-}" ] && [ "$type" = "A" ] && [ "$content" = "$TARGET_IP" ] && [ "$proxied" = "false" ]; then
    echo "ok      ${host} -> A ${TARGET_IP} (DNS only)"
    continue
  fi

  body="$(jq -nc --arg n "$host" --arg c "$TARGET_IP" '{type:"A",name:$n,content:$c,ttl:1,proxied:false}')"
  if [ -n "${id:-}" ]; then
    echo "update  ${host}: ${type} ${content} proxied=${proxied} -> A ${TARGET_IP} DNS only"
    [ "$APPLY" -eq 1 ] && cf -X PUT "${API}/zones/${ZONE_ID}/dns_records/${id}" --data "$body" >/dev/null
  else
    echo "create  ${host}: A ${TARGET_IP} DNS only"
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
[ "$APPLY" -eq 1 ] && echo "Done. Verify: nslookup api.${ZONE_NAME} 8.8.8.8" \
                   || echo "Nothing changed. Re-run with --apply to make these changes."
