# Production setup (pitchmyweb.in)

Target architecture, decided 2026-09-20:

```
Cloudflare DNS (pitchmyweb.in)
  ├── @       →  EC2 elastic IP   →  nginx :443  →  pmw-web    :3000
  ├── api     →  EC2 elastic IP   →  nginx :443  →  pmw-api    :4000
  ├── preview →  EC2 elastic IP   →  nginx :443  →  pmw-sites  :3200
  └── clerk   →  Clerk (CNAME, DNS only — never proxied)

EC2 t3.large (2 vCPU / 8 GB, ap-south-1), PM2 running 8 processes
  RDS PostgreSQL          (managed)
  ElastiCache Redis       (managed)
  S3                      (recordings + posters)
```

The hard rule throughout: **`sk_live_` keys live only in the server's
environment.** Never in a `.env` file in this repo, never in
`apps/web/.env.local`. A production Clerk instance only works on its registered
domain, so live keys locally break local sign-in and gain nothing. Local stays
on `pk_test_` permanently.

## Why three web apps

| App | Port | Reached by | Serves |
|---|---|---|---|
| `apps/web` | 3000 | customers | dashboard, marketing, admin |
| `apps/api` | 4000 | web app + all five workers | every `/api/*` route |
| `apps/sites` | 3200 | **strangers** | `/s/<slug>` demo sites sent over WhatsApp |

They are not merged. On one EC2 box three apps are three PM2 processes and cost
nothing extra; app count only drives cost on per-service platforms like
Fargate. `apps/sites` stays on its own hostname regardless — it is the only
surface the public touches, and a separate origin keeps it away from the
dashboard's session cookie.

## Processes

`ecosystem.config.cjs` at the repo root defines all eight. The five workers are
as load-bearing as the web apps; without them the dashboard looks healthy while
campaigns quietly stop:

| Process | Missing it means |
|---|---|
| `pmw-whatsapp` | nothing sends |
| `pmw-discovery` | searches sit queued forever |
| `pmw-recorder` | no demo videos, so pitches link to nothing |
| `pmw-verification` | every business stays UNVERIFIED forever |
| `pmw-jobs` | stuck runs never expire, failed pitches never retry |

`pmw-jobs` must stay a single instance — two schedulers double every job run.

## Environment

The web app proxies `/api/*` to `API_URL`, keeping the session cookie
same-origin. Keep that; do not point the browser at `api.pitchmyweb.in`
directly.

### apps/web

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...     # public by design
CLERK_SECRET_KEY=sk_live_...                      # secret
CLERK_FRONTEND_API_URL=https://clerk.pitchmyweb.in
API_URL=http://127.0.0.1:4000                     # same box; see "Client addresses"
SITES_PUBLIC_URL=https://preview.pitchmyweb.in    # build time: sample-site links
APP_ENV=production
```

`APP_ENV=production` makes `next build` refuse a `pk_test_` key, and refuse to
build without `SITES_PUBLIC_URL` (or `NEXT_PUBLIC_SITES_URL`): the home page's
sample sites link to it, and are inlined at build time, so a build without it
ships every one of them pointing at `localhost`. It is the same value apps/api
and apps/sites already need, so one SSM parameter serves all three.

### apps/api

```
CLERK_SECRET_KEY=sk_live_...        # the SAME key as apps/web
APP_URL=https://pitchmyweb.in
SITES_PUBLIC_URL=https://preview.pitchmyweb.in
API_INTERNAL_URL=https://api.pitchmyweb.in
APP_ENV=production
DATABASE_URL=...                    # RDS, private subnet
REDIS_URL=...                       # ElastiCache, private subnet
RATE_LIMIT_STORE=redis              # required — see below
INTERNAL_JOBS_SECRET=...
WA_AUTH_ENCRYPTION_KEY=...          # decrypts stored WhatsApp credentials
STORAGE_*=...                       # S3 bucket, not local MinIO
```

**`RATE_LIMIT_STORE=redis` is required.** Under `APP_ENV=production` the API
refuses the per-process memory store, so without it every rate-limited route —
sign-in, sign-up, checkout, and the preview content apps/sites reads — answers
503 "Temporary protection unavailable".

### apps/sites

```
SITES_PUBLIC_URL=https://preview.pitchmyweb.in   # absolute link-preview (og:image) URLs
API_INTERNAL_URL=https://api.pitchmyweb.in       # where preview content is read from
APP_URL=https://pitchmyweb.in                    # may embed /demo pages in an iframe
```

`SITES_PUBLIC_URL` is the same value apps/api uses to build preview links.
Without it the card WhatsApp shows under a pitch link points at `localhost`
and the preview arrives as bare text.

A web/API Clerk key mismatch is the most common first-deploy failure: every
social sign-in fails verification and dead-ends at `/login`. The route logs
which instance its key belongs to when that happens.

**`WA_AUTH_ENCRYPTION_KEY` is not regenerable.** WhatsApp auth state is stored
encrypted in Postgres under it; lose it and every linked account must re-pair.

Load secrets from SSM Parameter Store at boot rather than committing a `.env`
to the box. The instance role needs `kms:Decrypt` plus **both** parameter ARN
forms: `GetParameter` authorises against each parameter and matches
`parameter/pitchmyweb/prod/*`, while `GetParametersByPath` authorises against
the bare path `parameter/pitchmyweb/prod`, which the wildcard does not cover.
With only the wildcard the call fails as AccessDenied naming a resource that
looks like it should already be granted.

### Lead discovery (apps/discovery-worker)

```
LEAD_PROVIDER=serper                # apps/api — the default, so it may be omitted
DISCOVERY_SOURCE=serper             # apps/discovery-worker — must match the above
SERPER_API_KEY=...                  # secret; https://serper.dev/api-key
OPENAI_API_KEY=sk-...               # optional — AI insights on each lead
```

Both processes read the same `/etc/pitchmyweb/env`, so one `SERPER_API_KEY`
parameter serves both halves. Add it as a SecureString under the same path as
every other secret — the name *is* the variable name:

```bash
aws ssm put-parameter --region ap-south-1 \n  --name /pitchmyweb/prod/SERPER_API_KEY --type SecureString \n  --value "$SERPER_KEY" --overwrite
```

`LEAD_PROVIDER` and `DISCOVERY_SOURCE` both default to `serper` in code, so
neither needs a parameter; set them only to move an environment back to `osm`,
and set them **together** — apps/api decides *that* a search runs and the
worker decides *how*, so a half-flip silently searches the wrong source.

`SERPER_API_KEY` is required: `pmw-discovery` refuses to boot without it and
pm2 will restart-loop it, which shows up as searches sitting queued forever
rather than as a failure on the dashboard. `OPENAI_API_KEY` is not — without it
leads still arrive, just with no summary/services/outreach message attached.

### Two values that must be exactly right

```
DATABASE_URL=postgresql://…/pitchmyweb?sslmode=require
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-ca.pem
STORAGE_ENDPOINT=https://s3.ap-south-1.amazonaws.com    # scheme required
```

**RDS enforces TLS** (`rds.force_ssl=1` in `default.postgres15`) and presents a
certificate from Amazon's own CA, which Node does not trust. The workers reach
Postgres through Prisma's `pg` driver adapter, which — unlike `prisma migrate`
and `psql` — neither negotiates TLS on its own nor knows that CA. Both halves
are needed: without `sslmode` the connection is refused outright, and with it
but no CA the handshake fails on `self-signed certificate in certificate
chain`. Migrations apply cleanly either way, so the database looks healthy
while every worker crash-loops. `bootstrap.sh` fetches the regional bundle.

**`STORAGE_ENDPOINT` needs its scheme.** Without `https://` the S3 client
rejects it as `Invalid URL` and the recorder cannot start.

**Demo videos are kept for `VIDEO_RETENTION_DAYS` (default 7).** The recorder
stamps each recording's deadline, the dashboard and the public video page stop
serving it after that, and `pipeline-maintenance` deletes the objects. The
bucket is versioned, so a delete alone only adds a delete marker;
`aws_s3_bucket_lifecycle_configuration.storage` in `infrastructure/aws` is what
removes the old versions (a day later) and expires anything the job missed.
Keep its `recording_retention_days` equal to `VIDEO_RETENTION_DAYS`.

Static `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` are **not** set here. They
exist for MinIO and R2; on EC2 the instance role already grants S3, and
`packages/storage` omits the credentials option when they are absent so the
SDK uses its default provider chain.

## DNS (do this first — propagation takes up to 48h)

Clerk generates its records per instance; copy them exactly off the Domains
page. Three things reliably go wrong:

1. **Cloudflare proxying.** Every Clerk record must be **DNS only** (grey
   cloud). Clerk's validation fails behind the proxy.
2. **CAA records.** If the domain has any, they must allow Let's Encrypt and
   Google Trust Services or certificate issuance hangs. Check with
   `nslookup -type=CAA pitchmyweb.in`.
3. **Deploy certificates.** A button appears on the Clerk dashboard home once
   records validate. Production auth does not work until it is pressed.

## Deploying

Source reaches the box as a `git archive` tarball through S3, not a clone.
The repository belongs to the `ClaxonAI` account while the work happens as a
collaborator, and a fine-grained token only reaches repositories its creator
owns — so no token issued from the operating account can read it. The
instance role already grants S3, so nothing on the box needs a GitHub
credential. Switching back to cloning needs only a working credential and
`SOURCE_S3` left unset; a classic token honours collaborator access where a
fine-grained one cannot.

```bash
# from a checkout, to ship the current commit
git archive --format=tar.gz -o /tmp/pmw.tar.gz HEAD
aws s3 cp /tmp/pmw.tar.gz s3://pitchmyweb-prod-recordings-claxonai/deploy/current.tar.gz

# on the box — idempotent, so this is also the redeploy path
sudo SOURCE_S3=s3://…/deploy/current.tar.gz bash infrastructure/aws/bootstrap.sh
```

`bootstrap.sh` installs the aws CLI, Node, pm2 and Chromium's libraries — none
of which the stock Ubuntu image carries — then loads secrets, migrates,
builds, starts pm2 and configures nginx.

The tarball is extracted *over* the existing tree so `node_modules` and build
output survive, which means extraction alone can never delete anything. Each
deploy therefore records the paths it laid down in
`/var/lib/pitchmyweb/deployed-files`, and the next one removes those the new
tarball no longer contains. Only files a previous deploy created are ever
deleted — anything untracked was never in a manifest. Without this a file
deleted upstream lives on forever, and for a route file that means a deleted
endpoint keeps being served: `/api/webhooks/razorpay` answered for a release
after the payment-link code was removed from the repository.

Run it through `ssm send-command` and the shell it lands in has no `HOME` at
all. That matters because pm2 keeps its daemon state under `$HOME/.pm2` and
`bootstrap.sh` reaches pm2 through `sudo --preserve-env`, which carries the
caller's `HOME` rather than the app user's: with none to carry, pm2 resolved
`/root/.pm2`, failed with `EACCES` as the app user, and killed the deploy at
the last step — after the new build was swapped in but before anything
restarted, so the box kept serving the old build and looked healthy. The
script now sets `PM2_HOME` explicitly on every pm2 call, which outranks
`HOME`; do not replace those calls with bare `pm2`.

`HOME` itself is pinned for the same reason, by the `as_app`/`as_app_path`
helpers every command the script runs as the app user goes through. Anything
that caches under `~` is otherwise pointed at root's home: Playwright installs
and then looks for its browsers in `$HOME/.cache/ms-playwright`, so with
`HOME=/root` the recorder and verification workers crash-looped on
`browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/...`
while the browsers sat correctly installed under `/home/ubuntu`. pm2 hands its
own environment to the processes it spawns, so a wrong `HOME` in this script
reaches every worker. Run new commands through those helpers rather than a
bare `sudo -u`.

One more thing the box accumulates: `next build` writes a type stub per route
under `.next/types`, `tsconfig.json` includes them, and the tarball deploy
keeps `.next` between releases. A route that *moves* upstream therefore leaves
a stub importing a source file the new release does not have, and the build
fails type-checking a page that is not in it — which is what moving `login/`
and `register/` under an `(auth)` route group did. The build step clears
`.next/types` first; it must not clear the rest of `.next`, which the running
server is still serving until the swap.

Shell scripts must keep LF endings (`.gitattributes` pins them). On Windows
`core.autocrlf` rewrites them and `git archive` carries that through, which
ships a tarball whose scripts die on `$'\r': command not found`.

nginx config is at `infrastructure/nginx/pitchmyweb.conf`. It disables
`proxy_buffering` on the two SSE endpoints — campaign progress and WhatsApp
linking both stream, and with buffering on they appear stuck at "Queued…" while
actually running fine.

### Client addresses

apps/api rate-limits sign-in, sign-up and checkout per client address, which it
reads from `X-Forwarded-For`. nginx is what makes that header trustworthy: it
sends the address it saw rather than appending to whatever the client supplied
(which let any caller choose a fresh rate-limit bucket per request).

The web app's `/api` proxy is the one extra hop. With `API_URL` on loopback it
goes straight to pmw-api and nothing more is needed — that is the recommended
setting, and it also skips a TLS round trip. With
`API_URL=https://api.pitchmyweb.in` the request leaves the box and re-enters
nginx from the instance's own public IP, so nginx has to trust that IP to
recover the real client. `setup-nginx.sh` writes it to
`/etc/nginx/pitchmyweb-trusted-proxies.conf` from instance metadata, and
refuses to install the site if it cannot while `API_URL` is not loopback —
otherwise every dashboard user would share one address and one rate limit.

Unknown hostnames, including the bare IP, get no response at all (`return
444`) rather than the dashboard.

## Order of execution

1. Clerk production instance for `pitchmyweb.in`
2. Clerk DNS records in Cloudflare (DNS only)
3. Clerk certificates deployed
4. Google / GitHub / Apple OAuth with **your own** credentials — production
   does not inherit Clerk's shared development ones, and social sign-in fails
   silently without this
5. VPC, RDS, ElastiCache, S3, EC2 + elastic IP
6. Secrets into SSM
7. **Back up the database**, then `npm run db:deploy`
8. Build and start under PM2 — *first time the live app is up*
9. nginx + certbot, verify all three hostnames
10. Open a `/s/<slug>` link from a phone on mobile data, not from the box
11. Razorpay live keys + live webhook, signature verification tested
12. Full smoke test, then launch

## Known gaps

- [ ] `npm audit` — 6 high-severity advisories, needing Prisma and Next major
      bumps. Do this on a branch, not before launch.
- [ ] Workers run via `tsx` rather than compiled JS. Works, but boots slower
      and keeps `tsx` as a production dependency.
- [ ] Single EC2 box is a single point of failure. The code is container-ready
      (Redis session locking, no local disk state), so moving to Fargate later
      is configuration, not a rewrite.
- [ ] No LLM is configured in production. The per-lead "analyze" and "pitch"
      actions answer 503 `AI_NOT_CONFIGURED` and natural-language campaign
      search falls back to the form: they need `OLLAMA_BASE_URL` and
      `OLLAMA_MODEL`, and nothing in this architecture runs Ollama. The
      campaign pipeline itself (discovery → site → recording → send) does
      not depend on it.
- [ ] `bootstrap.sh` never seeds, so the `Service` price table is empty unless
      someone ran `db:seed` by hand — and that seed also inserts eight demo
      businesses, which do not belong in production. The AI steps above read
      their price ranges from it.
- [ ] `setup-nginx.sh` re-copies `pitchmyweb.conf` on every deploy, replacing
      the TLS blocks certbot added. The certbot step later in the same run puts
      them back, but it is skipped when `CERTBOT_EMAIL` is unset or a DNS check
      fails — and HTTPS then stays off until it is re-run.
