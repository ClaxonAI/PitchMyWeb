import type { Prisma, PrismaClient, Service, Settings } from "@pitchmyweb/db";
import { getActiveServices } from "../services/pricing";
import { SECRET_LOOKING_KEY } from "../validation/settings";

type Db = PrismaClient | Prisma.TransactionClient;

// GET /api/settings domain service (backend_tasks.md section 35: "Settings
// should expose configurable service/pricing information without
// exposing secrets"). Global configuration, not scoped to any one user —
// every authenticated caller sees the same catalog, the same way every
// caller of lib/services/pricing.ts's getServicePriceRange reads the same
// Service rows.
//
// The "configurable service/pricing information" half is exactly
// getActiveServices() (lib/services/pricing.ts), reused as-is — never
// reimplemented here. The generic Settings key/value store is read too
// (section 19's own model), filtered through the identical
// "does this key look like a secret" rule lib/validation/settings.ts
// already enforces on writes — defense in depth, since that schema only
// guards inserts made through settingsUpsertSchema, not any other write
// path a settings row could reach the table through.

export type PublicSettingsResult = {
  services: Service[];
  settings: Array<Pick<Settings, "key" | "value" | "description">>;
};

export async function getPublicSettings(db: PrismaClient): Promise<PublicSettingsResult> {
  const [services, allSettings] = await Promise.all([getActiveServices(db), db.settings.findMany({ orderBy: { key: "asc" } })]);

  const settings = allSettings.filter((s) => !SECRET_LOOKING_KEY.test(s.key)).map((s) => ({ key: s.key, value: s.value, description: s.description }));

  return { services, settings };
}

export async function upsertPublicSetting(
  db: PrismaClient,
  input: { key: string; value: Prisma.InputJsonValue; description?: string },
): Promise<Pick<Settings, "key" | "value" | "description">> {
  const row = await db.settings.upsert({
    where: { key: input.key },
    create: { key: input.key, value: input.value, description: input.description },
    update: { value: input.value, ...(input.description !== undefined ? { description: input.description } : {}) },
  });
  return { key: row.key, value: row.value, description: row.description };
}

export type DedupeFuzzyConfig = {
  threshold: number;
  weights: { name: number; address: number; phone: number; domain: number };
};

// Falls back to this if the migration's seed row is somehow missing —
// matches packages/db/prisma/migrations/*_phase2_business_dedup's own
// values exactly, so a missing row degrades to the documented default
// rather than a crash.
const DEFAULT_DEDUPE_FUZZY_CONFIG: DedupeFuzzyConfig = {
  threshold: 0.72,
  weights: { name: 0.45, address: 0.3, phone: 0.15, domain: 0.1 },
};

/** Reads lib/business/fuzzy-match.ts's threshold/weights from the generic Settings store (key "dedupe.fuzzyThreshold"). */
export async function getDedupeFuzzyConfig(db: Db): Promise<DedupeFuzzyConfig> {
  const row = await db.settings.findUnique({ where: { key: "dedupe.fuzzyThreshold" } });
  if (!row) return DEFAULT_DEDUPE_FUZZY_CONFIG;
  return row.value as DedupeFuzzyConfig;
}
