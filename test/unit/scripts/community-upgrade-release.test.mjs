import { describe, expect, it } from "vitest";

import {
  assertCommunityUpgradeCompatibility,
  communityUpgradeCompatibility
} from "../../../scripts/release/community-upgrade.mjs";

describe("signed Community upgrade compatibility", () => {
  it("publishes the Pro-owned supported source and target schemas", () => {
    expect(assertCommunityUpgradeCompatibility(11)).toEqual({
      sourceSchemaVersions: [5],
      targetSchemaVersion: 11
    });
    expect(communityUpgradeCompatibility.sourceSchemaVersions).toEqual([5]);
  });

  it("rejects a release package whose target schema drifts", () => {
    expect(() => assertCommunityUpgradeCompatibility(12)).toThrow("compatibility");
  });
});
