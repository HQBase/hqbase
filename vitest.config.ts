import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./app", import.meta.url).pathname,
      "@worker": new URL("./worker", import.meta.url).pathname
    }
  },
  test: {
    include: ["test/unit/**/*.test.{ts,mjs}", "test/migrations/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: ["app/**/*.{ts,tsx}", "worker/**/*.ts"],
      exclude: [
        "app/components/ui/**",
        "app/main.tsx",
        "worker/index.ts",
        "worker/features/mail-bridge/change-log.ts",
        "worker/features/mail-bridge/cursor.ts",
        "worker/features/mail-bridge/mutations.ts",
        "worker/features/mail-bridge/raw.ts",
        "worker/features/mail-bridge/routes-v2.ts",
        "worker/features/mail-bridge/sync.ts"
      ],
      thresholds: {
        branches: 20,
        functions: 15,
        lines: 20,
        statements: 20
      }
    }
  }
});
