import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    fileURLToPath(new URL("./migrations", import.meta.url))
  );

  return {
    plugins: [
      cloudflareTest({
        wrangler: {
          configPath: "./wrangler.jsonc"
        },
        miniflare: {
          bindings: {
            BETTER_AUTH_SECRET: "integration-auth-secret-A7x9Q2m4V8p6L1s3",
            TEST_MIGRATIONS: migrations,
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
      hookTimeout: 30_000,
      include: ["test/integration/worker/**/*.test.ts"],
      testTimeout: 15_000
    }
  };
});
