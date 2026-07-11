import type { WorkspaceRole } from "../../lib/validation";

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  banned: boolean;
  createdAt: string;
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole | null;
  banned: number | null;
  createdAt: string;
};
