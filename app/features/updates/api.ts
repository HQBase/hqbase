import { apiGet, apiPost } from "@/lib/api-client";
import type { UpdateStatus } from "./types";

export function getUpdateStatus(): Promise<UpdateStatus> {
  return apiGet<UpdateStatus>("/api/updates");
}

export function getUpdateChannel(): Promise<{ channel: UpdateStatus["channel"] }> {
  return apiGet("/api/updates/channel");
}

export function setUpdateChannel(
  channel: UpdateStatus["channel"]
): Promise<{ channel: UpdateStatus["channel"] }> {
  return apiPost("/api/updates/channel", { channel });
}

export function applyUpdate(expectedVersion: string): Promise<{ buildId: string; status: string }> {
  return apiPost("/api/updates/apply", { expectedVersion });
}
