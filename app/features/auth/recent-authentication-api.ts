import { apiGet, apiPost } from "@/lib/api-client";

export async function getRecentAuthentication(signal?: AbortSignal): Promise<boolean> {
  const result = await apiGet<{ recent: boolean }>(
    "/api/sessions/recent-authentication",
    signal ? { signal } : undefined
  );
  return result.recent;
}

export async function reauthenticate(password: string): Promise<void> {
  await apiPost("/api/sessions/reauthenticate", { password });
}
