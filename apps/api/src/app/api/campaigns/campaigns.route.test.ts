import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { connectTestWhatsApp, createTestUser, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError, NotFoundError, InvalidCampaignTransitionError, WhatsAppNotConnectedError } from "../../../lib/errors";
import { ZodError } from "zod";
import { handleCreateCampaign, handleListCampaigns } from "./route";
import { handleGetCampaign, handlePatchCampaign } from "./[id]/route";
import { handleRunCampaign } from "./[id]/run/route";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

async function authedUser(prefix: string, options: { whatsapp?: boolean } = {}) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  if (options.whatsapp !== false) await connectTestWhatsApp(user.id);
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

const validCampaignBody = { name: "Chennai Dentists", location: "Chennai", category: "Dental Clinic", leadLimit: 10 };

describe("POST /api/campaigns", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody }))).rejects.toThrow(UnauthenticatedError);
  });

  it("creates a campaign for the authenticated user, always starting at DRAFT", async () => {
    const { user, cookieHeader } = await authedUser("create");
    const response = await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.userId).toBe(user.id);
    expect(body.status).toBe("DRAFT");
  });

  it("refuses to create a campaign until WhatsApp is connected", async () => {
    const { cookieHeader } = await authedUser("create-no-whatsapp", { whatsapp: false });
    await expect(handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).rejects.toThrow(
      WhatsAppNotConnectedError,
    );
  });

  it("refuses when the only linked WhatsApp is not connected right now", async () => {
    const { user, cookieHeader } = await authedUser("create-whatsapp-disconnected", { whatsapp: false });
    await prisma.whatsAppAccount.create({ data: { userId: user.id, status: "DISCONNECTED" } });
    await expect(handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).rejects.toThrow(
      WhatsAppNotConnectedError,
    );
  });

  it("rejects invalid input (missing name) with a ZodError", async () => {
    const { cookieHeader } = await authedUser("create-invalid");
    await expect(
      handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: { ...validCampaignBody, name: "" }, cookieHeader })),
    ).rejects.toThrow(ZodError);
  });

  it("ignores any client-supplied status field on creation", async () => {
    const { cookieHeader } = await authedUser("create-status-ignored");
    const response = await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: { ...validCampaignBody, status: "RUNNING" }, cookieHeader }));
    const body = await response.json();
    expect(body.status).toBe("DRAFT");
  });
});

describe("GET /api/campaigns", () => {
  it("only lists the authenticated user's own campaigns", async () => {
    const { cookieHeader } = await authedUser("list-mine");
    const { cookieHeader: otherCookie } = await authedUser("list-other");
    await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }));
    await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader: otherCookie }));

    const response = await handleListCampaigns(prisma, req("http://localhost/api/campaigns", { cookieHeader }));
    const body = await response.json();
    expect(body.total).toBe(1);
  });

  it("rejects an invalid status query filter", async () => {
    const { cookieHeader } = await authedUser("list-invalid-query");
    await expect(handleListCampaigns(prisma, req("http://localhost/api/campaigns?status=NOT_A_STATUS", { cookieHeader }))).rejects.toThrow(ZodError);
  });
});

describe("GET /api/campaigns/:id", () => {
  it("returns 404-equivalent (NotFoundError) for another user's campaign", async () => {
    const { cookieHeader } = await authedUser("get-owner");
    const { cookieHeader: otherCookie } = await authedUser("get-other");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();

    await expect(handleGetCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { cookieHeader: otherCookie }), { id: created.id })).rejects.toThrow(NotFoundError);
  });

  it("returns the campaign for its owner", async () => {
    const { cookieHeader } = await authedUser("get-mine");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();

    const response = await handleGetCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { cookieHeader }), { id: created.id });
    expect((await response.json()).id).toBe(created.id);
  });
});

describe("PATCH /api/campaigns/:id", () => {
  it("applies editable field changes", async () => {
    const { cookieHeader } = await authedUser("patch-fields");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();

    const response = await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { leadLimit: 42 }, cookieHeader }), { id: created.id });
    expect((await response.json()).leadLimit).toBe(42);
  });

  // Phase 4 code-review finding #1 regression test, end-to-end through the
  // HTTP route: a campaign created with a non-default websiteRequirement
  // must keep it after an unrelated PATCH.
  it("PATCH omission preserves an existing non-default websiteRequirement", async () => {
    const { cookieHeader } = await authedUser("patch-preserve-website-requirement");
    const created = await (
      await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: { ...validCampaignBody, websiteRequirement: "WITHOUT_WEBSITE" }, cookieHeader }))
    ).json();
    expect(created.websiteRequirement).toBe("WITHOUT_WEBSITE");

    const response = await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { leadLimit: 7 }, cookieHeader }), { id: created.id });
    const updated = await response.json();

    expect(updated.leadLimit).toBe(7);
    expect(updated.websiteRequirement).toBe("WITHOUT_WEBSITE");
  });

  it("moves DRAFT -> READY only via the explicit status:READY value", async () => {
    const { cookieHeader } = await authedUser("patch-ready");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();

    const response = await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });
    expect((await response.json()).status).toBe("READY");
  });

  it("rejects any other status value at the schema level", async () => {
    const { cookieHeader } = await authedUser("patch-bad-status");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();

    await expect(
      handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "COMPLETED" }, cookieHeader }), { id: created.id }),
    ).rejects.toThrow(ZodError);
  });

  it("rejects edits to another user's campaign", async () => {
    const { cookieHeader } = await authedUser("patch-owner");
    const { cookieHeader: otherCookie } = await authedUser("patch-other");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();

    await expect(
      handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { leadLimit: 1 }, cookieHeader: otherCookie }), { id: created.id }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("POST /api/campaigns/:id/run", () => {
  it("runs a READY campaign end-to-end via the real DemoProvider", async () => {
    const { cookieHeader } = await authedUser("run-happy");
    // Golden Wok Kitchen (the only Restaurant fixture) is in Bengaluru.
    const created = await (
      await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: { ...validCampaignBody, category: "Restaurant", location: "Bengaluru" }, cookieHeader }))
    ).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });

    const response = await handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.campaign.status).toBe("COMPLETED");
    expect(body.execution.leadsCreated).toBeGreaterThan(0);
  });

  it("refuses to run once WhatsApp has disconnected, without starting a run", async () => {
    const { user, cookieHeader } = await authedUser("run-whatsapp-gone");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });
    await prisma.whatsAppAccount.updateMany({ where: { userId: user.id }, data: { status: "DISCONNECTED" } });

    await expect(handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id })).rejects.toThrow(
      WhatsAppNotConnectedError,
    );
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("READY");
    expect(await prisma.campaignExecution.count({ where: { campaignId: created.id } })).toBe(0);
  });

  it("rejects running a DRAFT campaign (never marked READY)", async () => {
    const { cookieHeader } = await authedUser("run-not-ready");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();

    await expect(handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id })).rejects.toThrow(
      InvalidCampaignTransitionError,
    );
  });

  it("rejects a second concurrent-style run attempt on the same campaign", async () => {
    const { cookieHeader } = await authedUser("run-double");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });

    await handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id });
    await expect(handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id })).rejects.toThrow(
      InvalidCampaignTransitionError,
    );
  });

  it("cannot be run by a different user", async () => {
    const { cookieHeader } = await authedUser("run-owner");
    const { cookieHeader: otherCookie } = await authedUser("run-other");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });

    await expect(handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader: otherCookie }), { id: created.id })).rejects.toThrow(
      NotFoundError,
    );
  });
});
