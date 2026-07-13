import type { Mailbox } from "../mailboxes/types";

export type SetupStatus = {
  isComplete: boolean;
  primaryDomain: string | null;
  userCount: number;
  mailboxCount: number;
  checklistAcknowledged: boolean;
};

export type BootstrapResult = {
  owner: {
    id: string;
    email: string;
    name: string;
  };
  mailboxes: Mailbox[];
  setup: SetupStatus;
};

export type CloudflareZone = {
  id: string;
  name: string;
  status: string;
  type: string | null;
  accountId: string | null;
  accountName: string | null;
};

export type CloudflareTokenStatus = {
  id: string;
  status: string;
  active: boolean;
};

export type CloudflareRoutingStatus = {
  enabled: boolean;
  status: string | null;
  dnsReady: boolean;
  missingRecords: number;
  error: string | null;
};

export type CloudflareCatchAllStatus = {
  enabled: boolean;
  configuredForWorker: boolean;
  workerNames: string[];
  error: string | null;
};

export type CloudflareSendingStatus = {
  enabled: boolean;
  subdomains: string[];
  error: string | null;
};

export type CloudflareDomainStatus = {
  zone: CloudflareZone;
  workerName: string;
  routing: CloudflareRoutingStatus;
  catchAll: CloudflareCatchAllStatus;
  sending: CloudflareSendingStatus;
  ready: boolean;
};

export type CloudflareConfigureResult = {
  steps: Array<{
    id: string;
    label: string;
    status: "success" | "skipped" | "failed";
    message: string;
  }>;
  status: CloudflareDomainStatus;
};
