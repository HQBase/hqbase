import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc"
      },
      miniflare: {
        bindings: {
          BETTER_AUTH_SECRET: "integration-auth-secret",
          PRO_APP_PASSWORD_PEPPER: "integration-app-password-pepper",
          PRO_BRIDGE_TOKEN: "integration-bridge-token",
          PRO_SESSION_SECRET: "integration-session-secret"
        },
        serviceBindings: {
          ASSETS: async () => new Response("Not found", { status: 404 })
        }
      }
    })
  ],
  test: {
    include: ["test/integration/worker/**/*.test.ts"]
  }
});
