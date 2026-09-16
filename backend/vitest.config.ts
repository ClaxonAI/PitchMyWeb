import { defineConfig } from "vitest/config";

// No config existed before this hardening pass; vitest ran on its
// defaults, including a 5s per-test timeout. That default is fine for any
// single test file, but this suite's tests are real Postgres integration
// tests (lib/testing/db-test-helpers.ts) — running the full suite means
// dozens of files hitting the same database concurrently, and on this
// machine that scheduling/IO contention alone (not slow queries, not slow
// application code) was enough to push otherwise-sub-100ms tests past 5s
// under full-suite load, producing sporadic, non-deterministic failures.
// Raising the default budget makes `npx vitest run` reliable without
// touching any test's actual assertions or changing how many files run in
// parallel.
export default defineConfig({
  test: {
    testTimeout: 15000,
  },
});
