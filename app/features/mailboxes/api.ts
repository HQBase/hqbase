import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { Mailbox } from "./types";

export async function listMailboxes(): Promise<Mailbox[]> {
  return apiGet<Mailbox[]>("/api/mailboxes");
}

export async function createMailbox(input: {
  address: string;
  displayName: string;
}): Promise<Mailbox> {
  return apiPost<Mailbox>("/api/mailboxes", input);
}

export async function updateMailbox(
  id: string,
  input: { displayName?: string; isActive?: boolean }
): Promise<Mailbox> {
  return apiPatch<Mailbox>(`/api/mailboxes/${id}`, input);
}
