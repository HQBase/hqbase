import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api-client";
import type { LabelColor, LabelMutationResult, MailLabel } from "./types";

export function listLabels(): Promise<MailLabel[]> {
  return apiGet<MailLabel[]>("/api/labels");
}

export function createLabel(input: { color: LabelColor; name: string }): Promise<MailLabel> {
  return apiPost<MailLabel>("/api/labels", input);
}

export function updateLabel(
  id: string,
  input: { color: LabelColor; name: string }
): Promise<MailLabel> {
  return apiPatch<MailLabel>(`/api/labels/${id}`, input);
}

export function deleteLabel(id: string): Promise<void> {
  return apiDelete(`/api/labels/${id}`);
}

export function setConversationLabel(
  messageId: string,
  labelId: string,
  assigned: boolean
): Promise<LabelMutationResult> {
  const path = `/api/v2/conversations/${messageId}/labels/${labelId}`;
  return assigned ? apiPut<LabelMutationResult>(path, {}) : deleteConversationLabel(path);
}

async function deleteConversationLabel(path: string): Promise<LabelMutationResult> {
  const response = await fetch(path, { credentials: "include", method: "DELETE" });
  const body = (await response.json().catch(() => null)) as
    | LabelMutationResult
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new Error(
      body && "error" in body
        ? (body.error?.message ?? "Label could not be removed.")
        : "Label could not be removed."
    );
  }
  return body as LabelMutationResult;
}
