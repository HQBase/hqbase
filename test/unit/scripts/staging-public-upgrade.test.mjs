import { describe, expect, it, vi } from "vitest";
import { finishPublicUpgrade } from "../../../scripts/release/staging-public-upgrade.mjs";

function fixture(overrides = {}) {
  const release = { version: "1.4.2", schemaVersion: 4, artifact: { sha256: "a".repeat(64) } };
  const d1 = {
    installed_version: "1.3.4",
    installed_schema_version: 4,
    update_history_count: 0,
    verified_update_count: 0,
    update_build_lock_count: 0,
    user_count: 1,
    mailbox_count: 1,
    draft_count: 1,
    message_count: 1,
    probe: "preserved"
  };
  const record = {
    buildUuid: "11111111-1111-4111-8111-111111111111",
    buildOutcome: null,
    stoppedOn: null
  };
  const manifest = { d1: { id: "db" }, releaseGate: { workersBuild: record } };
  const fetcher = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/builds/builds/"))
      return Response.json({
        success: true,
        result: {
          status: "stopped",
          build_outcome: overrides.outcome ?? "success",
          stopped_on: "2026-09-06T00:00:00Z"
        }
      });
    if (url.includes("/api/health"))
      return Response.json({ ok: true, version: overrides.healthVersion ?? "1.4.2" });
    if (url.endsWith("/deployments"))
      return Response.json({
        success: true,
        result: { deployments: [{ versions: [{ percentage: 100, version_id: "new" }] }] }
      });
    if (url.endsWith("/query"))
      return Response.json({
        success: true,
        result: [
          {
            results: [
              {
                ...d1,
                installed_version: "1.4.2",
                update_history_count: 1,
                verified_update_count: 1,
                ...overrides.d1
              }
            ]
          }
        ]
      });
    if (url.endsWith("/versions/new"))
      return Response.json({
        success: true,
        result: {
          annotations: { "workers/tag": overrides.tag ?? `hqbase:1.4.2:${release.artifact.sha256}` }
        }
      });
    throw new Error(`Unexpected request ${url}`);
  });
  const context = {
    accountId: "account",
    workerName: "worker",
    cleanupToken: "unused",
    sourceVersion: "1.3.4",
    appUrl: "https://staging.example.com",
    accessClientId: "id",
    accessClientSecret: "secret"
  };
  const dependencies = {
    fetcher,
    sleep: vi.fn(),
    writeManifest: vi.fn(),
    writeReceipt: vi.fn(),
    environment: {
      GITHUB_RUN_ID: "123",
      HQBASE_UPGRADE_RECEIPT: "/unused",
      SOURCE_ARTIFACT_SHA256: "b".repeat(64)
    }
  };
  return { release, manifest, context, dependencies, before: { d1, workerVersionId: "old" } };
}
const run = (f) => finishPublicUpgrade(f.manifest, f.release, f.before, f.context, f.dependencies);
describe("completed public upgrade evidence", () => {
  it("records the exact completed build and leaves sealing to the lifecycle checks", async () => {
    const f = fixture();
    expect(await run(f)).toMatchObject({
      toVersion: "1.4.2",
      toArtifactSha256: "a".repeat(64),
      verified: false
    });
    expect(f.dependencies.writeReceipt).toHaveBeenCalledOnce();
  });
  it.each([
    ["failed build", { outcome: "fail" }],
    ["old healthy Worker", { healthVersion: "1.3.4" }],
    ["lost mail", { d1: { message_count: 0 } }],
    ["unfinished schema", { d1: { installed_schema_version: 3 } }],
    ["unrecorded update", { d1: { update_history_count: 0 } }],
    ["wrong archive", { tag: `hqbase:1.4.2:${"c".repeat(64)}` }]
  ])("rejects %s without issuing a receipt", async (_, overrides) => {
    const f = fixture(overrides);
    await expect(run(f)).rejects.toThrow();
    expect(f.dependencies.writeReceipt).not.toHaveBeenCalled();
  });
});
