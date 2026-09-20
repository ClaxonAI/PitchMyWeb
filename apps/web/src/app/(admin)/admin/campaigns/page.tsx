import type { Metadata } from "next";
import { adminFetch } from "@/lib/admin-fetch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";

export const metadata: Metadata = { title: "Campaigns" };

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  location: string;
  category: string;
  createdAt: string;
  user: { id: string; email: string };
};

type Paginated<T> = { items: T[]; total: number };

export default async function AdminCampaignsPage() {
  const result = await adminFetch<Paginated<CampaignRow>>("/api/admin/campaigns?pageSize=50");
  const items = result?.items ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Campaigns</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Every campaign on the platform.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                {item.name}
                <p className="text-xs text-dash-muted-foreground">{item.category}</p>
              </TableCell>
              <TableCell>{item.user.email}</TableCell>
              <TableCell>{item.status}</TableCell>
              <TableCell>{item.location}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
