import { describe, expect, it } from "vitest";
import { createManifest } from "../../../scripts/hqbase-pro/install.mjs";

describe("Pro installation resource reuse", () => {
  it("can adopt Community D1 and R2 resources for an in-place cutover", () => {
    const manifest = createManifest("qa-upgrade", {
      workerName: "hqbase-qa-upgrade",
      d1Name: "hqbase-qa-upgrade",
      reuseD1Id: "00000000-0000-4000-8000-000000000001",
      reuseR2Bucket: "hqbase-qa-upgrade-mail"
    });

    expect(manifest.d1).toEqual({
      name: "hqbase-qa-upgrade",
      id: "00000000-0000-4000-8000-000000000001",
      created: true,
      reused: true
    });
    expect(manifest.r2).toEqual({
      bucket: "hqbase-qa-upgrade-mail",
      created: true,
      reused: true
    });
  });
});
