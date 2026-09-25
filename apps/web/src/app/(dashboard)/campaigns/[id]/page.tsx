import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Activity, Building2, Download, ListChecks, Play, Search, Send } from "lucide-react";
import type { CampaignLeadRow, CampaignOverview, PitchBatch } from "@/lib/api-client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { EmptyState } from "@/components/dashboard-ui/empty-state";
import { StatTile } from "@/components/dashboard-ui/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { CampaignActions } from "@/components/dashboard/CampaignActions";
import { DiscoveryProgress } from "@/components/dashboard/DiscoveryProgress";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PitchBatchPanel } from "@/components/dashboard/PitchBatchPanel";
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

// Why a discovered lead never entered the delivery pipeline. Leaving these
// rows blank is what made a run that found 8 businesses and pitched 1 look
// broken: nothing on the page said the other 7 had no number WhatsApp could
// reach, so there was no way to tell a stuck campaign from a picky one.
const BLOCKED_REASON_TEXT: Record<NonNullable<CampaignLeadRow["blockedReason"]>, string> = {
  no_phone: "No WhatsApp number",
  already_selected: "Already selected",
  not_pitchable_status: "Already pitched",
};

/** "until 2 Oct" — short, since it sits under two icon buttons in a table cell. */
function formatVideoDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function BlockedReason({ reason }: { reason: CampaignLeadRow["blockedReason"] }) {
  if (!reason) return <span className="text-dash-muted-foreground">Not selected</span>;
  return <span className="text-sm text-dash-muted-foreground">{BLOCKED_REASON_TEXT[reason]}</span>;
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = (await cookies()).toString();

  const overview = await fetchJson<CampaignOverview>(`/api/campaigns/${id}/overview`, cookie);
  if (!overview) notFound();

  const leadsResult = await fetchJson<{ items: CampaignLeadRow[]; total: number; selectedCount: number; targetCount: number }>(
    `/api/campaigns/${id}/leads`,
    cookie,
  );
  const leadRows = leadsResult?.items ?? [];
  const batchesResult = await fetchJson<{ items: PitchBatch[] }>(`/api/campaigns/${id}/batches`, cookie);

  const { campaign, execution, counts } = overview;
  const blockedCount = leadRows.filter((row) => !row.pipeline && row.blockedReason).length;
  // The three limits the pitch step is bounded by, exactly as the API bounds
  // it: leads that can actually be pitched, and how many of this campaign's
  // own targetCount slots are left. (Credits, the third, come from the
  // session inside the panel.)
  const eligibleCount = leadRows.filter((row) => row.selectable).length;
  const remainingSlots = Math.max(0, (leadsResult?.targetCount ?? campaign.targetCount) - (leadsResult?.selectedCount ?? counts.selected));

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
        <StatTile label="Leads found" icon={Building2} value={counts.leads} hint={counts.leads < campaign.targetCount ? `You asked for ${campaign.targetCount}` : undefined} />
        <StatTile
          label="Selected"
          icon={ListChecks}
          value={counts.selected}
          hint={blockedCount > 0 ? `${blockedCount} can't be pitched` : undefined}
        />
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

      {(leadRows.length > 0 || (batchesResult?.items.length ?? 0) > 0) && (
        <PitchBatchPanel
          campaignId={id}
          deliveryMode={campaign.deliveryMode}
          eligibleCount={eligibleCount}
          remainingSlots={remainingSlots}
          initialBatches={batchesResult?.items ?? []}
        />
      )}

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
                  <TableHead>Status</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Demo video</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leadRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Link href={`/leads/${row.id}`} className="hover:underline">
                          {row.business.name}
                        </Link>
                        <WebsiteVerificationBadge status={row.business.websiteVerificationStatus} />
                      </span>
                    </TableCell>
                    <TableCell>{row.business.website ?? "—"}</TableCell>
                    <TableCell>{row.business.city ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>
                      {row.pipeline ? <StatusBadge status={row.pipeline.stage} /> : <BlockedReason reason={row.blockedReason} />}
                    </TableCell>
                    <TableCell>
                      {row.pipeline?.videoReady ? (
                        <span className="inline-flex flex-wrap items-center gap-1">
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
                          {row.pipeline.videoExpiresAt && (
                            <span className="text-xs text-dash-muted-foreground" title="Videos are deleted after this date to keep storage small">
                              until {formatVideoDeadline(row.pipeline.videoExpiresAt)}
                            </span>
                          )}
                        </span>
                      ) : row.pipeline?.videoExpired ? (
                        <span className="text-sm text-dash-muted-foreground" title="Demo videos can be downloaded for 7 days after they are recorded">
                          Expired
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
