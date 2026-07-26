import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./app", import.meta.url).pathname,
      "@worker": new URL("./worker", import.meta.url).pathname
    }
  },
  test: {
    include: ["test/unit/**/*.test.{ts,tsx,mjs}", "test/migrations/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: ["app/**/*.{ts,tsx}", "worker/**/*.ts"],
      exclude: [
        "app/components/ui/**",
        "app/**/*.tsx",
        "app/main.tsx",
        "worker/index.ts",
        "worker/features/domains/queries.ts",
        "worker/features/domains/routes.ts",
        "worker/features/drafts/queries.ts",
        "worker/features/drafts/routes.ts",
        "worker/features/setup/cloudflare.ts"
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
