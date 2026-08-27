import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type {
  CreateWorkspaceUserInput,
  CreateWorkspaceUserResult,
  WorkspaceRole,
  WorkspaceUser
} from "./types";

export async function listUsers(): Promise<WorkspaceUser[]> {
  return apiGet<WorkspaceUser[]>("/api/users");
}

export async function createUser(
  input: CreateWorkspaceUserInput
): Promise<CreateWorkspaceUserResult> {
  return apiPost<CreateWorkspaceUserResult>("/api/users", input);
}

export async function updateUserRole(id: string, role: WorkspaceRole): Promise<void> {
  await apiPatch(`/api/users/${id}`, { role });
}

export async function resendInvitation(id: string): Promise<WorkspaceUser> {
  return apiPost<WorkspaceUser>(`/api/users/${id}/resend-invitation`);
}

export async function regenerateTemporaryPassword(id: string): Promise<CreateWorkspaceUserResult> {
  return apiPost<CreateWorkspaceUserResult>(`/api/users/${id}/temporary-password`);
}

export async function removeUser(id: string): Promise<void> {
  await apiDelete(`/api/users/${id}`);
}

export async function restoreUser(id: string): Promise<void> {
  await apiPost(`/api/users/${id}/restore`);
}
