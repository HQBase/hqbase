export type UpgradeState =
  | "created"
  | "purchase_verified"
  | "cloudflare_authorized"
  | "target_verified"
  | "backup_complete"
  | "resources_prepared"
  | "candidate_uploaded"
  | "migration_started"
  | "migration_complete"
  | "candidate_verified"
  | "promoted"
  | "complete"
  | "failed"
  | "recovery_required";

export type UpgradeStatus = {
  id: string;
  state: UpgradeState;
  legacyConfirmationRequired: boolean;
  errorCode: string | null;
  recoveryAction: string | null;
  updatedAt: string;
  completedAt: string | null;
};
