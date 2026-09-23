import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { WebsiteProject } from "@/lib/api-client";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { PublishWebsiteButton } from "@/components/dashboard/PublishWebsiteButton";

export const metadata: Metadata = { title: "Website" };
export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type WebsiteDetail = WebsiteProject & { versions: Array<{ id: string; versionNumber: number; createdAt: string }> };

async function loadWebsite(id: string): Promise<WebsiteDetail | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}/api/websites/${id}`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as WebsiteDetail;
  } catch {
    return null;
  }
}

function contentField(content: Record<string, unknown>, key: string): string | null {
  const value = content[key];
  return typeof value === "string" ? value : null;
}

export default async function WebsiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadWebsite(id);
  if (!project) notFound();

  const content = project.contentJSON;
  const hero = content.hero as Record<string, unknown> | undefined;
  const services = Array.isArray(content.services) ? (content.services as string[]) : [];
  const contact = content.contact as Record<string, unknown> | undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="display text-2xl text-dash-foreground">{contentField(content, "businessName") ?? project.template}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-dash-muted-foreground">
            {project.template}
          </p>
          {project.demoUrl && (
            <a href={project.demoUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-dash-primary underline underline-offset-2">
              View demo
            </a>
          )}
          {project.publishedUrl && (
            <a href={project.publishedUrl} target="_blank" rel="noreferrer" className="mt-1 ml-3 inline-block text-sm text-dash-primary underline underline-offset-2">
              View published site
            </a>
          )}
          <a href={`/api/websites/${project.id}/download`} className="mt-2 inline-block text-sm text-dash-primary underline underline-offset-2">
            Download source as ZIP
          </a>
        </div>
        <PublishWebsiteButton id={project.id} status={project.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-5 pt-0 text-sm">
          {hero && (
            <div>
              <p className="text-xs text-dash-muted-foreground">Hero</p>
              <p className="mt-0.5 font-medium">{contentField(hero, "headline")}</p>
              <p className="text-dash-muted-foreground">{contentField(hero, "subheadline")}</p>
            </div>
          )}
          {services.length > 0 && (
            <div>
              <p className="text-xs text-dash-muted-foreground">Services</p>
              <p className="mt-0.5">{services.join(", ")}</p>
            </div>
          )}
          {contact && (contentField(contact, "phone") || contentField(contact, "address")) && (
            <div>
              <p className="text-xs text-dash-muted-foreground">Contact</p>
              <p className="mt-0.5">{[contentField(contact, "phone"), contentField(contact, "address")].filter(Boolean).join(" · ")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-dash-border p-0">
          {project.versions.map((version) => (
            <div key={version.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>Version {version.versionNumber}</span>
              <span className="text-dash-muted-foreground">{new Date(version.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
