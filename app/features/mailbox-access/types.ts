export type MailboxAccessLevel = "read" | "agent" | "manager";

export type MailboxGrant = {
  mailboxId: string;
  userId: string;
  accessLevel: MailboxAccessLevel;
  createdAt: string;
  updatedAt: string;
};
