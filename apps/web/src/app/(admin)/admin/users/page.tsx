import type { Metadata } from "next";
import Link from "next/link";
import { adminFetch } from "@/lib/admin-fetch";
import { Badge } from "@/components/dashboard-ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";

export const metadata: Metadata = { title: "Users" };

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  planId: string | null;
  suspendedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; suspended?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.suspended) query.set("suspended", params.suspended);
  query.set("pageSize", "50");
  const result = await adminFetch<Paginated<AdminUser>>(`/api/admin/users?${query.toString()}`);
  const users = result?.items ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Users</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">{result ? `${result.total} accounts` : "Could not load users."}</p>
      </div>
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search email or name"
          className="h-9 flex-1 rounded-dash-md border border-dash-border bg-dash-background px-3 text-sm"
        />
        <button type="submit" className="h-9 rounded-dash-md bg-dash-primary px-4 text-sm text-dash-primary-foreground">
          Search
        </button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last login</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">
                  {user.email}
                </Link>
                {user.name ? <p className="text-xs text-dash-muted-foreground">{user.name}</p> : null}
              </TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>{user.planId ?? "—"}</TableCell>
              <TableCell>
                {user.suspendedAt ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="success">Active</Badge>}
              </TableCell>
              <TableCell className="text-xs text-dash-muted-foreground">
                {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
