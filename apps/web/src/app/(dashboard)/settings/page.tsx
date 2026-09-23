import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Activity } from "lucide-react";
import type { Me } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";
import { DarkModeToggle } from "@/components/dashboard/DarkModeToggle";
import { ProfileForm } from "@/components/dashboard/ProfileForm";

export const metadata: Metadata = { title: "Settings" };

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadMe(): Promise<Me | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/me`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Me;
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  const me = await loadMe();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Settings</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Profile, security, appearance, and logs.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>{me ? <ProfileForm initialMe={me} /> : <p className="text-sm text-dash-muted-foreground">Unable to load your profile right now.</p>}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <DarkModeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/settings/logs" className="inline-flex items-center gap-2 text-sm text-dash-primary underline underline-offset-2">
            <Activity className="size-4" />
            View account logs
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
