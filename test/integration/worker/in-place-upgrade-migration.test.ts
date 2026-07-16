import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import initialMigration from "../../../migrations/0001_initial.sql?raw";
import updatesMigration from "../../../migrations/0002_updates.sql?raw";
import preferencesMigration from "../../../migrations/0003_remote_media_preferences.sql?raw";
import upgradeMigration from "../../../migrations/0004_in_place_pro_upgrade.sql?raw";
import resumeMigration from "../../../migrations/0005_durable_upgrade_resume.sql?raw";
import {
  persistUpgradeContinuation,
  resolveUpgradeDraft
} from "../../../worker/features/upgrades/continuation";
import { previewUrl } from "../../../worker/features/upgrades/deployment";
import { fetchCandidateVerification } from "../../../worker/features/upgrades/migration";
import {
  enableCandidatePreview,
  restoreCandidatePreview
} from "../../../worker/features/upgrades/preview";
import { ensureInstallationIdentity, getUpgrade } from "../../../worker/features/upgrades/queries";
import {
  readPreparedResources,
  recordPreparedSecretOwnership,
  requireCandidateRelease
} from "../../../worker/features/upgrades/resources";
import type { WorkerEnv } from "../../../worker/lib/env";

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
});

describe("in-place Community to Pro migration", () => {
  it("stores one durable installation identity and rejects Worker drift", async () => {
    const created = await ensureInstallationIdentity(env.DB, "custom-community");
    expect(created.installationId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      ensureInstallationIdentity(env.DB, "custom-community", created.installationId)
    ).resolves.toEqual(created);
    await expect(ensureInstallationIdentity(env.DB, "other-worker")).rejects.toThrow("Worker name");
  });

  it("enforces a durable single-upgrade lock without storing credentials", async () => {
    const identity = await ensureInstallationIdentity(env.DB, "custom-community");
    const values = [
      crypto.randomUUID(),
      identity.installationId,
      identity.workerName,
      "https://custom-community.example.workers.dev",
      "nonce-hash",
      "c".repeat(43),
      new Date().toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
      new Date().toISOString()
    ];
    const insert = () =>
      env.DB.prepare(
        `INSERT INTO community_pro_upgrades
         (id, installation_id, worker_name, workspace_origin, install_mode,
          purchase_nonce_hash, code_challenge, state, created_at, expires_at, updated_at)
         VALUES (?, ?, ?, ?, 'community_upgrade', ?, ?, 'created', ?, ?, ?)`
      )
        .bind(...values)
        .run();
    await insert();
    values[0] = crypto.randomUUID();
    await expect(insert()).rejects.toThrow();

    const columns = await env.DB.prepare("PRAGMA table_info(community_pro_upgrades)").all<{
      name: string;
    }>();
    expect(columns.results.map((column) => column.name)).toContain("continuation_ciphertext");
    expect(columns.results.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(["cloudflare_token", "license_key", "secret_value"])
    );
  });

  it("records resource ownership without secret values", async () => {
    const row = await env.DB.prepare(
      "SELECT id FROM community_pro_upgrades ORDER BY created_at DESC LIMIT 1"
    ).first<{ id: string }>();
    expect(row?.id).toBeTruthy();
    const prepared = {
      jobsQueue: "custom-pro-jobs",
      deadLetterQueue: "custom-pro-dlq",
      resources: [
        {
          type: "d1" as const,
          name: "DB",
          id: "database-id",
          ownership: "reused" as const,
          disposition: "persistent" as const
        }
      ]
    };
    await env.DB.prepare(
      "UPDATE community_pro_upgrades SET state = 'resources_prepared', created_resources_json = ? WHERE id = ?"
    )
      .bind(JSON.stringify(prepared), row?.id)
      .run();
    await recordPreparedSecretOwnership(
      env.DB,
      row?.id ?? "",
      prepared,
      ["BETTER_AUTH_SECRET", "PRO_BRIDGE_TOKEN"],
      ["PRO_BRIDGE_TOKEN", "PRO_ENTITLEMENT_SECRET", "HQBASE_SETUP_OAUTH_ACCESS_TOKEN"]
    );
    const stored = await readPreparedResources(env.DB, row?.id ?? "");
    expect(stored.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "PRO_BRIDGE_TOKEN", ownership: "reused" }),
        expect.objectContaining({ name: "PRO_ENTITLEMENT_SECRET", ownership: "created" }),
        expect.objectContaining({
          name: "HQBASE_SETUP_OAUTH_ACCESS_TOKEN",
          ownership: "created",
          disposition: "disposable"
        })
      ])
    );
    expect(JSON.stringify(stored)).not.toContain("secret-value");
  });

  it("durably binds migration and preview verification to the signed candidate release", async () => {
    const prepared = {
      jobsQueue: "custom-pro-jobs",
      deadLetterQueue: "custom-pro-dlq",
      candidateRelease: {
        version: "0.1.5",
        mainSha256: "a".repeat(64)
      },
      resources: []
    };
    expect(requireCandidateRelease(prepared)).toEqual(prepared.candidateRelease);
    const { candidateRelease: _candidateRelease, ...missingRelease } = prepared;
    expect(() => requireCandidateRelease(missingRelease)).toThrow("candidate identity");
    expect(() =>
      requireCandidateRelease({
        ...prepared,
        candidateRelease: { version: "0.1.5", mainSha256: "not-a-digest" }
      })
    ).toThrow("candidate identity");
  });

  it("temporarily enables and restores Preview URLs for isolated validation", async () => {
    const row = await env.DB.prepare(
      "SELECT id FROM community_pro_upgrades ORDER BY created_at DESC LIMIT 1"
    ).first<{ id: string }>();
    const prepared = {
      jobsQueue: "custom-pro-jobs",
      deadLetterQueue: "custom-pro-dlq",
      candidateRelease: { version: "0.1.5", mainSha256: "a".repeat(64) },
      resources: []
    };
    const inventory = {
      accountId: "account-1",
      accountSubdomain: "test-account",
      workerName: "custom-community",
      bindings: [],
      subdomain: { enabled: false, previews_enabled: false }
    };
    await env.DB.prepare(
      `UPDATE community_pro_upgrades
       SET state = 'migration_complete', inventory_json = ?, created_resources_json = ?,
           candidate_version_id = '12345678-abcd-4000-8000-123456789abc'
       WHERE id = ?`
    )
      .bind(JSON.stringify(inventory), JSON.stringify(prepared), row?.id)
      .run();
    const upgrade = await getUpgrade(env.DB, row?.id ?? "");
    expect(upgrade).toBeTruthy();
    if (!upgrade) throw new Error("Upgrade record missing.");
    await expect(previewUrl(env.DB, upgrade)).resolves.toBe(
      "https://12345678-custom-community.test-account.workers.dev"
    );
    const bodies: Array<{ enabled: boolean; previews_enabled: boolean }> = [];
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        enabled: boolean;
        previews_enabled: boolean;
      };
      bodies.push(body);
      return Response.json({ success: true, result: body });
    };

    await enableCandidatePreview(env as WorkerEnv, upgrade, "temporary-token", fetcher);
    expect((await readPreparedResources(env.DB, upgrade.id)).previewUrlsChanged).toBe(true);
    await env.DB.prepare(
      "UPDATE community_pro_upgrades SET state = 'candidate_uploaded' WHERE id = ?"
    )
      .bind(upgrade.id)
      .run();
    const uploaded = await getUpgrade(env.DB, upgrade.id);
    if (!uploaded) throw new Error("Uploaded candidate record missing.");
    await restoreCandidatePreview(env as WorkerEnv, uploaded, "temporary-token", fetcher);
    expect((await readPreparedResources(env.DB, upgrade.id)).previewUrlsChanged).toBe(false);
    expect(bodies).toEqual([
      { enabled: false, previews_enabled: true },
      { enabled: false, previews_enabled: false }
    ]);
    const audit = await env.DB.prepare(
      `SELECT transition FROM community_pro_upgrade_audit
       WHERE upgrade_id = ? AND transition LIKE 'preview_urls_%'
       ORDER BY occurred_at`
    )
      .bind(upgrade.id)
      .all<{ transition: string }>();
    expect(audit.results.map((entry) => entry.transition)).toEqual([
      "preview_urls_temporarily_enabled",
      "preview_urls_restored"
    ]);
  });

  it("waits for a version preview route to propagate without retrying application failures", async () => {
    const statuses = [404, 503, 200];
    const waits: number[] = [];
    const requests: RequestInit[] = [];
    const response = await fetchCandidateVerification(
      "https://candidate.example/api/upgrades/pro/candidate/verify",
      "orchestration-secret",
      async (_input, init) => {
        requests.push(init ?? {});
        const status = statuses.shift() ?? 500;
        return status === 200
          ? Response.json({ ok: true, edition: "pro", version: "0.1.6" })
          : new Response("not ready", { status });
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      }
    );
    expect(response.status).toBe(200);
    expect(waits).toEqual([1_000, 1_000]);
    expect(requests).toHaveLength(3);
    expect(requests[0]?.headers).toEqual({ authorization: "Bearer orchestration-secret" });

    let attempts = 0;
    const rejected = await fetchCandidateVerification(
      "https://candidate.example/api/upgrades/pro/candidate/verify",
      "orchestration-secret",
      async () => {
        attempts += 1;
        return Response.json({ code: "UPGRADE_SCHEMA_INCOMPLETE" }, { status: 409 });
      },
      async () => undefined
    );
    expect(rejected.status).toBe(409);
    expect(attempts).toBe(1);

    let propagationAttempts = 0;
    const eventuallyReady = await fetchCandidateVerification(
      "https://candidate.example/api/upgrades/pro/candidate/verify",
      "orchestration-secret",
      async () => {
        propagationAttempts += 1;
        return propagationAttempts === 45
          ? Response.json({ ok: true, edition: "pro", version: "0.1.6" })
          : new Response("not ready", { status: 404 });
      },
      async () => undefined
    );
    expect(eventuallyReady.status).toBe(200);
    expect(propagationAttempts).toBe(45);
  });

  it("resumes the exact active installation without a browser cookie", async () => {
    const row = await env.DB.prepare(
      "SELECT id FROM community_pro_upgrades ORDER BY created_at DESC LIMIT 1"
    ).first<{ id: string }>();
    expect(row?.id).toBeTruthy();
    await env.DB.prepare(
      "UPDATE community_pro_upgrades SET state = 'purchase_verified' WHERE id = ?"
    )
      .bind(row?.id)
      .run();
    const upgradeEnv = {
      ...env,
      BETTER_AUTH_SECRET: "test-better-auth-secret",
      HQBASE_WORKER_NAME: "custom-community"
    } as WorkerEnv;
    await persistUpgradeContinuation(upgradeEnv, row?.id ?? "", {
      upgradeId: row?.id ?? "",
      licenseKey: "test-polar-license"
    });

    const resolved = await resolveUpgradeDraft(
      new Request("https://custom-community.example.workers.dev/api/upgrades/pro/status"),
      upgradeEnv
    );
    expect(resolved).toMatchObject({
      upgradeId: row?.id,
      licenseKey: "test-polar-license"
    });
    const stored = await env.DB.prepare(
      "SELECT continuation_ciphertext FROM community_pro_upgrades WHERE id = ?"
    )
      .bind(row?.id)
      .first<{ continuation_ciphertext: string }>();
    expect(stored?.continuation_ciphertext).not.toContain("test-polar-license");
    await expect(
      resolveUpgradeDraft(
        new Request("https://wrong-origin.example/api/upgrades/pro/status"),
        upgradeEnv
      )
    ).resolves.toBeNull();
  });
});
