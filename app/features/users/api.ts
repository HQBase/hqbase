import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { WorkspaceRole, WorkspaceUser } from "./types";

export async function listUsers(): Promise<WorkspaceUser[]> {
  return apiGet<WorkspaceUser[]>("/api/users");
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: WorkspaceRole;
}): Promise<WorkspaceUser> {
  return apiPost<WorkspaceUser>("/api/users", input);
}

export async function updateUserRole(id: string, role: WorkspaceRole): Promise<void> {
  await apiPatch(`/api/users/${id}`, { role });
}
