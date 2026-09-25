# WhatsApp layer — architecture

Phases 1 and 2: multi-tenant sessions, QR and pairing-code linking, encrypted credential storage,
restore-after-restart, disconnect, and sending a single text through a queue behind a policy gate.

The decision to send from a personal WhatsApp number at all, and what it costs, is in
[ADR 0001](../adr/0001-automated-whatsapp-via-baileys.md). This document is about how the pieces fit.

## The shape of it

```
 browser                apps/web            apps/api            Redis         apps/whatsapp-worker
    |                      |                   |                  |                    |
    |-- click Connect ---->|                   |                  |                    |
    |                      |-- POST /connect ->|                  |                    |
    |                      |                   |-- session job -->|                    |
    |                      |                   |                  |--- connect ------->|
    |                      |                   |                  |                    |-- Baileys socket
    |                      |                   |                  |<-- QR_READY event -|
    |<---- SSE: QR --------|<-- SSE stream ----|<-- pub/sub ------|                    |
    |                      |                   |                  |                    |
    |   (user scans)       |                   |                  |<-- CONNECTED ------|
    |<---- SSE: CONNECTED -|                   |   Postgres <-- status written first ---|
```

Three processes, and the split is deliberate:

- **`apps/api`** is a control plane. It authenticates, authorizes, validates, writes rows and enqueues
  jobs. It never opens a WhatsApp socket — there is no `baileys` import anywhere under `apps/api`.
- **`apps/whatsapp-worker`** owns every live socket. It is a long-lived plain Node process because a
  WhatsApp connection is long-lived and stateful, which is precisely what a serverless-shaped route
  handler cannot hold.
- **`apps/web`** renders. It proxies `/api` to the API so the session cookie stays same-origin, and it
  learns about a session only through contract events.

## Why a separate worker, not a Next route

A Baileys session is a WebSocket that must stay open for hours, holds Signal ratchet state in memory, and
must be the only client using its credentials. Next route handlers are request-scoped and can be recycled
between requests. Putting a session in one would mean losing sockets to a hot reload in development and to
an instance recycle in production — and, worse, risking two instances sharing one credential store.

## Data model

| Table | What it holds |
| --- | --- |
| `whatsapp_accounts` | One linked account per user (Phase 2 limit, enforced in the service). Status, phone number, last error, and the session lifetime (`linkedAt`, `stayLinkedUntil`, `logoutReason`). |
| `whatsapp_auth_keys` | The Baileys credential store, AES-256-GCM encrypted. One row per Signal key. |
| `whatsapp_messages` | One row per outbound message, from QUEUED to READ. The only source of truth for recipient and body. |
| `opt_outs` | The global do-not-contact list, keyed by phone number alone. |

Postgres rather than object storage for the credentials: Baileys writes many small keys (sessions,
pre-keys, sender-keys) very frequently, which suits a table with a composite key far better than one
object per key. Access goes through the `AuthStateRepository` interface, so an S3 implementation later is
one new file.

## Status machine

```
DISCONNECTED ──connect──> CONNECTING ──┬──> QR_READY ──────┐
                                       └──> PAIRING_CODE_READY ──┤
                                                                 ├──> CONNECTED
 RECONNECTING <──transient close── CONNECTED <───────────────────┘
      │                                 │
      │ backoff exhausted               ├── loggedOut ──> LOGGED_OUT  (credentials wiped)
      └──────────> ERROR <──────────────┴── fatal close
```

Two rules govern every transition:

1. **Postgres first, Redis second.** The account row is written before the event is published. A page load
   and a live stream can therefore disagree about *when* a client heard something, never about *what*
   happened. It also means the polling fallback is always safe to believe.
2. **`lastError` is cleared on every non-ERROR transition**, so a stale message cannot outlive the failure
   that produced it.

`disconnect-reason.ts` decides which branch a close takes, as a pure function with no I/O — the mapping is
the whole safety property, so it is directly testable. An unlabelled close is treated as transient,
because declaring a working account dead on a network blip is the worse failure.

## One socket per account

A worker attaches a socket only while it holds `wa:session:<accountId>` in Redis:

- `SET key <token> NX PX 30000` to acquire — `null` means another worker owns it, which is an ordinary
  outcome, not an error.
- A Lua compare-and-`PEXPIRE` renews it every 10 seconds. A failed renewal closes the socket immediately:
  if we cannot prove we still hold the lock, we must behave as though we do not.
- A Lua compare-and-`DEL` releases it, so a lock that expired and was re-taken by another worker is never
  deleted by the previous holder.

The token is unique per acquisition, not per worker, so a stale handle cannot renew a newer lock the same
worker took later.

## Session lifetime

A linked device can read and send as the user for as long as it stays linked, so it is not left linked
indefinitely. `apps/api/src/lib/whatsapp/session-policy.ts` owns the rule:

- **Per campaign (the default).** Every Auto campaign needs a linked number to start — `POST /campaigns/:id/run`
  and `POST /campaigns/:id/selection` refuse with `WHATSAPP_NOT_CONNECTED` otherwise, and the Discover page and
  the pitch step show the QR inline. Once nothing is left to send, the number is signed out.
- **Keep me signed in for 3 days.** A checkbox under the QR (`stayLinked` on connect / pairing-code, or
  `PATCH /whatsapp/accounts/:id`) sets `stayLinkedUntil`. Inside that window new campaigns skip the link step;
  when it closes the number is signed out the same way.

"Nothing left to send" means none of the user's Auto campaigns is discovering (or just finished discovering and
about to auto-select), no pipeline is unresolved — including a failed one waiting for its automatic retry — and
no message is queued or sending. Delivery receipts only arrive over a live socket, so waiting for them counts as
sending. A number is signed out when that holds and either a pitch batch completed after this login
(`linkedAt`), or the 3-day window closed, or — for a link that never sent anything — a day has passed. Work
untouched for two days is treated as dead, so one row stuck by a crash cannot keep a number linked forever.

Two triggers apply it: the scheduled `pipeline-maintenance` job sweeps every signed-in account (including an
`ERROR` account whose credentials are still stored), and the pipeline settles a user's session the moment one of
their pitches resolves, so with the dashboard open the sign-out follows the last receipt by seconds.

Signing out is the ordinary `disconnect` command — unlink on WhatsApp, wipe the credentials, cancel anything
queued — with one addition: the automatic command carries `expectedLinkedAt`, and the worker skips it if the
account has been linked again since. A sign-out that waited in the queue (worker restarting, say) can therefore
never end the user's newer session. `logoutReason` (`campaign_finished`, `stay_linked_expired`, `unused`) is kept
on the account so the dashboard can say why the number needs linking again; the next link clears it.

## Restore after restart

On boot the worker finds every account in `CONNECTED` or `RECONNECTING`, takes each lock, and rebuilds the
socket from the stored credentials. No QR scan is involved — that is the point of persisting the auth
state. Restore runs **before** the queues start consuming, so a send job cannot arrive for an account whose
socket is still coming back.

Shutdown is the mirror image: stop consuming, close the sockets, release the locks, and leave the account
rows and credentials exactly as they are.

## Sending

```
POST /api/whatsapp/messages
  → policy gate (API)          opted_out · not_connected · invalid_number · recent_duplicate
  → QUEUED row
  → job { messageId }          ← the id only; no message body ever sits in Redis
      → worker: policy gate again + rate check + checkNumber
      → SENDING (claimed) → sendText → SENT → Outreach row
```

The gate runs twice on purpose. The API check exists so the user gets an inline reason instead of a
message that quietly dies; the worker check is authoritative, because everything can go stale while a job
waits — a business can reply STOP, the account can drop, the hourly cap can fill. Both halves speak the
same reason vocabulary from `@pitchmyweb/contracts`, so a denial means the same thing wherever it was
decided.

Three outcomes, handled differently:

- **Policy denial** → the message is `BLOCKED` with its reason, and the job completes. Nothing to retry.
- **Rate limit** → `job.moveToDelayed` and the message stays `QUEUED`. Never `sleep()`: a sleeping job
  holds a worker slot and dies with the process, whereas a delayed job is Redis state that survives a
  restart.
- **Provider failure** → the message is `FAILED` and the job throws, so BullMQ retries under its own
  backoff.

The message is claimed (`QUEUED → SENDING`, conditional on still being `QUEUED`) *before* the network call.
If the process dies mid-send, the row reads `SENDING`, so a retry cannot send it a second time.

### Why counting comes from Postgres

The hourly/daily caps and the minimum gap are counted with Postgres queries rather than Redis counters.
That is exact, survives a wiped cache, and is race-free here for a structural reason: a message can only be
sent by the worker holding that account's session lock, and that worker sends one at a time, so no two
processes ever count the same account concurrently. At these volumes the queries are trivial and both are
served by the indexes on `whatsapp_messages`. Phase 3's adaptive rate control is where Redis counters will
earn their place.

## Realtime

Server-Sent Events, not WebSockets. A Next route handler can return a streaming `Response` but cannot hold
a WebSocket upgrade, so WebSockets would mean a second server with its own authentication — a second place
to get auth wrong. The traffic is one-way anyway.

`apps/web` proxies `/api` to the API, which keeps the session cookie same-origin. That matters because
`EventSource` cannot set headers: the cookie is its only way to authenticate.

The browser also polls `/status` every 3 seconds, and this is **not** switched off when the stream opens. A
stream can stall without erroring — a proxy holding the connection open while dropping data — and a frozen
QR screen with no explanation is the worst outcome here. One small request every few seconds removes that
failure mode entirely.

The QR never reaches the browser as a Baileys token: the worker renders it to a PNG data URL, so the client
receives something it can only display.

## Packages

- **`@pitchmyweb/db`** — Prisma schema, migrations and the generated client. It ships TypeScript source
  rather than a compiled `dist/`, because Prisma's `prisma-client` generator emits extensionless relative
  imports that plain `tsc` output cannot resolve under Node's ESM resolver. Every consumer already runs the
  code through a transformer that handles them (Next via `transpilePackages`, the worker and the seed script
  via `tsx`, the test suites via Vite), so exporting source is both simpler and the only variant that runs.
  For the same reason the worker's `build` script is a typecheck and it runs under `tsx`.
- **`@pitchmyweb/contracts`** — queue names, job and event schemas, the policy reason vocabulary, and the
  Redis key helpers. Dependency-free of Prisma so the browser can import from it; `apps/api/src/lib/whatsapp/status.ts`
  asserts at compile time that its status list still matches the Prisma enum, so the two cannot drift.

## Surviving a bad socket

Baileys reaches WhatsApp through undici, whose streams emit `error` events that nothing in the library
subscribes to. An ordinary `ECONNRESET` on one account's socket therefore arrives at the process as an
uncaught exception — and by default that kills the worker, dropping every *other* tenant's session with it.
That happened during this phase's own verification.

`main.ts` installs an `uncaughtException` handler that distinguishes the two cases. A recognisably
transient network fault (`ECONNRESET`, `EPIPE`, undici's `terminated` wrapper, and friends — see
`transient-error.ts`) is logged and survived, because the affected socket still emits its own close event
and that schedules a reconnect. Anything else may have left the process in an undefined state, so it exits
non-zero and lets the supervisor restart it; `restoreAll()` rebuilds the sessions on the way back up.

## Keeping tests away from a running worker

The api suite enqueues real BullMQ jobs, because "a job lands in the queue" is the only interesting claim
about a producer. With a worker attached to the same dev Redis, that worker consumes them and acts on them
for real — during this phase it opened a live WhatsApp socket for a throwaway test account.

Both sides therefore read `WA_QUEUE_PREFIX` (via `queuePrefix()` in `@pitchmyweb/contracts`) and pass it
as BullMQ's `prefix`. `apps/api/vitest.config.ts` sets it to `bull-test`, so a test run and a running
worker never see each other's jobs.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | — | Required. One file (`apps/api/.env`) for every process. |
| `REDIS_URL` | `redis://127.0.0.1:6381` | 6379 and 6380 are taken by other local projects. |
| `WA_AUTH_ENCRYPTION_KEY` | — | Required, 64 hex chars. Losing it means every account must be relinked. |
| `WA_MAX_PER_HOUR` | `20` | |
| `WA_MAX_PER_DAY` | `80` | |
| `WA_MIN_GAP_SECONDS` | `45` | |
| `WA_DUPLICATE_WINDOW_HOURS` | `24` | Per account, per recipient. |
| `WA_MAX_RECONNECT_ATTEMPTS` | `8` | Then the account goes to ERROR and asks for a relink. |
| `WA_LOCK_TTL_MS` / `WA_LOCK_RENEW_MS` | `30000` / `10000` | Renew must be smaller than TTL; the worker refuses to boot otherwise. |
| `WA_QUEUE_PREFIX` | `bull` | BullMQ key prefix. The api test suite sets `bull-test` to stay clear of a running worker. |

## Known limits

- One linked account per user. The limit is a service check rather than a unique constraint, because Phase 3
  is expected to lift it and a dropped constraint is a migration.
- One QR emission per link attempt. Baileys re-emits every minute forever; the socket is closed after the
  first expires rather than held open for an abandoned attempt.
- No campaign send engine, no metrics, no circuit breaker, no Cloud API provider. All Phase 3.
- Lead status is never changed by a send. That transition belongs to the campaign engine; today
  `PATCH /api/leads/:id` remains the only owner of lead lifecycle.
