import { defineConfig } from "vitest/config";

// Like the api suite, several of these tests run against the real local
// Postgres and Redis. The auth-state repository and the session lock are
// only meaningfully tested against the systems whose semantics they depend
// on — a fake Redis would happily "prove" a lock that a real one does not
// grant — so the default 5s per-test budget is raised for the same reason
// apps/api raises it.
export default defineConfig({
  test: {
    testTimeout: 15000,
    env: {
      // A fixed, publishable key: these tests encrypt throwaway values in a
      // throwaway database. dotenv does not override variables that are
      // already set, so this also keeps the real key in apps/api/.env out
      // of the test run.
      WA_AUTH_ENCRYPTION_KEY: "0".repeat(64),
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
  },
});
