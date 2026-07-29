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
          BETTER_AUTH_SECRET: "integration-auth-secret-A7x9Q2m4V8p6L1s3",
          VAPID_PRIVATE_KEY: "integration-vapid-private-key",
          VAPID_PUBLIC_KEY: "integration-vapid-public-key"
        },
        serviceBindings: {
          ASSETS: async () => new Response("Not found", { status: 404 })
        }
      }
    })
  ],
  test: {
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["sanitize-html"]
        }
      }
    },
    include: ["test/integration/worker/**/*.test.ts"]
  }
});
