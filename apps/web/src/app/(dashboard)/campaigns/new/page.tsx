import type { Metadata } from "next";
import { DiscoverForm } from "@/components/dashboard/DiscoverForm";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">New campaign</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">
          Find businesses without a website, then choose which leads to pitch.
        </p>
      </div>
      <DiscoverForm />
    </div>
  );
}
