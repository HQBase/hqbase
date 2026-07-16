import { describe, expect, it } from "vitest";

import { createWranglerConfig } from "../../../scripts/hqbase/config.mjs";
import { createManifest } from "../../../scripts/hqbase/install.mjs";

describe("HQBase operator upgrade identity", () => {
  it("persists a durable installation ID and upgrade OAuth configuration", () => {
    const manifest = createManifest("upgrade-e2e", {
      appDomain: "upgrade-e2e.hqbase.io",
      d1Name: "community-upgrade-db",
      installationId: "00000000-0000-4000-8000-000000000123",
      r2Bucket: "community-upgrade-mail",
      workerName: "community-upgrade-worker"
    });
    const config = createWranglerConfig(manifest);

    expect(manifest.installationId).toBe("00000000-0000-4000-8000-000000000123");
    expect(config.name).toBe("community-upgrade-worker");
    expect(config.d1_databases[0]).toMatchObject({ database_name: "community-upgrade-db" });
    expect(config.r2_buckets[0]).toMatchObject({ bucket_name: "community-upgrade-mail" });
    expect(config.assets).toMatchObject({
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"]
    });
    expect(config.vars).toMatchObject({
      HQBASE_BILLING_URL: "https://billing.hqbase.io",
      HQBASE_INSTALLATION_ID: manifest.installationId,
      HQBASE_UPGRADE_CLOUDFLARE_OAUTH_CLIENT_ID: "1c413f324b518b452096929b847e6703",
      HQBASE_UPGRADE_CLOUDFLARE_OAUTH_REDIRECT_URI: "https://auth.hqbase.io/upgrade/oauth/callback"
    });
  });

  it("generates an installation ID for a new operator deployment", () => {
    expect(createManifest("upgrade-e2e", {}).installationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
