import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifiedCandidate } from "./channels.mjs";
import { loadVerifiedRelease } from "./manifest.mjs";
import { fetchPublicAsset } from "./public-assets.mjs";
import { assertStableReleaseVersion } from "./version.mjs";

export function assertPublishedStable({ version, latest, manifest, candidate, report, deploy }) {
  if (latest.tag_name !== `v${version}` || latest.draft !== false || latest.prerelease !== false) {
    throw new Error("Only the published Latest Stable release can be announced.");
  }
  if (
    manifest.version !== version ||
    JSON.stringify(manifest) !== JSON.stringify(candidate) ||
    report.version !== version ||
    report.artifactSha256 !== manifest.artifact.sha256 ||
    report.sourceCommit !== manifest.sourceCommit ||
    deploy !== manifest.sourceCommit
  ) {
    throw new Error("Published Stable does not match its tested archive and deploy commit.");
  }
}

async function main() {
  const version = assertStableReleaseVersion(process.env.HQBASE_RELEASE_VERSION);
  if (process.env.GITHUB_REPOSITORY !== "HQBase/hqbase" || process.env.GITHUB_REF_NAME !== "main") {
    throw new Error("Stable announcement recovery must run from canonical main.");
  }
  const api = (path) =>
    JSON.parse(execFileSync("gh", ["api", `repos/HQBase/hqbase/${path}`], { encoding: "utf8" }));
  const { manifest: candidate } = await verifiedCandidate(version);
  const { manifest } = await loadVerifiedRelease({
    expectedVersion: version,
    fetcher: fetchPublicAsset
  });
  const report = JSON.parse(readFileSync(resolve("release/evidence", `${version}.json`), "utf8"));
  assertPublishedStable({
    version,
    latest: api("releases/latest"),
    manifest,
    candidate,
    report,
    deploy: api("git/ref/heads/deploy").object.sha
  });
  console.log(
    `Verified published Stable ${version} and its tested archive ${manifest.artifact.sha256}.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
