export type AgentProfile = "mailbox" | "provisioner";
export type AgentMailboxAccess = "read" | "agent";

export type ManagedAgent = {
  id: string;
  name: string;
  profile: AgentProfile;
  isActive: boolean;
  accessLevel?: AgentMailboxAccess;
  mailbox?: {
    id: string;
    address: string;
    displayName: string;
  };
  mailDomain?: {
    id: string;
    domain: string;
  };
  mailboxLimit?: number;
  mailboxCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentInput =
  | {
      profile: "mailbox";
      name: string;
      accessLevel: AgentMailboxAccess;
      mailbox: { id: string } | { address: string; displayName: string };
    }
  | {
      profile: "provisioner";
      name: string;
      mailDomainId: string;
      mailboxLimit: number;
    };

export type AgentMutationResult = {
  agent: ManagedAgent;
  credential?: string;
};

export type AgentCredentialResult = {
  agent: ManagedAgent;
  credential: string;
};
