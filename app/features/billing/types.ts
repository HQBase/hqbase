export type EntitlementState =
  | "unlicensed"
  | "active"
  | "canceling"
  | "past_due"
  | "grace"
  | "inactive";

export type EntitlementStatus = {
  installationId: string;
  state: EntitlementState;
  canConfigure: boolean;
  displayKey: string | null;
  currentPeriodEnd: string | null;
  checkedAt: string | null;
  graceEndsAt: string | null;
  lastError: string | null;
};
