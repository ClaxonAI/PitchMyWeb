import type { Metadata } from "next";
import { cookies } from "next/headers";
import { WhatsAppPanel } from "@/components/dashboard/WhatsAppPanel";
import type { WhatsAppAccount } from "@/lib/api-client";

export const metadata: Metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// The session is already guaranteed by (dashboard)/layout.tsx — this page
// only needs its own data, not its own auth guard (the original
// /dashboard/whatsapp page's inline cookie-forwarding + redirect-on-401
// logic moved to lib/auth/require-session.ts and is now the shared
// layout's job). A non-401 failure (API down) still degrades to an empty
// list rather than crashing the page — that leniency is specific to this
// page's own data fetch, not a session decision.
async function loadAccounts(): Promise<WhatsAppAccount[]> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/whatsapp/accounts`, {
      headers: cookie ? { Cookie: cookie } : {},
      cache: "no-store",
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { items: WhatsAppAccount[] };
    return body.items;
  } catch {
    return [];
  }
}

export default async function WhatsAppDashboardPage() {
  const accounts = await loadAccounts();
  return <WhatsAppPanel initialAccounts={accounts} />;
}
