export type ReleaseManifest = {
  format: "hqbase-release-v1";
  product: "hqbase";
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
  product: "hqbase";
  installedVersion: string;
  installedSchemaVersion: number;
  channel: "stable";
  checkedAt: string;
  available: boolean;
  compatible: boolean;
  release: ReleaseManifest;
};
