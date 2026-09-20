import type { WhatsAppStatus } from "@pitchmyweb/db";
import { WA_STATUSES, type WaStatus } from "@pitchmyweb/contracts";

// @pitchmyweb/contracts declares the status list as plain literals so it
// stays free of Prisma's generated client (the browser imports from it too).
// That leaves one risk: the two lists drifting apart after a schema change.
//
// These two assignments close it at compile time. Adding a value to the
// Prisma enum without adding it to WA_STATUSES — or the reverse — fails
// `tsc`, so the drift is caught by the existing typecheck rather than by a
// runtime surprise in production.
const _contractCoversPrisma: WaStatus = null as unknown as WhatsAppStatus;
const _prismaCoversContract: WhatsAppStatus = null as unknown as WaStatus;
void _contractCoversPrisma;
void _prismaCoversContract;

export { WA_STATUSES };
export type { WaStatus };

/** Statuses from which a user can meaningfully start a new link attempt. */
export const LINKABLE_STATUSES: readonly WhatsAppStatus[] = ["DISCONNECTED", "LOGGED_OUT", "ERROR"];
