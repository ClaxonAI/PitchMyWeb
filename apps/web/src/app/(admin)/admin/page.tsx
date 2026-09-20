import type { Metadata } from "next";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";

export const metadata: Metadata = { title: "Overview" };

type Overview = {
  users: number;
  admins: number;
  suspendedUsers: number;
  campaigns: number;
  leads: number;
  pendingDuplicates: number;
  paidOrders: number;
};

export default async function AdminOverviewPage() {
  const overview = await adminFetch<Overview>("/api/admin/overview");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Platform</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Counts across every workspace.</p>
      </div>
      {overview ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat href="/admin/users" label="Users" value={overview.users} />
          <Stat href="/admin/users?suspended=true" label="Suspended" value={overview.suspendedUsers} />
          <Stat href="/admin/users" label="Admins" value={overview.admins} />
          <Stat href="/admin/duplicates" label="Pending duplicates" value={overview.pendingDuplicates} />
          <Stat href="/admin/campaigns" label="Campaigns" value={overview.campaigns} />
          <Stat label="Leads" value={overview.leads} />
          <Stat label="Paid orders" value={overview.paidOrders} />
        </div>
      ) : (
        <p className="text-sm text-dash-muted-foreground">Overview is unavailable right now.</p>
      )}
    </div>
  );
}

function Stat({ href, label, value }: { href?: string; label: string; value: number }) {
  const inner = (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-dash-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="display text-2xl text-dash-foreground">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block transition hover:opacity-90">
      {inner}
    </Link>
  );
}
