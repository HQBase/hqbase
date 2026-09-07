import { describe, expect, it, vi } from "vitest";
import { assertCurrentManifest } from "../../../scripts/hqbase/lifecycle-manifest.mjs";
import {
  configurePublicBuild,
  publicBuildConfiguration,
  publicConfigVariable,
  writePublicBuildConfiguration
} from "../../../scripts/release/staging-build-config.mjs";
import { managedUpdaterLoader } from "../../../scripts/release/staging-update-gate.mjs";
import {
  cancelRecordedBuild,
  verifyAcceptedBuild
} from "../../../scripts/release/staging-update-gate-resources.mjs";
import { publicBuildCommand } from "../../../scripts/release/staging-update-gate-shared.mjs";

function fixture() {
  const name = "hqbase-public-9001-inbound";
  const manifest = {
    version: 3,
    name: "public-9001-inbound",
    accountId: "a".repeat(32),
    worker: { name, deployed: true },
    d1: { id: "11111111-1111-4111-8111-111111111111", name, ownership: "created" },
    r2: { bucket: `${name}-mail`, ownership: "created" },
    queue: {
      primary: { id: "b".repeat(32), name: `${name}-jobs`, ownership: "created" },
      deadLetter: { id: "c".repeat(32), name: `${name}-jobs-dlq`, ownership: "created" }
    },
    appDomain: "staging.example.com",
    authUrl: "https://staging.example.com",
    cloudflareOAuth: { mode: "customer", clientId: "test-client" }
  };
  const gate = {
    workersBuild: {
      workerTag: "d".repeat(32),
      triggerUuid: "22222222-2222-4222-8222-222222222222",
      repoConnectionUuid: "33333333-3333-4333-8333-333333333333",
      buildTokenUuid: "44444444-4444-4444-8444-444444444444",
      triggerName: "hqbase-release-gate-9001-1",
      ownership: "created",
      buildUuid: null,
      branch: "main",
      buildCommand: publicBuildCommand,
      initialDeployCommand: "pnpm deploy",
      rootDirectory: "/",
      pathIncludes: [".hqbase-release-gate-never"],
      buildOutcome: null,
      stoppedOn: null,
      dispatchStartedAt: null
    },
    candidateManifest: {
      url: "https://fixture.example.workers.dev/candidate.json",
      name: "fixture",
      path: "/candidate.json",
      sha256: "e".repeat(64),
      workerTag: "f".repeat(32),
      ownership: "created"
    }
  };
  // The gate is validated by its owning code; payload validation uses only lifecycle resources.
  const payload = {
    manifest,
    workerTag: gate.workersBuild.workerTag,
    manifestUrl: gate.candidateManifest.url
  };
  return {
    manifest,
    gate,
    payload,
    environment: {
      [publicConfigVariable]: JSON.stringify(payload),
      WRANGLER_CI_MATCH_TAG: payload.workerTag,
      WRANGLER_CI_OVERRIDE_NAME: name
    }
  };
}

describe("public upgrade build configuration", () => {
  it.each([
    publicBuildCommand,
    "pnpm install --frozen-lockfile"
  ])("keeps cleanup compatible with %s", async (buildCommand) => {
    const f = fixture();
    f.gate.workersBuild.buildCommand = buildCommand;
    f.gate.workersBuild.buildUuid = "55555555-5555-4555-8555-555555555555";
    f.gate.workersBuild.dispatchStartedAt = "2026-09-07T00:00:00Z";
    const manifest = JSON.parse(JSON.stringify({ ...f.manifest, releaseGate: f.gate }));
    expect(() => assertCurrentManifest(manifest)).not.toThrow();
    const writeManifest = vi.fn((saved) =>
      assertCurrentManifest(JSON.parse(JSON.stringify(saved)))
    );
    await cancelRecordedBuild(
      manifest,
      { accountId: f.manifest.accountId, cleanupToken: "test-token" },
      {
        fetcher: async () =>
          Response.json({
            success: true,
            result: { status: "stopped", build_outcome: "fail", stopped_on: "2026-09-07T00:00:00Z" }
          }),
        writeManifest,
        sleep: vi.fn()
      }
    );
    expect(writeManifest).toHaveBeenCalledOnce();
    expect(manifest.releaseGate.workersBuild.buildOutcome).toBe("fail");
    expect(manifest.version).toBe(3);
  });
  it("writes only the recorded disposable bindings and discovery fixture", () => {
    const f = fixture();
    const write = vi.fn();
    writePublicBuildConfiguration(f.environment, write);
    const config = JSON.parse(write.mock.calls[0][1]);
    expect(config.name).toBe(f.manifest.worker.name);
    expect(config.d1_databases[0].database_id).toBe(f.manifest.d1.id);
    expect(config.r2_buckets[0].bucket_name).toBe(f.manifest.r2.bucket);
    expect(config.queues.producers[0].queue).toBe(f.manifest.queue.primary.name);
    expect(config.queues.consumers[0].dead_letter_queue).toBe(f.manifest.queue.deadLetter.name);
    expect(config.vars.HQBASE_RELEASE_MANIFEST_URL).toBe(f.payload.manifestUrl);
    expect(config.vars.CLOUDFLARE_OAUTH_CLIENT_ID).toBe("test-client");
  });

  it.each([
    "WRANGLER_CI_MATCH_TAG",
    "WRANGLER_CI_OVERRIDE_NAME"
  ])("rejects another build's %s before writing", (key) => {
    const f = fixture();
    const write = vi.fn();
    f.environment[key] = "wrong";
    expect(() => writePublicBuildConfiguration(f.environment, write)).toThrow("does not match");
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["name", "ownership"])("rejects an unrecorded database %s", (key) => {
    const f = fixture();
    f.payload.manifest.d1[key] = key === "name" ? "hqbase" : "reused";
    f.environment[publicConfigVariable] = JSON.stringify(f.payload);
    expect(() => writePublicBuildConfiguration(f.environment, vi.fn())).toThrow(
      "disposable resources"
    );
  });

  it("rejects missing configuration and invalid discovery URLs", () => {
    expect(() => writePublicBuildConfiguration({}, vi.fn())).toThrow("missing");
    const f = fixture();
    f.payload.manifestUrl = "http://example.com/fixture";
    f.environment[publicConfigVariable] = JSON.stringify(f.payload);
    expect(() => writePublicBuildConfiguration(f.environment, vi.fn())).toThrow("fixture URL");
  });

  it("does not configure the cancelled draft-release probe", async () => {
    const fetcher = vi.fn();
    await configurePublicBuild({}, { publicUpgrade: false }, { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("passes only lifecycle configuration to the recorded trigger", async () => {
    const f = fixture();
    for (const nested of [
      f.manifest.worker,
      f.manifest.d1,
      f.manifest.r2,
      f.manifest.queue.primary,
      f.manifest.queue.deadLetter,
      f.manifest.cloudflareOAuth
    ]) {
      nested.unexpectedCredential = "must-not-copy";
    }
    const manifest = { ...f.manifest, releaseGate: f.gate, unrelatedPrivateField: "must-not-copy" };
    const serialized = publicBuildConfiguration(manifest);
    expect(serialized).not.toContain("must-not-copy");
    const fetcher = vi.fn(async () => Response.json({ success: true, result: {} }));
    await configurePublicBuild(
      manifest,
      { publicUpgrade: true, accountId: manifest.accountId, cleanupToken: "test-token" },
      { fetcher }
    );
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toContain(
      `/builds/triggers/${f.gate.workersBuild.triggerUuid}/environment_variables`
    );
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(request.body)).toEqual({
      [publicConfigVariable]: { is_secret: false, value: serialized }
    });
    const write = vi.fn();
    writePublicBuildConfiguration({ ...f.environment, [publicConfigVariable]: serialized }, write);
    expect(write).toHaveBeenCalledOnce();
  });

  it.each([
    "exact",
    "changed-trigger",
    "changed-build"
  ])("checks the accepted build configuration: %s", async (mode) => {
    const f = fixture();
    const record = f.gate.workersBuild;
    record.buildUuid = "55555555-5555-4555-8555-555555555555";
    record.dispatchStartedAt = "2026-09-07T00:00:00Z";
    const manifest = { ...f.manifest, releaseGate: f.gate };
    const release = {
      updater: {
        sourceUrl: `https://raw.githubusercontent.com/HQBase/hqbase/${"a".repeat(40)}/scripts/release/bootstrap.mjs`,
        size: 1234,
        sha256: "b".repeat(64)
      }
    };
    const variables = {
      HQBASE_EXPECTED_RELEASE_VERSION: { is_secret: false, value: "1.4.1" },
      HQBASE_UPDATER_LOADER: { is_secret: false, value: managedUpdaterLoader(release.updater) },
      [publicConfigVariable]: { is_secret: false, value: publicBuildConfiguration(manifest) }
    };
    const command = 'node --input-type=module --eval "$HQBASE_UPDATER_LOADER"';
    const fetcher = vi.fn(async (input) => {
      const url = String(input);
      let result;
      if (url.endsWith("/triggers"))
        result = [
          {
            trigger_uuid: record.triggerUuid,
            trigger_name: record.triggerName,
            external_script_id: record.workerTag,
            branch_includes: ["main"],
            branch_excludes: [],
            build_caching_enabled: false,
            path_includes: record.pathIncludes,
            path_excludes: [],
            root_directory: "/",
            build_command: publicBuildCommand,
            deploy_command: command,
            build_token_uuid: record.buildTokenUuid,
            repo_connection: { repo_connection_uuid: record.repoConnectionUuid }
          }
        ];
      else if (url.endsWith("/environment_variables"))
        result =
          mode === "changed-trigger"
            ? { ...variables, [publicConfigVariable]: { is_secret: false, value: "wrong" } }
            : variables;
      else
        result = {
          build_uuid: record.buildUuid,
          trigger: { trigger_uuid: record.triggerUuid },
          status: "stopped",
          build_trigger_metadata: {
            branch: "main",
            build_command: publicBuildCommand,
            deploy_command: command,
            build_trigger_source: "api",
            build_token_uuid: record.buildTokenUuid,
            root_directory: "/",
            environment_variables:
              mode === "changed-build"
                ? { ...variables, [publicConfigVariable]: "wrong" }
                : variables
          }
        };
      return Response.json({ success: true, result });
    });
    const check = verifyAcceptedBuild(
      manifest,
      release,
      {
        publicUpgrade: true,
        candidateVersion: "1.4.1",
        accountId: manifest.accountId,
        cleanupToken: "test-token"
      },
      { fetcher, now: Date.now, sleep: vi.fn() }
    );
    if (mode === "exact") await expect(check).resolves.toBeUndefined();
    else await expect(check).rejects.toThrow(/configuration/);
  });
});
