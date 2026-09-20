"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsSummary } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";

const KPI_ITEMS: Array<{ key: keyof AnalyticsSummary; label: string; format?: (value: number) => string }> = [
  { key: "totalBusinesses", label: "Businesses found" },
  { key: "qualifiedLeads", label: "Qualified leads" },
  { key: "demosGenerated", label: "Demos generated" },
  { key: "pitches", label: "Pitches sent" },
  { key: "replies", label: "Replies" },
  { key: "interested", label: "Interested" },
  { key: "won", label: "Won" },
  { key: "pipelineValue", label: "Pipeline value", format: (value) => `₹${value.toLocaleString("en-IN")}` },
];

const FUNNEL_LABELS: Record<keyof AnalyticsSummary["funnel"], string> = {
  found: "Found",
  qualified: "Qualified",
  analyzed: "Analyzed",
  demo: "Demo",
  pitched: "Pitched",
  replied: "Replied",
  interested: "Interested",
  won: "Won",
};

export function AnalyticsOverview({ analytics }: { analytics: AnalyticsSummary }) {
  const funnelData = (Object.keys(FUNNEL_LABELS) as Array<keyof AnalyticsSummary["funnel"]>).map((key) => ({
    stage: FUNNEL_LABELS[key],
    count: analytics.funnel[key],
  }));

  const byCategory = analytics.breakdown.byCategory.slice(0, 8).map((row) => ({ name: row.category, count: row.businessCount }));
  const byService = analytics.breakdown.byRecommendedService.slice(0, 8).map((row) => ({ name: row.recommendedService ?? "Unassigned", count: row.leadCount }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {KPI_ITEMS.map((item) => {
          const raw = analytics[item.key];
          const value = typeof raw === "number" ? raw : 0;
          return (
            <Card key={item.key}>
              <CardHeader className="p-4 pb-1">
                <CardTitle>{item.label}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="display text-2xl text-dash-foreground">{item.format ? item.format(value) : value.toLocaleString()}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Acquisition funnel</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--dash-border)" />
                <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "var(--dash-muted-foreground)" }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: "var(--dash-muted-foreground)" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--dash-popover)", border: "1px solid var(--dash-border)", borderRadius: 8, color: "var(--dash-popover-foreground)" }} />
                <Bar dataKey="count" fill="var(--dash-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads by recommended service</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byService} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--dash-border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--dash-muted-foreground)" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--dash-muted-foreground)" }} width={110} />
                <Tooltip contentStyle={{ background: "var(--dash-popover)", border: "1px solid var(--dash-border)", borderRadius: 8, color: "var(--dash-popover-foreground)" }} />
                <Bar dataKey="count" fill="var(--dash-primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Businesses by category</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--dash-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--dash-muted-foreground)" }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: "var(--dash-muted-foreground)" }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--dash-popover)", border: "1px solid var(--dash-border)", borderRadius: 8, color: "var(--dash-popover-foreground)" }} />
                <Bar dataKey="count" fill="var(--dash-accent)" stroke="var(--dash-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
