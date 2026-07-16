import { apiGet, apiPost } from "@/lib/api-client";
import type { UpgradeStatus } from "./types";

export function startProUpgrade(): Promise<{ checkoutUrl: string; upgradeId: string }> {
  return apiPost("/api/upgrades/pro/purchase");
}

export function getProUpgradeStatus(): Promise<UpgradeStatus> {
  return apiGet("/api/upgrades/pro/status");
}

export function advanceProUpgrade(): Promise<UpgradeStatus> {
  return apiPost("/api/upgrades/pro/advance");
}

export function confirmLegacyProUpgrade(): Promise<UpgradeStatus> {
  return apiPost("/api/upgrades/pro/confirm-legacy", { confirm: true });
}

export function completeProUpgrade(): Promise<{ state: string }> {
  return apiPost("/api/upgrades/pro/complete");
}
