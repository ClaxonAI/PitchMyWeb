# PitchMyWeb — backend

PitchMyWeb helps freelancers find potential clients and identify businesses that need their services. It then
creates a personalized website demo and sales message for each potential client, and tracks each lead from first
contact to signed client.

This is the API and business-logic layer: REST route handlers, auth, validation, scoring, persistence and
webhook contracts. It owns all database writes. UI lives in `../web`.

It is also the WhatsApp control plane: it authenticates, applies the outreach policy, writes rows and
enqueues jobs, but never opens a WhatsApp socket. There is no `baileys` import anywhere in this app — the
sockets live in `../whatsapp-worker`.

**Stack:** Next.js 16 route handlers · TypeScript · PostgreSQL · Prisma 7 (`@prisma/adapter-pg`) · Zod 4 · Vitest

## Setup

Run everything from the monorepo root — this app has no lockfile or `node_modules` of its own.

```bash
npm install                   # every workspace
npm run infra:up              # Postgres on 5434, Redis on 6381
cp apps/api/.env.example apps/api/.env   # fill in AUTH_SECRET, WA_AUTH_ENCRYPTION_KEY, …
npm run db:generate           # Prisma client (schema lives in packages/db)
npm run db:deploy             # apply migrations
npm run db:seed               # optional sample data
npm run dev:api               # http://localhost:4000/api/…
```

`apps/api/.env` is the single env file for local development: the worker and the Prisma CLI both fall back
to it.

## Scripts

| Script                    | What it does                                   |
| ------------------------- | ---------------------------------------------- |
| `npm run dev`             | Start the API in dev mode                      |
| `npm run build` / `start` | Production build / serve                       |
| `npm test`                | Run the Vitest suite (see note below)          |
| `npm run typecheck`       | `tsc --noEmit`                                 |

Prisma now lives in `packages/db`, so use the root scripts (`npm run db:generate`, `db:migrate`,
`db:deploy`, `db:seed`, `db:studio`) rather than running `prisma` in this directory.

> `npm run db:migrate -- --name x` from the root swallows the `--name` flag, leaving Prisma waiting at an
> interactive prompt while it holds the migrate advisory lock. Run `npx prisma migrate dev --name x` inside
> `packages/db` instead.

> Most route and service tests are integration tests against a **real Postgres** (`DATABASE_URL`). Pure unit
> tests (scoring, validation, prompts, lifecycle…) run without a database.

## Folder structure

```
apps/api/
├── src/
│   ├── app/api/                  # Route handlers (one folder per resource)
│   │   ├── auth/                 #   register · login · logout
│   │   ├── campaigns/            #   CRUD · [id]/run
│   │   ├── leads/                #   list · [id] · analyze · demo · pitch · whatsapp
│   │   ├── websites/             #   CRUD · [id]/publish
│   │   ├── whatsapp/             #   accounts (connect · pairing-code · disconnect ·
│   │   │                         #   status · events SSE) · messages · opt-outs
│   │   ├── analytics/
│   │   └── settings/
│   ├── lib/                      # Business logic, framework-agnostic
│   │   ├── api/                  #   request parsing, responses, rate limiting
│   │   ├── auth/                 #   sessions, passwords, current user
│   │   ├── db/                   #   Prisma client singleton
│   │   ├── validation/           #   Zod schemas for every payload
│   │   ├── campaigns/  leads/  websites/  activities/  settings/  analytics/
│   │   ├── whatsapp/             #   accounts, messages, outreach policy, queues, SSE
│   │   ├── ai/                   #   Ollama client, prompts, analysis & pitch services
│   │   ├── business/             #   normalisation, dedupe, signals
│   │   ├── scoring/              #   deterministic opportunity scoring
│   │   ├── services/             #   pricing, service recommendation
│   │   ├── providers/            #   lead-data providers (demo provider)
│   │   ├── testing/              #   shared DB test helpers
│   │   └── errors.ts
│   └── generated/prisma/         # Generated client (git-ignored)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
│   └── backend-tasks.md          # Original implementation spec
├── .env.example
├── prisma.config.ts
├── next.config.ts
├── vitest.config.ts
└── tsconfig.json                 # "@/*" → "src/*"
```

Tests sit next to the code they cover (`*.test.ts`, `*.route.test.ts`, `critical-flow.e2e.test.ts`).

## Environment

See `.env.example`. Required: `DATABASE_URL`, `AUTH_SECRET`. Integrations: `LEAD_PROVIDER` (serper by default; osm/python/demo),
`OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `BUSINESS_DATA_API_URL`, `BUSINESS_DATA_API_KEY`.
