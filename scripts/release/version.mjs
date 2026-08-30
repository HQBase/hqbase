const stableVersionPattern = /^\d+\.\d+\.\d+$/;

export function assertStableReleaseVersion(value, label = "Release version") {
  if (!stableVersionPattern.test(value)) {
    throw new Error(`${label} must be a stable semantic version.`);
  }
  return value;
}
