import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { UnauthenticatedError } from "../../../../../lib/errors";
import { handleEnqueueWebsiteVerifications } from "./route";

const JOB_SECRET = "enqueue-verify-test-secret-0123456789";

function jobRequest(authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new NextRequest("http://localhost/api/internal/jobs/enqueue-website-verifications", { method: "POST", headers });
}

describe("POST /api/internal/jobs/enqueue-website-verifications", () => {
  it("rejects missing, malformed and wrong tokens, and fails closed without a configured secret", async () => {
    await expect(handleEnqueueWebsiteVerifications(prisma, jobRequest(), JOB_SECRET)).rejects.toThrow(UnauthenticatedError);
    await expect(handleEnqueueWebsiteVerifications(prisma, jobRequest(JOB_SECRET), JOB_SECRET)).rejects.toThrow(UnauthenticatedError);
    await expect(handleEnqueueWebsiteVerifications(prisma, jobRequest("Bearer wrong-token-0123456789abcdef"), JOB_SECRET)).rejects.toThrow(UnauthenticatedError);
    await expect(handleEnqueueWebsiteVerifications(prisma, jobRequest("Bearer short"), "short")).rejects.toThrow(UnauthenticatedError);
  });

  it("runs and returns { enqueued, durationMs } with a valid token", async () => {
    const response = await handleEnqueueWebsiteVerifications(prisma, jobRequest(`Bearer ${JOB_SECRET}`), JOB_SECRET);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.enqueued).toBe("number");
    expect(typeof body.durationMs).toBe("number");
  });
});
