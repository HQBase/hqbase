export type UpgradeLifecycle = {
  sourceEdition: "community";
  state: "migrated" | "deployed" | "cutover_verified";
  checkpointBookmark: string;
  backupR2Key: string;
  sourceWorkerName: string | null;
  targetWorkerName: string;
  startedAt: string;
  migratedAt: string;
  deployedAt: string | null;
  cutoverVerifiedAt: string | null;
  updatedAt: string;
};
