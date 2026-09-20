import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";
import { DarkModeToggle } from "@/components/dashboard/DarkModeToggle";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Settings</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Appearance and security.</p>
      </div>

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
    </div>
  );
}
