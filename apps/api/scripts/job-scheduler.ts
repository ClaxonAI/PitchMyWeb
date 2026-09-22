// Long-running scheduler for the internal housekeeping jobs. Nothing else in
// the repo calls them, and without them stuck searches are never expired,
// WhatsApp outcomes are not synced onto pipelines, and failed pitches are
// never re-queued (lib/jobs/pipeline-maintenance.job.ts).
//
//   npm run jobs            (from the repo root or apps/api)
//
// Run it as its own process next to the API in every environment. It only
// talks to the API over HTTP with INTERNAL_JOBS_SECRET, so it works the same
// locally and against a deployed API. If you would rather use a platform cron
// (Vercel, Cloud Scheduler, ...), POST the same paths every 5 minutes with
// `Authorization: Bearer $INTERNAL_JOBS_SECRET` and skip this process.

const BASE_URL = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const SECRET = process.env.INTERNAL_JOBS_SECRET?.trim();
const INTERVAL_MS = Number(process.env.JOBS_INTERVAL_MS ?? 5 * 60 * 1000);
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
// Every route under src/app/api/internal/jobs belongs here: these are the
// only callers of any of them, so a route left out of this list is a job that
// never runs anywhere. enqueue-website-verifications was missing for exactly
// that reason — the endpoint, the job and the worker all existed and were
// tested, and no scheduler ever asked for them. src/lib/jobs/wiring.test.ts
// fails if the two lists drift apart again.
const JOBS = [
  "/api/internal/jobs/expire-stale-runs",
  "/api/internal/jobs/pipeline-maintenance",
  "/api/internal/jobs/enqueue-website-verifications",
];

if (!SECRET || SECRET.length < 24) {
  console.error("INTERNAL_JOBS_SECRET must be set (at least 24 characters). Exiting.");
  process.exit(1);
}
if (!Number.isFinite(INTERVAL_MS) || INTERVAL_MS < 10_000) {
  console.error("JOBS_INTERVAL_MS must be a number of at least 10000. Exiting.");
  process.exit(1);
}

function log(level: "info" | "error", message: string, extra: Record<string, unknown> = {}): void {
  console[level === "error" ? "error" : "log"](JSON.stringify({ level, service: "job-scheduler", time: new Date().toISOString(), message, ...extra }));
}

async function runJob(path: string): Promise<void> {
  const started = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (response.ok) log("info", "job ok", { path, status: response.status, ms });
    else log("error", "job failed", { path, status: response.status, ms });
  } catch (error) {
    log("error", "job unreachable", { path, error: error instanceof Error ? error.message : String(error) });
  }
}

let running = false;
async function tick(): Promise<void> {
  // Never overlap ticks: a slow API must not pile up concurrent job runs.
  if (running) return;
  running = true;
  try {
    for (const path of JOBS) await runJob(path);
  } finally {
    running = false;
  }
}

log("info", "job scheduler started", { baseUrl: BASE_URL, intervalMs: INTERVAL_MS, jobs: JOBS });
void tick();
const timer = setInterval(() => void tick(), INTERVAL_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    log("info", "job scheduler stopping", { signal });
    process.exit(0);
  });
}
