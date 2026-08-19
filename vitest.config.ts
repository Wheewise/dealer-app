import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Vitest must not pick up Playwright e2e specs — they use a separate runner.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
});
