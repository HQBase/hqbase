export type Mailbox = {
  id: string;
  address: string;
  mailDomainId: string;
  displayName: string;
  kind: "human" | "agent";
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MailboxRow = {
  id: string;
  address: string;
  mail_domain_id: string;
  display_name: string;
  kind: "human" | "agent";
  is_active: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateMailboxInput = {
  address: string;
  displayName: string;
};

export type UpdateMailboxInput = {
  displayName?: string | undefined;
  isActive?: boolean | undefined;
};
