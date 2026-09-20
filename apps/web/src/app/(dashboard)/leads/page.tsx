import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { Lead, Paginated } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { LeadFilters } from "@/components/dashboard/LeadFilters";

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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Leads</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">{result?.total ?? 0} leads across every campaign.</p>
      </div>

      <LeadFilters />

      {leads.length === 0 ? (
        <p className="rounded-dash-lg border border-dash-border bg-dash-card p-6 text-sm text-dash-muted-foreground">No leads match these filters yet.</p>
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
