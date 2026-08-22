import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWranglerConfig } from "../../../scripts/hqbase/config.mjs";
import {
  cloudflareOAuthConfig,
  createManifest,
  install
} from "../../../scripts/hqbase/install.mjs";
import { deploymentDir, writeManifest } from "../../../scripts/hqbase/manifest.mjs";
import { updateOAuthManifest } from "../../../scripts/hqbase/oauth.mjs";

const repositoryWranglerConfig = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../wrangler.jsonc"), "utf8")
);
const mailEventsMigration = [{ tag: "mail-events-v1", new_sqlite_classes: ["MailEvents"] }];

function expectMailEventsConfiguration(config) {
  expect(config.durable_objects).toEqual({
    bindings: [{ name: "MAIL_EVENTS", class_name: "MailEvents" }]
  });
  expect(config.migrations).toEqual(mailEventsMigration);
}

describe("HQBase installation resources", () => {
  it("creates a fresh manifest with independent unclaimed resources", () => {
    const manifest = createManifest("qa", {});

    expect(manifest.d1).toEqual({
      name: "hqbase-qa",
      id: null,
      ownership: "unclaimed"
    });
    expect(manifest.r2).toEqual({
      bucket: "hqbase-qa-mail",
      ownership: "unclaimed"
    });
    expect(manifest.worker.name).toBe("hqbase-qa");
    expect(manifest.queue).toEqual({
      primary: { name: "hqbase-qa-jobs", id: null, ownership: "unclaimed" },
      deadLetter: { name: "hqbase-qa-jobs-dlq", id: null, ownership: "unclaimed" }
    });
    expect(manifest.version).toBe(3);
    expect(manifest.accountId).toBeNull();
    expect(manifest.cloudflareOAuth).toEqual({ mode: "official" });
  });

  it("refuses a legacy manifest during an install dry run", () => {
    const name = `legacy-dry-run-${process.pid}`;
    const current = createManifest(name, {});
    const legacy = {
      ...current,
      version: 2,
      d1: { name: current.d1.name, id: null, created: false, reused: true },
      r2: { bucket: current.r2.bucket, created: false, reused: true },
      queue: {
        name: current.queue.primary.name,
        deadLetterName: current.queue.deadLetter.name,
        created: false
      }
    };
    delete legacy.accountId;
    writeManifest(legacy);

    try {
      expect(() =>
        install({
          name,
          "dry-run": true,
          "skip-build": true,
          "skip-deploy": true
        })
      ).toThrow(/version.*must be 3/);
    } finally {
      rmSync(deploymentDir(name), { force: true, recursive: true });
    }
  });

  it("configures the MailEvents migration for a fresh installation", () => {
    const manifest = createManifest("qa", {});
    manifest.accountId = "a".repeat(32);

    const config = createWranglerConfig(manifest);

    expect(config.account_id).toBe("a".repeat(32));
    expect(config.queues).toEqual({
      producers: [{ binding: "HQBASE_JOBS", queue: "hqbase-qa-jobs" }],
      consumers: [
        {
          queue: "hqbase-qa-jobs",
          dead_letter_queue: "hqbase-qa-jobs-dlq",
          max_batch_size: 10,
          max_batch_timeout: 5,
          max_retries: 3
        }
      ]
    });
    expectMailEventsConfiguration(config);
  });

  it("keeps the MailEvents migration when an installed deployment is updated", () => {
    const manifest = createManifest("existing", {});
    manifest.accountId = "b".repeat(32);
    manifest.d1.id = "d1-existing";
    manifest.d1.ownership = "owned";
    manifest.worker.deployed = true;

    expectMailEventsConfiguration(createWranglerConfig(manifest));
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
    expect(official.version).toBe(3);
  });
});
