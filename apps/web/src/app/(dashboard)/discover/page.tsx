import type { Metadata } from "next";
import { DiscoverForm } from "@/components/dashboard/DiscoverForm";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Find businesses</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">
          New accounts get 10 free pitches. Link your WhatsApp, then search businesses without a website — nothing scrapes until you press Find. After
          a run, pitches send from your number automatically, and the number is signed out once they have all gone out.
        </p>
      </div>
      <DiscoverForm />
    </div>
  );
}