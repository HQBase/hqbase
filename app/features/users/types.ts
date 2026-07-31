export type WorkspaceRole = "owner" | "admin" | "member";
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

export type CreateWorkspaceUserInput = {
  name: string;
  email: string;
  role: WorkspaceRole;
  method: UserOnboardingMethod;
};

export type CreateWorkspaceUserResult = {
  user: WorkspaceUser;
  temporaryPassword?: string;
};
