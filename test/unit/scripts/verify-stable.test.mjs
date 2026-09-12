import { describe, expect, it } from "vitest";
import { assertPublishedStable } from "../../../scripts/release/verify-stable.mjs";

const manifest = {
  version: "1.4.0",
  sourceCommit: "a".repeat(40),
  artifact: { sha256: "b".repeat(64) }
};
const input = {
  version: "1.4.0",
  latest: { tag_name: "v1.4.0", draft: false, prerelease: false },
  manifest,
  candidate: manifest,
  report: {
    version: "1.4.0",
    sourceCommit: manifest.sourceCommit,
    artifactSha256: manifest.artifact.sha256
  },
  deploy: manifest.sourceCommit
};

describe("Stable announcement recovery", () => {
  it("accepts the exact reviewed and published Stable", () => {
    expect(() => assertPublishedStable(input)).not.toThrow();
  });
  it.each([
    { ...input.latest, draft: true },
    { ...input.latest, prerelease: true },
    { ...input.latest, tag_name: "v1.4.1" }
  ])("rejects unpublished candidates and a changed Latest", (latest) => {
    expect(() => assertPublishedStable({ ...input, latest })).toThrow("Latest Stable");
  });
  it.each([
    { deploy: "c".repeat(40) },
    { candidate: { ...manifest, sourceCommit: "c".repeat(40) } },
    { report: { ...input.report, artifactSha256: "c".repeat(64) } },
    { report: { ...input.report, sourceCommit: "c".repeat(40) } },
    { report: { ...input.report, version: "1.4.1" } }
  ])("rejects archive, evidence, and deploy mismatches", (change) => {
    expect(() => assertPublishedStable({ ...input, ...change })).toThrow("tested archive");
  });
});
