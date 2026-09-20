import type { Metadata } from "next";
import { adminFetch } from "@/lib/admin-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";

export const metadata: Metadata = { title: "Pitches" };
type Pitch = { id: string; content: string; status: string; createdAt: string; lead: { business: { name: string }; campaign: { name: string; user: { email: string } } } };
type Result = { items: Pitch[]; total: number };

export default async function AdminPitchesPage() {
  const result = await adminFetch<Result>("/api/admin/pitches?pageSize=50");
  return <div className="mx-auto flex max-w-6xl flex-col gap-6"><div><h1 className="display text-2xl text-dash-foreground">All pitches</h1><p className="mt-1 text-sm text-dash-muted-foreground">{result ? `${result.total} generated pitches` : "Could not load pitches."}</p></div><Card><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-dash-border text-dash-muted-foreground"><th className="p-2">Business</th><th className="p-2">Customer</th><th className="p-2">Campaign</th><th className="p-2">Status</th><th className="p-2">Created</th></tr></thead><tbody>{(result?.items ?? []).map((pitch) => <tr key={pitch.id} className="border-b border-dash-border last:border-0"><td className="p-2 font-medium">{pitch.lead.business.name}</td><td className="p-2">{pitch.lead.campaign.user.email}</td><td className="p-2">{pitch.lead.campaign.name}</td><td className="p-2">{pitch.status}</td><td className="p-2 text-xs text-dash-muted-foreground">{new Date(pitch.createdAt).toLocaleString()}</td></tr>)}</tbody></table></CardContent></Card></div>;
}