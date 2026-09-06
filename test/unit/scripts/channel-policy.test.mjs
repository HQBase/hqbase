import { describe, expect, it } from "vitest";
import { assertPromotion, mailChecks } from "../../../scripts/release/channel-policy.mjs";
import { assertDatabaseUpdate } from "../../../scripts/release/database-compatibility.mjs";

function evidence() {
  const digest = "a".repeat(64);
  return {
    now: Date.parse("2026-09-06T12:00:00Z"),
    release: {
      draft: false,
      prerelease: true,
      tag_name: "v1.4.2",
      published_at: "2026-09-01T00:00:00Z"
    },
    manifest: {
      version: "1.4.2",
      schemaVersion: 4,
      minVersion: "1.0.0",
      sourceCommit: "b".repeat(40),
      artifact: { sha256: digest }
    },
    stable: { version: "1.3.4", schemaVersion: 4 },
    report: {
      version: "1.4.2",
      artifactSha256: digest,
      sourceCommit: "b".repeat(40),
      successorVersion: "1.4.3",
      publicUpgradeRunId: "123",
      startedAt: "2026-09-02T00:00:00Z",
      finishedAt: "2026-09-05T00:00:00Z",
      reportUrl: "https://github.com/HQBase/hqbase/issues/123",
      checks: Object.fromEntries(mailChecks.map((check) => [check, true]))
    },
    run: {
      id: 123,
      conclusion: "success",
      event: "workflow_dispatch",
      head_branch: "main",
      path: ".github/workflows/public-upgrade.yml",
      repository: { full_name: "HQBase/hqbase" }
    },
    receipts: [
      {
        workflowRunId: "123",
        fromVersion: "1.3.4",
        toVersion: "1.4.2",
        toArtifactSha256: digest,
        verified: true,
        buildId: "a".repeat(36)
      },
      {
        workflowRunId: "123",
        fromVersion: "1.4.2",
        toVersion: "1.4.3",
        fromArtifactSha256: digest,
        toArtifactSha256: "c".repeat(64),
        verified: true,
        buildId: "a".repeat(36)
      }
    ]
  };
}
describe("stable promotion", () => {
  it("accepts only the tested candidate with both completed public upgrades", () => {
    expect(() => assertPromotion(evidence())).not.toThrow();
  });
  it("does not require a minimum test duration or candidate age", () => {
    const e = evidence();
    e.release.published_at = new Date(e.now).toISOString();
    e.report.startedAt = e.release.published_at;
    e.report.finishedAt = e.release.published_at;
    expect(() => assertPromotion(e)).not.toThrow();
  });
  it.each([
    [
      "reversed test dates",
      (e) => {
        e.report.finishedAt = "2026-09-01T23:00:00Z";
      }
    ],
    [
      "prepublication use",
      (e) => {
        e.report.startedAt = "2026-08-31T00:00:00Z";
      }
    ],
    [
      "future report",
      (e) => {
        e.report.finishedAt = "2026-09-09T00:00:00Z";
      }
    ],
    [
      "changed archive",
      (e) => {
        e.manifest.artifact.sha256 = "d".repeat(64);
      }
    ],
    [
      "changed commit",
      (e) => {
        e.report.sourceCommit = "d".repeat(40);
      }
    ],
    [
      "missing mail check",
      (e) => {
        e.report.checks.receive = false;
      }
    ],
    [
      "open blocker",
      (e) => {
        e.report.checks.noOpenBlockers = false;
      }
    ],
    [
      "failed workflow",
      (e) => {
        e.run.conclusion = "failure";
      }
    ],
    [
      "untrusted workflow",
      (e) => {
        e.run.head_branch = "feature";
      }
    ],
    [
      "another repository",
      (e) => {
        e.run.repository.full_name = "other/hqbase";
      }
    ],
    [
      "no successor proof",
      (e) => {
        e.receipts.pop();
      }
    ],
    [
      "draft receipt",
      (e) => {
        e.receipts[0].verified = false;
      }
    ],
    [
      "different tested archive",
      (e) => {
        e.receipts[1].fromArtifactSha256 = "d".repeat(64);
      }
    ],
    [
      "stable changed since testing",
      (e) => {
        e.stable.version = "1.4.1";
      }
    ],
    [
      "schema downgrade",
      (e) => {
        e.stable.schemaVersion = 5;
      }
    ],
    [
      "successor is same version",
      (e) => {
        e.report.successorVersion = "1.4.2";
      }
    ]
  ])("rejects %s", (_, change) => {
    const input = evidence();
    change(input);
    expect(() => assertPromotion(input)).toThrow();
  });
});

it("blocks database downgrades in the deployment path as well as the app", () => {
  expect(() =>
    assertDatabaseUpdate(
      { version: "1.4.2", schemaVersion: 4 },
      { installed_version: "1.4.1", installed_schema_version: 5 }
    )
  ).toThrow("downgrade");
  expect(() =>
    assertDatabaseUpdate(
      { version: "1.4.2", schemaVersion: 4 },
      { installed_version: "1.4.3", installed_schema_version: 4 }
    )
  ).toThrow("downgrade");
  expect(() =>
    assertDatabaseUpdate(
      { version: "1.4.2", schemaVersion: 4 },
      { installed_version: "1.4.2", installed_schema_version: 4 }
    )
  ).not.toThrow();
});
