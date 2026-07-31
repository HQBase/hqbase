import {
  createManagedUser,
  requestPasswordSetupEmail,
  setManagedUserPassword
} from "../../auth/user-actions";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";
import { assertLoginEmailOutsideWorkspace } from "../../security/login-email";

import { clearInvitationSentAt, createUserOnboarding, findWorkspaceUser } from "./queries";
import type { UserOnboardingMethod, WorkspaceUser } from "./types";

type CreateWorkspaceUserInput = {
  name: string;
  email: string;
  role: WorkspaceRole;
  method: UserOnboardingMethod;
};

export type CreateWorkspaceUserResult = {
  user: WorkspaceUser;
  temporaryPassword?: string;
};

export async function createWorkspaceUser(
  env: WorkerEnv,
  request: Request,
  actorId: string,
  input: CreateWorkspaceUserInput
): Promise<CreateWorkspaceUserResult> {
  await assertLoginEmailOutsideWorkspace(env.DB, input.email);
  const temporaryPassword =
    input.method === "temporary_password" ? generateTemporaryPassword() : undefined;
  const user = await createManagedUser(env, request, {
    email: input.email,
    name: input.name,
    role: input.role,
    ...(temporaryPassword ? { password: temporaryPassword } : {})
  });
  await createUserOnboarding(env.DB, {
    userId: user.id,
    method: input.method,
    createdBy: actorId
  });

  if (input.method === "email_invite") {
    await deliverInvitation(env, request, user.id, user.email);
  }

  const workspaceUser = await findWorkspaceUser(env.DB, user.id);
  if (!workspaceUser) {
    throw new AppError("USER_NOT_FOUND", "Created user could not be loaded.", 500);
  }
  return {
    user: workspaceUser,
    ...(temporaryPassword ? { temporaryPassword } : {})
  };
}

export async function resendWorkspaceInvitation(
  env: WorkerEnv,
  request: Request,
  userId: string
): Promise<WorkspaceUser> {
  const user = await findWorkspaceUser(env.DB, userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (user.onboardingMethod !== "email_invite" || !user.passwordSetupRequired) {
    throw new AppError(
      "INVITATION_NOT_PENDING",
      "Only pending email invitations can be resent.",
      409
    );
  }

  await clearInvitationSentAt(env.DB, user.id);
  await deliverInvitation(env, request, user.id, user.email);
  const updated = await findWorkspaceUser(env.DB, user.id);
  if (!updated) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  return updated;
}

export async function regenerateTemporaryPassword(
  env: WorkerEnv,
  request: Request,
  userId: string
): Promise<{ user: WorkspaceUser; temporaryPassword: string }> {
  const user = await findWorkspaceUser(env.DB, userId);
  if (!user) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (user.onboardingMethod !== "temporary_password" || !user.passwordSetupRequired) {
    throw new AppError(
      "TEMPORARY_PASSWORD_NOT_PENDING",
      "A temporary password can only be regenerated before password setup is complete.",
      409
    );
  }
  const temporaryPassword = generateTemporaryPassword();
  await setManagedUserPassword(env, request, user.id, temporaryPassword);
  return { user, temporaryPassword };
}

async function deliverInvitation(
  env: WorkerEnv,
  request: Request,
  userId: string,
  email: string
): Promise<void> {
  await requestPasswordSetupEmail(env, request, email);
  const delivered = await findWorkspaceUser(env.DB, userId);
  if (!delivered?.invitationSentAt) {
    throw new AppError(
      "INVITATION_DELIVERY_FAILED",
      "The user was created, but HQBase could not send the invitation. Try resending it.",
      502
    );
  }
}

export function generateTemporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const random = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `Hq!${random}`;
}
