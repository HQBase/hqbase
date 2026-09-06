import { compareVersions } from "./manifest.mjs";
import { assertStableReleaseVersion } from "./version.mjs";

export const minimumSoakMs = 72 * 60 * 60 * 1000;
export const mailChecks = [
  "send",
  "receive",
  "attachments",
  "search",
  "backgroundJobs",
  "backupRestore",
  "noOpenBlockers"
];

export function assertPromotion({
  release,
  manifest,
  stable,
  report,
  receipts,
  run,
  now = Date.now()
}) {
  assertStableReleaseVersion(manifest.version);
  assertStableReleaseVersion(report.successorVersion);
  if (release.draft || !release.prerelease || release.tag_name !== `v${manifest.version}`) {
    throw new Error("Select a published Nightly candidate.");
  }
  if (
    compareVersions(manifest.version, stable.version) <= 0 ||
    compareVersions(stable.version, manifest.minVersion) < 0 ||
    manifest.schemaVersion < stable.schemaVersion
  ) {
    throw new Error("The candidate must be a compatible update from current Stable.");
  }
  const published = Date.parse(release.published_at);
  const started = Date.parse(report.startedAt);
  const finished = Date.parse(report.finishedAt);
  if (
    ![published, started, finished, now].every(Number.isFinite) ||
    started < published ||
    finished > now ||
    finished - started < minimumSoakMs
  ) {
    throw new Error("Record at least 72 hours of real use after this candidate was published.");
  }
  if (
    report.version !== manifest.version ||
    report.artifactSha256 !== manifest.artifact.sha256 ||
    report.sourceCommit !== manifest.sourceCommit ||
    !/^https:\/\/github\.com\/HQBase\/hqbase\/(issues|discussions)\/\d+$/.test(
      report.reportUrl ?? ""
    ) ||
    mailChecks.some((check) => report.checks?.[check] !== true)
  ) {
    throw new Error(
      "The mail-use report must cover this exact candidate and every required check."
    );
  }
  if (compareVersions(report.successorVersion, manifest.version) <= 0) {
    throw new Error("Test an upgrade from this candidate to a later candidate.");
  }
  if (
    run.conclusion !== "success" ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main" ||
    run.path !== ".github/workflows/public-upgrade.yml" ||
    run.repository?.full_name !== "HQBase/hqbase" ||
    String(run.id) !== String(report.publicUpgradeRunId)
  ) {
    throw new Error(
      "Public upgrade evidence must come from the successful canonical workflow on main."
    );
  }
  for (const [from, to, digest] of [
    [stable.version, manifest.version, manifest.artifact.sha256],
    [manifest.version, report.successorVersion, null]
  ]) {
    const receipt = receipts.find((item) => item.fromVersion === from && item.toVersion === to);
    if (
      !receipt ||
      receipt.workflowRunId !== String(run.id) ||
      receipt.verified !== true ||
      !/^[a-f0-9]{64}$/.test(receipt.toArtifactSha256 ?? "") ||
      !/^[a-f0-9-]{36}$/.test(receipt.buildId ?? "") ||
      (digest && receipt.toArtifactSha256 !== digest) ||
      (from === manifest.version && receipt.fromArtifactSha256 !== manifest.artifact.sha256)
    ) {
      throw new Error(`Missing verified public upgrade: ${from} to ${to}.`);
    }
  }
}
