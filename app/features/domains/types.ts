export type MailDomain = {
  id: string;
  name: string;
  zoneId: string | null;
  accountId: string | null;
  receivingStatus: "pending" | "ready" | "degraded" | "disabled";
  sendingStatus: "pending" | "ready" | "degraded" | "disabled";
  dnsStatus: "pending" | "ready" | "degraded";
  catchAllPolicy: "reject" | "unassigned" | "mailbox";
  catchAllMailboxId: string | null;
  isEnabled: boolean;
  updatedAt: string;
};
