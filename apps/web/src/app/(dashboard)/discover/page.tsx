import { redirect } from "next/navigation";

// New campaign moved to /campaigns/new, inside Campaigns. Kept so old links
// and bookmarks still land there.
export default function DiscoverPage() {
  redirect("/campaigns/new");
}
