# ADR 0001 — Automated WhatsApp sending via Baileys

- **Status:** Accepted
- **Date:** 2026-09-16
- **Supersedes:** `apps/api/docs/backend-tasks.md` §15 and §32, which state that V1 generates a
  `wa.me` click-to-chat link only and performs no automated personal-WhatsApp sending.

## Context

The Auto plan promises "link your WhatsApp, pitches send from your number". Until now nothing sent:
`apps/api/src/lib/leads/whatsapp.service.ts` built a `wa.me` URL that an operator opened and sent by
hand, and the linked-device panel on the pricing page was a front-end simulation. The gap between what
is sold and what the product does is the reason for this decision.

Three ways to close it were considered.

**1. WhatsApp Cloud API (official).** Meta's supported Business Platform API. It is the only option with
a stated terms-of-service position, but it does not do what the plan promises: messages come from a
business number provisioned through Meta, not from the freelancer's own number, and outbound messages to
people who have not messaged first must use pre-approved template messages. A personalized pitch
referencing a specific business and a generated demo site is not a template. It also requires Business
Manager verification before a single message can be sent, which is a hard barrier for the individual
freelancers this product is for.

**2. Keep the `wa.me` link.** Zero risk and already built, but it leaves the Auto plan undeliverable and
caps outreach at whatever an operator can click through by hand.

**3. Baileys (unofficial WebSocket client).** Links as a companion device, exactly as WhatsApp Web does,
and sends from the user's own number with arbitrary text. This is what the product promises. It is also
not sanctioned by WhatsApp.

## Decision

Build the sending layer on **Baileys `7.0.0-rc14`**, behind a provider interface, with the outreach
safeguards below built in from the first commit rather than added later.

The version is pinned **exactly**. `7.0.0-rc14` is the current `latest` tag on npm and is a release
candidate — a range like `^7.0.0-rc14` would let npm move us onto a different pre-release without a
deliberate change.

## Consequences

### What we accept

- **It is unofficial.** WhatsApp does not support or document this protocol. A protocol change can break
  sending with no notice and no support channel. Baileys itself says as much.
- **It discourages bulk messaging.** WhatsApp's terms prohibit automated and bulk messaging, and a number
  used this way can be rate-limited or banned. The ban lands on the freelancer's own number — the same
  number they run their business on. This is the single largest risk in the feature and the reason for
  every limit below.
- **It is a release candidate.** Pre-release code in the path that holds a user's WhatsApp credentials.

### How the risk is contained

- **A provider interface.** `apps/whatsapp-worker/src/providers/whatsapp.provider.ts` defines six methods.
  `baileys.provider.ts` is the only file in the monorepo that imports `baileys`. Adding a Cloud API
  provider later is a new file implementing that interface, not a rewrite; it is also the escape hatch if
  Baileys becomes unusable.
- **Conservative limits by default.** 20 messages per hour, 80 per day, a 45-second minimum gap between
  sends, one message per number per 24 hours. Every value is an environment variable so it can be lowered
  without a deploy, and the defaults are deliberately well under what the transport can do.
- **A global opt-out list.** An inbound "STOP" (and eight related phrases) writes a row that blocks that
  number for **every** PitchMyWeb user, not just the one who heard it. The check runs in the API before a
  message is queued and again in the worker immediately before it is sent.
- **Number verification before sending.** `checkNumber` confirms the recipient is on WhatsApp, so the
  account never sends into the void — a pattern that itself looks like spam.
- **One socket per account, enforced by a Redis lock.** Two clients sharing one credential store corrupt
  each other's Signal ratchet state, which surfaces as undecryptable messages and, at worst, as a ban.
- **Credentials encrypted at rest.** AES-256-GCM under `WA_AUTH_ENCRYPTION_KEY`, with the ciphertext bound
  to its own account and key id so a row cannot be moved between accounts. The key is required at worker
  boot.
- **The user stays in control.** Linking is an explicit action, Disconnect unlinks the device on WhatsApp
  and deletes the stored credentials, and the device appears in the user's own "Linked devices" list named
  PitchMyWeb, so it can be revoked from the phone at any time.

### What this does not cover

Phase 3 — the campaign send engine, adaptive rate control, a circuit breaker, metrics and the Cloud API
provider — is deliberately out of scope. What exists today sends one message at a time, initiated by a
person looking at the screen.

### Revisit when

- WhatsApp offers a way to send personalized, non-template outbound messages from an individual's own
  number.
- A real number is banned, or Baileys is broken by a protocol change for more than a few days.
- Volume grows past what a per-user hourly cap can reasonably cover, at which point the Cloud API's
  template model may become the better trade even with its limits.
