import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Users } from "lucide-react";
import type { Lead, Paginated } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Card } from "@/components/dashboard-ui/card";
import { EmptyState } from "@/components/dashboard-ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { LeadFilters } from "@/components/dashboard/LeadFilters";
import { SectionTabs } from "@/components/dashboard/SectionTabs";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadLeads(query: Record<string, string | undefined>): Promise<Paginated<Lead> | null> {
  const cookie = (await cookies()).toString();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  params.set("pageSize", "50");
  try {
    const response = await fetch(`${API_URL}/api/leads?${params.toString()}`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Paginated<Lead>;
  } catch {
    return null;
  }
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const result = await loadLeads(query);
  const leads = result?.items ?? [];
  // An empty list because nothing has been discovered yet is a different
  // problem from an empty list because the filters exclude everything, and
  // the fix for each is different too.
  const isFiltered = Object.entries(query).some(([key, value]) => key !== "page" && Boolean(value));
  const total = result?.total ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <SectionTabs section="campaigns" />
      <PageHeader title="Leads" description={`${total} ${total === 1 ? "lead" : "leads"} across every campaign.`} />

      <LeadFilters />

      {leads.length === 0 ? (
        <Card>
          {isFiltered ? (
            <EmptyState icon={Users} title="No leads match these filters" description="Try widening the filters above — clearing the search or status usually brings results back." />
          ) : (
            <EmptyState
              icon={Users}
              title="No leads yet"
              description="Leads appear here once a search finds businesses. Nothing is scraped until you start one."
              action={
                <Button asChild>
                  <Link href="/campaigns/new">Find businesses</Link>
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">
                  <Link href={`/leads/${lead.id}`} className="hover:underline">
                    {lead.business.name}
                  </Link>
                </TableCell>
                <TableCell>{lead.business.category}</TableCell>
                <TableCell>{lead.business.city ?? "—"}</TableCell>
                <TableCell>{lead.business.website ? "Has website" : "No website"}</TableCell>
                <TableCell>{lead.score ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={lead.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
