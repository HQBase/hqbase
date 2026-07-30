import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";

import type { Draft, DraftAttachment, DraftInput } from "./types";

export const listDrafts = () => apiGet<Draft[]>("/api/drafts");

export const createDraft = (input: DraftInput) => apiPost<Draft>("/api/drafts", input);

export const updateDraft = (id: string, input: DraftInput) =>
  apiPatch<Draft>(`/api/drafts/${id}`, input);

export const deleteDraft = (id: string) => apiDelete(`/api/drafts/${id}`);

export const deleteDraftAttachment = (draftId: string, id: string) =>
  apiDelete(`/api/drafts/${draftId}/attachments/${id}`);

export async function uploadDraftAttachment(draftId: string, file: File): Promise<DraftAttachment> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch(`/api/drafts/${draftId}/attachments`, {
    method: "POST",
    body: form,
    credentials: "include"
  });
  const body = (await response.json().catch(() => null)) as
    | DraftAttachment
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new Error(
      body && "error" in body ? (body.error?.message ?? "Upload failed.") : "Upload failed."
    );
  }
  return body as DraftAttachment;
}
