import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Activity, Building2, Download, ListChecks, Play, Search, Send } from "lucide-react";
import type { CampaignLeadRow, CampaignOverview } from "@/lib/api-client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { EmptyState } from "@/components/dashboard-ui/empty-state";
import { StatTile } from "@/components/dashboard-ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { CampaignActions } from "@/components/dashboard/CampaignActions";
import { DiscoveryProgress } from "@/components/dashboard/DiscoveryProgress";
import { PageHeader } from "@/components/dashboard/PageHeader";
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
      <PageHeader
        title={campaign.name}
        badge={<StatusBadge status={campaign.status} />}
        description={`${campaign.category} · ${campaign.location}`}
        actions={<CampaignActions campaign={campaign} />}
      />

      {execution?.errorMessage && (
        <p className="rounded-dash-lg border border-dash-destructive/30 bg-dash-destructive/10 p-4 text-sm text-dash-destructive">{execution.errorMessage}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Leads found" icon={Building2} value={counts.leads} />
        <StatTile label="Selected" icon={ListChecks} value={counts.selected} />
        <StatTile label="Delivered" icon={Send} value={counts.delivered} emphasis={counts.delivered > 0} />
        <div className="flex flex-col gap-2 rounded-dash-lg border border-dash-border bg-dash-card p-4">
          <div className="flex items-center gap-2">
            <Activity className="size-4 shrink-0 text-dash-muted-foreground" />
            <p className="truncate text-sm font-medium text-dash-muted-foreground">Run status</p>
          </div>
          {execution ? (
            <>
              <StatusBadge status={execution.status} className="self-start" />
              <DiscoveryProgress campaignId={id} executionId={execution.id} initialStatus={execution.status} />
            </>
          ) : (
            <p className="text-sm text-dash-muted-foreground">Not run yet</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Discovered leads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leadRows.length === 0 ? (
            campaign.status === "RUNNING" || campaign.status === "PROCESSING" ? (
              <EmptyState
                icon={Search}
                title="Search in progress"
                description="Leads will show up here as soon as the scrape finishes. You can leave this page — it keeps running."
              />
            ) : (
              <EmptyState
                icon={Search}
                title="No leads yet"
                description="This campaign hasn't returned any businesses. Start a search from Discover to fill it."
                action={
                  <Button asChild>
                    <Link href="/discover">Find businesses</Link>
                  </Button>
                }
              />
            )
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
                        <span className="inline-flex items-center gap-1">
                          <Button asChild variant="ghost" size="sm" title="Watch the demo video">
                            <a href={`/api/pipelines/${row.pipeline.id}/video`} target="_blank" rel="noopener noreferrer">
                              <Play />
                              Watch
                            </a>
                          </Button>
                          <Button asChild variant="ghost" size="sm" title="Download the demo video as MP4">
                            <a href={`/api/pipelines/${row.pipeline.id}/video?download=1`}>
                              <Download />
                              <span className="sr-only">Download</span>
                            </a>
                          </Button>
                        </span>
                      ) : (
                        <span className="text-dash-muted-foreground">—</span>
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
