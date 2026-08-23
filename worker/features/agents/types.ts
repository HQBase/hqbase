import type { MailboxAccessLevel } from "../../auth/mailbox-access";

export type AgentProfile = "mailbox" | "provisioner";
export type AgentCredentialResource = "mail" | "management";
export type MailboxAgentAccessLevel = Extract<MailboxAccessLevel, "read" | "agent">;

export type AgentMailbox = {
  id: string;
  address: string;
  displayName: string;
};

export type AgentMailDomain = {
  id: string;
  domain: string;
};

export type Agent = {
  id: string;
  name: string;
  profile: AgentProfile;
  isActive: boolean;
  accessLevel?: MailboxAgentAccessLevel;
  mailbox?: AgentMailbox;
  mailDomain?: AgentMailDomain;
  mailboxLimit?: number;
  mailboxCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateMailboxAgentInput = {
  profile: "mailbox";
  name: string;
  accessLevel: MailboxAgentAccessLevel;
  mailbox: { id: string } | { address: string; displayName: string };
};

export type CreateProvisionerInput = {
  profile: "provisioner";
  name: string;
  mailDomainId: string;
  mailboxLimit: number;
};

export type CreateAgentInput = CreateMailboxAgentInput | CreateProvisionerInput;

export type AgentCredential = {
  id: string;
  principalId: string;
  resource: AgentCredentialResource;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type AgentMutationResult = {
  agent: Agent;
  credential?: string;
};
