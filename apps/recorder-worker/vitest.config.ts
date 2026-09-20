import { defineConfig } from "vitest/config";

// The recording test drives a real headless Chromium and a real ffmpeg, so
// it needs far more than the default 5s.
export default defineConfig({
  test: {
    testTimeout: 180000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      WA_QUEUE_PREFIX: "bull-test",
    },
  },
});
