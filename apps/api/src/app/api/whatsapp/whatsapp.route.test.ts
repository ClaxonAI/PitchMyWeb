import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { QUEUE_SEND, QUEUE_SESSION, createRedisConnection, whatsappPairingKey } from "@pitchmyweb/contracts";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { ConflictError, ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from "../../../lib/errors";
import { sendQueue, sessionQueue } from "../../../lib/whatsapp/queue";
import { handleCreateWhatsAppAccount, handleListWhatsAppAccounts } from "./accounts/route";
import { handleGetWhatsAppAccount } from "./accounts/[id]/route";
import { handleConnectWhatsAppAccount } from "./accounts/[id]/connect/route";
import { handleGetWhatsAppStatus } from "./accounts/[id]/status/route";
import { handleRequestPairingCode } from "./accounts/[id]/pairing-code/route";
import { handleCreateWhatsAppMessage, handleListWhatsAppMessages } from "./messages/route";
import { handlePreviewWhatsAppMessage } from "./messages/preview/route";
import { handleCreateOptOut, handleListOptOuts } from "./opt-outs/route";

// Route-level tests, calling the handlers directly with a hand-built
// NextRequest — the same approach the existing route suites use, so a real
// session cookie is exercised without needing Next's request runtime.
//
// The enqueue tests talk to the real Redis: "a job lands in the queue" is
// the only interesting claim about the producer, and a mocked BullMQ would
// only prove the mock was called.

const createdUserIds: string[] = [];
const redis = createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381");
const createdPhones: string[] = [];

let seq = 0;
function phone(): string {
  seq += 1;
  return `9177${String(Date.now()).slice(-7)}${String(seq).padStart(2, "0")}`;
}

function trackedPhone(): string {
  const value = phone();
  createdPhones.push(value);
  return value;
}

async function authedUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const session = await createSession(prisma, user.id);
  return { user, cookieHeader: `${SESSION_COOKIE_NAME}=${session.token}` };
}

function req(url: string, init: { method?: string; body?: unknown; cookieHeader?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.cookieHeader) headers.cookie = init.cookieHeader;
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function connectedAccount(prefix: string) {
  const { user, cookieHeader } = await authedUser(prefix);
  const account = await prisma.whatsAppAccount.create({
    data: { userId: user.id, status: "CONNECTED", phoneNumber: phone() },
  });
  return { user, cookieHeader, accountId: account.id };
}

beforeAll(async () => {
  // A queue that cannot be reached would make every enqueue test fail with
  // a timeout rather than a useful message.
  const probe = createRedisConnection(process.env.REDIS_URL ?? "redis://127.0.0.1:6381");
  await probe.ping();
  await probe.quit();
});

afterEach(async () => {
  if (createdPhones.length > 0) {
    await prisma.optOut.deleteMany({ where: { phoneNumber: { in: createdPhones } } });
    createdPhones.length = 0;
  }
});

afterAll(async () => {
  // Jobs this suite enqueued are never consumed here (no worker is running),
  // so they are removed rather than left to accumulate in the dev Redis.
  await sessionQueue().obliterate({ force: true });
  await sendQueue().obliterate({ force: true });
  await sessionQueue().close();
  await sendQueue().close();
  await deleteTestUsers(createdUserIds);
  await redis.quit();
  await prisma.$disconnect();
});

describe("GET /api/whatsapp/accounts", () => {
  it("requires a session", async () => {
    await expect(handleListWhatsAppAccounts(prisma, req("http://localhost/api/whatsapp/accounts"))).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it("returns only the caller's accounts", async () => {
    const mine = await connectedAccount("list-mine");
    await connectedAccount("list-theirs");

    const response = await handleListWhatsAppAccounts(prisma, req("http://localhost/api/whatsapp/accounts", { cookieHeader: mine.cookieHeader }));
    const body = (await response.json()) as { items: Array<{ id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe(mine.accountId);
  });

  it("never exposes auth material", async () => {
    const mine = await connectedAccount("list-fields");
    const response = await handleListWhatsAppAccounts(prisma, req("http://localhost/api/whatsapp/accounts", { cookieHeader: mine.cookieHeader }));
    const body = (await response.json()) as { items: Array<Record<string, unknown>> };
    const serialized = JSON.stringify(body);
    for (const forbidden of ["ciphertext", "authTag", "keyVersion", "authKeys"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("POST /api/whatsapp/accounts", () => {
  it("creates an account for the caller", async () => {
    const { cookieHeader, user } = await authedUser("create");
    const response = await handleCreateWhatsAppAccount(prisma, req("http://localhost/api/whatsapp/accounts", { method: "POST", body: {}, cookieHeader }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; status: string };
    expect(body.status).toBe("DISCONNECTED");
    const stored = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.userId).toBe(user.id);
  });

  // Phase 2 is one linked number per user; the limit lives in the service
  // rather than in a unique constraint, so it needs its own test.
  it("refuses a second account", async () => {
    const { cookieHeader } = await authedUser("create-second");
    await handleCreateWhatsAppAccount(prisma, req("http://localhost/api/whatsapp/accounts", { method: "POST", body: {}, cookieHeader }));
    await expect(
      handleCreateWhatsAppAccount(prisma, req("http://localhost/api/whatsapp/accounts", { method: "POST", body: {}, cookieHeader })),
    ).rejects.toThrow(/already have a linked WhatsApp account/);
  });
});

describe("account ownership", () => {
  it("returns 404 for another user's account", async () => {
    const owner = await connectedAccount("own-owner");
    const other = await authedUser("own-other");
    await expect(
      handleGetWhatsAppAccount(prisma, req(`http://localhost/api/whatsapp/accounts/${owner.accountId}`, { cookieHeader: other.cookieHeader }), {
        id: owner.accountId,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns 404 on the status route for another user's account", async () => {
    const owner = await connectedAccount("own-status");
    const other = await authedUser("own-status-other");
    await expect(
      handleGetWhatsAppStatus(prisma, req(`http://localhost/api/whatsapp/accounts/${owner.accountId}/status`, { cookieHeader: other.cookieHeader }), {
        id: owner.accountId,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuses to connect another user's account", async () => {
    const owner = await connectedAccount("own-connect");
    const other = await authedUser("own-connect-other");
    await expect(
      handleConnectWhatsAppAccount(
        prisma,
        req(`http://localhost/api/whatsapp/accounts/${owner.accountId}/connect`, { method: "POST", body: {}, cookieHeader: other.cookieHeader }),
        { id: owner.accountId },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns the account to its owner", async () => {
    const owner = await connectedAccount("own-self");
    const response = await handleGetWhatsAppAccount(
      prisma,
      req(`http://localhost/api/whatsapp/accounts/${owner.accountId}`, { cookieHeader: owner.cookieHeader }),
      { id: owner.accountId },
    );
    expect(((await response.json()) as { id: string }).id).toBe(owner.accountId);
  });
});

describe("POST /api/whatsapp/accounts/:id/connect", () => {
  it("queues a connect command and marks the account CONNECTING", async () => {
    const { cookieHeader, accountId } = await connectedAccount("connect-queue");
    const response = await handleConnectWhatsAppAccount(
      prisma,
      req(`http://localhost/api/whatsapp/accounts/${accountId}/connect`, { method: "POST", body: {}, cookieHeader }),
      { id: accountId },
    );
    expect(response.status).toBe(202);

    const stored = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(stored.status).toBe("CONNECTING");

    const jobs = await sessionQueue().getJobs(["waiting", "delayed", "prioritized", "active"]);
    expect(jobs.some((job) => job.data.accountId === accountId && job.data.type === "connect")).toBe(true);
  });

  it("starts a login that ends with the campaign", async () => {
    const { cookieHeader, accountId } = await connectedAccount("connect-per-campaign");
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { logoutReason: "campaign_finished" } });
    const before = Date.now();
    await handleConnectWhatsAppAccount(prisma, req(`http://localhost/api/whatsapp/accounts/${accountId}/connect`, { method: "POST", cookieHeader }), {
      id: accountId,
    });

    const stored = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(stored.linkedAt!.getTime()).toBeGreaterThanOrEqual(before);
    // The previous sign-out's reason belongs to the previous login.
    expect(stored.logoutReason).toBeNull();
  });

  it("rejects unknown fields in the body, including the removed stay-signed-in option", async () => {
    const { cookieHeader, accountId } = await connectedAccount("connect-strict");
    await expect(
      handleConnectWhatsAppAccount(
        prisma,
        req(`http://localhost/api/whatsapp/accounts/${accountId}/connect`, { method: "POST", body: { stayLinked: true }, cookieHeader }),
        { id: accountId },
      ),
    ).rejects.toThrow();
  });
});

describe("POST /api/whatsapp/accounts/:id/pairing-code", () => {
  async function linkAttempt(prefix: string) {
    const { user, cookieHeader } = await authedUser(prefix);
    const account = await prisma.whatsAppAccount.create({ data: { userId: user.id, status: "DISCONNECTED" } });
    return { cookieHeader, accountId: account.id };
  }

  function pair(accountId: string, cookieHeader: string, phoneNumber: string) {
    return handleRequestPairingCode(
      prisma,
      req(`http://localhost/api/whatsapp/accounts/${accountId}/pairing-code`, { method: "POST", body: { phoneNumber }, cookieHeader }),
      { id: accountId },
    );
  }

  it("adds India's country code to a 10-digit mobile number", async () => {
    const { cookieHeader, accountId } = await linkAttempt("pair-in");
    const response = await pair(accountId, cookieHeader, "9488329318");
    expect(response.status).toBe(202);
    const jobs = await sessionQueue().getJobs(["waiting", "delayed", "prioritized", "active"]);
    const job = jobs.find((j) => j.data.accountId === accountId && j.data.type === "pairing-code");
    expect(job?.data.phoneNumber).toBe("919488329318");
  });

  it("refuses a number whose country code cannot be known", async () => {
    const { cookieHeader, accountId } = await linkAttempt("pair-bad");
    await expect(pair(accountId, cookieHeader, "88329318")).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an account that is already linked", async () => {
    const { cookieHeader, accountId } = await connectedAccount("pair-linked");
    await expect(pair(accountId, cookieHeader, "+91 94883 29318")).rejects.toBeInstanceOf(ConflictError);
  });

  it("the status poll serves the parked code", async () => {
    const { cookieHeader, accountId } = await linkAttempt("pair-status");
    await prisma.whatsAppAccount.update({ where: { id: accountId }, data: { status: "PAIRING_CODE_READY" } });
    const expiresAt = new Date(Date.now() + 150_000).toISOString();
    await redis.set(whatsappPairingKey(accountId), JSON.stringify({ code: "ABCD1234", expiresAt }), "EX", 150);
    try {
      const response = await handleGetWhatsAppStatus(prisma, req(`http://localhost/api/whatsapp/accounts/${accountId}/status`, { cookieHeader }), {
        id: accountId,
      });
      const body = (await response.json()) as { pairingCode: string | null; pairingCodeExpiresAt: string | null };
      expect(body.pairingCode).toBe("ABCD1234");
      expect(body.pairingCodeExpiresAt).toBe(expiresAt);
    } finally {
      await redis.del(whatsappPairingKey(accountId));
    }
  });
});

describe("POST /api/whatsapp/messages", () => {
  it("creates a QUEUED row and lands a job in Redis", async () => {
    const { cookieHeader, accountId, user } = await connectedAccount("send-queue");
    const phoneNumber = trackedPhone();

    const response = await handleCreateWhatsAppMessage(
      prisma,
      req("http://localhost/api/whatsapp/messages", {
        method: "POST",
        body: { accountId, phoneNumber, body: "Hello from the test suite" },
        cookieHeader,
      }),
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { id: string; status: string };
    expect(body.status).toBe("QUEUED");

    const stored = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.userId).toBe(user.id);
    expect(stored.phoneNumber).toBe(phoneNumber);

    const jobs = await sendQueue().getJobs(["waiting", "delayed", "prioritized", "active"]);
    expect(jobs.some((job) => job.data.messageId === body.id)).toBe(true);
  });

  it("normalizes a free-text phone number to digits", async () => {
    const { cookieHeader, accountId } = await connectedAccount("send-normalize");
    const digits = trackedPhone();
    const response = await handleCreateWhatsAppMessage(
      prisma,
      req("http://localhost/api/whatsapp/messages", {
        method: "POST",
        body: { accountId, phoneNumber: `+${digits.slice(0, 2)}-${digits.slice(2)}`, body: "Hi" },
        cookieHeader,
      }),
    );
    const body = (await response.json()) as { phoneNumber: string };
    expect(body.phoneNumber).toBe(digits);
  });

  // A denial must not leave a row behind: nothing was queued, so there is
  // nothing to record.
  it("refuses an opted-out number without creating a row", async () => {
    const { cookieHeader, accountId } = await connectedAccount("send-optout");
    const phoneNumber = trackedPhone();
    await prisma.optOut.create({ data: { phoneNumber, source: "MANUAL" } });

    await expect(
      handleCreateWhatsAppMessage(
        prisma,
        req("http://localhost/api/whatsapp/messages", { method: "POST", body: { accountId, phoneNumber, body: "Hi" }, cookieHeader }),
      ),
    ).rejects.toMatchObject({ code: "OPTED_OUT", httpStatus: 409 });

    expect(await prisma.whatsAppMessage.count({ where: { accountId, phoneNumber } })).toBe(0);
  });

  it("refuses to send from a disconnected account", async () => {
    const { user, cookieHeader } = await authedUser("send-disconnected");
    const account = await prisma.whatsAppAccount.create({ data: { userId: user.id, status: "DISCONNECTED" } });
    await expect(
      handleCreateWhatsAppMessage(
        prisma,
        req("http://localhost/api/whatsapp/messages", {
          method: "POST",
          body: { accountId: account.id, phoneNumber: trackedPhone(), body: "Hi" },
          cookieHeader,
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_CONNECTED" });
  });

  it("refuses another user's account", async () => {
    const owner = await connectedAccount("send-cross-owner");
    const other = await authedUser("send-cross-other");
    await expect(
      handleCreateWhatsAppMessage(
        prisma,
        req("http://localhost/api/whatsapp/messages", {
          method: "POST",
          body: { accountId: owner.accountId, phoneNumber: trackedPhone(), body: "Hi" },
          cookieHeader: other.cookieHeader,
        }),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a body with neither text nor a lead", async () => {
    const { cookieHeader, accountId } = await connectedAccount("send-empty");
    await expect(
      handleCreateWhatsAppMessage(
        prisma,
        req("http://localhost/api/whatsapp/messages", { method: "POST", body: { accountId, phoneNumber: trackedPhone() }, cookieHeader }),
      ),
    ).rejects.toThrow();
  });
});

describe("GET /api/whatsapp/messages", () => {
  it("returns only the caller's messages", async () => {
    const mine = await connectedAccount("list-msg-mine");
    const theirs = await connectedAccount("list-msg-theirs");
    await prisma.whatsAppMessage.create({
      data: { userId: mine.user.id, accountId: mine.accountId, phoneNumber: phone(), body: "mine", status: "QUEUED" },
    });
    await prisma.whatsAppMessage.create({
      data: { userId: theirs.user.id, accountId: theirs.accountId, phoneNumber: phone(), body: "theirs", status: "QUEUED" },
    });

    const response = await handleListWhatsAppMessages(prisma, req("http://localhost/api/whatsapp/messages", { cookieHeader: mine.cookieHeader }));
    const body = (await response.json()) as { items: Array<{ body: string }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]!.body).toBe("mine");
  });
});

describe("POST /api/whatsapp/messages/preview", () => {
  it("returns the resolved text and an allowed verdict", async () => {
    const { cookieHeader, accountId } = await connectedAccount("preview-ok");
    const phoneNumber = trackedPhone();
    const response = await handlePreviewWhatsAppMessage(
      prisma,
      req("http://localhost/api/whatsapp/messages/preview", {
        method: "POST",
        body: { accountId, phoneNumber: `+${phoneNumber}`, body: "Preview me" },
        cookieHeader,
      }),
    );
    const body = (await response.json()) as { phoneNumber: string; body: string; policy: { allowed: boolean } };
    expect(body).toMatchObject({ phoneNumber, body: "Preview me", policy: { allowed: true } });
  });

  // A denial is a successful answer to "what would happen?", so it is a 200
  // carrying the verdict rather than an error.
  it("reports a denial as a 200 with the reason", async () => {
    const { cookieHeader, accountId } = await connectedAccount("preview-denied");
    const phoneNumber = trackedPhone();
    await prisma.optOut.create({ data: { phoneNumber, source: "MANUAL" } });

    const response = await handlePreviewWhatsAppMessage(
      prisma,
      req("http://localhost/api/whatsapp/messages/preview", {
        method: "POST",
        body: { accountId, phoneNumber, body: "Preview me" },
        cookieHeader,
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { policy: { allowed: boolean; reason: string } };
    expect(body.policy).toMatchObject({ allowed: false, reason: "opted_out" });
  });

  it("creates nothing", async () => {
    const { cookieHeader, accountId } = await connectedAccount("preview-no-write");
    const phoneNumber = trackedPhone();
    await handlePreviewWhatsAppMessage(
      prisma,
      req("http://localhost/api/whatsapp/messages/preview", { method: "POST", body: { accountId, phoneNumber, body: "Hi" }, cookieHeader }),
    );
    expect(await prisma.whatsAppMessage.count({ where: { accountId } })).toBe(0);
  });
});

describe("opt-outs", () => {
  /** A user whose WhatsApp has messaged `phoneNumber`, so it is one of their contacts. */
  async function userWhoMessaged(prefix: string, phoneNumber: string) {
    const account = await connectedAccount(prefix);
    await prisma.whatsAppMessage.create({
      data: { userId: account.user.id, accountId: account.accountId, phoneNumber, body: "hello", status: "SENT", sentAt: new Date() },
    });
    return account;
  }

  it("requires a session", async () => {
    await expect(handleListOptOuts(prisma, req("http://localhost/api/whatsapp/opt-outs"))).rejects.toThrow(UnauthenticatedError);
  });

  it("adds a manual opt-out for one of the user's contacts and normalizes the number", async () => {
    const digits = trackedPhone();
    const { cookieHeader } = await userWhoMessaged("optout-add", digits);
    const response = await handleCreateOptOut(
      prisma,
      req("http://localhost/api/whatsapp/opt-outs", { method: "POST", body: { phoneNumber: `+${digits}`, reason: "asked by phone" }, cookieHeader }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { phoneNumber: string; source: string };
    expect(body).toMatchObject({ phoneNumber: digits, source: "MANUAL" });
  });

  it("is idempotent", async () => {
    const phoneNumber = trackedPhone();
    const { cookieHeader } = await userWhoMessaged("optout-twice", phoneNumber);
    const body = { phoneNumber };
    await handleCreateOptOut(prisma, req("http://localhost/api/whatsapp/opt-outs", { method: "POST", body, cookieHeader }));
    await handleCreateOptOut(prisma, req("http://localhost/api/whatsapp/opt-outs", { method: "POST", body, cookieHeader }));
    expect(await prisma.optOut.count({ where: { phoneNumber } })).toBe(1);
  });

  it("refuses a number that is not one of the user's contacts", async () => {
    const { cookieHeader } = await authedUser("optout-stranger");
    await expect(
      handleCreateOptOut(prisma, req("http://localhost/api/whatsapp/opt-outs", { method: "POST", body: { phoneNumber: trackedPhone() }, cookieHeader })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("shows a user only the entries that concern them; an admin sees all", async () => {
    const mine = trackedPhone();
    const theirs = trackedPhone();
    const me = await userWhoMessaged("optout-list-me", mine);
    const them = await userWhoMessaged("optout-list-them", theirs);
    for (const [who, phoneNumber] of [[me, mine], [them, theirs]] as const) {
      await handleCreateOptOut(prisma, req("http://localhost/api/whatsapp/opt-outs", { method: "POST", body: { phoneNumber }, cookieHeader: who.cookieHeader }));
    }
    const listFor = async (cookieHeader: string) =>
      ((await (await handleListOptOuts(prisma, req("http://localhost/api/whatsapp/opt-outs?pageSize=100", { cookieHeader }))).json()) as {
        items: Array<{ phoneNumber: string }>;
      }).items.map((item) => item.phoneNumber);

    const seen = await listFor(me.cookieHeader);
    expect(seen).toContain(mine);
    expect(seen).not.toContain(theirs);

    const admin = await authedUser("optout-list-admin");
    await prisma.user.update({ where: { id: admin.user.id }, data: { role: "ADMIN" } });
    const all = await listFor(admin.cookieHeader);
    expect(all).toEqual(expect.arrayContaining([mine, theirs]));
  });

  it("rejects an implausible number", async () => {
    const { cookieHeader } = await authedUser("optout-invalid");
    await expect(
      // Long enough to pass the schema's size bound, short enough that
      // normalizePhoneForWhatsApp rejects it — the service layer is what is
      // under test here, not zod.
      handleCreateOptOut(prisma, req("http://localhost/api/whatsapp/opt-outs", { method: "POST", body: { phoneNumber: "1234567" }, cookieHeader })),
    ).rejects.toThrow(/valid phone number/);
  });
});
