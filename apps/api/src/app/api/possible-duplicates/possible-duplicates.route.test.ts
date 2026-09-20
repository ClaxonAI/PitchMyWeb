import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../lib/db/client";
import { createTestUser, deleteTestUsers, uniqueBusinessName, uniqueIndianPhone } from "../../../lib/testing/db-test-helpers";
import { SESSION_COOKIE_NAME, createSession } from "../../../lib/auth/session";
import { UnauthenticatedError, NotFoundError, ConflictError, ForbiddenError } from "../../../lib/errors";
import { normalizeBusinessInput } from "../../../lib/business/normalize";
import { upsertCanonicalBusiness } from "../../../lib/business/dedupe";
import { handleListPossibleDuplicates } from "./route";
import { handleMergePossibleDuplicate } from "./[id]/merge/route";
import { handleDismissPossibleDuplicate } from "./[id]/dismiss/route";

const createdUserIds: string[] = [];
const createdBusinessIds: string[] = [];
afterAll(async () => {
  await deleteTestUsers(createdUserIds);
  await prisma.possibleDuplicate.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
  await prisma.businessMerge.deleteMany({ where: { winnerBusinessId: { in: createdBusinessIds } } });
  await prisma.lead.deleteMany({ where: { businessId: { in: createdBusinessIds } } });
  await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
  await prisma.$disconnect();
});

async function authedUser(prefix: string) {
  const user = await createTestUser(prefix, { role: "ADMIN" });
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

async function seedPossibleDuplicate() {
  const businessId = `pd-route-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const winner = await upsertCanonicalBusiness(
    prisma,
    normalizeBusinessInput({
      name: uniqueBusinessName("Winner Clinic"),
      category: "Dental Clinic",
      address: null,
      city: "Chennai",
      phone: uniqueIndianPhone(),
      email: null,
      website: null,
      instagram: null,
      facebook: null,
      rating: null,
      reviewCount: null,
      latitude: null,
      longitude: null,
      source: "demo",
      externalId: `${businessId}-winner`,
    }),
  );
  const candidate = await upsertCanonicalBusiness(
    prisma,
    normalizeBusinessInput({
      name: uniqueBusinessName("Candidate Clinic"),
      category: "Dental Clinic",
      address: null,
      city: "Chennai",
      phone: uniqueIndianPhone(),
      email: null,
      website: null,
      instagram: null,
      facebook: null,
      rating: null,
      reviewCount: null,
      latitude: null,
      longitude: null,
      source: "demo",
      externalId: `${businessId}-candidate`,
    }),
  );
  createdBusinessIds.push(winner.id, candidate.id);
  const possibleDuplicate = await prisma.possibleDuplicate.create({
    data: { businessId: winner.id, candidateId: candidate.id, score: 0.9, matchedFields: { flaggedVia: "FUZZY_THRESHOLD" } },
  });
  return { winner, candidate, possibleDuplicate };
}

describe("GET /api/possible-duplicates", () => {
  it("rejects an unauthenticated request", async () => {
    await expect(handleListPossibleDuplicates(prisma, req("http://localhost/api/possible-duplicates"))).rejects.toThrow(UnauthenticatedError);
  });

  it("rejects a non-admin session", async () => {
    const user = await createTestUser("list-user");
    createdUserIds.push(user.id);
    const session = await createSession(prisma, user.id);
    await expect(
      handleListPossibleDuplicates(prisma, req("http://localhost/api/possible-duplicates", { cookieHeader: `${SESSION_COOKIE_NAME}=${session.token}` })),
    ).rejects.toThrow(ForbiddenError);
  });

  it("returns the seeded review with its business/candidate included", async () => {
    const { cookieHeader } = await authedUser("list");
    const { winner, candidate, possibleDuplicate } = await seedPossibleDuplicate();

    const response = await handleListPossibleDuplicates(prisma, req(`http://localhost/api/possible-duplicates?status=PENDING`, { cookieHeader }));
    const body = await response.json();

    const found = body.items.find((item: { id: string }) => item.id === possibleDuplicate.id);
    expect(found).toBeDefined();
    expect(found.business.id).toBe(winner.id);
    expect(found.candidate.id).toBe(candidate.id);
  });
});

describe("POST /api/possible-duplicates/:id/merge", () => {
  it("rejects an unauthenticated request", async () => {
    const { possibleDuplicate } = await seedPossibleDuplicate();
    await expect(handleMergePossibleDuplicate(prisma, req(`http://localhost/api/possible-duplicates/${possibleDuplicate.id}/merge`, { method: "POST" }), { id: possibleDuplicate.id })).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it("merges the pair: winner absorbs the candidate, candidate is flagged mergedIntoId, review is CONFIRMED_MERGED", async () => {
    const { cookieHeader, user } = await authedUser("merge");
    const { winner, candidate, possibleDuplicate } = await seedPossibleDuplicate();

    const response = await handleMergePossibleDuplicate(
      prisma,
      req(`http://localhost/api/possible-duplicates/${possibleDuplicate.id}/merge`, { method: "POST", body: { reason: "same phone" }, cookieHeader }),
      { id: possibleDuplicate.id },
    );
    expect(response.status).toBe(200);

    const updatedCandidate = await prisma.business.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(updatedCandidate.mergedIntoId).toBe(winner.id);

    const updatedReview = await prisma.possibleDuplicate.findUniqueOrThrow({ where: { id: possibleDuplicate.id } });
    expect(updatedReview.status).toBe("CONFIRMED_MERGED");
    expect(updatedReview.resolvedBy).toBe(user.id);

    const merge = await prisma.businessMerge.findFirst({ where: { possibleDuplicateId: possibleDuplicate.id } });
    expect(merge).toMatchObject({ winnerBusinessId: winner.id, loserBusinessId: candidate.id, reason: "same phone" });
  });

  it("rejects merging an already-resolved review", async () => {
    const { cookieHeader } = await authedUser("merge-twice");
    const { possibleDuplicate } = await seedPossibleDuplicate();
    await handleMergePossibleDuplicate(prisma, req(`http://localhost/api/possible-duplicates/${possibleDuplicate.id}/merge`, { method: "POST", cookieHeader }), { id: possibleDuplicate.id });

    await expect(
      handleMergePossibleDuplicate(prisma, req(`http://localhost/api/possible-duplicates/${possibleDuplicate.id}/merge`, { method: "POST", cookieHeader }), { id: possibleDuplicate.id }),
    ).rejects.toThrow(ConflictError);
  });

  it("throws NotFoundError for an unknown id", async () => {
    const { cookieHeader } = await authedUser("merge-missing");
    await expect(
      handleMergePossibleDuplicate(prisma, req("http://localhost/api/possible-duplicates/does-not-exist/merge", { method: "POST", cookieHeader }), { id: "does-not-exist" }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("POST /api/possible-duplicates/:id/dismiss", () => {
  it("rejects an unauthenticated request", async () => {
    const { possibleDuplicate } = await seedPossibleDuplicate();
    await expect(
      handleDismissPossibleDuplicate(prisma, req(`http://localhost/api/possible-duplicates/${possibleDuplicate.id}/dismiss`, { method: "POST" }), { id: possibleDuplicate.id }),
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("marks the review DISMISSED without touching either business", async () => {
    const { cookieHeader, user } = await authedUser("dismiss");
    const { winner, candidate, possibleDuplicate } = await seedPossibleDuplicate();

    const response = await handleDismissPossibleDuplicate(prisma, req(`http://localhost/api/possible-duplicates/${possibleDuplicate.id}/dismiss`, { method: "POST", cookieHeader }), {
      id: possibleDuplicate.id,
    });
    const body = await response.json();
    expect(body.status).toBe("DISMISSED");
    expect(body.resolvedBy).toBe(user.id);

    const stillWinner = await prisma.business.findUniqueOrThrow({ where: { id: winner.id } });
    const stillCandidate = await prisma.business.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(stillWinner.mergedIntoId).toBeNull();
    expect(stillCandidate.mergedIntoId).toBeNull();
  });

  it("rejects dismissing an already-merged review", async () => {
    const { cookieHeader } = await authedUser("dismiss-after-merge");
    const { possibleDuplicate } = await seedPossibleDuplicate();
    await handleMergePossibleDuplicate(prisma, req(`http://localhost/api/possible-duplicates/${possibleDuplicate.id}/merge`, { method: "POST", cookieHeader }), { id: possibleDuplicate.id });

    await expect(
      handleDismissPossibleDuplicate(prisma, req(`http://localhost/api/possible-duplicates/${possibleDuplicate.id}/dismiss`, { method: "POST", cookieHeader }), { id: possibleDuplicate.id }),
    ).rejects.toThrow(ConflictError);
  });
});
