import { LeadProviderError } from "../errors";
import type { AsyncLeadProvider } from "./async-provider";
import { DemoProvider, type LeadProvider } from "./demo-provider";
import { OsmLeadProvider } from "./osm-provider";
import { PythonLeadProvider } from "./python-provider";
import { SerperLeadProvider } from "./serper-provider";

export type AnyLeadProvider = LeadProvider | AsyncLeadProvider;

export function isAsyncLeadProvider(provider: AnyLeadProvider): provider is AsyncLeadProvider {
  return typeof (provider as AsyncLeadProvider).trigger === "function";
}

/**
 * Resolves the configured lead provider from the environment.
 *
 *   LEAD_PROVIDER=serper  (default)  apps/discovery-worker (Google Maps via serper.dev + AI insights), asynchronous
 *   LEAD_PROVIDER=osm                apps/discovery-worker (OSM/Overpass), asynchronous
 *   LEAD_PROVIDER=python             apps/python-discovery (Google Maps via serper.dev + AI insights), asynchronous
 *   LEAD_PROVIDER=demo               in-memory demo businesses, synchronous — local/offline dev and the test suite
 *
 * serper is the default so that a deployment which forgets the variable
 * discovers real businesses rather than silently seeding campaigns with
 * demo fixtures, which reads as a working search until someone looks at
 * the leads. `demo` stays available but must now be asked for by name;
 * apps/api's vitest.config.ts sets it for the suite.
 *
 * Misconfiguration fails before any campaign state changes, so a missing
 * URL or secret never leaves a campaign stuck in RUNNING.
 */
export function getLeadProvider(env: Record<string, string | undefined> = process.env): AnyLeadProvider {
  const kind = (env.LEAD_PROVIDER ?? "serper").trim().toLowerCase();

  if (kind === "demo") return new DemoProvider();

  if (kind === "osm") return new OsmLeadProvider();

  if (kind === "python") return new PythonLeadProvider();

  if (kind === "serper") return new SerperLeadProvider();

  console.error(`Unknown LEAD_PROVIDER "${kind}".`);
  throw new LeadProviderError("Lead discovery is not configured.");
}

export type { AsyncLeadProvider, LeadProvider };
export { OsmLeadProvider, PythonLeadProvider, SerperLeadProvider };
