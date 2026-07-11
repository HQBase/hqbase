import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { Mailbox } from "./types";

export async function listMailboxes(): Promise<Mailbox[]> {
  return apiGet<Mailbox[]>("/api/mailboxes");
}
export async function addMailboxAddress(
  mailboxId: string,
  input: { address: string; displayName: string; receiveEnabled?: boolean; sendEnabled?: boolean }
): Promise<Mailbox> {
  return apiPost<Mailbox>(`/api/mailboxes/${mailboxId}/addresses`, input);
}
export async function removeMailboxAddress(mailboxId: string, addressId: string): Promise<void> {
  return apiDelete(`/api/mailboxes/${mailboxId}/addresses/${addressId}`);
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
