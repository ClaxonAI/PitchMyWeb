import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import type { Campaign, Paginated } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadCampaigns(): Promise<Paginated<Campaign> | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/campaigns?pageSize=50`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Paginated<Campaign>;
  } catch {
    return null;
  }
}

export default async function CampaignsPage() {
  const result = await loadCampaigns();
  const campaigns = result?.items ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display text-2xl text-dash-foreground">Campaigns</h1>
          <p className="mt-1 text-sm text-dash-muted-foreground">Every discovery run you&apos;ve started.</p>
        </div>
        <Button asChild>
          <Link href="/discover">
            <Plus className="h-4 w-4" /> New campaign
          </Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <p className="rounded-dash-lg border border-dash-border bg-dash-card p-6 text-sm text-dash-muted-foreground">
          No campaigns yet. <Link href="/discover" className="text-dash-primary underline underline-offset-2">Create your first one</Link>.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.id} className="cursor-pointer">
                <TableCell className="font-medium">
                  <Link href={`/campaigns/${campaign.id}`} className="-my-3 -ml-4 block px-4 py-3 hover:underline">
                    {campaign.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/campaigns/${campaign.id}`} className="-my-3 -mx-4 block px-4 py-3">
                    {campaign.category}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/campaigns/${campaign.id}`} className="-my-3 -mx-4 block px-4 py-3">
                    {campaign.location}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/campaigns/${campaign.id}`} className="-my-3 -mx-4 block px-4 py-3">
                    <StatusBadge status={campaign.status} />
                  </Link>
                </TableCell>
                <TableCell className="text-dash-muted-foreground">
                  <Link href={`/campaigns/${campaign.id}`} className="-my-3 -mx-4 block px-4 py-3">
                    {new Date(campaign.createdAt).toLocaleDateString()}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
