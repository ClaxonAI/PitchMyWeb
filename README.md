# PitchMyWeb

Find local businesses with no website, build each one a sample site and demo, and pitch it from your own
WhatsApp.

```
PitchMyWeb/
├── apps/
│   ├── web/                # Marketing site + dashboard (Next.js 15, Tailwind v4)  → apps/web/README.md
│   ├── api/                # API + business logic (Next.js 16 route handlers)      → apps/api/README.md
│   ├── python-discovery/   # Python Serper Maps scrape (LEAD_PROVIDER=python)
│   └── whatsapp-worker/    # Baileys sessions + BullMQ workers          → apps/whatsapp-worker/README.md
├── packages/
│   ├── db/                 # Prisma schema, migrations, generated client (@pitchmyweb/db)
│   └── contracts/          # Queue names, job/event schemas, Redis helpers (@pitchmyweb/contracts)
├── infrastructure/docker/  # PostgreSQL 17 + Redis 7
├── docs/
│   ├── adr/                # Architecture decision records
│   └── whatsapp/           # WhatsApp layer architecture
└── package.json            # npm workspaces; one lockfile at the root
```

One npm workspace, one lockfile, one `node_modules`. The two Next apps stay on different major versions
(15 and 16) and npm nests them.

## Quick start

Requires Node 20+ and Docker Desktop.

```bash
npm install                                  # every workspace, from the root
npm run infra:up                             # Postgres (5434) + Redis (6381)
cp apps/api/.env.example apps/api/.env       # first time only; fill in AUTH_SECRET + WA_AUTH_ENCRYPTION_KEY
npm run db:generate                          # Prisma client
npm run db:deploy                            # apply migrations
npm run db:seed                              # 10 services + 8 demo businesses

npm run dev:api                              # API    → http://localhost:4000/api
npm run dev:worker                           # worker → WhatsApp sessions + queues
npm run dev:python-discovery             # Python Maps scrape worker
npm run dev:web                              # site   → http://localhost:3000
```

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`apps/api/.env` is the single env file for local development — the worker and the Prisma CLI both fall back
to it, so `DATABASE_URL` is defined in exactly one place.

## Infrastructure

| Service    | Local address       | Notes                                                              |
| ---------- | ------------------- | ------------------------------------------------------------------ |
| PostgreSQL | `127.0.0.1:5434`    | Container `pitchmyweb-db`, volume `pitchmyweb_pitchmyweb-pgdata`   |
| Redis      | `127.0.0.1:6381`    | Container `pitchmyweb-redis`, BullMQ queues + locks + pub/sub       |

Both bind to `127.0.0.1` only. The ports avoid 5432/5433 and 6379/6380, which other local projects use.
The compose file pins `name: pitchmyweb` so the volume prefix does not change with its directory.

## Database

Schema and migrations live in `packages/db`, shared by the API and the worker.

| Setting | Local value                                                              |
| ------- | ------------------------------------------------------------------------ |
| URL     | `postgresql://pitchmyweb:pitchmyweb_local@localhost:5434/pitchmyweb_dev` |
| Schema  | `packages/db/prisma/schema.prisma`                                       |

- Change the schema → `npm run db:migrate`
- Browse data → `npm run db:studio`
- Reset everything → `docker compose -f infrastructure/docker/docker-compose.yml down -v`, then
  `infra:up`, `db:deploy`, `db:seed`

Tables: `User`, `Session`, `Campaign`, `CampaignExecution`, `Business`, `Lead`, `LeadScore`,
`LeadAnalysis`, `WebsiteProject`, `WebsiteVersion`, `Pitch`, `Outreach`, `Activity`, `Deal`, `Service`,
`Settings`, plus the WhatsApp layer: `WhatsAppAccount`, `WhatsAppAuthKey`, `WhatsAppMessage`, `OptOut`.

## Scripts

| Script                        | Runs                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `infra:up` / `infra:down`     | Start / stop Postgres + Redis                           |
| `dev:web` / `dev:api` / `dev:worker` | Development servers                              |
| `build` / `build:web` / `build:api`  | Production builds                                |
| `lint`                        | ESLint on the web app                                   |
| `test` / `test:api` / `test:worker` | Vitest (needs Postgres and Redis running)         |
| `typecheck`                   | `tsc --noEmit` across every workspace                   |
| `db:generate` / `db:migrate` / `db:deploy` | Prisma client and migrations               |
| `db:seed` / `db:studio`       | Seed data / open Prisma Studio                          |

## WhatsApp

The Auto plan sends pitches from the user's own WhatsApp number. That is built on Baileys, an unofficial
client, with rate limits, a global opt-out list and encrypted credential storage — see
[docs/whatsapp/architecture.md](docs/whatsapp/architecture.md) for how it works and
[docs/adr/0001-automated-whatsapp-via-baileys.md](docs/adr/0001-automated-whatsapp-via-baileys.md) for why,
and what it costs.

Link a number at `/whatsapp` after signing in, or right on the Discover page — every Auto campaign needs a linked
number to start. For privacy the number is signed out (device unlinked, stored session deleted) as soon as the
campaign has finished sending, unless the user ticks "keep me signed in for 3 days" when linking; see
[Session lifetime](docs/whatsapp/architecture.md#session-lifetime).

Demo videos stay downloadable for `VIDEO_RETENTION_DAYS` (7 by default) and are then deleted from object storage by
the `pipeline-maintenance` job.

## Status

- Pricing and checkout on the marketing site are still front-end simulations.
- The campaign send engine, metrics and the WhatsApp Cloud API provider are Phase 3.
