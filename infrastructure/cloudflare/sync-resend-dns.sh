#!/usr/bin/env bash
# Make Cloudflare DNS hold exactly the records Resend asks for pitchmyweb.in,
# and touch nothing else.
#
#   export CLOUDFLARE_API_TOKEN=...        # DNS Edit on the zone; never an argument
#   bash infrastructure/cloudflare/sync-resend-dns.sh            # dry run, default
#   bash infrastructure/cloudflare/sync-resend-dns.sh --apply    # make the changes
#
# The records come from Resend itself (`resend domains get`, so the Resend CLI
# must be logged in: `resend login`), never typed in here — a DKIM key Resend
# rotates, or a region move, is picked up by running this again.
#
# Per record Resend lists (DKIM TXT, the SPF/bounce CNAMEs, MX if any):
#   missing                  created, DNS only
#   present, same value      left alone
#   present, other value     updated in place (the one record of that name
#                            and type; its id is kept)
#   several of that name     reported and skipped: which one is right is a
#                            human decision, and nothing is ever deleted
# Mail records must never be proxied, so any that is gets proxied=false.
# No apex SPF, DMARC, MX or app record is read or written: Resend's SPF lives
# on its own subdomains, and DMARC is already in place.
#
# After an --apply that changed anything, Resend is asked to re-verify.

set -euo pipefail

# The native Windows jq.exe ends every line it prints with CRLF. Command
# substitution drops the CR, but `jq ... | while read` keeps it on the last
# field, and from there it reaches comparisons and DNS record content.
jq() { command jq "$@" | tr -d '\r'; }

ZONE_NAME="${ZONE_NAME:-pitchmyweb.in}"
RESEND="${RESEND_CLI:-resend}"
API="https://api.cloudflare.com/client/v4"

APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1

: "${CLOUDFLARE_API_TOKEN:?set it in your shell: export CLOUDFLARE_API_TOKEN=...}"
command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }
command -v "$RESEND" >/dev/null || { echo "Resend CLI not found (set RESEND_CLI to its path)" >&2; exit 1; }

cf() { curl -fsS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" "$@"; }

# Comparable form of a record value: TXT quotes and chunk breaks, trailing
# dots and letter case make no difference to what it means.
norm() { tr -d '"' <<<"$1" | tr -s ' ' | sed -e 's/\.$//' -e 's/^ //' -e 's/ $//' | tr '[:upper:]' '[:lower:]'; }

DOMAIN_ID="$("$RESEND" domains list --json | jq -r --arg n "$ZONE_NAME" '(.data // .)[] | select(.name == $n) | .id' | head -1)"
[ -n "$DOMAIN_ID" ] || { echo "${ZONE_NAME} is not a domain in this Resend account (resend domains list)" >&2; exit 1; }
DOMAIN="$("$RESEND" domains get "$DOMAIN_ID" --json)"
echo "Resend: ${ZONE_NAME} is $(jq -r '.status' <<<"$DOMAIN") (region $(jq -r '.region' <<<"$DOMAIN"))"

ZONE_ID="$(cf "${API}/zones?name=${ZONE_NAME}" | jq -r '.result[0].id // empty')"
[ -n "$ZONE_ID" ] || { echo "zone ${ZONE_NAME} not found, or the token cannot see it" >&2; exit 1; }

[ "$APPLY" -eq 1 ] && echo "APPLYING to ${ZONE_NAME}" || echo "DRY RUN on ${ZONE_NAME} (re-run with --apply)"
echo

changed=0
conflicts=0
while IFS= read -r record; do
  type="$(jq -r '.type' <<<"$record")"
  name="$(jq -r '.name' <<<"$record")"
  value="$(jq -r '.value' <<<"$record")"
  priority="$(jq -r '.priority // empty' <<<"$record")"
  case "$name" in ""|"@") fqdn="$ZONE_NAME" ;; *"$ZONE_NAME") fqdn="$name" ;; *) fqdn="${name}.${ZONE_NAME}" ;; esac

  existing="$(cf "${API}/zones/${ZONE_ID}/dns_records?type=${type}&name=${fqdn}&per_page=50" | jq -c '.result')"
  count="$(jq 'length' <<<"$existing")"
  body="$(jq -nc --arg t "$type" --arg n "$fqdn" --arg c "$value" --arg p "$priority" \
    '{type:$t, name:$n, content:$c, ttl:1, proxied:false} + (if $p == "" then {} else {priority: ($p | tonumber)} end)')"

  if [ "$count" -eq 0 ]; then
    echo "create  ${type} ${fqdn} -> ${value:0:60}"
    changed=1
    [ "$APPLY" -eq 1 ] && cf -X POST "${API}/zones/${ZONE_ID}/dns_records" --data "$body" >/dev/null
  elif [ "$count" -gt 1 ]; then
    echo "SKIP    ${type} ${fqdn}: ${count} records of that name; leaving them for a person to sort out" >&2
    conflicts=1
  else
    id="$(jq -r '.[0].id' <<<"$existing")"
    current="$(jq -r '.[0].content' <<<"$existing")"
    proxied="$(jq -r '.[0].proxied // false' <<<"$existing")"
    if [ "$(norm "$current")" = "$(norm "$value")" ] && [ "$proxied" != "true" ]; then
      echo "ok      ${type} ${fqdn}"
    else
      echo "update  ${type} ${fqdn}: ${current:0:60} (proxied=${proxied}) -> ${value:0:60} (DNS only)"
      changed=1
      [ "$APPLY" -eq 1 ] && cf -X PUT "${API}/zones/${ZONE_ID}/dns_records/${id}" --data "$body" >/dev/null
    fi
  fi
done < <(jq -c '.records[] | {type, name, value, priority}' <<<"$DOMAIN")

echo
if [ "$APPLY" -eq 1 ] && [ "$changed" -eq 1 ]; then
  "$RESEND" domains verify "$DOMAIN_ID" --json >/dev/null && echo "Asked Resend to re-verify; check with: resend domains get ${DOMAIN_ID}"
elif [ "$APPLY" -eq 0 ] && [ "$changed" -eq 1 ]; then
  echo "Nothing changed. Re-run with --apply to make these changes."
else
  echo "DNS already matches what Resend asks for."
fi
[ "$conflicts" -eq 0 ]
