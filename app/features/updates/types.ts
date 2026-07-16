export type UpdateStatus = {
  edition: "community" | "pro";
  installedVersion: string;
  installedSchemaVersion: number;
  channel: "stable";
  checkedAt: string;
  latestIsNewer: boolean;
  available: boolean;
  compatible: boolean;
  release: {
    version: string;
    schemaVersion: number;
    publishedAt: string;
    notesUrl: string;
  };
};
