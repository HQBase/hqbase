import type { MessageSummary } from "@/features/messages/types";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";

export type DraftAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};
export type Draft = {
  id: string;
  mailboxId: string | null;
  replyToMessageId: string | null;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html: string;
  version: number;
  updatedAt: string;
  attachments: DraftAttachment[];
};
export type DraftInput = Omit<Draft, "id" | "version" | "updatedAt" | "attachments"> & {
  id?: string;
  version?: number;
};

export const listDrafts = () => apiGet<Draft[]>("/api/pro/drafts");
export const createDraft = (input: DraftInput) => apiPost<Draft>("/api/pro/drafts", input);
export const updateDraft = (id: string, input: DraftInput) =>
  apiPatch<Draft>(`/api/pro/drafts/${id}`, input);
export const deleteDraft = (id: string) => apiDelete(`/api/pro/drafts/${id}`);
export const deleteDraftAttachment = (draftId: string, id: string) =>
  apiDelete(`/api/pro/drafts/${draftId}/attachments/${id}`);
export async function uploadDraftAttachment(draftId: string, file: File): Promise<DraftAttachment> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch(`/api/pro/drafts/${draftId}/attachments`, {
    method: "POST",
    body: form,
    credentials: "include"
  });
  const body = (await response.json().catch(() => null)) as
    | DraftAttachment
    | { error?: { message?: string } }
    | null;
  if (!response.ok)
    throw new Error(
      body && "error" in body ? (body.error?.message ?? "Upload failed.") : "Upload failed."
    );
  return body as DraftAttachment;
}

export async function sendMessage(input: {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html?: string;
  attachmentIds?: string[];
  draftId?: string;
}): Promise<MessageSummary> {
  return apiPost<MessageSummary>("/api/send", input);
}

export async function replyToMessage(input: {
  messageId: string;
  from: string;
  text: string;
  html?: string;
  attachmentIds?: string[];
  draftId?: string;
}): Promise<MessageSummary> {
  return apiPost<MessageSummary>("/api/reply", input);
}
