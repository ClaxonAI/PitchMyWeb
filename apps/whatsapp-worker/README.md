# @pitchmyweb/whatsapp-worker

Owns every live WhatsApp socket: session lifecycle, encrypted credential storage, reconnects, the outbound
send queue and inbound replies.

Architecture and rationale live in [`docs/whatsapp/architecture.md`](../../docs/whatsapp/architecture.md)
and [ADR 0001](../../docs/adr/0001-automated-whatsapp-via-baileys.md). This README is about running it.

## Running it

```bash
npm run infra:up          # from the repo root: Postgres + Redis
npm run dev:worker        # tsx watch
```

`WA_AUTH_ENCRYPTION_KEY` is required — the worker refuses to boot without it:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put it in `apps/api/.env`, which is the single env file for local development; the worker reads its own
`.env` first (if present) and falls back to that one. A worker-local `.env` is only for running the worker
somewhere other than this machine.

## Layout

```
src/
├── main.ts                       boot: config → db/redis → restoreAll() → workers → shutdown hooks
├── config.ts                     zod-validated environment, read once
├── logger.ts                     pino; redacts credentials, keys and message bodies
├── db.ts                         one PrismaClient for the process
├── providers/
│   ├── whatsapp.provider.ts      the interface: connect, requestPairingCode, disconnect,
│   │                             getStatus, sendText, checkNumber
│   └── baileys.provider.ts       the only file in the monorepo that imports `baileys`
├── session/
│   ├── session.manager.ts        socket registry, status machine, restoreAll()
│   ├── auth-state.ts             Baileys AuthenticationState over AuthStateRepository
│   ├── auth-state.repository.ts  Postgres + AES-256-GCM
│   ├── crypto.ts                 encrypt/decrypt, bound to each row's identity
│   ├── session.lock.ts           Redis SET NX PX + heartbeat renew + owner-checked release
│   └── disconnect-reason.ts      pure mapping: close → reconnect | logged_out | fatal
├── workers/
│   ├── session.worker.ts         connect / pairing-code / disconnect
│   ├── send.worker.ts            policy → checkNumber → send → status → Outreach
│   ├── send-guard.ts             the authoritative outreach gate
│   ├── reconnect.worker.ts       exponential backoff via BullMQ delay
│   └── inbound.handler.ts        STOP keywords → OptOut; receipts → DELIVERED/READ
└── realtime/publisher.ts         publishes contract events to wa:events:<accountId>
```

## Tests

```bash
npm run test:worker       # from the repo root
```

They run against the real local Postgres and Redis. A fake Redis would happily "prove" a lock that a real
one does not grant, and the lock is the invariant that stops two workers sharing one credential store —
so the things worth testing are tested against the systems whose semantics they depend on. Each test
removes the rows it created.

## `build` is a typecheck

`npm run build` runs `tsc --noEmit`, and the worker runs under `tsx` in production as well as in
development. That is not laziness: `@pitchmyweb/db` ships TypeScript source because Prisma's generator
emits extensionless relative imports that plain `tsc` output cannot resolve under Node's ESM resolver.
`tsx` handles them; a compiled `dist/` would not run. If this ever needs a real build, the fix is to bundle
`packages/db` (esbuild with `--packages=external`), not to change this script.

## Operating notes

- **Never run two workers against one account without Redis.** The session lock is what makes concurrent
  workers safe; without it, two sockets sharing one credential store corrupt each other's Signal state.
- **Losing `WA_AUTH_ENCRYPTION_KEY` means every linked account must be scanned again.** The stored
  credentials become undecryptable. Rotating it is possible incrementally — `keyVersion` on each row
  records which key wrote it — but nothing automates that yet.
- **Restart is safe.** Shutdown closes sockets and releases locks but leaves the credentials and the
  account status alone, and boot restores every CONNECTED/RECONNECTING account without a QR scan.
- **Do not run the api test suite against this worker's queues.** The suite enqueues real jobs; a worker on
  the same Redis will act on them. `apps/api/vitest.config.ts` sets `WA_QUEUE_PREFIX=bull-test` to prevent
  exactly that, so leave it in place.
- **A transient socket error no longer kills the process.** `main.ts` survives network-class uncaught
  exceptions (one tenant's `ECONNRESET` must not drop every other tenant's session) and exits non-zero on
  anything else so a supervisor can restart it cleanly.
- **The limits are deliberately low.** 20/hour, 80/day, 45s between sends. They are environment variables
  so they can be lowered without a deploy; raising them raises the risk of the user's own number being
  banned.
