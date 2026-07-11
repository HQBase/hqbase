import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import type { AppPassword, CreatedAppPassword } from "./types";

export function listAppPasswords(): Promise<AppPassword[]> {
  return apiGet("/api/pro/app-passwords");
}

export function createAppPassword(name: string): Promise<CreatedAppPassword> {
  return apiPost("/api/pro/app-passwords", { name });
}

export function revokeAppPassword(id: string): Promise<void> {
  return apiDelete(`/api/pro/app-passwords/${id}`);
}
