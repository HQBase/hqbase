import { apiGet, apiPost } from "@/lib/api-client";
import type { ProUpgradePlacement, UpgradeStatus } from "./types";

export function startProUpgrade(
  placement: ProUpgradePlacement
): Promise<{ checkoutUrl: string; upgradeId: string }> {
  return apiPost("/api/upgrades/pro/purchase", { placement });
}

export function startProUpgradeOAuth(): Promise<{ authorizeUrl: string }> {
  return apiPost("/api/upgrades/pro/oauth");
}

export function getProUpgradeStatus(): Promise<UpgradeStatus> {
  return apiGet("/api/upgrades/pro/status");
}

export function advanceProUpgrade(): Promise<UpgradeStatus> {
  return apiPost("/api/upgrades/pro/advance");
}

export function completeProUpgrade(): Promise<{ state: string }> {
  return apiPost("/api/upgrades/pro/complete");
}
