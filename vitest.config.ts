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
        "app/main.tsx",
        "worker/index.ts",
        "worker/features/domains/queries.ts",
        "worker/features/domains/routes.ts",
        "worker/features/drafts/queries.ts",
        "worker/features/drafts/routes.ts",
        "worker/features/setup/cloudflare.ts"
      ],
      thresholds: {
        branches: 30,
        functions: 30,
        lines: 35,
        statements: 34,
        "app/features/compose/use-draft-autosave.ts": {
          branches: 65,
          functions: 85,
          lines: 80,
          statements: 80
        },
        "app/features/messages/use-mail-sync.ts": {
          branches: 50,
          functions: 80,
          lines: 80,
          statements: 80
        },
        "app/features/notifications/use-notifications.ts": {
          branches: 35,
          functions: 70,
          lines: 50,
          statements: 48
        },
        "app/features/updates/use-update-monitor.ts": {
          branches: 60,
          functions: 75,
          lines: 85,
          statements: 85
        }
      }
    }
  }
});
