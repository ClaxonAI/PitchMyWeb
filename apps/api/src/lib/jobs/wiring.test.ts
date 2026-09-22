import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Two lists in this repo decide whether a piece of background work runs at
// all, and nothing else references either of them — so an omission from
// either is invisible. Both were wrong at once: apps/verification-worker was
// never added to the pm2 process list, and the scheduler never called
// /api/internal/jobs/enqueue-website-verifications. The worker, the queue,
// the job and the endpoint all existed and were tested. Website verification
// had simply never run in production, and the dashboard renders UNVERIFIED as
// no badge at all, so nothing ever looked wrong.
//
// These tests compare each list against the directory it is supposed to
// cover, which is the only way an omission shows up as a failure rather than
// as silence.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");

describe("pm2 process list", () => {
  /**
   * Workspaces that hold a queue consumer and must therefore be running.
   * apps/python-discovery is deliberately absent: it consumes the same
   * `business-discovery` queue as apps/discovery-worker and its README is
   * explicit that only one of the two may run.
   */
  const WORKER_APPS = ["discovery-worker", "recorder-worker", "verification-worker", "whatsapp-worker"];

  const ecosystem = createRequire(import.meta.url)(path.join(repoRoot, "ecosystem.config.cjs")) as {
    apps: Array<{ name: string; cwd: string }>;
  };

  it("runs every worker app in the repository", () => {
    const configured = ecosystem.apps.map((app) => path.basename(app.cwd));
    for (const worker of WORKER_APPS) {
      expect(configured, `apps/${worker} has no entry in ecosystem.config.cjs, so it never runs`).toContain(worker);
    }
  });

  it("lists only workspaces that exist", () => {
    const workspaces = readdirSync(path.join(repoRoot, "apps"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    for (const app of ecosystem.apps) {
      // apps/api appears twice on purpose — once as the HTTP service, once as
      // the job scheduler — so this checks the directory, not uniqueness.
      expect(workspaces, `ecosystem.config.cjs points ${app.name} at ${app.cwd}, which does not exist`).toContain(path.basename(app.cwd));
    }
  });

  it("gives every process a distinct name", () => {
    const names = ecosystem.apps.map((app) => app.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("job scheduler", () => {
  const scheduler = readFileSync(path.join(repoRoot, "apps/api/scripts/job-scheduler.ts"), "utf8");

  it("calls every internal job route", () => {
    const routes = readdirSync(path.join(here, "../../app/api/internal/jobs"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/api/internal/jobs/${entry.name}`);

    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(scheduler, `${route} exists but no scheduler calls it, so that job never runs`).toContain(`"${route}"`);
    }
  });
});
