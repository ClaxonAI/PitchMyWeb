import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import type { AnalyticsSummary } from "@/lib/api-client";
import { AnalyticsOverviewLoader, AnalyticsOverviewLoading } from "@/components/dashboard/AnalyticsOverviewLoader";
import { DashboardStartCard } from "@/components/dashboard/DashboardStartCard";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadAnalytics(): Promise<AnalyticsSummary | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/analytics`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as AnalyticsSummary;
  } catch {
    return null;
  }
}

// Fetched on the server and streamed in: the header and start card paint at
// once, and the numbers follow in the same response instead of waiting for
// the browser to load, hydrate and then ask the API a second time.
async function Analytics() {
  return <AnalyticsOverviewLoader analytics={await loadAnalytics()} />;
}

export default async function DashboardHomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Your pipeline" description="Pay, then scrape when you want. Auto-send starts only after you run a search." />
      <DashboardStartCard />
      <Suspense fallback={<AnalyticsOverviewLoading />}>
        <Analytics />
      </Suspense>
    </div>
  );
}
