import { apiDelete, apiGet, apiPut } from "@/lib/api-client";
import type { MailboxAccessLevel, MailboxGrant } from "./types";

export function listMailboxGrants(): Promise<MailboxGrant[]> {
  return apiGet("/api/mailbox-grants");
}

export function setMailboxGrant(input: {
  mailboxId: string;
  userId: string;
  accessLevel: MailboxAccessLevel;
}): Promise<void> {
  return apiPut("/api/mailbox-grants", input);
}

export function revokeMailboxGrant(mailboxId: string, userId: string): Promise<void> {
  return apiDelete(`/api/mailbox-grants/${mailboxId}/${userId}`);
}
