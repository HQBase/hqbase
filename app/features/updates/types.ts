export type UpdateStatus = {
  product: "hqbase";
  installedVersion: string;
  installedSchemaVersion: number;
  channel: "stable" | "nightly";
  waitingForStable?: boolean;
  checkedAt: string;
  available: boolean;
  compatible: boolean;
  repairRequired: boolean;
  release: {
    version: string;
    schemaVersion: number;
    publishedAt: string;
    notes: string[];
    notesUrl: string;
  };
};
