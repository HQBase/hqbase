export const entitlementStates = [
  "unlicensed",
  "active",
  "canceling",
  "past_due",
  "grace",
  "inactive"
] as const;

export type EntitlementState = (typeof entitlementStates)[number];

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
