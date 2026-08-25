import { apiDelete, apiGetPage, apiPatch, apiPost } from "@/lib/api-client";

import type { Draft, DraftAttachment, DraftInput } from "./types";

export async function listDrafts(): Promise<Draft[]> {
  const drafts: Draft[] = [];
  let nextPageUrl: string | null = "/api/v2/drafts?limit=100";
  while (nextPageUrl) {
    const page: { data: Draft[]; nextPageUrl: string | null } =
      await apiGetPage<Draft[]>(nextPageUrl);
    drafts.push(...page.data);
    nextPageUrl = page.nextPageUrl;
  }
  return drafts;
}

export const createDraft = (input: DraftInput) => apiPost<Draft>("/api/v2/drafts", input);

export const updateDraft = (id: string, input: DraftInput) =>
  apiPatch<Draft>(`/api/v2/drafts/${id}`, input);

export const deleteDraft = (id: string) => apiDelete(`/api/v2/drafts/${id}`);

export const deleteDraftAttachment = (draftId: string, id: string) =>
  apiDelete(`/api/v2/drafts/${draftId}/attachments/${id}`);

export async function uploadDraftAttachment(
  draftId: string,
  file: File,
  inline = false
): Promise<DraftAttachment> {
  const form = new FormData();
  form.set("file", file);
  if (inline) form.set("inline", "true");
  const response = await fetch(`/api/v2/drafts/${draftId}/attachments`, {
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
