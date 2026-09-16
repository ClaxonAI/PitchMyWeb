import type { PrismaClient, Service, Settings } from "../../generated/prisma/client";
import { getActiveServices } from "../services/pricing";
import { SECRET_LOOKING_KEY } from "../validation/settings";

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
