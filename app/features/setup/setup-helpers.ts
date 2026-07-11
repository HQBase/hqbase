import type { MailboxDraft, MailboxErrors } from "./setup-validation";
import type { CloudflareConfigureResult } from "./types";

export function buildAppHostname(subdomain: string, domain: string): string {
  const normalized = subdomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  return normalized ? `${normalized}.${domain}` : domain;
}

export function buildDomainAddress(localPart: string, domain: string): string {
  const normalizedLocalPart = localPart.trim().toLowerCase();
  const normalizedDomain = domain.trim().toLowerCase();
  return normalizedLocalPart && normalizedDomain
    ? `${normalizedLocalPart}@${normalizedDomain}`
    : "";
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

export function retargetMailboxes(
  mailboxes: MailboxDraft[],
  previousDomain: string,
  domain: string
): MailboxDraft[] {
  return mailboxes.map((mailbox, index) => {
    const local = index === 0 ? "support" : index === 1 ? "privacy" : "";
    const addressForDomain = local ? `${local}@${domain}` : mailbox.address;
    const shouldReplace =
      !mailbox.address ||
      (previousDomain.length > 0 && mailbox.address.endsWith(`@${previousDomain}`));
    return shouldReplace ? { ...mailbox, address: addressForDomain } : mailbox;
  });
}

export function emptyMailboxErrors(count: number): MailboxErrors {
  return { rows: Array.from({ length: count }, () => ({})) };
}
