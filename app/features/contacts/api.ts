import { apiDelete, apiGet, apiPut } from "@/lib/api-client";
import type { ContactDetailResponse, ContactSummary } from "./types";

export function listContacts(search = "", limit?: number): Promise<ContactSummary[]> {
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  if (limit !== undefined) query.set("limit", String(limit));
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiGet<ContactSummary[]>(`/api/contacts${suffix}`);
}

export function getContact(id: string): Promise<ContactDetailResponse> {
  return apiGet<ContactDetailResponse>(`/api/contacts/${encodeURIComponent(id)}`);
}

export function saveContact(
  id: string,
  input: { email: string; name: string | null; notes: string }
): Promise<ContactDetailResponse> {
  return apiPut<ContactDetailResponse>(`/api/contacts/${encodeURIComponent(id)}`, input);
}

export function removeContact(id: string): Promise<void> {
  return apiDelete(`/api/contacts/${encodeURIComponent(id)}`);
}
