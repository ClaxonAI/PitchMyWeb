import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { LeadDetail as LeadDetailType } from "@/lib/api-client";
import { LeadDetail } from "@/components/dashboard/LeadDetail";

export const metadata: Metadata = { title: "Lead" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadLead(id: string): Promise<LeadDetailType | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/leads/${id}`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as LeadDetailType;
  } catch {
    return null;
  }
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await loadLead(id);
  if (!lead) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <LeadDetail initialLead={lead} />
    </div>
  );
}
