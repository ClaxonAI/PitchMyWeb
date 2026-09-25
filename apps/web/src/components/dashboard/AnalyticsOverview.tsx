"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, Handshake, IndianRupee, MessageSquare, MonitorPlay, Search, Send, ThumbsUp, Trophy, Users } from "lucide-react";
import type { AnalyticsSummary } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/dashboard-ui/card";
import { EmptyState } from "@/components/dashboard-ui/empty-state";
import { StatTile, compactNumber } from "@/components/dashboard-ui/stat-tile";

type Kpi = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: (a: AnalyticsSummary) => number;
  format?: (value: number) => string;
  emphasis?: boolean;
};

// "Pitches sent" reads funnel.pitched, not the top-level `pitches`: that one
// counts PITCH_GENERATED (every draft generation, re-generations included),
// so labelling it "sent" reported 0 for a campaign that had actually
// delivered three. See the analytics service's own note on the two counts.
const KPIS: Kpi[] = [
  { label: "Businesses found", icon: Building2, value: (a) => a.totalBusinesses },
  { label: "Qualified leads", icon: Users, value: (a) => a.qualifiedLeads },
  { label: "Demos generated", icon: MonitorPlay, value: (a) => a.demosGenerated },
  { label: "Pitches sent", icon: Send, value: (a) => a.funnel.pitched },
  { label: "Replies", icon: MessageSquare, value: (a) => a.replies },
  { label: "Interested", icon: ThumbsUp, value: (a) => a.interested },
  { label: "Won", icon: Trophy, value: (a) => a.won, emphasis: true },
  {
    label: "Pipeline value",
    icon: IndianRupee,
    value: (a) => a.pipelineValue,
    format: (value) => `₹${compactNumber(value)}`,
    emphasis: true,
  },
];

const FUNNEL_STAGES: Array<{ key: keyof AnalyticsSummary["funnel"]; label: string }> = [
  { key: "found", label: "Found" },
  { key: "qualified", label: "Qualified" },
  { key: "analyzed", label: "Analyzed" },
  { key: "demo", label: "Demo built" },
  { key: "pitched", label: "Pitched" },
  { key: "replied", label: "Replied" },
  { key: "interested", label: "Interested" },
  { key: "won", label: "Won" },
];

const AXIS_TICK = { fontSize: 11, fill: "var(--dash-muted-foreground)" } as const;
const TOOLTIP_STYLE = {
  background: "var(--dash-popover)",
  border: "1px solid var(--dash-border)",
  borderRadius: 8,
  color: "var(--dash-popover-foreground)",
  fontSize: 12,
} as const;
// Recharts' default bar cursor is an opaque grey block that swamps a thin
// mark; a faint wash keeps the hovered row legible underneath.
const TOOLTIP_CURSOR = { fill: "var(--dash-accent)", fillOpacity: 0.4 } as const;

/** Horizontal, because eight ordered stage names do not fit under vertical bars
 *  without rotating the labels into each other. One series, so one hue. */
function FunnelChart({ data }: { data: Array<{ stage: string; count: number }> }) {
  // Headroom, so the longest bar stops short of the axis end instead of
  // running edge to edge and reading as a solid block.
  const max = Math.max(...data.map((row) => row.count), 1);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="var(--dash-border)" />
        <XAxis type="number" domain={[0, Math.ceil(max * 1.15)]} tick={AXIS_TICK} allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="stage" tick={AXIS_TICK} width={86} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
        <Bar dataKey="count" fill="var(--dash-primary)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
          <LabelList dataKey="count" position="right" className="fill-dash-muted-foreground" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A ranked list of 1-8 rows in a fixed-height box leaves the rows floating in
 *  dead space, so the plot grows with the data instead. */
function rankedHeight(rows: number): number {
  return Math.max(132, Math.min(288, rows * 38 + 48));
}

/** Horizontal for the same reason: category and service names are long. */
function RankedBars({ data, highlightFirst = false }: { data: Array<{ name: string; count: number }>; highlightFirst?: boolean }) {
  const max = Math.max(...data.map((row) => row.count), 1);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="var(--dash-border)" />
        <XAxis type="number" domain={[0, Math.ceil(max * 1.15)]} tick={AXIS_TICK} allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={116} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={TOOLTIP_CURSOR} />
        <Bar dataKey="count" fill="var(--dash-primary)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
          {/* Emphasis, not a value-ramp: only the leader takes the accent, the
              rest stay recessive so the ranking reads without extra hues. */}
          {highlightFirst ? data.map((row, index) => <Cell key={row.name} fillOpacity={index === 0 ? 1 : 0.45} />) : null}
          <LabelList dataKey="count" position="right" className="fill-dash-muted-foreground" fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AnalyticsOverview({ analytics }: { analytics: AnalyticsSummary }) {
  const funnelData = FUNNEL_STAGES.map((stage) => ({ stage: stage.label, count: analytics.funnel[stage.key] }));
  const byCategory = analytics.breakdown.byCategory.slice(0, 8).map((row) => ({ name: row.category, count: row.businessCount }));
  const byService = analytics.breakdown.byRecommendedService.slice(0, 8).map((row) => ({ name: row.recommendedService ?? "Unassigned", count: row.leadCount }));

  // Nothing has been discovered yet, so every tile would read 0 and all three
  // plots would be bare axes. One explanation and the action that fixes it is
  // more use than a wall of zeros.
  if (analytics.totalBusinesses === 0 && analytics.qualifiedLeads === 0) {
    return (
      <Card>
        <EmptyState
          icon={Search}
          title="No results yet"
          description="Run a search and your funnel, conversion numbers and top categories will build up here as leads move through it."
          action={
            <Button asChild>
              <Link href="/campaigns/new">Find businesses</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {KPIS.map((kpi) => {
          const value = kpi.value(analytics);
          return (
            <StatTile
              key={kpi.label}
              label={kpi.label}
              icon={kpi.icon}
              emphasis={kpi.emphasis}
              value={kpi.format ? kpi.format(value) : compactNumber(value)}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Acquisition funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <FunnelChart data={funnelData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads by recommended service</CardTitle>
          </CardHeader>
          <CardContent className={byService.length ? undefined : "p-0"} style={byService.length ? { height: rankedHeight(byService.length) } : undefined}>
            {byService.length ? (
              <RankedBars data={byService} highlightFirst />
            ) : (
              <EmptyState
                compact
                icon={Handshake}
                title="No recommended services yet"
                description="Once leads are analysed, the service each one needs most shows up here."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Businesses by category</CardTitle>
          </CardHeader>
          <CardContent className={byCategory.length ? undefined : "p-0"} style={byCategory.length ? { height: rankedHeight(byCategory.length) } : undefined}>
            {byCategory.length ? (
              <RankedBars data={byCategory} highlightFirst />
            ) : (
              <EmptyState compact icon={Building2} title="No categories yet" description="Categories appear as soon as a search returns businesses." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
