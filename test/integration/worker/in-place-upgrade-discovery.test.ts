import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import initialMigration from "../../../migrations/0001_initial.sql?raw";
import updatesMigration from "../../../migrations/0002_updates.sql?raw";
import preferencesMigration from "../../../migrations/0003_remote_media_preferences.sql?raw";
import upgradeMigration from "../../../migrations/0004_in_place_pro_upgrade.sql?raw";
import resumeMigration from "../../../migrations/0005_durable_upgrade_resume.sql?raw";
import { discoverCommunityInstallation } from "../../../worker/features/upgrades/cloudflare";
import type { WorkerEnv } from "../../../worker/lib/env";

const installationId = "00000000-0000-4000-8000-000000000123";
const workerName = "custom-community-worker";
const databaseId = "00000000-0000-4000-8000-000000000456";
let releaseKey = "";
let releaseEnvelope: { payload: string; signature: string };

async function applyMigration(source: string): Promise<void> {
  for (const statement of source
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

beforeAll(async () => {
  await applyMigration(initialMigration);
  await applyMigration(updatesMigration);
  await applyMigration(preferencesMigration);
  await applyMigration(upgradeMigration);
  await applyMigration(resumeMigration);
  const keys = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify"
  ])) as CryptoKeyPair;
  releaseKey = base64(new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey)));
  const manifest = {
    format: "hqbase-release-v1",
    edition: "community",
    channel: "stable",
    version: "0.1.4",
    minVersion: "0.1.3",
    artifact: { sha256: "a".repeat(64) }
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(manifest));
  releaseEnvelope = {
    payload: base64Url(payloadBytes),
    signature: base64Url(
      new Uint8Array(await crypto.subtle.sign("Ed25519", keys.privateKey, payloadBytes))
    )
  };
});

describe("automatic Community installation discovery", () => {
  it("selects the exact custom Worker and preserves custom D1, R2, routes, domains, and secrets", async () => {
    const result = await discoverCommunityInstallation(
      discoveryEnv(),
      "temporary-token",
      { installationId, workerName, workspaceOrigin: "https://mail.example.com" },
      cloudflareFixture()
    );
    expect(result.legacyRecovery).toBe(false);
    expect(result.inventory).toMatchObject({
      accountId: "account-a",
      workerName,
      installationId,
      activeVersionId: "community-version",
      d1DatabaseId: databaseId,
      d1DatabaseName: "custom-community-database",
      r2BucketName: "custom-community-mail-bucket",
      customDomains: ["mail.example.com"],
      routes: [{ id: "route-a", pattern: "mail.example.com/*" }]
    });
    expect(result.inventory.secretNames).toEqual(["BETTER_AUTH_SECRET", "EXISTING_CUSTOM_SECRET"]);
  });

  it("fails closed when the same Worker name exists in more than one authorized account", async () => {
    await expect(
      discoverCommunityInstallation(
        discoveryEnv(),
        "temporary-token",
        { installationId, workerName, workspaceOrigin: "https://mail.example.com" },
        cloudflareFixture({ duplicateAccount: true })
      )
    ).rejects.toMatchObject({ code: "UPGRADE_WORKER_AMBIGUOUS" });
  });

  it("fails before mutation on installation mismatch and malformed required bindings", async () => {
    await expect(
      discoverCommunityInstallation(
        discoveryEnv(),
        "temporary-token",
        { installationId, workerName, workspaceOrigin: "https://mail.example.com" },
        cloudflareFixture({ installationId: crypto.randomUUID() })
      )
    ).rejects.toMatchObject({ code: "UPGRADE_INSTALLATION_MISMATCH" });
    await expect(
      discoverCommunityInstallation(
        discoveryEnv(),
        "temporary-token",
        { installationId, workerName, workspaceOrigin: "https://mail.example.com" },
        cloudflareFixture({ missingR2: true })
      )
    ).rejects.toMatchObject({ code: "UPGRADE_BINDING_INVALID" });
  });

  it("rejects a forged Community release envelope", async () => {
    await expect(
      discoverCommunityInstallation(
        discoveryEnv(),
        "temporary-token",
        { installationId, workerName, workspaceOrigin: "https://mail.example.com" },
        cloudflareFixture({ invalidRelease: true })
      )
    ).rejects.toMatchObject({ code: "UPGRADE_RELEASE_UNSUPPORTED" });
  });

  it("rejects an unknown or partially migrated Community schema", async () => {
    await env.DB.prepare(
      "UPDATE app_release_state SET installed_schema_version = 99 WHERE singleton = 1"
    ).run();
    await expect(
      discoverCommunityInstallation(
        discoveryEnv(),
        "temporary-token",
        { installationId, workerName, workspaceOrigin: "https://mail.example.com" },
        cloudflareFixture()
      )
    ).rejects.toMatchObject({ code: "UPGRADE_SCHEMA_UNSUPPORTED" });
    await env.DB.prepare(
      "UPDATE app_release_state SET installed_schema_version = 5 WHERE singleton = 1"
    ).run();
  });
});

function cloudflareFixture(
  options: {
    duplicateAccount?: boolean;
    installationId?: string;
    invalidRelease?: boolean;
    missingR2?: boolean;
  } = {}
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "billing.test") {
      return Response.json(
        options.invalidRelease
          ? { ...releaseEnvelope, signature: base64Url(new Uint8Array(64)) }
          : releaseEnvelope
      );
    }
    const path = url.pathname;
    let result: unknown;
    if (path.endsWith("/accounts")) {
      result = [{ id: "account-a" }, { id: "account-b" }];
    } else if (path === "/client/v4/accounts/account-a/workers/scripts") {
      result = [{ id: "unrelated-hqbase" }, { id: workerName }];
    } else if (path === "/client/v4/accounts/account-b/workers/scripts") {
      result = options.duplicateAccount ? [{ id: workerName }] : [{ id: "another-worker" }];
    } else if (path.endsWith(`/workers/scripts/${workerName}/settings`)) {
      result = {
        compatibility_date: "2026-06-28",
        compatibility_flags: ["nodejs_compat"],
        assets: { not_found_handling: "single-page-application" },
        bindings: [
          { name: "DB", type: "d1", database_id: databaseId },
          ...(options.missingR2
            ? []
            : [
                {
                  name: "MAIL_OBJECTS",
                  type: "r2_bucket",
                  bucket_name: "custom-community-mail-bucket"
                }
              ]),
          { name: "MAIL_SENDER", type: "send_email" },
          {
            name: "HQBASE_INSTALLATION_ID",
            type: "plain_text",
            text: options.installationId ?? installationId
          },
          { name: "HQBASE_APP_VERSION", type: "plain_text", text: "0.1.3" },
          { name: "HQBASE_RELEASE_PUBLIC_KEY", type: "plain_text", text: releaseKey }
        ]
      };
    } else if (path.endsWith(`/workers/scripts/${workerName}/deployments`)) {
      result = {
        deployments: [{ versions: [{ version_id: "community-version", percentage: 100 }] }]
      };
    } else if (path.endsWith(`/workers/scripts/${workerName}/secrets`)) {
      result = [{ name: "EXISTING_CUSTOM_SECRET" }, { name: "BETTER_AUTH_SECRET" }];
    } else if (path.endsWith("/workers/domains")) {
      result = [{ hostname: "mail.example.com", service: workerName }];
    } else if (path.endsWith(`/workers/scripts/${workerName}/subdomain`)) {
      result = { enabled: true, previews_enabled: true };
    } else if (path.endsWith("/workers/subdomain")) {
      result = { subdomain: "test-account" };
    } else if (path.endsWith("/d1/database")) {
      result = [{ uuid: databaseId, name: "custom-community-database" }];
    } else if (path.endsWith("/zones")) {
      result = [{ id: "zone-a" }];
    } else if (path.endsWith("/zones/zone-a/workers/routes")) {
      result = [{ id: "route-a", pattern: "mail.example.com/*", script: workerName }];
    } else {
      return Response.json({ success: false, errors: [{ code: 1000 }] }, { status: 404 });
    }
    return Response.json({ success: true, result });
  }) as typeof fetch;
}

function discoveryEnv(): WorkerEnv {
  return {
    ...env,
    HQBASE_RELEASE_PUBLIC_KEY: releaseKey,
    HQBASE_RELEASES_URL: "https://billing.test/v1/releases"
  } as WorkerEnv;
}

function base64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function base64Url(value: Uint8Array): string {
  return base64(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
