import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Download } from "lucide-react";
import type { Paginated, WebsiteProject } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/dashboard-ui/table";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

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
        <p className="mt-1 text-sm text-dash-muted-foreground">Every demo site generated for a lead.</p>
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
              <TableHead>Live URL</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Updated</TableHead>
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
                <TableCell>
                  {project.publishedUrl || project.demoUrl ? (
                    <a href={project.publishedUrl || project.demoUrl || undefined} target="_blank" rel="noreferrer" className="text-dash-primary underline underline-offset-2">
                      {project.publishedUrl || project.demoUrl}
                    </a>
                  ) : (
                    <span className="text-dash-muted-foreground">Not published</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button asChild variant="ghost" size="sm" title="Download website source as ZIP">
                    <a href={`/api/websites/${project.id}/download`}>
                      <Download className="size-4" />
                      <span className="sr-only">Download ZIP</span>
                    </a>
                  </Button>
                </TableCell>
                <TableCell className="text-dash-muted-foreground">{new Date(project.updatedAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
