import { apiGet, apiPost } from "@/lib/api-client";
import type { MailFolderId } from "@/lib/routes";
import type {
  ConversationAction,
  ConversationPage,
  MessageDetail,
  MessageHtml,
  MessageSummary
} from "./types";

export type MessageListParams = {
  cursor?: string | undefined;
  folder?: string | undefined;
  mailboxId?: string | undefined;
  search?: string | undefined;
};

export async function listMessages(params: MessageListParams): Promise<MessageSummary[]> {
  const query = new URLSearchParams();
  if (params.folder) query.set("folder", params.folder);
  if (params.mailboxId) query.set("mailboxId", params.mailboxId);
  if (params.search) query.set("search", params.search);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiGet<MessageSummary[]>(`/api/messages${suffix}`);
}

export async function listConversations(
  params: MessageListParams & { folder: MailFolderId }
): Promise<ConversationPage> {
  const query = new URLSearchParams({ folder: params.folder });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.mailboxId) query.set("mailboxId", params.mailboxId);
  if (params.search) query.set("search", params.search);
  return apiGet<ConversationPage>(`/api/conversations?${query.toString()}`);
}

export async function getMessage(id: string): Promise<MessageDetail> {
  return apiGet<MessageDetail>(`/api/messages/${id}`);
}

export async function getMessageThread(id: string): Promise<MessageDetail[]> {
  return apiGet<MessageDetail[]>(`/api/messages/${id}/thread`);
}

export async function getMessageHtml(id: string, loadRemoteImages = false): Promise<MessageHtml> {
  const suffix = loadRemoteImages ? "?loadRemoteImages=1" : "";
  return apiGet<MessageHtml>(`/api/messages/${id}/html${suffix}`);
}

export async function trustRemoteMediaSender(id: string): Promise<void> {
  await apiPost(`/api/messages/${id}/remote-media/trust`);
}

export async function runMessageAction(
  id: string,
  action: "read" | "unread" | "star" | "unstar" | "archive" | "trash"
): Promise<MessageSummary> {
  return apiPost<MessageSummary>(`/api/messages/${id}/${action}`);
}

export async function runConversationAction(
  id: string,
  action: ConversationAction,
  folder: MailFolderId
): Promise<{ affected: number; threadId: string }> {
  return apiPost(`/api/conversations/${id}/${action}`, { folder });
}
