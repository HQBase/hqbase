import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertStableReleaseVersion } from "../../../scripts/release/version.mjs";

const packageSource = readFileSync(
  new URL("../../../scripts/release/package.mjs", import.meta.url),
  "utf8"
);
const workflowSource = readFileSync(
  new URL("../../../.github/workflows/release.yml", import.meta.url),
  "utf8"
);

describe("stable release version", () => {
  it("accepts stable versions and rejects prerelease suffixes", () => {
    expect(assertStableReleaseVersion("1.3.0")).toBe("1.3.0");
    expect(() => assertStableReleaseVersion("1.3.0-rc.1")).toThrow(
      "must be a stable semantic version"
    );
    expect(() => assertStableReleaseVersion("1.3.0-beta")).toThrow(
      "must be a stable semantic version"
    );
  });

  it("guards both release entry points", () => {
    expect(packageSource).toContain("assertStableReleaseVersion(version)");
    expect(workflowSource).toContain(
      'assertStableReleaseVersion(packageJson.version, "package.json version")'
    );
  });
});
