export type Mailbox = {
  id: string;
  address: string;
  mailDomainId: string;
  displayName: string;
  isActive: boolean;
  accessLevel: "read" | "agent" | "manager" | null;
  createdAt: string;
  updatedAt: string;
};
