export type Mailbox = {
  id: string;
  address: string;
  addresses: Array<{
    id: string;
    mailboxId: string;
    mailDomainId: string;
    address: string;
    displayName: string;
    receiveEnabled: boolean;
    sendEnabled: boolean;
    isPrimary: boolean;
  }>;
  displayName: string;
  isActive: boolean;
  accessLevel: "read" | "agent" | "manager" | null;
  createdAt: string;
  updatedAt: string;
};
