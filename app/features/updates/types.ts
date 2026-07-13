export type UpdateStatus = {
  edition: "community" | "pro";
  installedVersion: string;
  installedSchemaVersion: number;
  channel: "stable";
  checkedAt: string;
  available: boolean;
  compatible: boolean;
  release: {
    version: string;
    schemaVersion: number;
    publishedAt: string;
    notesUrl: string;
  };
};
