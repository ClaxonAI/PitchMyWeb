"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";

type Props = {
  userId: string;
  suspended: boolean;
  planId: string | null;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  viewerRole: "USER" | "ADMIN" | "SUPER_ADMIN";
};

export function AdminUserControls({ userId, suspended, planId, role, viewerRole }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {suspended ? (
          <Button disabled={pending} onClick={() => run(() => api.post(`/api/admin/users/${userId}/restore`))}>
            Restore
          </Button>
        ) : (
          <Button variant="destructive" disabled={pending} onClick={() => run(() => api.post(`/api/admin/users/${userId}/suspend`))}>
            Suspend
          </Button>
        )}
        <Button variant="outline" disabled={pending} onClick={() => run(() => api.patch(`/api/admin/users/${userId}/plan`, { planId: planId === "auto" ? "direct" : "auto" }))}>
          Set plan {planId === "auto" ? "direct" : "auto"}
        </Button>
        {planId ? (
          <Button variant="ghost" disabled={pending} onClick={() => run(() => api.patch(`/api/admin/users/${userId}/plan`, { planId: null }))}>
            Clear plan
          </Button>
        ) : null}
        {viewerRole === "SUPER_ADMIN" ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(() =>
                api.patch(`/api/admin/users/${userId}/role`, {
                  role: role === "USER" ? "ADMIN" : "USER",
                }),
              )
            }
          >
            {role === "USER" ? "Make admin" : "Make user"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-dash-destructive">{error}</p> : null}
    </div>
  );
}
