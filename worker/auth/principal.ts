import type { WorkspaceRole } from "../lib/validation";

import type { AuthContext } from "./session";

export type HumanPrincipal = {
  id: string;
  type: "user";
  name: string;
  email: string;
  role: WorkspaceRole;
};

export type AgentPrincipal = {
  id: string;
  type: "agent";
  name: string;
  role: null;
  profile: "mailbox" | "provisioner";
};

export type RequestPrincipal = HumanPrincipal | AgentPrincipal;

export function humanPrincipal(auth: AuthContext): HumanPrincipal {
  return {
    id: auth.user.id,
    type: "user",
    name: auth.user.name,
    email: auth.user.email,
    role: auth.user.role
  };
}
