import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertPromotion } from "./channel-policy.mjs";
import { compareVersions, loadVerifiedRelease, verifyManifest } from "./manifest.mjs";
import { fetchPublicAsset } from "./public-assets.mjs";
import { assertStableReleaseVersion } from "./version.mjs";

const repository = "HQBase/hqbase";
const base = `https://github.com/${repository}/releases/download`;
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}
function api(path, body) {
  return JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        `repos/${repository}/${path}`,
        ...(body ? ["--method", "PATCH", "--input", "-"] : [])
      ],
      {
        encoding: "utf8",
        ...(body ? { input: JSON.stringify(body) } : {})
      }
    )
  );
}
async function json(url) {
  const response = await fetchPublicAsset(url);
  if (!response.ok) throw new Error(`Public release read failed (${response.status}).`);
  return response.json();
}
export async function verifiedCandidate(version) {
  assertStableReleaseVersion(version);
  const { manifest } = await loadVerifiedRelease({
    fetcher: fetchPublicAsset,
    expectedVersion: version,
    manifestUrl: `${base}/v${version}/manifest-${version}.json`
  });
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit ?? ""))
    throw new Error("Candidate source commit is missing.");
  const versionEnvelope = await json(`${base}/v${version}/manifest-${version}.json`);
  const installation = verifyManifest(versionEnvelope);
  const nightlyEnvelope = await json(`${base}/v${version}/nightly.json`);
  const nightly = verifyManifest(nightlyEnvelope, undefined, "nightly");
  if (
    JSON.stringify(manifest) !== JSON.stringify(installation) ||
    JSON.stringify(manifest) !== JSON.stringify({ ...nightly, channel: "stable" })
  ) {
    throw new Error("Channel records do not identify the same fixed candidate.");
  }
  let object = api(`git/ref/tags/v${version}`).object;
  while (object.type === "tag") object = api(`git/tags/${object.sha}`).object;
  if (object.type !== "commit" || object.sha !== manifest.sourceCommit)
    throw new Error("Release tag source changed.");
  const response = await fetchPublicAsset(manifest.updater.sourceUrl);
  if (!response.ok) throw new Error("Candidate updater is unavailable.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length !== manifest.updater.size ||
    createHash("sha256").update(bytes).digest("hex") !== manifest.updater.sha256
  ) {
    throw new Error("Candidate updater integrity check failed.");
  }
  return { manifest, nightlyEnvelope, versionEnvelope };
}

export function candidateRelease(version, runGh = gh) {
  const release = JSON.parse(
    runGh([
      "release",
      "view",
      `v${version}`,
      "--repo",
      repository,
      "--json",
      "tagName,isDraft,isPrerelease"
    ])
  );
  if (
    release.tagName !== `v${version}` ||
    typeof release.isDraft !== "boolean" ||
    typeof release.isPrerelease !== "boolean"
  )
    throw new Error("Candidate release identity is invalid.");
  return { draft: release.isDraft, prerelease: release.isPrerelease };
}

async function publish(version) {
  const before = api("releases/latest");
  const deployBefore = api("git/ref/heads/deploy").object.sha;
  const release = candidateRelease(version);
  if (!release.draft && !release.prerelease) throw new Error("This version is already Stable.");
  gh([
    "release",
    "edit",
    `v${version}`,
    "--repo",
    repository,
    "--draft=false",
    "--prerelease",
    "--latest=false"
  ]);
  const { manifest, nightlyEnvelope } = await verifiedCandidate(version);
  if (manifest.sourceCommit !== process.env.RELEASE_COMMIT)
    throw new Error("Candidate commit does not match the staging run.");
  let pointer;
  try {
    pointer = api("releases/tags/nightly");
  } catch (error) {
    if (!/HTTP 404/.test(String(error.stderr ?? ""))) throw error;
    gh([
      "release",
      "create",
      "nightly",
      "--repo",
      repository,
      "--target",
      manifest.sourceCommit,
      "--prerelease",
      "--latest=false",
      "--title",
      "Nightly updates",
      "--notes",
      "Signed discovery record for owners who opt in to Nightly updates."
    ]);
    pointer = api("releases/tags/nightly");
  }
  if (!pointer.prerelease || pointer.draft)
    throw new Error("The Nightly pointer must remain a published prerelease.");
  const existingAsset = pointer.assets.find((asset) => asset.name === "nightly.json");
  if (existingAsset) {
    const current = verifyManifest(
      await json(`${base}/nightly/nightly.json`),
      undefined,
      "nightly"
    );
    if (compareVersions(current.version, version) > 0)
      throw new Error("Nightly already points to a newer candidate.");
  }
  const temporary = mkdtempSync(resolve(tmpdir(), "hqbase-nightly-"));
  try {
    const file = resolve(temporary, "nightly.json");
    writeFileSync(file, `${JSON.stringify(nightlyEnvelope)}\n`);
    gh(["release", "upload", "nightly", file, "--repo", repository, "--clobber"]);
    const published = verifyManifest(
      await json(`${base}/nightly/nightly.json`),
      undefined,
      "nightly"
    );
    if (published.version !== version || published.artifact.sha256 !== manifest.artifact.sha256)
      throw new Error("Nightly pointer verification failed.");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  if (
    api("releases/latest").id !== before.id ||
    api("git/ref/heads/deploy").object.sha !== deployBefore
  ) {
    throw new Error("Stable or the Deploy Button changed during Nightly publication.");
  }
  console.log(`Nightly ${version} is verified. Stable remains ${before.tag_name}.`);
}

async function promote(version) {
  if (process.env.GITHUB_REF_NAME !== "main") throw new Error("Promote from main only.");
  const report = JSON.parse(readFileSync(resolve(`release/evidence/${version}.json`), "utf8"));
  if (!/^\d+$/.test(String(report.publicUpgradeRunId)))
    throw new Error("Invalid public upgrade run ID.");
  const run = api(`actions/runs/${report.publicUpgradeRunId}`);
  const temporary = mkdtempSync(resolve(tmpdir(), "hqbase-promotion-"));
  try {
    gh([
      "run",
      "download",
      String(run.id),
      "--repo",
      repository,
      "--name",
      "public-upgrade-evidence",
      "--dir",
      temporary
    ]);
    const receipts = readdirSync(temporary)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(resolve(temporary, name), "utf8")));
    const release = api(`releases/tags/v${version}`);
    const { manifest, versionEnvelope } = await verifiedCandidate(version);
    const previous = api("releases/latest");
    const { manifest: stable } = await loadVerifiedRelease({
      expectedVersion: previous.tag_name.slice(1)
    });
    assertPromotion({ release, manifest, stable, report, receipts, run });
    const successor = await verifiedCandidate(report.successorVersion);
    const onward = receipts.find((item) => item.fromVersion === version);
    if (onward.toArtifactSha256 !== successor.manifest.artifact.sha256)
      throw new Error("Successor evidence no longer matches its archive.");
    if (release.immutable)
      throw new Error(
        "The candidate release is locked. Stable discovery must be attached after evidence passes."
      );
    const stableFile = resolve(temporary, "stable.json");
    writeFileSync(stableFile, `${JSON.stringify(versionEnvelope)}\n`);
    if (release.assets.some((asset) => asset.name === "stable.json")) {
      const existing = verifyManifest(await json(`${base}/v${version}/stable.json`));
      if (JSON.stringify(existing) !== JSON.stringify(manifest))
        throw new Error("Existing Stable discovery does not match the tested candidate.");
    } else {
      gh(["release", "upload", `v${version}`, stableFile, "--repo", repository]);
    }
    const previousCommit = api("git/ref/heads/deploy").object.sha;
    api("git/refs/heads/deploy", { sha: manifest.sourceCommit, force: false });
    try {
      gh([
        "release",
        "edit",
        `v${version}`,
        "--repo",
        repository,
        "--prerelease=false",
        "--latest"
      ]);
    } catch (error) {
      // Keep a published stable release paired with its source even after an ambiguous response.
      const current = api(`releases/tags/v${version}`);
      if (current.prerelease && api("git/ref/heads/deploy").object.sha === manifest.sourceCommit) {
        api("git/refs/heads/deploy", { sha: previousCommit, force: true });
      }
      throw error;
    }
    const { manifest: published } = await loadVerifiedRelease({
      expectedVersion: version,
      fetcher: fetchPublicAsset
    });
    if (
      published.artifact.sha256 !== manifest.artifact.sha256 ||
      api("git/ref/heads/deploy").object.sha !== manifest.sourceCommit
    ) {
      throw new Error("Stable publication verification failed.");
    }
    console.log(`Stable ${version} uses the tested archive ${manifest.artifact.sha256}.`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const version = assertStableReleaseVersion(process.env.HQBASE_RELEASE_VERSION);
  if (process.env.GITHUB_REPOSITORY !== repository)
    throw new Error("Release channels belong to the canonical repository only.");
  if (process.argv[2] === "publish") await publish(version);
  else if (process.argv[2] === "promote") await promote(version);
  else throw new Error("Use publish or promote.");
}
