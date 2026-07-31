import type { WorkspaceRole } from "../../lib/validation";

export type UserOnboardingMethod = "email_invite" | "temporary_password";

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  banned: boolean;
  createdAt: string;
  onboardingMethod: UserOnboardingMethod | null;
  passwordSetupRequired: boolean;
  invitationSentAt: string | null;
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole | null;
  banned: number | null;
  createdAt: string;
  onboarding_method: UserOnboardingMethod | null;
  onboarding_status: "pending" | "complete" | null;
  invitation_sent_at: string | null;
};
