import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { Lead, Paginated, Pitch } from "@/lib/api-client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

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
      <div>
        <h1 className="display text-2xl text-dash-foreground">Pitches</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Every pitch generated across your campaigns.</p>
      </div>

      {pitches.length === 0 ? (
        <p className="rounded-dash-lg border border-dash-border bg-dash-card p-6 text-sm text-dash-muted-foreground">No pitches generated yet.</p>
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
              <p className="whitespace-pre-wrap text-dash-muted-foreground">{pitch.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
