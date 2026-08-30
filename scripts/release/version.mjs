const stableVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export function assertStableReleaseVersion(value, label = "Release version") {
  if (!stableVersionPattern.test(value)) {
    throw new Error(`${label} must be a stable semantic version.`);
  }
  return value;
}
