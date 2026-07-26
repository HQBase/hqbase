import { describe, expect, it } from "vitest";

import { parseTimeTravelBookmark, parseWorkerVersion } from "../../../scripts/hqbase/backup.mjs";
import { validateBackupManifest } from "../../../scripts/hqbase/restore.mjs";

describe("operator recovery manifests", () => {
  it("extracts D1 bookmarks and Worker versions from nested Wrangler JSON", () => {
    expect(parseTimeTravelBookmark(JSON.stringify({ result: { bookmark: "bk-123" } }))).toBe(
      "bk-123"
    );
    expect(
      parseWorkerVersion(
        JSON.stringify({ id: "deployment-ignored", versions: [{ version_id: "ver-456" }] })
      )
    ).toBe("ver-456");
  });

  it("rejects malformed and cross-deployment restores", () => {
    const valid = {
      format: "hqbase-backup-v1",
      deployment: "staging",
      d1: { bookmark: "bk-123" },
      worker: { version: "ver-456" }
    };
    expect(validateBackupManifest(valid, "staging")).toBe(valid);
    expect(() => validateBackupManifest(valid, "production")).toThrow("different deployment");
    expect(() => validateBackupManifest({}, "staging")).toThrow("invalid");
  });
});
