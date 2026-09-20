import type { Metadata } from "next";
import { adminFetch } from "@/lib/admin-fetch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";

export const metadata: Metadata = { title: "Audit log" };

type AuditRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
  actor: { id: string; email: string } | null;
};

type Paginated<T> = { items: T[]; total: number };

export default async function AdminAuditPage() {
  const result = await adminFetch<Paginated<AuditRow>>("/api/admin/audit?pageSize=50");
  const items = result?.items ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Audit log</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Admin actions across the platform.</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-dash-lg border border-dash-border bg-dash-card p-6 text-sm text-dash-muted-foreground">No audit events yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-xs text-dash-muted-foreground">{new Date(item.createdAt).toLocaleString()}</TableCell>
                <TableCell>{item.actor?.email ?? "—"}</TableCell>
                <TableCell>{item.action}</TableCell>
                <TableCell className="text-xs">
                  {item.targetType}
                  {item.targetId ? ` ${item.targetId}` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
