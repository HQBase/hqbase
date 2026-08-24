import { apiGet, apiPost } from "@/lib/api-client";
import type { MailFolderId } from "@/lib/routes";
import type { ConversationAction, ConversationPage, MessageDetail, MessageHtml } from "./types";

export type MessageListParams = {
  cursor?: string | undefined;
  folder?: string | undefined;
  labelId?: string | undefined;
  mailboxId?: string | undefined;
  search?: string | undefined;
};

export async function listConversations(
  params: MessageListParams & { folder: MailFolderId }
): Promise<ConversationPage> {
  const query = new URLSearchParams({ folder: params.folder });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.mailboxId) query.set("mailboxId", params.mailboxId);
  if (params.labelId) query.set("labelId", params.labelId);
  if (params.search) query.set("search", params.search);
  return apiGet<ConversationPage>(`/api/v2/conversations?${query.toString()}`);
}

export async function getMessageThread(id: string): Promise<MessageDetail[]> {
  return apiGet<MessageDetail[]>(`/api/v2/messages/${id}/thread`);
}

export async function getMessageHtml(id: string, loadRemoteImages = false): Promise<MessageHtml> {
  const suffix = loadRemoteImages ? "?loadRemoteImages=1" : "";
  return apiGet<MessageHtml>(`/api/v2/messages/${id}/html${suffix}`);
}

export async function trustRemoteMediaSender(id: string): Promise<void> {
  await apiPost(`/api/v2/messages/${id}/remote-media/trust`);
}

export async function runConversationAction(
  id: string,
  action: ConversationAction,
  folder: MailFolderId
): Promise<{ affected: number; threadId: string }> {
  return apiPost(`/api/v2/conversations/${id}/${action}`, { folder });
}
