import type { Metadata } from "next";
import { AnalyticsOverviewLoader } from "@/components/dashboard/AnalyticsOverviewLoader";
import { DashboardStartCard } from "@/components/dashboard/DashboardStartCard";
import { PageHeader } from "@/components/dashboard/PageHeader";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Your pipeline" description="Pay, then scrape when you want. Auto-send starts only after you run a search." />
      <DashboardStartCard />
      <AnalyticsOverviewLoader />
    </div>
  );
}
