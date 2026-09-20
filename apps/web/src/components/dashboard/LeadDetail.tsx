"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LeadDetail as LeadDetailType, LeadStatus } from "@/lib/api-client";
import { ApiError, leadsApi } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/dashboard-ui/tabs";
import { Select } from "@/components/dashboard-ui/select";
import { PitchBody } from "@/components/dashboard/PitchBody";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { WebsiteVerificationBadge } from "@/components/dashboard/WebsiteVerificationBadge";

const NEXT_STATUSES: ReadonlyArray<LeadStatus> = ["NEW", "ANALYZED", "SITE_READY", "PITCHED", "REPLIED", "INTERESTED", "NEGOTIATING", "WON", "LOST"];

// A minimal, always-valid default payload for POST /api/leads/:id/demo —
// there's no template-editor UI in Phase 1 (that's a full sub-feature of
// its own), so "Generate demo site" produces a real, working site from a
// fixed template + the lead's own business fields rather than opening an
// editor. See apps/api/src/lib/websites/template-registry.ts for the valid
// template codes and apps/api/src/lib/validation/website.ts for the shape.
function defaultDemoPayload(lead: LeadDetailType) {
  return {
    leadId: lead.id,
    contentJSON: {
      template: "clinic-modern" as const,
      businessName: lead.business.name,
      theme: "default",
      hero: {
        headline: `Welcome to ${lead.business.name}`,
        subheadline: lead.business.category,
        cta: "Book now",
      },
      services: lead.services.length > 0 ? lead.services.slice(0, 6) : [lead.business.category],
      contact: {
        phone: lead.business.phone ?? undefined,
        address: lead.business.address ?? undefined,
      },
    },
  };
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-dash-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value || "—"}</p>
    </div>
  );
}

export function LeadDetail({ initialLead }: { initialLead: LeadDetailType }) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Memoize the filtered status options to avoid recreating on every render
  const availableStatuses = useMemo(
    () => NEXT_STATUSES.filter((status) => status !== lead.status),
    [lead.status]
  );

  // Memoize score breakdown fields - use lead.scores array identity for stability
  const scoreFields = useMemo(
    () => {
      const score = lead.scores[0];
      if (!score) return [] as const;
      return [
        ["Rating", score.rating],
        ["Review volume", score.reviewVolume],
        ["Website gap", score.websiteGap],
        ["Social presence", score.socialPresence],
        ["Contact availability", score.contactAvailability],
        ["Business value", score.businessValue],
        ["Local demand", score.localDemand],
        ["Data quality", score.dataQuality],
      ] as const;
    },
    [lead.scores]
  );

  async function run(action: string, fn: () => Promise<LeadDetailType>) {
    setPending(action);
    setError(null);
    try {
      const updated = await fn();
      setLead(updated);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  async function generateDemo() {
    setPending("demo");
    setError(null);
    try {
      const { api } = await import("@/lib/api-client");
      await api.post("/api/leads/" + lead.id + "/demo", defaultDemoPayload(lead));
      const refreshed = await leadsApi.get(lead.id);
      setLead(refreshed);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="display text-2xl text-dash-foreground">{lead.business.name}</h1>
            <StatusBadge status={lead.status} />
          </div>
          <p className="mt-1 text-sm text-dash-muted-foreground">
            {lead.business.category} · {lead.business.city ?? "Unknown city"} ·{" "}
            <Link href={`/campaigns/${lead.campaignId}`} className="underline underline-offset-2">
              {lead.campaign.name}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value=""
            onChange={(event) => {
              if (event.target.value) run("status", () => leadsApi.updateStatus(lead.id, event.target.value as LeadStatus));
            }}
            className="w-40"
          >
            <option value="">Change status…</option>
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
          <Button variant="secondary" disabled={pending !== null} onClick={() => run("analyze", () => leadsApi.analyze(lead.id))}>
            {pending === "analyze" ? "Analyzing…" : "Analyze"}
          </Button>
          <Button variant="secondary" disabled={pending !== null} onClick={generateDemo}>
            {pending === "demo" ? "Generating…" : "Generate demo site"}
          </Button>
          <Button variant="secondary" disabled={pending !== null} onClick={() => run("pitch", () => leadsApi.pitch(lead.id))}>
            {pending === "pitch" ? "Writing…" : "Generate pitch"}
          </Button>
          <Button
            disabled={pending !== null}
            onClick={async () => {
              setPending("whatsapp");
              setError(null);
              try {
                const result = await leadsApi.whatsapp(lead.id);
                if (result.whatsappUrl) window.open(result.whatsappUrl, "_blank");
                const refreshed = await leadsApi.get(lead.id);
                setLead(refreshed);
              } catch (caught) {
                setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
              } finally {
                setPending(null);
              }
            }}
          >
            {pending === "whatsapp" ? "Preparing…" : "Send via WhatsApp"}
          </Button>
        </div>
      </div>

      {error && <p className="rounded-dash-lg border border-dash-destructive/30 bg-dash-destructive/10 p-3 text-sm text-dash-destructive">{error}</p>}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="score">Score</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="pitches">Pitches</TabsTrigger>
          <TabsTrigger value="outreach">Outreach</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Field label="Phone" value={lead.business.phone} />
              <Field label="Email" value={lead.business.email} />
              <div>
                <Field label="Website" value={lead.business.website} />
                {lead.business.websiteVerificationStatus && lead.business.websiteVerificationStatus !== "UNVERIFIED" && (
                  <div className="mt-1">
                    <WebsiteVerificationBadge status={lead.business.websiteVerificationStatus} />
                  </div>
                )}
              </div>
              <Field label="Address" value={lead.business.address} />
              <Field label="Rating" value={lead.business.rating ? `${lead.business.rating} (${lead.business.reviewCount ?? 0} reviews)` : null} />
              <Field label="Recommended service" value={lead.recommendedService} />
              {lead.summary && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-dash-muted-foreground">Summary</p>
                  <p className="mt-1 text-sm">{lead.summary}</p>
                </div>
              )}
              {lead.websiteProjects.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-dash-muted-foreground">Demo site</p>
                  <Link href={`/websites/${lead.websiteProjects[0]!.id}`} className="mt-1 inline-block text-sm text-dash-primary underline underline-offset-2">
                    View demo site ({lead.websiteProjects[0]!.status})
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="score">
          <Card>
            <CardHeader>
              <CardTitle>Latest score{lead.scores[0] ? ` — ${lead.scores[0].total}/100 (${lead.scores[0].classification})` : ""}</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.scores[0] ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {scoreFields.map(([label, value]) => (
                    <Field key={label} label={label} value={String(value)} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-dash-muted-foreground">No score yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis">
          <Card>
            <CardContent className="p-5">
              {lead.analyses[0] ? (
                <div className="flex flex-col gap-2 text-sm">
                  <p>
                    <StatusBadge status={lead.analyses[0].status} /> {new Date(lead.analyses[0].createdAt).toLocaleString()}
                  </p>
                  {lead.analyses[0].summary && <p>{lead.analyses[0].summary}</p>}
                  {lead.analyses[0].errorMessage && <p className="text-dash-destructive">{lead.analyses[0].errorMessage}</p>}
                </div>
              ) : (
                <p className="text-sm text-dash-muted-foreground">No AI analysis attempted yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="flex flex-col divide-y divide-dash-border p-0">
              {lead.activities.length === 0 ? (
                <p className="p-5 text-sm text-dash-muted-foreground">No activity yet.</p>
              ) : (
                lead.activities.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>{activity.type.replaceAll("_", " ")}</span>
                    <span className="text-dash-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pitches">
          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              {lead.pitches.length === 0 ? (
                <p className="text-sm text-dash-muted-foreground">No pitches generated yet.</p>
              ) : (
                lead.pitches.map((pitch) => (
                  <div key={pitch.id} className="rounded-dash-md border border-dash-border p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <StatusBadge status={pitch.status} />
                      <span className="text-xs text-dash-muted-foreground">{new Date(pitch.createdAt).toLocaleString()}</span>
                    </div>
                    <PitchBody content={pitch.content} className="text-dash-foreground" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outreach">
          <Card>
            <CardContent className="flex flex-col gap-2 p-5">
              {lead.outreach.length === 0 ? (
                <p className="text-sm text-dash-muted-foreground">No outreach sent yet.</p>
              ) : (
                lead.outreach.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span>
                      {item.channel} · <StatusBadge status={item.status} />
                    </span>
                    {item.whatsappUrl && (
                      <a href={item.whatsappUrl} target="_blank" rel="noreferrer" className="text-dash-primary underline underline-offset-2">
                        Open link
                      </a>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
