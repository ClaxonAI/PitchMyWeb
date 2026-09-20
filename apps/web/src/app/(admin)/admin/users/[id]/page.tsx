import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminFetch } from "@/lib/admin-fetch";
import { requireAdminSession } from "@/lib/auth/require-admin";
import { Badge } from "@/components/dashboard-ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { AdminUserControls } from "@/components/admin/AdminUserControls";

export const metadata: Metadata = { title: "User" };

type AdminUserDetail = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  planId: string | null;
  suspendedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  usage: { campaigns: number; leads: number; pitches: number; paidOrders: number };
};

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireAdminSession();
  const { id } = await params;
  const user = await adminFetch<AdminUserDetail>(`/api/admin/users/${id}`);
  if (!user) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">{user.email}</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">{user.name ?? "No display name"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{user.role}</Badge>
        {user.suspendedAt ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="success">Active</Badge>}
        <Badge variant="muted">{user.planId ?? "No plan"}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-dash-muted-foreground">Campaigns</p>
            <p className="display text-xl">{user.usage.campaigns}</p>
          </div>
          <div>
            <p className="text-dash-muted-foreground">Leads</p>
            <p className="display text-xl">{user.usage.leads}</p>
          </div>
          <div>
            <p className="text-dash-muted-foreground">Pitches</p>
            <p className="display text-xl">{user.usage.pitches}</p>
          </div>
          <div>
            <p className="text-dash-muted-foreground">Paid orders</p>
            <p className="display text-xl">{user.usage.paidOrders}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUserControls
            userId={user.id}
            suspended={Boolean(user.suspendedAt)}
            planId={user.planId}
            role={user.role}
            viewerRole={viewer.role}
          />
        </CardContent>
      </Card>
      <p className="text-xs text-dash-muted-foreground">
        Created {new Date(user.createdAt).toLocaleString()}
        {user.lastLoginAt ? ` · Last login ${new Date(user.lastLoginAt).toLocaleString()}` : ""}
      </p>
    </div>
  );
}
