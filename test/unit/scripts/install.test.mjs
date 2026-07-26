import { describe, expect, it } from "vitest";
import { createManifest } from "../../../scripts/hqbase/install.mjs";

describe("HQBase installation resources", () => {
  it("creates a fresh, unowned manifest before provisioning", () => {
    const manifest = createManifest("qa", {});

    expect(manifest.d1).toEqual({
      name: "hqbase-qa",
      id: "00000000-0000-0000-0000-000000000000",
      created: false,
      reused: false
    });
    expect(manifest.r2).toEqual({
      bucket: "hqbase-qa-mail",
      created: false,
      reused: false
    });
    expect(manifest.worker.name).toBe("hqbase-qa");
    expect(manifest.queue.name).toBe("hqbase-qa-jobs");
  });
});
