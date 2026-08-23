export type Mailbox = {
  id: string;
  address: string;
  mailDomainId: string;
  displayName: string;
  kind: "human" | "agent";
  isActive: boolean;
  deletedAt: string | null;
  accessLevel: "read" | "agent" | "manager" | null;
  createdAt: string;
  updatedAt: string;
};
