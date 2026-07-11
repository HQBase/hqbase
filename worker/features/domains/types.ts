export type DomainStatus = "pending" | "ready" | "degraded" | "disabled";
export type CatchAllPolicy = "reject" | "mailbox" | "unassigned";

export type MailDomain = {
  id: string;
  name: string;
  zoneId: string | null;
  accountId: string | null;
  receivingStatus: DomainStatus;
  sendingStatus: DomainStatus;
  dnsStatus: Exclude<DomainStatus, "disabled">;
  catchAllPolicy: CatchAllPolicy;
  catchAllMailboxId: string | null;
  isEnabled: boolean;
  lastErrorCode: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MailDomainRow = {
  id: string;
  name: string;
  zone_id: string | null;
  account_id: string | null;
  receiving_status: DomainStatus;
  sending_status: DomainStatus;
  dns_status: Exclude<DomainStatus, "disabled">;
  catch_all_policy: CatchAllPolicy;
  catch_all_mailbox_id: string | null;
  is_enabled: number;
  last_error_code: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};
