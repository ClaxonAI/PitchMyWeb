// Route-shaped loading states. Shown the instant a link is tapped (Next
// prefetches each route's loading boundary), so the page appears to open
// immediately and the data fills in, rather than the old page sitting still
// until the new one has loaded.

function Bar({ className }: { className: string }) {
  return <div className={`rounded-dash-md bg-dash-muted ${className}`} />;
}

function Header({ tabs = false }: { tabs?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {tabs && <Bar className="h-10 w-full max-w-md" />}
      <Bar className="h-8 w-48" />
      <Bar className="h-4 w-72 max-w-full" />
    </div>
  );
}

export function TablePageSkeleton({
  tabs = false,
  rows = 6,
  label,
}: {
  tabs?: boolean;
  rows?: number;
  label: string;
}) {
  return (
    <div
      className="mx-auto flex max-w-6xl animate-pulse flex-col gap-6"
      aria-busy="true"
      aria-label={label}
    >
      <Header tabs={tabs} />
      <div className="overflow-hidden rounded-dash-lg border border-dash-border bg-dash-card">
        <Bar className="h-11 w-full rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-dash-border px-4 py-3.5"
          >
            <Bar className="h-4 w-1/3" />
            <Bar className="h-4 w-1/5" />
            <Bar className="ml-auto h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailPageSkeleton({ label }: { label: string }) {
  return (
    <div
      className="mx-auto flex max-w-6xl animate-pulse flex-col gap-6"
      aria-busy="true"
      aria-label={label}
    >
      <Header />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-24 rounded-dash-lg border border-dash-border bg-dash-card p-4"
          >
            <Bar className="h-3 w-16" />
            <Bar className="mt-3 h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="h-72 rounded-dash-lg border border-dash-border bg-dash-card" />
    </div>
  );
}

export function FormPageSkeleton({
  tabs = false,
  label,
}: {
  tabs?: boolean;
  label: string;
}) {
  return (
    <div
      className="mx-auto flex max-w-2xl animate-pulse flex-col gap-6"
      aria-busy="true"
      aria-label={label}
    >
      <Header tabs={tabs} />
      {Array.from({ length: 2 }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-dash-lg border border-dash-border bg-dash-card p-5"
        >
          <Bar className="h-5 w-40" />
          <Bar className="h-10 w-full" />
          <Bar className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
