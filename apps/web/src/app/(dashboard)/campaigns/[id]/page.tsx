import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { CampaignLeadRow, CampaignOverview } from "@/lib/api-client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { CampaignActions } from "@/components/dashboard/CampaignActions";
import { DiscoveryProgress } from "@/components/dashboard/DiscoveryProgress";
import { WebsiteVerificationBadge } from "@/components/dashboard/WebsiteVerificationBadge";

export const metadata: Metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function fetchJson<T>(path: string, cookie: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = (await cookies()).toString();

  const overview = await fetchJson<CampaignOverview>(`/api/campaigns/${id}/overview`, cookie);
  if (!overview) notFound();

  const leadsResult = await fetchJson<{ items: CampaignLeadRow[]; total: number }>(`/api/campaigns/${id}/leads?sort=score`, cookie);
  const leadRows = leadsResult?.items ?? [];

  const { campaign, execution, counts } = overview;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="display text-2xl text-dash-foreground">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-sm text-dash-muted-foreground">
            {campaign.category} · {campaign.location}
          </p>
        </div>
        <CampaignActions campaign={campaign} />
      </div>

      {execution?.errorMessage && (
        <p className="rounded-dash-lg border border-dash-destructive/30 bg-dash-destructive/10 p-4 text-sm text-dash-destructive">{execution.errorMessage}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle>Leads found</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="display text-2xl">{counts.leads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle>Selected</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="display text-2xl">{counts.selected}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle>Delivered</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="display text-2xl">{counts.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle>Run status</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-sm font-medium">{execution?.status ?? "Not run yet"}</p>
            {execution && (
              <DiscoveryProgress campaignId={id} executionId={execution.id} initialStatus={execution.status} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Discovered leads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leadRows.length === 0 ? (
            <p className="p-5 text-sm text-dash-muted-foreground">
              {campaign.status === "RUNNING" || campaign.status === "PROCESSING"
                ? "Search is in progress. Leads will show up here when the scrape finishes."
                : "No leads yet — pay for a plan, then start a search from Discover."}
            </p>
          ) : (
            <Table className="border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Demo video</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadRows.map((row) => (
                  <TableRow key={row.business.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {row.lead ? (
                          <Link href={`/leads/${row.lead.id}`} className="hover:underline">
                            {row.business.name}
                          </Link>
                        ) : (
                          row.business.name
                        )}
                        <WebsiteVerificationBadge status={row.business.websiteVerificationStatus} />
                      </span>
                    </TableCell>
                    <TableCell>{row.business.website ?? "—"}</TableCell>
                    <TableCell>{row.business.city ?? "—"}</TableCell>
                    <TableCell>{row.lead?.score ?? "—"}</TableCell>
                    <TableCell>{row.lead ? <StatusBadge status={row.lead.status} /> : "—"}</TableCell>
                    <TableCell>{row.pipeline ? <StatusBadge status={row.pipeline.stage} /> : "—"}</TableCell>
                    <TableCell>
                      {row.pipeline?.videoReady ? (
                        <span className="inline-flex items-center gap-3 text-sm">
                          <a href={`/api/pipelines/${row.pipeline.id}/video`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            Watch
                          </a>
                          <a href={`/api/pipelines/${row.pipeline.id}/video?download=1`} className="font-medium text-dash-primary hover:underline">
                            Download
                          </a>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
