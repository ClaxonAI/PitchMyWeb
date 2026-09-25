import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Activity as ActivityIcon } from "lucide-react";
import type { ActivityRow, Paginated } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Card } from "@/components/dashboard-ui/card";
import { EmptyState } from "@/components/dashboard-ui/empty-state";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { statusLabel } from "@/components/dashboard/StatusBadge";
import { SectionTabs } from "@/components/dashboard/SectionTabs";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadActivities(): Promise<Paginated<ActivityRow> | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/activities?pageSize=50`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Paginated<ActivityRow>;
  } catch {
    return null;
  }
}

export default async function ActivityPage() {
  const result = await loadActivities();
  const activities = result?.items ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <SectionTabs section="campaigns" />
      <PageHeader title="Activity" description="Everything that's happened across your leads, most recent first." />

      {activities.length === 0 ? (
        <Card>
          <EmptyState
            icon={ActivityIcon}
            title="Nothing has happened yet"
            description="Every lead created, demo built and pitch sent is logged here as it happens."
            action={
              <Button asChild>
                <Link href="/discover">Find businesses</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col divide-y divide-dash-border rounded-dash-lg border border-dash-border bg-dash-card">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-medium">{statusLabel(activity.type)}</p>
                {activity.lead && (
                  <p className="text-dash-muted-foreground">
                    <Link href={`/leads/${activity.leadId}`} className="hover:underline">
                      {activity.lead.business.name}
                    </Link>{" "}
                    · {activity.lead.campaign.name}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs text-dash-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
