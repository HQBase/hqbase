import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compareVersions, loadVerifiedRelease, verifyManifest } from "./manifest.mjs";
import { assertStableReleaseVersion } from "./version.mjs";

const candidate = assertStableReleaseVersion(process.env.TEST_CANDIDATE_VERSION);
const successor = assertStableReleaseVersion(process.env.TEST_SUCCESSOR_VERSION);
if (compareVersions(successor, candidate) <= 0)
  throw new Error("The successor must be newer than the candidate.");
const stableTag = execFileSync(
  "gh",
  ["api", "repos/HQBase/hqbase/releases/latest", "--jq", ".tag_name"],
  { encoding: "utf8" }
).trim();
const source =
  process.env.UPGRADE_EDGE === "inbound"
    ? assertStableReleaseVersion(stableTag.slice(1))
    : candidate;
const target = process.env.UPGRADE_EDGE === "inbound" ? candidate : successor;
if (compareVersions(target, source) <= 0)
  throw new Error("Both public tests must be forward upgrades.");
for (const [name, version] of [
  ["source", source],
  ["target", target]
]) {
  const manifestUrl = `https://github.com/HQBase/hqbase/releases/download/v${version}/manifest-${version}.json`;
  const { bytes, manifest } = await loadVerifiedRelease({ expectedVersion: version, manifestUrl });
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error("The public versioned manifest is unavailable.");
  const envelope = await response.json();
  if (JSON.stringify(verifyManifest(envelope)) !== JSON.stringify(manifest))
    throw new Error("The public manifest changed during download.");
  const directory = resolve("release", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "archive.tar.gz"), bytes);
  writeFileSync(resolve(directory, "manifest.json"), `${JSON.stringify(envelope)}\n`);
  if (name === "source")
    appendFileSync(process.env.GITHUB_ENV, `SOURCE_ARTIFACT_SHA256=${manifest.artifact.sha256}\n`);
}
appendFileSync(
  process.env.GITHUB_ENV,
  `SOURCE_VERSION=${source}\nCANDIDATE_VERSION=${target}\nHQBASE_RELEASE_MANIFEST_FILE=${resolve("release/target/manifest.json")}\n`
);
