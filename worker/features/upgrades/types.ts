export const upgradeStates = [
  "created",
  "purchase_verified",
  "cloudflare_authorized",
  "target_verified",
  "backup_complete",
  "resources_prepared",
  "migration_started",
  "migration_complete",
  "candidate_uploaded",
  "candidate_verified",
  "promoted",
  "complete",
  "failed",
  "recovery_required"
] as const;

export type UpgradeState = (typeof upgradeStates)[number];

export type UpgradeRecord = {
  id: string;
  installationId: string;
  workerName: string;
  workspaceOrigin: string;
  state: UpgradeState;
  legacyRecovery: boolean;
  legacyConfirmedAt: string | null;
  accountId: string | null;
  activeVersionId: string | null;
  candidateVersionId: string | null;
  previewAlias: string | null;
  d1DatabaseId: string | null;
  r2BucketName: string | null;
  checkpointBookmark: string | null;
  backupR2Key: string | null;
  errorCode: string | null;
  recoveryAction: string | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type UpgradeInventory = {
  accountId: string;
  workerName: string;
  installationId: string | null;
  activeVersionId: string;
  bindings: Array<Record<string, unknown> & { name: string; type: string }>;
  secretNames: string[];
  d1DatabaseId: string;
  d1DatabaseName: string;
  r2BucketName: string;
  compatibilityDate: string | null;
  compatibilityFlags: string[];
  routes: Array<{ id: string; pattern: string }>;
  customDomains: string[];
  assets: Record<string, unknown> | null;
  subdomain: { enabled: boolean; previews_enabled: boolean } | null;
  accountSubdomain: string;
};
