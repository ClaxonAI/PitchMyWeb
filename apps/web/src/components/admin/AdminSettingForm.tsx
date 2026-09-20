"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";

export function AdminSettingForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      let parsed: unknown = value;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      await api.patch("/api/admin/settings", { key, value: parsed });
      setKey("");
      setValue("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Key
        <input
          required
          value={key}
          onChange={(event) => setKey(event.target.value)}
          className="h-9 rounded-dash-md border border-dash-border bg-dash-background px-3"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Value (JSON or text)
        <textarea
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={4}
          className="rounded-dash-md border border-dash-border bg-dash-background px-3 py-2 font-mono text-xs"
        />
      </label>
      {error ? <p className="text-sm text-dash-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save setting"}
      </Button>
    </form>
  );
}
