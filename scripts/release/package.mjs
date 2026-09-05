#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { extractReleaseNotes, releaseNoteItems } from "./notes.mjs";
import { assertStableReleaseVersion } from "./version.mjs";

const root = resolve(import.meta.dirname, "../..");
const product = "hqbase";
const schemaVersion = 4;
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = process.env.HQBASE_RELEASE_VERSION ?? packageJson.version;
const minVersion = process.env.HQBASE_MIN_VERSION || packageJson.hqbaseRelease?.minimumVersion;
assertStableReleaseVersion(version);
const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const notes = releaseNoteItems(extractReleaseNotes(changelog, version));
const privateKeyValue = process.env.HQBASE_RELEASE_PRIVATE_KEY_FILE
  ? readFileSync(process.env.HQBASE_RELEASE_PRIVATE_KEY_FILE, "utf8")
  : process.env.HQBASE_RELEASE_PRIVATE_KEY;

if (!privateKeyValue) throw new Error("HQBASE_RELEASE_PRIVATE_KEY is required.");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(minVersion ?? ""))
  throw new Error("Minimum release version must be semantic.");
const output = resolve(root, "release");
mkdirSync(output, { recursive: true });
const tarFile = resolve(output, `${product}-${version}.tar`);
const artifactFile = `${tarFile}.gz`;
execFileSync("git", ["archive", "--format=tar", "--output", tarFile, "HEAD"], { cwd: root });
writeFileSync(artifactFile, gzipSync(readFileSync(tarFile), { level: 9 }));
rmSync(tarFile);

const bytes = readFileSync(artifactFile);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8"
}).trim();
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) {
  throw new Error("Release source commit is invalid.");
}
const configuredUpdaterCommit = packageJson.hqbaseRelease?.updaterCommit;
const updaterCommitVersion = packageJson.hqbaseRelease?.updaterCommitVersion;
if (Boolean(configuredUpdaterCommit) !== Boolean(updaterCommitVersion)) {
  throw new Error("Release updater override needs both a commit and a version.");
}
if (configuredUpdaterCommit && updaterCommitVersion !== version) {
  throw new Error("Release updater override is not approved for this version.");
}
const updaterCommit = configuredUpdaterCommit ?? sourceCommit;
if (!/^[a-f0-9]{40}$/.test(updaterCommit)) {
  throw new Error("Release updater commit is invalid.");
}
let resolvedUpdaterCommit;
try {
  resolvedUpdaterCommit = execFileSync(
    "git",
    ["rev-parse", "--verify", `${updaterCommit}^{commit}`],
    {
      cwd: root,
      encoding: "utf8"
    }
  ).trim();
} catch {
  throw new Error("Release updater commit is not available in the checkout.");
}
if (resolvedUpdaterCommit !== updaterCommit) {
  throw new Error("Release updater commit must identify a commit.");
}
// Hash the committed source that the URL serves, never uncommitted working-tree bytes.
const updaterBytes = execFileSync(
  "git",
  ["show", `${updaterCommit}:scripts/release/bootstrap.mjs`],
  { cwd: root }
);
const manifest = {
  format: "hqbase-release-v1",
  product,
  channel: "stable",
  version,
  schemaVersion,
  minVersion,
  publishedAt: new Date().toISOString(),
  notes,
  notesUrl: `https://github.com/HQBase/hqbase/releases/tag/v${version}`,
  artifact: {
    url: `https://github.com/HQBase/hqbase/releases/download/v${version}/hqbase-${version}.tar.gz`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: statSync(artifactFile).size
  },
  updater: {
    protocol: 2,
    sourceUrl: `https://raw.githubusercontent.com/HQBase/hqbase/${updaterCommit}/scripts/release/bootstrap.mjs`,
    sha256: createHash("sha256").update(updaterBytes).digest("hex"),
    size: updaterBytes.length
  },
  keyId: "hqbase-release-2026-01"
};
const payload = Buffer.from(JSON.stringify(manifest)).toString("base64url");
const signature = sign(
  null,
  Buffer.from(payload, "base64url"),
  createPrivateKey(privateKeyValue)
).toString("base64url");
const envelope = `${JSON.stringify({ payload, signature })}\n`;
writeFileSync(resolve(output, `manifest-${version}.json`), envelope);
writeFileSync(resolve(output, "stable.json"), envelope);
writeFileSync(
  resolve(output, `hqbase-${version}.sha256`),
  `${manifest.artifact.sha256}  hqbase-${version}.tar.gz\n`
);

console.log(
  JSON.stringify({
    product,
    version,
    artifactFile,
    manifestFile: resolve(output, `manifest-${version}.json`),
    stableManifestFile: resolve(output, "stable.json")
  })
);
