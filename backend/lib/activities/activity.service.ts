import type { Activity, ActivityType, Prisma, PrismaClient } from "../../generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type RecordActivityInput = {
  leadId: string;
  type: ActivityType;
  metadata?: Record<string, unknown>;
};

/**
 * Appends a historical CRM event (backend_tasks.md section 16). Activities
 * are treated as immutable-ish: this module intentionally exposes no
 * update/delete operation, only create + read.
 */
export async function recordActivity(db: Db, input: RecordActivityInput): Promise<Activity> {
  return db.activity.create({
    data: {
      leadId: input.leadId,
      type: input.type,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function getActivityTimeline(db: Db, leadId: string): Promise<Activity[]> {
  return db.activity.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } });
}
