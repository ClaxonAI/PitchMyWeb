import type { SessionUser } from "@/lib/auth/require-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";

export function AdminAccessDenied({ user }: { user: SessionUser }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Admin portal</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">
          This is <code className="font-mono">/admin</code>. Signed in as {user.email} ({user.role}). Only ADMIN and SUPER_ADMIN can open it.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Promote this account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-dash-muted-foreground">From the repo root:</p>
          <pre className="mt-2 overflow-x-auto rounded-dash-md border border-dash-border bg-dash-muted p-3 font-mono text-xs">
            npm run admin:promote -w apps/api -- {user.email}
          </pre>
          <p className="mt-3 text-sm text-dash-muted-foreground">Then refresh this page, or log out and back in.</p>
        </CardContent>
      </Card>
    </div>
  );
}
