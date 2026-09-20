"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/dashboard-ui/input";
import { Select } from "@/components/dashboard-ui/select";
import { Button } from "@/components/dashboard-ui/button";

const STATUSES = ["NEW", "ANALYZED", "SITE_READY", "PITCHED", "REPLIED", "INTERESTED", "NEGOTIATING", "WON", "LOST"];

export function LeadFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/leads?${params.toString()}`);
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setParam("search", search);
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-dash-muted-foreground">Search</label>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Business name" className="w-48" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-dash-muted-foreground">Status</label>
        <Select defaultValue={searchParams.get("status") ?? ""} onChange={(event) => setParam("status", event.target.value)} className="w-40">
          <option value="">Any status</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-dash-muted-foreground">Min score</label>
        <Input type="number" min={0} max={100} defaultValue={searchParams.get("minScore") ?? ""} onBlur={(event) => setParam("minScore", event.target.value)} className="w-24" />
      </div>
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}
