import { apiGet, apiPost } from "@/lib/api-client";
import type { UpdateStatus } from "./types";

export function getUpdateStatus(): Promise<UpdateStatus> {
  return apiGet<UpdateStatus>("/api/updates");
}

export function applyUpdate(apiToken: string): Promise<{ buildId: string; status: string }> {
  return apiPost("/api/updates/apply", { apiToken });
}
