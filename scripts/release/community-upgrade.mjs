export const communityUpgradeCompatibility = Object.freeze({
  sourceSchemaVersions: Object.freeze([5]),
  targetSchemaVersion: 11
});

export function assertCommunityUpgradeCompatibility(schemaVersion) {
  if (
    communityUpgradeCompatibility.targetSchemaVersion !== schemaVersion ||
    communityUpgradeCompatibility.sourceSchemaVersions.some(
      (version) => !Number.isInteger(version) || version <= 0
    )
  ) {
    throw new Error("Community upgrade schema compatibility is invalid.");
  }
  return communityUpgradeCompatibility;
}
