#!/usr/bin/env bash
# Everything on Cloudflare except DNS records (sync-dns.sh owns those), plus
# the SSM parameters the apps need to use it.
#
#   export CLOUDFLARE_API_TOKEN=...                               # never an argument
#   bash infrastructure/cloudflare/configure.sh                   # dry run, default
#   bash infrastructure/cloudflare/configure.sh --apply           # make the changes
#   bash infrastructure/cloudflare/configure.sh --apply --only access,turnstile
#
# Sections, each safe to re-run (it converges rather than duplicates):
#
#   settings   SSL Full (strict) after checking the origin's certificate,
#              TLS 1.2 minimum, TLS 1.3, HTTP/3, Automatic HTTPS Rewrites;
#              Rocket Loader and Email Obfuscation off (both rewrite the HTML
#              Next.js hydrates, which breaks the page). Always Use HTTPS
#              off: nginx already redirects to HTTPS and sends HSTS, and
#              Cloudflare's own redirect would bounce certbot's HTTP-01
#              challenge away from port 80, where certbot answers it.
#   bots       Bot Fight Mode off. On this plan no rule can exempt anything
#              from it, and it challenges exactly what must never be: the
#              WhatsApp link-preview fetch of a /s/<slug> page.
#   waf        Custom rules, ours identified by ref so rules made by hand
#              stay: block scanner paths; close api.<zone> to the public
#              (browsers reach the API through the web app's /api proxy and
#              everything else runs on the box over loopback).
#   ratelimit  Sign-in, sign-up and checkout: 10 requests per 10s per address,
#              ahead of the app's own per-address limits.
#   dnssec     Signs the zone and prints the DS record for the registrar.
#   email      Email Routing: support@ and grievance@ forward to FORWARD_TO.
#   access     Cloudflare Access for /admin (the only way in; see
#              apps/api/src/lib/auth/cloudflare-access.ts): One-time PIN
#              login, a policy for ADMIN_EMAILS, the application itself.
#   turnstile  The widget for the password sign-up form.
#   analytics  Web Analytics, injected by the proxy (the web app's CSP
#              already allows its beacon).
#   ssm        Writes what the apps need to /pitchmyweb/prod: CF_ACCESS_*,
#              TURNSTILE_SECRET_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY and
#              API_INTERNAL_URL (loopback). Needs the AWS CLI; secrets go
#              through a private temp file, never argv or the screen.
#
# The token needs, on zone pitchmyweb.in: Zone Settings Edit, Zone WAF Edit,
# DNS Edit (DNSSEC), Email Routing Rules Edit, Bot Management Edit; on the
# account: Access: Apps and Policies Edit, Access: Organizations, Identity
# Providers, and Groups Edit, Turnstile Sites Edit, Email Routing Addresses
# Edit, Account Settings Edit (Web Analytics). A section whose permission is
# missing fails with Cloudflare's message and the rest carry on.
#
# After --apply, redeploy: the web app inlines the Turnstile site key at build
# time, and the API only turns the check on once it restarts with the secret.

set -euo pipefail

ZONE_NAME="${ZONE_NAME:-pitchmyweb.in}"
TARGET_IP="${TARGET_IP:-13.207.140.42}"
ADMIN_EMAILS="${ADMIN_EMAILS:-claxonai@gmail.com}"
FORWARD_TO="${FORWARD_TO:-claxonai@gmail.com}"
EMAIL_ALIASES="${EMAIL_ALIASES:-support grievance}"
SSM_PATH="${SSM_PATH:-/pitchmyweb/prod}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
API="https://api.cloudflare.com/client/v4"
ALL_SECTIONS="settings bots waf ratelimit dnssec email access turnstile analytics ssm"

APPLY=0
SECTIONS="$ALL_SECTIONS"
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --only) shift; SECTIONS="$(echo "${1:-}" | tr ',' ' ')" ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
for s in $SECTIONS; do
  case " $ALL_SECTIONS " in *" $s "*) ;; *) echo "unknown section: $s (one of: $ALL_SECTIONS)" >&2; exit 2 ;; esac
done

: "${CLOUDFLARE_API_TOKEN:?set it in your shell: export CLOUDFLARE_API_TOKEN=...}"
command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

# cf METHOD PATH [JSON] -> the response body on success. On failure prints
# Cloudflare's own error messages and returns 1, so callers say `|| return 1`.
cf() {
  local method="$1" path="$2" out
  local args=(-sS -X "$method" -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")
  [ $# -ge 3 ] && args+=(--data "$3")
  out="$(curl "${args[@]}" "${API}${path}")" || { echo "    ${method} ${path}: request failed" >&2; return 1; }
  if [ "$(jq -r '.success // false' <<<"$out" 2>/dev/null)" != "true" ]; then
    echo "    ${method} ${path}: $(jq -r '[.errors[]? | "\(.code): \(.message)"] | join("; ")' <<<"$out" 2>/dev/null || head -c 300 <<<"$out")" >&2
    return 1
  fi
  printf '%s' "$out"
}

# Say what is (or would be) done. Returns 0 when the caller should go ahead.
change() {
  if [ "$APPLY" -eq 1 ]; then echo "  change  $*"; return 0; fi
  echo "  would   $*"
  return 1
}
ok() { echo "  ok      $*"; }
note() { echo "  note    $*"; }

ZONE_JSON="$(cf GET "/zones?name=${ZONE_NAME}")" || exit 1
ZONE_ID="$(jq -r '.result[0].id // empty' <<<"$ZONE_JSON")"
ACCOUNT_ID="$(jq -r '.result[0].account.id // empty' <<<"$ZONE_JSON")"
[ -n "$ZONE_ID" ] || { echo "zone ${ZONE_NAME} not found, or the token cannot see it" >&2; exit 1; }

# Values later sections hand to ssm.
ACCESS_TEAM_DOMAIN=""
ACCESS_AUD=""
TURNSTILE_SITEKEY=""
TURNSTILE_SECRET=""

# --- settings -----------------------------------------------------------------
set_setting() {
  local id="$1" want="$2" current
  current="$(cf GET "/zones/${ZONE_ID}/settings/${id}" | jq -r '.result.value')" || return 1
  if [ "$current" = "$want" ]; then ok "${id} = ${want}"; return 0; fi
  change "${id}: ${current} -> ${want}" || return 0
  cf PATCH "/zones/${ZONE_ID}/settings/${id}" "$(jq -nc --arg v "$want" '{value:$v}')" >/dev/null
}

# Full (strict) makes Cloudflare verify the origin's certificate; if it does
# not cover a hostname, that hostname answers 526 to everyone. So check the
# origin directly first. Once the security group admits only Cloudflare this
# box cannot reach it any more: SKIP_ORIGIN_CHECK=1 then, as the check passed
# before the lock.
origin_certificate_ok() {
  [ "${SKIP_ORIGIN_CHECK:-0}" = "1" ] && { note "origin certificate check skipped (SKIP_ORIGIN_CHECK=1)"; return 0; }
  local host failed=0
  for host in "$ZONE_NAME" "www.${ZONE_NAME}" "api.${ZONE_NAME}" "preview.${ZONE_NAME}"; do
    if curl -sS --max-time 10 --resolve "${host}:443:${TARGET_IP}" "https://${host}/" >/dev/null 2>&1; then
      ok "origin ${TARGET_IP} has a valid certificate for ${host}"
    else
      echo "    origin ${TARGET_IP} did not present a valid certificate for ${host} (or could not be reached)" >&2
      failed=1
    fi
  done
  return "$failed"
}

section_settings() {
  local failed=0
  if origin_certificate_ok; then
    set_setting ssl strict || failed=1
  else
    echo "    leaving SSL mode alone: strict would turn those hostnames into 526 errors" >&2
    failed=1
  fi
  set_setting min_tls_version 1.2 || failed=1
  set_setting tls_1_3 on || failed=1
  set_setting http3 on || failed=1
  set_setting automatic_https_rewrites on || failed=1
  set_setting always_use_https off || failed=1
  set_setting rocket_loader off || failed=1
  set_setting email_obfuscation off || failed=1
  return "$failed"
}

# --- bots ---------------------------------------------------------------------
section_bots() {
  local fight
  fight="$(cf GET "/zones/${ZONE_ID}/bot_management" | jq -r '.result.fight_mode // false')" || return 1
  if [ "$fight" != "true" ]; then ok "Bot Fight Mode off"; return 0; fi
  change "Bot Fight Mode: on -> off" || return 0
  cf PUT "/zones/${ZONE_ID}/bot_management" '{"fight_mode":false}' >/dev/null
}

# --- waf / ratelimit ------------------------------------------------------------
# Replaces the rules we own (by ref) in a phase's entry point and keeps every
# other rule as it is. Only the writable fields are sent back.
sync_phase() {
  local phase="$1" ours="$2" current existing refs merged errors
  errors="$(mktemp)"
  if current="$(cf GET "/zones/${ZONE_ID}/rulesets/phases/${phase}/entrypoint" 2>"$errors")"; then
    existing="$(jq -c '.result.rules // []' <<<"$current")"
  elif grep -q "10003" "$errors"; then
    existing="[]" # no entry point yet; the PUT below creates it
  else
    # Anything else (no permission, network) must stop here: the PUT replaces
    # the whole list, so going on as if it were empty would delete every rule
    # made by hand.
    cat "$errors" >&2
    rm -f "$errors"
    return 1
  fi
  rm -f "$errors"
  refs="$(jq -c '[.[].ref]' <<<"$ours")"
  merged="$(jq -c --argjson ours "$ours" --argjson refs "$refs" '
    [ .[] | select((.ref // "") as $r | $refs | index($r) | not)
          | {id, ref, description, expression, action, action_parameters, enabled, logging, ratelimit}
          | with_entries(select(.value != null)) ] + $ours' <<<"$existing")"

  # Per rule: "ok" when Cloudflare already has it as written here, otherwise
  # the description of what changes. Cloudflare adds defaults of its own to a
  # stored rule, so only the fields set here are compared.
  local plan
  plan="$(jq -r --argjson have "$existing" '
    def norm: {description, expression, action, enabled: (.enabled // true),
               ratelimit: (.ratelimit | if . == null then null
                 else {characteristics: (.characteristics | sort), period, requests_per_period, mitigation_timeout} end)};
    .[] | . as $want
    | ([$have[] | select(.ref == $want.ref)][0]) as $cur
    | if $cur == null then "add \($want.description)"
      elif ($cur | norm) == ($want | norm) then "ok \($want.description)"
      else "update \($want.description)" end' <<<"$ours")"

  local line pending=0
  while IFS= read -r line; do
    case "$line" in
      "ok "*) ok "${line#ok }" ;;
      *) pending=1; change "$line" || true ;;
    esac
  done <<<"$plan"
  [ "$pending" -eq 1 ] && [ "$APPLY" -eq 1 ] || return 0
  cf PUT "/zones/${ZONE_ID}/rulesets/phases/${phase}/entrypoint" "$(jq -nc --argjson r "$merged" '{rules:$r}')" >/dev/null
}

section_waf() {
  local rules
  rules="$(jq -nc --arg api "api.${ZONE_NAME}" '[
    {
      ref: "pmw_block_scanners",
      description: "PitchMyWeb: block vulnerability scanners",
      action: "block",
      enabled: true,
      expression: "(http.request.uri.path contains \"/.env\") or (http.request.uri.path contains \"/.git\") or (http.request.uri.path contains \".php\") or (http.request.uri.path contains \"/wp-admin\") or (http.request.uri.path contains \"/wp-login\") or (http.request.uri.path contains \"/wp-content\") or (http.request.uri.path contains \"/wp-includes\") or (http.request.uri.path contains \"/phpmyadmin\") or (http.request.uri.path contains \"/cgi-bin\")"
    },
    {
      ref: "pmw_api_private",
      description: "PitchMyWeb: api hostname closed to the public (health check and ACME challenges excepted)",
      action: "block",
      enabled: true,
      expression: ("(http.host eq \"" + $api + "\" and http.request.uri.path ne \"/api/health\" and not http.request.uri.path contains \"/.well-known/acme-challenge/\")")
    }
  ]')"
  sync_phase http_request_firewall_custom "$rules"
}

section_ratelimit() {
  local rules
  rules="$(jq -nc '[
    {
      ref: "pmw_auth_ratelimit",
      description: "PitchMyWeb: sign-in, sign-up and checkout, 10 per 10s per address",
      action: "block",
      enabled: true,
      expression: "(http.request.uri.path eq \"/api/auth/login\") or (http.request.uri.path eq \"/api/auth/register\") or (http.request.uri.path eq \"/api/checkout/create-order\")",
      ratelimit: { characteristics: ["cf.colo.id", "ip.src"], period: 10, requests_per_period: 10, mitigation_timeout: 10 }
    }
  ]')"
  sync_phase http_ratelimit "$rules"
}

# --- dnssec -------------------------------------------------------------------
section_dnssec() {
  local status out
  out="$(cf GET "/zones/${ZONE_ID}/dnssec")" || return 1
  status="$(jq -r '.result.status' <<<"$out")"
  if [ "$status" = "disabled" ] || [ "$status" = "null" ]; then
    change "DNSSEC: ${status} -> active" || return 0
    out="$(cf PATCH "/zones/${ZONE_ID}/dnssec" '{"status":"active"}')" || return 1
    status="$(jq -r '.result.status' <<<"$out")"
  fi
  ok "DNSSEC ${status}"
  if [ "$status" != "active" ]; then
    note "Signing starts once the registrar publishes this DS record for ${ZONE_NAME}:"
    note "  $(jq -r '.result.ds // "(not generated yet; re-run in a few minutes)"' <<<"$out")"
    note "  key tag $(jq -r '.result.key_tag' <<<"$out"), algorithm $(jq -r '.result.algorithm' <<<"$out"), digest type $(jq -r '.result.digest_type' <<<"$out"), digest $(jq -r '.result.digest' <<<"$out")"
    note "Nothing changes for visitors until then. Remove that DS record before ever moving DNS off Cloudflare."
  fi
}

# --- email ----------------------------------------------------------------------
section_email() {
  local failed=0 routing enabled addresses verified rules alias
  routing="$(cf GET "/zones/${ZONE_ID}/email/routing")" || return 1
  enabled="$(jq -r '.result.enabled // false' <<<"$routing")"
  if [ "$enabled" = "true" ]; then
    ok "Email Routing enabled"
  elif change "enable Email Routing (adds Cloudflare's MX and SPF records)"; then
    cf POST "/zones/${ZONE_ID}/email/routing/dns" "$(jq -nc --arg n "$ZONE_NAME" '{name:$n}')" >/dev/null || failed=1
  fi

  addresses="$(cf GET "/accounts/${ACCOUNT_ID}/email/routing/addresses?per_page=50")" || return 1
  if jq -e --arg e "$FORWARD_TO" '.result[] | select(.email == $e)' <<<"$addresses" >/dev/null; then
    verified="$(jq -r --arg e "$FORWARD_TO" '.result[] | select(.email == $e) | .verified // empty' <<<"$addresses")"
    if [ -n "$verified" ]; then ok "destination ${FORWARD_TO} verified"; else note "destination ${FORWARD_TO} is waiting for the link Cloudflare emailed to it"; fi
  elif change "add destination ${FORWARD_TO} (Cloudflare emails it a verification link)"; then
    cf POST "/accounts/${ACCOUNT_ID}/email/routing/addresses" "$(jq -nc --arg e "$FORWARD_TO" '{email:$e}')" >/dev/null || failed=1
    note "open the verification email at ${FORWARD_TO}; nothing is forwarded until then"
  fi

  rules="$(cf GET "/zones/${ZONE_ID}/email/routing/rules?per_page=50")" || return 1
  for alias in $EMAIL_ALIASES; do
    local address="${alias}@${ZONE_NAME}"
    if jq -e --arg a "$address" '.result[] | select(any(.matchers[]?; .value == $a))' <<<"$rules" >/dev/null; then
      ok "${address} routed"
    elif change "route ${address} -> ${FORWARD_TO}"; then
      cf POST "/zones/${ZONE_ID}/email/routing/rules" "$(jq -nc --arg a "$address" --arg to "$FORWARD_TO" '{
        name: ("Forward " + $a), enabled: true,
        matchers: [{type: "literal", field: "to", value: $a}],
        actions: [{type: "forward", value: [$to]}]
      }')" >/dev/null || failed=1
    fi
  done
  return "$failed"
}

# --- access ---------------------------------------------------------------------
section_access() {
  local org idps policies policy_id apps app app_body include
  org="$(cf GET "/accounts/${ACCOUNT_ID}/access/organizations")" || {
    echo "    Zero Trust is not set up on this account. Open https://one.dash.cloudflare.com once," >&2
    echo "    choose a team name and the Free plan, then re-run with --only access,ssm." >&2
    return 1
  }
  ACCESS_TEAM_DOMAIN="$(jq -r '.result.auth_domain // empty' <<<"$org")"
  [ -n "$ACCESS_TEAM_DOMAIN" ] || { echo "    the Zero Trust organization has no team domain" >&2; return 1; }
  ok "team domain ${ACCESS_TEAM_DOMAIN}"

  # One-time PIN: a code emailed to the address, so no identity provider to
  # configure and nothing but the admin's inbox to protect.
  idps="$(cf GET "/accounts/${ACCOUNT_ID}/access/identity_providers")" || return 1
  if jq -e '.result[] | select(.type == "onetimepin")' <<<"$idps" >/dev/null; then
    ok "One-time PIN login available"
  elif change "add One-time PIN login"; then
    cf POST "/accounts/${ACCOUNT_ID}/access/identity_providers" '{"name":"One-time PIN","type":"onetimepin","config":{}}' >/dev/null || return 1
  fi

  include="$(tr ',' '\n' <<<"$ADMIN_EMAILS" | sed 's/^ *//; s/ *$//' | grep -v '^$' | jq -Rnc '[inputs | ascii_downcase | {email: {email: .}}]')"
  local policy_body
  policy_body="$(jq -nc --argjson inc "$include" '{name: "PitchMyWeb admins", decision: "allow", include: $inc, session_duration: "24h"}')"
  policies="$(cf GET "/accounts/${ACCOUNT_ID}/access/policies?per_page=100")" || return 1
  policy_id="$(jq -r '.result[] | select(.name == "PitchMyWeb admins") | .id' <<<"$policies" | head -1)"
  if [ -n "$policy_id" ]; then
    if [ "$(jq -c --arg id "$policy_id" '.result[] | select(.id == $id) | [.include[].email.email] | sort' <<<"$policies")" = "$(jq -c '[.[].email.email] | sort' <<<"$include")" ]; then
      ok "policy \"PitchMyWeb admins\" allows ${ADMIN_EMAILS}"
    elif change "policy \"PitchMyWeb admins\": allow ${ADMIN_EMAILS}"; then
      cf PUT "/accounts/${ACCOUNT_ID}/access/policies/${policy_id}" "$policy_body" >/dev/null || return 1
    fi
  elif change "create policy \"PitchMyWeb admins\" allowing ${ADMIN_EMAILS}"; then
    policy_id="$(cf POST "/accounts/${ACCOUNT_ID}/access/policies" "$policy_body" | jq -r '.result.id')" || return 1
  fi

  # /api/admin too, so the admin API is behind Access at the edge as well as
  # checked by the API itself.
  app_body="$(jq -nc --arg z "$ZONE_NAME" --arg p "${policy_id:-pending}" '{
    name: "PitchMyWeb admin", type: "self_hosted", domain: ($z + "/admin"),
    destinations: [{type: "public", uri: ($z + "/admin")}, {type: "public", uri: ($z + "/api/admin")}],
    session_duration: "24h", app_launcher_visible: false,
    policies: [{id: $p, precedence: 1}]
  }')"
  apps="$(cf GET "/accounts/${ACCOUNT_ID}/access/apps?per_page=100")" || return 1
  app="$(jq -c --arg d "${ZONE_NAME}/admin" '[.result[] | select(.domain == $d)][0] // empty' <<<"$apps")"
  if [ -n "$app" ]; then
    ACCESS_AUD="$(jq -r '.aud' <<<"$app")"
    local attached
    attached="$(jq -r --arg p "$policy_id" '[.policies[]?.id] | index($p) != null' <<<"$app")"
    local dests
    dests="$(jq -c '[.destinations[]?.uri] | sort' <<<"$app")"
    if [ "$attached" = "true" ] && [ "$dests" = "$(jq -c '[.destinations[].uri] | sort' <<<"$app_body")" ]; then
      ok "application ${ZONE_NAME}/admin (AUD ${ACCESS_AUD})"
    elif change "update application ${ZONE_NAME}/admin"; then
      cf PUT "/accounts/${ACCOUNT_ID}/access/apps/$(jq -r '.id' <<<"$app")" "$app_body" >/dev/null || return 1
    fi
  elif change "create application ${ZONE_NAME}/admin"; then
    ACCESS_AUD="$(cf POST "/accounts/${ACCOUNT_ID}/access/apps" "$app_body" | jq -r '.result.aud')" || return 1
    ok "application created (AUD ${ACCESS_AUD})"
  fi
}

# --- turnstile ------------------------------------------------------------------
section_turnstile() {
  local widgets sitekey out
  widgets="$(cf GET "/accounts/${ACCOUNT_ID}/challenges/widgets?per_page=100")" || return 1
  sitekey="$(jq -r '.result[] | select(.name == "PitchMyWeb sign-up") | .sitekey' <<<"$widgets" | head -1)"
  if [ -n "$sitekey" ]; then
    out="$(cf GET "/accounts/${ACCOUNT_ID}/challenges/widgets/${sitekey}")" || return 1
    ok "widget \"PitchMyWeb sign-up\" (${sitekey})"
  elif change "create Turnstile widget \"PitchMyWeb sign-up\" for ${ZONE_NAME}"; then
    out="$(cf POST "/accounts/${ACCOUNT_ID}/challenges/widgets" "$(jq -nc --arg z "$ZONE_NAME" '{name: "PitchMyWeb sign-up", domains: [$z], mode: "managed"}')")" || return 1
  else
    return 0
  fi
  TURNSTILE_SITEKEY="$(jq -r '.result.sitekey' <<<"$out")"
  TURNSTILE_SECRET="$(jq -r '.result.secret // empty' <<<"$out")"
  [ -n "$TURNSTILE_SECRET" ] || { echo "    Cloudflare did not return the widget's secret" >&2; return 1; }
}

# --- analytics ------------------------------------------------------------------
section_analytics() {
  local sites
  if sites="$(cf GET "/accounts/${ACCOUNT_ID}/rum/site_info/list?per_page=100" 2>/dev/null)" &&
     jq -e --arg z "$ZONE_ID" --arg n "$ZONE_NAME" '.result[]? | select(.ruleset.zone_tag == $z or .host == $n)' <<<"$sites" >/dev/null; then
    ok "Web Analytics on for ${ZONE_NAME}"
    return 0
  fi
  change "turn on Web Analytics for ${ZONE_NAME} (beacon injected by the proxy)" || return 0
  cf POST "/accounts/${ACCOUNT_ID}/rum/site_info" "$(jq -nc --arg z "$ZONE_ID" '{zone_tag: $z, auto_install: true}')" >/dev/null
}

# --- ssm ------------------------------------------------------------------------
# MSYS_NO_PATHCONV: Git Bash on Windows rewrites an argument starting with "/"
# into a Windows path before a native program sees it, so aws.exe and jq.exe
# would get the SSM name /pitchmyweb/prod/X as C:/Program Files/Git/pitchmyweb/prod/X.
put_param() {
  local name="$1" type="$2" value="$3" shown="$4" current tmp file
  current="$(MSYS_NO_PATHCONV=1 aws ssm get-parameter --region "$AWS_REGION" --name "${SSM_PATH}/${name}" --with-decryption --query Parameter.Value --output text 2>/dev/null | tr -d '\r' || true)"
  if [ "$current" = "$value" ]; then ok "${SSM_PATH}/${name}"; return 0; fi
  change "${SSM_PATH}/${name} = ${shown}" || return 0
  # Through a private file, so the value is never in argv (ps) or on screen.
  tmp="$(mktemp)"
  chmod 600 "$tmp"
  MSYS_NO_PATHCONV=1 jq -nc --arg n "${SSM_PATH}/${name}" --arg t "$type" --arg v "$value" '{Name:$n, Type:$t, Value:$v, Overwrite:true}' > "$tmp"
  file="$tmp"
  command -v cygpath >/dev/null && file="$(cygpath -m "$tmp")" # Windows aws.exe wants a Windows path
  aws ssm put-parameter --region "$AWS_REGION" --cli-input-json "file://${file}" >/dev/null || { rm -f "$tmp"; return 1; }
  rm -f "$tmp"
}

section_ssm() {
  command -v aws >/dev/null || { echo "    aws CLI not found" >&2; return 1; }
  local failed=0
  put_param API_INTERNAL_URL String "http://127.0.0.1:4000" "http://127.0.0.1:4000" || failed=1
  if [ -n "$ACCESS_TEAM_DOMAIN" ] && [ -n "$ACCESS_AUD" ]; then
    put_param CF_ACCESS_TEAM_DOMAIN String "$ACCESS_TEAM_DOMAIN" "$ACCESS_TEAM_DOMAIN" || failed=1
    put_param CF_ACCESS_AUD String "$ACCESS_AUD" "$ACCESS_AUD" || failed=1
  else
    note "CF_ACCESS_* not written: the access section did not produce them (run it too)"
  fi
  if [ -n "$TURNSTILE_SITEKEY" ] && [ -n "$TURNSTILE_SECRET" ]; then
    put_param NEXT_PUBLIC_TURNSTILE_SITE_KEY String "$TURNSTILE_SITEKEY" "$TURNSTILE_SITEKEY" || failed=1
    put_param TURNSTILE_SECRET_KEY SecureString "$TURNSTILE_SECRET" "(secret)" || failed=1
  else
    note "Turnstile keys not written: the turnstile section did not produce them (run it too)"
  fi
  return "$failed"
}

# --- run ------------------------------------------------------------------------
[ "$APPLY" -eq 1 ] && echo "APPLYING to ${ZONE_NAME}" || echo "DRY RUN on ${ZONE_NAME} (re-run with --apply)"
FAILED=()
for s in $ALL_SECTIONS; do
  case " $SECTIONS " in *" $s "*) ;; *) continue ;; esac
  echo
  echo "[$s]"
  if ! "section_$s"; then FAILED+=("$s"); echo "  FAILED  $s"; fi
done

echo
if [ "${#FAILED[@]}" -gt 0 ]; then
  # ssm writes what access and turnstile produce, so it reruns with them.
  RERUN=("${FAILED[@]}")
  case " ${FAILED[*]} " in *" access "*|*" turnstile "*) case " ${RERUN[*]} " in *" ssm "*) ;; *) RERUN+=(ssm) ;; esac ;; esac
  echo "Failed: ${FAILED[*]}. The messages above say why; fix and re-run with --only $(IFS=,; echo "${RERUN[*]}")."
  exit 1
fi
if [ "$APPLY" -eq 1 ]; then
  echo "Done. Redeploy so the apps pick up the SSM values: infrastructure\\aws\\deploy.ps1"
else
  echo "Nothing changed. Re-run with --apply to make these changes."
fi
