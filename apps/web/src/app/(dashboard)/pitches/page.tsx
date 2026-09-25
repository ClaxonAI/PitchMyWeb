import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { MessageSquareQuote } from "lucide-react";
import type { Lead, Paginated, Pitch } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Card } from "@/components/dashboard-ui/card";
import { EmptyState } from "@/components/dashboard-ui/empty-state";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { PitchBody } from "@/components/dashboard/PitchBody";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { SectionTabs } from "@/components/dashboard/SectionTabs";

export const metadata: Metadata = { title: "Pitches" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadPitches(): Promise<Paginated<Pitch & { lead: Lead }> | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/pitches?pageSize=50`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Paginated<Pitch & { lead: Lead }>;
  } catch {
    return null;
  }
}

export default async function PitchesPage() {
  const result = await loadPitches();
  const pitches = result?.items ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <SectionTabs section="campaigns" />
      <PageHeader title="Pitches" description="Every pitch generated across your campaigns." />

      {pitches.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquareQuote}
            title="No pitches yet"
            description="Each lead gets a pitch written for it once a search finishes and its demo site is built."
            action={
              <Button asChild>
                <Link href="/campaigns/new">Find businesses</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pitches.map((pitch) => (
            <div key={pitch.id} className="rounded-dash-lg border border-dash-border bg-dash-card p-4 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <Link href={`/leads/${pitch.leadId}`} className="font-medium hover:underline">
                  {pitch.lead.business.name}
                </Link>
                <div className="flex items-center gap-2">
                  <StatusBadge status={pitch.status} />
                  <span className="text-xs text-dash-muted-foreground">{new Date(pitch.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <PitchBody content={pitch.content} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
