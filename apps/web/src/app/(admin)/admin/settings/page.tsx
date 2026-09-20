import type { Metadata } from "next";
import { adminFetch } from "@/lib/admin-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { AdminSettingForm } from "@/components/admin/AdminSettingForm";

export const metadata: Metadata = { title: "Settings" };

type PublicSettings = {
  settings: Array<{ key: string; value: unknown; description: string | null }>;
};

export default async function AdminSettingsPage() {
  const data = await adminFetch<PublicSettings>("/api/admin/settings");
  const settings = data?.settings ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Platform settings</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Non-secret key/value configuration. Secrets stay in environment variables.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Current keys</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {settings.length === 0 ? (
            <p className="text-sm text-dash-muted-foreground">No settings stored yet.</p>
          ) : (
            settings.map((row) => (
              <div key={row.key} className="rounded-dash-md border border-dash-border p-3">
                <p className="font-mono text-sm">{row.key}</p>
                {row.description ? <p className="text-xs text-dash-muted-foreground">{row.description}</p> : null}
                <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(row.value, null, 2)}</pre>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Upsert</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminSettingForm />
        </CardContent>
      </Card>
    </div>
  );
}
