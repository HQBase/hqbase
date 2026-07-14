#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "../..");
const edition = "community";
const schemaVersion = 3;
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = process.env.HQBASE_RELEASE_VERSION ?? packageJson.version;
const minVersion = process.env.HQBASE_MIN_VERSION || packageJson.hqbaseRelease?.minimumVersion;
const privateKeyValue = process.env.HQBASE_RELEASE_PRIVATE_KEY_FILE
  ? readFileSync(process.env.HQBASE_RELEASE_PRIVATE_KEY_FILE, "utf8")
  : process.env.HQBASE_RELEASE_PRIVATE_KEY;
if (!privateKeyValue) throw new Error("HQBASE_RELEASE_PRIVATE_KEY is required.");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error("Release version must be semantic.");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(minVersion ?? ""))
  throw new Error("Minimum release version must be semantic.");

const output = resolve(root, "release");
mkdirSync(output, { recursive: true });
const tarFile = resolve(output, `${edition}-${version}.tar`);
const artifactFile = `${tarFile}.gz`;
execFileSync("git", ["archive", "--format=tar", "--output", tarFile, "HEAD"], { cwd: root });
writeFileSync(artifactFile, gzipSync(readFileSync(tarFile), { level: 9 }));
rmSync(tarFile);
const bytes = readFileSync(artifactFile);
const manifest = {
  format: "hqbase-release-v1",
  edition,
  channel: "stable",
  version,
  schemaVersion,
  minVersion,
  publishedAt: new Date().toISOString(),
  notesUrl: `https://github.com/HQBase/hqbase/releases/tag/v${version}`,
  artifact: {
    url: `https://billing.hqbase.io/v1/releases/${edition}/${version}/artifact`,
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
writeFileSync(resolve(output, "stable.json"), `${JSON.stringify({ payload, signature })}\n`);
console.log(
  JSON.stringify({ edition, version, artifactFile, manifestFile: resolve(output, "stable.json") })
);
