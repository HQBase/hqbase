import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc"
      },
      miniflare: {
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
