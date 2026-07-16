export type ReleaseManifest = {
  format: "hqbase-release-v1";
  edition: "community" | "pro";
  channel: "stable";
  version: string;
  schemaVersion: number;
  minVersion: string;
  publishedAt: string;
  notesUrl: string;
  artifact: { url: string; sha256: string; size: number };
  keyId: string;
};

export type UpdateStatus = {
  edition: "community" | "pro";
  installedVersion: string;
  installedSchemaVersion: number;
  channel: "stable";
  checkedAt: string;
  latestIsNewer: boolean;
  available: boolean;
  compatible: boolean;
  release: ReleaseManifest;
};
