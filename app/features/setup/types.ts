export type SetupStatus = {
  isComplete: boolean;
  primaryDomain: string | null;
  portalHostname: string | null;
  domains: Array<{ id: string; name: string; isEnabled: boolean }>;
  userCount: number;
  mailboxCount: number;
  checklistAcknowledged: boolean;
};

export type BootstrapSetupInput = {
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  primaryDomain: string;
  portalHostname: string;
  emailDomains: Array<{ name: string; zoneId: string; accountId: string | null }>;
  checklistAcknowledged: boolean;
  defaultFromMailboxAddress: string;
  mailboxes: Array<{
    address: string;
    displayName: string;
  }>;
};

export type CloudflareZone = {
  id: string;
  name: string;
  status: string;
  type: string | null;
  accountId: string | null;
  accountName: string | null;
};

export type CloudflareAccessStatus = {
  id: string;
  status: string;
  active: boolean;
};

export type CloudflareDomainStatus = {
  zone: CloudflareZone;
  workerName: string;
  routing: {
    enabled: boolean;
    status: string | null;
    dnsReady: boolean;
    missingRecords: number;
    error: string | null;
  };
  catchAll: {
    enabled: boolean;
    configuredForWorker: boolean;
    workerNames: string[];
    error: string | null;
  };
  sending: {
    enabled: boolean;
    subdomains: string[];
    error: string | null;
  };
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
