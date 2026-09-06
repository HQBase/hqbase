import { queryRemoteD1 } from "./after-deploy-state.mjs";
import { compareVersions } from "./manifest.mjs";

export function assertDatabaseUpdate(manifest, installed) {
  if (
    !installed ||
    !Number.isInteger(installed.installed_schema_version) ||
    installed.installed_schema_version > manifest.schemaVersion ||
    compareVersions(installed.installed_version, manifest.version) > 0
  ) {
    throw new Error(
      "The release would downgrade the installed database, or its version is unknown."
    );
  }
}

export function assertRemoteDatabaseUpdate(source, manifest) {
  const [installed] = queryRemoteD1(
    source,
    "SELECT installed_version, installed_schema_version FROM release_state WHERE singleton = 1"
  );
  assertDatabaseUpdate(manifest, installed);
}
