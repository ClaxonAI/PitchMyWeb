import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../../lib/db/client";
import { handleHealth } from "./route";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/health", () => {
  it("is 200 when the database and Redis answer", async () => {
    const response = await handleHealth(prisma, { ping: async () => "PONG" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, database: true, redis: true });
  });

  it("is 503 and names the failing dependency", async () => {
    const response = await handleHealth(prisma, { ping: async () => { throw new Error("down"); } });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, database: true, redis: false });
  });
});
