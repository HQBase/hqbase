export type Mailbox = {
  id: string;
  address: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MailboxRow = {
  id: string;
  address: string;
  display_name: string;
  is_active: number;
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
