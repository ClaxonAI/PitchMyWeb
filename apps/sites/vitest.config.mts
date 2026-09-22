import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appDir = path.dirname(fileURLToPath(import.meta.url));

// Server-render tests for the preview templates. tsconfig keeps JSX as-is for
// Next.js, so the test transform is told to compile it with React's runtime.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  resolve: { alias: { "@": path.resolve(appDir, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
