import type { WorkspaceRole } from "@/features/users/types";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: WorkspaceRole;
};
