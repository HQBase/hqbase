import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import type { Signature, SignatureCandidates, SignatureInput, SignatureScopeTarget } from "./types";

export function listManagedSignatures(): Promise<Signature[]> {
  return apiGet<Signature[]>("/api/signatures");
}

export function listUsableSignatures(from: string): Promise<SignatureCandidates> {
  return apiGet<SignatureCandidates>(`/api/v2/signatures?from=${encodeURIComponent(from)}`);
}

export function createSignature(input: SignatureInput): Promise<Signature> {
  return apiPost<Signature>("/api/signatures", input);
}

export function updateSignature(
  id: string,
  input: { name: string; html: string; isDefault: boolean }
): Promise<Signature> {
  return apiPatch<Signature>(`/api/signatures/${id}`, input);
}

export function deleteSignature(id: string): Promise<void> {
  return apiDelete(`/api/signatures/${id}`);
}

export function signatureScopeValue(scope: SignatureScopeTarget): string {
  return `${scope.type}:${scope.id}`;
}

export function parseSignatureScope(value: string): SignatureScopeTarget {
  const separator = value.indexOf(":");
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if ((type !== "user" && type !== "mailbox" && type !== "domain") || !id) {
    throw new Error("Choose a signature scope.");
  }
  return { type, id };
}
