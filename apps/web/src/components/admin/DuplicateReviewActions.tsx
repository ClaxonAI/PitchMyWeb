"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";

export function DuplicateReviewActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"merge" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "merge" | "dismiss") {
    setPending(kind);
    setError(null);
    try {
      await api.post(`/api/possible-duplicates/${id}/${kind}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending !== null} onClick={() => run("merge")}>
          {pending === "merge" ? "Merging…" : "Merge"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => run("dismiss")}>
          {pending === "dismiss" ? "Dismissing…" : "Dismiss"}
        </Button>
      </div>
      {error ? <p className="text-xs text-dash-destructive">{error}</p> : null}
    </div>
  );
}
