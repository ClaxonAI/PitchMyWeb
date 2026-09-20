import type { Metadata } from "next";
import { AnalyticsOverviewLoader } from "@/components/dashboard/AnalyticsOverviewLoader";
import { DashboardStartCard } from "@/components/dashboard/DashboardStartCard";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Your pipeline</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Pay, then scrape when you want. Auto-send starts only after you run a search.</p>
      </div>
      <DashboardStartCard />
      <AnalyticsOverviewLoader />
    </div>
  );
}
