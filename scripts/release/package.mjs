#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "../..");
const product = "hqbase";
const schemaVersion = 2;
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = process.env.HQBASE_RELEASE_VERSION ?? packageJson.version;
const minVersion = process.env.HQBASE_MIN_VERSION || packageJson.hqbaseRelease?.minimumVersion;
const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const privateKeyValue = process.env.HQBASE_RELEASE_PRIVATE_KEY_FILE
  ? readFileSync(process.env.HQBASE_RELEASE_PRIVATE_KEY_FILE, "utf8")
  : process.env.HQBASE_RELEASE_PRIVATE_KEY;

if (!privateKeyValue) throw new Error("HQBASE_RELEASE_PRIVATE_KEY is required.");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error("Release version must be semantic.");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(minVersion ?? ""))
  throw new Error("Minimum release version must be semantic.");
if (!changelog.includes(`## ${version}\n`))
  throw new Error(`CHANGELOG.md is missing release notes for ${version}.`);

const output = resolve(root, "release");
mkdirSync(output, { recursive: true });
const tarFile = resolve(output, `${product}-${version}.tar`);
const artifactFile = `${tarFile}.gz`;
execFileSync("git", ["archive", "--format=tar", "--output", tarFile, "HEAD"], { cwd: root });
writeFileSync(artifactFile, gzipSync(readFileSync(tarFile), { level: 9 }));
rmSync(tarFile);

const bytes = readFileSync(artifactFile);
const manifest = {
  format: "hqbase-release-v1",
  product,
  channel: "stable",
  version,
  schemaVersion,
  minVersion,
  publishedAt: new Date().toISOString(),
  notesUrl: `https://github.com/HQBase/hqbase/releases/tag/v${version}`,
  artifact: {
    url: `https://github.com/HQBase/hqbase/releases/download/v${version}/hqbase-${version}.tar.gz`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: statSync(artifactFile).size
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
