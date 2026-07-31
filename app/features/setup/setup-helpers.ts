import type { MailboxDraft, MailboxErrors } from "./setup-validation";
import type { CloudflareConfigureResult } from "./types";

export function buildAppHostname(subdomain: string, domain: string): string {
  const normalized = subdomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  return normalized ? `${normalized}.${domain}` : domain;
}

export function inferWorkerName(): string {
  const hostname = window.location.hostname;
  if (hostname.endsWith(".workers.dev")) {
    return hostname.split(".")[0] || "hqbase";
  }
  return "hqbase";
}

export function connectionFingerprint(input: {
  appHostname: string;
  workerName: string;
  zoneId: string;
}): string {
  return [input.zoneId, input.workerName.trim(), input.appHostname].join("|");
}

export function customDomainSucceeded(result: CloudflareConfigureResult): boolean {
  return result.steps.find((step) => step.id === "custom-domain")?.status === "success";
}

const DEFAULT_MAILBOXES = [
  { displayName: "Support", localPart: "support" },
  { displayName: "Privacy", localPart: "privacy" }
] as const;

export function defaultMailboxesForDomains(domains: string[]): MailboxDraft[] {
  return normalizedDomains(domains).flatMap((domain) =>
    DEFAULT_MAILBOXES.map(({ displayName, localPart }) => ({
      address: `${localPart}@${domain}`,
      displayName
    }))
  );
}

export function syncMailboxesForDomains(
  mailboxes: MailboxDraft[],
  previousDomains: string[],
  domains: string[]
): MailboxDraft[] {
  const previous = normalizedDomains(previousDomains);
  const next = normalizedDomains(domains);
  const removed = previous.filter((domain) => !next.includes(domain));
  const added = next.filter((domain) => !previous.includes(domain));
  const preserved = mailboxes.filter(
    (mailbox) => !removed.some((domain) => isUntouchedDefaultMailbox(mailbox, domain))
  );
  const addresses = new Set(preserved.map((mailbox) => mailbox.address.trim().toLowerCase()));

  for (const mailbox of defaultMailboxesForDomains(added)) {
    if (addresses.has(mailbox.address)) continue;
    preserved.push(mailbox);
    addresses.add(mailbox.address);
  }

  return preserved;
}

export function emptyMailboxErrors(count: number): MailboxErrors {
  return { rows: Array.from({ length: count }, () => ({})) };
}

function normalizedDomains(domains: string[]): string[] {
  return [...new Set(domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))];
}

function isUntouchedDefaultMailbox(mailbox: MailboxDraft, domain: string): boolean {
  const address = mailbox.address.trim().toLowerCase();
  const displayName = mailbox.displayName.trim();
  return DEFAULT_MAILBOXES.some(
    ({ displayName: expectedName, localPart }) =>
      address === `${localPart}@${domain}` && displayName === expectedName
  );
}
