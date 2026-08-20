import { apiGet, apiPost } from "@/lib/api-client";

export async function getRecentAuthentication(): Promise<boolean> {
  const result = await apiGet<{ recent: boolean }>("/api/sessions/recent-authentication");
  return result.recent;
}

export async function reauthenticate(password: string): Promise<void> {
  await apiPost("/api/sessions/reauthenticate", { password });
}
