export default function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-6xl animate-pulse flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-dash-md bg-dash-muted/20" />
        <div className="h-4 w-72 max-w-full rounded-dash-md bg-dash-muted/15" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 rounded-dash-lg border border-dash-border bg-dash-card" />
        <div className="h-28 rounded-dash-lg border border-dash-border bg-dash-card" />
        <div className="h-28 rounded-dash-lg border border-dash-border bg-dash-card" />
      </div>
      <div className="h-64 rounded-dash-lg border border-dash-border bg-dash-card" />
    </div>
  );
}