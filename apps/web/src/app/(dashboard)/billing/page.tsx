import type { Metadata } from "next";
import { getPlan } from "@/data/plans";
import { requireSession } from "@/lib/auth/require-session";
import type { AnalyticsSummary } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { PlanGrid } from "@/components/pricing/PlanGrid";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadAnalytics(): Promise<AnalyticsSummary | null> {
  const { cookies } = await import("next/headers");
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/analytics`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as AnalyticsSummary;
  } catch {
    return null;
  }
}

export default async function BillingPage() {
  const session = await requireSession();
  const analytics = await loadAnalytics();
  const plan = session.planId ? getPlan(session.planId as "auto" | "direct") : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Billing</h1>
          <p className="mt-1 text-sm text-dash-muted-foreground">Your plan, pitch balance, and purchases.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Current plan</CardTitle>
            <p className="mt-1 text-lg font-semibold text-dash-foreground">{plan?.name ?? "Free"}</p>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Usage label="Available pitches" value={session.availableCredits} />
          <Usage label="Reserved pitches" value={session.reservedCredits} />
          <Usage label="Used pitches" value={session.usedCredits} />
          <Usage label="Plan access" value={session.hasPaidAccess ? 1 : 0} suffix={session.hasPaidAccess ? "Paid" : "Free"} />
        </CardContent>
      </Card>

      <div>
        <h2 className="display text-xl text-dash-foreground">Top up pitches</h2>
        <p className="mt-1 text-sm text-dash-muted-foreground">Choose a pack. Successful payment adds its pitches to your wallet.</p>
      </div>
      <PlanGrid />

      <Card>
        <CardHeader>
          <CardTitle>Usage this period</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Usage label="Leads generated" value={analytics?.qualifiedLeads ?? 0} />
          <Usage label="Demos generated" value={analytics?.demosGenerated ?? 0} />
          <Usage label="Pitches sent" value={analytics?.pitches ?? 0} />
          <Usage label="Replies" value={analytics?.replies ?? 0} />
        </CardContent>
      </Card>
    </div>
  );
}

function Usage({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <p className="text-xs text-dash-muted-foreground">{label}</p>
      <p className="display text-xl text-dash-foreground">{suffix ?? value.toLocaleString()}</p>
    </div>
  );
}
