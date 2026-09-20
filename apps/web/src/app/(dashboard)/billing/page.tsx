import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CreditCard } from "lucide-react";
import type { AnalyticsSummary } from "@/lib/api-client";
import { Badge } from "@/components/dashboard-ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { Button } from "@/components/dashboard-ui/button";

export const metadata: Metadata = { title: "Billing" };
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

// Static/stub for Phase 1 — no billing/subscription system exists in the
// backend yet (no Stripe, no plan/credits field on User). This page shows
// real usage numbers (from the existing analytics endpoint) inside a
// visually-real but not-yet-functional plan card, matching the same
// pattern apps/web already uses for CheckoutDialog's own payment stub.
export default async function BillingPage() {
  const analytics = await loadAnalytics();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Billing</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Your plan and usage.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Current plan</CardTitle>
            <p className="mt-1 text-lg font-semibold text-dash-foreground">Auto</p>
          </div>
          <Badge variant="muted">Not yet wired up</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-dash-muted-foreground">
            Billing isn&apos;t connected to a real payment provider yet — this page shows what it will look like. Nothing here charges you.
          </p>
          <Button variant="secondary" disabled>
            <CreditCard className="h-4 w-4" /> Manage payment method
          </Button>
        </CardContent>
      </Card>

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

function Usage({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-dash-muted-foreground">{label}</p>
      <p className="display text-xl text-dash-foreground">{value.toLocaleString()}</p>
    </div>
  );
}
