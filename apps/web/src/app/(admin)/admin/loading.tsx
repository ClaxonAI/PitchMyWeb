import { TablePageSkeleton } from "@/components/dashboard-ui/page-skeleton";

// Every admin page is a table; show one the instant a link is tapped instead
// of leaving the previous page on screen until the new one has loaded.
export default function AdminLoading() {
  return <TablePageSkeleton label="Loading admin" />;
}
