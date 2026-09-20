import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ActivityRow, Paginated } from "@/lib/api-client";

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
      <div>
        <h1 className="display text-2xl text-dash-foreground">Activity</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Everything that&apos;s happened across your leads, most recent first.</p>
      </div>

      {activities.length === 0 ? (
        <p className="rounded-dash-lg border border-dash-border bg-dash-card p-6 text-sm text-dash-muted-foreground">No activity yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-dash-border rounded-dash-lg border border-dash-border bg-dash-card">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-medium">{activity.type.replaceAll("_", " ")}</p>
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
