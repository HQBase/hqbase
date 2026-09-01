import { createDecipheriv, createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  assertCurrentManifest,
  assertUnambiguousManifest
} from "../../../scripts/hqbase/lifecycle-manifest.mjs";
import {
  cleanupStagingUpdateGate,
  createRuntimeGrantCookie,
  managedUpdaterLoader,
  prepareStagingUpdateGate,
  probeStagingUpdateGate
} from "../../../scripts/release/staging-update-gate.mjs";

const accountId = "a".repeat(32);
const productionWorkerTag = "b".repeat(32);
const fixtureWorkerTag = "c".repeat(32);
const repoConnectionUuid = "11111111-1111-4111-8111-111111111111";
const buildTokenUuid = "22222222-2222-4222-8222-222222222222";
const triggerUuid = "33333333-3333-4333-8333-333333333333";
const buildUuid = "44444444-4444-4444-8444-444444444444";
const versionId = "55555555-5555-4555-8555-555555555555";
const version = "1.3.4";
const shortCommand = 'node --input-type=module --eval "$HQBASE_UPDATER_LOADER"';

function deploymentManifest() {
  return {
    accountId,
    d1: {
      id: "66666666-6666-4666-8666-666666666666",
      name: "hqbase-release-9001",
      ownership: "created"
    },
    name: "release-9001",
    queue: {
      deadLetter: { id: "7".repeat(32), name: "hqbase-jobs-dlq", ownership: "created" },
      primary: { id: "8".repeat(32), name: "hqbase-jobs", ownership: "created" }
    },
    r2: { bucket: "hqbase-mail", ownership: "created" },
    version: 3,
    worker: { deployed: true, name: "hqbase-release-9001" }
  };
}

function releaseEnvelope() {
  const manifest = {
    channel: "stable",
    format: "hqbase-release-v1",
    keyId: "hqbase-release-2026-01",
    minVersion: "1.0.0",
    product: "hqbase",
    publishedAt: "2026-09-01T00:00:00.000Z",
    schemaVersion: 3,
    updater: {
      protocol: 2,
      sha256: "9".repeat(64),
      size: 1234,
      sourceUrl: `https://raw.githubusercontent.com/HQBase/hqbase/${"d".repeat(40)}/scripts/release/bootstrap.mjs`
    },
    version
  };
  return {
    manifest,
    raw: JSON.stringify({
      payload: Buffer.from(JSON.stringify(manifest)).toString("base64url"),
      signature: "signed-candidate"
    })
  };
}

function environment(workspace) {
  return {
    CANDIDATE_VERSION: version,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: "cleanup-token",
    DEPLOYMENT_NAME: "release-9001",
    GITHUB_RUN_ATTEMPT: "2",
    GITHUB_RUN_ID: "9001",
    HQBASE_E2E_BUILD_TOKEN_UUID: buildTokenUuid,
    HQBASE_E2E_REPO_CONNECTION_UUID: repoConnectionUuid,
    HQBASE_E2E_UPDATE_API_TOKEN: "disposable-update-token",
    HQBASE_RELEASE_MANIFEST_FILE: path.join(workspace, "stable.json"),
    HQBASE_STAGING_ACCESS_CLIENT_ID: "access-id",
    HQBASE_STAGING_ACCESS_CLIENT_SECRET: "access-secret",
    HQBASE_STAGING_AUTH_SECRET: "auth-secret",
    HQBASE_STAGING_CONFIG: path.join(workspace, "wrangler.jsonc"),
    HQBASE_STAGING_OWNER_EMAIL: "owner@example.test",
    HQBASE_STAGING_OWNER_PASSWORD: "owner-password",
    HQBASE_STAGING_URL: "https://staging.example.test",
    STAGING_WORKER_NAME: "hqbase-release-9001"
  };
}

function response(result, init = {}) {
  return new Response(JSON.stringify({ result, success: true }), {
    headers: { "content-type": "application/json", ...init.headers },
    status: init.status ?? 200
  });
}

function trigger(record, deployCommand = "pnpm deploy") {
  return {
    branch_excludes: [],
    branch_includes: ["main"],
    build_caching_enabled: false,
    build_command: "sleep 600",
    build_token_uuid: buildTokenUuid,
    deploy_command: deployCommand,
    external_script_id: productionWorkerTag,
    path_excludes: [],
    path_includes: [".hqbase-release-gate-never"],
    repo_connection: { repo_connection_uuid: repoConnectionUuid },
    root_directory: "/",
    trigger_name: record.triggerName,
    trigger_uuid: triggerUuid
  };
}

describe("deployed update-action release gate", () => {
  it("records, exercises, cancels, and exactly reconciles its real Cloudflare resources", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "hqbase-gate-test-"));
    const candidate = releaseEnvelope();
    fs.writeFileSync(path.join(workspace, "stable.json"), candidate.raw);
    fs.writeFileSync(path.join(workspace, "wrangler.jsonc"), JSON.stringify({ vars: {} }));
    const manifest = deploymentManifest();
    const saved = [];
    const events = [];
    const calls = [];
    let fixtureExists = false;
    let buildTrigger = null;
    let build = null;
    let variables = {};
    const d1 = {
      after_deploy_ledger_table_count: 0,
      draft_count: 0,
      installed_schema_version: 3,
      installed_version: version,
      mailbox_count: 1,
      message_count: 0,
      normal_migration_count: 28,
      probe: '{"state":"preserved"}',
      update_build_lock_count: 0,
      update_history_count: 0,
      user_count: 1
    };

    const fetcher = vi.fn(async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      calls.push({ body: init.body, headers: init.headers, method, pathname: url.pathname });
      if (url.origin === "https://staging.example.test") {
        if (url.pathname === "/api/auth/sign-in/email") {
          return new Response("{}", {
            headers: { "set-cookie": "better-auth.session_token=session-value; Path=/; HttpOnly" },
            status: 200
          });
        }
        if (url.pathname === "/api/updates" && method === "GET") {
          return new Response(
            JSON.stringify({
              available: true,
              compatible: true,
              installedVersion: version,
              release: { version },
              repairRequired: true
            }),
            { headers: { "content-type": "application/json" } }
          );
        }
        if (url.pathname === "/api/updates/apply") {
          const cookie = init.headers.cookie;
          expect(cookie).toContain("better-auth.session_token=session-value");
          expect(cookie).toContain("hqb_cf_oauth_grant=");
          expect(cookie).not.toContain("disposable-update-token");
          expect(JSON.parse(init.body)).toEqual({ expectedVersion: version });
          buildTrigger = trigger(manifest.releaseGate.workersBuild, shortCommand);
          variables = {
            HQBASE_EXPECTED_RELEASE_VERSION: { is_secret: false, value: version },
            HQBASE_UPDATER_LOADER: {
              is_secret: false,
              value: managedUpdaterLoader(candidate.manifest.updater)
            }
          };
          build = {
            build_trigger_metadata: {
              branch: "main",
              build_command: "sleep 600",
              build_token_uuid: buildTokenUuid,
              build_trigger_source: "api",
              deploy_command: shortCommand,
              environment_variables: {
                HQBASE_EXPECTED_RELEASE_VERSION: version,
                HQBASE_UPDATER_LOADER: managedUpdaterLoader(candidate.manifest.updater)
              },
              root_directory: "/"
            },
            build_uuid: buildUuid,
            created_on: new Date().toISOString(),
            status: "queued",
            trigger: { trigger_uuid: triggerUuid }
          };
          return new Response(JSON.stringify({ buildId: buildUuid, status: "queued" }), {
            headers: {
              "content-type": "application/json",
              "set-cookie": "hqb_cf_oauth_grant=; Path=/; Max-Age=0"
            },
            status: 202
          });
        }
      }
      if (url.origin.includes("workers.dev")) {
        return fixtureExists ? new Response(candidate.raw) : new Response(null, { status: 404 });
      }
      if (url.pathname.endsWith("/workers/subdomain")) {
        return response({ subdomain: "release-test" });
      }
      if (url.pathname.endsWith("/user/tokens/verify")) {
        expect(init.headers.authorization).toBe("Bearer disposable-update-token");
        return response({ status: "active" });
      }
      if (url.pathname.endsWith("/workers/scripts") && method === "GET") {
        return response([
          { id: "hqbase-release-9001", tag: productionWorkerTag },
          ...(fixtureExists
            ? [{ id: "hqbase-release-manifest-9001-2", tag: fixtureWorkerTag }]
            : [])
        ]);
      }
      if (url.pathname.includes(`/builds/workers/${productionWorkerTag}/triggers`)) {
        return response(buildTrigger ? [buildTrigger] : []);
      }
      if (url.pathname.endsWith("/builds/triggers") && method === "POST") {
        events.push("create-trigger");
        const body = JSON.parse(init.body);
        expect(body).toEqual({
          branch_excludes: [],
          branch_includes: ["main"],
          build_caching_enabled: false,
          build_command: "sleep 600",
          build_token_uuid: buildTokenUuid,
          deploy_command: "pnpm deploy",
          external_script_id: productionWorkerTag,
          path_excludes: [],
          path_includes: [".hqbase-release-gate-never"],
          repo_connection_uuid: repoConnectionUuid,
          root_directory: "/",
          trigger_name: "hqbase-release-gate-9001-2"
        });
        buildTrigger = trigger(manifest.releaseGate.workersBuild);
        return response(buildTrigger);
      }
      if (url.pathname.endsWith(`/builds/triggers/${triggerUuid}/environment_variables`)) {
        return response(variables);
      }
      if (url.pathname.endsWith(`/builds/builds/${buildUuid}`) && method === "GET") {
        return response(build);
      }
      if (url.pathname.endsWith(`/builds/builds/${buildUuid}/cancel`)) {
        build = {
          ...build,
          build_outcome: "cancelled",
          status: "stopped",
          stopped_on: "2026-09-01T04:00:00.000Z"
        };
        return response({
          build_outcome: "cancelled",
          build_uuid: buildUuid,
          stopped_on: build.stopped_on
        });
      }
      if (url.pathname.endsWith(`/builds/triggers/${triggerUuid}`) && method === "DELETE") {
        buildTrigger = null;
        return response(null);
      }
      if (url.pathname.endsWith("/deployments")) {
        return response({
          deployments: [{ versions: [{ percentage: 100, version_id: versionId }] }]
        });
      }
      if (url.pathname.includes("/d1/database/") && url.pathname.endsWith("/query")) {
        return response([{ results: [d1], success: true }]);
      }
      if (
        url.pathname.endsWith("/workers/scripts/hqbase-release-manifest-9001-2") &&
        method === "DELETE"
      ) {
        fixtureExists = false;
        return response(null);
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const options = {
      environment: environment(workspace),
      fetcher,
      loadManifest: () => manifest,
      manifestExists: () => true,
      runCommand: (_command, args) => {
        events.push("deploy-fixture");
        expect(args.slice(0, 3)).toEqual(["exec", "wrangler", "deploy"]);
        fixtureExists = true;
      },
      sleep: async () => {},
      writeManifest: (value) => {
        saved.push(structuredClone(value));
        events.push(
          `record-${value.releaseGate.candidateManifest.ownership}-${value.releaseGate.workersBuild.ownership}`
        );
      }
    };

    try {
      await prepareStagingUpdateGate(options);
      await probeStagingUpdateGate(options);
      await cleanupStagingUpdateGate(options);
      const callsAfterCleanup = calls.length;
      await cleanupStagingUpdateGate(options);

      expect(events.indexOf("record-creating-unclaimed")).toBeLessThan(
        events.indexOf("deploy-fixture")
      );
      expect(events.indexOf("record-created-creating")).toBeLessThan(
        events.indexOf("create-trigger")
      );
      expect(manifest.releaseGate).toMatchObject({
        candidateManifest: { ownership: "removed", workerTag: fixtureWorkerTag },
        workersBuild: {
          buildOutcome: "cancelled",
          buildUuid,
          ownership: "removed",
          repoConnectionUuid,
          stoppedOn: "2026-09-01T04:00:00.000Z",
          triggerUuid
        }
      });
      expect(calls.filter((call) => call.pathname.endsWith("/cancel"))).toHaveLength(1);
      expect(calls.filter((call) => call.pathname.endsWith("/user/tokens/verify"))).toHaveLength(1);
      expect(calls.filter((call) => call.pathname.endsWith("/query"))).toHaveLength(2);
      expect(calls).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "DELETE",
            pathname: expect.stringContaining("/repos/")
          }),
          expect.objectContaining({
            method: "DELETE",
            pathname: expect.stringContaining("/tokens/")
          })
        ])
      );
      expect(calls).toHaveLength(callsAfterCleanup);
      expect(saved.length).toBeGreaterThanOrEqual(8);
      expect(() => assertUnambiguousManifest(manifest)).not.toThrow();
    } finally {
      fs.rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("uses the production AES-GCM grant-cookie contract without exposing the token", () => {
    const iv = Buffer.alloc(12, 7);
    const cookie = createRuntimeGrantCookie("disposable-token", "auth-secret", iv);
    const encoded = cookie.slice(cookie.indexOf("=") + 1);
    const [encodedIv, encodedCiphertext] = decodeURIComponent(encoded).split(".");
    const encrypted = Buffer.from(encodedCiphertext, "base64url");
    const ciphertext = encrypted.subarray(0, -16);
    const tag = encrypted.subarray(-16);
    const key = createHash("sha256").update("hqbase-runtime-cloudflare-oauth:auth-secret").digest();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(tag);

    expect(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString()).toBe(
      "disposable-token"
    );
    expect(cookie).not.toContain("disposable-token");
  });

  it("blocks lifecycle deletion until both exact gate resources are removed", () => {
    const manifest = deploymentManifest();
    manifest.releaseGate = {
      candidateManifest: {
        name: "hqbase-release-manifest-9001-2",
        ownership: "created",
        path: "/candidate.json",
        sha256: "a".repeat(64),
        url: "https://hqbase-release-manifest-9001-2.release-test.workers.dev/candidate.json",
        workerTag: fixtureWorkerTag
      },
      workersBuild: {
        branch: "main",
        buildCommand: "sleep 600",
        buildOutcome: null,
        buildTokenUuid,
        buildUuid: null,
        dispatchStartedAt: null,
        initialDeployCommand: "pnpm deploy",
        ownership: "created",
        pathIncludes: [".hqbase-release-gate-never"],
        repoConnectionUuid,
        rootDirectory: "/",
        stoppedOn: null,
        triggerName: "hqbase-release-gate-9001-2",
        triggerUuid,
        workerTag: productionWorkerTag
      }
    };

    expect(() => assertCurrentManifest(manifest)).not.toThrow();
    expect(() => assertUnambiguousManifest(manifest)).toThrow(/releaseGate\.candidateManifest/);
    manifest.releaseGate.candidateManifest.ownership = "removed";
    expect(() => assertUnambiguousManifest(manifest)).toThrow(/releaseGate\.workersBuild/);
    manifest.releaseGate.workersBuild.ownership = "removed";
    expect(() => assertUnambiguousManifest(manifest)).not.toThrow();
  });
});
