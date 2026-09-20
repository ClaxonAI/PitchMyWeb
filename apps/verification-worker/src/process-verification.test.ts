import { describe, expect, it, vi } from "vitest";
import { processVerification, type ProcessDeps } from "./process-verification";

function fakeDeps(overrides: Partial<ProcessDeps> = {}): ProcessDeps & { db: { business: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } } } {
  const business = {
    findUnique: vi.fn(async () => ({ id: "biz-1", website: "https://example.com" })),
    update: vi.fn(async () => undefined),
  };
  return {
    db: { business } as unknown as ProcessDeps["db"],
    verify: vi.fn(async () => "LIVE" as const),
    log: vi.fn(),
    ...overrides,
  } as ProcessDeps & { db: { business: typeof business } };
}

describe("processVerification", () => {
  it("skips when the business no longer exists", async () => {
    const deps = fakeDeps();
    deps.db.business.findUnique.mockResolvedValueOnce(null);

    const outcome = await processVerification(deps, "biz-1");

    expect(outcome).toBe("skipped");
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.db.business.update).not.toHaveBeenCalled();
  });

  it("skips when the business has no website", async () => {
    const deps = fakeDeps();
    deps.db.business.findUnique.mockResolvedValueOnce({ id: "biz-1", website: null });

    const outcome = await processVerification(deps, "biz-1");

    expect(outcome).toBe("skipped");
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("verifies the website and writes the resulting status + timestamp", async () => {
    const deps = fakeDeps({ verify: vi.fn(async () => "PARKED" as const) });

    const outcome = await processVerification(deps, "biz-1");

    expect(outcome).toBe("verified");
    expect(deps.verify).toHaveBeenCalledWith("https://example.com");
    expect(deps.db.business.update).toHaveBeenCalledWith({
      where: { id: "biz-1" },
      data: { websiteVerificationStatus: "PARKED", websiteVerifiedAt: expect.any(Date) },
    });
  });
});
