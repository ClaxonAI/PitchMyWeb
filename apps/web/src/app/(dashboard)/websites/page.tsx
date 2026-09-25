import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { Paginated, WebsiteProject } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Download } from "lucide-react";
import { Button } from "@/components/dashboard-ui/button";

export const metadata: Metadata = { title: "Websites" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function loadWebsites(): Promise<Paginated<WebsiteProject> | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/websites?pageSize=50`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as Paginated<WebsiteProject>;
  } catch {
    return null;
  }
}

export default async function WebsitesPage() {
  const result = await loadWebsites();
  const websites = result?.items ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="display text-2xl text-dash-foreground">Websites</h1>
        <p className="mt-1 text-sm text-dash-muted-foreground">Every demo site generated for a lead. Download any published site as a ZIP to host it anywhere.</p>
      </div>

      {websites.length === 0 ? (
        <p className="rounded-dash-lg border border-dash-border bg-dash-card p-6 text-sm text-dash-muted-foreground">
          No demo sites yet — generate one from a lead&apos;s detail page.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {websites.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">
                  <Link href={`/websites/${project.id}`} className="hover:underline">
                    {project.template}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={project.status} />
                </TableCell>
                <TableCell className="font-mono text-xs">{project.slug}</TableCell>
                <TableCell className="text-dash-muted-foreground">{new Date(project.updatedAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {project.status === "PUBLISHED" ? (
                    <Button asChild variant="ghost" size="sm" title="Download this website as a ZIP (HTML, CSS, fonts and images)">
                      <a href={`/api/websites/${project.id}/download`} download>
                        <Download /> ZIP
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-dash-muted-foreground">Publish first</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
