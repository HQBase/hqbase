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
      format: "hqbase-backup-v2",
      deployment: "staging",
      createdAt: new Date().toISOString(),
      release: {
        schema_product: "hqbase",
        product: "hqbase",
        installed_version: "1.3.4",
        installed_schema_version: 3,
        channel: "stable"
      },
      d1: { bookmark: "bk-123" },
      worker: { version: "ver-456" }
    };
    expect(validateBackupManifest(valid, "staging")).toBe(valid);
    expect(() => validateBackupManifest(valid, "production")).toThrow("different deployment");
    expect(() => validateBackupManifest({}, "staging")).toThrow("invalid");
  });
});

describe("recovery verification", () => {
  it("rejects split Worker deployments", () => {
    expect(() =>
      parseWorkerVersion(
        JSON.stringify({
          versions: [
            { version_id: "a", percentage: 50 },
            { version_id: "b", percentage: 50 }
          ]
        })
      )
    ).toThrow("one Worker version");
  });
  it("rejects a checkpoint for a replaced database or an expired date", () => {
    const manifest = {
      accountId: "account",
      d1: { id: "new-db", name: "mail" },
      worker: { name: "mail" },
      r2: { bucket: "mail" }
    };
    const checkpoint = {
      format: "hqbase-backup-v2",
      deployment: "staging",
      createdAt: new Date().toISOString(),
      accountId: "account",
      d1: { id: "old-db", name: "mail", bookmark: "bookmark" },
      worker: { name: "mail", version: "worker" },
      r2: { bucket: "mail" }
    };
    expect(() => validateBackupManifest(checkpoint, "staging", manifest)).toThrow(
      "resource identities"
    );
    expect(() =>
      validateBackupManifest({ ...checkpoint, createdAt: "2020-01-01" }, "staging", manifest)
    ).toThrow("Time Travel window");
  });
});
