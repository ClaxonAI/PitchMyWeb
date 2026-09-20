"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { AnalyticsSummary } from "@/lib/api-client";
import { api } from "@/lib/api-client";

const AnalyticsOverview = dynamic(() => import("./AnalyticsOverview").then((module) => module.AnalyticsOverview), {
  ssr: false,
  loading: () => <AnalyticsOverviewLoading />,
});

function AnalyticsOverviewLoading() {
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

export function AnalyticsOverviewLoader() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .get<AnalyticsSummary>("/api/analytics")
      .then((summary) => {
        if (active) setAnalytics(summary);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (failed) return <p className="text-sm text-dash-muted-foreground">Analytics are unavailable right now — try refreshing in a moment.</p>;
  if (!analytics) return <AnalyticsOverviewLoading />;
  return <AnalyticsOverview analytics={analytics} />;
}