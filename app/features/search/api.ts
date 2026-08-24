import type { WorkspaceSearchResults } from "./types";

export async function searchWorkspace(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<WorkspaceSearchResults> {
  const search = new URLSearchParams({ q: query.trim() });
  if (options.limit !== undefined) search.set("limit", String(options.limit));
  const response = await fetch(`/api/search?${search.toString()}`, {
    credentials: "include",
    method: "GET",
    ...(options.signal ? { signal: options.signal } : {})
  });
  const body = (await response.json().catch(() => null)) as
    | WorkspaceSearchResults
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    const message = body && "error" in body ? body.error?.message : undefined;
    throw new Error(message ?? "Search is unavailable.");
  }
  return body as WorkspaceSearchResults;
}
