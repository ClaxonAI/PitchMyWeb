import type { Prisma, PrismaClient, Service, ServiceCode } from "@pitchmyweb/db";

type Db = PrismaClient | Prisma.TransactionClient;

// Pricing/service configuration (backend_tasks.md section 11/18). Never
// hardcode prices in domain logic — always read the active Service records
// seeded/managed through Phase 1.

export async function getActiveServices(db: Db): Promise<Service[]> {
  return db.service.findMany({ where: { active: true }, orderBy: { code: "asc" } });
}

export async function getServiceByCode(db: Db, code: ServiceCode): Promise<Service | null> {
  return db.service.findUnique({ where: { code } });
}

export type PriceRange = { priceMin: number; priceMax: number };

/**
 * Looks up the configured price range for a recommended service. Returns
 * null if the service is missing or inactive rather than inventing a
 * price — callers decide how to handle an unconfigured service.
 */
export async function getServicePriceRange(db: Db, code: ServiceCode): Promise<PriceRange | null> {
  const service = await getServiceByCode(db, code);
  if (!service || !service.active) return null;
  return { priceMin: service.priceMin, priceMax: service.priceMax };
}
