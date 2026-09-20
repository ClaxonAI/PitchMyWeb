import { defineConfig } from "vitest/config";

// Playwright escalation tests drive a real headless Chromium in a couple of
// cases, so give them more headroom than the default 5s (mirrors
// apps/recorder-worker's own reasoning).
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      WA_QUEUE_PREFIX: "bull-test",
    },
  },
});
