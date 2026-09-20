"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, websitesApi } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";

export function PublishWebsiteButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "PUBLISHED") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await websitesApi.publish(id);
            router.refresh();
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Publishing…" : "Publish"}
      </Button>
      {error && <p className="text-xs text-dash-destructive">{error}</p>}
    </div>
  );
}
