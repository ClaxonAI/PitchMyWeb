# Production setup (pitchmyweb.in)

Target architecture, decided 2026-09-20:

```
Cloudflare DNS (pitchmyweb.in)
  ├── @       →  EC2 elastic IP   →  nginx :443  →  pmw-web    :3000
  ├── api     →  EC2 elastic IP   →  nginx :443  →  pmw-api    :4000
  ├── preview →  EC2 elastic IP   →  nginx :443  →  pmw-sites  :3200
  └── clerk   →  Clerk (CNAME, DNS only — never proxied)

EC2 t3.large (2 vCPU / 8 GB, ap-south-1), PM2 running 7 processes
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
| `apps/api` | 4000 | web app + all four workers | every `/api/*` route |
| `apps/sites` | 3200 | **strangers** | `/s/<slug>` demo sites sent over WhatsApp |

They are not merged. On one EC2 box three apps are three PM2 processes and cost
nothing extra; app count only drives cost on per-service platforms like
Fargate. `apps/sites` stays on its own hostname regardless — it is the only
surface the public touches, and a separate origin keeps it away from the
dashboard's session cookie.

## Processes

`ecosystem.config.cjs` at the repo root defines all seven. The four workers are
as load-bearing as the web apps; without them the dashboard looks healthy while
campaigns quietly stop:

| Process | Missing it means |
|---|---|
| `pmw-whatsapp` | nothing sends |
| `pmw-discovery` | searches sit queued forever |
| `pmw-recorder` | no demo videos, so pitches link to nothing |
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
API_URL=https://api.pitchmyweb.in
APP_ENV=production
```

`APP_ENV=production` makes `next build` refuse a `pk_test_` key.

### apps/api

```
CLERK_SECRET_KEY=sk_live_...        # the SAME key as apps/web
APP_URL=https://pitchmyweb.in
SITES_PUBLIC_URL=https://preview.pitchmyweb.in
API_INTERNAL_URL=https://api.pitchmyweb.in
APP_ENV=production
DATABASE_URL=...                    # RDS, private subnet
REDIS_URL=...                       # ElastiCache, private subnet
INTERNAL_JOBS_SECRET=...
WA_AUTH_ENCRYPTION_KEY=...          # decrypts stored WhatsApp credentials
STORAGE_*=...                       # S3 bucket, not local MinIO
```

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

Shell scripts must keep LF endings (`.gitattributes` pins them). On Windows
`core.autocrlf` rewrites them and `git archive` carries that through, which
ships a tarball whose scripts die on `$'\r': command not found`.

nginx config is at `infrastructure/nginx/pitchmyweb.conf`. It disables
`proxy_buffering` on the two SSE endpoints — campaign progress and WhatsApp
linking both stream, and with buffering on they appear stuck at "Queued…" while
actually running fine.

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
