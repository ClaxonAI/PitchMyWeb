import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      WA_QUEUE_PREFIX: "bull-test",
    },
  },
});
