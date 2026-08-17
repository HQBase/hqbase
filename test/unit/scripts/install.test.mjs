import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWranglerConfig } from "../../../scripts/hqbase/config.mjs";
import { cloudflareOAuthConfig, createManifest } from "../../../scripts/hqbase/install.mjs";
import { updateOAuthManifest } from "../../../scripts/hqbase/oauth.mjs";

const repositoryWranglerConfig = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../wrangler.jsonc"), "utf8")
);

describe("HQBase installation resources", () => {
  it("creates a fresh, unowned manifest before provisioning", () => {
    const manifest = createManifest("qa", {});

    expect(manifest.d1).toEqual({
      name: "hqbase-qa",
      id: "00000000-0000-0000-0000-000000000000",
      created: false,
      reused: false
    });
    expect(manifest.r2).toEqual({
      bucket: "hqbase-qa-mail",
      created: false,
      reused: false
    });
    expect(manifest.worker.name).toBe("hqbase-qa");
    expect(manifest.queue.name).toBe("hqbase-qa-jobs");
    expect(manifest.version).toBe(2);
    expect(manifest.cloudflareOAuth).toEqual({ mode: "official" });
  });

  it("records customer-managed OAuth as non-secret deployment configuration", () => {
    const manifest = createManifest("customer", {
      authUrl: "https://mail.example.com",
      oauthClientId: "customer-client",
      oauthMode: "customer"
    });

    expect(manifest.cloudflareOAuth).toEqual({
      clientId: "customer-client",
      mode: "customer"
    });
    expect(manifest.authUrl).toBe("https://mail.example.com");

    const config = createWranglerConfig(manifest);
    expect(config.vars).toMatchObject({
      BETTER_AUTH_URL: "https://mail.example.com",
      CLOUDFLARE_OAUTH_CLIENT_ID: "customer-client",
      CLOUDFLARE_OAUTH_MODE: "customer"
    });
    expect(config.observability.logs.invocation_logs).toBe(false);
  });

  it("routes Worker-owned paths ahead of the single-page-application fallback", () => {
    const config = createWranglerConfig(createManifest("qa", {}));

    expect(config.assets.run_worker_first).toEqual([
      "/api/*",
      "/mcp",
      "/mcp/*",
      "/.well-known/*",
      "/skills/hqbase-mail/SKILL.md",
      "/AGENTS.md",
      "/agents.md"
    ]);
  });

  it("keeps asset routing identical to the repository Wrangler configuration", () => {
    const config = createWranglerConfig(createManifest("qa", {}));
    const { directory: _generated, ...generated } = config.assets;
    const { directory: _repository, ...repository } = repositoryWranglerConfig.assets;

    expect(generated).toEqual(repository);
  });

  it("keeps preview_urls identical to the repository Wrangler configuration", () => {
    const config = createWranglerConfig(createManifest("qa", {}));

    expect(config.preview_urls).toBe(repositoryWranglerConfig.preview_urls);
  });

  it("fails closed on incomplete customer-managed OAuth configuration", () => {
    expect(() =>
      cloudflareOAuthConfig({
        authUrl: undefined,
        clientId: "customer-client",
        mode: "customer"
      })
    ).toThrow("requires --auth-url");
    expect(() =>
      cloudflareOAuthConfig({
        authUrl: "https://mail.example.com/path",
        clientId: "customer-client",
        mode: "customer"
      })
    ).toThrow("without a path");
    expect(() =>
      cloudflareOAuthConfig({
        authUrl: "https://mail.example.com",
        clientId: "customer-client",
        mode: "token"
      })
    ).toThrow('must be "official" or "customer"');
    expect(() =>
      cloudflareOAuthConfig({
        authUrl: "https://mail.example.com",
        clientId: "unexpected",
        mode: "official"
      })
    ).toThrow("requires --oauth-mode customer");
  });

  it("switches an existing manifest between customer-managed and official OAuth", () => {
    const installed = createManifest("existing", {});
    const customer = updateOAuthManifest(installed, {
      authUrl: "https://mail.example.com",
      clientId: "customer-client",
      mode: "customer"
    });
    const official = updateOAuthManifest(customer, {
      authUrl: undefined,
      clientId: undefined,
      mode: "official"
    });

    expect(customer.cloudflareOAuth).toEqual({
      clientId: "customer-client",
      mode: "customer"
    });
    expect(official.cloudflareOAuth).toEqual({ mode: "official" });
    expect(official.authUrl).toBe("https://mail.example.com");
  });
});
