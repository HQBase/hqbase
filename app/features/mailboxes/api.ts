import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { Mailbox } from "./types";

export async function listMailboxes(): Promise<Mailbox[]> {
  return apiGet<Mailbox[]>("/api/v2/mailboxes");
}

export async function listDeletedMailboxes(): Promise<Mailbox[]> {
  return apiGet<Mailbox[]>("/api/mailboxes/deleted");
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

export async function deleteMailbox(id: string): Promise<void> {
  await apiDelete(`/api/mailboxes/${id}`);
}

export async function restoreMailbox(id: string): Promise<Mailbox> {
  return apiPost<Mailbox>(`/api/mailboxes/${id}/restore`);
}
