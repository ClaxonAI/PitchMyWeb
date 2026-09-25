"use client";

import { useRouter } from "next/navigation";
import type { Campaign } from "@/lib/api-client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";

export function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();

  function openCampaign(id: string) {
    router.push(`/campaigns/${id}`);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((campaign) => (
          <TableRow
            key={campaign.id}
            className="cursor-pointer focus-visible:bg-dash-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dash-primary"
            role="link"
            tabIndex={0}
            onClick={() => openCampaign(campaign.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openCampaign(campaign.id);
              }
            }}
          >
            <TableCell className="font-medium">{campaign.name}</TableCell>
            <TableCell>{campaign.category}</TableCell>
            <TableCell>{campaign.location}</TableCell>
            <TableCell><StatusBadge status={campaign.status} /></TableCell>
            <TableCell className="text-dash-muted-foreground">{new Date(campaign.createdAt).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
