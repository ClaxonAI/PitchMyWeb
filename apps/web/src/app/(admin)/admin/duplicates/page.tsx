import type { Metadata } from "next";
import { adminFetch } from "@/lib/admin-fetch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { DuplicateReviewActions } from "@/components/admin/DuplicateReviewActions";

export const metadata: Metadata = { title: "Duplicates" };

type Duplicate = {
  id: string;
  score: number;
  status: string;
  business: { id: string; name: string; city: string | null };
  candidate: { id: string; name: string; city: string | null };
};

type Paginated<T> = { items: T[]; total: number };

export default async function AdminDuplicatesPage() {
  const result = await adminFetch<Paginated<Duplicate>>("/api/possible-duplicates?status=PENDING&pageSize=50");
  const items = result?.items ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Possible duplicates</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Review queue for businesses the dedup engine flagged.</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-dash-lg border border-dash-border bg-dash-card p-6 text-sm text-dash-muted-foreground">No pending duplicates.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Winner</TableHead>
              <TableHead>Candidate</TableHead>
              <TableHead>Score</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {item.business.name}
                  <p className="text-xs text-dash-muted-foreground">{item.business.city ?? "—"}</p>
                </TableCell>
                <TableCell>
                  {item.candidate.name}
                  <p className="text-xs text-dash-muted-foreground">{item.candidate.city ?? "—"}</p>
                </TableCell>
                <TableCell>{item.score.toFixed(2)}</TableCell>
                <TableCell>
                  <DuplicateReviewActions id={item.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
