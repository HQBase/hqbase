export type Mailbox = {
  id: string;
  address: string;
  addresses: MailboxAddress[];
  displayName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MailboxAddress = {
  id: string;
  mailboxId: string;
  mailDomainId: string;
  address: string;
  displayName: string;
  receiveEnabled: boolean;
  sendEnabled: boolean;
  isPrimary: boolean;
};

export type MailboxAddressRow = {
  id: string;
  mailbox_id: string;
  mail_domain_id: string;
  address: string;
  display_name: string;
  receive_enabled: number;
  send_enabled: number;
  is_primary: number;
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

export type CreateMailboxAddressInput = {
  address: string;
  displayName: string;
  receiveEnabled?: boolean | undefined;
  sendEnabled?: boolean | undefined;
};
