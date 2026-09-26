"use client";

import dynamic from "next/dynamic";
import type { AnalyticsSummary } from "@/lib/api-client";

// The charts library stays out of the first load: the numbers arrive with the
// page (fetched on the server, see dashboard/page.tsx) and only the chart
// code is fetched in the browser.
const AnalyticsOverview = dynamic(() => import("./AnalyticsOverview").then((module) => module.AnalyticsOverview), {
  ssr: false,
  loading: () => <AnalyticsOverviewLoading />,
});

export function AnalyticsOverviewLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading analytics">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-24 rounded-dash-lg border border-dash-border bg-dash-card" />)}
      </div>
      <div className="h-80 rounded-dash-lg border border-dash-border bg-dash-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => <div key={index} className="h-72 rounded-dash-lg border border-dash-border bg-dash-card" />)}
      </div>
    </div>
  );
}

export function AnalyticsOverviewLoader({ analytics }: { analytics: AnalyticsSummary | null }) {
  if (!analytics) return <p className="text-sm text-dash-muted-foreground">Analytics are unavailable right now — try refreshing in a moment.</p>;
  return <AnalyticsOverview analytics={analytics} />;
}
