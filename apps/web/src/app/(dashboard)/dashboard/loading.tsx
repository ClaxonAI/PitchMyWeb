import { AnalyticsOverviewLoading } from "@/components/dashboard/AnalyticsOverviewLoader";

// Shaped like the page — header, start card, then the analytics — so nothing
// jumps when the real content replaces it.
export default function DashboardHomeLoading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="animate-pulse space-y-2">
        <div className="h-8 w-44 rounded-dash-md bg-dash-muted/20" />
        <div className="h-4 w-72 max-w-full rounded-dash-md bg-dash-muted/15" />
      </div>
      <div className="h-40 animate-pulse rounded-dash-lg border border-dash-border bg-dash-card" />
      <AnalyticsOverviewLoading />
    </div>
  );
}
