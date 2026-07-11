export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  banned: boolean;
  createdAt: string;
};
