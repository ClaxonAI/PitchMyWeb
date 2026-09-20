import { describe, expect, it } from "vitest";
import type { Prisma } from "@pitchmyweb/db";
import { getActivityTimeline, recordActivity } from "./activity.service";

function createFakeDb() {
  const activities: Array<{ id: string; leadId: string; type: string; metadata?: unknown; createdAt: Date }> = [];

  const client = {
    activity: {
      create: async ({ data }: { data: { leadId: string; type: string; metadata?: unknown } }) => {
        const activity = { id: `activity-${activities.length + 1}`, createdAt: new Date(), ...data };
        activities.push(activity);
        return activity;
      },
      findMany: async ({ where }: { where: { leadId: string } }) => activities.filter((a) => a.leadId === where.leadId),
    },
  };

  return { db: client as unknown as Prisma.TransactionClient, activities };
}

describe("recordActivity", () => {
  it("creates an activity row for the given lead/type/metadata", async () => {
    const { db, activities } = createFakeDb();
    const activity = await recordActivity(db, { leadId: "lead-1", type: "LEAD_CREATED", metadata: { source: "demo" } });
    expect(activity.type).toBe("LEAD_CREATED");
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ leadId: "lead-1", type: "LEAD_CREATED", metadata: { source: "demo" } });
  });

  it("supports every documented ActivityType value", async () => {
    const { db, activities } = createFakeDb();
    const types = [
      "LEAD_CREATED",
      "LEAD_ANALYZED",
      "WEBSITE_GENERATED",
      "DEMO_PUBLISHED",
      "PITCH_GENERATED",
      "WHATSAPP_OPENED",
      "PITCHED",
      "REPLIED",
      "INTERESTED",
      "MEETING",
      "WON",
      "LOST",
    ] as const;
    for (const type of types) {
      await recordActivity(db, { leadId: "lead-1", type });
    }
    expect(activities.map((a) => a.type)).toEqual(types);
  });
});

describe("getActivityTimeline", () => {
  it("returns only activities for the requested lead", async () => {
    const { db } = createFakeDb();
    await recordActivity(db, { leadId: "lead-1", type: "LEAD_CREATED" });
    await recordActivity(db, { leadId: "lead-2", type: "LEAD_CREATED" });
    const timeline = await getActivityTimeline(db, "lead-1");
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.leadId).toBe("lead-1");
  });
});
