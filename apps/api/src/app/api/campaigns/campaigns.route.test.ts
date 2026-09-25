import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestUsers } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError, NotFoundError, InvalidCampaignTransitionError } from "../../../lib/errors";
import { ZodError } from "zod";
import { handleCreateCampaign, handleListCampaigns } from "./route";
import { handleGetCampaign, handlePatchCampaign } from "./[id]/route";
import { handleRunCampaign } from "./[id]/run/route";
import { handleSelectLeads } from "./[id]/selection/route";
import { WhatsAppNotConnectedError } from "../../../lib/whatsapp/session-policy";

const createdUserIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.$disconnect();
});

async function authedUser(prefix: string) {
  const user = await createTestUser(prefix);
  createdUserIds.push(user.id);
  const session = await createSession(prisma, user.id);
  return { user, cookieHeader: `${SESSION_COOKIE_NAME}=${session.token}` };
}

/** Auto campaigns send from the user's WhatsApp, so running one needs a linked number. */
async function linkWhatsApp(userId: string, status: "CONNECTED" | "RECONNECTING" = "CONNECTED") {
  await prisma.whatsAppAccount.create({ data: { userId, status, phoneNumber: "919800000001", linkedAt: new Date() } });
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
    const { user, cookieHeader } = await authedUser("run-happy");
    await linkWhatsApp(user.id);
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

  it("rejects running a DRAFT campaign (never marked READY)", async () => {
    const { user, cookieHeader } = await authedUser("run-not-ready");
    await linkWhatsApp(user.id);
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();

    await expect(handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id })).rejects.toThrow(
      InvalidCampaignTransitionError,
    );
  });

  it("rejects a second concurrent-style run attempt on the same campaign", async () => {
    const { user, cookieHeader } = await authedUser("run-double");
    await linkWhatsApp(user.id);
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });

    await handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id });
    await expect(handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id })).rejects.toThrow(
      InvalidCampaignTransitionError,
    );
  });

  it("refuses to start an Auto campaign until a WhatsApp number is linked", async () => {
    const { cookieHeader } = await authedUser("run-no-whatsapp");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });

    await expect(handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id })).rejects.toThrow(
      WhatsAppNotConnectedError,
    );
    // Refused before anything started: no execution, still READY.
    expect(await prisma.campaignExecution.count({ where: { campaignId: created.id } })).toBe(0);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("READY");
  });

  it("accepts a number that is briefly reconnecting", async () => {
    const { user, cookieHeader } = await authedUser("run-reconnecting");
    await linkWhatsApp(user.id, "RECONNECTING");
    const created = await (await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: validCampaignBody, cookieHeader }))).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });

    const response = await handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id });
    expect(response.status).toBe(200);
  });

  it("runs a Direct campaign without WhatsApp: the user sends those links themselves", async () => {
    const { cookieHeader } = await authedUser("run-direct");
    const created = await (
      await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: { ...validCampaignBody, deliveryMode: "DIRECT" }, cookieHeader }))
    ).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });

    const response = await handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id });
    expect(response.status).toBe(200);
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

describe("POST /api/campaigns/:id/selection", () => {
  it("asks for WhatsApp before pitching a batch, without reserving any credits", async () => {
    const { user, cookieHeader } = await authedUser("select-no-whatsapp");
    // Linked for the run, then signed out after it (the per-campaign policy).
    await linkWhatsApp(user.id);
    const created = await (
      await handleCreateCampaign(prisma, req("http://localhost/api/campaigns", { method: "POST", body: { ...validCampaignBody, category: "Restaurant", location: "Bengaluru" }, cookieHeader }))
    ).json();
    await handlePatchCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}`, { method: "PATCH", body: { status: "READY" }, cookieHeader }), { id: created.id });
    await handleRunCampaign(prisma, req(`http://localhost/api/campaigns/${created.id}/run`, { method: "POST", cookieHeader }), { id: created.id });
    await prisma.whatsAppAccount.updateMany({ where: { userId: user.id }, data: { status: "DISCONNECTED", logoutReason: "campaign_finished" } });

    await expect(
      handleSelectLeads(prisma, req(`http://localhost/api/campaigns/${created.id}/selection`, { method: "POST", body: { auto: true, count: 1 }, cookieHeader }), {
        id: created.id,
      }),
    ).rejects.toThrow(WhatsAppNotConnectedError);
    expect(await prisma.pitchBatch.count({ where: { campaignId: created.id } })).toBe(0);
  });
});
